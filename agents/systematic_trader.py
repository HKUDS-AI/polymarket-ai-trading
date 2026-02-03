#!/usr/bin/env python3
"""
Mean Reversion Trader with AI Gate

Scans Polymarket for extreme prices, uses AI to filter bad trades.
Supports both paper trading and live trading via CLOB API.
"""

import asyncio
import argparse
import logging
import sqlite3
import httpx
import yaml
import json
import os
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, List

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

GAMMA_API = "https://gamma-api.polymarket.com"
CLOB_API = "https://clob.polymarket.com"
BASE_DIR = Path(__file__).parent.parent
EMERGENCY_STOP_FLAG = BASE_DIR / 'data' / 'EMERGENCY_STOP'

# Environment variables
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
LIVE_TRADING = os.getenv('LIVE_TRADING', 'false').lower() == 'true'
POLYGON_PRIVATE_KEY = os.getenv('POLYGON_PRIVATE_KEY') or os.getenv('POLYGON_WALLET_PRIVATE_KEY', '')
KILL_SWITCH = os.getenv('KILL_SWITCH', 'false').lower() == 'true'
MAX_DAILY_LOSS_USD = float(os.getenv('MAX_DAILY_LOSS_USD', '200'))

# Try to import CLOB client for live trading
CLOB_AVAILABLE = False
try:
    from py_clob_client.client import ClobClient
    from py_clob_client.clob_types import OrderArgs
    CLOB_AVAILABLE = True
except ImportError:
    logger.warning("py_clob_client not installed - live trading unavailable")

WEB3_AVAILABLE = False
try:
    from web3 import Web3
    from eth_account import Account
    WEB3_AVAILABLE = True
except ImportError:
    logger.warning("web3 not installed - on-chain position sync unavailable")


class MeanReversionTrader:
    """
    Mean reversion trader with configurable thresholds and Kelly sizing.
    - Fetches ALL markets from Polymarket (500+)
    - Finds extreme prices based on config thresholds
    - Uses Kelly criterion for position sizing
    - AI gate filters out bad trades
    - Supports live trading via CLOB API
    """
    
    def __init__(self, model_name: str, config_path: str):
        self.model_name = model_name
        self.config = self._load_config(config_path)
        
        # Trading mode
        self.live_trading = LIVE_TRADING and CLOB_AVAILABLE and POLYGON_PRIVATE_KEY
        self.clob_client = None
        
        # Database path
        db_name = self.config.get('data', {}).get('db_path', f'data/trades_{model_name}.db')
        self.db_path = BASE_DIR / db_name
        
        # Risk parameters from config
        risk = self.config.get('risk', {})
        self.bankroll = float(risk.get('bankroll', 500))
        self.kelly_fraction = risk.get('kelly_fraction', 0.25)
        self.max_position_usd = risk.get('max_position_usd', 50)
        self.max_positions = risk.get('max_positions', 10)
        self.max_total_exposure = risk.get('max_total_exposure_usd', 400)
        
        # Signal thresholds from config (based on Berg & Rietz 2018 research)
        signals = self.config.get('signals', {}).get('mean_reversion', {})
        self.favorite_threshold = signals.get('favorite_threshold', 0.75)
        # Backward compatibility: older configs use longshot_threshold only.
        longshot_threshold = signals.get('longshot_threshold')
        self.longshot_min = signals.get('longshot_min', 0.05)  # Don't buy below 5%
        if longshot_threshold is not None and 'longshot_max' not in signals:
            self.longshot_max = longshot_threshold
        else:
            self.longshot_max = signals.get('longshot_max', 0.20)  # Buy in 5-20% range
        self.min_mispricing_pct = signals.get('min_mispricing_pct', 5.0)
        self.min_hours_to_resolution = 48  # Avoid markets ending soon (bias evaporates)
        
        # Execution parameters
        execution = self.config.get('execution', {})
        self.check_interval = execution.get('check_interval_seconds', 300)
        self.market_fetch_limit = int(execution.get('market_fetch_limit', 1500))
        self.sync_every_cycles = int(execution.get('sync_every_cycles', 1))
        self.sync_min_shares = float(execution.get('sync_min_shares', 0.5))
        self.sync_batch_size = int(execution.get('sync_batch_size', 150))
        self._cycle_count = 0
        
        # Fixed parameters
        self.min_volume = 10000           # $10k minimum volume
        self.stop_loss_pct = -50.0        # Sell at -50%
        
        # Trailing stop parameters
        self.trailing_activation_pct = 50.0   # Activate trailing stop at +50%
        self.trailing_distance_pct = 25.0     # Trail 25% behind high water mark
        
        # Safety: daily loss tracking
        self.daily_pnl = 0.0
        self.daily_reset_time = datetime.now().replace(hour=0, minute=0, second=0)
        
        # Track positions in memory (keyed by trade_id)
        self.positions: Dict[str, Dict] = {}
        self.wallet_address = None
        self.ctf_contract = None
        
        self._init_db()
        self._load_positions()
        
        # Initialize CLOB client for live trading
        if self.live_trading:
            self._init_clob_client()
            self._init_onchain_sync()
        
        mode_str = "LIVE TRADING" if self.live_trading else "PAPER TRADING"
        # Print to stdout for visibility in Render logs
        print(f"{'='*50}", flush=True)
        print(f"  MODE: {mode_str}", flush=True)
        print(f"  CLOB_AVAILABLE: {CLOB_AVAILABLE}", flush=True)
        print(f"  POLYGON_KEY_SET: {bool(POLYGON_PRIVATE_KEY)}", flush=True)
        print(f"  OPENAI_KEY_SET: {bool(OPENAI_API_KEY)}", flush=True)
        print(f"{'='*50}", flush=True)
        print(f"Positions: {len(self.positions)}, Bankroll: ${self.bankroll:.0f}", flush=True)
        print(f"Thresholds: favorite>{self.favorite_threshold:.0%}, longshot={self.longshot_min:.0%}-{self.longshot_max:.0%}", flush=True)
        logger.info(f"Risk: kelly={self.kelly_fraction}, max_pos=${self.max_position_usd}, max_daily_loss=${MAX_DAILY_LOSS_USD}")
    
    def _init_clob_client(self):
        """Initialize CLOB client for live trading."""
        if not CLOB_AVAILABLE or not POLYGON_PRIVATE_KEY:
            logger.error("Cannot init CLOB client - missing dependencies or key")
            self.live_trading = False
            return
        
        try:
            self.clob_client = ClobClient(
                host=CLOB_API,
                chain_id=137,  # Polygon mainnet
                key=POLYGON_PRIVATE_KEY
            )
            # Create or derive API credentials
            creds = self.clob_client.create_or_derive_api_creds()
            self.clob_client.set_api_creds(creds)
            logger.info("CLOB client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to init CLOB client: {e}")
            self.live_trading = False

    def _init_onchain_sync(self):
        """Initialize on-chain balance sync helpers."""
        if not WEB3_AVAILABLE or not POLYGON_PRIVATE_KEY:
            return

        try:
            self.wallet_address = Account.from_key(POLYGON_PRIVATE_KEY).address
            rpc_url = os.getenv("POLYGON_RPC_URL", "https://polygon-rpc.com")
            w3 = Web3(Web3.HTTPProvider(rpc_url))
            if not w3.is_connected():
                logger.warning("On-chain sync disabled: RPC not reachable (%s)", rpc_url)
                return

            # Polymarket uses the ConditionalTokens (ERC-1155) contract on Polygon.
            ctf_address = os.getenv("CTF_CONTRACT_ADDRESS", "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045")
            abi = [{
                "constant": True,
                "inputs": [
                    {"name": "accounts", "type": "address[]"},
                    {"name": "ids", "type": "uint256[]"},
                ],
                "name": "balanceOfBatch",
                "outputs": [{"name": "", "type": "uint256[]"}],
                "stateMutability": "view",
                "type": "function",
            }]
            self.ctf_contract = w3.eth.contract(address=w3.to_checksum_address(ctf_address), abi=abi)
            logger.info("On-chain sync enabled for wallet %s", self.wallet_address)
        except Exception as e:
            logger.warning("Failed to init on-chain sync: %s", e)
            self.wallet_address = None
            self.ctf_contract = None
    
    def check_safety_limits(self) -> bool:
        """Check if we should stop trading due to safety limits."""
        # Emergency stop flag file (set by scripts/emergency_stop.py).
        if EMERGENCY_STOP_FLAG.exists():
            logger.warning(f"Emergency stop flag detected: {EMERGENCY_STOP_FLAG}")
            return False

        # Kill switch
        if KILL_SWITCH:
            logger.warning("KILL SWITCH ACTIVATED - stopping all trading")
            return False
        
        # Reset daily P&L at midnight
        now = datetime.now()
        if now.date() > self.daily_reset_time.date():
            self.daily_pnl = 0.0
            self.daily_reset_time = now.replace(hour=0, minute=0, second=0)
            logger.info("Daily P&L reset")
        
        # Check daily loss limit
        if self.daily_pnl < -MAX_DAILY_LOSS_USD:
            logger.warning(f"Daily loss limit hit: ${self.daily_pnl:.2f} < -${MAX_DAILY_LOSS_USD}")
            return False
        
        return True
    
    def _load_config(self, path: str) -> dict:
        try:
            with open(path, 'r') as f:
                return yaml.safe_load(f) or {}
        except:
            return {}
    
    def _init_db(self):
        """Create trades table if not exists."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path))
        conn.execute('''
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                model TEXT NOT NULL,
                market_id TEXT NOT NULL,
                market_question TEXT,
                side TEXT NOT NULL,
                entry_price REAL NOT NULL,
                size_usd REAL NOT NULL,
                shares REAL NOT NULL,
                status TEXT DEFAULT 'open',
                exit_price REAL,
                exit_timestamp TEXT,
                pnl REAL,
                notes TEXT,
                token_id TEXT
            )
        ''')
        # Backfill schema for existing DBs created before token_id existed.
        cols = {row[1] for row in conn.execute("PRAGMA table_info(trades)").fetchall()}
        if "token_id" not in cols:
            conn.execute("ALTER TABLE trades ADD COLUMN token_id TEXT")
        conn.commit()
        conn.close()
    
    def _load_positions(self):
        """Load open positions from database."""
        try:
            conn = sqlite3.connect(str(self.db_path))
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, market_id, market_question, side, entry_price, size_usd, shares, token_id
                FROM trades WHERE status = 'open' AND model = ?
            ''', (self.model_name,))
            
            for row in cursor.fetchall():
                entry_price = row[4]
                self.positions[str(row[0])] = {
                    'trade_id': row[0],
                    'market_id': row[1],
                    'market_question': row[2],
                    'side': row[3],
                    'entry_price': entry_price,
                    'size_usd': row[5],
                    'shares': row[6],
                    'token_id': row[7],
                    'high_water': entry_price  # Initialize high water mark
                }
            conn.close()
        except Exception as e:
            logger.error(f"Failed to load positions: {e}")
    
    async def fetch_all_markets(self) -> List[Dict]:
        """Fetch all active markets from Polymarket."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                markets: List[Dict] = []
                page_size = 500
                seen_first_id = None
                max_markets = max(page_size, self.market_fetch_limit)

                for offset in range(0, max_markets, page_size):
                    response = await client.get(
                        f"{GAMMA_API}/markets",
                        params={
                            "limit": page_size,
                            "offset": offset,
                            "active": "true",
                            "closed": "false",
                        },
                    )
                    response.raise_for_status()
                    batch = response.json() if isinstance(response.json(), list) else []
                    if not batch:
                        break

                    # Guard against APIs that ignore offset and keep returning page 1.
                    first_id = batch[0].get("id")
                    if offset > 0 and first_id and first_id == seen_first_id:
                        logger.warning("Gamma offset pagination appears unsupported; stopping at %s markets", len(markets))
                        break
                    if seen_first_id is None:
                        seen_first_id = first_id

                    markets.extend(batch)
                    if len(batch) < page_size:
                        break

                return markets
        except Exception as e:
            logger.error(f"Failed to fetch markets: {e}")
            return []

    def _extract_market_token_rows(self, markets: List[Dict]) -> Dict[str, Dict]:
        """Build token_id -> market metadata map from Gamma markets."""
        token_rows: Dict[str, Dict] = {}
        for market in markets:
            token_ids = market.get("clobTokenIds", "[]")
            if isinstance(token_ids, str):
                try:
                    token_ids = json.loads(token_ids)
                except Exception:
                    token_ids = []
            if not isinstance(token_ids, list):
                continue
            for idx, token_id in enumerate(token_ids[:2]):
                token_str = str(token_id)
                token_rows[token_str] = {
                    "market_id": market.get("id", "unknown"),
                    "market_question": market.get("question", "Synced from chain"),
                    "side": "YES" if idx == 0 else "NO",
                    "price": self.get_price(market, "YES" if idx == 0 else "NO"),
                }
        return token_rows

    def _fetch_onchain_balances(self, token_ids: List[str]) -> Dict[str, float]:
        """Read ERC-1155 balances in chunks to avoid provider rate-limit spikes."""
        if not self.ctf_contract or not self.wallet_address or not token_ids:
            return {}

        balances: Dict[str, float] = {}
        batch_size = max(1, self.sync_batch_size)
        for start in range(0, len(token_ids), batch_size):
            chunk = token_ids[start:start + batch_size]
            numeric_chunk = []
            for tid in chunk:
                try:
                    numeric_chunk.append((tid, int(tid)))
                except Exception:
                    continue
            if not numeric_chunk:
                continue
            accounts = [self.wallet_address] * len(numeric_chunk)
            ids = [item[1] for item in numeric_chunk]

            # Retry each chunk a few times before giving up.
            last_err = None
            for attempt in range(3):
                try:
                    values = self.ctf_contract.functions.balanceOfBatch(accounts, ids).call()
                    for (tid, _), value in zip(numeric_chunk, values):
                        balances[tid] = float(value) / 1_000_000.0
                    last_err = None
                    break
                except Exception as e:
                    last_err = e
                    wait = 1.5 * (attempt + 1)
                    logger.warning("balanceOfBatch retry %s for %s tokens (%s)", attempt + 1, len(numeric_chunk), e)
                    try:
                        import time
                        time.sleep(wait)
                    except Exception:
                        pass
            if last_err:
                logger.warning("Skipping token batch due to repeated RPC failures: %s", last_err)
        return balances

    def _sync_upsert_position(self, token_id: str, meta: Dict, shares: float):
        """Ensure a live on-chain holding has an open DB row and in-memory position."""
        market_id = meta.get("market_id", "unknown")
        market_question = meta.get("market_question", "Synced from chain")
        side = meta.get("side", "YES")
        current_price = meta.get("price") or 0.5

        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, entry_price, size_usd
            FROM trades
            WHERE status = 'open' AND model = ? AND token_id = ?
            ORDER BY timestamp DESC LIMIT 1
            """,
            (self.model_name, token_id),
        )
        row = cursor.fetchone()
        if not row:
            # Backfill token_id onto legacy open rows that predate token tracking.
            cursor.execute(
                """
                SELECT id, entry_price, size_usd
                FROM trades
                WHERE status = 'open' AND model = ? AND market_id = ? AND side = ? AND (token_id IS NULL OR token_id = '')
                ORDER BY timestamp DESC LIMIT 1
                """,
                (self.model_name, market_id, side),
            )
            row = cursor.fetchone()

        if row:
            trade_id = row[0]
            entry_price = float(row[1] or current_price or 0.5)
            size_usd = shares * entry_price
            cursor.execute(
                """
                UPDATE trades
                SET shares = ?, size_usd = ?, market_id = ?, market_question = ?, side = ?, token_id = ?
                WHERE id = ?
                """,
                (shares, size_usd, market_id, market_question, side, token_id, trade_id),
            )
        else:
            entry_price = float(current_price or 0.5)
            size_usd = shares * entry_price
            cursor.execute(
                """
                INSERT INTO trades
                (timestamp, model, market_id, market_question, side, entry_price, size_usd, shares, status, notes, token_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
                """,
                (
                    datetime.now().isoformat(),
                    self.model_name,
                    market_id,
                    market_question,
                    side,
                    entry_price,
                    size_usd,
                    shares,
                    "SYNC_DISCOVERED_ONCHAIN",
                    token_id,
                ),
            )
            trade_id = cursor.lastrowid
        conn.commit()
        conn.close()

        self.positions[str(trade_id)] = {
            "trade_id": trade_id,
            "market_id": market_id,
            "market_question": market_question,
            "side": side,
            "entry_price": float(entry_price),
            "size_usd": float(shares * float(entry_price)),
            "shares": float(shares),
            "token_id": token_id,
            "high_water": float(entry_price),
        }

    def sync_live_positions(self, markets: List[Dict]):
        """Sync local open positions against on-chain holdings for active market tokens."""
        if not self.live_trading or not self.ctf_contract or not self.wallet_address:
            return

        token_rows = self._extract_market_token_rows(markets)
        if not token_rows:
            return

        balances = self._fetch_onchain_balances(list(token_rows.keys()))
        if not balances:
            return

        # 1) Upsert any positive on-chain holdings.
        discovered = 0
        for token_id, shares in balances.items():
            if shares <= self.sync_min_shares:
                continue
            self._sync_upsert_position(token_id, token_rows[token_id], shares)
            discovered += 1

        # 2) Close tracked rows whose token was queried and is now near-zero.
        closed = 0
        for pos in list(self.positions.values()):
            token_id = str(pos.get("token_id") or "")
            if not token_id or token_id not in balances:
                continue
            if balances[token_id] <= self.sync_min_shares:
                price = token_rows.get(token_id, {}).get("price") or pos.get("entry_price", 0.5)
                self.close_trade(pos, price, "sync_zero_onchain_balance")
                closed += 1

        if discovered or closed:
            logger.info("On-chain sync: upserted=%s closed=%s tracked=%s", discovered, closed, len(self.positions))
    
    def get_price(self, market: Dict, side: str) -> Optional[float]:
        """Get current price for YES or NO."""
        try:
            prices = market.get('outcomePrices', '[]')
            if isinstance(prices, str):
                prices = json.loads(prices)
            if len(prices) >= 2:
                return float(prices[0]) if side == 'YES' else float(prices[1])
        except:
            pass
        return None
    
    def find_signal(self, market: Dict) -> Optional[Dict]:
        """
        Check if market has an extreme price worth trading.
        Based on Berg & Rietz (2018): longshots (5-20%) are underpriced.
        Returns signal dict or None.
        """
        # Check volume
        volume = float(market.get('volume', 0) or 0)
        if volume < self.min_volume:
            return None
        
        # Check time horizon - avoid markets ending soon (bias evaporates)
        end_date = market.get('endDate') or market.get('end_date_iso')
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                hours_left = (end_dt - datetime.now(end_dt.tzinfo)).total_seconds() / 3600
                if hours_left < self.min_hours_to_resolution:
                    return None  # Too close to resolution
            except:
                pass  # If we can't parse, continue
        
        # Get YES price
        yes_price = self.get_price(market, 'YES')
        if yes_price is None or yes_price <= 0 or yes_price >= 1:
            return None
        
        # Check for longshot in the sweet spot (5-20% per research)
        # Strategy: buy YES, expecting price is undervalued
        # Research shows these pay off more often than prices suggest
        if self.longshot_min <= yes_price <= self.longshot_max:
            # Edge calculation: research suggests ~20% more wins than price implies
            # Conservative: assume true prob is 1.2x the price
            implied_edge = 20.0  # Research-based edge estimate
            return {
                'side': 'YES',
                'price': yes_price,
                'edge': implied_edge,
                'reason': f'Longshot YES at {yes_price*100:.0f}% (research zone 5-20%)'
            }
        
        # Check for heavy favorite (YES > favorite_threshold)
        # Strategy: buy NO, these "sure things" fail more often than expected
        elif yes_price > self.favorite_threshold:
            no_price = 1 - yes_price
            if no_price >= 0.05:  # Don't buy NO below 5% either
                implied_edge = 15.0  # Slightly lower edge for favorites
                return {
                    'side': 'NO',
                    'price': no_price,
                    'edge': implied_edge,
                    'reason': f'Overconfident favorite at {yes_price*100:.0f}%, NO at {no_price*100:.0f}%'
                }
        
        return None
    
    def calculate_kelly_size(self, edge_pct: float, price: float, ai_confidence: float = 0.5) -> float:
        """
        Calculate position size using Kelly criterion.
        
        Kelly formula: f* = (bp - q) / b
        Where: b = odds (payout ratio), p = win probability, q = 1-p
        
        We use fractional Kelly (kelly_fraction) to reduce variance.
        """
        if price <= 0 or price >= 1:
            return 0
        
        # Implied odds from price
        b = (1 - price) / price  # e.g., price=0.20 -> b=4 (4:1 odds)
        
        # Estimate win probability from edge and AI confidence
        # Higher edge + higher AI confidence = higher estimated win prob
        base_win_prob = 0.50 + (edge_pct / 200)  # Edge gives base probability
        p = base_win_prob * (0.7 + 0.3 * ai_confidence)  # AI confidence adjusts
        p = max(0.1, min(0.9, p))  # Clamp between 10-90%
        q = 1 - p
        
        # Kelly formula
        kelly = (b * p - q) / b
        
        if kelly <= 0:
            return 0
        
        # Apply fractional Kelly and constraints
        position_size = self.bankroll * kelly * self.kelly_fraction
        position_size = min(position_size, self.max_position_usd)
        position_size = max(position_size, 10)  # Minimum $10 bet
        
        return round(position_size, 2)
    
    async def ai_evaluate(self, market: Dict, signal: Dict) -> Optional[Dict]:
        """
        Ask AI if this trade makes sense. Returns enhanced signal or None to reject.
        """
        if not OPENAI_API_KEY:
            return signal  # No API key, skip AI gate
        
        question = market.get('question', 'Unknown')
        description = market.get('description', '')[:500]
        end_date = market.get('endDate', 'Unknown')
        
        prompt = f"""You're evaluating a prediction market trade based on the "longshot bias" research.

Market: {question}
Description: {description}
End Date: {end_date}
Trade: Buy {signal['side']} at {signal['price']*100:.0f}%

Research basis: Studies show low-priced contracts (5-20%) are systematically underpriced - 
they win more often than prices suggest due to overconfidence bias.

Evaluate this trade:
1. Is this a genuine uncertain event (not already decided/stale)?
2. Is the low price due to uncertainty (good) or near-certain failure (bad)?
3. Does the market have enough time left (>48 hours)?
4. Any red flags (resolved, meme market, manipulation)?

Respond with JSON only:
{{"approve": true/false, "confidence": 0.0-1.0, "reason": "brief reason"}}"""

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                    json={
                        "model": "gpt-4o",
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,
                        "max_tokens": 150
                    }
                )
                resp.raise_for_status()
                
                content = resp.json()['choices'][0]['message']['content']
                # Parse JSON from response
                content = content.strip()
                if content.startswith('```'):
                    content = content.split('\n', 1)[1].rsplit('```', 1)[0]
                
                result = json.loads(content)
                
                if result.get('approve', False):
                    signal['ai_confidence'] = result.get('confidence', 0.5)
                    signal['ai_reason'] = result.get('reason', '')
                    signal['reason'] += f" | AI: {signal['ai_reason']}"
                    logger.info(f"AI approved: {question[:40]}... ({signal['ai_confidence']:.0%})")
                    return signal
                else:
                    logger.info(f"AI rejected: {question[:40]}... - {result.get('reason', 'no reason')}")
                    return None
                    
        except Exception as e:
            logger.warning(f"AI evaluation failed: {e}, proceeding without")
            return signal  # Fail open - if AI fails, still allow trade
    
    def should_close(self, position: Dict, current_price: float) -> Optional[Dict]:
        """
        Check if position should be closed using trailing stop logic.
        
        - Stop loss at -50% (always active)
        - Once up +50%, activate trailing stop
        - Trailing stop follows 25% behind high water mark
        """
        entry = position['entry_price']
        if entry <= 0:
            return None
        
        pnl_pct = ((current_price - entry) / entry) * 100
        
        # Update high water mark
        high_water = position.get('high_water', entry)
        if current_price > high_water:
            high_water = current_price
            position['high_water'] = high_water
        
        high_water_pnl = ((high_water - entry) / entry) * 100
        
        # Stop loss - always active
        if pnl_pct <= self.stop_loss_pct:
            return {'reason': f'Stop loss {pnl_pct:.0f}%', 'price': current_price}
        
        # Trailing stop - only active once we've hit activation threshold
        if high_water_pnl >= self.trailing_activation_pct:
            # Calculate trailing stop level
            trailing_stop_price = high_water * (1 - self.trailing_distance_pct / 100)
            trailing_stop_pnl = ((trailing_stop_price - entry) / entry) * 100
            
            if current_price <= trailing_stop_price:
                return {
                    'reason': f'Trailing stop +{pnl_pct:.0f}% (peak was +{high_water_pnl:.0f}%)',
                    'price': current_price
                }
        
        return None
    
    def open_trade(self, market: Dict, signal: Dict) -> bool:
        """Open a new trade using Kelly-sized position."""
        market_id = market.get('id', 'unknown')
        
        # Check if we already have this market
        for pos in self.positions.values():
            if pos['market_id'] == market_id:
                return False
        
        # Check max positions
        if len(self.positions) >= self.max_positions:
            return False
        
        # Calculate position size using Kelly criterion
        edge = signal.get('edge', 10)
        ai_confidence = signal.get('ai_confidence', 0.5)
        position_size = self.calculate_kelly_size(edge, signal['price'], ai_confidence)
        
        # Check total exposure
        current_exposure = sum(p['size_usd'] for p in self.positions.values())
        if current_exposure + position_size > self.max_total_exposure:
            return False
        
        # Check bankroll
        if position_size > self.bankroll:
            return False
        
        entry_price = signal['price']
        shares = position_size / entry_price
        clob_token_ids = market.get('clobTokenIds', '[]')
        if isinstance(clob_token_ids, str):
            try:
                clob_token_ids = json.loads(clob_token_ids)
            except Exception:
                clob_token_ids = []
        token_id = None
        if isinstance(clob_token_ids, list) and len(clob_token_ids) >= 2:
            token_id = str(clob_token_ids[0] if signal['side'] == 'YES' else clob_token_ids[1])
        
        # LIVE TRADING: Place actual order via CLOB
        order_id = None
        if self.live_trading and self.clob_client:
            order_id = self._place_live_order(market, signal, shares)
            if not order_id:
                logger.error(f"Failed to place live order for {market.get('question', '')[:30]}")
                return False
        
        # Save to database
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO trades (timestamp, model, market_id, market_question, side, entry_price, size_usd, shares, status, notes, token_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
        ''', (
            datetime.now().isoformat(),
            self.model_name,
            market_id,
            market.get('question', 'Unknown'),
            signal['side'],
            entry_price,
            position_size,
            shares,
            signal['reason'] + (f" | order_id:{order_id}" if order_id else " | PAPER"),
            token_id,
        ))
        trade_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        # Track in memory
        self.positions[str(trade_id)] = {
            'trade_id': trade_id,
            'market_id': market_id,
            'market_question': market.get('question', 'Unknown'),
            'side': signal['side'],
            'entry_price': entry_price,
            'size_usd': position_size,
            'shares': shares,
            'token_id': token_id,
            'order_id': order_id,
            'high_water': entry_price  # For trailing stop
        }
        
        self.bankroll -= position_size
        
        mode = "LIVE" if self.live_trading else "PAPER"
        logger.info(f"[{mode}] OPEN: {signal['side']} ${position_size:.0f} @ {entry_price*100:.1f}% - {market.get('question', '')[:50]}")
        return True
    
    def _place_live_order(self, market: Dict, signal: Dict, shares: float) -> Optional[str]:
        """Place a live order via CLOB API with price buffer for better fills."""
        try:
            # Get token ID for the outcome
            clob_token_ids = market.get('clobTokenIds', '[]')
            if isinstance(clob_token_ids, str):
                clob_token_ids = json.loads(clob_token_ids)
            
            if not clob_token_ids or len(clob_token_ids) < 2:
                logger.error(f"No CLOB token IDs for market {market.get('id')}")
                return None
            
            # YES = index 0, NO = index 1
            token_id = clob_token_ids[0] if signal['side'] == 'YES' else clob_token_ids[1]
            
            # Add 2% buffer to price for better fill probability
            # Market-like order - bid high to fill immediately
            base_price = signal['price']
            # Add 50% or 10 cents to sweep the order book
            buffer_price = min(base_price * 1.50, base_price + 0.10)
            buffer_price = round(buffer_price, 3)
            
            # Cap at 0.99 to avoid issues
            buffer_price = min(buffer_price, 0.99)
            logger.info(f"Market fill: signal {base_price:.3f} -> bid {buffer_price:.3f}")
            
            # Place limit order with buffer price
            order_args = OrderArgs(
                token_id=token_id,
                price=buffer_price,
                size=shares,
                side="BUY"
            )
            
            response = self.clob_client.create_and_post_order(order_args)
            
            if response and response.get('orderID'):
                logger.info(f"Live order placed: {response['orderID']} at {buffer_price} (signal: {base_price})")
                return response['orderID']
            else:
                logger.error(f"Order response: {response}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to place live order: {e}")
            return None
    
    def close_trade(self, position: Dict, exit_price: float, reason: str):
        """Close a trade and record P&L."""
        pnl = (position['shares'] * exit_price) - position['size_usd']
        
        # LIVE TRADING: Place sell order via CLOB
        sell_order_id = None
        if self.live_trading and self.clob_client:
            sell_order_id = self._place_live_sell(position, exit_price)
            if not sell_order_id:
                logger.warning(f"Failed to place live sell for position {position['trade_id']}")
                # Continue anyway - we'll try again next cycle
        
        conn = sqlite3.connect(str(self.db_path))
        conn.execute('''
            UPDATE trades SET status = 'closed', exit_price = ?, exit_timestamp = ?, pnl = ?, notes = notes || ' | ' || ?
            WHERE id = ?
        ''', (exit_price, datetime.now().isoformat(), pnl, reason + (f" | sell:{sell_order_id}" if sell_order_id else ""), position['trade_id']))
        conn.commit()
        conn.close()
        
        self.bankroll += position['shares'] * exit_price
        self.daily_pnl += pnl  # Track for safety limits
        del self.positions[str(position['trade_id'])]
        
        mode = "LIVE" if self.live_trading else "PAPER"
        logger.info(f"[{mode}] CLOSE: {position['side']} @ {exit_price*100:.1f}% - P&L: ${pnl:+.2f} - {reason}")
    
    def _cancel_stale_orders(self):
        """Cancel orders that have been pending too long (10+ minutes)."""
        if not self.live_trading or not self.clob_client:
            return
        
        try:
            # Get all open orders
            open_orders = self.clob_client.get_orders()
            if not open_orders:
                return
            
            now = datetime.now()
            stale_minutes = 10  # Cancel orders older than 10 minutes
            cancelled = 0
            
            for order in open_orders:
                # Check if order is old
                created_at = order.get('createdAt') or order.get('created_at')
                if not created_at:
                    continue
                
                try:
                    order_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    age_minutes = (now - order_time.replace(tzinfo=None)).total_seconds() / 60
                    
                    if age_minutes > stale_minutes:
                        order_id = order.get('orderID') or order.get('id')
                        if order_id:
                            self.clob_client.cancel(order_id)
                            logger.info(f"Cancelled stale order {order_id[:20]}... (age: {age_minutes:.0f} min)")
                            cancelled += 1
                except Exception as e:
                    continue
            
            if cancelled > 0:
                logger.info(f"Cancelled {cancelled} stale orders")
                
        except Exception as e:
            logger.warning(f"Error checking stale orders: {e}")
    
    def _place_live_sell(self, position: Dict, price: float) -> Optional[str]:
        """Place a live sell order via CLOB API."""
        try:
            token_id = position.get('token_id')
            if not token_id:
                logger.error("Cannot place live sell without token_id")
                return None
            
            order_args = OrderArgs(
                token_id=token_id,
                price=price,
                size=position['shares'],
                side="SELL"
            )
            
            response = self.clob_client.create_and_post_order(order_args)
            
            if response and response.get('orderID'):
                return response['orderID']
            return None
                
        except Exception as e:
            logger.error(f"Failed to place live sell: {e}")
            return None
    
    async def run_cycle(self):
        """Run one scan cycle."""
        print(f"[{datetime.now().isoformat()}] Starting scan cycle...", flush=True)
        
        # Safety checks
        if not self.check_safety_limits():
            print("Safety limits triggered - skipping cycle", flush=True)
            return
        
        # Cancel stale unfilled orders (older than 10 min)
        self._cancel_stale_orders()
        
        markets = await self.fetch_all_markets()
        print(f"Fetched {len(markets)} markets, checking {len(self.positions)} positions", flush=True)

        self._cycle_count += 1
        if self.sync_every_cycles > 0 and (self._cycle_count % self.sync_every_cycles == 0):
            self.sync_live_positions(markets)
        
        # Build market lookup
        market_lookup = {m.get('id'): m for m in markets if m.get('id')}
        market_by_question = {m.get('question', ''): m for m in markets}
        
        # 1. Check exits on existing positions
        closed = 0
        
        # Stale year patterns - "in 2025", "by 2025", etc. but NOT "2025-2026" (current seasons)
        import re
        current_year = datetime.now().year
        stale_patterns = []
        for y in range(2020, current_year):
            stale_patterns.extend([
                f"in {y}",
                f"by {y}",
                f"before {y}",
                f"during {y}",
                f"end of {y}",
            ])
        
        for pos in list(self.positions.values()):
            market = market_lookup.get(pos['market_id']) or market_by_question.get(pos['market_question'])
            if not market:
                continue
            
            current = self.get_price(market, pos['side'])
            if current is None:
                continue
            
            # Auto-close positions in past-year markets (but allow "2025-2026" season markets)
            question = pos.get('market_question', '').lower()
            if any(pattern in question for pattern in stale_patterns):
                logger.info(f"Closing stale market position: {pos.get('market_question', '')[:50]}...")
                self.close_trade(pos, current, "stale_market_year")
                closed += 1
                continue
            
            close_signal = self.should_close(pos, current)
            if close_signal:
                self.close_trade(pos, close_signal['price'], close_signal['reason'])
                closed += 1
        
        # 2. Look for new entries (with AI gate)
        opened = 0
        candidates = []
        
        for market in markets:
            question = market.get('question', '').lower()
            
            # Skip markets about past years (but allow "2025-2026" season markets)
            if any(pattern in question for pattern in stale_patterns):
                continue
            
            signal = self.find_signal(market)
            if signal:
                candidates.append((market, signal))
        
        logger.info(f"Found {len(candidates)} candidates, running AI evaluation...")
        
        ai_evaluated = 0
        for market, signal in candidates:
            # Check if we can still open positions
            if len(self.positions) >= self.max_positions:
                break
            
            # AI gate - with rate limiting (max 5 per cycle, 1 sec delay)
            if ai_evaluated >= 15:
                logger.info(f"Reached AI eval limit, stopping early")
                break
            
            ai_evaluated += 1
            await asyncio.sleep(5.0)  # Rate limit: 5 sec between OpenAI calls
            
            approved_signal = await self.ai_evaluate(market, signal)
            if approved_signal and self.open_trade(market, approved_signal):
                opened += 1
                break  # Only open 1 per cycle to be conservative
        
        logger.info(f"Cycle done: {opened} opened, {closed} closed, {ai_evaluated} AI evaluated, {len(self.positions)} positions, ${self.bankroll:.0f} bankroll")
    
    async def run(self):
        """Main loop."""
        logger.info(f"Starting trader, scanning every {self.check_interval}s")
        trigger_file = BASE_DIR / 'data' / 'trigger_cycle'
        
        while True:
            try:
                await self.run_cycle()
            except Exception as e:
                logger.error(f"Cycle error: {e}")
            
            # Check for manual trigger every second instead of sleeping full interval
            for _ in range(self.check_interval):
                if trigger_file.exists():
                    logger.info("Manual trigger detected, running cycle now")
                    trigger_file.unlink()
                    break
                await asyncio.sleep(1)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', default='paper')
    parser.add_argument('--config', required=True)
    parser.add_argument('--model', required=True)
    args = parser.parse_args()
    
    logger.info(f"=== POLYMARKET MEAN REVERSION TRADER ({args.model}) ===")
    trader = MeanReversionTrader(args.model, args.config)
    await trader.run()


if __name__ == "__main__":
    asyncio.run(main())
