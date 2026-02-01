#!/bin/bash
# Start trading system - single model + API
# Includes process monitoring to restart if crashed

set -e

echo "=================================================="
echo "  Polymarket AI Trading System"
echo "=================================================="

# Create necessary directories
mkdir -p /app/data /app/logs

# Check if we should clear paper trading data
if [ "$CLEAR_PAPER_DATA" = "true" ]; then
    echo "Clearing paper trading data..."
    python3 /app/scripts/clear_paper_trades.py || true
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
python3 -u /app/agents/systematic_trader.py \
    --mode $MODE \
    --config /app/config/trader.yaml \
    --model trader \
    2>&1 &

TRADER_PID=$!
echo $TRADER_PID > /app/data/trader.pid
echo "Trader started with PID $TRADER_PID"

sleep 2

# Write marker file with mode
echo "$(date)" > /app/data/model_pids.txt
echo "trader=$TRADER_PID" >> /app/data/model_pids.txt
echo "mode=$MODE" >> /app/data/model_pids.txt

echo ""
echo "Starting Dashboard API..."
echo "=================================================="

# Start dashboard API in background
python3 /app/api/dashboard_api.py &
API_PID=$!
echo "Dashboard API started with PID $API_PID"

# Monitor loop - check every 60 seconds
while true; do
    sleep 60
    
    # Check if API is still running
    if ! kill -0 "$API_PID" 2>/dev/null; then
        echo "[$(date)] Dashboard API crashed, restarting..."
        python3 /app/api/dashboard_api.py &
        API_PID=$!
    fi
    
    # Check if trader is still running
    if ! kill -0 "$TRADER_PID" 2>/dev/null; then
        echo "[$(date)] Trader crashed, restarting..."
        python3 -u /app/agents/systematic_trader.py \
            --mode $MODE \
            --config /app/config/trader.yaml \
            --model trader \
            2>&1 &
        TRADER_PID=$!
        echo $TRADER_PID > /app/data/trader.pid
    fi
    
    # Update marker file
    echo "$(date)" > /app/data/model_pids.txt
    echo "trader=$TRADER_PID" >> /app/data/model_pids.txt
    echo "mode=$MODE" >> /app/data/model_pids.txt
done
