// modules/harvest_escape.js
import { apiRequest, sleep } from "../shared.js";

let harvesting = false;
let totalHarvested = 0;
let startTime = null;

export function initEscapeHarvesterPanel() {
  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("escapeHarvesterPanel")) return;

  const panel = document.createElement("section");
  panel.id = "escapeHarvesterPanel";
  panel.classList.add("minimizable-panel");
  panel.setAttribute("data-panel", "harvest_escape");

  panel.innerHTML = `
    <div class="panel-header" data-target="#escapeHarvesterContent">
      <h2>🧠 Escape Pod Harvester</h2>
      <span id="escapeHarvesterStatus">⛔ Idle</span>
      <button id="startEscapeHarvest">Start</button>
      <button id="stopEscapeHarvest" style="display:none">Stop</button>
    </div>
    <div class="panel-content" id="escapeHarvesterContent">
      <div>Detected: <span id="escapeDetected">0</span></div>
      <div>Harvested: <span id="escapeTotal">0</span></div>
      <div>Rate: <span id="escapeRate">0</span> pods/hr</div>
    </div>
  `;

  container.appendChild(panel);

  const startBtn = document.getElementById("startEscapeHarvest");
  const stopBtn = document.getElementById("stopEscapeHarvest");
  const statusEl = document.getElementById("escapeHarvesterStatus");

  startBtn.onclick = () => {
    harvesting = true;
    totalHarvested = 0;
    startTime = Date.now();
    startBtn.style.display = "none";
    stopBtn.style.display = "inline-block";
    statusEl.textContent = "⏳ Harvesting...";
    harvestAllEscapePods();
  };

  stopBtn.onclick = () => {
    harvesting = false;
    stopBtn.style.display = "none";
    startBtn.style.display = "inline-block";
    statusEl.textContent = "⛔ Stopped";
  };
}

async function harvestAllEscapePods() {
  let page = 0;
  let detected = 0;
  const MAX_HARVEST = 10000;

  while (harvesting && totalHarvested < MAX_HARVEST) {
    const res = await apiRequest("POST", `status/hold/?page=${page}`);
    const cargo = res?.consumables || {};
    let foundSomething = false;

    for (const key in cargo) {
      if (key === "group_total_weight") continue;
      const item = cargo[key];
      if (!item?.consumable_name) continue;

      const name = item.consumable_name.toLowerCase();
      if (name.includes("escape pod") && item.consumable_id && item.amount > 0) {
        detected += item.amount;
        foundSomething = true;

        for (let i = 0; i < item.amount && totalHarvested < MAX_HARVEST; i++) {
          if (!harvesting) return;
          try {
            await apiRequest("POST", `action/cargo/consumables/organs/?consumable_id=${item.consumable_id}`);
            totalHarvested++;
            updateHarvestUI(detected);
            await sleep(100);
          } catch (err) {
            console.warn(`❌ Failed to harvest ${item.consumable_name}:`, err);
          }
        }

        if (totalHarvested >= MAX_HARVEST) break;
      }
    }

    if (!foundSomething) break;
    page++;
  }
  document.getElementById("escapeHarvesterStatus").textContent = "✅ Done";
}

function updateHarvestUI(detected) {
  const elapsed = (Date.now() - startTime) / 3600000;
  const rate = elapsed > 0 ? Math.round(totalHarvested / elapsed) : 0;
  document.getElementById("escapeDetected").textContent = detected;
  document.getElementById("escapeTotal").textContent = totalHarvested;
  document.getElementById("escapeRate").textContent = rate;
}
