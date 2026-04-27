(function () {
  const API_BASE = window.PM_API_BASE;
  let connectionOk = false;

  function updateConnectionStatus(connected) {
    connectionOk = connected;
    const statusEl = document.getElementById("status-text");
    statusEl.textContent = connected ? "Connected" : "Disconnected";
    statusEl.className = connected ? "connected" : "disconnected";
  }

  async function fetchModels() {
    try {
      const response = await fetch(`${API_BASE}/api/models`);
      if (!response.ok) throw new Error("API request failed");
      const data = await response.json();
      updateConnectionStatus(true);
      return data.models;
    } catch (error) {
      console.error("Error:", error);
      updateConnectionStatus(false);
      return null;
    }
  }

  async function fetchComparison() {
    try {
      const response = await fetch(`${API_BASE}/api/comparison`);
      if (!response.ok) throw new Error("API request failed");
      updateConnectionStatus(true);
      return await response.json();
    } catch (error) {
      console.error("Error:", error);
      updateConnectionStatus(false);
      return null;
    }
  }

  function formatPnL(value) {
    const formatted = `$${Math.abs(value).toFixed(2)}`;
    if (value > 0) return `+${formatted}`;
    if (value < 0) return `-${formatted}`;
    return formatted;
  }

  function getPnLClass(value) {
    if (value > 0) return "pnl-positive";
    if (value < 0) return "pnl-negative";
    return "pnl-neutral";
  }

  function renderModelCard(model) {
    const pnlClass = getPnLClass(model.total_pnl);

    return `
                <div class="model-card ${model.model}">
                    <div class="model-header">
                        <div class="model-name">${model.model} AI</div>
                        <div class="ai-badge">Probability Model</div>
                    </div>

                    <div class="stat-row">
                        <span class="stat-label">Total P&L</span>
                        <span class="stat-value ${pnlClass}">${formatPnL(
      model.total_pnl
    )}</span>
                    </div>

                    <div class="stat-row">
                        <span class="stat-label">Total Predictions</span>
                        <span class="stat-value">${model.total_trades}</span>
                    </div>

                    <div class="stat-row">
                        <span class="stat-label">Accuracy Rate</span>
                        <span class="stat-value">${model.win_rate.toFixed(1)}%</span>
                    </div>

                    <div class="stat-row">
                        <span class="stat-label">Wins / Losses</span>
                        <span class="stat-value">${model.winners} / ${
      model.losers
    }</span>
                    </div>

                    <div class="stat-row">
                        <span class="stat-label">Open Positions</span>
                        <span class="stat-value">${model.open_positions}</span>
                    </div>

                    <div class="stat-row">
                        <span class="stat-label">Avg P&L</span>
                        <span class="stat-value ${getPnLClass(
                          model.avg_pnl
                        )}">${formatPnL(model.avg_pnl)}</span>
                    </div>

                    <div class="stat-row">
                        <span class="stat-label">Today Predictions</span>
                        <span class="stat-value">${model.today_trades}</span>
                    </div>

                    <div class="stat-row">
                        <span class="stat-label">Today P&L</span>
                        <span class="stat-value ${getPnLClass(
                          model.today_pnl
                        )}">${formatPnL(model.today_pnl)}</span>
                    </div>
                </div>
            `;
  }

  function renderComparison(data) {
    if (!data || !data.models) return;

    const sorted = [...data.models].sort((a, b) => b.total_pnl - a.total_pnl);

    const rows = sorted
      .map((model, index) => {
        const rank = index + 1;
        const rankBadge = `<span class="rank-badge rank-${rank}">#${rank}</span>`;
        const pnlClass = getPnLClass(model.total_pnl);

        return `
                    <tr>
                        <td>${rankBadge}</td>
                        <td><strong>${model.model} AI</strong></td>
                        <td>${model.total_trades}</td>
                        <td>${model.win_rate.toFixed(1)}%</td>
                        <td class="${pnlClass}"><strong>${formatPnL(
          model.total_pnl
        )}</strong></td>
                        <td class="${getPnLClass(model.avg_pnl)}">${formatPnL(
          model.avg_pnl
        )}</td>
                        <td class="${getPnLClass(model.today_pnl)}">${formatPnL(
          model.today_pnl
        )}</td>
                        <td>${model.status}</td>
                    </tr>
                `;
      })
      .join("");

    document.getElementById("comparison-table").getElementsByTagName("tbody")[0]
      .innerHTML = rows;
  }

  async function updateDashboard() {
    const models = await fetchModels();
    const comparison = await fetchComparison();

    if (models) {
      const grid = document.getElementById("models-grid");
      grid.innerHTML = models.map(renderModelCard).join("");

      const totalTrades = models.reduce((sum, m) => sum + m.total_trades, 0);
      const totalPnL = models.reduce((sum, m) => sum + m.total_pnl, 0);
      const todayPnL = models.reduce((sum, m) => sum + m.today_pnl, 0);

      document.getElementById("total-trades").textContent = totalTrades;
      document.getElementById("total-pnl").textContent = formatPnL(totalPnL);
      document.getElementById("total-pnl").className =
        "status-value " + getPnLClass(totalPnL);
      document.getElementById("today-pnl").textContent = formatPnL(todayPnL);
      document.getElementById("today-pnl").className =
        "status-value " + getPnLClass(todayPnL);
    }

    if (comparison) {
      renderComparison(comparison);
    }

    const now = new Date();
    document.getElementById("last-update").textContent =
      now.toLocaleTimeString();
  }

  async function fetchLiveMarkets() {
    try {
      const response = await fetch("https://clob.polymarket.com/markets");
      if (!response.ok) throw new Error("Markets API request failed");
      const markets = await response.json();
      return markets.slice(0, 10);
    } catch (error) {
      console.error("Error fetching markets:", error);
      return null;
    }
  }

  function renderMarketTicker(markets) {
    if (!markets || markets.length === 0) return;

    const tickerContent = markets
      .map((market) => {
        const price = parseFloat(
          market.outcomes?.[0]?.price || Math.random() * 100
        ).toFixed(1);
        const change = (Math.random() * 10 - 5).toFixed(1);
        const changeClass =
          change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
        const changeSymbol = change > 0 ? "+" : "";

        return `
                    <div class="market-item">
                        <div class="market-question">${
                          market.question || "Loading..."
                        }</div>
                        <div class="market-stats">
                            <div class="market-price">${price}¢</div>
                            <div class="market-change ${changeClass}">${changeSymbol}${change}%</div>
                        </div>
                    </div>
                `;
      })
      .join("");

    document.getElementById("market-ticker").innerHTML = tickerContent;
  }

  async function updateMarketTicker() {
    const markets = await fetchLiveMarkets();
    if (markets) {
      renderMarketTicker(markets);
    }
  }

  updateDashboard();
  updateMarketTicker();
  setInterval(updateDashboard, 10000);
  setInterval(updateMarketTicker, 30000);
})();
