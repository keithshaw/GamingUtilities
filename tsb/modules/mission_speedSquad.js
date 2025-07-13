// modules/mission_speedSquad.js
import { apiRequest, sleep } from "../shared.js";

let speedSquadLoopActive = false;

export function init() {
  renderSpeedSquadPanel();
}

function renderSpeedSquadPanel() {
  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("speedSquadPanel")) return;

  const panel = document.createElement("section");
  panel.id = "speedSquadPanel";
  panel.setAttribute("data-panel", "mission_speedSquad");
  panel.classList.add("minimizable-panel");

  panel.innerHTML = `
    <div class="panel-header" data-target="#speedSquadContent">
      <h2>🏎️ Speed & Squad</h2>
      <span id="speedSquadStatus" style="font-size: 0.75em; color: #aaa; margin-left: auto;">⏹️ Stopped</span>
      <button id="speedSquadToggle">Start</button>
    </div>
    <div class="panel-content" id="speedSquadContent">Idle.</div>
  `;

  container.appendChild(panel);

  document.getElementById("speedSquadToggle").onclick = () => {
    speedSquadLoopActive = !speedSquadLoopActive;
    document.getElementById("speedSquadToggle").textContent = speedSquadLoopActive ? "Stop" : "Start";
    document.getElementById("speedSquadStatus").textContent = speedSquadLoopActive ? "⏳ Running loop..." : "⏹️ Stopped";
    if (speedSquadLoopActive) runSpeedSquadLoop();
  };

  panel.querySelector(".panel-header").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") panel.classList.toggle("open");
  });
}

async function runSpeedSquadLoop() {
  const statusEl = document.getElementById("speedSquadStatus");
  const updateStatus = msg => statusEl.textContent = msg;

  while (speedSquadLoopActive) {
    try {
      updateStatus("📊 Checking status...");
      const missionStatus = await apiRequest("POST", "status/missions/");

      const activeSpeed = Object.values(missionStatus).find(m => m.category_id === 83);
      const activeSquad = Object.values(missionStatus).find(m => m.category_id === 37);

      for (const mission of [activeSpeed, activeSquad]) {
        if (mission && mission.percentage === 67) {
          await apiRequest("POST", `missions/step_complete/?mission_id=${mission.mission_id}&step=3`);
          updateStatus(`✅ Completed ${mission.category_name}`);
          await sleep(500);
        }
      }

      let speedMission = activeSpeed;
      let squadMission = activeSquad;

      if (!speedMission || speedMission.percentage === 67) {
        const speedData = await apiRequest("POST", "missions/?filter_distance=50&filter_skill=-1&filter_factor=23&filter_faction=0&filter_type=0&term=0&sort=0");
        speedMission = speedData?.board?.find(m => m.category_id === 83);
        if (speedMission) {
          await apiRequest("POST", `missions/step_complete/?mission_id=${speedMission.mission_id}&step=1`);
          updateStatus(`📦 Accepted Speed #${speedMission.mission_id}`);
          await sleep(500);
        }
      }

      if (!squadMission || squadMission.percentage === 67) {
        const squadData = await apiRequest("POST", "missions/?filter_distance=500&filter_skill=-1&filter_factor=14&filter_faction=0&filter_type=0&term=0&sort=0");
        squadMission = squadData?.board?.find(m => m.category_id === 37);
        if (squadMission) {
          await apiRequest("POST", `missions/step_complete/?mission_id=${squadMission.mission_id}&step=1`);
          updateStatus(`📦 Accepted Squad #${squadMission.mission_id}`);
          await sleep(500);
        }
      }

      // wait until both are ready
      updateStatus("⏳ Waiting to complete...");
      let attempts = 0;
      while (attempts++ < 300 && speedSquadLoopActive) {
        const updated = await apiRequest("POST", "status/missions/");
        const speedReady = updated?.[speedMission?.mission_id]?.percentage === 67;
        const squadReady = updated?.[squadMission?.mission_id]?.percentage === 67;

        if (speedReady || squadReady) break;
        updateStatus(`🕒 Progress — Speed: ${updated?.[speedMission?.mission_id]?.percentage || 0}%, Squad: ${updated?.[squadMission?.mission_id]?.percentage || 0}%`);
        await sleep(10000);
      }

      updateStatus("🏁 Turning in ready missions...");
      await apiRequest("POST", `missions/step_complete/?mission_id=${speedMission.mission_id}&step=3`);
      await sleep(500);
      await apiRequest("POST", `missions/step_complete/?mission_id=${squadMission.mission_id}&step=3`);
      await sleep(500);

      updateStatus("🔁 Looping...");
      await sleep(2000);
    } catch (err) {
      updateStatus(`❌ Error: ${err.message}`);
    }
  }
}

