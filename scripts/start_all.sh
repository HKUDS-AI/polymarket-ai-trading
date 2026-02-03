#!/bin/bash
# Start trading system - single model + API
# Primary use: Render process supervisor entrypoint.

set -e

echo "=================================================="
echo "  Polymarket AI Trading System"
echo "=================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_APP_ROOT="$(dirname "$SCRIPT_DIR")"
APP_ROOT="${APP_ROOT:-/app}"
if [ ! -d "$APP_ROOT/agents" ]; then
    APP_ROOT="$DEFAULT_APP_ROOT"
fi

# Create necessary directories
mkdir -p "$APP_ROOT/data" "$APP_ROOT/logs"

# Check if we should clear paper trading data
if [ "$CLEAR_PAPER_DATA" = "true" ]; then
    echo "Clearing paper trading data..."
    python3 "$APP_ROOT/scripts/clear_paper_trades.py" || true
    echo ""
fi

# Determine trading mode
MODE="paper"
if [ "$LIVE_TRADING" = "true" ]; then
    MODE="live"
    echo "*** LIVE TRADING MODE ***"
else
    echo "Paper trading mode"
fi
echo ""

# Start the trading model (output to stdout for Render visibility)
echo "Starting trader in $MODE mode..."
python3 -u "$APP_ROOT/agents/systematic_trader.py" \
    --mode $MODE \
    --config "$APP_ROOT/config/trader.yaml" \
    --model trader \
    2>&1 &

TRADER_PID=$!
echo $TRADER_PID > "$APP_ROOT/data/trader.pid"
echo "Trader started with PID $TRADER_PID"

sleep 2

# Write marker file with mode
echo "$(date)" > "$APP_ROOT/data/model_pids.txt"
echo "trader=$TRADER_PID" >> "$APP_ROOT/data/model_pids.txt"
echo "mode=$MODE" >> "$APP_ROOT/data/model_pids.txt"

echo ""
echo "Starting Dashboard API..."
echo "=================================================="

# Start dashboard API in background
python3 "$APP_ROOT/api/dashboard_api.py" &
API_PID=$!
echo "Dashboard API started with PID $API_PID"

# Monitor loop - check every 60 seconds
while true; do
    sleep 60
    
    # Check if API is still running
    if ! kill -0 "$API_PID" 2>/dev/null; then
        echo "[$(date)] Dashboard API crashed, restarting..."
        python3 "$APP_ROOT/api/dashboard_api.py" &
        API_PID=$!
    fi
    
    # Check if trader is still running
    if ! kill -0 "$TRADER_PID" 2>/dev/null; then
        echo "[$(date)] Trader crashed, restarting..."
        python3 -u "$APP_ROOT/agents/systematic_trader.py" \
            --mode $MODE \
            --config "$APP_ROOT/config/trader.yaml" \
            --model trader \
            2>&1 &
        TRADER_PID=$!
        echo $TRADER_PID > "$APP_ROOT/data/trader.pid"
    fi
    
    # Update marker file
    echo "$(date)" > "$APP_ROOT/data/model_pids.txt"
    echo "trader=$TRADER_PID" >> "$APP_ROOT/data/model_pids.txt"
    echo "mode=$MODE" >> "$APP_ROOT/data/model_pids.txt"
done
