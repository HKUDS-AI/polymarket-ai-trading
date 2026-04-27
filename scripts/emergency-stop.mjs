import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = join(root, "data");
mkdirSync(data, { recursive: true });
const reason = process.argv.slice(2).join(" ") || "manual";
writeFileSync(join(data, "EMERGENCY_STOP"), `${new Date().toISOString()} ${reason}\n`);
console.log("EMERGENCY_STOP written. Stop trader process or it will idle on next cycle.");
