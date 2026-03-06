# Live Dashboard for Streaming CSV Exports

A backend service that performs large CSV exports while providing real-time progress updates to a frontend dashboard via WebSockets. This project demonstrates asynchronous processing with bi-directional communication, WebSocket connection management, and a pub/sub pattern for progress tracking.

## Features

- **Asynchronous CSV Export**: Exports 100,000+ user records without blocking the main application
- **Real-time Progress Updates**: WebSocket-based live progress tracking with percentage, ETA, and processing speed
- **Redis Pub/Sub Architecture**: Decoupled worker and WebSocket server for independent scaling
- **PostgreSQL Database**: Robust data storage with automatic seeding
- **Health Checks**: Service health monitoring for all components
- **Heartbeat Mechanism**: WebSocket ping/pong to maintain connection stability
- **Export Cancellation**: Allow users to cancel in-progress exports
- **Responsive Frontend Dashboard**: Simple HTML/JS interface with real-time updates

## Architecture

The system consists of three main components:

1. **Web Server** (Express.js): Handles HTTP API requests and WebSocket connections
2. **Background Worker**: Processes export jobs and streams data to CSV files
3. **Message Bus** (Redis Pub/Sub): Decouples the worker from WebSocket server for scalability

## Technology Stack

- **Runtime**: Node.js
- **Web Framework**: Express.js
- **WebSocket**: ws library
- **Database**: PostgreSQL 13
- **Message Broker**: Redis 6
- **Containerization**: Docker & Docker Compose

## Prerequisites

- Docker and Docker Compose installed
- 2GB+ available RAM
- 1GB+ available disk space

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/KvPradeepthi/live-dashboard-csv-export.git
cd live-dashboard-csv-export
```

### 2. Start the Application

```bash
docker-compose up
```

The first startup will:
- Build the application Docker image
- Start PostgreSQL, Redis, and the application
- Automatically seed the database with 100,000 users
- Wait for all services to be healthy

This process may take 2-3 minutes on first run.

### 3. Access the Dashboard

Open your browser and navigate to:

```
http://localhost:8080
```

### 4. Start an Export

1. Click "Start New Export" button
2. Watch real-time progress updates
3. Download the CSV file when complete

## API Endpoints

### Health Check

```http
GET /health
```

Returns the health status of the application.

**Response (200 OK):**
```json
{
  "status": "healthy"
}
```

### Initiate Export

```http
POST /api/exports
```

Initiates a new CSV export job.

**Response (202 Accepted):**
```json
{
  "exportId": "uuid-string"
}
```

### List Recent Exports

```http
GET /api/exports
```

Returns the last 20 export jobs.

**Response (200 OK):**
```json
{
  "exports": [
    {
      "exportId": "uuid-string",
      "status": "completed",
      "createdAt": "2026-03-06T10:00:00.000Z",
      "completedAt": "2026-03-06T10:02:30.000Z"
    }
  ]
}
```

### Download Export

```http
GET /api/exports/{exportId}/download
```

Downloads the completed CSV file.

**Response (200 OK):**
- Content-Type: `text/csv`
- Content-Disposition: `attachment; filename="export-{exportId}.csv"`

## WebSocket Protocol

### Connection

```javascript
ws://localhost:8080/ws/exports/{exportId}
```

### Server Messages

#### Progress Update

```json
{
  "exportId": "uuid-string",
  "status": "processing",
  "progress": {
    "total": 100000,
    "processed": 45000,
    "percentage": 45,
    "etaSeconds": 30
  },
  "timestamp": "2026-03-06T10:00:30.000Z"
}
```

#### Completion

```json
{
  "exportId": "uuid-string",
  "status": "completed",
  "downloadUrl": "/api/exports/{exportId}/download",
  "fileSize": 5242880,
  "durationSeconds": 120
}
```

#### Error

```json
{
  "exportId": "uuid-string",
  "status": "failed",
  "error": "Database connection failed",
  "timestamp": "2026-03-06T10:00:30.000Z"
}
```

#### Cancellation

```json
{
  "exportId": "uuid-string",
  "status": "cancelled",
  "timestamp": "2026-03-06T10:00:30.000Z"
}
```

### Client Messages

#### Cancel Export

```json
{
  "action": "cancel"
}
```

## Project Structure

```
live-dashboard-csv-export/
├── docker-compose.yml      # Service orchestration
├── Dockerfile              # Application container image
├── package.json            # Node.js dependencies
├── .env.example            # Environment variables template
├── index.js                # Main application (API + WebSocket server)
├── seeds/
│   └── 01-init.sql         # Database initialization & seeding
└── public/
    └── index.html          # Frontend dashboard
```

## Environment Variables

See `.env.example` for all required environment variables:

- `PORT`: Application port (default: 8080)
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: Secret key for future authentication (optional)

## Database Schema

### users

| Column     | Type         | Constraints           |
|------------|--------------|----------------------|
| id         | SERIAL       | PRIMARY KEY          |
| name       | VARCHAR(255) | NOT NULL             |
| email      | VARCHAR(255) | NOT NULL, UNIQUE     |
| created_at | TIMESTAMP    | DEFAULT NOW()        |

### exports

| Column       | Type         | Constraints           |
|--------------|--------------|----------------------|
| id           | UUID         | PRIMARY KEY          |
| status       | VARCHAR(20)  | NOT NULL             |
| created_at   | TIMESTAMP    | NOT NULL             |
| completed_at | TIMESTAMP    | NULL                 |

## Development

### Running Locally

```bash
# Start services
docker-compose up

# View logs
docker-compose logs -f app

# Stop services
docker-compose down

# Rebuild after code changes
docker-compose up --build
```

### Accessing the Database

```bash
docker-compose exec db psql -U user -d mydatabase
```

### Accessing Redis CLI

```bash
docker-compose exec redis redis-cli
```

## Testing the WebSocket Connection

You can test the WebSocket connection using the browser console:

```javascript
const ws = new WebSocket('ws://localhost:8080/ws/exports/your-export-id');
ws.onmessage = (event) => console.log(JSON.parse(event.data));
ws.send(JSON.stringify({ action: 'cancel' }));
```

## Performance Considerations

- **Chunk Size**: The application processes data in 10,000-row chunks to balance memory usage and performance
- **Streaming**: CSV files are written using Node.js streams to avoid loading all data into memory
- **Progress Updates**: Published after each chunk (~every 2 seconds for 100k records)
- **Connection Pooling**: PostgreSQL connection pool for efficient database access

## Troubleshooting

### Services Not Starting

```bash
# Check service status
docker-compose ps

# View logs for a specific service
docker-compose logs db
docker-compose logs redis
docker-compose logs app
```

### Database Connection Issues

Ensure PostgreSQL is healthy before the app starts:

```bash
docker-compose exec db pg_isready -U user -d mydatabase
```

### WebSocket Connection Fails

- Check that the export ID is valid
- Verify the application is running on port 8080
- Check browser console for error messages

## Security Considerations

For production deployment:

- Implement authentication for WebSocket connections
- Use environment variables for all secrets (never commit .env files)
- Enable TLS/SSL for WebSocket connections (wss://)
- Implement rate limiting on API endpoints
- Add input validation and sanitization
- Set up proper CORS policies

## License

MIT

## Author

KvPradeepthi

## Acknowledgments

Built as part of the Partnr Network Global Placement Program to demonstrate real-time data processing and WebSocket communication patterns.
