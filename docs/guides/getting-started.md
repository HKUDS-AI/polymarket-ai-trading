# Getting Started

This project is now standardized around one local workflow:

- Start: `bash scripts/docker.sh start`
- Stop: `bash scripts/stop_all.sh`
- Logs: `bash scripts/docker.sh logs`
- Status: `bash scripts/docker.sh status`

## 1) Prerequisites

- Docker Desktop running
- Python 3.11+ (for local helper scripts)
- Optional: `OPENAI_API_KEY` in `.env`

Create `.env`:

```bash
cp .env.example .env
```

## 2) Start the stack

```bash
bash scripts/docker.sh start
```

This starts:

- `polymarket-conservative`
- `polymarket-moderate`
- `polymarket-aggressive`
- `polymarket-dashboard`

Dashboard: `http://localhost:8000`

## 3) Run smoke checks

```bash
bash scripts/docker.sh smoke
```

Or directly:

```bash
python3 scripts/smoke_test.py --api-url http://localhost:8000 --require-api
```

## 4) Monitor

```bash
bash scripts/docker.sh logs
python3 scripts/monitor_models.py --loop
```

## 5) Stop everything

```bash
bash scripts/stop_all.sh
```

## Emergency stop

If you need an immediate halt:

```bash
python3 scripts/emergency_stop.py --reason "manual halt"
```

To resume later, remove the flag file and restart:

```bash
rm -f data/EMERGENCY_STOP
bash scripts/docker.sh start
```
