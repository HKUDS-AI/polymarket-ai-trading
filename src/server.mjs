import "dotenv/config";
import express from "express";
import cors from "cors";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { dataDir } from "./lib/paths.mjs";
import {
  getAllTrades,
  getStats,
  getOpenPositionRows,
  getModelStats,
} from "./lib/db.mjs";
import { fetchGammaMarkets } from "./lib/gamma.mjs";
import { toQualityMarket } from "./lib/quality.mjs";

const GAMMA = "https://gamma-api.polymarket.com";
const PORT = parseInt(process.env.PORT || "8000", 10);
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

let marketEmbeddingCache = [];

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

function buildPriceLookup(markets) {
  const prices = {};
  for (const m of markets) {
    const q = m.question || "";
    const p = m.outcomePrices;
    let arr = p;
    if (typeof p === "string") {
      try {
        arr = JSON.parse(p);
      } catch {
        arr = [];
      }
    }
    if (Array.isArray(arr) && arr.length >= 2) {
      prices[q] = { yes: parseFloat(arr[0]) || 0, no: parseFloat(arr[1]) || 0 };
    }
  }
  return prices;
}

app.get("/api/health", (req, res) => {
  const stats = getStats();
  const pidsFile = join(dataDir, "model_pids.txt");
  let pids = null;
  if (existsSync(pidsFile)) {
    try {
      pids = readFileSync(pidsFile, "utf8");
    } catch {
      pids = null;
    }
  }
  res.json({
    status: "ok",
    models_running: Boolean(pids),
    ...stats,
    pids,
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/trigger-cycle", (req, res) => {
  try {
    mkdirSync(dataDir, { recursive: true });
    const f = join(dataDir, "trigger_cycle");
    writeFileSync(f, new Date().toISOString());
    res.json({ status: "triggered", message: "Cycle will run within 1 second" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/trades", (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit || "100", 10) || 100);
  res.json({ trades: getAllTrades(limit) });
});

app.get("/api/signals/live", (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit || "100", 10) || 100);
  const raw = getAllTrades(limit);
  const signals = raw.map((t) => {
    const notes = t.notes || "";
    const strength = /strong/i.test(notes)
      ? "STRONG"
      : /weak/i.test(notes)
        ? "WEAK"
        : "MODERATE";
    return {
      market: t.market,
      timestamp: t.timestamp,
      model: t.model || "trader",
      status: t.status === "open" ? "OPEN" : "CLOSED",
      direction: t.direction,
      strength,
      entry_price: t.entry_price,
      size: t.size,
      pnl: t.pnl,
    };
  });
  res.json({ signals });
});

app.get("/api/positions", async (req, res) => {
  const open = getOpenPositionRows();
  let markets = [];
  try {
    const r = await fetch(
      `${GAMMA}/markets?limit=500&active=true&closed=false`
    );
    markets = (await r.json()) || [];
    if (!Array.isArray(markets)) markets = [];
  } catch {
    markets = [];
  }
  const prices = buildPriceLookup(markets);
  const result = open.map((pos) => {
    let current = null;
    let pnl_pct = null;
    const q = pos.question || "";
    if (prices[q]) {
      current =
        pos.side === "YES" ? prices[q].yes : prices[q].no;
      if (pos.entry > 0 && current != null) {
        pnl_pct = ((current - pos.entry) / pos.entry) * 100;
      }
    }
    return {
      market_id: pos.market_id,
      question: pos.question,
      side: pos.side,
      entry: pos.entry,
      size: pos.size,
      current,
      pnl_pct: pnl_pct != null ? Math.round(pnl_pct * 10) / 10 : null,
    };
  });
  res.json({ positions: result });
});

app.get("/api/markets/live", async (req, res) => {
  try {
    const markets = await fetchGammaMarkets({ limit: 50 });
    const result = markets.slice(0, 20).map((m) => {
      let prices = m.outcomePrices;
      if (typeof prices === "string") {
        try {
          prices = JSON.parse(prices);
        } catch {
          prices = [];
        }
      }
      const [y, n] = Array.isArray(prices) ? prices : [null, null];
      return {
        id: m.id,
        question: m.question,
        outcomePrices: m.outcomePrices,
        bestBid: m.bestBid,
        volume: String(m.volume ?? m.volumeNum ?? 0),
        volume24hr: m.volume24hr,
        total_scanned: markets.length,
        yes_price: y != null ? parseFloat(y) : null,
        no_price: n != null ? parseFloat(n) : null,
        volume_24hr: parseFloat(m.volume24hr || 0) || 0,
        ...m,
      };
    });
    res.json({
      markets: result,
      count: result.length,
      total_scanned: markets.length,
    });
  } catch (e) {
    res.json({ error: String(e), markets: [] });
  }
});

app.get("/api/quality/top-markets", async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit || "30", 10) || 30);
    const markets = await fetchGammaMarkets({ limit: 200 });
    const scored = markets.map((m) => toQualityMarket(m));
    scored.sort((a, b) => b.quality.total_score - a.quality.total_score);
    if (openai) {
      try {
        const top = scored.slice(0, 50).filter((x) => (x.question || "").length > 0);
        if (top.length > 0) {
          const emb = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: top.map((x) => x.question),
          });
          marketEmbeddingCache = emb.data.map((d, i) => ({
            question: top[i].question,
            embedding: d.embedding,
          }));
        }
      } catch {
        /* optional */
      }
    }
    res.json({ markets: scored.slice(0, limit) });
  } catch (e) {
    res.status(500).json({ error: String(e), markets: [] });
  }
});

app.get("/api/resolution/accuracy", (req, res) => {
  const trades = getAllTrades(2000).filter((t) => t.status === "closed");
  const withPnl = trades.filter((t) => t.pnl != null);
  const correct = withPnl.filter((t) => (t.pnl || 0) > 0).length;
  const total = withPnl.length;
  const accuracy = total ? (correct / total) * 100 : 0;
  res.json({
    accuracy: Math.round(accuracy * 10) / 10,
    correct_predictions: correct,
    total_resolved: total,
  });
});

app.get("/api/resolution/recent", (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit || "30", 10) || 30);
  const closed = getAllTrades(500).filter((t) => t.status === "closed");
  const resolutions = closed.slice(0, limit).map((t) => {
    const pnl = t.pnl || 0;
    return {
      question: t.market,
      volume: Math.abs(t.size) || 0,
      our_prediction:
        pnl === 0 && !t.exit_price
          ? null
          : {
              model: t.model || "trader",
              side: t.direction,
              price: t.entry_price,
              pnl,
              status: "CLOSED",
            },
    };
  });
  res.json({ resolutions });
});

app.post("/api/ai/analyze-market", async (req, res) => {
  const { market_question, current_price } = req.body || {};
  if (!market_question) {
    return res.status(400).json({ error: "market_question required" });
  }
  if (!openai) {
    return res.json({
      error: "OPENAI_API_KEY not configured",
      analysis: {
        confidence: 0,
        probability: 50,
        reasoning: "Configure OPENAI_API_KEY on the server for AI analysis.",
        risk_factors: ["API key missing"],
      },
      embedding_dimension: 0,
    });
  }
  try {
    const priceHint =
      current_price != null
        ? `Current implied probability (if any): ${current_price}.`
        : "";
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You analyze Polymarket-style prediction market questions. Reply with JSON only: { \"confidence\": 0-100, \"probability\": 0-100 of YES, \"reasoning\": string, \"risk_factors\": string[] }.",
        },
        {
          role: "user",
          content: `Market: ${market_question}\n${priceHint}`,
        },
      ],
    });
    const text = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(text);
    res.json({
      analysis: {
        confidence: Number(parsed.confidence) || 0,
        probability: Number(parsed.probability) || 50,
        reasoning: String(parsed.reasoning || ""),
        risk_factors: Array.isArray(parsed.risk_factors)
          ? parsed.risk_factors
          : [],
      },
      embedding_dimension: 1536,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/vector/search", async (req, res) => {
  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: "query required" });
  if (!openai) {
    return res.json({ error: "OPENAI_API_KEY not configured", results: [] });
  }
  try {
    if (marketEmbeddingCache.length === 0) {
      const markets = await fetchGammaMarkets({ limit: 40 });
      const pairs = markets
        .map((m, i) => ({ q: m.question || "", i }))
        .filter((x) => x.q.length > 0);
      if (pairs.length === 0) {
        return res.json({
          error: "No market questions available to index",
          results: [],
        });
      }
      const emb = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: pairs.map((x) => x.q),
      });
      marketEmbeddingCache = emb.data.map((d, j) => ({
        question: pairs[j].q,
        embedding: d.embedding,
      }));
    }
    const qEmb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const qv = qEmb.data[0].embedding;
    const scored = marketEmbeddingCache
      .map((m) => ({
        question: m.question,
        similarity: cosine(qv, m.embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity);
    res.json({ results: scored.slice(0, 10) });
  } catch (e) {
    res.status(500).json({ error: String(e), results: [] });
  }
});

app.get("/api/models", (req, res) => {
  res.json({ models: getModelStats() });
});

app.get("/api/comparison", (req, res) => {
  res.json({ models: getModelStats() });
});

app.get("/", (req, res) => {
  res.json({ message: "API running. See /api/health for status." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Dashboard API on http://0.0.0.0:${PORT}`);
});
