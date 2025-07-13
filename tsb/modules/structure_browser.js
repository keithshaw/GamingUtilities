// modules/structure_browser.js
// Structure Component Route Planner

import { apiRequest } from "../shared.js";

let panelInitialized = false;

const anchors = [
  { system_id: 2314, name: "Gnscr Industria", pos: 10724.8, ftl: 363 },
  { system_id: 2323, name: "Gnscr Yang", pos: 10751.5, ftl: 83 },
  { system_id: 2329, name: "Gnscr Sv 01", pos: 10832.2, ftl: 92 },
  { system_id: 2332, name: "Gnscr Sardai", pos: 10879.6, ftl: 51 },
  { system_id: 2338, name: "Gnscr Castellum", pos: 10923.3, ftl: 93 },
  { system_id: 2356, name: "Gnscr Otium", pos: 11002.30, ftl: 99 },
  { system_id: 2366, name: "Where Iron Meets Flesh", pos: 11022.30, ftl: 20 },
  { system_id: 2401, name: "Andoriana WH", pos: 11210.70, ftl: 0},
  { system_id: 2364, name: "Core WH", pos: 11020.70, ftl: 0}

];


export function initStructureBrowserPanel() {
  if (panelInitialized) return;
  panelInitialized = true;

  const container = document.querySelector("#mainContainer");
  if (!container || document.getElementById("structureBrowserPanel")) return;

  const panel = document.createElement("section");
  panel.id = "structureBrowserPanel";
  panel.classList.add("minimizable-panel", "open");
  panel.setAttribute("data-panel", "structure_browser");

  panel.innerHTML = `
    <div class="panel-header" data-target="#structureBrowserContent">
      <h2>🗺️ Structure Component Route Planner</h2>
      <input type="text" id="structureSearchInput" placeholder="Search term (default 'b')" />
      <button id="structureSearchBtn">Search</button>
    </div>
    <div class="panel-content" id="structureBrowserContent" style="display: flex; flex-direction: row; gap: 1em;">
      <ul id="structureResults" style="flex: 2; padding-left: 1em; margin: 0;"></ul>
      <ul id="mapReference" style="flex: 1; font-size: 0.9em;"></ul>
    </div>
  `;

  container.appendChild(panel);

  panel.querySelector(".panel-header").addEventListener("click", () => {
    panel.classList.toggle("open");
  });

  document.getElementById("structureSearchBtn").addEventListener("click", handleStructureSearch);
}

async function handleStructureSearch() {
  const term = document.getElementById("structureSearchInput").value || "b";
  const list = document.getElementById("structureResults");
  const ref = document.getElementById("mapReference");
  list.innerHTML = `<li>🔎 Searching for "<strong>${term}</strong>"...</li>`;
  ref.innerHTML = "";

  try {
    const status = await apiRequest("POST", "status/");
    const myPos = parseFloat(status?.location);
    const currentSystemId = status?.system_id;
    if (isNaN(myPos)) throw new Error("Could not determine your current position.");

    const enrichedAnchors = anchors.map(a => ({
      ...a,
      distance: parseFloat((a.pos - myPos).toFixed(1)),
      abs: Math.abs(a.pos - myPos).toFixed(1),
    }));

    const response = await apiRequest("POST", `search/structure_components/?term=${encodeURIComponent(term)}`);
    const raw = Object.values(response || {}).filter(r => r.amount > 0);

    const seenSystems = new Set();
    const systems = [];

    for (const r of raw) {
      const key = `${r.system_id}`;
      if (seenSystems.has(key)) continue;
      seenSystems.add(key);

      const distance = parseFloat((r.system_position - myPos).toFixed(1));
      const anchor = enrichedAnchors.find(anchor => Math.abs(anchor.pos - r.system_position) <= 20);
      const inRange = anchor && Math.abs(anchor.pos - r.system_position) <= anchor.ftl;

      systems.push({
        id: r.system_id,
        pos: r.system_position,
        name: r.system_name,
        faction: r.system_faction_name,
        body: r.body_name,
        dist: `${distance > 0 ? "+" : ""}${distance.toFixed(1)}`,
        abs: Math.abs(distance).toFixed(1),
        anchor: anchor?.name || null,
        highlight: inRange,
      });
    }

    systems.sort((a, b) => a.abs - b.abs);
    list.innerHTML = "";

    for (const s of systems) {
      const li = document.createElement("li");
      li.style = `${s.highlight ? "border-left: 4px solid #6f6; padding-left: 0.5em;" : "opacity: 0.4;"} margin-bottom: 1em; line-height: 1.5em;`;
      // console.log(s);
      li.innerHTML = `
        <div><strong>📡 ${s.name}</strong> <span style="font-size: 0.9em;">(position ${s.pos})</span></div>
        <div>🪐 <em>${s.body}</em> — ${s.faction}</div>
        <div>📏 <strong>${s.dist} ly</strong> from you</div>
        ${s.anchor ? `<div>🧭 Closest anchor: <strong>${s.anchor}</strong></div>` : `<div>🚫 No anchor within 30 ly</div>`}
        <div style="margin-top: 0.25em;">
          <button onclick="window.sublightTravel(${s.pos})">🛠 Sublight</button>
          <button onclick="window.ftlJump(${s.id})">⚡ FTL</button>
        </div>
      `;
      list.appendChild(li);
    }

    // Anchor Jump Menu
    ref.innerHTML = `<li style="margin-bottom: 0.5em;"><strong>🚀 Anchor Jump Points</strong></li>`;
    enrichedAnchors.sort((a, b) => a.abs - b.abs).forEach(anchor => {
      const li = document.createElement("li");
      li.style = "margin-bottom: 1em;";
      li.innerHTML = `
        <div><strong>📍 ${anchor.name}</strong></div>
        <div>📡 Position: <code>${anchor.pos}</code></div>
        <div>📏 From you: <strong>${anchor.distance > 0 ? "+" : ""}${anchor.distance} ly</strong></div>
        <div>🔋 Jump Range: <code>${anchor.ftl} ly</code></div>
        <button onclick="window.sublightTravel(${anchor.pos})">🛠 Sublight</button>
        <button onclick="window.ftlJump(${anchor.system_id})">⚡ FTL</button>
      `;
      ref.appendChild(li);
    });

    window.sublightTravel = async (targetPos) => {
      await apiRequest("POST", `/action/sublight/start/?position=${targetPos}`,true);
      console.log(`🛠 Sublight travel to ${targetPos} initiated.`);
    };

    window.ftlJump = async (systemId) => {
      try {
        const res = await apiRequest("POST", `/action/ftl/?system_id=${systemId}`);
        if (res?.success) {
          console.log(`⚡ FTL jump to system ${systemId} initiated.`);
        } else {
          if (res?.code === "F3") {
            alert("🚫 FTL Failed: Not enough charge to make this jump.");
          } else {
            alert(`❌ FTL Error: ${res?.description || "Unknown error."}`);
          }
          console.warn("FTL Jump response:", res);
        }
      } catch (err) {
        console.error("❌ FTL jump request failed:", err);
        alert("❌ FTL request error — check console.");
      }
    };


  } catch (err) {
    console.error("❌ Structure component search failed:", err);
    list.innerHTML = `<li>❌ Error: ${err.message || "Unknown issue."}</li>`;
  }
}

