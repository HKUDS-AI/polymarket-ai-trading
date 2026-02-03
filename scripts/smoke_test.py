#!/usr/bin/env python3
"""
Minimal smoke test for local development.

Checks:
1) Config file readable
2) SQLite DB schema supports basic write/read lifecycle
3) API health endpoint is reachable (optional)
"""

import argparse
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

BASE_DIR = Path(__file__).parent.parent
TRADER_CONFIG = BASE_DIR / "config" / "trader.yaml"
SMOKE_DB = BASE_DIR / "data" / "smoke_test.db"


def check_config() -> None:
    if not TRADER_CONFIG.exists():
        raise RuntimeError(f"Missing config: {TRADER_CONFIG}")
    text = TRADER_CONFIG.read_text()
    match = re.search(r"^\s*db_path:\s*(.+)\s*$", text, flags=re.MULTILINE)
    db_path = match.group(1).strip() if match else None
    if not db_path:
        raise RuntimeError("config/trader.yaml missing data.db_path")
    print(f"OK config: db_path={db_path}")


def check_sqlite_roundtrip() -> None:
    SMOKE_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(SMOKE_DB))
    try:
        cur = conn.cursor()
        cur.execute(
            """
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
                notes TEXT
            )
            """
        )
        cur.execute(
            """
            INSERT INTO trades (timestamp, model, market_id, market_question, side, entry_price, size_usd, shares, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
            """,
            (datetime.now(timezone.utc).isoformat(), "smoke", "m1", "smoke market", "YES", 0.2, 10.0, 50.0, "smoke"),
        )
        row_id = cur.lastrowid
        cur.execute("SELECT status FROM trades WHERE id = ?", (row_id,))
        status = cur.fetchone()[0]
        if status != "open":
            raise RuntimeError("unexpected DB readback status")
        cur.execute("DELETE FROM trades WHERE id = ?", (row_id,))
        conn.commit()
    finally:
        conn.close()
    print(f"OK sqlite write/read: {SMOKE_DB}")


def check_api_health(api_url: str, required: bool) -> None:
    url = api_url.rstrip("/") + "/api/health"
    try:
        with urlopen(url, timeout=3) as resp:
            if resp.status != 200:
                raise RuntimeError(f"health returned status {resp.status}")
        print(f"OK api health: {url}")
    except (URLError, RuntimeError) as e:
        msg = f"API health check failed: {e}"
        if required:
            raise RuntimeError(msg) from e
        print(f"WARN {msg}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run smoke tests for local stack.")
    parser.add_argument("--api-url", default="http://localhost:8000", help="Base API URL.")
    parser.add_argument("--require-api", action="store_true", help="Fail if API health check fails.")
    args = parser.parse_args()

    check_config()
    check_sqlite_roundtrip()
    check_api_health(args.api_url, required=args.require_api)
    print("Smoke test complete.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"ERROR {e}")
        raise SystemExit(1)
