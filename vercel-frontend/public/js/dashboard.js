(function () {
  const API_BASE = window.PM_API_BASE;

  async function loadDashboard() {
    try {
      const healthResp = await fetch(`${API_BASE}/api/health`);
      const health = await healthResp.json();

      const modeEl = document.getElementById("trading-mode");
      if (health.models_running) {
        modeEl.innerHTML = "● LIVE";
        modeEl.style.background = "var(--color-success)";
        modeEl.style.color = "white";
      } else {
        modeEl.innerHTML = "● OFFLINE";
        modeEl.style.background = "var(--color-error)";
        modeEl.style.color = "white";
      }

      const tradesResp = await fetch(`${API_BASE}/api/trades?limit=200`);
      const tradesData = await tradesResp.json();
      const trades = tradesData.trades || [];

      const closed = trades.filter((t) => t.status === "closed");
      const open = trades.filter((t) => t.status === "open");

      document.getElementById("total-trades").textContent = trades.length;
      document.getElementById("open-positions").textContent = open.length;
      document.getElementById("closed-trades").textContent = closed.length;

      const realizedPnl = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const wins = closed.filter((t) => (t.pnl || 0) > 0).length;
      const winRate =
        closed.length > 0 ? ((wins / closed.length) * 100).toFixed(0) : "--";

      document.getElementById("realized-pnl").textContent = `${
        realizedPnl >= 0 ? "+" : ""
      }$${realizedPnl.toFixed(2)}`;
      document.getElementById("realized-pnl").style.color =
        realizedPnl >= 0 ? "var(--color-success)" : "var(--color-error)";
      document.getElementById("win-rate").textContent =
        winRate !== "--" ? winRate + "%" : "--";

      const posResp = await fetch(`${API_BASE}/api/positions`);
      const posData = await posResp.json();
      const positions = posData.positions || [];

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

      document.getElementById("unrealized-pnl").textContent = `${
        unrealizedPnl >= 0 ? "+" : ""
      }$${unrealizedPnl.toFixed(2)}`;
      document.getElementById("unrealized-pnl").style.color =
        unrealizedPnl >= 0 ? "var(--color-success)" : "var(--color-error)";

      document.getElementById("total-pnl").textContent = `${
        totalPnl >= 0 ? "+" : ""
      }$${totalPnl.toFixed(2)}`;
      document.getElementById("total-pnl").style.color =
        totalPnl >= 0 ? "var(--color-success)" : "var(--color-error)";

      renderRecentActivity(trades.slice(0, 10));
      renderOpenPositions(positions);
    } catch (error) {
      console.error("Error:", error);
      document.getElementById("trading-mode").innerHTML = "● ERROR";
      document.getElementById("trading-mode").style.background =
        "var(--color-error)";
      document.getElementById("trading-mode").style.color = "white";
    }
  }

  function renderRecentActivity(trades) {
    const container = document.getElementById("recent-activity");

    if (trades.length === 0) {
      container.innerHTML =
        '<p style="color: var(--color-gray-mid);">No trades yet.</p>';
      return;
    }

    let html = '<div style="max-height: 300px; overflow-y: auto;">';
    for (const t of trades) {
      const time = new Date(t.timestamp).toLocaleString();
      const pnl = t.pnl || 0;
      const status =
        t.status === "closed"
          ? `<span style="color: ${
              pnl >= 0 ? "var(--color-success)" : "var(--color-error)"
            }">CLOSED ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}</span>`
          : '<span style="color: var(--color-gray-mid)">OPEN</span>';

      html += `<div style="padding: 8px 0; border-bottom: 1px solid var(--color-border);">`;
      html += `<div>${
        t.direction
      } @ ${(t.entry_price * 100).toFixed(1)}% - ${t.market.substring(
        0,
        45
      )}</div>`;
      html += `<div style="color: var(--color-gray-mid); font-size: 0.75rem;">${time} | ${status}</div>`;
      html += `</div>`;
    }
    html += "</div>";
    container.innerHTML = html;
  }

  function renderOpenPositions(positions) {
    const container = document.getElementById("positions-container");

    if (!positions || positions.length === 0) {
      container.innerHTML =
        '<p style="color: var(--color-gray-mid);">No open positions.</p>';
      return;
    }

    let html =
      '<table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">';
    html +=
      '<thead><tr style="text-align: left; border-bottom: 1px solid var(--color-gray-dark);">';
    html += '<th style="padding: 8px;">Market</th>';
    html += '<th style="padding: 8px;">Side</th>';
    html += '<th style="padding: 8px;">Entry</th>';
    html += '<th style="padding: 8px;">Current</th>';
    html += '<th style="padding: 8px;">P&L</th>';
    html += "</tr></thead><tbody>";

    for (const pos of positions.slice(0, 15)) {
      const pnl = pos.pnl_pct || 0;
      const pnlColor = pnl >= 0 ? "var(--color-success)" : "var(--color-error)";

      html += '<tr style="border-bottom: 1px solid var(--color-border);">';
      html += `<td style="padding: 8px;">${(pos.question || "").substring(
        0,
        40
      )}</td>`;
      html += `<td style="padding: 8px;">${pos.side}</td>`;
      html += `<td style="padding: 8px;">${(pos.entry * 100).toFixed(1)}%</td>`;
      html += `<td style="padding: 8px;">${
        pos.current ? (pos.current * 100).toFixed(1) + "%" : "--"
      }</td>`;
      html += `<td style="padding: 8px; color: ${pnlColor};">${
        pnl >= 0 ? "+" : ""
      }${pnl.toFixed(1)}%</td>`;
      html += "</tr>";
    }

    html += "</tbody></table>";
    if (positions.length > 15) {
      html += `<p style="margin-top: 12px; color: var(--color-gray-mid); font-size: 0.8rem;">Showing 15 of ${positions.length} positions. See <a href="results.html">Results</a> for all.</p>`;
    }
    container.innerHTML = html;
  }

  loadDashboard();
  setInterval(loadDashboard, 30000);
})();
