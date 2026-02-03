# Docker Deployment Guide

## Canonical local commands

Use the wrapper script so commands stay consistent across environments:

```bash
bash scripts/docker.sh start
bash scripts/docker.sh status
bash scripts/docker.sh logs
bash scripts/docker.sh stop
```

`scripts/docker.sh` supports both `docker compose` and legacy `docker-compose`.

## Services

`docker-compose.yml` runs four containers:

- `conservative`
- `moderate`
- `aggressive`
- `dashboard` (port `8000`)

## Environment variables

Optional `.env` values:

```bash
OPENAI_API_KEY=...
POLYGON_PRIVATE_KEY=...
```

`POLYGON_WALLET_PRIVATE_KEY` is also accepted for backward compatibility.

## Smoke test

After startup:

```bash
bash scripts/docker.sh smoke
```

Equivalent direct command:

```bash
python3 scripts/smoke_test.py --api-url http://localhost:8000 --require-api
```

## Emergency stop

```bash
python3 scripts/emergency_stop.py --reason "manual halt"
```

This sets `data/EMERGENCY_STOP`, closes open trades in local DBs, and signals running processes.  
To resume:

```bash
rm -f data/EMERGENCY_STOP
bash scripts/docker.sh start
```
