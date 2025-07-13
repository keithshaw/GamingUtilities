// modules/meditation.js
import { apiRequest, sleep } from "../shared.js";

let meditationLoopActive = false;
let currentMeditationLoopId = 0;
let lastLoopParams = { cycles: 9999, factorId: 10, factorDirection: -1 };

export function init() {
  if (document.getElementById("meditationPanel")) return;
  renderMeditationPanel();
}

const factorMap = {
  "warmth": 1,
  "reasoning": 2,
  "stability": 3,
  "dominance": 4,
  "liveliness": 5,
  "obedience": 6,
  "boldness": 7,
  "sensitivity": 8,
  "vigilance": 9,
  "imagination": 10,
  "solitude": 11,
  "apprehension": 12,
  "flexibility": 13,
  "confidence": 14,
  "perfection": 15,
  "tension": 16
};

function resolveFactorId(factor) {
  if (typeof factor === "string") {
    const normalized = factor.toLowerCase().trim();
    return factorMap[normalized] ?? (parseInt(normalized) || 10);
  }
  return factor ?? 10;
}

function startMeditationLoop(cycles = 9999, factor = 10, factorDirection = -1) {
  meditationLoopActive = true;
  currentMeditationLoopId++;
  const loopId = currentMeditationLoopId;

  const factorId = resolveFactorId(factor);
  lastLoopParams = { cycles, factorId, factorDirection };

  async function loop() {
    for (let cycle = 1; cycle <= cycles; cycle++) {
      if (!meditationLoopActive || loopId !== currentMeditationLoopId) break;

      const startTime = Date.now();
      const pct = Math.round((cycle / cycles) * 20);
      const progressLabel = document.getElementById("meditationProgress");
      if (progressLabel) progressLabel.textContent = `${cycle}/${cycles}`;

      console.log(`🧘 [${loopId}] Cycle ${cycle} [${"#".repeat(pct)}${"-".repeat(20 - pct)}] ${cycle}/${cycles}`);

      await apiRequest("POST", "action/meditation/start/", {
        factor_id: factorId,
        factor_direction: factorDirection
      }, true).catch(err => console.error("Start failed:", err));

      await sleep(60000);

      await apiRequest("POST", "action/meditation/stop/", {
        factor_id: factorId,
        factor_direction: factorDirection
      }, true).catch(err => console.error("Stop failed:", err));

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`⏱️ [${loopId}] Cycle finished in ${elapsed}s`);
      await sleep(1000);
    }

    if (loopId === currentMeditationLoopId) {
      const progressLabel = document.getElementById("meditationProgress");
      if (progressLabel) progressLabel.textContent = `Done ${lastLoopParams.cycles}/${lastLoopParams.cycles}`;
      const toggleBtn = document.getElementById("meditationToggle");
      if (toggleBtn) toggleBtn.textContent = "Start";
      console.log(`✅ [${loopId}] Meditation loop complete.`);
    }
  }

  loop();
}

function hardRestart(cycles = null, factor = null, factorDirection = null) {
  meditationLoopActive = false;
  currentMeditationLoopId++;

  const factorId = resolveFactorId(factor ?? lastLoopParams.factorId);
  const finalCycles = cycles ?? lastLoopParams.cycles;
  const finalDirection = factorDirection ?? lastLoopParams.factorDirection;

  console.log("🔁 Hard restart initiated...");

  apiRequest("POST", "action/meditation/stop/", {
    factor_id: factorId,
    factor_direction: finalDirection
  }, true).then(() => {
    console.log("🛑 Meditation stopped. Restarting...");
    setTimeout(() => startMeditationLoop(finalCycles, factorId, finalDirection), 1000);
  }).catch(err => {
    console.error("❌ Stop failed. Still restarting.");
    setTimeout(() => startMeditationLoop(finalCycles, factorId, finalDirection), 1000);
  });
}

function renderMeditationPanel() {
  const container = document.getElementById("mainContainer");
  if (!container) return;

  const panel = document.createElement("section");
  panel.id = "meditationPanel";
  panel.setAttribute("data-panel", "meditation");
  panel.className = "minimizable-panel";

  panel.innerHTML = `
    <div class="panel-header" data-target="#meditationContent">
      <h2>🧘 Meditation Loop <span id="meditationProgress" style="font-size: 0.8em; opacity: 0.7;">Stopped</span></h2>
      <button id="meditationToggle">Start</button>
    </div>
    <div class="panel-content" id="meditationContent">
      <label>Factor:
        <select id="meditationFactor">
          ${Object.entries(factorMap).map(([name]) => `<option value="${name}">${name[0].toUpperCase() + name.slice(1)}</option>`).join("")}
        </select>
      </label><br>
      <label>Direction:
        <select id="meditationDirection">
          <option value="-1">-1</option>
          <option value="+1">+1</option>
        </select>
      </label><br>
      <label>Cycles:
        <input type="number" id="meditationCycles" value="9999" min="1" style="width: 60px;" />
      </label>
    </div>
  `;

  container.appendChild(panel);

  const toggleBtn = panel.querySelector("#meditationToggle");
  toggleBtn.onclick = (e) => {
    e.stopPropagation();
    if (meditationLoopActive) {
      meditationLoopActive = false;
      toggleBtn.textContent = "Start";
      document.getElementById("meditationProgress").textContent = "Stopped";
    } else {
      const factor = document.getElementById("meditationFactor").value;
      const direction = parseInt(document.getElementById("meditationDirection").value);
      const cycles = parseInt(document.getElementById("meditationCycles").value);
      startMeditationLoop(cycles, factor, direction);
      toggleBtn.textContent = "Stop";
    }
  };

  panel.querySelector(".panel-header").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") {
      panel.classList.toggle("open");
    }
  });
}
