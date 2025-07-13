// modules/structure_browser.js
// Structure Component Browser Panel
// API: search/structure_components/?term=b


///structure_browser: { path: "./modules/structure_browser.js", init: "initStructureBrowserPanel" },
///<label><input type="checkbox" data-module="structure_browser"> Structure Browser</label>

import { apiRequest } from "../shared.js";

let panelInitialized = false;

export function initStructureBrowserPanel() {
  if (panelInitialized) return;
  panelInitialized = true;

  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("structureBrowserPanel")) return;

  const panel = document.createElement("section");
  panel.id = "structureBrowserPanel";
  panel.classList.add("minimizable-panel");
  panel.setAttribute("data-panel", "structure_browser");

  panel.innerHTML = `
    <div class="panel-header" data-target="#structureBrowserContent">
      <h2>🏗️ Structure Component Browser</h2>
      <input type="text" id="structureSearchInput" placeholder="Search term (default 'b')" />
      <button id="structureSearchBtn">Search</button>
    </div>
    <div class="panel-content" id="structureBrowserContent">
      <ul id="structureResults"></ul>
    </div>
  `;

  container.appendChild(panel);

  const searchBtn = document.getElementById("structureSearchBtn");
  searchBtn.addEventListener("click", handleStructureSearch);
}

async function handleStructureSearch() {
  const term = document.getElementById("structureSearchInput").value || "b";
  const list = document.getElementById("structureResults");
  list.innerHTML = `<li>🔎 Searching for "${term}"...</li>`;

  try {
    const results = await apiRequest("POST", `search/structure_components/?term=${encodeURIComponent(term)}`);
    list.innerHTML = "";

    if (results && Array.isArray(results)) {
      results.forEach((item) => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${item.name}</strong> — ID: ${item.id}`;
        list.appendChild(li);
      });
    } else {
      list.innerHTML = "<li>⚠️ No results or unexpected response.</li>";
    }
  } catch (err) {
    list.innerHTML = `<li>❌ Error: ${err.message}</li>`;
    console.warn("Structure search failed:", err);
  }
}
