# Fly.io Deployment Guide

Deploy to Amsterdam (Netherlands) to avoid Polymarket's US/EU geo-restrictions.

## Why Fly.io?

- Amsterdam region available (not geoblocked by Polymarket)
- Free tier sufficient for this app
- Uses our existing Dockerfile
- Persistent storage for trade database

## Prerequisites

- Fly.io account (free): https://fly.io/app/sign-up
- Fly CLI installed

## Step 1: Install Fly CLI

```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Or with Homebrew
brew install flyctl
```

## Step 2: Login

```bash
fly auth login
```

This opens a browser for authentication.

## Step 3: Create the App

```bash
cd /path/to/polymarket-ai-trading

# Launch the app (will detect fly.toml)
fly launch --no-deploy
```

When prompted:
- App name: `polymarket-trader` (or choose your own)
- Region: Select `ams` (Amsterdam)
- Don't set up Postgres/Redis

## Step 4: Create Persistent Volume

```bash
# Create 1GB volume in Amsterdam for trade database
fly volumes create polymarket_data --region ams --size 1
```

## Step 5: Set Secrets (Environment Variables)

```bash
# Required
fly secrets set POLYGON_PRIVATE_KEY="your-private-key-here"
fly secrets set OPENAI_API_KEY="sk-your-openai-key"

# Trading mode
fly secrets set LIVE_TRADING="true"

# Optional safety controls
fly secrets set KILL_SWITCH="false"
fly secrets set MAX_DAILY_LOSS_USD="100"
```

## Step 6: Deploy

```bash
fly deploy
```

First deploy takes ~3-5 minutes (building Docker image).

## Step 7: Verify

```bash
# Check status
fly status

# View logs
fly logs

# Open dashboard
fly open
```

Your app will be at: `https://polymarket-trader.fly.dev`

## Managing the App

### View Logs
```bash
fly logs --app polymarket-trader
```

### SSH into Container
```bash
fly ssh console
```

### Check Health
```bash
curl https://polymarket-trader.fly.dev/api/health
```

### Stop/Start
```bash
fly scale count 0  # Stop
fly scale count 1  # Start
```

### Update Secrets
```bash
fly secrets set LIVE_TRADING="false"  # Disable live trading
```

### Redeploy After Code Changes
```bash
git push origin master  # Push to GitHub first
fly deploy
```

## Cost

| Resource | Free Tier | Our Usage |
|----------|-----------|-----------|
| Shared CPU | 3 VMs | 1 VM |
| Memory | 256MB each | 512MB |
| Storage | 3GB total | 1GB |
| Bandwidth | Unlimited | Minimal |

**Estimated cost**: $0 if within free tier, ~$5/month if exceeded.

## Troubleshooting

### App Not Starting
```bash
fly logs  # Check for errors
fly status  # Check machine status
```

### Volume Not Mounting
```bash
fly volumes list  # Check volume exists
fly volumes create polymarket_data --region ams --size 1  # Create if missing
```

### Geo-block Still Happening
Verify you're in Amsterdam:
```bash
fly ssh console
curl https://polymarket.com/api/geoblock
# Should show: {"blocked":false,"country":"NL",...}
```

### Memory Issues
```bash
fly scale memory 1024  # Upgrade to 1GB RAM
```

## Switching from Render

1. Keep Render running for paper trading / backup
2. Set `LIVE_TRADING=false` on Render
3. Deploy to Fly.io with `LIVE_TRADING=true`
4. Verify Fly.io is working
5. (Optional) Stop Render service

## Quick Reference

| Command | Description |
|---------|-------------|
| `fly status` | App status |
| `fly logs` | View logs |
| `fly deploy` | Deploy changes |
| `fly secrets list` | List secrets |
| `fly ssh console` | SSH into container |
| `fly open` | Open in browser |
