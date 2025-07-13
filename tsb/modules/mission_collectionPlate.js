import { apiRequest, sleep } from "../shared.js";

let running = false;

export function initCollectionPlate() {
  renderCollectionPlatePanel();
}

function renderCollectionPlatePanel() {
  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("collectionPlatePanel")) return;

  const panel = document.createElement("section");
  panel.id = "collectionPlatePanel";
  panel.setAttribute("data-panel", "collectionPlate");
  panel.classList.add("minimizable-panel");

  panel.innerHTML = `
    <div class="panel-header" data-target="#collectionContent">
      <h2>🧺 Collection Plates</h2>
      <div style="margin-left: auto;">
        <button id="collectionToggle">Start</button>
      </div>
    </div>
    <div class="panel-content" id="collectionContent">
      <div id="collectionMissionResults">Idle...</div>
    </div>
  `;

  container.appendChild(panel);

  panel.querySelector(".panel-header").addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") return;
    panel.classList.toggle("open");
  });

  document.getElementById("collectionToggle").onclick = async () => {
    running = !running;
    document.getElementById("collectionToggle").innerText = running ? "Stop" : "Start";
    if (running) runCollectionLoop();
  };

  fetchCollectionMissions();
}

async function fetchCollectionMissions() {
  const container = document.getElementById("collectionMissionResults");
  if (!container) return;

  container.innerHTML = "Loading...";
  const url = "missions/?filter_distance=0&filter_skill=0&filter_factor=17&filter_faction=1&filter_type=0&term=0&sort=0";
  const data = await apiRequest("POST", url);
  const board = data?.board || [];

  const missions = board.filter(m => m.category_id === 27);
  if (missions.length === 0) {
    container.innerHTML = "No collection plate missions found.";
    return;
  }

  container.innerHTML = "";

  missions.forEach((m) => {
    const div = document.createElement("div");
    div.classList.add("mission-entry");
    div.id = `mission-${m.mission_id}`;
    div.innerHTML = `
      <div><strong>${m.mission_faction_name}</strong> — ${m.mission_rewards?.[1]?.reward_amount || "?"} credits</div>
      <div>
        <button onclick="window.runCollectionPlate(${m.mission_id})">Run</button>
        <span id="status-${m.mission_id}"></span>
      </div>
    `;
    container.appendChild(div);
  });

  window.runCollectionPlate = runCollectionPlate;
}

async function runCollectionLoop() {
  while (running) {
    const data = await apiRequest("POST", "missions/?filter_distance=500&filter_skill=0&filter_factor=17&filter_faction=0&filter_type=0&term=0&sort=0");
    const board = data?.board || [];
    const missions = board.filter(m => m.category_id === 27);

    for (let i = 0; i < Math.min(5, missions.length); i++) {
      if (!running) return;
      await runCollectionPlate(missions[i].mission_id);
      await sleep(500);
    }

    await sleep(1000);
  }
}

async function runCollectionPlate(missionId) {
  const statusEl = document.getElementById(`status-${missionId}`);
  try {
    if (statusEl) statusEl.textContent = "Accepting...";
    await apiRequest("POST", `missions/step_complete/?mission_id=${missionId}&step=1`);
    await sleep(500);

    if (statusEl) statusEl.textContent = "Completing...";
    await apiRequest("POST", `missions/step_complete/?mission_id=${missionId}&step=2`);
    if (statusEl) statusEl.textContent = "✓ Done";
  } catch (e) {
    if (statusEl) statusEl.textContent = "✗ Failed";
  }
}
