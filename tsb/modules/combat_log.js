// modules/combat_log.js
import { apiRequest } from "../shared.js";

let combatLogInterval = null;
const lifetimeStats = { damageDone: {}, damageTaken: {}, movement: {} };
const sessionStats = { damageDone: {}, damageTaken: {}, movement: {} };

export function init() {
  renderCombatLogPanel();
  startCombatLogWatcher();
}

function renderCombatLogPanel() {
  const target = document.querySelector("#huntingPanelContent");
  if (!target || document.getElementById("combatLogPanel")) return;

  const panel = document.createElement("div");
  panel.id = "combatLogPanel";
  panel.style.cssText = `
    position: absolute;
    top: 20px;
    right: 0;
    background: #111;
    color: #ccc;
    font-family: monospace;
    font-size: 0.7em;
    padding: 8px;
    width: 340px;
    height: 420px;
    overflow-y: auto;
    border-radius: 8px;
    z-index: 99;
  `;
  panel.innerHTML = `
    <style>
      .log-section h4, .stats-sub h4 {
        margin: 6px 0 2px;
        cursor: pointer;
        background: #222;
        padding: 4px;
        border-radius: 4px;
      }
      .log-section.collapsed .log-entries,
      .stats-sub.collapsed .stats-body {
        display: none;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        padding: 4px 0;
      }
      .movement-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px 12px;
      }
    </style>
    <div class="log-section" id="log-you">
      <h4 onclick="this.parentElement.classList.toggle('collapsed')">🧍 You</h4>
      <div class="log-entries" id="logYouText">...</div>
    </div>
    <div class="log-section" id="log-crew">
      <h4 onclick="this.parentElement.classList.toggle('collapsed')">🧑‍🤝‍🧑 Crew</h4>
      <div class="log-entries" id="logCrewText">...</div>
    </div>
    <div class="log-section" id="log-enemy">
      <h4 onclick="this.parentElement.classList.toggle('collapsed')">🐉 Enemies</h4>
      <div class="log-entries" id="logEnemyText">...</div>
    </div>
    <div id="combatStatsText">Stats...</div>
  `;
  target.appendChild(panel);
}

function startCombatLogWatcher(interval = 2000) {
  if (combatLogInterval) clearInterval(combatLogInterval);
  combatLogInterval = setInterval(fetchCombatLogOnly, interval);
}

async function fetchCombatLogOnly() {
  try {
    const res = await apiRequest("POST", "personal_combat/");
    const log = res?.session?.log ?? [];
    const condensed = parseCombatLog(log);

    document.getElementById("logYouText").innerHTML = condensed.you.join("<br>");
    document.getElementById("logCrewText").innerHTML = condensed.crew.join("<br>");
    document.getElementById("logEnemyText").innerHTML = condensed.enemy.join("<br>");
    document.getElementById("combatStatsText").innerHTML = renderCombatStats();
  } catch (e) {
    console.error("🔥 Failed to fetch combat log:", e);
  }
}

function parseCombatLog(log, maxEntries = 100) {
  const buckets = { you: {}, crew: {}, enemy: {} };
  sessionStats.damageDone = {};
  sessionStats.damageTaken = {};
  sessionStats.movement = {};

  for (const entry of log.slice().reverse()) {
    const { entity_type, text } = entry;
    const target = entity_type === 1 ? "you" : entity_type === 2 ? "crew" : "enemy";

    const weaponHit = text.match(/^(.*?) used weapon .*? at (.*?) for: ([A-Z] -?\d+|No damage\.|Miss\.)/i);
    if (weaponHit) {
      const [_, attacker, targetName, result] = weaponHit;
      let amount = 0;
      const hit = result.match(/-?(\d+)/);
      if (hit) amount = parseInt(hit[1]);
      if (result.includes("Miss") || result.includes("No damage")) amount = 0;

      if (entity_type === 1 || entity_type === 2) {
        sessionStats.damageDone[attacker] = (sessionStats.damageDone[attacker] || 0) + amount;
        lifetimeStats.damageDone[attacker] = (lifetimeStats.damageDone[attacker] || 0) + amount;
      } else {
        sessionStats.damageTaken[targetName] = (sessionStats.damageTaken[targetName] || 0) + amount;
        lifetimeStats.damageTaken[targetName] = (lifetimeStats.damageTaken[targetName] || 0) + amount;
      }

      const key = `${attacker} ➜ ${targetName} 💥${result}`;
      buckets[target][key] = (buckets[target][key] || 0) + 1;
      continue;
    }

    const moveMatch = text.match(/^(.+?) moved ([\+\-]?\d+)[mM]/);
    if (moveMatch) {
      const [_, mover, dist] = moveMatch;
      sessionStats.movement[mover] = (sessionStats.movement[mover] || 0) + 1;
      lifetimeStats.movement[mover] = (lifetimeStats.movement[mover] || 0) + 1;
      const key = `${mover} 🚶 (${dist}m)`;
      buckets[target][key] = (buckets[target][key] || 0) + 1;
      continue;
    }

    buckets[target][text] = (buckets[target][text] || 0) + 1;
  }

  const formatBucket = (obj) =>
    Object.entries(obj).slice(0, maxEntries).map(([text, count]) =>
      count > 1 ? `${text} ×${count}` : text
    );

  return {
    you: formatBucket(buckets.you),
    crew: formatBucket(buckets.crew),
    enemy: formatBucket(buckets.enemy)
  };
}

function renderCombatStats() {
  const formatSection = (label, current, total, isGrid = false, id = "") => {
    const sorted = Object.keys({ ...current, ...total }).sort((a, b) => (total[b] || 0) - (total[a] || 0));
    const top = sorted[0] ? `${sorted[0]} (${total[sorted[0]]})` : "None";
    const rows = sorted.map(k => `<div>${k}: ${current[k] || 0} (T: ${total[k] || 0})</div>`).join("");

    const block = document.createElement("div");
    block.className = "stats-sub";
    block.id = id;
    block.innerHTML = `
      <h4 onclick="this.parentElement.classList.toggle('collapsed')">
        ${label} <span style='float:right;opacity:0.6'>${top}</span>
      </h4>
      <div class='stats-body ${isGrid ? 'movement-grid' : ''}'>${rows}</div>
    `;
    return block.outerHTML;
  };

  const wrapper = document.createElement("div");
  wrapper.className = "stats-grid";
  wrapper.innerHTML =
    formatSection("🗡️ Damage Done", sessionStats.damageDone, lifetimeStats.damageDone, false, "damageDoneBlock") +
    formatSection("🛡️ Damage Taken", sessionStats.damageTaken, lifetimeStats.damageTaken, false, "damageTakenBlock") +
    formatSection("🚶 Movement", sessionStats.movement, lifetimeStats.movement, true, "movementBlock");

  return wrapper.outerHTML;
}
