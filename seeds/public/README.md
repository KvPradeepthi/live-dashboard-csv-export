# Live Dashboard CSV Export with Real-Time Progress

A robust backend service that performs large CSV exports while providing real-time progress updates to connected clients via WebSockets. This project demonstrates asynchronous processing, pub/sub messaging patterns, and bi-directional communication.

## 🎯 Project Overview

This application simulates a common feature in SaaS platforms where users need to export large datasets. The system provides:

- **Real-time Progress Tracking**: WebSocket-based progress updates
- **Efficient Data Streaming**: Chunk-based CSV export to handle large datasets
- **Decoupled Architecture**: Redis Pub/Sub for message distribution
- **Containerized Deployment**: Docker Compose setup for all services
- **Modern UI**: Responsive frontend dashboard with real-time metrics

## 🏗️ Architecture

### Components

1. **Express.js API Server**: HTTP endpoints for export management
2. **WebSocket Server**: Real-time progress broadcasting
3. **Background Worker**: Processes exports asynchronously
4. **PostgreSQL**: Data storage and export job tracking
5. **Redis**: Pub/Sub messaging for decoupling

### Data Flow

```
Client (POST /api/exports)
    ↓
Express API (Creates job)
    ↓
PostgreSQL (Stores job record)
    ↓
Background Worker (Processes in chunks)
    ↓
Redis Pub/Sub (Publishes progress)
    ↓
WebSocket Server (Broadcasts to clients)
    ↓
Client Dashboard (Real-time updates)
```

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development)

### Installation & Running

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd live-dashboard-csv-export
   ```

2. **Start all services**
   ```bash
   docker-compose up
   ```

   This will:
   - Build the Node.js application
   - Start PostgreSQL with seeded data (100,000 users)
   - Start Redis for messaging
   - Make the app available at `http://localhost:8080`

3. **Access the Dashboard**
   Open your browser and navigate to `http://localhost:8080`

### Local Development (without Docker)

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

3. **Start the server**
   ```bash
   npm start
   # or with auto-reload
   npm run dev
   ```

## 📋 API Endpoints

### HTTP Endpoints

#### Initiate Export
```
POST /api/exports

Response (202 Accepted):
{
  "exportId": "uuid-string"
}
```

#### List Recent Exports
```
GET /api/exports

Response (200 OK):
{
  "exports": [
    {
      "exportId": "uuid",
      "status": "processing",
      "createdAt": "2024-01-01T00:00:00Z",
      "completedAt": null
    }
  ]
}
```

#### Download Export
```
GET /api/exports/{exportId}/download

Response (200 OK):
Content-Type: text/csv
Content-Disposition: attachment; filename="export-{exportId}.csv"
```

#### Health Check
```
GET /health

Response (200 OK):
{"status": "healthy"}
```

### WebSocket Endpoint

```
ws://localhost:8080/ws/exports/{exportId}
```

#### Progress Message
```json
{
  "exportId": "uuid",
  "status": "processing",
  "progress": {
    "total": 100000,
    "processed": 45000,
    "percentage": 45,
    "etaSeconds": 120
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

#### Completion Message
```json
{
  "exportId": "uuid",
  "status": "completed",
  "downloadUrl": "/api/exports/{exportId}/download",
  "fileSize": 5242880,
  "durationSeconds": 45
}
```

#### Error Message
```json
{
  "exportId": "uuid",
  "status": "failed",
  "error": "Database connection error",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

#### Cancellation Message
```json
{
  "exportId": "uuid",
  "status": "cancelled",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

#### Client to Server
```json
{"action": "cancel"}
```

## 🛠️ Project Structure

```
.
├── docker-compose.yml      # Orchestration of all services
├── Dockerfile              # Application container definition
├── package.json            # Node dependencies
├── index.js                # Main application server
├── .env.example            # Environment variables template
├── README.md               # This file
├── seeds/
│   └── 01-init.sql        # Database initialization script
└── public/
    └── index.html          # Frontend dashboard
```

## 🗄️ Database Schema

### Users Table
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```
Contains 100,000 sample records for export simulation.

### Exports Table
```sql
CREATE TABLE exports (
    id UUID PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP
);
```

## 🔄 Export Processing Workflow

1. **Request Phase**: Client initiates export via POST /api/exports
2. **Queue Phase**: Job record created in database with "queued" status
3. **Processing Phase**:
   - Background worker fetches data in 10,000-row chunks
   - CSV file written to disk
   - Progress published to Redis Pub/Sub
   - WebSocket broadcasts to connected clients
4. **Completion Phase**:
   - Final message with download URL sent
   - Job status updated to "completed"
5. **Download Phase**: Client can download CSV via /api/exports/{id}/download

## 🔧 Configuration

### Environment Variables

See `.env.example` for all available options:

- `PORT`: Server port (default: 8080)
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: For future authentication features

## 📊 Performance Characteristics

- **Chunk Size**: 10,000 rows per batch
- **Total Data**: 100,000 users (configurable)
- **CSV Size**: ~5-6 MB
- **Processing Time**: ~60-90 seconds (depends on system)
- **Progress Updates**: Every chunk (~0.5-2 seconds)
- **WebSocket Heartbeat**: 30-second intervals

## 🧪 Testing

### Manual Testing

1. **Start the application**
   ```bash
   docker-compose up
   ```

2. **Open dashboard**
   Navigate to http://localhost:8080

3. **Start an export**
   Click "Start CSV Export" button

4. **Monitor progress**
   Watch real-time progress bar and metrics

5. **Download CSV**
   Click download link when complete

### API Testing with curl

```bash
# Initiate export
curl -X POST http://localhost:8080/api/exports

# List exports
curl http://localhost:8080/api/exports

# Health check
curl http://localhost:8080/health
```

## 🔐 Security Considerations

- WebSocket connections are subject to same-origin policy
- File downloads use proper content headers
- Database uses parameterized queries to prevent SQL injection
- Consider adding authentication for production use
- Validate file paths to prevent directory traversal

## 🚀 Deployment

For production deployment:

1. Update database credentials in `docker-compose.yml`
2. Set strong JWT_SECRET in environment
3. Configure Redis persistence if needed
4. Use reverse proxy (nginx) for SSL/TLS
5. Enable CORS appropriately
6. Set up monitoring and logging
7. Configure automatic backups for PostgreSQL

## 📝 Key Features Implemented

✅ Docker Compose with health checks
✅ PostgreSQL with 100K user seeding
✅ Redis Pub/Sub for message distribution  
✅ WebSocket real-time updates
✅ Chunk-based streaming export
✅ Progress tracking (percentage, ETA, speed)
✅ Error handling and graceful degradation
✅ Export cancellation
✅ Download capability
✅ Responsive frontend dashboard
✅ Heartbeat mechanism for WebSocket
✅ Job status tracking in database

## 📚 Technologies Used

- **Runtime**: Node.js 18
- **Framework**: Express.js
- **WebSocket**: ws library
- **Database**: PostgreSQL 13
- **Cache/Messaging**: Redis 6
- **Containerization**: Docker & Docker Compose
- **Frontend**: Vanilla JavaScript, HTML5, CSS3

## 🤝 Contributing

Contributions are welcome! Please ensure:
- Code follows the existing style
- All endpoints are tested
- Documentation is updated
- Error handling is comprehensive

## 📄 License

MIT License - See LICENSE file for details

## 📞 Support

For issues or questions:
1. Check existing GitHub issues
2. Review the documentation
3. Create a detailed issue report

---

**Created for**: Partnr Network - Global Placement Program
**Project**: Live Dashboard for Streaming CSV Exports
**Difficulty**: Intermediate
