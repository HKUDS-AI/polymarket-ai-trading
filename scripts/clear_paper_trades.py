#!/usr/bin/env python3
"""
Clear paper trading databases for fresh start with live trading.
Backs up existing data first.
"""

import sqlite3
import shutil
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / 'data'

# All database files to clear
DB_FILES = [
    'trades_trader.db',
    'trades_conservative.db', 
    'trades_moderate.db',
    'trades_aggressive.db'
]

def backup_and_clear():
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_dir = DATA_DIR / f'paper_backup_{timestamp}'
    
    print(f"Creating backup in {backup_dir}")
    backup_dir.mkdir(exist_ok=True)
    
    for db_name in DB_FILES:
        db_path = DATA_DIR / db_name
        if db_path.exists():
            # Backup
            backup_path = backup_dir / db_name
            shutil.copy(db_path, backup_path)
            print(f"  Backed up: {db_name}")
            
            # Clear (delete the file - it will be recreated fresh)
            db_path.unlink()
            print(f"  Cleared: {db_name}")
    
    print(f"\nDone! Paper trading data backed up to {backup_dir}")
    print("Databases will be recreated fresh on next trader start.")

if __name__ == "__main__":
    backup_and_clear()
