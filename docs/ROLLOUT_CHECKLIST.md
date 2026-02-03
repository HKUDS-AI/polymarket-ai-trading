# Rollout / Verification Checklist

Use this after shipping the audit commits to verify local Docker workflow, emergency stop, DB compatibility, and backward compatibility.

---

## Ship These 3 Commits

- **`9a67874`** — runtime/schema/config + emergency stop fixes  
- **`c30d7a3`** — canonical Docker workflow + smoke test + `.env.example`  
- **`534f2af`** — docs alignment  

**Expected state:** `HEAD` = `534f2af`. History includes all three above. `scripts/smoke_test.py` exists; `scripts/docker.sh` includes the `smoke` target.

### If devs are missing files (older checkout)

Have them run:

```bash
git fetch origin
git checkout master
git pull --ff-only origin master
git rev-parse --short HEAD
```

They should land on **`534f2af`**. If they see divergent history, merge or cherry-pick the three commits before running the checklist.

---

## New Canonical Commands (local)

| Action  | Command |
|---------|--------|
| Start   | `bash scripts/docker.sh start` |
| Status  | `bash scripts/docker.sh status` |
| Logs    | `bash scripts/docker.sh logs` |
| Stop    | `bash scripts/stop_all.sh` |
| Smoke   | `bash scripts/docker.sh smoke` |

---

## What To Verify

### Docker stack

- [ ] Docker stack brings up **4 services** from `docker-compose.yml` (3 models + dashboard).
- [ ] **`/api/health`** returns **200** when dashboard is up.
- [ ] **`scripts/smoke_test.py --require-api`** passes.

### Emergency stop

- [ ] Run: `python3 scripts/emergency_stop.py --reason "test" --yes`
- [ ] Confirm **`data/EMERGENCY_STOP`** exists.
- [ ] Confirm **trader cycles skip** while flag exists (check logs: "EMERGENCY_STOP" or "stopping all trading").
- [ ] Remove flag and restart: `rm data/EMERGENCY_STOP` then restart containers.

### DB compatibility

- [ ] **`scripts/init_databases.py`** creates usable **`trades_*`** DBs including **`trader`**.
- [ ] **`scripts/monitor_models.py`** reads current DB/status format correctly.

### Backward compatibility

- [ ] Trader works with **either** `POLYGON_PRIVATE_KEY` **or** `POLYGON_WALLET_PRIVATE_KEY`.
- [ ] Trader handles configs with **`longshot_threshold`** (legacy) and **`longshot_min` / `longshot_max`** (new).

---

## Code Review Focus

- `agents/systematic_trader.py` — safety limits, env key fallback, longshot config
- `scripts/emergency_stop.py` — flag creation, DB path/schema
- `scripts/docker.sh` — start/status/logs/smoke
- `scripts/stop_all.sh` — stop models + dashboard
- `scripts/smoke_test.py` — API health check
- `scripts/init_databases.py` — schema and `trader` DB
- `scripts/monitor_models.py` — status/column names

**DB alignment (verified):** `emergency_stop.py` discovers `data/trades_*.db` and updates `trades` with `status = 'closed'` / `LOWER(status) = 'open'`. `init_databases.py` creates `trades_{trader,conservative,moderate,aggressive}.db` with the same schema as the trader (`timestamp`, `entry_price`, `size_usd`, `shares`, `status`, `token_id`, etc.). `monitor_models.py` uses `LOWER(status)` and `timestamp` column. All consistent.

---

## One Caveat

- **`start_all.sh`** is now primarily the **Render/supervisor entrypoint**.
- **Local docs** now point to **`scripts/docker.sh`** + **`scripts/stop_all.sh`** as the canonical local workflow.

---

## Quick verification order

1. `bash scripts/docker.sh start`  
2. `bash scripts/docker.sh status` → expect 4 services up  
3. `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health` → expect `200`  
4. `bash scripts/docker.sh smoke` (or `python3 scripts/smoke_test.py --require-api`)  
5. Emergency stop test (create flag, check logs, remove flag)  
6. `python3 scripts/init_databases.py` → check `data/trades_trader.db` and others  
7. `python3 scripts/monitor_models.py` → no errors, sensible output  
