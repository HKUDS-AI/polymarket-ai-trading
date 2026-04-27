# Project Structure

Clean, organized structure for the Polymarket AI Trading System.

```
polymarket-ai-trading/
├── package.json            # Node.js dependencies & npm scripts
├── README.md               # Main project documentation
├── render.yaml             # Render deployment config
├── docker-compose.yml      # Local Docker (single Node service)
├── Dockerfile              # Node 20 image
├── .env.example            # Environment variable template
│
├── src/
│   ├── server.mjs          # Express REST API (dashboard backend)
│   ├── trader.mjs          # Mean-reversion paper trader
│   └── lib/                # Shared helpers (db, gamma, quality, paths)
│
├── config/                 # Trading model configurations (YAML)
│   ├── trader.yaml
│   ├── active_conservative.yaml
│   ├── active_moderate.yaml
│   ├── active_aggressive.yaml
│   └── models.yaml
│
├── scripts/
│   ├── start-all.mjs       # Spawns trader + loads API (main process)
│   ├── start_all.sh        # Render entry (exec node start-all.mjs)
│   ├── init-databases.mjs  # SQLite schema for all model DBs
│   ├── smoke.mjs           # Health check against /api/health
│   └── emergency-stop.mjs  # Writes data/EMERGENCY_STOP
│
├── research/               # Academic research & papers
│   ├── berg-rietz-2018-longshots-overconfidence.md
│   ├── munger-25-biases.md
│   └── papers/            # PDF research papers
│
├── vercel-frontend/        # Web dashboard
│   ├── public/
│   │   ├── index.html     # Main dashboard
│   │   ├── signals.html   # Live signals
│   │   ├── quality.html   # Market quality
│   │   ├── ai-insights.html
│   │   └── resolution.html
│   └── vercel.json        # Vercel config
│
└── docs/                   # Documentation
    ├── README.md          # Documentation index
    ├── deployment/        # Deployment guides
    │   ├── render-quickstart.md
    │   ├── render-complete.md
    │   ├── docker.md
    │   └── vercel.md
    ├── guides/            # User guides
    │   ├── getting-started.md
    │   ├── paper-trading.md
    │   ├── backtesting.md
    │   └── raspberry-pi.md
    └── archive/           # Historical docs
        └── [old summaries & notes]
```

## Runtime Directories (gitignored)

These are created at runtime and not tracked in git:

```
├── data/                   # SQLite databases
│   ├── trades_conservative.db
│   ├── trades_moderate.db
│   └── trades_aggressive.db
│
├── logs/                   # Application logs
│   ├── conservative.log
│   ├── moderate.log
│   └── aggressive.log
│
└── dashboard/             # Old dashboard (deprecated)
```

## Key Files

### Configuration

- **`.env`** - Environment variables (API keys, secrets) - **NEVER COMMIT**
- **`render.yaml`** - Render deployment config (auto-detected)
- **`docker-compose.yml`** - Local multi-container setup
- **`Dockerfile`** - Container image definition

### Entry Points

- **`src/server.mjs`** - REST API (port `PORT` or 8000)
- **`src/trader.mjs`** - Paper trading loop (see `config/trader.yaml`)
- **`scripts/start-all.mjs`** - Runs trader + API together (`npm start`)
- **`scripts/start_all.sh`** - Used by Render/Docker: `exec node scripts/start-all.mjs`

### Frontend

- **`vercel-frontend/public/index.html`** - Main dashboard
- Dashboard: static HTML + `public/js/*.js` modules
- Deployed to Vercel, consumes the Node API

## Clean Commands

```bash
# Remove runtime data
rm -rf data/ logs/ dashboard/

# Remove node_modules
rm -rf node_modules

# Full clean (Docker)
docker compose down -v
```

## Development Workflow

1. **Local development**: `docker compose up -d`
2. **View logs**: `docker compose logs -f`
3. **Run tests**: `pytest tests/`
4. **Deploy to Render**: Push to `master` (auto-deploys)
5. **Update frontend**: Push to `master` (Vercel auto-deploys)

---

**Keep it clean!** Only commit source code and documentation, never runtime data or secrets.
