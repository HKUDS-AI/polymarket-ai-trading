(function () {
  const API_BASE = window.PM_API_BASE;
  let allSignals = [];
  let currentFilter = "all";

  async function fetchSignals() {
    try {
      const response = await fetch(`${API_BASE}/api/signals/live?limit=100`);
      if (!response.ok) throw new Error("Failed to fetch signals");
      const data = await response.json();
      allSignals = data.signals || [];
      renderSignals();
      updateStats();
    } catch (error) {
      console.error("Error fetching signals:", error);
    }
  }

  function updateStats() {
    const today = new Date().toISOString().split("T")[0];
    const todaySignals = allSignals.filter((s) => s.timestamp.startsWith(today));
    const activeSignals = allSignals.filter((s) => s.status === "OPEN");

    document.getElementById("stat-total").textContent = allSignals.length;
    document.getElementById("stat-active").textContent = activeSignals.length;
    document.getElementById("stat-today").textContent = todaySignals.length;
  }

  function renderSignals() {
    const grid = document.getElementById("signals-grid");

    let filtered = allSignals;
    if (currentFilter !== "all") {
      filtered = allSignals.filter(
        (s) =>
          s.model === currentFilter ||
          s.strength === currentFilter ||
          s.direction === currentFilter
      );
    }

    if (filtered.length === 0) {
      grid.innerHTML =
        '<p style="text-align: center; color: var(--color-gray-mid);">No signals found</p>';
      return;
    }

    grid.innerHTML = filtered
      .map((signal) => {
        const timestamp = new Date(signal.timestamp).toLocaleString();
        const pnlClass =
          signal.pnl > 0
            ? "pnl-positive"
            : signal.pnl < 0
              ? "pnl-negative"
              : "";
        const pnlDisplay =
          signal.pnl !== null ? `$${signal.pnl.toFixed(2)}` : "Pending";

        return `
                    <div class="signal-card">
                        <div class="signal-header">
                            <div class="signal-market">${signal.market}</div>
                            <div class="signal-timestamp">${timestamp}</div>
                        </div>

                        <div class="signal-badges">
                            <span class="model-badge model-${
                              signal.model
                            }">${signal.model}</span>
                            <span class="status-badge status-${signal.status.toLowerCase()}">${
          signal.status
        }</span>
                        </div>

                        <div class="signal-details">
                            <div>
                                <div class="signal-detail-label">Direction</div>
                                <div class="signal-detail-value direction-${signal.direction.toLowerCase()}">${
          signal.direction
        }</div>
                            </div>
                            <div>
                                <div class="signal-detail-label">Strength</div>
                                <div class="signal-detail-value">${
                                  signal.strength
                                }</div>
                            </div>
                            <div>
                                <div class="signal-detail-label">Entry</div>
                                <div class="signal-detail-value">${(
                                  signal.entry_price * 100
                                ).toFixed(1)}c</div>
                            </div>
                            <div>
                                <div class="signal-detail-label">Size</div>
                                <div class="signal-detail-value">$${signal.size.toFixed(
                                  0
                                )}</div>
                            </div>
                            <div>
                                <div class="signal-detail-label">P&L</div>
                                <div class="signal-detail-value ${pnlClass}">${pnlDisplay}</div>
                            </div>
                        </div>
                    </div>
                `;
      })
      .join("");
  }

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      renderSignals();
    });
  });

  fetchSignals();
  setInterval(fetchSignals, 10000);
})();
