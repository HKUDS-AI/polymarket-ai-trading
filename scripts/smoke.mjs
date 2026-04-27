const base = process.env.SMOKE_API_URL || "http://127.0.0.1:8000";
const res = await fetch(`${base}/api/health`);
if (!res.ok) {
  console.error("health failed", res.status);
  process.exit(1);
}
const j = await res.json();
console.log("OK", j.status, "models_running=", j.models_running);
