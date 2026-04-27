#!/bin/bash
# Render / Docker entry: API + paper trader
set -e
APP_ROOT="${APP_ROOT:-/app}"
cd "$APP_ROOT"
exec node "$APP_ROOT/scripts/start-all.mjs"
