# Polymarket AI Trading System

Quantitative trading system for Polymarket prediction markets, built on 40+ years of prediction market research.

**🔗 Live Dashboard**: [polymarket-trading-dashboard.vercel.app](https://polymarket-trading-dashboard.vercel.app)

**by [b1rdmania](https://github.com/b1rdmania)**

## 🎯 What This Is

An AI-powered trading system for Polymarket that:
- Applies **mean reversion strategies** from academic research (Berg & Rietz 2018, Munger cognitive biases)
- Runs **three parallel models** (Conservative, Moderate, Aggressive) to test different risk profiles
- Operates in **paper trading mode** for safe testing without real capital
- Uses **OpenAI GPT-4o-mini** for market analysis and quality scoring
- Provides a **live dashboard** to monitor model performance and trading signals

## 📊 Current Status

**Development Stage**: Paper Trading & Research  
**Live Dashboard**: [polymarket-trading-dashboard.vercel.app](https://polymarket-trading-dashboard.vercel.app)  
**Backend**: [polymarket-trading-system.onrender.com](https://polymarket-trading-system.onrender.com)  
**Deployment**: ✅ Production (Vercel + Render, $7/month)

### What's Working ✅

- ✅ Live market data streaming from Polymarket CLOB API
- ✅ AI-powered market analysis (GPT-4o-mini + embeddings)
- ✅ Market quality scoring (liquidity, spread, activity, clarity)
- ✅ Multi-model architecture (3 trading strategies running in parallel)
- ✅ Real-time signal detection and tracking
- ✅ Resolution tracking and win rate calculation
- ✅ Semantic market search using vector embeddings
- ✅ Docker containerization for 24/7 operation
- ✅ Web dashboard with live backend connection

### What's In Progress 🚧

- 🚧 Backtesting framework (partially implemented)
- 🚧 Historical trade data collection
- 🚧 Model performance optimization
- 🚧 Trade execution logic refinement

### What's Not Built Yet ❌

- ❌ Real capital deployment (staying in paper mode)
- ❌ Wallet integration (no private keys, no real trades)
- ❌ Advanced risk management beyond basic Kelly Criterion
- ❌ Multi-market portfolio optimization

## 🏗️ System Architecture

```
┌─────────────────────────────────────────┐
│         Frontend (Vercel)               │
│  - Market data ticker                   │
│  - Model performance comparison         │
│  - Trading signal monitoring            │
└─────────────────┬───────────────────────┘
                  │ HTTP/REST
                  ▼
┌─────────────────────────────────────────┐
│    Node.js API (Port 8000)              │
│  - /api/models - Model stats            │
│  - /api/signals/live - Trading signals  │
│  - /api/quality/* - Market scoring      │
│  - /api/ai/* - GPT-4o analysis          │
│  - /api/resolution/* - Accuracy tracker │
└─────────────────┬───────────────────────┘
                  │ SQLite
                  ▼
┌─────────────────────────────────────────┐
│     Docker Containers (4 services)      │
│  ┌───────────────────────────────────┐  │
│  │ Conservative Model (Low Risk)     │  │
│  │ Moderate Model (Balanced)         │  │
│  │ Aggressive Model (High Risk)      │  │
│  │ Dashboard API                     │  │
│  └───────────────────────────────────┘  │
└─────────────────┬───────────────────────┘
                  │ WebSocket/API
                  ▼
┌─────────────────────────────────────────┐
│      Polymarket CLOB API                │
│  - Live market data                     │
│  - Order book feeds                     │
│  - Market resolution data               │
└─────────────────────────────────────────┘
```

## 🧠 Trading Models

Each model uses the same core strategy (mean reversion) but with different risk parameters:

### 1. Conservative Model
- **Risk Level**: Low
- **Position Size**: Small (Kelly Criterion × 0.25)
- **Entry Threshold**: High confidence only (>70% signal strength)
- **Max Drawdown**: 10%
- **Target Win Rate**: 60%+

### 2. Moderate Model  
- **Risk Level**: Balanced
- **Position Size**: Medium (Kelly Criterion × 0.50)
- **Entry Threshold**: Moderate confidence (>55%)
- **Max Drawdown**: 20%
- **Target Win Rate**: 55%+

### 3. Aggressive Model
- **Risk Level**: High
- **Position Size**: Large (Kelly Criterion × 1.0)
- **Entry Threshold**: Lower confidence (>45%)
- **Max Drawdown**: 35%
- **Target Win Rate**: 50%+

All models run in **paper mode** - no real capital deployed.

## 🛠️ Quick Start

### Prerequisites

- **Docker Desktop** (for local development) OR
- **Render account** (for production deployment - [sign up free](https://render.com))
- **OpenAI API key** (for AI features - [get one here](https://platform.openai.com/api-keys))

### Option A: Local Development

1. **Clone the repository**

```bash
git clone https://github.com/b1rdmania/polymarket-ai-trading.git
cd polymarket-ai-trading
```

2. **Set up environment variables**

```bash
# Create .env file
cp .env.example .env

# Edit .env and add your OpenAI API key:
OPENAI_API_KEY=sk-...
```

⚠️ **Security**: Never commit your `.env` file. It's in `.gitignore` by default.

3. **Start Docker containers**

```bash
# Build and start all services (canonical wrapper)
bash scripts/docker.sh start

# Check status
bash scripts/docker.sh status

# View logs
bash scripts/docker.sh logs

# Run smoke checks
bash scripts/docker.sh smoke
```

4. **Access the dashboard**

Open `http://localhost:8000` in your browser.

### Option B: Deploy to Render (Recommended for 24/7 operation)

**Cost**: $7/month for 24/7 uptime (or free with 15-min spin-down)

1. **Quick Deploy**:
   - Go to [dashboard.render.com](https://dashboard.render.com)
   - Click "New +" → "Blueprint"
   - Connect GitHub: `b1rdmania/polymarket-ai-trading`
   - Add environment variable: `OPENAI_API_KEY=sk-...`
   - Click "Apply"

2. **Full Guide**: See [RENDER_QUICKSTART.md](RENDER_QUICKSTART.md) or [RENDER_DEPLOY.md](RENDER_DEPLOY.md)

Your system will be live at: `https://polymarket-trading-system.onrender.com`

## 📚 Documentation

**[📖 View Full Documentation →](docs/)**

### Quick Links

| Guide | Purpose |
|-------|---------|
| [Getting Started](docs/guides/getting-started.md) | Complete setup walkthrough for beginners |
| [Deploy to Render](docs/deployment/render-quickstart.md) | **5-step production deployment** ($7/month) |
| [Paper Trading Guide](docs/guides/paper-trading.md) | How paper trading mode works |
| [Backtesting Guide](docs/guides/backtesting.md) | Run historical backtests |
| [Docker Setup](docs/deployment/docker.md) | Local development with Docker |

### All Guides

- **Deployment**: [Render](docs/deployment/render-quickstart.md) • [Docker](docs/deployment/docker.md) • [Vercel](docs/deployment/vercel.md)
- **Usage**: [Getting Started](docs/guides/getting-started.md) • [Paper Trading](docs/guides/paper-trading.md) • [Backtesting](docs/guides/backtesting.md)
- **Advanced**: [Raspberry Pi](docs/guides/raspberry-pi.md) • [Wallet Setup](docs/guides/wallet-setup.md) • [Go Live](docs/guides/go-live.md) ⚠️

## 🔬 Research Foundation

This system is built on academic research in prediction markets:

### Key Papers & Concepts

1. **Berg & Rietz (2018)** - "Longshots and Overconfidence"
   - Favorite-longshot bias: Market overprices unlikely outcomes
   - Mean reversion opportunities in mispriced probabilities
   
2. **Munger's 25 Cognitive Biases**
   - Recency bias: Overweighting recent events
   - Availability bias: Overestimating memorable events
   - Confirmation bias: Seeking supporting evidence

3. **Quantitative Mean Reversion**
   - Statistical arbitrage in probability spreads
   - Kelly Criterion for position sizing
   - Market quality filtering (liquidity, spread, activity)

4. **@the_smart_ape Trading Insights**
   - Real-world Polymarket trading strategies
   - Market timing and entry/exit optimization

See [`research/`](research/) for detailed papers and analysis.

## 🧰 Toolkit Components

The system includes specialized modules for different trading functions:

| Module | Purpose | Status |
|--------|---------|--------|
| **polymarket-data** | Market data fetching and normalization | ✅ Working |
| **mean-reversion** | Statistical arbitrage detection | ✅ Working |
| **execution-engine** | Order execution and trade management | 🚧 Paper mode only |
| **volatility-alerts** | Price movement detection and alerts | ✅ Working |
| **whale-tracker** | Large position monitoring | 🚧 Partial |

Each toolkit module is designed to be modular and reusable.

## 🎨 Dashboard Features

The web dashboard provides real-time monitoring:

**Core Views:**
- **Model Comparison**: Side-by-side performance of Conservative/Moderate/Aggressive models
- **Live Signals**: Real-time trading signals with strength indicators
- **Market Quality**: AI-powered scoring of tradeable markets (liquidity, spread, clarity)
- **AI Insights**: GPT-4o analysis of market questions with risk factors
- **Resolution Tracker**: Accuracy tracking on resolved markets
- **Vector Search**: Semantic similarity search across markets

**Tech Stack:**
- Frontend: Vanilla JavaScript (see `vercel-frontend/public`), modern CSS (dark theme)
- Backend: Node.js 20 + Express (`src/server.mjs`)
- Trader: Paper mean-reversion loop (`src/trader.mjs`, YAML config in `config/`)
- Database: SQLite (`data/trades_*.db`) via `better-sqlite3`
- AI: OpenAI GPT-4o-mini + embeddings (optional; set `OPENAI_API_KEY`)
- Deployment: Vercel (frontend) + Docker/Render (Node backend, `Dockerfile`)

Dashboard is mobile-responsive and updates in real-time.

## 🐳 Docker Setup

The system runs as 4 containerized services:

```yaml
services:
  conservative:     # Conservative trading model
  moderate:         # Moderate trading model  
  aggressive:       # Aggressive trading model
  dashboard:        # FastAPI backend (port 8000)
```

**Shared Volumes:**
- `./data` - SQLite databases for trade history
- `./logs` - Application logs
- `./config` - Model configuration files

**Health Checks:**
- Models: Process health check every 60s
- Dashboard: HTTP health check at `/api/health` every 30s

All containers restart automatically on failure.

## 🔐 Security & Safety

### Current Setup (Paper Trading)

✅ **Safe:**
- No real capital at risk
- No wallet private keys required
- No blockchain transactions
- API keys stored in `.env` (gitignored)
- Cloudflare Tunnel for secure public access

### If You Go Live (Not Recommended Yet)

⚠️ **Required:**
- Secure wallet with private key management
- HSM or hardware wallet integration
- Risk limits and kill switches
- Position size caps
- Drawdown monitoring
- Multi-signature for large trades

**Don't rush to production.** Paper trade first, validate strategy, then scale slowly.

### Environment Variables

Never commit these to Git:
- `OPENAI_API_KEY` - OpenAI API key
- `POLYGON_PRIVATE_KEY` - Wallet private key (if going live)

All sensitive vars are in `.env` which is gitignored.

## 📈 Monitoring & Metrics

### What to Watch

**Model Performance:**
- Total trades executed
- Win rate (target: >50%)
- Total P&L (paper)
- Average P&L per trade
- Open positions
- Today's activity

**Market Quality:**
- Liquidity score (volume-based)
- Spread score (bid-ask tightness)
- Activity score (recent volume)
- Clarity score (question readability)

**System Health:**
- Backend connection status
- Docker container health
- API response times
- Database size

### Dashboard Access

**Local**: `http://localhost:8000`  
**Live**: [View Dashboard](https://vercel-frontend-g4o1sdx6o-boom-test-c54cde04.vercel.app)

The dashboard updates in real-time. Green dot = backend connected.

## 🤝 Contributing

This is a personal research project, but I'm open to:
- Bug reports and fixes
- Documentation improvements
- Research paper contributions
- Strategy suggestions

**Not accepting:**
- PRs that enable live trading without proper safety checks
- Features that compromise security

Feel free to fork and experiment! Just keep it in paper mode until you really know what you're doing.

## 🙏 Acknowledgments

Built on research and insights from:

- **Berg & Rietz (2018)** - "Longshots, Overconfidence, and Efficiency in the NCAA Tournament Betting Market"
- **Charlie Munger** - 25 cognitive biases framework
- **@the_smart_ape** - Real-world Polymarket trading strategies and insights
- **Polymarket community** - Market data and ecosystem knowledge

## 🔗 Links

- **GitHub**: [github.com/b1rdmania/polymarket-ai-trading](https://github.com/b1rdmania/polymarket-ai-trading)
- **Live Dashboard**: [polymarket-trading-dashboard.vercel.app](https://polymarket-trading-dashboard.vercel.app)
- **Polymarket**: [polymarket.com](https://polymarket.com)
- **My GitHub**: [@b1rdmania](https://github.com/b1rdmania)

## 📊 Related Projects

- **[Canton Prediction Markets](https://github.com/b1rdmania/canton-prediction-markets)** - Decentralized prediction markets on Canton Network (in development)
- **[Aztec Auction Analysis](https://github.com/b1rdmania/aztec-auction-analysis)** - Privacy-preserving auction research on Aztec

---

## ⚠️ Disclaimer

**This system is for educational and research purposes only.**

- Not financial advice
- No guarantees of profit
- Paper trading is not the same as live trading
- Prediction markets involve risk
- Always trade responsibly with capital you can afford to lose

Use at your own risk. No warranty provided.
