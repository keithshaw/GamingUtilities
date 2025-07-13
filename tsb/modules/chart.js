import { apiRequest, sleep } from "../shared.js";

let currentTarget = null;
let startTime = null;
let exploreStartTime = null;
let exploreDirection = 1;
let systemDB = {};
let chartLoopRunning = false;
let exploreLoopRunning = false;
let exploreInterval = null;
let systemsCharted = 0;
let bodiesCharted = 0;
let etaTimer = null;

export function initChartTestPanel() {
  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("chartTestPanel")) return;

  const panel = document.createElement("section");
  panel.id = "chartTestPanel";
  panel.classList.add("minimizable-panel");
  panel.setAttribute("data-panel", "chart");

  panel.innerHTML = `
    <div class="panel-header" data-target="#chartTestContent">
      <h2>📝 Auto Chart Test</h2>
      <button id="chartToggleBtn">Start</button>
      <button id="exploreToggleBtn">Start Explore</button>
      <select id="exploreDirection" title="Direction">
        <option value="1" selected>→</option>
        <option value="0">←</option>
      </select>
    </div>
    <div class="panel-content" id="chartTestContent">
      <div id="chartStatus"></div>
      <progress id="chartProgressBar" value="0" max="100" style="width: 100%; margin: 5px 0;"></progress>
      <div id="chartMeta" style="font-size: 0.8em; color: #888;"></div>
      <div id="chartStats" style="font-size: 0.8em; color: #aaa; margin-top: 5px;"></div>
      <pre id="chartLog" style="max-height: 300px; overflow-y: auto; background: #111; padding: 0.5em; font-size: 0.8em;"></pre>
    </div>
  `;

  container.appendChild(panel);

  document.getElementById("chartToggleBtn").onclick = toggleChartLoop;
  document.getElementById("exploreToggleBtn").onclick = toggleExploreLoop;
  document.getElementById("exploreDirection").onchange = (e) => {
    exploreDirection = parseInt(e.target.value);
  };

  panel.querySelector(".panel-header").addEventListener("click", () => panel.classList.toggle("open"));

  loadSystemDB();
  updateChartStats();
}

function loadSystemDB() {
  try {
    const saved = localStorage.getItem("chartSystemDB");
    if (saved) systemDB = JSON.parse(saved);
  } catch (err) {
    console.error("Failed to load systemDB:", err);
  }
}

function saveSystemDB() {
  try {
    localStorage.setItem("chartSystemDB", JSON.stringify(systemDB));
  } catch (err) {
    console.error("Failed to save systemDB:", err);
  }
}

function toggleChartLoop() {
  chartLoopRunning = !chartLoopRunning;
  document.getElementById("chartToggleBtn").textContent = chartLoopRunning ? "Stop" : "Start";
  if (chartLoopRunning) chartStep();
}

function updateChartStats() {
  const statsEl = document.getElementById("chartStats");
  const metaEl = document.getElementById("chartMeta");
  const progressBar = document.getElementById("chartProgressBar");

  if (!statsEl || !metaEl || !progressBar) return;

  const charting = chartLoopRunning;
  const exploring = exploreLoopRunning;

  if (charting && !exploring) {
    // CHARTING ONLY
    const eta = etaTimer !== null ? ` ~ETA: ${etaTimer} min` : "";
    metaEl.innerHTML = `
      <strong style="color:#80f29d;">📊 Mode:</strong> CHARTING<br/>
      🌌 Systems Charted: ${systemsCharted} | 🪐 Bodies Charted: ${bodiesCharted}${eta}
    `;
    statsEl.textContent = "";
    progressBar.style.display = "block";
  } else if (exploring && !charting) {
    // EXPLORING ONLY
    const elapsed = exploreStartTime ? Math.floor((Date.now() - exploreStartTime) / 1000) : 0;
    metaEl.innerHTML = `
      <strong style="color:#f5c542;">🧭 Mode:</strong> EXPLORING<br/>
      Direction: ${exploreDirection ? "→" : "←"} | ⏱️ ${elapsed}s elapsed
    `;
    statsEl.textContent = "";
    progressBar.style.display = "none";
  } else if (exploring && charting) {
    // BOTH
    const elapsed = exploreStartTime ? Math.floor((Date.now() - exploreStartTime) / 1000) : 0;
    metaEl.innerHTML = `
      <strong style="color:#66ccff;">⚙️ Mode:</strong> BOTH<br/>
      🧭 ${exploreDirection ? "→" : "←"} | ⏱️ ${elapsed}s<br/>
      🌌 ${systemsCharted} | 🪐 ${bodiesCharted}
    `;
    statsEl.textContent = "";
    progressBar.style.display = "block";
  } else {
    // IDLE
    metaEl.innerHTML = `<strong style="color:#999;">⏳ Mode:</strong> IDLE`;
    statsEl.textContent = `Ready to begin.`;
    progressBar.style.display = "none";
  }
}



async function chartStep() {
  if (!chartLoopRunning) return;

  const statusEl = document.getElementById("chartStatus");
  const logEl = document.getElementById("chartLog");
  const metaEl = document.getElementById("chartMeta");
  const progressBar = document.getElementById("chartProgressBar");
  const log = (...lines) => logEl.textContent += lines.join("\n") + "\n";

  try {
    statusEl.textContent = "🔍 Checking chart status...";
    const chart = await apiRequest("POST", "status/chart/");

    const percent = chart.percentage ?? 0;
    const isCharting = chart.body_id != null && percent < 100;
    progressBar.value = percent;
    log(`📊 Charting progress: ${percent}%`);

    if (isCharting) {
      if (!startTime) startTime = Date.now();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      statusEl.textContent = `📍 ${percent}% charted. Still working.`;
      metaEl.textContent = `⏱️ Elapsed: ${elapsed}s | Target body_id: ${chart.body_id}`;
      setTimeout(chartStep, 10000);
      return;
    }

    startTime = null;

    const systemInfo = await apiRequest("POST", "system/");
    const system = Object.values(systemInfo.system || {})[0];
    if (!system || !system.system_position) {
      log("❌ System info error.");
      statusEl.textContent = "❌ Could not determine current system.";
      setTimeout(chartStep, 10000);
      return;
    }

    const positionKey = system.system_position;
    const unchartedBodies = Object.entries(system.system_bodies || {})
      .filter(([_, b]) => b.computed?.can_chart);

    if (unchartedBodies.length > 0) {
      log(`🌍 Found ${unchartedBodies.length} uncharted body(ies).`);
      statusEl.textContent = `🌍 ${unchartedBodies.length} uncharted planets.`;

      systemDB[positionKey] = { charted: false, timestamp: new Date().toISOString() };
      saveSystemDB();

      const [id, b] = unchartedBodies[0];
      log(`🔬 Charting ${b.body_name || "Unknown"} (ID: ${id})`);
      const result = await apiRequest("POST", `action/chart/start/`, { body_id: id }, true);
      log(`✅ Charting started: ${result?.status || "OK"}`);
      bodiesCharted++;
      updateChartStats();
      await sleep(5000);
      return chartStep();
    }

    log("✅ System fully charted.");
    statusEl.textContent = "✅ All charted.";
    if (!systemDB[positionKey]?.charted) systemsCharted++;
    systemDB[positionKey] = { charted: true, timestamp: new Date().toISOString() };
    saveSystemDB();
    updateChartStats();

    log("🔎 Scanning nearby...");
    const regionData = await apiRequest("POST", "lookup/nearby/regions/");
    const currentRegion = Object.values(regionData).find(r => r.current);
    if (!currentRegion) {
      log("❌ No region.");
      statusEl.textContent = "❌ No current region.";
      setTimeout(chartStep, 10000);
      return;
    }

    const systems = await apiRequest("POST", "lookup/nearby/", {
      body_type: -1,
      region_key: currentRegion.current_region_id
    });

    const sorted = (systems || []).sort((a, b) => Math.abs(a.system_distance) - Math.abs(b.system_distance));
    const next = sorted.find(s => {
      const pos = s.system_position;
      return pos && !systemDB[pos]?.charted && s.system_distance !== 0;
    });

    if (!next) {
      log("🚫 No uncharted systems.");
      statusEl.textContent = "🚫 None found.";
      setTimeout(chartStep, 10000);
      return;
    }

    currentTarget = next;
    log(`🧭 Next: ${next.system_name} (${next.system_position})`);
    etaTimer = Math.ceil(Math.abs(next.system_distance) / 3);
    updateChartStats();

    statusEl.textContent = `🚀 Traveling to ${next.system_name || "Unnamed"}...`;
    await apiRequest("POST", `action/sublight/start/`, { system_id: next.system_id }, true);
    log(`🛸 Sent to ${next.system_id}`);
    await sleep(5000);
    setTimeout(chartStep, 10000);

  } catch (err) {
    document.getElementById("chartStatus").textContent = "⚠️ Error occurred.";
    const logEl = document.getElementById("chartLog");
    if (logEl) logEl.textContent += `❌ Error: ${err.message}\n`;
    console.error("Chart Step Error:", err);
    setTimeout(chartStep, 10000);
  }
}

function toggleExploreLoop() {
  exploreLoopRunning = !exploreLoopRunning;
  const btn = document.getElementById("exploreToggleBtn");
  if (!btn) return;

  btn.textContent = exploreLoopRunning ? "Stop Explore" : "Start Explore";
  exploreStartTime = exploreLoopRunning ? Date.now() : null;
  updateChartStats();

  if (exploreLoopRunning) {
    runExploreStep(); // fire immediately
    exploreInterval = setInterval(runExploreStep, 120000);
  } else {
    clearInterval(exploreInterval);
    exploreInterval = null;
  }
}

async function runExploreStep() {
  const res = await apiRequest("POST", `action/sublight/start/?direction=${exploreDirection}`);
  const pos = res?.system_position;
  const metaEl = document.getElementById("chartMeta");
  if (metaEl && pos) {
    metaEl.innerHTML += `<br/>📍 Current Position: ${pos.toFixed(1)}`;
  }
  updateChartStats();
}

