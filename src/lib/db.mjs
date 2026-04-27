import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./paths.mjs";

export const DB_NAMES = ["trader", "conservative", "moderate", "aggressive"];

function openDb(name) {
  const p = join(dataDir, `trades_${name}.db`);
  if (!existsSync(p)) return null;
  try {
    return new Database(p, { readonly: true });
  } catch {
    return null;
  }
}

function openReadWrite(name) {
  mkdirSync(dataDir, { recursive: true });
  const p = join(dataDir, `trades_${name}.db`);
  return new Database(p);
}

const rowToTrade = (r) => ({
  market: r.market_question || "Unknown",
  direction: r.side,
  entry_price: r.entry_price,
  size: r.size_usd,
  timestamp: r.timestamp,
  status: r.status,
  pnl: r.pnl,
  notes: r.notes,
  exit_price: r.exit_price,
  model: r.model || "trader",
  id: r.id,
});

export function getAllTrades(limit = 200) {
  const trades = [];
  for (const name of DB_NAMES) {
    const db = openDb(name);
    if (!db) continue;
    try {
      const rows = db
        .prepare(
          `SELECT id, market_question, side, entry_price, size_usd, timestamp, status, pnl, notes, exit_price, model
           FROM trades ORDER BY timestamp DESC LIMIT ?`
        )
        .all(Math.max(1, limit));
      for (const r of rows) trades.push(rowToTrade(r));
    } catch {
      /* skip bad db */
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }
  trades.sort(
    (a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || ""))
  );
  return trades.slice(0, limit);
}

export function getStats() {
  let total = 0;
  let openCount = 0;
  let closedCount = 0;
  let totalPnl = 0;
  let lastTrade = null;

  for (const name of DB_NAMES) {
    const db = openDb(name);
    if (!db) continue;
    try {
      total += db.prepare("SELECT COUNT(*) as c FROM trades").get().c || 0;
      openCount +=
        db
          .prepare("SELECT COUNT(*) as c FROM trades WHERE status = 'open'")
          .get().c || 0;
      closedCount +=
        db
          .prepare("SELECT COUNT(*) as c FROM trades WHERE status = 'closed'")
          .get().c || 0;
      const s =
        db
          .prepare(
            "SELECT COALESCE(SUM(pnl),0) as s FROM trades WHERE status = 'closed' AND pnl IS NOT NULL"
          )
          .get().s || 0;
      totalPnl += s;
      const t = db
        .prepare("SELECT timestamp FROM trades ORDER BY timestamp DESC LIMIT 1")
        .get();
      if (t?.timestamp && (!lastTrade || t.timestamp > lastTrade))
        lastTrade = t.timestamp;
    } catch {
      /* ignore */
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }
  return {
    total_trades: total,
    open_positions: openCount,
    closed_trades: closedCount,
    realized_pnl: totalPnl,
    last_trade: lastTrade,
  };
}

export function getOpenPositionRows() {
  const positions = [];
  for (const name of DB_NAMES) {
    const db = openDb(name);
    if (!db) continue;
    try {
      const rows = db
        .prepare(
          `SELECT market_id, market_question, side, entry_price, size_usd, model
           FROM trades WHERE status = 'open'`
        )
        .all();
      for (const r of rows) {
        positions.push({
          market_id: r.market_id,
          question: r.market_question,
          side: r.side,
          entry: r.entry_price,
          size: r.size_usd,
          model: r.model || name,
        });
      }
    } catch {
      /* */
    } finally {
      try {
        db.close();
      } catch {
        /* */
      }
    }
  }
  return positions;
}

/** Aggregate per-model performance for /api/models and /api/comparison */
export function getModelStats() {
  const models = [];

  for (const name of DB_NAMES) {
    const db = openDb(name);
    if (!db) continue;
    try {
      const displayName = name.charAt(0).toUpperCase() + name.slice(1);

      const totalTrades = db
        .prepare("SELECT COUNT(*) c FROM trades")
        .get().c;
      const closed = db
        .prepare("SELECT pnl FROM trades WHERE status = 'closed' AND pnl IS NOT NULL")
        .all();
      const openPos = db
        .prepare("SELECT COUNT(*) c FROM trades WHERE status = 'open'")
        .get().c;
      const sumClosedPnl =
        db
          .prepare(
            "SELECT COALESCE(SUM(pnl),0) s FROM trades WHERE status = 'closed' AND pnl IS NOT NULL"
          )
          .get().s || 0;
      const wins = closed.filter((r) => (r.pnl || 0) > 0).length;
      const losses = closed.length - wins;
      const winRate = closed.length ? (wins / closed.length) * 100 : 0;
      const avgPnl = closed.length ? sumClosedPnl / closed.length : 0;

      const today = new Date().toISOString().split("T")[0];
      const likeToday = `${today}%`;
      const todayRows = db
        .prepare(`SELECT pnl FROM trades WHERE timestamp LIKE ?`)
        .all(likeToday);
      const todayPnl = todayRows.reduce((s, r) => s + (r.pnl || 0), 0);
      const todayTrades = db
        .prepare(`SELECT COUNT(*) c FROM trades WHERE timestamp LIKE ?`)
        .get(likeToday).c;

      models.push({
        model: displayName,
        total_trades: totalTrades || 0,
        total_pnl: sumClosedPnl,
        win_rate: winRate,
        winners: wins,
        losers: losses,
        open_positions: openPos || 0,
        avg_pnl: avgPnl,
        today_trades: todayTrades || 0,
        today_pnl: todayPnl,
        status: (openPos || 0) > 0 ? "Active" : "Idle",
      });
    } catch {
      /* */
    } finally {
      try {
        db.close();
      } catch {
        /* */
      }
    }
  }

  if (models.length === 0) {
    return [
      {
        model: "trader",
        total_trades: 0,
        total_pnl: 0,
        win_rate: 0,
        winners: 0,
        losers: 0,
        open_positions: 0,
        avg_pnl: 0,
        today_trades: 0,
        today_pnl: 0,
        status: "Idle",
      },
    ];
  }
  return models;
}

export { openReadWrite };
