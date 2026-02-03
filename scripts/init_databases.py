#!/usr/bin/env python3
"""
Initialize databases for all models.
"""

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
MODELS = ['trader', 'conservative', 'moderate', 'aggressive']

SCHEMA = """
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    model TEXT NOT NULL,
    market_id TEXT NOT NULL,
    market_question TEXT,
    side TEXT NOT NULL,
    entry_price REAL NOT NULL,
    size_usd REAL NOT NULL,
    shares REAL NOT NULL,
    status TEXT DEFAULT 'open',
    exit_price REAL,
    exit_timestamp TEXT,
    pnl REAL,
    notes TEXT,
    token_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_timestamp ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_market_id ON trades(market_id);
"""

def init_database(model_name: str):
    """Initialize database for a model."""
    db_path = BASE_DIR / 'data' / f'trades_{model_name}.db'
    
    print(f"Initializing database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Execute schema
    cursor.executescript(SCHEMA)
    conn.commit()
    conn.close()
    
    print(f"✅ {model_name} database ready")

def main():
    """Initialize all databases."""
    print("="*60)
    print("DATABASE INITIALIZATION")
    print("="*60 + "\n")
    
    # Create data directory
    (BASE_DIR / 'data').mkdir(exist_ok=True)
    
    for model in MODELS:
        init_database(model)
    
    print(f"\n✅ All databases initialized!")
    print(f"\nLocations:")
    for model in MODELS:
        print(f"  data/trades_{model}.db")

if __name__ == '__main__':
    main()

