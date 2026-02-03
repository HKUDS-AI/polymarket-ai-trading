#!/bin/bash
# Docker deployment script

set -e

echo "Building Docker image..."
docker build -t systematic-trader:latest .

echo "Stopping existing container..."
docker stop systematic-trader 2>/dev/null || true
docker rm systematic-trader 2>/dev/null || true

echo "Starting new container..."
docker run -d \
    --name systematic-trader \
    --restart unless-stopped \
    -v $(pwd)/data:/app/data \
    -v $(pwd)/logs:/app/logs \
    -v $(pwd)/config:/app/config \
    -e POLYGON_PRIVATE_KEY="${POLYGON_PRIVATE_KEY}" \
    systematic-trader:latest

echo "Container started. View logs with:"
echo "  docker logs -f systematic-trader"

