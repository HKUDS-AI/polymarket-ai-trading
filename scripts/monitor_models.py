#!/usr/bin/env python3
"""
Multi-Model Monitor

Shows real-time performance of all 3 paper trading models.
"""

import sqlite3
import time
from pathlib import Path
from datetime import datetime, timedelta
import sys

BASE_DIR = Path(__file__).parent.parent
MODELS = ['conservative', 'moderate', 'aggressive']


def get_model_stats(model_name: str) -> dict:
    """Get statistics for a model."""
    db_path = BASE_DIR / 'data' / f'trades_{model_name}.db'
    
    if not db_path.exists():
        return {
            'status': 'No data yet',
            'total_trades': 0,
            'winners': 0,
            'losers': 0,
            'win_rate': 0,
            'total_pnl': 0,
            'today_trades': 0,
            'today_pnl': 0,
        }
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Pick the timestamp column used by this DB schema.
        cursor.execute("PRAGMA table_info(trades)")
        columns = {row[1] for row in cursor.fetchall()}
        date_col = 'timestamp' if 'timestamp' in columns else 'created_at'

        # Total stats
        cursor.execute("""
            SELECT 
                COUNT(*) as total_trades,
                SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winners,
                SUM(CASE WHEN pnl <= 0 THEN 1 ELSE 0 END) as losers,
                SUM(pnl) as total_pnl,
                AVG(pnl) as avg_pnl,
                MAX(pnl) as best_trade,
                MIN(pnl) as worst_trade
            FROM trades
            WHERE LOWER(status) = 'closed'
        """)
        
        row = cursor.fetchone()
        total_trades = row[0] or 0
        winners = row[1] or 0
        losers = row[2] or 0
        total_pnl = row[3] or 0
        avg_pnl = row[4] or 0
        best_trade = row[5] or 0
        worst_trade = row[6] or 0
        
        # Today's stats
        today = datetime.now().date()
        cursor.execute(f"""
            SELECT 
                COUNT(*) as today_trades,
                SUM(pnl) as today_pnl
            FROM trades
            WHERE DATE({date_col}) = ? AND LOWER(status) = 'closed'
        """, (today,))
        
        row = cursor.fetchone()
        today_trades = row[0] or 0
        today_pnl = row[1] or 0
        
        # Open positions
        cursor.execute("""
            SELECT COUNT(*) FROM trades WHERE LOWER(status) = 'open'
        """)
        open_positions = cursor.fetchone()[0] or 0
        
        conn.close()
        
        return {
            'status': 'Running',
            'total_trades': total_trades,
            'winners': winners,
            'losers': losers,
            'win_rate': (winners / total_trades * 100) if total_trades > 0 else 0,
            'total_pnl': total_pnl,
            'avg_pnl': avg_pnl,
            'best_trade': best_trade,
            'worst_trade': worst_trade,
            'today_trades': today_trades,
            'today_pnl': today_pnl,
            'open_positions': open_positions,
        }
    
    except Exception as e:
        return {
            'status': f'Error: {e}',
            'total_trades': 0,
            'winners': 0,
            'losers': 0,
            'win_rate': 0,
            'total_pnl': 0,
            'today_trades': 0,
            'today_pnl': 0,
        }


def print_model_stats(model_name: str, stats: dict):
    """Pretty print model statistics."""
    
    print(f"\n{'='*60}")
    print(f"{model_name.upper()}")
    print('='*60)
    print(f"Status: {stats['status']}")
    
    if stats['total_trades'] > 0:
        print(f"\n📊 Overall Performance:")
        print(f"  Total Trades: {stats['total_trades']}")
        print(f"  Winners: {stats['winners']} | Losers: {stats['losers']}")
        print(f"  Win Rate: {stats['win_rate']:.1f}%")
        print(f"  Total P&L: ${stats['total_pnl']:.2f}")
        print(f"  Avg P&L: ${stats['avg_pnl']:.2f}")
        print(f"  Best: ${stats['best_trade']:.2f} | Worst: ${stats['worst_trade']:.2f}")
        
        if 'open_positions' in stats:
            print(f"  Open Positions: {stats['open_positions']}")
        
        print(f"\n📅 Today:")
        print(f"  Trades: {stats['today_trades']}")
        print(f"  P&L: ${stats['today_pnl']:.2f}")
        
        # Performance indicator
        if stats['total_pnl'] > 0:
            print(f"\n  ✅ Profitable: +${stats['total_pnl']:.2f}")
        elif stats['total_pnl'] < 0:
            print(f"\n  ❌ Losing: ${stats['total_pnl']:.2f}")
        else:
            print(f"\n  ⚪ Break-even")
    else:
        print(f"\n  ⏳ Waiting for first trade...")


def print_comparison(all_stats: dict):
    """Print comparison table."""
    
    print(f"\n{'='*60}")
    print("COMPARISON")
    print('='*60)
    print()
    print(f"{'Model':<15} {'Trades':<10} {'Win %':<10} {'P&L':<15} {'Today':<10}")
    print('-'*60)
    
    for model, stats in all_stats.items():
        trades = stats['total_trades']
        win_rate = f"{stats['win_rate']:.1f}%" if trades > 0 else "N/A"
        pnl = f"${stats['total_pnl']:+.2f}" if trades > 0 else "$0.00"
        today = f"${stats['today_pnl']:+.2f}" if stats['today_trades'] > 0 else "$0.00"
        
        # Emoji indicator
        if stats['total_pnl'] > 0:
            emoji = "✅"
        elif stats['total_pnl'] < 0:
            emoji = "❌"
        else:
            emoji = "⚪"
        
        print(f"{emoji} {model:<12} {trades:<10} {win_rate:<10} {pnl:<15} {today:<10}")
    
    # Overall
    total_trades = sum(s['total_trades'] for s in all_stats.values())
    total_pnl = sum(s['total_pnl'] for s in all_stats.values())
    total_today = sum(s['today_pnl'] for s in all_stats.values())
    
    if total_trades > 0:
        print('-'*60)
        print(f"{'TOTAL':<15} {total_trades:<10} {'':<10} ${total_pnl:+.2f}{'':>6} ${total_today:+.2f}")


def monitor_once():
    """Show current status of all models."""
    
    print(f"\n{'='*60}")
    print("MULTI-MODEL PAPER TRADING MONITOR")
    print('='*60)
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    all_stats = {}
    
    for model in MODELS:
        stats = get_model_stats(model)
        all_stats[model] = stats
        print_model_stats(model, stats)
    
    print_comparison(all_stats)
    
    print(f"\n{'='*60}")


def monitor_loop(interval: int = 30):
    """Continuously monitor models."""
    
    print("Starting continuous monitor...")
    print(f"Refresh interval: {interval} seconds")
    print("Press Ctrl+C to stop\n")
    
    try:
        while True:
            # Clear screen (works on Unix/Mac)
            print("\033[2J\033[H", end='')
            
            monitor_once()
            
            print(f"\n⏳ Refreshing in {interval}s... (Ctrl+C to stop)")
            time.sleep(interval)
    
    except KeyboardInterrupt:
        print("\n\n✅ Monitoring stopped")


def main():
    """Main entry point."""
    
    import argparse
    parser = argparse.ArgumentParser(description='Monitor paper trading models')
    parser.add_argument('--loop', action='store_true', help='Continuous monitoring')
    parser.add_argument('--interval', type=int, default=30, help='Refresh interval (seconds)')
    
    args = parser.parse_args()
    
    if args.loop:
        monitor_loop(args.interval)
    else:
        monitor_once()
        print()


if __name__ == '__main__':
    main()

