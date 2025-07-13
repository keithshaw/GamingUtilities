import { apiRequest, sleep } from "../shared.js";

let missionsCompleted = 0;
let sessionStart = Date.now();
let cachedMissions = [];
let isRunning = false;
let seenMissionIds = new Set();

function renderDecryptPanel() {
  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("decryptPanel")) return;

  const panel = document.createElement("section");
  panel.id = "decryptPanel";
  panel.setAttribute("data-panel", "decrypt");
  panel.classList.add("minimizable-panel");

  panel.innerHTML = `
    <div class="panel-header" data-target="#decryptContent">
      <h2>🔐 Decrypt Missions</h2>
      <div id="decryptStats" class="inline-debug">Idle</div>
      <button id="decryptToggle">Start</button>
    </div>
    <div class="panel-content" id="decryptContent">
      <pre id="decryptStatus">Idle.</pre>
      <div id="decryptDetails" class="decrypt-stats">
        <div>🧾 Missions Completed: <span id="decryptMissions">0</span></div>
        <div>📈 Missions/hour: <span id="decryptRate">0</span></div>
        <div>💰 Total Profit: <span id="decryptProfit">0</span> gp</div>
        <div>🕒 Profit/hour: <span id="decryptProfitRate">0</span> gp</div>
      </div>
    </div>
  `;
  container.appendChild(panel);

  const header = panel.querySelector(".panel-header");
  header.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") return;
    panel.classList.toggle("open");
  });

  const toggleBtn = document.getElementById("decryptToggle");
  toggleBtn.onclick = () => {
    isRunning = !isRunning;
    toggleBtn.innerText = isRunning ? "Stop" : "Start";
    updateDecryptStatus(isRunning ? "🔍 Running..." : "⛔ Stopped.");
    if (isRunning) {
      decryptLoop();
      startBackgroundScanLoop();
    }
  };
}

function updateDecryptStatus(msg) {
  const el = document.getElementById("decryptStatus");
  const bar = document.getElementById("decryptStats");
  if (el) el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  if (bar) bar.textContent = msg.replace(/^\[.*?\]\s?/, "");
}

function updateDecryptMetrics() {
  const elapsed = (Date.now() - sessionStart) / 3600000;
  const rate = missionsCompleted / elapsed;
  const profit = missionsCompleted * 130000;
  const profitRate = profit / elapsed;

  document.getElementById("decryptMissions").textContent = missionsCompleted;
  document.getElementById("decryptRate").textContent = rate.toFixed(1);
  document.getElementById("decryptProfit").textContent = profit.toLocaleString();
  document.getElementById("decryptProfitRate").textContent = profitRate.toLocaleString();
}
function trackSeen(id) {
  seenMissionIds.add(id);
  if (seenMissionIds.size > 500) {
    const first = seenMissionIds.values().next().value;
    seenMissionIds.delete(first);
  }
}

async function decryptLoop() {
  if (!isRunning) return;

  const guesses = [
    "ens vtb has been born at the colony on zion",
    "ens bonus has been born at the colon on titan",
    "ens sheep has been born at the colony on zion"
  ];

  // Reject current mission if exists
  const missionStatus = await apiRequest("POST", "status/missions/");
  const active = Object.values(missionStatus || {}).find(m => m.category_name?.includes("Decrypt"));
  if (active) {
    seenMissionIds.add(active.mission_id);
    updateDecryptStatus(`🗑️ Rejecting active mission #${active.mission_id}`);
    await apiRequest("POST", `missions/mission/reject/?mission_id=${active.mission_id}`);
    await sleep(300);
  }

  // Use cached mission if available
  while (cachedMissions.length > 0) {
    const mission = cachedMissions.shift();
    if (seenMissionIds.has(mission.mission_id)) continue;
    await runDecryptMission(mission.mission_id, guesses);
    return;
  }

  // Scan outward if no cached missions
  const distances = [0, 100, 500, 1000, -1];
  for (const distance of distances) {
    updateDecryptStatus(`📡 Scanning (distance: ${distance})...`);
    const data = await apiRequest("POST", `missions/?filter_distance=${distance}&filter_skill=-1&filter_factor=18&filter_faction=0&filter_type=0&term=0&sort=0`);
    const results = [...(data?.missions || []), ...(data?.board || []), ...(data?.active_board_missions || [])];
    const valid = results.filter(m => m.category_name?.includes("Decrypt") && !seenMissionIds.has(m.mission_id));

    if (valid.length > 0) {
      cachedMissions.push(...valid);
      const mission = cachedMissions.shift();
      await runDecryptMission(mission.mission_id, guesses);
      return;
    }
  }

  updateDecryptStatus("📭 No missions found. Waiting...");
  setTimeout(decryptLoop, 1000);
}

async function runDecryptMission(missionId, guesses) {
  try {
    updateDecryptStatus(`📥 Accepting mission #${missionId}...`);
    const step = await apiRequest("POST", `missions/step_complete/?mission_id=${missionId}&step=1`);

    // Immediately check if the mission changed
    const missionStatus = await apiRequest("POST", "status/missions/");
    const active = Object.values(missionStatus || {}).find(m => m.category_name?.includes("Decrypt"));

    if (!active) {
      updateDecryptStatus(`❌ No active decrypt mission after Step 1. Aborting.`);
      trackSeen(missionId);
      return setTimeout(decryptLoop, 300);
    }

    if (active.mission_id !== missionId) {
      updateDecryptStatus(`⚠️ Server assigned new mission: ${active.mission_id}. Retrying with correct ID.`);
      seenMissionIds.add(missionId);
      return runDecryptMission(active.mission_id, guesses); // Retry using new active mission ID
    }

    updateDecryptStatus(`💰 Step 1 complete for #${missionId}. Starting guesses...`);


    const normalizeGuess = (g) => g.trim().toLowerCase().replace(/\s+/g, " ");

    for (const base of guesses) {
      const guess = normalizeGuess(base);
      if (!isRunning) return;

      updateDecryptStatus(`🧪 Trying: "${guess}"`);
      console.log("🔍 Sending guess:", guess);

      const result = await apiRequest(
        "POST",
        `missions/mission/decrypt/?mission_id=${missionId}&guess=${encodeURIComponent(guess)}`
      );

      console.log("🧬 Response:", result);

      if (result?.success || result?.status === "completed") {
        missionsCompleted++;
        seenMissionIds.add(missionId);
        updateDecryptMetrics();
        updateDecryptStatus(`✅ Success: "${guess}"`);
        return setTimeout(decryptLoop, 300);
      }

      await sleep(250);
    }

    updateDecryptStatus("❌ All guesses failed. Rejecting...");
    seenMissionIds.add(missionId);
    await apiRequest("POST", `missions/mission/reject/?mission_id=${missionId}`);
    setTimeout(decryptLoop, 300);
  } catch (err) {
    updateDecryptStatus(`⚠️ Fatal error: ${err.message}`);
    isRunning = false;
    const toggle = document.getElementById("decryptToggle");
    if (toggle) toggle.innerText = "Start";
  }
}




async function startBackgroundScanLoop() {
  while (isRunning) {
    if (cachedMissions.length >= 5) {
      await sleep(300);
      continue;
    }

    const distances = [0, 100, 500, 1000, -1];
    for (const distance of distances) {
      if (!isRunning || cachedMissions.length >= 5) break;

      const data = await apiRequest("POST", `missions/?filter_distance=${distance}&filter_skill=-1&filter_factor=18&filter_faction=0&filter_type=0&term=0&sort=0`);
      const results = [...(data?.missions || []), ...(data?.board || []), ...(data?.active_board_missions || [])];
      const valid = results.filter(m => m.category_name?.includes("Decrypt") && !seenMissionIds.has(m.mission_id));
      cachedMissions.push(...valid);
      await sleep(250);
    }

    await sleep(300);
  }
}

window.decryptRunning = false;
renderDecryptPanel();

export function initDecryptPanel() {
  renderDecryptPanel();
}
export function resetModuleState() {
  isRunning = false;
  const panel = document.getElementById("decryptPanel");
  if (panel) panel.remove();
}
