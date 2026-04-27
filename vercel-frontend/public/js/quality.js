(function () {
  const API_BASE = window.PM_API_BASE;

  async function fetchQualityMarkets() {
    try {
      const response = await fetch(
        `${API_BASE}/api/quality/top-markets?limit=30`
      );
      if (!response.ok) throw new Error("Failed to fetch markets");
      const data = await response.json();
      renderMarkets(data.markets || []);
    } catch (error) {
      console.error("Error fetching quality markets:", error);
      document.getElementById("markets-list").innerHTML =
        '<p style="text-align: center; color: var(--color-gray-mid);">Failed to load markets. Retrying...</p>';
    }
  }

  function renderMarkets(markets) {
    const list = document.getElementById("markets-list");

    if (markets.length === 0) {
      list.innerHTML =
        '<p style="text-align: center; color: var(--color-gray-mid);">No markets found</p>';
      return;
    }

    list.innerHTML = markets
      .map((market, index) => {
        const quality = market.quality;
        const gradeClass = `grade-${quality.grade
          .toLowerCase()
          .replace("+", "plus")}`;

        return `
                    <div class="market-card">
                        <div class="market-header">
                            <div class="market-question">
                                <span class="market-rank">#${index + 1}</span>
                                ${market.question}
                            </div>
                            <div class="grade-badge ${gradeClass}">${
          quality.grade
        }</div>
                        </div>

                        <div class="quality-breakdown">
                            <div class="quality-metric">
                                <div class="metric-label">Total Score</div>
                                <div class="metric-value">${
                                  quality.total_score
                                }/100</div>
                                <div class="metric-bar">
                                    <div class="metric-fill" style="width: ${
                                      quality.total_score
                                    }%"></div>
                                </div>
                            </div>
                            <div class="quality-metric">
                                <div class="metric-label">Liquidity</div>
                                <div class="metric-value">${quality.liquidity_score.toFixed(
                                  1
                                )}</div>
                                <div class="metric-bar">
                                    <div class="metric-fill" style="width: ${
                                      (quality.liquidity_score / 35) * 100
                                    }%"></div>
                                </div>
                            </div>
                            <div class="quality-metric">
                                <div class="metric-label">Spread</div>
                                <div class="metric-value">${quality.spread_score.toFixed(
                                  1
                                )}</div>
                                <div class="metric-bar">
                                    <div class="metric-fill" style="width: ${
                                      (quality.spread_score / 25) * 100
                                    }%"></div>
                                </div>
                            </div>
                            <div class="quality-metric">
                                <div class="metric-label">Activity</div>
                                <div class="metric-value">${quality.activity_score.toFixed(
                                  1
                                )}</div>
                                <div class="metric-bar">
                                    <div class="metric-fill" style="width: ${
                                      (quality.activity_score / 15) * 100
                                    }%"></div>
                                </div>
                            </div>
                            <div class="quality-metric">
                                <div class="metric-label">Clarity</div>
                                <div class="metric-value">${quality.clarity_score.toFixed(
                                  1
                                )}</div>
                                <div class="metric-bar">
                                    <div class="metric-fill" style="width: ${
                                      (quality.clarity_score / 25) * 100
                                    }%"></div>
                                </div>
                            </div>
                        </div>

                        <div class="market-footer">
                            <span class="footer-label">24h Volume: <span class="footer-value">$${quality.volume_24h.toLocaleString()}</span></span>
                            <span class="footer-label">Price: <span class="footer-value">${(
                              market.price * 100
                            ).toFixed(1)}c</span></span>
                        </div>
                    </div>
                `;
      })
      .join("");
  }

  fetchQualityMarkets();
  setInterval(fetchQualityMarkets, 60000);
})();
