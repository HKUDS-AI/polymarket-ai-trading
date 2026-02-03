# Wallet Setup Guide

## Prerequisites

- Polygon (MATIC) network access
- USDC on Polygon
- Private key security practices

## Step 1: Create Polygon Wallet

### Option A: MetaMask

1. Install MetaMask browser extension
2. Create new wallet or import existing
3. Add Polygon network:
   - Network Name: Polygon Mainnet
   - RPC URL: https://polygon-rpc.com/
   - Chain ID: 137
   - Symbol: MATIC
   - Block Explorer: https://polygonscan.com/

### Option B: Python Script

```python
from eth_account import Account
import secrets

# Generate new account
priv = secrets.token_hex(32)
private_key = "0x" + priv
account = Account.from_key(private_key)

print(f"Address: {account.address}")
print(f"Private Key: {private_key}")

# IMPORTANT: Store private key securely!
# Never commit to git or share publicly
```

## Step 2: Fund Wallet with USDC

### Get USDC on Polygon

1. **Bridge from Ethereum**:
   - Use official Polygon bridge: https://wallet.polygon.technology/
   - Bridge USDC from Ethereum to Polygon
   - Wait for confirmation (7-8 minutes)

2. **Buy directly**:
   - Buy on exchange (Kraken, Coinbase, etc.)
   - Withdraw to Polygon network
   - Ensure you select "Polygon" not "Ethereum"

3. **Swap on Polygon**:
   - Buy MATIC on exchange
   - Use QuickSwap or Uniswap on Polygon
   - Swap MATIC → USDC

### Initial Funding Recommendations

| Phase | USDC Amount | Purpose |
|-------|-------------|---------|
| Testing | $100 | Verify everything works |
| Paper Trading | $0 | No real funds needed |
| Micro Live | $500 | Initial live trades |
| Small Live | $2,000 | Full exposure |
| Scaling | $5,000+ | After validation |

## Step 3: Configure Environment

### Create `.env` file

```bash
# NEVER commit this file to git!
POLYGON_PRIVATE_KEY="0x..."
OPENAI_API_KEY="sk-..." # Optional, for AI features
```

### Security Checklist

- [ ] Private key stored only in `.env` file
- [ ] `.env` added to `.gitignore`
- [ ] Backup private key in secure location (password manager, hardware wallet)
- [ ] Never share private key
- [ ] Consider using hardware wallet for large amounts

## Step 4: Test Wallet Connection

```python
import os
from eth_account import Account
from web3 import Web3

# Load private key (supports both variable names)
private_key = os.getenv("POLYGON_PRIVATE_KEY") or os.getenv("POLYGON_WALLET_PRIVATE_KEY")
account = Account.from_key(private_key)

# Connect to Polygon
w3 = Web3(Web3.HTTPProvider('https://polygon-rpc.com'))

# Check connection
print(f"Connected: {w3.is_connected()}")
print(f"Address: {account.address}")

# Check USDC balance
USDC_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"  # Polygon USDC
balance = w3.eth.get_balance(account.address)
print(f"MATIC balance: {w3.from_wei(balance, 'ether')} MATIC")
```

## Step 5: Verify Polymarket Access

### Test Order Signing

```python
# This verifies you can sign orders for Polymarket
from polymarket_agents import Polymarket

pm = Polymarket(private_key)
print("✅ Polymarket client initialized")
```

## Step 6: Start with Paper Trading

**Do NOT go live immediately!**

1. Run paper trading for at least 30 days
2. Validate strategy performance
3. Check all metrics:
   - Win rate > 55%
   - Sharpe ratio > 1.0
   - Max drawdown < 20%

## Step 7: Go Live (When Ready)

### Week 1-2: Micro Positions

```yaml
# config/trading.yaml
risk:
  max_position_usd: 100
  max_total_exposure_usd: 300
  max_positions: 3
```

Monitor hourly. Verify:
- Orders execute correctly
- P&L tracking works
- Risk limits enforced

### Week 3-4: Small Positions

```yaml
risk:
  max_position_usd: 250
  max_total_exposure_usd: 750
  max_positions: 5
```

Monitor daily. Track:
- Execution quality
- Slippage
- Performance vs paper trading

### Week 5+: Full Positions

```yaml
risk:
  max_position_usd: 500
  max_total_exposure_usd: 2000
  max_positions: 10
```

## Security Best Practices

### Private Key Storage

1. **Environment variables** (Development):
   ```bash
   export POLYGON_PRIVATE_KEY="0x..."
   ```

2. **Encrypted file** (Production):
   ```bash
   # Encrypt private key
   gpg -c .env
   
   # Decrypt when needed
   gpg -d .env.gpg > .env
   ```

3. **Hardware wallet** (Large amounts):
   - Use Ledger or Trezor
   - Sign transactions on device
   - Never expose private key to computer

### Wallet Hygiene

- [ ] Separate hot wallet for trading
- [ ] Cold wallet for long-term storage
- [ ] Regular security audits
- [ ] Monitor for unauthorized transactions
- [ ] Enable 2FA on all exchanges

## Emergency Procedures

### Compromised Private Key

1. **Immediately**:
   ```bash
   python scripts/emergency_stop.py
   ```

2. Transfer remaining USDC to new wallet:
   ```python
   # Emergency transfer script
   from web3 import Web3
   # Transfer all USDC to safe wallet
   ```

3. Rotate all credentials
4. Audit transaction history

### Lost Private Key

- Restore from secure backup
- If no backup: funds are lost forever
- This is why backups are critical!

## Monitoring

### Daily Checks

- [ ] Check wallet balance
- [ ] Review recent transactions on Polygonscan
- [ ] Verify no unexpected trades
- [ ] Check dashboard for alerts

### Weekly Reviews

- [ ] Performance vs benchmarks
- [ ] Risk metrics within limits
- [ ] No security incidents
- [ ] Backup verification

## Support

For issues:
1. Check logs: `logs/trading.log`
2. Check database: `sqlite3 data/trades.db`
3. Emergency stop: `python scripts/emergency_stop.py`

**Never share your private key for support!**

