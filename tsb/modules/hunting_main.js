// modules/hunting_main.js
import { apiRequest, sleep } from "../shared.js";

let huntLoopActive = false;
let huntSession = null;
let huntStats = { scavenges: 0, moves: 0, startedAt: Date.now() };
let huntSmartInterval = null;

export function init() {
  renderHuntingPanel();
}

function renderHuntingPanel() {
  if (huntSmartInterval) clearInterval(huntSmartInterval);
  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("huntingPanel")) return;

  const panel = document.createElement("section");
  panel.id = "huntingPanel";
  panel.setAttribute("data-panel", "hunting_main");
  panel.className = "minimizable-panel";

  panel.innerHTML = `
    <div class="panel-header" data-target="#huntingPanelContent">
      <h2 style="margin-right: auto;">🧨 Hunting</h2>
      <span id="huntStatsDisplay" style="font-size: 0.6em; color: #888;"></span>
      <button id="huntToggleBtn" style="margin-left: auto;">Start</button>
    </div>
    <div class="panel-content" id="huntingPanelContent">
      <div id="huntHUD"></div>
      <div id="combatMap" style="margin-top: 10px; font-size: 0.85em;"></div>
      <div id="huntLog" style="height: 6em; overflow-y: scroll; font-size: 0.75em; background: #000; padding: 1px; border: 1px solid #333; margin-top: 8px;"></div>
    </div>
  `;

  container.appendChild(panel);

  const toggleBtn = document.getElementById("huntToggleBtn");
  toggleBtn.addEventListener("click", () => {
    huntLoopActive = !huntLoopActive;
    toggleBtn.textContent = huntLoopActive ? "Stop" : "Start";
    logHunt(huntLoopActive ? "🔄 Hunt loop started." : "⛔ Hunt loop stopped.");
    if (huntLoopActive) smartHuntLoop();
  });

  panel.querySelector(".panel-header").addEventListener("click", (e) => {
    if (e.target !== toggleBtn) panel.classList.toggle("open");
  });

  logHunt("📡 Panel ready.");
  updateCombatState();
}

function logHunt(message) {
  const logEl = document.getElementById("huntLog");
  if (!logEl) return;
  const entry = `[${new Date().toLocaleTimeString()}] ${message}<br>`;
  logEl.innerHTML = entry + logEl.innerHTML.split('<br>').slice(0, 5).join('<br>');
}

async function smartHuntLoop() {
  if (!huntLoopActive) return;

  await updateCombatState();
  if (!huntSession || !huntSession.terrain) {
    logHunt("⚠️ No session or terrain data — retrying...");
    setTimeout(smartHuntLoop, 500);
    return;
  }

  const pos = findPlayerPosition(huntSession.terrain);
  let ap = huntSession.player_details?.ap ?? 0;
  const terrain = huntSession.terrain || {};
  const corpsesHere = terrain?.[pos]?.entities?.corpses || {};
  const targets = huntSession.targets || [];
  const targetHere = targets.find(t => Number(t.terrain_step) === Number(pos));

  // === 0. Scavenge corpses if present
  if (Object.keys(corpsesHere).length > 0) {
    if (ap >= 3) {
      logHunt("⚰️ Looting...");
      await apiRequest("POST", "personal_combat/scavenge/");
      huntStats.scavenges++;
      await sleep(500);
      return setTimeout(smartHuntLoop, 100);
    } else {
      logHunt("🧪 Not enough AP, waiting...");
      while (huntLoopActive) {
        await apiRequest("POST", "personal_combat/scan/");
        await sleep(500);
        await updateCombatState();
        ap = huntSession.player_details?.ap ?? 0;
        if (ap >= 3) break;
      }
      return setTimeout(smartHuntLoop, 100);
    }
  }

  // === 1. If target is on current tile
  if (targetHere) {
    logHunt("🧿 Enemy nearby — scanning...");
    await apiRequest("POST", "personal_combat/scan/");
    return setTimeout(smartHuntLoop, 100);
  }

  // === 2. Move toward nearest visible corpse
  for (let i = pos + 1; i <= pos + 20; i++) {
    const tile = terrain?.[i];
    if (tile?.entities?.corpses && Object.keys(tile.entities.corpses).length > 0 &&
        (!tile.entities.wildlife || Object.keys(tile.entities.wildlife).length === 0)) {
      const steps = i - pos;
      logHunt(`➡️ Advancing ${steps} step(s) toward corpse @ ${i}`);
      for (let j = 0; j < steps && ap > 0; j++) {
        await apiRequest("POST", "personal_combat/move/?direction=1");
        huntStats.moves++;
        ap--;
        await sleep(150);
      }
      return setTimeout(smartHuntLoop, 100);
    }
  }

  // === 3. Scan and fallback move
  logHunt("🔭 Blind scanning...");
  await apiRequest("POST", "personal_combat/scan/");
  await sleep(500);
  return setTimeout(smartHuntLoop, 100);
}

function findPlayerPosition(terrain) {
  return Object.keys(terrain).map(Number).find(i => terrain[i]?.entities?.players?.[4026]);
}

async function fetchCombatState() {
  try {
    const res = await apiRequest("POST", "personal_combat/");
    return res?.session || null;
  } catch (e) {
    console.error("🔥 Combat fetch failed:", e);
    return null;
  }
}

async function updateCombatState() {
  const session = await fetchCombatState();
  if (!session) return;
  huntSession = session;
  renderCombatHUD();
  renderCombatMap(session.terrain);
}

function renderCombatHUD() {
  const el = document.getElementById("huntHUD");
  if (!el || !huntSession) return;

  const ap = huntSession.player_details?.ap ?? 0;
  const pos = findPlayerPosition(huntSession.terrain);
  const tile = huntSession.terrain?.[pos];

  const now = Date.now();
  const mins = (now - huntStats.startedAt) / 60000;
  const scavRate = (huntStats.scavenges / mins).toFixed(1);

  el.innerHTML = `
    <div style="font-family: monospace; font-size: 14px; line-height: 1.6;">
      <div><b>⚡ AP:</b> ${ap}</div>
      <div><b>📍 Nearby:</b> ${Object.keys(tile?.entities?.corpses || {}).length > 0 ? "☠️ Corpse " : ""}${Object.keys(tile?.entities?.wildlife || {}).length > 0 ? "🐾 Wildlife" : ""}</div>
      <div><b>🪙 Scavenges:</b> ${huntStats.scavenges} (${scavRate}/min)</div>
    </div>
  `;
}

function renderCombatMap(terrain) {
  const pos = findPlayerPosition(terrain);
  const range = 12;
  const start = Math.max(pos - range, 0);
  const end = pos + range;
  const mapEl = document.getElementById("combatMap");
  if (!mapEl) return;

  const rows = [];
  for (let i = start; i <= end; i++) {
    const ent = terrain[i]?.entities || {};
    let tag = `[${i}] `.padEnd(6);
    if (ent.players?.[4026]) tag += "🥝 You ";
    if (Object.keys(ent.corpses || {}).length > 0) tag += "☠️ ";
    if (Object.keys(ent.wildlife || {}).length > 0) tag += "🔥 ";

    rows.push(`<span style="color:#aaa;">${tag}</span>`);
  }

  mapEl.innerHTML = `<pre style="font-family: monospace; font-size: 0.85em;">${rows.join("\n")}</pre>`;
}
