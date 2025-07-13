import { apiRequest, sleep } from "../shared.js";

let running = false;
let panelInitialized = false;
let completions = 0;
let rejections = 0;
let failsafeCounter = 0;
let startTime = Date.now();

export function initButcher() {
  if (panelInitialized) return;
  panelInitialized = true;

  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("butcherPanel")) return;

  const panel = document.createElement("section");
  panel.id = "butcherPanel";
  panel.setAttribute("data-panel", "butcher");
  panel.classList.add("minimizable-panel");

  panel.innerHTML = `
    <div class="panel-header" data-target="#butcherContent">
      <h2>🔪 Butcher</h2>
      <div id="butcherStatus">Idle</div>
      <button id="butcherToggle">Start</button>
    </div>
    <div class="panel-content" id="butcherContent">
      <pre id="butcherLog">Idle.</pre>
      <div class="butcher-metrics">
        <div>✅ Completions: <span id="butcherComplete">0</span></div>
        <div>❌ Rejections: <span id="butcherReject">0</span></div>
        <div>📈 Rate/hr: <span id="butcherRate">0</span></div>
      </div>
    </div>
  `;

  container.appendChild(panel);

  document.getElementById("butcherToggle").onclick = () => {
    running = !running;
    document.getElementById("butcherToggle").innerText = running ? "Stop" : "Start";
    updateButcherStatus(running ? "🟢 Running..." : "⛔ Stopped.");
    if (running) runButcherLoop();
  };

  panel.querySelector(".panel-header").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") panel.classList.toggle("open");
  });
}

function updateButcherStatus(msg) {
  const timestamp = `[${new Date().toLocaleTimeString()}]`;
  const log = document.getElementById("butcherLog");
  const status = document.getElementById("butcherStatus");

  if (log) {
    const lines = log.textContent.split("\n").slice(0, 19);
    log.textContent = [timestamp + " " + msg, ...lines].join("\n");
  }

  if (status) {
    const rate = getHourlyRate();
    status.textContent = `${msg} [C:${completions} R:${rejections} | ${rate}/hr]`;
  }

  updateButcherMetrics();
}

function updateButcherMetrics() {
  document.getElementById("butcherComplete").textContent = completions;
  document.getElementById("butcherReject").textContent = rejections;
  document.getElementById("butcherRate").textContent = getHourlyRate();
}

function getHourlyRate() {
  const elapsedHours = (Date.now() - startTime) / 3600000;
  return (completions / elapsedHours).toFixed(1);
}

async function runButcherLoop() {
  while (running) {
    try {
      const missionStatus = await apiRequest("POST", "status/missions/");
      const active = Object.values(missionStatus || {}).find(m => m.category_name?.includes("Butcher"));

      if (active) {
        updateButcherStatus(`🧾 Finishing mission #${active.mission_id}...`);
        const res = await apiRequest("POST", `missions/step_complete/?mission_id=${active.mission_id}&step=2`);
        const failed = !res?.success || !res?.mission_complete || /could not|fail|missing/i.test(res?.description || "");

        if (failed) {
          updateButcherStatus(`❌ Step 2 failed. Rejecting #${active.mission_id}`);
          await apiRequest("POST", `missions/mission/reject/?mission_id=${active.mission_id}`);
          rejections++;
          failsafeCounter++;
        } else {
          updateButcherStatus(`✅ Mission #${active.mission_id} completed`);
          completions++;
          failsafeCounter = 0;
        }

        await sleep(200);
        continue;
      }

      updateButcherStatus(`🔍 Scanning for local Butcher missions...`);
      const data = await apiRequest("POST", "missions/?filter_distance=0&filter_skill=-1&filter_factor=1&filter_faction=0&filter_type=0&term=0&sort=0");
      const board = [...(data?.missions || []), ...(data?.board || [])];

      const butcher = board.find(m => m.category_id === 66 && m.mission_distance === 0);
      const reject_mission = board.find(m => m.category_id === 66 && m.mission_distance > 0);


      if (butcher) {
        updateButcherStatus(`🧾 Accepting #${butcher.mission_id}...`);
        await apiRequest("POST", `missions/step_complete/?mission_id=${butcher.mission_id}&step=1`);
        await sleep(100);

        updateButcherStatus(`🔁 Attempting step 2...`);
        const res = await apiRequest("POST", `missions/step_complete/?mission_id=${butcher.mission_id}&step=2`);
        const failed = !res?.success || !res?.mission_complete || /could not|fail|missing/i.test(res?.description || "");

        if (failed) {
          updateButcherStatus(`❌ Step 2 failed. Rejecting #${butcher.mission_id}`);
          await apiRequest("POST", `missions/mission/reject/?mission_id=${butcher.mission_id}`);
          rejections++;
          failsafeCounter++;
        } else {
          updateButcherStatus(`✅ Mission #${butcher.mission_id} completed`);
          completions++;
          failsafeCounter = 0;
        }
      } else {
        updateButcherStatus("📭 No local Butcher missions found.");
        updateButcherStatus(`🧾 Accepting #${reject_mission.mission_id}...`);
        await apiRequest("POST", `missions/step_complete/?mission_id=${reject_mission.mission_id}&step=1`);
        updateButcherStatus(`❌ REJECTING #${reject_mission.mission_id}...`);
        await apiRequest("POST", `missions/mission/reject/?mission_id=${reject_mission.mission_id}`);
        failsafeCounter++;
        rejections++;

      }

      if (failsafeCounter >= 5) {
        updateButcherStatus("🚫 Failsafe triggered (5+ rejects). Halting.");
        running = false;
        failsafeCounter = 0;
        document.getElementById("butcherToggle").innerText = "Start";
        break;
      }

      await sleep(300);
    } catch (err) {
      updateButcherStatus(`⚠️ Error: ${err.message}`);
      running = false;
      document.getElementById("butcherToggle").innerText = "Start";
      break;
    }
  }
}
