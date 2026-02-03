# Why Some Positions Don’t Show in the DB / Return Wrong

Planning note: why the Polymarket UI can show more positions than our DB, and why values can differ.

---

## How We Build the DB Today

1. **Source of positions:** We only consider tokens that appear in **CLOB `get_trades()`** (trade history for this API key/wallet). We net BUY/SELL by `token_id` → `positions_from_trades` → `active_positions` (shares > 0.5).
2. **On-chain check:** For each of those token_ids we call `balanceOf` and get price. Result → `verified_positions`.
3. **DB updates:** We close rows with 0 on-chain, update share counts, and **add rows only for token_ids that are in `verified_positions`**. And `verified_positions` only contains token_ids that were already in `active_positions` (i.e. in trade history).

So: **we never create DB rows for token_ids we hold on-chain but that never appeared in `get_trades()`.**

---

## Why “Rest of Positions” Aren’t Picked Up

1. **Trade-history–only discovery**  
   If a position was opened **outside** the bot (e.g. manual buy on the Polymarket site, or another integration), it may not appear in `get_trades()` (e.g. pagination, filters, or different order flow). We never put that token_id in `active_positions`, so we never check its on-chain balance in the sync loop and never add it to the DB.  
   Polymarket UI shows **all** on-chain positions for the wallet; we only show positions we derived from **our** trade history.

2. **RPC rate limiting**  
   When we call `balanceOf` for each token, some calls can fail (e.g. “Too many requests”). For those tokens we don’t get a balance, so we don’t add them to `verified_positions` or we treat them as 0. So we can miss updating or adding positions when the RPC is throttling.

3. **Closed in DB, still on-chain**  
   If we marked a position closed (e.g. `sync_closed`) because at sync time we saw 0 on-chain, but the wallet actually still had balance (e.g. sell failed or was partial, or RPC returned wrong), then Polymarket will still show it and we won’t.

4. **Different “open” definition**  
   We only add orphans for token_ids that are in **trade history** and then pass the on-chain check. We have no step that says “list all token_ids this wallet holds (e.g. from chain) and ensure each has a row.” So any position that never made it into `get_trades()` will never be “picked up” by the current sync.

---

## Why “Returning Correct” Can Be Wrong

- **Missing positions:** If 4 of 7 UI positions aren’t in the DB, our totals and exit logic (stop loss / trailing stop) don’t include them. So we don’t manage or sell them.
- **Value/PnL:** We use `shares * current_price` with price from CLOB. Polymarket may use a different price (e.g. mid, or their own feed), so values can differ slightly.
- **Shares:** We use on-chain balance in `_place_live_sell` and in sync. If sync failed for a token (rate limit) or we never added the row, we can show wrong shares or no row at all.

---

## Strategy to Align DB with UI (Planning)

1. **Discover all held token_ids (not only from trade history)**  
   - **Option A:** Use a “positions” or “balances” API from Polymarket/CLOB if it returns all conditional token balances for the wallet. Then for each token_id with balance > 0, ensure we have a row (add if missing, update shares).  
   - **Option B:** From Gamma (or similar), get a list of active markets and their `clobTokenIds`. For each token_id, call `balanceOf(wallet, token_id)`. Expensive and rate-limited, but would find any position in known markets.  
   - **Option C:** Index CTF `TransferSingle`/`TransferBatch` events to our wallet to get token_ids we’ve ever received; then check current balance for each. Most complete, but needs an indexer or log scan.

2. **Treat on-chain as source of truth for “what we hold”**  
   Once we have a list of (token_id, balance) for the wallet:  
   - Add or update DB rows so every token with balance > 0 has an open position row with correct shares.  
   - Mark as closed any DB row whose token_id has 0 balance on-chain.

3. **Reduce rate-limit impact**  
   In `full_sync.py`: longer delays between RPC calls, retries with backoff, and/or multiple RPC endpoints. Optionally cache recent `balanceOf` results so we don’t re-query every run for unchanged tokens.

4. **Reconcile with trade history for metadata**  
   When we add a row for a token_id we didn’t get from trade history, we have no `condition_id` or market_question. We can leave `market_question` as “Synced from chain” and still run exit logic (we get price via CLOB by token_id in `get_current_price_for_position`). Optionally: try to resolve token_id → market via Gamma/CLOB for a human-readable label.

---

## Summary

- **Not picked up:** We only consider token_ids from CLOB `get_trades()`. Positions opened outside that (e.g. manual) or missed by pagination/filters never get a row. Rate limits can also prevent us from verifying some tokens.  
- **Not returning correct:** Missing rows → wrong totals and no exit logic for those positions. Price/source differences → small value differences.  
- **Fix (planning):** Add a path that discovers “all token_ids this wallet holds” (API, Gamma scan, or events), then merge that into the DB (add missing, update shares, close when 0) and harden sync against rate limits.
