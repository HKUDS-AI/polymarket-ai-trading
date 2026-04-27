import { parseOutcomePrices } from "./gamma.mjs";

function gradeFromScore(total) {
  if (total >= 80) return "A";
  if (total >= 65) return "B";
  if (total >= 50) return "C";
  if (total >= 35) return "D";
  return "F";
}

export function scoreMarket(m) {
  const vol = parseFloat(m.volume || m.volumeNum || 0) || 0;
  const vol24 = parseFloat(m.volume24hr || 0) || 0;
  const [yes, no] = parseOutcomePrices(m);
  const mid =
    yes != null && no != null
      ? (yes + no) / 2
      : yes != null
        ? yes
        : 0.5;
  const spread = parseFloat(m.spread || 0) || 0;
  const liquidity = parseFloat(m.liquidity || m.liquidityNum || 0) || 0;

  const liquidityScore = Math.min(35, (Math.log10(vol + 1) / 7) * 35);
  const spreadScore = Math.max(0, 25 - spread * 500);
  const activityScore = Math.min(15, (Math.log10(vol24 + 1) / 6) * 15);
  const desc = (m.description || m.question || "").length;
  const clarityScore = Math.min(25, 8 + Math.min(17, desc / 200));

  const totalScore = Math.min(
    100,
    liquidityScore + spreadScore + activityScore + clarityScore
  );

  return {
    total_score: Math.round(totalScore * 10) / 10,
    grade: gradeFromScore(totalScore),
    liquidity_score: Math.round(liquidityScore * 10) / 10,
    spread_score: Math.round(spreadScore * 10) / 10,
    activity_score: Math.round(activityScore * 10) / 10,
    clarity_score: Math.round(clarityScore * 10) / 10,
    volume_24h: vol24,
    liquidity,
  };
}

export function toQualityMarket(m) {
  const [yes] = parseOutcomePrices(m);
  return {
    question: m.question || "",
    price: yes != null ? yes : 0.5,
    quality: scoreMarket(m),
  };
}
