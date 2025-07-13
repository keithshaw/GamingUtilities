// modules/account_scanner.js
import { apiRequest } from "../shared.js";

let panelInitialized = false;

let scanResults = [];
let failedIds = JSON.parse(localStorage.getItem("accountScanFailed") || "[]");
const STORAGE_KEY_RESULTS = "accountScanResults";
const STORAGE_KEY_FAILS = "accountScanFailed";

let ignoreFailed = true;
let activeIds = new Set();
let idleQueue = [];
let liveFeed = [];

let listEl, alertsEl, filterEl, fullToggleEl;

export function initAccountScannerPanel() {
  if (panelInitialized) return;
  panelInitialized = true;

  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("accountScannerPanel")) return;

  const panel = document.createElement("section");
  panel.id = "accountScannerPanel";
  panel.setAttribute("data-panel", "account_scanner");
  panel.classList.add("minimizable-panel");

  panel.innerHTML = `
    <div class="panel-header" data-target="#accountScannerContent">
      <h2>🔍 Account Scanner</h2>
      <div style="display:flex; gap:6px; align-items:center;">
        <button id="runAccountScan">Full Scan</button>
        <button id="runLiveUpdate">Live Update</button>
        <label><input type="checkbox" id="fullScanToggle" /> Include Failed</label>
        <input type="text" id="accountFilterInput" placeholder="Search..." style="margin-left:auto; width:120px;" />
      </div>
    </div>
    <div class="panel-content" id="accountScannerContent">
      <div id="accountScannerLog" style="max-height:220px; overflow:auto; font-size:0.8em; white-space:pre-wrap;">Awaiting scan...</div>
      <div id="accountScannerAlerts" style="margin-top:8px; border-top:1px solid #333; padding-top:6px; font-size:0.8em;">
        <strong>🔔 Alerts</strong>
        <ul id="liveAlerts" style="max-height:120px; overflow:auto; margin:4px 0; padding-left:16px;"></ul>
      </div>
    </div>
  `;

  container.appendChild(panel);

  listEl = document.getElementById("accountScannerLog");
  alertsEl = document.getElementById("liveAlerts");
  filterEl = document.getElementById("accountFilterInput");
  fullToggleEl = document.getElementById("fullScanToggle");

  document.getElementById("runAccountScan").addEventListener("click", runScan);
  document.getElementById("runLiveUpdate").addEventListener("click", runLiveUpdate);
  fullToggleEl.addEventListener("change", (e) => (ignoreFailed = !e.target.checked));
  filterEl.addEventListener("input", filterResults);

  panel.querySelector(".panel-header").addEventListener("click", () => {
    panel.classList.toggle("open");
  });

  // Load cached results
  const stored = localStorage.getItem(STORAGE_KEY_RESULTS);
  if (stored) {
    try {
      scanResults = JSON.parse(stored);
      renderGroupedResults(groupByStatus(scanResults));
      pushLog(`📦 Loaded cached results (${scanResults.length})`);
    } catch {
      scanResults = [];
    }
  }
}

function groupByStatus(results) {
  const groups = {};
  activeIds.clear();
  idleQueue = [];

  for (const acc of results) {
    const status = acc.status?.toLowerCase() || "unknown";
    if (!groups[status]) groups[status] = [];
    groups[status].push(acc);

    if (status !== "idle" || (acc.last_login != null && acc.last_login < 10)) {
      activeIds.add(acc.id);
    } else {
      idleQueue.push(acc.id);
    }
  }

  for (const key in groups) {
    groups[key].sort((a, b) => (a.last_login ?? 9999) - (b.last_login ?? 9999));
  }

  return groups;
}

function renderGroupedResults(grouped) {
  listEl.innerHTML = "";

  for (const [status, accounts] of Object.entries(grouped)) {
    const group = document.createElement("details");
    group.open = true;

    const summary = document.createElement("summary");
    summary.textContent = `📂 ${status.toUpperCase()} (${accounts.length})`;
    group.appendChild(summary);

    const pre = document.createElement("pre");
    pre.textContent = accounts
      .map(
        (acc) =>
          `${acc.id} | ${acc.name || "–"} | lvl:${acc.level ?? "–"} | ${acc.status || "–"} | ${acc.last_login ?? "–"}m | ${acc.guild_name || "None"} | ${acc.faction_name || "None"}`
      )
      .join("\n");

    group.appendChild(pre);
    listEl.appendChild(group);
  }
}

function filterResults() {
  const filter = filterEl.value.toLowerCase();
  const filtered = scanResults.filter(
    (acc) =>
      acc.name?.toLowerCase().includes(filter) ||
      acc.status?.toLowerCase().includes(filter) ||
      acc.guild_name?.toLowerCase().includes(filter) ||
      acc.faction_name?.toLowerCase().includes(filter)
  );
  renderGroupedResults(groupByStatus(filtered));
}

function pushLog(msg) {
  const time = new Date().toLocaleTimeString();
  listEl.textContent += `\n${time} ▶ ${msg}`;
  listEl.scrollTop = listEl.scrollHeight;
}

function pushAlert(msg) {
  const time = new Date().toLocaleTimeString();
  liveFeed.unshift(`${time} - ${msg}`);
  if (liveFeed.length > 20) liveFeed.pop();
  alertsEl.innerHTML = liveFeed.map((e) => `<li>${e}</li>`).join("");
}

async function runScan() {
  scanResults = [];
  liveFeed = [];
  listEl.innerHTML = "🔍 Scanning all accounts...\n";
  alertsEl.innerHTML = "";
  const newFails = [];

  for (let id = 0; id <= 4200; id++) {
    if (ignoreFailed && failedIds.includes(id)) continue;

    try {
      const res = await apiRequest("POST", `lookup/user/?user_id=${id}`, true);
      if (res?.results?.[id]) {
        const acc = res.results[id];
        if (!acc.name || acc.name === "undefined") {
          newFails.push(id);
          continue;
        }
        scanResults.push({ id, ...acc });
        pushLog(`+ ${id} ${acc.name}`);
      } else {
        newFails.push(id);
      }
    } catch {
      newFails.push(id);
    }
  }

  failedIds = Array.from(new Set([...failedIds, ...newFails]));
  localStorage.setItem(STORAGE_KEY_FAILS, JSON.stringify(failedIds));
  localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify(scanResults));

  renderGroupedResults(groupByStatus(scanResults));
  pushLog(`✅ Scan complete. Found ${scanResults.length} accounts. (${newFails.length} failures)`);
}

async function runLiveUpdate() {
  if (!scanResults.length) {
    pushLog("⚠️ No cached data. Run a full scan first.");
    return;
  }

  pushLog("🔄 Live update started...");
  const grouped = groupByStatus(scanResults);
  renderGroupedResults(grouped);

  await rescanActive();

  const interval = setInterval(async () => {
    if (!idleQueue.length) {
      clearInterval(interval);
      pushLog("✅ Live update complete.");
      renderGroupedResults(groupByStatus(scanResults));
    } else {
      await slowlyRescanIdle();
    }
  }, 1000);
}

async function rescanActive() {
  const updates = Array.from(activeIds).map(async (id) => {
    try {
      const res = await apiRequest("POST", `lookup/user/?user_id=${id}`, true);
      if (res?.results?.[id]) {
        const newData = res.results[id];
        const old = scanResults.find((a) => a.id === id);
        if (old && newData.status !== old.status) {
          pushAlert(`${newData.name} status changed: ${old.status} → ${newData.status}`);
          Object.assign(old, newData);
        }
      }
    } catch {}
  });

  await Promise.all(updates);
}

async function slowlyRescanIdle() {
  const nextId = idleQueue.shift();
  if (!nextId) return;

  try {
    const res = await apiRequest("POST", `lookup/user/?user_id=${nextId}`, true);
    if (res?.results?.[nextId]) {
      const newData = res.results[nextId];
      const old = scanResults.find((a) => a.id === nextId);
      if (old && newData.status !== old.status) {
        pushAlert(`${newData.name} status changed: ${old.status} → ${newData.status}`);
        Object.assign(old, newData);
      }
    }
  } catch {}
}
