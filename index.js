const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const { Pool } = require('pg');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { Transform } = require('stream');

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Redis client
const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});

redisClient.connect();

// Map to store WebSocket connections
const exportConnections = new Map();

// Map to store export jobs
const exportJobs = new Map();

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.status(200).json({ status: 'healthy' });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// POST /api/exports - Initiate new export
app.post('/api/exports', async (req, res) => {
  const exportId = uuidv4();
  const createdAt = new Date().toISOString();
  
  try {
    const client = await pool.connect();
    await client.query(
      'INSERT INTO exports (id, status, created_at) VALUES ($1, $2, $3)',
      [exportId, 'queued', createdAt]
    );
    client.release();
    
    exportJobs.set(exportId, { status: 'queued', createdAt });
    
    // Start export processing in background
    processExport(exportId);
    
    res.status(202).json({ exportId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/exports - List recent exports
app.get('/api/exports', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      'SELECT id as "exportId", status, created_at as "createdAt", completed_at as "completedAt" FROM exports ORDER BY created_at DESC LIMIT 20'
    );
    client.release();
    
    res.status(200).json({ exports: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/exports/:exportId/download
app.get('/api/exports/:exportId/download', async (req, res) => {
  const { exportId } = req.params;
  
  try {
    const filePath = path.join('/app/exports', `${exportId}.csv`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const stat = fs.statSync(filePath);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="export-${exportId}.csv"`,
      'Content-Length': stat.size,
    });
    
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const exportId = req.url.split('/').pop();
  
  if (!exportConnections.has(exportId)) {
    exportConnections.set(exportId, []);
  }
  
  exportConnections.get(exportId).push(ws);
  
  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      if (message.action === 'cancel') {
        cancelExport(exportId);
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });
  
  ws.on('close', () => {
    const connections = exportConnections.get(exportId);
    if (connections) {
      const idx = connections.indexOf(ws);
      if (idx > -1) connections.splice(idx, 1);
    }
  });
});

// Heartbeat interval
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Process export in background
async function processExport(exportId) {
  try {
    const client = await pool.connect();
    await client.query('UPDATE exports SET status = $1 WHERE id = $2', ['processing', exportId]);
    client.release();
    
    const totalCount = 100000;
    const chunkSize = 10000;
    const filePath = path.join('/app/exports', `${exportId}.csv`);
    const writeStream = fs.createWriteStream(filePath);
    
    writeStream.write('id,name,email,created_at\n');
    
    const startTime = Date.now();
    let processed = 0;
    
    for (let offset = 0; offset < totalCount; offset += chunkSize) {
      const dbClient = await pool.connect();
      const result = await dbClient.query(
        'SELECT id, name, email, created_at FROM users LIMIT $1 OFFSET $2',
        [chunkSize, offset]
      );
      dbClient.release();
      
      for (const row of result.rows) {
        writeStream.write(`${row.id},"${row.name}",${row.email},${row.created_at}\n`);
        processed++;
      }
      
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = processed / elapsed;
      const remaining = totalCount - processed;
      const eta = remaining / speed;
      const percentage = (processed / totalCount) * 100;
      
      const progress = {
        exportId,
        status: 'processing',
        progress: {
          total: totalCount,
          processed,
          percentage: Math.round(percentage),
          etaSeconds: Math.round(eta) || null,
        },
        timestamp: new Date().toISOString(),
      };
      
      await redisClient.publish(`export-progress:${exportId}`, JSON.stringify(progress));
    }
    
    writeStream.end();
    
    const stat = fs.statSync(filePath);
    const duration = (Date.now() - startTime) / 1000;
    
    const completionMessage = {
      exportId,
      status: 'completed',
      downloadUrl: `/api/exports/${exportId}/download`,
      fileSize: stat.size,
      durationSeconds: Math.round(duration),
    };
    
    await redisClient.publish(`export-progress:${exportId}`, JSON.stringify(completionMessage));
    
    const dbClient = await pool.connect();
    await dbClient.query('UPDATE exports SET status = $1, completed_at = $2 WHERE id = $3', 
      ['completed', new Date().toISOString(), exportId]);
    dbClient.release();
    
  } catch (err) {
    const errorMessage = {
      exportId,
      status: 'failed',
      error: err.message,
      timestamp: new Date().toISOString(),
    };
    
    await redisClient.publish(`export-progress:${exportId}`, JSON.stringify(errorMessage));
    
    const client = await pool.connect();
    await client.query('UPDATE exports SET status = $1 WHERE id = $2', ['failed', exportId]);
    client.release();
  }
}

// Cancel export
async function cancelExport(exportId) {
  const message = {
    exportId,
    status: 'cancelled',
    timestamp: new Date().toISOString(),
  };
  
  await redisClient.publish(`export-progress:${exportId}`, JSON.stringify(message));
  
  const client = await pool.connect();
  await client.query('UPDATE exports SET status = $1 WHERE id = $2', ['cancelled', exportId]);
  client.release();
}

// Redis subscription handler
const subscriber = redisClient.duplicate();
subscriber.connect();

subscriber.pSubscribe('export-progress:*', (message, channel) => {
  const exportId = channel.split(':')[1];
  const connections = exportConnections.get(exportId);
  
  if (connections) {
    connections.forEach(ws => {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    });
  }
});

// Start server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

process.on('SIGTERM', async () => {
  await redisClient.quit();
  await subscriber.quit();
  await pool.end();
  process.exit(0);
});
