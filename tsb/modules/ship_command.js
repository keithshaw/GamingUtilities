import { apiRequest } from "../shared.js";

let panelInitialized = false;

export function initShipCommandPanel() {
  if (panelInitialized) return;
  panelInitialized = true;

  const container = document.getElementById("mainContainer");
  if (!container) return;

  const panel = document.createElement("section");
  panel.id = "shipCommandPanel";
  panel.setAttribute("data-panel", "ship_command");
  panel.classList.add("minimizable-panel");

  panel.innerHTML = `
    <div class="panel-header" data-target="#shipCommandContent">
      <h2>🚀 Ship Command</h2>
      <input type="text" id="shipSearch" placeholder="Search ships..." />
    </div>
    <div class="panel-content" id="shipCommandContent">
      <ul id="shipList" class="ship-list"></ul>
      <div id="shipCount">(0)</div>
    </div>
  `;

  container.appendChild(panel);

  panel.querySelector(".panel-header").addEventListener("click", () => {
    panel.classList.toggle("open");
  });

  panel.querySelector("#shipSearch").addEventListener("input", () => {
    renderShipList();
  });

  fetchAndCacheShips();
}

let shipCache = {};
let currentShipId = null;

async function fetchAndCacheShips() {
  const [data, status] = await Promise.all([
    apiRequest("POST", "status/parked_ships/"),
    apiRequest("POST", "status/")
  ]);

  shipCache = data;
  currentShipId = status?.ship_id ?? null;

  renderShipList();
}

function renderShipList() {
  const list = document.getElementById("shipList");
  const count = document.getElementById("shipCount");
  const filter = document.getElementById("shipSearch").value.toLowerCase();

  list.innerHTML = "";

  const ships = Object.values(shipCache || {}).filter(ship => {
    const name = (ship.ship_name || "").toLowerCase();
    const type = (ship.ship_type_name || "").toLowerCase();
    return name.includes(filter) || type.includes(filter);
  });

  ships.forEach(ship => {
    const li = document.createElement("li");
    li.classList.add("ship-item");
    if (ship.ship_id === currentShipId) li.classList.add("highlight");

    li.innerHTML = `
      <div class="ship-header">
        <strong>${ship.ship_name || "Unnamed"}</strong> (${ship.ship_type_name})
        <button class="toggle-ship-details">⤵️</button>
      </div>
      <div class="ship-details">
        <div>Fuel: ${ship.current_fuel}/${ship.maximum_fuel} | Distance: ${ship.distance?.toFixed(1) ?? "?"}</div>
        <div class="button-row">
          <button class="summon">Summon</button>
          <button class="board">Board</button>
          <button class="boardStow">Board & Stow</button>
          <button class="stow">Stow</button>
          <button class="rename">✏️</button>
        </div>
      </div>
    `;

    li.querySelector(".toggle-ship-details").onclick = () => {
      li.classList.toggle("collapsed");
    };

    li.querySelector(".summon").onclick = () =>
      apiRequest("POST", "action/summon_ship/", { ship_id: ship.ship_id }, true);

    li.querySelector(".board").onclick = () =>
      apiRequest("POST", "action/switch_ship/", { ship_id: ship.ship_id }, true);

    li.querySelector(".boardStow").onclick = async () => {
      await apiRequest("POST", "action/switch_ship/", { ship_id: ship.ship_id }, true);
      await apiRequest("POST", "action/stow_ship/", { ship_id: ship.ship_id }, true);
    };

    li.querySelector(".stow").onclick = () =>
      apiRequest("POST", "action/stow_ship/", { ship_id: ship.ship_id }, true);

    li.querySelector(".rename").onclick = async () => {
      const newName = prompt("Enter new ship name:", ship.ship_name);
      if (newName) {
        await apiRequest("POST", "action/ship/rename/", {
          ship_id: ship.ship_id,
          ship_name: newName,
        }, true);
        await fetchAndCacheShips();
      }
    };

    list.appendChild(li);
  });

  count.textContent = `(${ships.length})`;
}
