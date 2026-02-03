#!/bin/bash
# Docker Management Script

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
else
    echo "❌ docker compose not found. Install Docker Desktop first."
    exit 1
fi

case "$1" in
    start)
        echo "🐳 Starting Docker containers..."
        "${COMPOSE_CMD[@]}" up -d --build
        "${COMPOSE_CMD[@]}" ps
        echo ""
        echo "✅ All containers started!"
        echo "📊 Dashboard: http://localhost:8000"
        ;;
    
    stop)
        echo "🛑 Stopping Docker containers..."
        "${COMPOSE_CMD[@]}" down
        echo "✅ All containers stopped"
        ;;
    
    restart)
        echo "♻️  Restarting Docker containers..."
        "${COMPOSE_CMD[@]}" restart
        echo "✅ All containers restarted"
        "${COMPOSE_CMD[@]}" ps
        ;;
    
    logs)
        if [ -z "$2" ]; then
            echo "📋 Showing logs for all containers..."
            "${COMPOSE_CMD[@]}" logs -f
        else
            echo "📋 Showing logs for $2..."
            "${COMPOSE_CMD[@]}" logs -f "$2"
        fi
        ;;
    
    status)
        echo "📊 Container Status:"
        "${COMPOSE_CMD[@]}" ps
        echo ""
        echo "💻 Resource Usage:"
        docker stats --no-stream
        ;;
    
    clean)
        echo "🧹 Cleaning up..."
        "${COMPOSE_CMD[@]}" down -v
        docker system prune -f
        echo "✅ Cleanup complete"
        ;;
    
    rebuild)
        echo "🔨 Rebuilding containers..."
        "${COMPOSE_CMD[@]}" down
        "${COMPOSE_CMD[@]}" build --no-cache
        "${COMPOSE_CMD[@]}" up -d
        echo "✅ Rebuild complete"
        "${COMPOSE_CMD[@]}" ps
        ;;

    smoke)
        echo "🧪 Running smoke tests..."
        python3 scripts/smoke_test.py --api-url http://localhost:8000
        ;;
    
    *)
        echo "🐳 Docker Management Script"
        echo ""
        echo "Usage: $0 {start|stop|restart|logs|status|clean|rebuild|smoke}"
        echo ""
        echo "Commands:"
        echo "  start    - Build and start all containers"
        echo "  stop     - Stop all containers"
        echo "  restart  - Restart all containers"
        echo "  logs     - View logs (add container name for specific)"
        echo "  status   - Show container status and resources"
        echo "  clean    - Stop and remove all containers/volumes"
        echo "  rebuild  - Rebuild containers from scratch"
        echo "  smoke    - Run local smoke tests (DB + API health)"
        echo ""
        echo "Examples:"
        echo "  $0 start"
        echo "  $0 logs conservative"
        echo "  $0 status"
        ;;
esac
