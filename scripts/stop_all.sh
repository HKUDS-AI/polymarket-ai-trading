#!/bin/bash
# Stop All Services Script

set -e

echo "============================================================"
echo "🛑 STOPPING ALL SERVICES"
echo "============================================================"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Stop Docker stack if running.
if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
else
    COMPOSE_CMD=()
fi

if [ ${#COMPOSE_CMD[@]} -gt 0 ]; then
    if "${COMPOSE_CMD[@]}" ps --status running | tail -n +2 | grep -q .; then
        echo "Stopping Docker containers..."
        "${COMPOSE_CMD[@]}" down || true
    fi
fi

# Stop local Node trader / API if running.
echo "Stopping local Node processes (trader + API)..."
pkill -f "src/trader.mjs" 2>/dev/null || true
pkill -f "src/server.mjs" 2>/dev/null || true
pkill -f "scripts/start-all.mjs" 2>/dev/null || true

# Stop dashboard
if [ -f data/dashboard_pid.txt ]; then
    DASHBOARD_PID=$(cat data/dashboard_pid.txt)
    echo ""
    echo "Stopping dashboard (PID: $DASHBOARD_PID)..."
    
    if ps -p $DASHBOARD_PID > /dev/null; then
        kill $DASHBOARD_PID || true
        echo "✅ Dashboard stopped"
    else
        echo "⚠️  Dashboard not running"
    fi
    
    rm data/dashboard_pid.txt
else
    echo ""
    echo "⚠️  No dashboard PID file found"
    
    # Try to find and kill by port
    if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
        echo "Found dashboard on port 8000, stopping..."
        kill $(lsof -t -i:8000) 2>/dev/null || true
        echo "✅ Dashboard stopped"
    fi
fi

echo ""
echo "============================================================"
echo "✅ ALL SERVICES STOPPED"
echo "============================================================"
echo ""

