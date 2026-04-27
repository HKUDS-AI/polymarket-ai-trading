import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const dataDir = path.join(root, "data");

mkdirSync(dataDir, { recursive: true });
writeFileSync(
  path.join(dataDir, "model_pids.txt"),
  `${new Date().toISOString()}\ntrader=node\nmode=paper\n`
);

const child = spawn(node, [path.join(root, "src", "trader.mjs")], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});
child.on("error", (e) => console.error("trader:", e));
child.on("exit", (code) => {
  if (code !== 0 && code != null) console.error("trader exited", code);
});

await import(new URL("../src/server.mjs", import.meta.url));
