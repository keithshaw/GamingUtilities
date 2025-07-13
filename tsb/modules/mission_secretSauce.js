import { apiRequest, sleep } from "../shared.js";

let running = false;
let panelInitialized = false;
let completions = 0;
let rejections = 0;
let startTime = Date.now();
console.log("🔄 mission_secretSauce.js loaded");

export function initSecretSaucePanel() {
  if (panelInitialized) return;
  panelInitialized = true;

  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("secretSaucePanel")) return;

  const panel = document.createElement("section");
  panel.id = "mission_secretSaucePanel";
  panel.setAttribute("data-panel", "mission_secretSauce");
  panel.classList.add("minimizable-panel");

  panel.innerHTML = `
    <div class="panel-header" data-target="#secretSauceContent">
      <h2>🧪 Secret Sauce</h2>
      <div id="secretSauceStatus">Idle</div>
      <button id="secretSauceToggle">Start</button>
    </div>
    <div class="panel-content" id="secretSauceContent">
      <pre id="secretSauceLog">Idle.</pre>
      <div class="sauce-metrics">
        <div>✅ Completions: <span id="sauceComplete">0</span></div>
        <div>❌ Rejections: <span id="sauceReject">0</span></div>
        <div>📈 Rate/hr: <span id="sauceRate">0</span></div>
      </div>
    </div>
  `;

  container.appendChild(panel);

  document.getElementById("secretSauceToggle").onclick = () => {
    running = !running;
    document.getElementById("secretSauceToggle").innerText = running ? "Stop" : "Start";
    updateSauceStatus(running ? "🟢 Running..." : "⛔ Stopped.");
    if (running) runSecretSauceLoop();
  };

  panel.querySelector(".panel-header").addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") return;
    panel.classList.toggle("open");
  });
}

function updateSauceStatus(msg) {
  const timestamp = `[${new Date().toLocaleTimeString()}]`;
  const log = document.getElementById("secretSauceLog");
  const status = document.getElementById("secretSauceStatus");

  if (log) {
    const lines = log.textContent.split("\n").slice(0, 20);
    log.textContent = [timestamp + " " + msg, ...lines].join("\n");
  }

  if (status) {
    const rate = getHourlyRate();
    status.textContent = `${msg} [C:${completions} R:${rejections} | ${rate}/hr]`;
  }

  updateSauceMetrics();
}

function updateSauceMetrics() {
  document.getElementById("sauceComplete").textContent = completions;
  document.getElementById("sauceReject").textContent = rejections;
  document.getElementById("sauceRate").textContent = getHourlyRate();
}

function getHourlyRate() {
  const elapsedHours = (Date.now() - startTime) / 3600000;
  return (completions / elapsedHours).toFixed(1);
}

async function runSecretSauceLoop() {
  while (running) {
    try {
      const missionStatus = await apiRequest("POST", "status/missions/");
      const active = Object.values(missionStatus || {}).find(m => m.category_name?.includes("Secret Sauce"));

      if (active) {
        updateSauceStatus(`🧾 Continuing mission #${active.mission_id}...`);
        const res = await apiRequest("POST", `missions/step_complete/?mission_id=${active.mission_id}&step=2`);
        const failed = !res?.success || !res?.mission_complete || /could not|fail|missing/i.test(res?.description || "");

        if (failed) {
          updateSauceStatus(`❌ Step 2 failed. Rejecting #${active.mission_id}...`);
          await apiRequest("POST", `missions/mission/reject/?mission_id=${active.mission_id}`);
          rejections++;
        } else {
          updateSauceStatus(`✅ Step 2 complete for #${active.mission_id}`);
          completions++;
        }

        await sleep(500);
        continue;
      }

      updateSauceStatus(`🔎 Scanning for Secret Sauce missions...`);
      const data = await apiRequest("POST", "missions/?filter_distance=0&filter_skill=-1&filter_factor=26&filter_faction=0&filter_type=0&term=0&sort=0");
      const board = [...(data?.missions || []), ...(data?.board || [])];
      const secret = board.find(m => m.category_name?.includes("Secret Sauce"));

      if (secret) {
        updateSauceStatus(`🧾 Accepting mission #${secret.mission_id}...`);
        await apiRequest("POST", `missions/step_complete/?mission_id=${secret.mission_id}&step=1`);
        await sleep(500);

        updateSauceStatus(`🔁 Attempting step 2 for #${secret.mission_id}...`);
        const res = await apiRequest("POST", `missions/step_complete/?mission_id=${secret.mission_id}&step=2`);
        const failed = !res?.success || !res?.mission_complete || /could not|fail|missing/i.test(res?.description || "");

        if (failed) {
          updateSauceStatus(`❌ Failed. Rejecting mission #${secret.mission_id}`);
          await apiRequest("POST", `missions/mission/reject/?mission_id=${secret.mission_id}`);
          rejections++;
        } else {
          updateSauceStatus(`✅ Success! Step 2 complete for #${secret.mission_id}`);
          completions++;
        }
      } else {
        updateSauceStatus("📭 No valid Secret Sauce missions found.");
      }

      await sleep(1000);
    } catch (err) {
      updateSauceStatus(`⚠️ Error: ${err.message}`);
      running = false;
      document.getElementById("secretSauceToggle").innerText = "Start";
      break;
    }
  }
}
