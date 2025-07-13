// modules/wormhole_scanner.js
import { apiRequest, sleep } from "../shared.js";

let running = false;
let panelInitialized = false;

const chartFindsCache = (window.chartFindsCache ??= {
  wormholes: [],
  unstable: [],
  spatial: [],
  uncharted7plus: [],
  failed: [],
  predicted: [],
  parsed: [],
});

export function init() {
  if (panelInitialized) return;
  panelInitialized = true;
  renderWormholeScannerPanel();
}

function buildKnownFindsArray() {
  return [
    ...chartFindsCache.wormholes.map(s => ({
      type: "stable wormhole",
      position: parseFloat(s.system_position),
      name: s.system_name,
    })),
    ...chartFindsCache.unstable.map(s => ({
      type: "unstable wormhole",
      position: parseFloat(s.system_position),
      name: s.system_name,
    })),
    ...chartFindsCache.uncharted7plus.map(s => ({
      type: "uncharted",
      position: parseFloat(s.system_position),
      count: s.unchartedCount,
    })),
  ];
}

export function parserReadyDump(systemId, sysData, knownFinds = []) {
  const systemPos = parseFloat(sysData.system_position);
  const systemName = sysData.system_name || `System ${systemId}`;
  const bodies = Object.values(sysData.system_bodies || {});

  const simplifiedBodies = bodies.map((body) => ({
    name: body.body_name,
    type: body.body_type_name,
    chart: body.computed?.can_chart || false,
    mine: body.computed?.can_mine || false,
    orbit: body.computed?.can_orbit || false,
  }));

  const extraFinds = knownFinds
    .filter(f => Math.abs(f.position - systemPos) < 0.2)
    .map(f => f.type === "uncharted"
      ? { unchartedCount: f.count }
      : { tag: f.type, tagName: f.name });

  const extraMerged = Object.assign({}, ...extraFinds);

  const output = {
    id: systemId,
    name: systemName,
    pos: systemPos,
    effect: sysData.region_effect_name || "Unknown",
    owner: sysData.user_name || null,
    faction: sysData.system_faction_name || null,
    services: Object.keys(sysData.system_services || {}).filter(k => sysData.system_services[k]),
    bodies: simplifiedBodies,
    ...extraMerged,
  };

  chartFindsCache.parsed.push(output);
}

function renderWormholeScannerPanel() {
  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("wormholeScannerPanel")) return;

  const panel = document.createElement("section");
  panel.id = "wormholeScannerPanel";
  panel.setAttribute("data-panel", "wormholeScanner");
  panel.classList.add("minimizable-panel");

  panel.innerHTML = `
    <div class="panel-header" data-target="#wormholeScannerContent">
      <h2>🕳️ Wormhole Scanner</h2>
      <div id="wormholeScannerStatus">Idle</div>
      <button id="wormholeScannerToggle">Start</button>
    </div>
    <div class="panel-content" id="wormholeScannerContent">
      <pre id="wormholeScannerLog">Idle.</pre>
    </div>
  `;

  container.appendChild(panel);

  document.getElementById("wormholeScannerToggle").onclick = () => {
    running = !running;
    document.getElementById("wormholeScannerToggle").innerText = running ? "Stop" : "Start";
    updateScannerStatus(running ? "🟢 Running..." : "⛔ Stopped.");
    if (running) runWormholeScanLoop();
  };

  panel.querySelector(".panel-header").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") panel.classList.toggle("open");
  });
}

function updateScannerStatus(msg) {
  const timestamp = `[${new Date().toLocaleTimeString()}]`;
  const log = document.getElementById("wormholeScannerLog");
  const status = document.getElementById("wormholeScannerStatus");

  if (log) {
    const lines = log.textContent.split("\n").slice(0, 20);
    log.textContent = [timestamp + " " + msg, ...lines].join("\n");
  }

  if (status) {
    status.textContent = msg;
  }
}

async function runWormholeScanLoop() {
  chartFindsCache.parsed = [];

  for (let systemId = 110; systemId <= 7000 && running; systemId++) {
    // if (systemId === 2567) systemId = 3104;
    // if (systemId === 3501) systemId = 3511;
    // if (systemId === 4675) systemId = 5016;

    try {
      // updateScannerStatus(`📡 Scanning system ${systemId}...`);
      const res = await apiRequest("POST", `system/?system_id=${systemId}`);
      const sys = res.system?.[systemId] || {};
      if (!sys.system_position) {
        chartFindsCache.failed.push(systemId);
        continue;
      }

      const bodies = Object.values(sys.system_bodies || {});
      if (bodies.length === 0) continue;

      for (const body of bodies) {
        const type = body.body_type_name?.toLowerCase() || "";
        if (type === "stable wormhole") {
          chartFindsCache.wormholes.push({ ...sys, system_id: systemId });
        }
        if (type === "unstable wormhole") {
          chartFindsCache.unstable.push({ ...sys, system_id: systemId });
          console.log(`⚠️ Unstable wormhole @ ${sys.system_position} - ${sys.system_name || "Unnamed"}`);
          updateScannerStatus(`⚠️ Unstable wormhole @ ${sys.system_position} - ${sys.system_name || "Unnamed"}`);

        }
        if (type === "spatial filament") {
          chartFindsCache.spatial.push({ ...sys, system_id: systemId });
        }
      }

      const uncharted = bodies.filter(b => b.computed?.can_chart);
      if (uncharted.length >= 5) {
        chartFindsCache.uncharted7plus.push({ ...sys, system_id: systemId, unchartedCount: uncharted.length });
      }

      parserReadyDump(systemId, sys, buildKnownFindsArray());
      // updateScannerStatus(`✅ System ${systemId} scanned.`);
    } catch (err) {
      chartFindsCache.failed.push(systemId);
      // updateScannerStatus(`❌ Error on ${systemId}: ${err.message}`);
    }

    await sleep(300);
  }

  running = false;
  document.getElementById("wormholeScannerToggle").innerText = "Start";
  updateScannerStatus(`✅ Done scanning.`);

  console.groupCollapsed("📦 Wormhole Scan Dump");
  console.log(JSON.stringify(chartFindsCache.parsed, null, 2));
  console.groupEnd();
  console.log(chartFindsCache.failed);
}
