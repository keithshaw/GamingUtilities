// Enhanced Galaxy Region Map with Filtering and Minimap Sync
let currentRegions = [];

const effectColors = {};
let nextColorIndex = 0;
const palette = [
  "#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#f39c12",
  "#1abc9c", "#e67e22", "#7f8c8d", "#d35400", "#8e44ad",
  "#2c3e50", "#16a085", "#c0392b", "#27ae60", "#2980b9",
  // New additions
  "#ff6f61", "#6b5b95", "#88b04b", "#f7cac9", "#92a8d1",
  "#955251", "#b565a7", "#009b77", "#dd4124", "#45b8ac",
  "#efa94a", "#5b5ea6", "#9b2335", "#dfcfbe", "#55b4b0",
  "#e15d44", "#7fcdcd", "#bc243c", "#c3447a", "#98b4d4",
  "#c94c4c", "#6c4f3d", "#ffb347", "#c2b280", "#6b4226"
];

function addOwnerSearch(regions) {
  const filterBar = document.getElementById("filterBar");
  if (!filterBar) return;

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "🔍 Search Owner";
  searchInput.style = "padding: 5px; font-size: 14px; width: 160px;";
  searchInput.id = "ownerSearchInput";

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      document.getElementById("regionContainer").style.display = "";
      document.getElementById("systemResults").style.display = "none";
      document.getElementById("regionScrollMap").style.display = "";
      renderRegions(regions);
      updateStats();
      return;
    }

    const matchedSystems = [];

    for (const region of regions) {
      for (const system of region.systems || []) {
        if ((system.owner || "").toLowerCase().includes(query)) {
          matchedSystems.push(system);
        }
      }
    }

    document.getElementById("regionContainer").style.display = "none";
    document.getElementById("regionScrollMap").style.display = "none";
    document.getElementById("systemResults").style.display = "";
    renderSystemResultsTable(matchedSystems);
    updateStats(matchedSystems.length);
  });

  filterBar.appendChild(searchInput);
}

function getColor(effect) {
  if (!effectColors[effect]) {
    effectColors[effect] = palette[nextColorIndex % palette.length];
    nextColorIndex++;
  }
  return effectColors[effect];
}

function createRegionElement(region) {
  const div = document.createElement("div");
  div.className = "region";
  div.style.backgroundColor = getColor(region.effect);
  div.title = `Region ${region.region}\n${region.effect || "Unknown"}\n${region.owner || "Unclaimed"}`;
  div.dataset.id = region.region;
  div.dataset.effect = region.effect || "Unknown";

  const label = document.createElement("div");
  label.className = "region-id";
  label.innerHTML = `
    <strong>#${region.region}</strong>
    <strong>${region.start_position} – ${region.end_position}</strong>
    <strong>${region.effect || "Unknown"}</strong>
  `;
  div.appendChild(label);

  // Always-visible system dots
  const dotBar = renderSystemDots(region);
  div.appendChild(dotBar);

div.addEventListener("click", () => {
  const existing = div.querySelector(".system-expanded-table");
  if (existing) {
    existing.remove();
    div.classList.remove("expanded");
    return;
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "system-expanded-table";

  const systemCount = (region.systems || []).length;
  const table = document.createElement("table");
  table.className = "region-system-table";

table.innerHTML = `
  <thead>
    <tr>
      <th colspan="6">🛰️ ${systemCount} Systems in Region</th>
    </tr>
    <tr>
      <th>Pos</th>
      <th>System</th>
      <th>Owner</th>
      <th>Faction</th>
      <th>Services</th>
      <th>Bodies</th>
    </tr>
  </thead>
  <tbody>
    ${(region.systems || [])
      .map((sys) => {
        const pos = sys.pos?.toFixed(1) ?? "—";
        const name = sys.name || `#${sys.id}`;
        const owner = sys.owner || "—";
        const faction = sys.faction || "—";
        const bodies = sys.bodies?.length ?? 0;
        const uncharted = sys.unchartedCount ? ` (+${sys.unchartedCount} uncharted)` : "";

        const services = sys.services?.length
          ? sys.services.map(s => s.slice(0, 3)).join(", ")
          : "—";

        return `
          <tr>
            <td>${pos}</td>
            <td>${name}</td>
            <td>${owner}</td>
            <td>${faction}</td>
            <td>${services}</td>
            <td>${bodies}${uncharted}</td>
          </tr>
        `;
      })
      .join("")}
  </tbody>
`;


  tableWrap.appendChild(table);
  div.appendChild(tableWrap);
  div.classList.add("expanded");
});



  div.addEventListener("mouseenter", () => {
    const detail = document.getElementById("detailPanel");
    if (detail) {
      detail.innerText =
        `🧭 Region ${region.region}\n` +
        `Effect: ${region.effect || "Unknown"}\n` +
        `Owner: ${region.owner || "Unclaimed"}\n` +
        `Systems: ${region.systems?.length || 0}\n` +
        `Start: ${region.start_position}\nEnd: ${region.end_position}`;
    }
  });

  return div;
}



function renderRegions(regions) {
  const container = document.getElementById("regionContainer");
  if (!container) return;
  container.innerHTML = '';

  regions.sort((a, b) => a.start_position - b.start_position);

  const grid = document.createElement("div");
  grid.className = "region-grid";

  regions.forEach(region => {
    const div = createRegionElement(region);
    grid.appendChild(div);
  });

  container.appendChild(grid);
  updateStats();
  updateScrollMap(regions);
}

function updateScrollMap(regions) {
  const scrollMap = document.getElementById("regionScrollMap");
  if (!scrollMap) return;

  scrollMap.innerHTML = '';
  const regionElems = Array.from(document.querySelectorAll(".region"))
    .filter(el => el.style.display !== 'none');

  regionElems.forEach((el) => {
    const pixel = document.createElement("div");
    pixel.className = "pixel";
    pixel.style.backgroundColor = el.style.backgroundColor;
    pixel.title = el.title;

    pixel.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    scrollMap.appendChild(pixel);
  });
}

function updateStats() {
  let statBox = document.getElementById("regionStats");
  if (!statBox) {
    statBox = document.createElement("div");
    statBox.id = "regionStats";
    statBox.style = "font-size: 13px; color: #bbb;";
    document.getElementById("filterBar")?.appendChild(statBox);
  }
  const all = document.querySelectorAll('.region').length;
  const shown = Array.from(document.querySelectorAll('.region')).filter(el => el.style.display !== 'none').length;
  statBox.textContent = `📦 Showing ${shown} of ${all} regions`;
}

function addFilterUI(regions) {
  let filterBar = document.getElementById("filterBar");
  if (!filterBar) {
    filterBar = document.createElement("div");
    filterBar.id = "filterBar";
    filterBar.style = "padding: 10px; background: #1a1a1a; border-bottom: 1px solid #333; display: flex; gap: 20px; align-items: center; justify-content: space-between;";

    const leftControls = document.createElement("div");
    leftControls.style.display = 'flex';
    leftControls.style.gap = '10px';

    const toggleUnknown = document.createElement("button");
    toggleUnknown.textContent = "Toggle Unknown";
    toggleUnknown.onclick = () => {
      document.querySelectorAll('.region').forEach(el => {
        if ((el.dataset.effect || "Unknown") === "Unknown") {
          el.style.display = el.style.display === 'none' ? '' : 'none';
        }
      });
      updateScrollMap(regions);
      updateStats();
    };

    leftControls.appendChild(toggleUnknown);
    filterBar.appendChild(leftControls);
    document.body.insertBefore(filterBar, document.getElementById("regionContainer"));
  }

  updateStats();
}
function addFactionColorToggle(regions) {
  const filterBar = document.getElementById("filterBar");
  if (!filterBar) return;

  const toggle = document.createElement("label");
  toggle.innerHTML = `<input type="checkbox" id="toggleFactionColor"> Color by Faction`;
  filterBar.appendChild(toggle);

  document.getElementById("toggleFactionColor").addEventListener("change", () => {
    const useFaction = document.getElementById("toggleFactionColor").checked;

    // Reset color cache
    Object.keys(effectColors).forEach(k => delete effectColors[k]);
    nextColorIndex = 0;

    document.querySelectorAll(".region").forEach(el => {
      const regionId = el.dataset.id;
      const region = regions.find(r => r.region.toString() === regionId);
      if (!region) return;

      const factionCounts = {};
      const factionSet = new Set();

      for (const sys of region.systems || []) {
        const faction = sys.faction?.trim();
        if (!faction) continue;
        factionSet.add(faction);
        factionCounts[faction] = (factionCounts[faction] || 0) + 1;
      }

      // Determine dominant faction
      let dominantFaction = [...factionSet][0] || "Unclaimed";
      let maxCount = 0;
      for (const [fac, count] of Object.entries(factionCounts)) {
        if (count > maxCount) {
          dominantFaction = fac;
          maxCount = count;
        }
      }

      const colorKey = useFaction ? dominantFaction : (region.effect || "Unknown");
      const color = getColor(colorKey);
      el.style.backgroundColor = color;

      // Update label
      const label = el.querySelector(".region-id");
      if (label) {
        const factionList = [...factionSet].length ? [...factionSet].join(", ") : "Unclaimed";
        label.innerHTML = useFaction
          ? `<strong>#${region.region}</strong>
             <strong>${region.start_position} – ${region.end_position}</strong>
             <strong>${factionList}</strong>`
          : `<strong>#${region.region}</strong>
             <strong>${region.start_position} – ${region.end_position}</strong>
             <strong>${region.effect || "Unknown"}</strong>`;
      }

      // Tooltip update
      el.title = `Region ${region.region}\n` +
                 (useFaction
                   ? `Factions: ${[...factionSet].join(", ") || "Unclaimed"}`
                   : `Effect: ${region.effect || "Unknown"}`) +
                 `\nSystems: ${region.systems?.length || 0}`;
    });

    updateScrollMap(regions);
  });
}


function applyRegionFilters(regions) {
  const mode = document.getElementById("filterMode")?.value || "or";

  const checks = {
    wormholes: document.getElementById("toggleWormholes")?.checked,
    unstable: document.getElementById("toggleUnstable")?.checked,
    filaments: document.getElementById("toggleFilaments")?.checked,
    uncharted5: document.getElementById("toggleUncharted5")?.checked,
    anyUncharted: document.getElementById("toggleAnyUncharted")?.checked,
    services: document.getElementById("toggleServices")?.checked,
  };

  const anyFilter = Object.values(checks).some(Boolean);
  const activeSystemFilters = Object.entries(checks)
    .filter(([_, val]) => val)
    .map(([key]) => key);

  const regionContainer = document.getElementById("regionContainer");
  const systemResults = document.getElementById("systemResults");
  const scrollMap = document.getElementById("regionScrollMap");

  if (!anyFilter) {
    regionContainer.style.display = "";
    systemResults.style.display = "none";
    scrollMap.style.display = "";
    renderRegions(regions);
    updateStats(); // optionally update stat display
    return;
  }

  // System-level filtering
  scrollMap.style.display = "none";
  regionContainer.style.display = "none";
  systemResults.style.display = "";

  const matchedSystems = [];

  for (const region of regions) {
    for (const system of region.systems || []) {
      const conditions = {
        wormholes: system.tag === "stable wormhole",
        unstable: system.tag === "unstable wormhole",
        filaments: system.bodies?.some(b => b?.type?.toLowerCase().includes("filament")),
        uncharted5: system.unchartedCount >= 0,
        anyUncharted: system.unchartedCount > 0,
        services: (system.services || []).length > 0,
      };

      const match = mode === "or"
        ? activeSystemFilters.some(f => conditions[f])
        : activeSystemFilters.every(f => conditions[f]);

      if (match) matchedSystems.push(system);
    }
  }

  renderSystemResultsTable(matchedSystems);
  updateStats(matchedSystems.length); // update count when in system view
}
function addExplorationToggles(regions) {
  const filterBar = document.getElementById("filterBar");
  if (!filterBar) return;

  const exploredLabel = document.createElement("label");
  exploredLabel.innerHTML = `<input type="checkbox" id="toggleExplored" checked> Show Explored`;

  const unexploredLabel = document.createElement("label");
  unexploredLabel.innerHTML = `<input type="checkbox" id="toggleUnexplored" checked> Show Unexplored`;

  filterBar.insertBefore(unexploredLabel, filterBar.firstChild);
  filterBar.insertBefore(exploredLabel, filterBar.firstChild);

  const applyExplorationVisibility = () => {
    const showExplored = document.getElementById("toggleExplored")?.checked;
    const showUnexplored = document.getElementById("toggleUnexplored")?.checked;

    for (const region of regions) {
      const el = document.querySelector(`.region[data-id="${region.region}"]`);
      if (!el) continue;

      const hasSystems = Array.isArray(region.systems) && region.systems.length > 0;

      const visible = (hasSystems && showExplored) || (!hasSystems && showUnexplored);
      el.style.display = visible ? "" : "none";
    }

    updateScrollMap(regions);
    updateStats();
  };

  document.getElementById("toggleExplored").addEventListener("change", applyExplorationVisibility);
  document.getElementById("toggleUnexplored").addEventListener("change", applyExplorationVisibility);
}


function renderSystemResultsTable(systems) {
  const container = document.getElementById("systemResults");
  container.innerHTML = "";

  const table = document.createElement("table");
  table.className = "region-system-table";

  table.innerHTML = `
    <thead>
      <tr>
        <th>Pos</th>
        <th>System</th>
        <th>Owner</th>
        <th>Faction</th>
        <th>Services</th>
        <th>Bodies</th>
        <th>Uncharted</th>
        <th>Type</th>
      </tr>
    </thead>
    <tbody>
      ${systems.map(s => `
        <tr>
          <td>${s.pos?.toFixed(1) ?? "—"}</td>
          <td>${s.name || `#${s.id}`}</td>
          <td>${s.owner || "—"}</td>
          <td>${s.faction || "—"}</td>
          <td>${s.services?.join(", ") || "—"}</td>
          <td>${s.bodies?.length ?? 0}</td>
          <td>${s.unchartedCount || "—"}</td>
          <td>${s.tag || "—"}</td>
        </tr>
      `).join("")}
    </tbody>
  `;

  container.appendChild(table);
}

  

function enrichRegionsWithSystems(regions, systems) {
  for (const system of systems) {
    const pos = system.pos ?? system.position;
    const region = regions.find(r => pos >= r.start_position && pos <= r.end_position);
    if (!region) continue;
    if (!region.systems) region.systems = [];
    region.systems.push(system);
  }
}
function expandRegionDetail(region, parentDiv) {
  const wrapper = document.createElement("div");
  wrapper.className = "system-expanded-table";

  const table = document.createElement("table");
  table.className = "region-system-table";

  // Create header row
  const header = document.createElement("tr");
  ["Pos", "System", "Effect", "Owner", "Faction", "Services", "Bodies", "Uncharted"].forEach(text => {
    const th = document.createElement("th");
    th.textContent = text;
    header.appendChild(th);
  });
  table.appendChild(header);

  (region.systems || []).forEach((system) => {
    const row = document.createElement("tr");

    const pos = document.createElement("td");
    pos.textContent = parseFloat(system.pos).toFixed(1);

    const name = document.createElement("td");
    name.textContent = system.name || `#${system.id}`;

    const effect = document.createElement("td");
    effect.textContent = system.effect || "—";

    const owner = document.createElement("td");
    owner.textContent = system.owner || "—";

    const faction = document.createElement("td");
    faction.textContent = system.faction || "—";

    const services = document.createElement("td");
    services.textContent = system.services?.length ? system.services.join(", ") : "—";

    const bodies = document.createElement("td");
    bodies.textContent = (system.bodies || []).length;

    const uncharted = document.createElement("td");
    uncharted.textContent = system.unchartedCount || "—";

    [pos, name, effect, owner, faction, services, bodies, uncharted].forEach(td => row.appendChild(td));
    table.appendChild(row);
  });

  wrapper.appendChild(table);
  parentDiv.appendChild(wrapper);
}





function renderSystemDots(region) {
  const dotContainer = document.createElement("div");
  dotContainer.className = "system-dot-container";
  (region.systems || []).forEach(() => {
    const dot = document.createElement("div");
    dot.className = "system-dot";
    dotContainer.appendChild(dot);
  });
  return dotContainer;
}


function countFilledFields(entry) {
  return Object.values(entry).filter(
    (val) => val !== null && val !== '' && typeof val !== 'undefined'
  ).length;
}

async function loadAllJsonFiles(folder = 'json-dump') {
  const fileList = [
    'melni.json', 'carbon.json' // replace with actual files
  ];

  const posMap = new Map();

  for (const file of fileList) {
    try {
      const res = await fetch(`${folder}/${file}`);
      const json = await res.json();

      for (const entry of json) {
        const existing = posMap.get(entry.pos);

        if (!existing) {
          posMap.set(entry.pos, entry);
        } else {
          const existingCount = countFilledFields(existing);
          const newCount = countFilledFields(entry);
          if (newCount > existingCount) {
            posMap.set(entry.pos, entry);
          }
        }
      }
    } catch (e) {
      console.warn(`Failed to load ${file}`, e);
    }
  }

  return Array.from(posMap.values());
}


function addFactionSearch(regions) {
  const filterBar = document.getElementById("filterBar");
  if (!filterBar) return;

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "🔍 Search Faction / Effect / Service / Planet";
  searchInput.style = "padding: 5px; font-size: 14px; width: 260px;";
  searchInput.id = "factionSearchInput";

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    const systemResults = document.getElementById("systemResults");

    if (!query) {
      document.getElementById("regionContainer").style.display = "";
      document.getElementById("regionScrollMap").style.display = "";
      systemResults.style.display = "none";
      renderRegions(regions);
      updateStats();
      return;
    }

    const matchedSystems = [];

    for (const region of regions) {
      for (const system of region.systems || []) {
        let searchText = [
          system.name,
          system.faction,
          system.owner,
          region.effect,
          system.tag,
          system.tagName,
          ...(system.services || []),                         // ✅ Proper services array
          ...(system.bodies || []).map(b => b.type || "")
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (searchText.includes(query)) {
          matchedSystems.push(system);
        }
      }
    }

    document.getElementById("regionContainer").style.display = "none";
    document.getElementById("regionScrollMap").style.display = "none";
    systemResults.style.display = "";
    renderSystemResultsTable(matchedSystems);
    updateStats(matchedSystems.length);
  });

  filterBar.appendChild(searchInput);
}





async function initMap() {
  try {
    const regionsRes = await fetch("regions.json");
    const regions = await regionsRes.json();
    currentRegions = regions;

    const systems = await loadAllJsonFiles();
    enrichRegionsWithSystems(currentRegions, systems);

    addFilterUI(currentRegions);
    renderRegions(currentRegions);
    addFactionColorToggle(currentRegions);
    addExplorationToggles(currentRegions);
    // addOwnerSearch(currentRegions);
    addFactionSearch(currentRegions);


    // Bind checkbox listeners **after** DOM is ready
    [
      "toggleWormholes",
      "toggleUnstable",
      "toggleFilaments",
      "toggleUncharted5",
      "toggleAnyUncharted",
      "toggleServices"
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => applyRegionFilters(currentRegions));
    });

  } catch (err) {
    console.error("❌ Failed to load map data", err);
    const detail = document.getElementById("detailPanel");
    if (detail) detail.innerText = "Error loading map data.";
  }
}


document.addEventListener("DOMContentLoaded", initMap);
document.getElementById("toggleUnknown")?.addEventListener("click", () => {
  document.querySelectorAll('.region').forEach(el => {
    if ((el.dataset.effect || "Unknown") === "Unknown") {
      el.style.display = el.style.display === 'none' ? '' : 'none';
    }
  });
  updateScrollMap(currentRegions);
  updateStats();
});

