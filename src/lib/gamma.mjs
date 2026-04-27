const GAMMA = "https://gamma-api.polymarket.com";

export async function fetchGammaMarkets(params = {}) {
  const search = new URLSearchParams({
    limit: String(params.limit ?? 500),
    active: "true",
    closed: "false",
    ...params,
  });
  const res = await fetch(`${GAMMA}/markets?${search}`, { signal: params.signal });
  if (!res.ok) throw new Error(`Gamma ${res.status}`);
  const j = await res.json();
  return Array.isArray(j) ? j : [];
}

export function parseOutcomePrices(m) {
  let p = m.outcomePrices ?? "[]";
  if (typeof p === "string") {
    try {
      p = JSON.parse(p);
    } catch {
      p = [];
    }
  }
  if (!Array.isArray(p) || p.length < 1) return [null, null];
  return [parseFloat(p[0]) || null, parseFloat(p[1]) || null];
}
