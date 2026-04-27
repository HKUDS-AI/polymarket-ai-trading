(function () {
  const API_BASE = window.PM_API_BASE;

  async function analyzeMarket() {
    const question = document.getElementById("market-question").value.trim();
    const price = document.getElementById("current-price").value;
    const btn = document.getElementById("analyze-btn");

    if (!question) {
      alert("Please enter a market question");
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> Analyzing...';

    try {
      const response = await fetch(`${API_BASE}/api/ai/analyze-market`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          market_question: question,
          current_price: price ? parseFloat(price) : null,
        }),
      });

      if (!response.ok) throw new Error("Analysis failed");
      const data = await response.json();

      if (data.error) {
        alert("Error: " + data.error);
        return;
      }

      displayResults(data);
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to analyze market. Please try again.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = "Analyze with AI";
    }
  }

  function displayResults(data) {
    const analysis = data.analysis;

    document.getElementById("results-section").style.display = "block";

    const confidence = analysis.confidence;
    const confidenceEl = document.getElementById("confidence-value");
    confidenceEl.textContent = confidence + "%";
    confidenceEl.className =
      confidence >= 70
        ? "confidence-high"
        : confidence >= 50
          ? "confidence-medium"
          : "confidence-low";

    document.getElementById("probability-value").textContent =
      analysis.probability + "%";
    document.getElementById("embedding-dim").textContent =
      data.embedding_dimension || 1536;
    document.getElementById("reasoning-content").textContent =
      analysis.reasoning;

    const riskList = document.getElementById("risk-list");
    riskList.innerHTML = analysis.risk_factors
      .map((risk) => `<li>${risk}</li>`)
      .join("");

    document.getElementById("results-section").scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  async function findSimilar() {
    const question = document.getElementById("market-question").value.trim();
    const btn = document.getElementById("similar-btn");
    const resultsDiv = document.getElementById("similar-results");

    if (!question) {
      alert("Please analyze a market first");
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> Searching...';
    resultsDiv.innerHTML =
      '<p style="color: var(--color-gray-mid); text-align: center;">Searching vector space...</p>';

    try {
      const response = await fetch(`${API_BASE}/api/vector/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: question }),
      });

      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();

      if (data.error) {
        resultsDiv.innerHTML = `<p style="color: #C62828;">Error: ${data.error}</p>`;
        return;
      }

      displaySimilarMarkets(data.results);
    } catch (error) {
      console.error("Error:", error);
      resultsDiv.innerHTML =
        '<p style="color: #C62828;">Search failed. Please try again.</p>';
    } finally {
      btn.disabled = false;
      btn.innerHTML = "Search Vector Database";
    }
  }

  function displaySimilarMarkets(results) {
    const resultsDiv = document.getElementById("similar-results");

    if (results.length === 0) {
      resultsDiv.innerHTML =
        '<p style="color: var(--color-gray-mid);">No similar markets found</p>';
      return;
    }

    resultsDiv.innerHTML = results
      .slice(0, 5)
      .map(
        (result) => `
                <div class="similar-market-card">
                    <div class="similar-market-question">${result.question}</div>
                    <div class="similarity-score">${(result.similarity * 100).toFixed(
                      1
                    )}% match</div>
                </div>
            `
      )
      .join("");
  }

  window.analyzeMarket = analyzeMarket;
  window.findSimilar = findSimilar;
})();
