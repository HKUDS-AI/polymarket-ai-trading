#!/usr/bin/env python3
"""
Simple Dashboard API

Serves trade data and market info. KISS - minimal endpoints.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import sqlite3
import httpx
import json
from pathlib import Path
from datetime import datetime

app = FastAPI(title="Polymarket Trading API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent.parent
GAMMA_API = "https://gamma-api.polymarket.com"

# All databases to read from (current + legacy)
DB_NAMES = ['trader', 'conservative', 'moderate', 'aggressive']


def get_all_trades(limit: int = 200):
    """Get trades from all databases."""
    trades = []
    
    for name in DB_NAMES:
        db_path = BASE_DIR / 'data' / f'trades_{name}.db'
        if not db_path.exists():
            continue
        
        try:
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            cursor.execute("""
                SELECT market_question, side, entry_price, size_usd, timestamp, status, pnl, notes, exit_price
                FROM trades ORDER BY timestamp DESC LIMIT ?
            """, (limit,))
            
            for row in cursor.fetchall():
                trades.append({
                    'market': row[0] or 'Unknown',
                    'direction': row[1],
                    'entry_price': row[2],
                    'size': row[3],
                    'timestamp': row[4],
                    'status': row[5],
                    'pnl': row[6],
                    'notes': row[7],
                    'exit_price': row[8]
                })
            conn.close()
        except:
            continue
    
    # Sort by timestamp
    trades.sort(key=lambda x: x['timestamp'] or '', reverse=True)
    return trades[:limit]


def get_stats():
    """Get aggregate stats from all databases."""
    total = 0
    open_count = 0
    closed_count = 0
    total_pnl = 0.0
    last_trade = None
    
    for name in DB_NAMES:
        db_path = BASE_DIR / 'data' / f'trades_{name}.db'
        if not db_path.exists():
            continue
        
        try:
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) FROM trades")
            total += cursor.fetchone()[0] or 0
            
            cursor.execute("SELECT COUNT(*) FROM trades WHERE status = 'open'")
            open_count += cursor.fetchone()[0] or 0
            
            cursor.execute("SELECT COUNT(*) FROM trades WHERE status = 'closed'")
            closed_count += cursor.fetchone()[0] or 0
            
            cursor.execute("SELECT SUM(pnl) FROM trades WHERE pnl IS NOT NULL")
            total_pnl += cursor.fetchone()[0] or 0
            
            cursor.execute("SELECT timestamp FROM trades ORDER BY timestamp DESC LIMIT 1")
            row = cursor.fetchone()
            if row and (last_trade is None or row[0] > last_trade):
                last_trade = row[0]
            
            conn.close()
        except:
            continue
    
    return {
        'total_trades': total,
        'open_positions': open_count,
        'closed_trades': closed_count,
        'realized_pnl': total_pnl,
        'last_trade': last_trade
    }


def get_open_positions():
    """Get open positions with current prices."""
    positions = []
    
    for name in DB_NAMES:
        db_path = BASE_DIR / 'data' / f'trades_{name}.db'
        if not db_path.exists():
            continue
        
        try:
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            cursor.execute("""
                SELECT market_id, market_question, side, entry_price, size_usd
                FROM trades WHERE status = 'open'
            """)
            
            for row in cursor.fetchall():
                positions.append({
                    'market_id': row[0],
                    'question': row[1],
                    'side': row[2],
                    'entry': row[3],
                    'size': row[4]
                })
            conn.close()
        except:
            continue
    
    return positions


@app.get("/api/health")
async def health():
    """Health check with basic stats."""
    stats = get_stats()
    
    # Check if trader is running
    pids_file = BASE_DIR / 'data' / 'model_pids.txt'
    pids = pids_file.read_text() if pids_file.exists() else None
    
    return {
        'status': 'ok',
        'models_running': pids is not None,
        **stats,
        'pids': pids,
        'timestamp': datetime.now().isoformat()
    }


@app.post("/api/trigger-cycle")
async def trigger_cycle():
    """Manually trigger a trading cycle."""
    trigger_file = BASE_DIR / 'data' / 'trigger_cycle'
    trigger_file.touch()
    return {'status': 'triggered', 'message': 'Cycle will run within 1 second'}


@app.get("/api/trades")
async def trades(limit: int = 100):
    """Get recent trades."""
    return {'trades': get_all_trades(limit)}


@app.get("/api/signals/live")
async def signals_live(limit: int = 100):
    """Get trades (alias for compatibility)."""
    return {'signals': get_all_trades(limit)}


@app.get("/api/positions")
async def positions():
    """Get open positions with current P&L."""
    open_positions = get_open_positions()
    
    # Fetch current prices
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{GAMMA_API}/markets", params={"limit": 500, "active": "true", "closed": "false"})
            markets = resp.json()
    except:
        markets = []
    
    # Build price lookup
    prices = {}
    for m in markets:
        q = m.get('question', '')
        p = m.get('outcomePrices', '[]')
        if isinstance(p, str):
            p = json.loads(p)
        if p and len(p) >= 2:
            prices[q] = {'yes': float(p[0]), 'no': float(p[1])}
    
    # Calculate current P&L
    result = []
    for pos in open_positions:
        current = None
        pnl_pct = None
        
        if pos['question'] in prices:
            current = prices[pos['question']]['yes'] if pos['side'] == 'YES' else prices[pos['question']]['no']
            if pos['entry'] > 0:
                pnl_pct = ((current - pos['entry']) / pos['entry']) * 100
        
        result.append({
            **pos,
            'current': current,
            'pnl_pct': round(pnl_pct, 1) if pnl_pct is not None else None
        })
    
    return {'positions': result}


@app.get("/api/markets/live")
async def live_markets():
    """Get live markets from Polymarket."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{GAMMA_API}/markets", params={"limit": 50, "active": "true", "closed": "false"})
            markets = resp.json()
        
        # Filter and format
        result = []
        for m in markets[:20]:
            prices = m.get('outcomePrices', '[]')
            if isinstance(prices, str):
                prices = json.loads(prices)
            
            result.append({
                'id': m.get('id'),
                'question': m.get('question'),
                'yes_price': float(prices[0]) if prices else None,
                'no_price': float(prices[1]) if len(prices) > 1 else None,
                'volume': float(m.get('volume', 0) or 0),
                'volume_24hr': float(m.get('volume24hr', 0) or 0)
            })
        
        return {'markets': result, 'count': len(result)}
    except Exception as e:
        return {'error': str(e), 'markets': []}


@app.get("/")
async def root():
    """Serve dashboard or redirect."""
    return {"message": "API running. See /api/health for status."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
