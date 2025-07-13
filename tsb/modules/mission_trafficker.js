// modules/mission_trafficker.js
import { apiRequest, sleep } from "../shared.js";

let traffickerLoopActive = false;
let currentSystemId = null;

export function initTraffickerPanel() {
  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("traffickerPanel")) return;

  const panel = document.createElement("section");
  panel.id = "traffickerPanel";
  panel.classList.add("minimizable-panel");
  panel.setAttribute("data-panel", "trafficker");

  panel.innerHTML = `
    <div class="panel-header" data-target="#traffickerContent">
      <h2>📦 Trafficker Loop</h2>
      <span id="status-trafficker">⛔ Idle</span>
      <button id="startTrafficker">Start</button>
      <button id="stopTrafficker" style="display: none;">Stop</button>
    </div>
    <div class="panel-content" id="traffickerContent">
      <pre id="traffickerLog">Idle.</pre>
    </div>
  `;

  container.appendChild(panel);

  const statusEl = document.getElementById("status-trafficker");
  const startBtn = document.getElementById("startTrafficker");
  const stopBtn = document.getElementById("stopTrafficker");

  startBtn.onclick = () => {
    traffickerLoopActive = true;
    startBtn.style.display = "none";
    stopBtn.style.display = "inline-block";
    updateStatus("⏳ Running loop...");
    runTraffickerLoop();
  };

  stopBtn.onclick = () => {
    traffickerLoopActive = false;
    stopBtn.style.display = "none";
    startBtn.style.display = "inline-block";
    updateStatus("⛔ Stopped");
  };
}

function updateStatus(text) {
  const el = document.getElementById("status-trafficker");
  if (el) el.textContent = text;
}

async function runTraffickerLoop() {
  const log = (msg) => {
    const out = document.getElementById("traffickerLog");
    if (out) out.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + out.textContent.split("\n").slice(0, 19).join("\n");
    updateStatus(msg);
  };

  try {
    const sys = await apiRequest("POST", "location/");
    currentSystemId = sys?.position || null;
    log(`📍 Current system: ${currentSystemId}`);

    while (traffickerLoopActive) {
      const missionStatus = await apiRequest("POST", "status/missions/");
      const current = Object.values(missionStatus || {}).find(m => m.category_id === 67);

      if (current) {
        const { mission_id, percentage } = current;
        log(`🚫 Rejecting pre-existing mission #${mission_id}`);
        await apiRequest("POST", `missions/mission/reject/?mission_id=${mission_id}`);
        await sleep(1000);
        continue;
      }

      const missionData = await apiRequest("POST", "missions/?filter_distance=0&filter_skill=-1&filter_factor=1&filter_faction=0&filter_type=0&term=0&sort=0");
      const mission = missionData?.board?.find(m => m.category_id === 67 && m.mission_distance === 0);

      if (!mission) {
        log("❌ No valid Trafficker missions found.");
        await sleep(30000);
        continue;
      }

      log(`📦 Accepting mission #${mission.mission_id}`);
      await apiRequest("POST", `missions/step_complete/?mission_id=${mission.mission_id}&step=1`);
      await sleep(1000);

      log(`🛸 Moving to local system ${currentSystemId}`);
      await apiRequest("POST", "action/sublight/start/", { position: currentSystemId }, true);

      for (let i = 0; i < 300; i++) {
        await sleep(2000);
        const check = await apiRequest("POST", "status/missions/");
        const finished = Object.values(check || {}).find(m => m.category_id === 67 && m.percentage >= 67);
        if (finished) {
          log(`🎯 Completing mission #${finished.mission_id}`);
          await apiRequest("POST", `missions/step_complete/?mission_id=${finished.mission_id}&step=3`);
          // await apiRequest("POST", `action/cargo/equipment/store_all/?structure_id=35215`);
          // await apiRequest("POST", `action/cargo/consumables/store_all/?structure_id=35215`);
          break;
        }
      }
    }
  } catch (err) {
    console.error("❌ Trafficker loop error:", err);
    updateStatus("❌ Loop error");
    traffickerLoopActive = false;
  }
}
