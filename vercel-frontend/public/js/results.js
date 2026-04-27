(function () {
  const API = window.PM_API_BASE;

  async function load() {
    try {
      const [tradesResp, posResp] = await Promise.all([
        fetch(`${API}/api/trades?limit=200`),
        fetch(`${API}/api/positions`),
      ]);

      const tradesData = await tradesResp.json();
      const posData = await posResp.json();

      document.getElementById("api-status").textContent = "● connected";
      document.getElementById("api-status").style.color = "var(--color-success)";

      const trades = tradesData.trades || [];
      const positions = posData.positions || [];

      const closed = trades.filter((t) => t.status === "closed");
      const wins = closed.filter((t) => (t.pnl || 0) > 0).length;
      const realizedPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);

      let totalCost = 0;
      let totalValue = 0;
      for (const p of positions) {
        const entry = p.entry || 0;
        const current = p.current;
        const size = p.size || 0;
        if (entry > 0 && size > 0) {
          const shares = size / entry;
          totalCost += size;
          if (current && current > 0) {
            totalValue += shares * current;
          } else {
            totalValue += size;
          }
        }
      }
      const unrealizedPnl = totalValue - totalCost;
      const totalPnl = realizedPnl + unrealizedPnl;

      document.getElementById("total-trades").textContent = trades.length;
      document.getElementById("open-count").textContent = positions.length;
      document.getElementById("closed-trades").textContent = closed.length;
      document.getElementById("win-rate").textContent =
        closed.length > 0
          ? Math.round((wins / closed.length) * 100) + "%"
          : "--";

      document.getElementById("realized-pnl").textContent =
        (realizedPnl >= 0 ? "+" : "") + "$" + realizedPnl.toFixed(2);
      document.getElementById("realized-pnl").style.color =
        realizedPnl >= 0 ? "var(--color-success)" : "var(--color-error)";

      document.getElementById("unrealized-pnl").textContent =
        (unrealizedPnl >= 0 ? "+" : "") + "$" + unrealizedPnl.toFixed(2);
      document.getElementById("unrealized-pnl").style.color =
        unrealizedPnl >= 0 ? "var(--color-success)" : "var(--color-error)";

      document.getElementById("total-pnl").textContent =
        (totalPnl >= 0 ? "+" : "") + "$" + totalPnl.toFixed(2);
      document.getElementById("total-pnl").style.color =
        totalPnl >= 0 ? "var(--color-success)" : "var(--color-error)";

      if (closed.length === 0) {
        document.getElementById("closed-list").innerHTML =
          '<p style="color: var(--color-gray-mid);">No closed trades yet.</p>';
      } else {
        let html =
          '<table style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">';
        html +=
          '<tr style="border-bottom: 1px solid var(--color-border);"><th style="text-align:left;padding:8px;">Market</th><th>Side</th><th>Entry</th><th>Exit</th><th>P&L</th></tr>';
        for (const t of closed.slice(0, 30)) {
          const pnl = t.pnl || 0;
          const color = pnl >= 0 ? "var(--color-success)" : "var(--color-error)";
          html += `<tr style="border-bottom: 1px solid var(--color-border);">
                            <td style="padding:8px;">${t.market.substring(0, 40)}</td>
                            <td style="padding:8px;">${t.direction}</td>
                            <td style="padding:8px;">${(t.entry_price * 100).toFixed(
                              1
                            )}%</td>
                            <td style="padding:8px;">${
                              t.exit_price
                                ? (t.exit_price * 100).toFixed(1) + "%"
                                : "--"
                            }</td>
                            <td style="padding:8px;color:${color};">${
            pnl >= 0 ? "+" : ""
          }$${pnl.toFixed(2)}</td>
                        </tr>`;
        }
        html += "</table>";
        document.getElementById("closed-list").innerHTML = html;
      }

      if (positions.length === 0) {
        document.getElementById("open-list").innerHTML =
          '<p style="color: var(--color-gray-mid);">No open positions.</p>';
      } else {
        let html =
          '<table style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">';
        html +=
          '<tr style="border-bottom: 1px solid var(--color-border);"><th style="text-align:left;padding:8px;">Market</th><th>Side</th><th>Entry</th><th>Current</th><th>P&L</th></tr>';
        for (const p of positions.slice(0, 30)) {
          const pnl = p.pnl_pct || 0;
          const color = pnl >= 0 ? "var(--color-success)" : "var(--color-error)";
          html += `<tr style="border-bottom: 1px solid var(--color-border);">
                            <td style="padding:8px;">${(p.question || "").substring(
                              0,
                              40
                            )}</td>
                            <td style="padding:8px;">${p.side}</td>
                            <td style="padding:8px;">${(p.entry * 100).toFixed(
                              1
                            )}%</td>
                            <td style="padding:8px;">${
                              p.current
                                ? (p.current * 100).toFixed(1) + "%"
                                : "--"
                            }</td>
                            <td style="padding:8px;color:${color};">${
            pnl >= 0 ? "+" : ""
          }${pnl.toFixed(1)}%</td>
                        </tr>`;
        }
        html += "</table>";
        document.getElementById("open-list").innerHTML = html;
      }
    } catch (e) {
      document.getElementById("api-status").textContent = "● error";
      document.getElementById("api-status").style.color = "var(--color-error)";
    }
  }

  load();
  setInterval(load, 60000);
})();
