import "dotenv/config";
import { readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import yaml from "js-yaml";
import Database from "better-sqlite3";
import OpenAI from "openai";
import { fetchGammaMarkets } from "./lib/gamma.mjs";
import { rootDir, dataDir } from "./lib/paths.mjs";

const EMERGENCY = join(dataDir, "EMERGENCY_STOP");
const TRIGGER = join(dataDir, "trigger_cycle");

const KILL = process.env.KILL_SWITCH === "true";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

function loadConfig(path) {
  try {
    const raw = readFileSync(path, "utf8");
    return yaml.load(raw) || {};
  } catch {
    return {};
  }
}

function getPrice(market, side) {
  let prices = market.outcomePrices || "[]";
  if (typeof prices === "string") {
    try {
      prices = JSON.parse(prices);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(prices) || prices.length < 2) return null;
  const y = parseFloat(prices[0]);
  const n = parseFloat(prices[1]);
  if (side === "YES") return y;
  if (side === "NO") return n;
  return null;
}

function findSignal(m, cfg) {
  const vol = parseFloat(m.volume || 0) || 0;
  const minVol = 10000;
  if (vol < minVol) return null;

  const signals = cfg.signals?.mean_reversion || {};
  const fav = signals.favorite_threshold ?? 0.75;
  const longMin = signals.longshot_min ?? 0.05;
  const longMax = signals.longshot_max ?? 0.2;

  const yes = getPrice(m, "YES");
  if (yes == null || yes <= 0 || yes >= 1) return null;

  if (yes >= longMin && yes <= longMax) {
    return {
      side: "YES",
      price: yes,
      edge: 20,
      reason: `Longshot YES at ${(yes * 100).toFixed(0)}%`,
    };
  }
  if (yes > fav) {
    const noPrice = getPrice(m, "NO");
    if (noPrice != null && noPrice >= 0.05) {
      return {
        side: "NO",
        price: noPrice,
        edge: 15,
        reason: `Favorite ${(yes * 100).toFixed(0)}%, buy NO`,
      };
    }
  }
  return null;
}

function kellySize(edgePct, price, bankroll, kellyFrac, maxPos, aiConf = 0.5) {
  if (price <= 0 || price >= 1) return 0;
  const b = (1 - price) / price;
  let p = 0.5 + edgePct / 200;
  p *= 0.7 + 0.3 * aiConf;
  p = Math.max(0.1, Math.min(0.9, p));
  const q = 1 - p;
  let k = (b * p - q) / b;
  if (k <= 0) return 0;
  let size = bankroll * k * kellyFrac;
  size = Math.min(size, maxPos);
  size = Math.max(size, 10);
  return Math.round(size * 100) / 100;
}

async function aiGate(market, signal, openai) {
  if (!openai) return signal;
  const question = market.question || "";
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `Prediction market trade. Market: ${question}\nProposed: Buy ${signal.side} at ${(signal.price * 100).toFixed(0)}%.\nReply JSON: {"approve":true/false,"confidence":0.5,"reason":"short"}`,
        },
      ],
    });
    const j = JSON.parse(r.choices[0]?.message?.content || "{}");
    if (!j.approve) {
      console.log(`AI rejected: ${j.reason || "no reason"}`);
      return null;
    }
    return { ...signal, ai_confidence: j.confidence ?? 0.5 };
  } catch (e) {
    console.warn("AI gate error", e.message);
    return signal;
  }
}

function ensureSchema(db) {
  db.exec(`
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
    );
    CREATE INDEX IF NOT EXISTS idx_status ON trades(status);
  `);
}

async function main() {
  const configPath = join(rootDir, "config", "trader.yaml");
  const cfg = loadConfig(configPath);
  const modelName = cfg.trading?.model_name || "trader";
  const dbRel = cfg.data?.db_path || `data/trades_${modelName}.db`;
  const dbPath = join(rootDir, dbRel.replace(/^\//, ""));
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  ensureSchema(db);

  const risk = cfg.risk || {};
  let bankroll = parseFloat(risk.bankroll || 500);
  const kellyFrac = risk.kelly_fraction ?? 0.2;
  const maxPos = risk.max_position_usd ?? 50;
  const maxPositions = risk.max_positions ?? 40;
  const maxExposure = risk.max_total_exposure_usd ?? 500;
  const intervalSec =
    cfg.execution?.check_interval_seconds ?? 300;
  const fetchLimit = cfg.execution?.market_fetch_limit ?? 500;

  const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

  console.log(
    `Mean reversion trader (paper) model=${modelName} interval=${intervalSec}s`
  );

  async function cycle() {
    if (existsSync(EMERGENCY) || KILL) {
      console.warn("Stopped: emergency or kill switch");
      return;
    }
    if (existsSync(TRIGGER)) {
      try {
        unlinkSync(TRIGGER);
      } catch {
        /* */
      }
      console.log("Manual trigger_cycle");
    }

    const open = db
      .prepare("SELECT COUNT(*) c FROM trades WHERE status = 'open'")
      .get().c;
    if (open >= maxPositions) return;

    let markets;
    try {
      markets = await fetchGammaMarkets({ limit: fetchLimit });
    } catch (e) {
      console.error("fetch markets", e);
      return;
    }

    let exposure =
      db
        .prepare(
          "SELECT COALESCE(SUM(size_usd),0) s FROM trades WHERE status = 'open'"
        )
        .get().s || 0;

    let opened = 0;
    let openCount = open;
    for (const m of markets) {
      if (openCount >= maxPositions) break;
      const sig = findSignal(m, cfg);
      if (!sig) continue;

      const mid = String(m.id || "");
      const dup = db
        .prepare(
          "SELECT 1 FROM trades WHERE status = 'open' AND market_id = ? LIMIT 1"
        )
        .get(mid);
      if (dup) continue;

      const gated = await aiGate(m, sig, openai);
      if (!gated) continue;

      const aiConf = gated.ai_confidence ?? 0.5;
      const sizeUsd = kellySize(
        gated.edge,
        gated.price,
        bankroll,
        kellyFrac,
        maxPos,
        aiConf
      );
      if (sizeUsd <= 0) continue;
      if (exposure + sizeUsd > maxExposure) break;
      if (sizeUsd > bankroll) break;

      const shares = sizeUsd / gated.price;
      const ts = new Date().toISOString();
      const info = db
        .prepare(
          `INSERT INTO trades (timestamp, model, market_id, market_question, side, entry_price, size_usd, shares, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
        )
        .run(
          ts,
          modelName,
          mid,
          m.question || "Unknown",
          gated.side,
          gated.price,
          sizeUsd,
          shares,
          gated.reason + " | PAPER"
        );
      if (info.changes) {
        bankroll -= sizeUsd;
        exposure += sizeUsd;
        openCount += 1;
        opened += 1;
        console.log(
          `OPEN ${gated.side} $${sizeUsd} @ ${(gated.price * 100).toFixed(1)}% — ${(m.question || "").slice(0, 50)}...`
        );
      }
      if (opened >= 2) break;
    }
  }

  for (;;) {
    try {
      await cycle();
    } catch (e) {
      console.error("cycle error", e);
    }
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
