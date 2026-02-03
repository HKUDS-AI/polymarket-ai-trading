#!/usr/bin/env python3
"""
Emergency stop for the current trader runtime.

Actions:
1) Set data/EMERGENCY_STOP flag (trader will skip all cycles while present)
2) Close all open trades in local SQLite DBs at break-even exit price
3) Mark pending/submitted orders as cancelled
4) Best-effort terminate known local trader/API processes from PID files
"""

import argparse
import logging
import os
import signal
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, Tuple

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
LOG_DIR = BASE_DIR / "logs"
FLAG_PATH = DATA_DIR / "EMERGENCY_STOP"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def parse_pid_line(line: str) -> Tuple[str, int] | Tuple[None, None]:
    line = line.strip()
    if not line or line.startswith("#"):
        return None, None
    sep = ":" if ":" in line else "=" if "=" in line else None
    if not sep:
        return None, None
    name, value = line.split(sep, 1)
    try:
        return name.strip(), int(value.strip())
    except ValueError:
        return None, None


def close_open_trades(db_path: Path, reason: str) -> Dict[str, int]:
    result = {"closed": 0, "cancelled": 0}
    if not db_path.exists():
        return result

    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE trades
            SET status = 'closed',
                exit_price = entry_price,
                exit_timestamp = ?,
                pnl = COALESCE(pnl, 0),
                notes = COALESCE(notes, '') || ?
            WHERE LOWER(status) = 'open'
            """,
            (datetime.utcnow().isoformat(), f" | EMERGENCY_STOP: {reason}"),
        )
        result["closed"] = cur.rowcount

        cur.execute(
            """
            UPDATE trades
            SET status = 'cancelled',
                notes = COALESCE(notes, '') || ?
            WHERE LOWER(status) IN ('pending', 'submitted')
            """,
            (f" | EMERGENCY_STOP: {reason}",),
        )
        result["cancelled"] = cur.rowcount
        conn.commit()
    finally:
        conn.close()
    return result


def discover_db_files() -> Iterable[Path]:
    if not DATA_DIR.exists():
        return []
    return sorted(DATA_DIR.glob("trades_*.db"))


def terminate_known_processes() -> int:
    terminated = 0

    # Render/single-model PID files.
    single_pid_files = [DATA_DIR / "trader.pid", DATA_DIR / "dashboard_pid.txt"]
    for pid_file in single_pid_files:
        if not pid_file.exists():
            continue
        try:
            pid = int(pid_file.read_text().strip())
            os.kill(pid, signal.SIGTERM)
            terminated += 1
        except Exception:
            pass

    # Multi-model PID map.
    pids_file = DATA_DIR / "model_pids.txt"
    if pids_file.exists():
        for line in pids_file.read_text().splitlines():
            _, pid = parse_pid_line(line)
            if not pid:
                continue
            try:
                os.kill(pid, signal.SIGTERM)
                terminated += 1
            except Exception:
                pass

    return terminated


def create_flag(reason: str) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    FLAG_PATH.write_text(
        f"Emergency stop executed at {datetime.utcnow().isoformat()}\n"
        f"Reason: {reason}\n"
        "\nDelete this file to allow trading cycles again.\n"
    )


def log_action(reason: str, total_closed: int, total_cancelled: int, processes: int) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / "emergency_stops.log"
    with open(log_path, "a") as f:
        f.write(f"\n{'='*60}\n")
        f.write(f"Emergency Stop: {datetime.utcnow().isoformat()}\n")
        f.write(f"Reason: {reason}\n")
        f.write(f"Trades closed: {total_closed}\n")
        f.write(f"Orders cancelled: {total_cancelled}\n")
        f.write(f"Processes signaled: {processes}\n")
        f.write(f"{'='*60}\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Emergency stop trading immediately.")
    parser.add_argument("--reason", default="Manual emergency stop", help="Reason for shutdown.")
    parser.add_argument("--yes", action="store_true", help="Skip interactive confirmation.")
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("EMERGENCY STOP")
    print("=" * 60)
    print(f"Reason: {args.reason}")
    print("\nThis will set a stop flag, close open trades, and signal running processes.")

    if not args.yes:
        response = input("\nType 'STOP' to confirm: ").strip()
        if response != "STOP":
            print("Emergency stop cancelled.")
            return 1

    create_flag(args.reason)
    logger.warning("Created emergency stop flag at %s", FLAG_PATH)

    total_closed = 0
    total_cancelled = 0
    for db_path in discover_db_files():
        stats = close_open_trades(db_path, args.reason)
        total_closed += stats["closed"]
        total_cancelled += stats["cancelled"]
        logger.info("%s -> closed=%s cancelled=%s", db_path.name, stats["closed"], stats["cancelled"])

    processes = terminate_known_processes()
    log_action(args.reason, total_closed, total_cancelled, processes)

    print("\nEmergency stop complete.")
    print(f"Trades closed: {total_closed}")
    print(f"Orders cancelled: {total_cancelled}")
    print(f"Processes signaled: {processes}")
    print(f"Flag: {FLAG_PATH}")
    print("\nTo resume trading:")
    print("  1) Delete data/EMERGENCY_STOP")
    print("  2) Restart services")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

