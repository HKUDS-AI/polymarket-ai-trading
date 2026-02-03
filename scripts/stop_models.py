#!/usr/bin/env python3
"""
Stop all paper trading models.
"""

import os
import signal
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
PIDS_FILE = BASE_DIR / 'data' / 'model_pids.txt'


def stop_all_models():
    """Stop all running models."""
    
    if not PIDS_FILE.exists():
        print("❌ No PID file found. Models may not be running.")
        print(f"   Expected: {PIDS_FILE}")
        return
    
    print("="*60)
    print("STOPPING ALL MODELS")
    print("="*60 + "\n")
    
    stopped = []
    failed = []
    
    with open(PIDS_FILE, 'r') as f:
        for line in f:
            line = line.strip()
            
            # Skip comments and empty lines
            if not line or line.startswith('#'):
                continue
            
            try:
                if ':' in line:
                    model, pid_str = line.split(':', 1)
                elif '=' in line:
                    model, pid_str = line.split('=', 1)
                else:
                    continue
                
                pid = int(pid_str)
                
                print(f"Stopping {model} (PID {pid})...", end=' ')
                
                try:
                    os.kill(pid, signal.SIGTERM)
                    print("✅ Stopped")
                    stopped.append(model)
                except ProcessLookupError:
                    print("⚠️  Not running")
                    stopped.append(model)
                except PermissionError:
                    print("❌ Permission denied")
                    failed.append(model)
            
            except ValueError:
                # Skip non-PID metadata lines (e.g. mode=paper).
                continue
            except Exception as e:
                print(f"❌ Error: {e}")
                failed.append(line)
    
    # Remove PID file
    PIDS_FILE.unlink()
    print(f"\n✅ Removed PID file")
    
    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print('='*60)
    print(f"Stopped: {len(stopped)} models")
    if failed:
        print(f"Failed: {len(failed)} models")
    
    print()


if __name__ == '__main__':
    stop_all_models()

