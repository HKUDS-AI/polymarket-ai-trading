(function () {
  const API_BASE = window.PM_API_BASE;
  const logContainer = document.getElementById("log-container");

  const MIN_VOLUME = 100000;
  const EXTREME_LOW = 15;
  const EXTREME_HIGH = 85;
  const WATCH_LOW = 30;
  const WATCH_HIGH = 70;

  function getTime() {
    return new Date().toLocaleTimeString("en-US", { hour12: false });
  }

  function log(message, type = "") {
    const entry = document.createElement("div");
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<span class="log-time">[${getTime()}]</span> ${message}`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  function logIndent(message, type = "") {
    const entry = document.createElement("div");
    entry.className = `log-entry log-indent ${type}`;
    entry.innerHTML = message;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function runScan() {
    logContainer.innerHTML = "";

    log("Starting market scan...", "log-info");
    await sleep(300);

    log("Connecting to Polymarket API via proxy...", "log-dim");
    await sleep(200);

    try {
      const response = await fetch(`${API_BASE}/api/markets/live`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      const allMarkets = data.markets || [];

      const totalScanned = data.total_scanned || allMarkets.length;
      log(
        `Received <span class="log-highlight">${totalScanned}</span> markets from API`,
        "log-success"
      );
      document.getElementById("stat-scanned").textContent = totalScanned;
      await sleep(400);

      log("Filtering by volume (min $100k)...", "log-dim");
      await sleep(200);

      const qualified = allMarkets.filter(
        (m) => parseFloat(m.volume || 0) >= MIN_VOLUME
      );
      log(
        `<span class="log-highlight">${qualified.length}</span> markets meet volume threshold`,
        "log-info"
      );
      document.getElementById("stat-qualified").textContent = qualified.length;
      await sleep(300);

      log("Beginning mean reversion analysis...", "log-info");
      log("─".repeat(50), "log-dim");
      await sleep(300);

      let signalCount = 0;
      let extremeCount = 0;

      const topMarkets = qualified.slice(0, 15);

      for (const market of topMarkets) {
        const vol24 = parseFloat(market.volume24hr || 0);
        const volTotal = parseFloat(market.volume || 0);
        const vol24Str =
          vol24 >= 1000000
            ? `$${(vol24 / 1000000).toFixed(1)}M`
            : `$${(vol24 / 1000).toFixed(0)}k`;
        const volTotalStr =
          volTotal >= 1000000
            ? `$${(volTotal / 1000000).toFixed(1)}M`
            : `$${(volTotal / 1000).toFixed(0)}k`;

        let yesPrice = null;

        try {
          let prices = market.outcomePrices;
          if (typeof prices === "string") {
            prices = JSON.parse(prices);
          }
          if (Array.isArray(prices) && prices.length >= 1) {
            const parsed = parseFloat(prices[0]);
            if (!isNaN(parsed)) yesPrice = parsed * 100;
          }
        } catch (e) {
          console.log("Parse error:", e);
        }

        if (yesPrice === null && market.bestBid) {
          yesPrice = parseFloat(market.bestBid) * 100;
        }

        const question =
          market.question?.substring(0, 50) +
          (market.question?.length > 50 ? "..." : "");

        log(`Evaluating: "${question}"`, "");
        await sleep(150);

        if (yesPrice === null) {
          logIndent(
            `<span class="log-error">✗ No price data available</span>`,
            ""
          );
          await sleep(100);
          continue;
        }

        const priceStr = `YES: ${yesPrice.toFixed(0)}¢`;
        logIndent(
          `<span class="log-dim">${priceStr} | 24hr: ${vol24Str} | Total: ${volTotalStr}</span>`,
          ""
        );
        await sleep(100);

        let signal = "";
        let action = "";

        if (yesPrice <= EXTREME_LOW) {
          signal = '<span class="log-warning">EXTREME LOW</span>';
          action =
            '<span class="log-success">→ SIGNAL: Potential undervaluation</span>';
          signalCount++;
          extremeCount++;
        } else if (yesPrice >= EXTREME_HIGH) {
          signal = '<span class="log-warning">EXTREME HIGH</span>';
          action =
            '<span class="log-success">→ SIGNAL: Potential overvaluation</span>';
          signalCount++;
          extremeCount++;
        } else if (yesPrice <= WATCH_LOW || yesPrice >= WATCH_HIGH) {
          signal = '<span class="log-info">WATCHING</span>';
          action = '<span class="log-dim">→ Monitoring for movement</span>';
          signalCount++;
        } else {
          signal = '<span class="log-dim">NEUTRAL</span>';
          action =
            '<span class="log-dim">→ No signal (price in normal range)</span>';
        }

        logIndent(`Signal: ${signal}`, "");
        logIndent(action, "");
        await sleep(200);
      }

      document.getElementById("stat-signals").textContent = signalCount;
      document.getElementById("stat-extreme").textContent = extremeCount;

      log("─".repeat(50), "log-dim");
      await sleep(200);
      log(
        `Scan complete. <span class="log-highlight">${signalCount}</span> signals detected, <span class="log-warning">${extremeCount}</span> extreme.`,
        "log-success"
      );

      if (extremeCount > 0) {
        log(
          "⚡ Extreme prices detected - potential mean reversion opportunities",
          "log-warning"
        );
      }

      log('<span class="log-dim">Next scan in 60 seconds...</span>', "");
    } catch (error) {
      log(`<span class="log-error">Error: ${error.message}</span>`, "");
    }
  }

  runScan();
  setInterval(runScan, 60000);
})();
