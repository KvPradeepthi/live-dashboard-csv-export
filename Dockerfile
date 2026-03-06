FROM node:18-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install node dependencies
RUN npm install

# Copy application code
COPY . .

# Create temp directory for CSV exports
RUN mkdir -p /app/exports

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
  CMD curl -f http://localhost:8080/health || exit 1

# Start application
CMD ["npm", "start"]
