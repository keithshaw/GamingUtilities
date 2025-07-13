import { apiRequest, sleep } from "../shared.js";

let regionData = {};
let currentRegionIndex = null;

export function init() {
  renderRegionViewerPanel();
  loadRegionsData();

  window.displayRegionByIndex = displayRegionByIndex;
  window.displayRegionInfo = displayRegionInfo;
  window.scanRegionKeys = scanRegionKeys;
}

function renderRegionViewerPanel() {
  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("regionViewerPanel")) return;

  const panel = document.createElement("section");
  panel.id = "regionViewerPanel";
  panel.setAttribute("data-panel", "regionViewer");
  panel.classList.add("minimizable-panel");

  panel.innerHTML = `
    <div class="panel-header" data-target="#regionViewerContent">
      <h2>🌌 Region Viewer</h2>
      <button id="updateRegionFromStatus">From Current System</button>
    </div>
    <div class="panel-content" id="regionViewerContent">
      <input type="number" id="regionSystemInput" placeholder="Enter system number" />
      <button id="regionSearchButton">Lookup</button>
      <button id="regionKeyScan">🔍 Scan Keys 1–10</button>
      <div id="regionInfoOutput"></div>
      <pre id="regionScanLog">Idle.</pre>
    </div>
  `;

  container.appendChild(panel);

  panel.querySelector(".panel-header").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") panel.classList.toggle("open");
  });

  document.getElementById("regionSearchButton").onclick = () => {
    const val = parseInt(document.getElementById("regionSystemInput").value);
    if (!isNaN(val)) displayRegionInfo(val);
  };

  document.getElementById("updateRegionFromStatus").onclick = updateRegionInfoFromStatus;
  document.getElementById("regionKeyScan").onclick = () => scanRegionKeys(1, 1100);
}

async function updateRegionInfoFromStatus() {
  const status = await apiRequest("POST", "status/");
  const system = Math.floor(status?.system_position || 0);
  displayRegionInfo(system);
}

function estimateSystemCountFromShares(shares) {
  for (let x = 1; x <= 50; x++) {
    let total = 0;
    let valid = true;
    for (let pct of shares) {
      const est = pct * x / 100;
      if (Math.abs(est - Math.round(est)) > 0.05) {
        valid = false;
        break;
      }
      total += Math.round(est);
    }
    if (valid && total === x) return x;
  }
  return "Unknown";
}

async function loadRegionsData() {
  try {
    const cached = localStorage.getItem("regionData");
    if (cached) {
      regionData = JSON.parse(cached);
      // console.log("✅ Loaded region data from localStorage.");
    } else {
      const res = await fetch("regions_dump.json");
      regionData = await res.json();
      // console.log(`✅ Loaded ${Object.keys(regionData).length} region groups`);
    }
  } catch (err) {
    console.warn("⚠️ No region data found, starting fresh.");
    regionData = {};
  }
}

function getAllRegionsSorted() {
  return Object.values(regionData).flat().sort((a, b) => a.start - b.start);
}

function lookupRegionBySystem(systemNumber) {
  const regions = getAllRegionsSorted();
  return regions.find((r, i) => {
    const match = systemNumber >= r.start && systemNumber <= r.end;
    if (match) currentRegionIndex = i;
    return match;
  });
}

export function displayRegionByIndex(index) {
  const regions = getAllRegionsSorted();
  if (index < 0 || index >= regions.length) return;
  currentRegionIndex = index;
  displayRegionInfo(regions[index].start);
}

export function displayRegionInfo(systemNumber) {
  const infoDiv = document.getElementById("regionInfoOutput");
  if (!infoDiv) return;

  const region = lookupRegionBySystem(systemNumber);

  let html = `
    <div style="display:flex; align-items:center; justify-content:space-between;">
      <h3>📊 Region Summary for System ${systemNumber}</h3>
      <div class="region-nav top-nav">
        <button onclick="window.displayRegionByIndex(${currentRegionIndex - 1})">⬅️ Prev</button>
        <button onclick="window.displayRegionByIndex(${currentRegionIndex + 1})">Next ➡️</button>
      </div>
    </div>
  `;

  let sysCount = "Unknown";
  let sysConfidence = "❌ Unknown";
  if (region?.faction_shares?.length) {
    const shares = region.faction_shares.map(f => f.percentage);
    for (let x = 1; x <= 50; x++) {
      let total = 0;
      let valid = true;
      let fractional = false;

      for (let pct of shares) {
        const est = pct * x / 100;
        const rounded = Math.round(est);
        if (Math.abs(est - rounded) > 0.05) {
          valid = false;
          break;
        }
        if (Math.abs(est - rounded) > 0.01) fractional = true;
        total += rounded;
      }

      if (valid && total === x) {
        sysCount = x;
        region.system_estimate = x;
        sysConfidence = fractional ? "⚠ Approx" : "✔ Exact";
        break;
      }
    }
  }

  if (region) {
    const size = typeof sysCount === "number"
      ? ` — ~${sysCount} systems <span class="confidence-${sysConfidence[0]}">${sysConfidence}</span>`
      : "";
    const description = region.description?.trim()
      ? ` — 🧪 ${region.description}`
      : "";

    const visitStatus = region.has_visited ? "✅ Visited" : "❌ Unvisited";
    const visibleSystems = region.systems_nearby?.length || 0;

    html += `
      <div class="region-row">
        <span>📍 System:</span><span>${systemNumber}</span>
        <span>🔗 Region:</span><span>${region.name}</span>
        <span>🏴 Owner:</span><span>${region.owner_name} (${region.owner_percent}%)</span>
        <span>📏 Range:</span><span>${region.start}–${region.end}${size}${description}</span>
        <span>🧭 Status:</span><span>${visitStatus} (${visibleSystems} known systems)</span>
      </div>
    `;

    if (region.faction_shares?.length) {
      html += `<div class="region-factions">🧬 Factions:<ul>`;
      region.faction_shares.forEach(f => {
        html += `<li>${f.name} – ${f.percentage}%</li>`;
      });
      html += `</ul></div>`;
    }
  } else {
    html += `<p class="region-error">❌ No region found for System ${systemNumber}</p>`;
  }

  html += `
    <div class="region-nav">
      <button onclick="window.displayRegionByIndex(${currentRegionIndex - 1})">⬅️ Prev</button>
      <button onclick="window.displayRegionByIndex(${currentRegionIndex + 1})">Next ➡️</button>
    </div>
  `;

  infoDiv.innerHTML = html;
}

export async function scanRegionKeys(start = 1, end = 10) {
  const logEl = document.getElementById("regionScanLog");
  if (logEl) logEl.textContent = `📡 Scanning region keys ${start}–${end}...\n`;

  const regions = {};
  const log = [];

  for (let i = start; i <= end; i++) {
    try {
      const res = await apiRequest("GET", `lookup/nearby/regions/?region_key=${i}`, true);
      const region = res?.[i];

      if (!region) {
        log.push(`⚠️ [${i}] No valid region found`);
        continue;
      }

      const label = region.name?.trim() || `Unnamed_${i}`;
      let sysCount = "Unknown";
      if (region.faction_shares?.length) {
        sysCount = estimateSystemCountFromShares(region.faction_shares.map(f => f.percentage));
      }
      region.system_estimate = sysCount;
      region.region_key = i;

      regions[label] = regions[label] || [];
      regions[label].push(region);

      log.push(`✅ [${i}] ${label} (${region.start}–${region.end})`);
    } catch (err) {
      log.push(`❌ [${i}] Error: ${err.message}`);
    }
    await sleep(100);
  }

  regionData = regions;
  handleRegionScanCompletion(regions);

  if (logEl) logEl.textContent = `✅ Done.\n\n` + log.join("\n");
}

export function compareRegions(oldData, newData) {
  const oldFlat = Object.values(oldData).flat();
  const newFlat = Object.values(newData).flat();

  console.group("📊 Region Changes");

  newFlat.forEach(newRegion => {
    const oldRegion = oldFlat.find(r => r.start === newRegion.start && r.end === newRegion.end);
    if (!oldRegion) {
      console.log(`🌟 New Region: ${newRegion.name} (${newRegion.start}–${newRegion.end})`);
      return;
    }

    if (!Array.isArray(newRegion.faction_shares) || !Array.isArray(oldRegion.faction_shares)) return;

    let changed = false;
    const label = `📍 ${newRegion.name} (${newRegion.start}–${newRegion.end})`;

    // Compare faction shares
    const oldMap = Object.fromEntries(
      (oldRegion.faction_shares || []).map(f => [f.name, f.percentage])
    );

    (newRegion.faction_shares || []).forEach(f => {
      const oldPct = oldMap[f.name];
      if (oldPct === undefined) {
        console.log(`${label} ➕ New faction: ${f.name} (${f.percentage}%)`);
        changed = true;
      } else if (Math.abs(f.percentage - oldPct) >= 0.1) {
        console.log(`${label} ⚠️ ${f.name}: ${oldPct}% → ${f.percentage}%`);
        changed = true;
      }
      delete oldMap[f.name];
    });

    for (const missing of Object.keys(oldMap)) {
      console.log(`${label} ➖ ${missing} removed`);
      changed = true;
    }

    // Compare key fields
    const fields = ["owner_name", "owner_percent", "owner_strength", "description", "custom_name"];
    for (const key of fields) {
      if (oldRegion[key] !== newRegion[key]) {
        console.log(`${label} ✏️ ${key} changed: ${oldRegion[key]} → ${newRegion[key]}`);
        changed = true;
      }
    }
  });

  console.groupEnd();
}

export async function scanNearbySystemsForRegions(regionData) {
  const regions = Object.values(regionData).flat();
  const regionNearbyCache = {}; // 🔒 cache nearby data for later use
  console.group("🚀 Nearby System Scanner");

  for (const region of regions) {
    const key = region.region_key || Object.keys(regionData).find(k => regionData[k].includes(region));
    if (!key) continue;

    try {
      const res = await apiRequest("GET", `lookup/nearby/?region_key=${key}`, true);
      const systems = Array.isArray(res) ? res : [];
      regionNearbyCache[key] = systems;
      region.systems_nearby = systems; // 🔁 attach to region
      region.has_visited = systems.length > 0; // ✅ define visit status

      const expected = region.system_estimate || 0;
      const actual = systems.length;

      if (actual === 0) {
        console.log(`📍 Region ${key} (${region.name}) is unvisited or empty`);
      } else if (expected && actual < expected) {
        // console.warn(`⚠ Region ${key} has ${actual}/${expected} systems visible`);
        const undiscovered = await apiRequest("GET", `lookup/nearby/undiscovered/?region_key=${key}`, true);
        if (Array.isArray(undiscovered) && undiscovered.length > 0) {
          console.log(`🛁 Undiscovered in Region ${key}:`, undiscovered.map(s => s.system_name || s.system_id));
        }
      } else if (actual > expected) {
        // console.log(`🚀 Region ${key} has ${actual} systems (expected ${expected}) — new system(s)?`);
      }
    } catch (err) {
      console.error(`❌ Region ${key} scan failed:`, err.message);
    }

    await sleep(200);
  }

  // 🔐 Save cache for UI usage if needed elsewhere
  window.regionNearbyCache = regionNearbyCache;

  console.groupEnd();
}


export async function handleRegionScanCompletion(newRegionData) {
  const previous = JSON.parse(localStorage.getItem("regionData") || "{}");

  compareRegions(previous, newRegionData);

  // Save old → previous
  localStorage.setItem("previousRegionData", localStorage.getItem("regionData") || "{}");

  // Save new as current
  localStorage.setItem("regionData", JSON.stringify(newRegionData));

  // Optional: auto-download for archive
  const blob = new Blob([JSON.stringify(newRegionData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `regions_dump_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  // Scan nearby systems post-save
  await scanNearbySystemsForRegions(newRegionData);
}


