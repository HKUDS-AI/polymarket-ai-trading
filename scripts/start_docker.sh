#!/bin/bash
# Backward-compatible wrapper around the canonical Docker workflow script.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "Using canonical Docker workflow: scripts/docker.sh start"
bash scripts/docker.sh start
