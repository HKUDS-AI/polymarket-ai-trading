import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const data = join(root, "data");
const MODELS = ["trader", "conservative", "moderate", "aggressive"];

const SCHEMA = `
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
CREATE INDEX IF NOT EXISTS idx_timestamp ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_market_id ON trades(market_id);
`;

function initOne(name) {
  const p = join(data, `trades_${name}.db`);
  const db = new Database(p);
  try {
    db.exec(SCHEMA);
  } finally {
    db.close();
  }
  console.log("OK", p);
}

mkdirSync(data, { recursive: true });
for (const m of MODELS) initOne(m);
console.log("All databases ready under", data);
