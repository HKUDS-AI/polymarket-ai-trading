(function () {
  const API_BASE = window.PM_API_BASE;

  async function fetchAccuracy() {
    try {
      const response = await fetch(`${API_BASE}/api/resolution/accuracy`);
      if (!response.ok) throw new Error("Failed to fetch accuracy");
      const data = await response.json();

      document.getElementById("accuracy-value").textContent =
        data.accuracy.toFixed(1) + "%";
      document.getElementById("accuracy-subtitle").textContent = `${
        data.correct_predictions
      } correct out of ${data.total_resolved} resolved predictions`;
      document.getElementById("total-resolved").textContent = data.total_resolved;
      document.getElementById("correct-predictions").textContent =
        data.correct_predictions;
    } catch (error) {
      console.error("Error fetching accuracy:", error);
    }
  }

  async function fetchResolutions() {
    try {
      const response = await fetch(
        `${API_BASE}/api/resolution/recent?limit=30`
      );
      if (!response.ok) throw new Error("Failed to fetch resolutions");
      const data = await response.json();

      document.getElementById("recent-count").textContent = data.resolutions.length;
      renderResolutions(data.resolutions || []);
    } catch (error) {
      console.error("Error fetching resolutions:", error);
      document.getElementById("resolutions-list").innerHTML =
        '<p style="text-align: center; color: var(--color-gray-mid);">Failed to load resolutions</p>';
    }
  }

  function renderResolutions(resolutions) {
    const list = document.getElementById("resolutions-list");

    if (resolutions.length === 0) {
      list.innerHTML =
        '<p style="text-align: center; color: var(--color-gray-mid);">No resolved markets found</p>';
      return;
    }

    list.innerHTML = resolutions
      .map((res) => {
        const prediction = res.our_prediction;
        let predictionBadge = "";
        let predictionDetails = "";

        if (prediction) {
          const pnlClass =
            prediction.pnl > 0 ? "pnl-positive" : "pnl-negative";
          const status =
            prediction.status === "CLOSED"
              ? prediction.pnl > 0
                ? "prediction-correct"
                : "prediction-incorrect"
              : "prediction-pending";
          const statusText =
            prediction.status === "CLOSED"
              ? prediction.pnl > 0
                ? "Correct Prediction"
                : "Incorrect Prediction"
              : "Pending Resolution";

          predictionBadge = `<div class="prediction-badge ${status}">${statusText}</div>`;
          predictionDetails = `
                        <div class="detail-item">
                            <div class="detail-label">AI Model</div>
                            <div class="detail-value">${prediction.model}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Our Position</div>
                            <div class="detail-value">${prediction.side}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Entry Price</div>
                            <div class="detail-value">${(
                              prediction.price * 100
                            ).toFixed(1)}c</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">P&L</div>
                            <div class="detail-value ${pnlClass}">$${prediction.pnl.toFixed(
            2
          )}</div>
                        </div>
                    `;
        } else {
          predictionBadge =
            '<div class="prediction-badge no-prediction">No Position Taken</div>';
          predictionDetails = `
                        <div class="detail-item">
                            <div class="detail-label">Status</div>
                            <div class="detail-value" style="color: var(--color-gray-mid);">Not Traded</div>
                        </div>
                    `;
        }

        return `
                    <div class="resolution-card">
                        <div class="resolution-question">${res.question}</div>
                        ${predictionBadge}
                        <div class="resolution-details">
                            ${predictionDetails}
                            <div class="detail-item">
                                <div class="detail-label">Total Volume</div>
                                <div class="detail-value">$${res.volume.toLocaleString()}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Resolution</div>
                                <div class="detail-value" style="color: var(--color-accent);">Automated</div>
                            </div>
                        </div>
                    </div>
                `;
      })
      .join("");
  }

  fetchAccuracy();
  fetchResolutions();

  setInterval(() => {
    fetchAccuracy();
    fetchResolutions();
  }, 60000);
})();
