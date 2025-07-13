// modules/cargoManager.js
import { apiRequest, sleep } from "../shared.js";

export function init() {
  renderCargoPanel();
}

function renderCargoPanel() {
  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("cargoPanel")) return;

  const panel = document.createElement("section");
  panel.id = "cargoPanel";
  panel.setAttribute("data-panel", "cargo");
  panel.classList.add("minimizable-panel");

  panel.innerHTML = `
    <div class="panel-header" data-target="#cargoContent">
      <h2>🚚 Cargo Manager</h2>
      <button id="runCargoScan">Run</button>
    </div>
    <div class="panel-content" id="cargoContent">
      <div id="cargoRoot">Idle.</div>
    </div>
  `;

  container.appendChild(panel);
  panel.querySelector(".panel-header").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") panel.classList.toggle("open");
  });
  document.getElementById("runCargoScan").onclick = fetchAndRenderCargo;
}

async function fetchAndRenderCargo() {
  const container = document.getElementById("cargoRoot");
  if (!container) return;
  container.innerHTML = "Loading cargo...";

  const nameFields = {
    consumables: "consumable_name",
    commodities: "commodity_name",
    equipment_parts: "equipment_part_name",
    ship_parts: "ship_part_name",
    structure_components: "component_name",
    weapon_parts: "weapon_part_name",
    weapons: "weapon_name"
  };

  const idFields = {
    consumables: "consumable_id",
    commodities: "commodity_id",
    equipment_parts: "equipment_part_id",
    ship_parts: "ship_part_id",
    structure_components: "component_id",
    weapon_parts: "weapon_part_id",
    weapons: "weapon_id"
  };

  const sections = Object.keys(nameFields);
  let page = 0;
  let allData = {};
  let holdSize = 0, holdUsed = 0;

  while (true) {
    await sleep(400);
    const res = await apiRequest("POST", `status/hold/?page=${page}`);
    if (!res || Object.keys(res).length === 0) break;

    holdSize = res.hold_size ?? holdSize;
    holdUsed = res.hold_used ?? holdUsed;

    let anyItems = false;
    for (const section of sections) {
      const items = res[section];
      if (!items) continue;
      if (!allData[section]) allData[section] = {};
      for (const [k, v] of Object.entries(items)) {
        if (k === "group_total_weight") continue;
        allData[section][`${page}_${k}`] = v;
        anyItems = true;
      }
    }

    if (!anyItems || page > 80) break;
    page++;
  }

  container.innerHTML = `<strong>Hold Used:</strong> ${holdUsed.toFixed(1)} / ${holdSize}`;

  renderConsumables(container, allData.consumables || {});
  renderOtherCargo(container, allData, nameFields, idFields);
}

function renderConsumables(container, data) {
  const groups = {};
  for (const item of Object.values(data)) {
    if (!item?.amount) continue;
    const category = item.consumable_category_name || "Unknown";
    const sub = item.consumable_sub_category_name || "Misc";
    if (!groups[category]) groups[category] = {};
    if (!groups[category][sub]) groups[category][sub] = [];
    groups[category][sub].push(item);
  }

  const section = document.createElement("div");
  section.className = "cargo-consumables";
  section.innerHTML = `<h3>Consumables</h3>`;
  section.style.maxHeight = "400px";
  section.style.overflowY = "auto";
  section.style.marginBottom = "20px";

  for (const [cat, subcats] of Object.entries(groups)) {
    const h4 = document.createElement("h4");
    h4.textContent = cat;
    section.appendChild(h4);

    for (const [sub, items] of Object.entries(subcats)) {
      const toggle = document.createElement("div");
      toggle.className = "cargo-subcat-header";
      toggle.innerHTML = `<strong>${sub} (${items.length})</strong>`;
      toggle.style.cursor = "pointer";

      const ul = document.createElement("ul");
      ul.className = "cargo-subcat-items";
      ul.style.display = "none";
      ul.style.listStyle = "none";
      ul.style.paddingLeft = "1em";

      for (const i of items) {
        const li = document.createElement("li");
        li.textContent = `${i.amount} × ${i.consumable_name} — ${(i.total_weight ?? i.weight ?? 0).toFixed(1)}kg`;
        ul.appendChild(li);
      }

      toggle.onclick = () => ul.style.display = ul.style.display === "none" ? "block" : "none";
      section.appendChild(toggle);
      section.appendChild(ul);
    }
  }

  container.appendChild(section);
}

function renderOtherCargo(container, allData, nameFields, idFields) {
  const sellableTypes = idFields;

  for (const [section, itemsObj] of Object.entries(allData)) {
    if (section === "consumables") continue;

    const items = Object.values(itemsObj).filter(i => i?.amount);
    if (!items.length) continue;

    const catName = section.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    const div = document.createElement("div");
    div.className = "cargo-category";

    const h4 = document.createElement("h4");
    h4.textContent = `${catName} (${items.length})`;
    div.appendChild(h4);

    const p = document.createElement("p");
    const totalQty = items.reduce((sum, i) => sum + i.amount, 0);
    const totalWeight = items.reduce((sum, i) => sum + (i.total_weight ?? i.weight ?? 0) * i.amount, 0);
    p.textContent = `${totalQty} items | ${totalWeight.toFixed(1)} kg`;
    div.appendChild(p);

    const btnRow = document.createElement("div");
    const sellBtn = document.createElement("button");
    sellBtn.textContent = `Sell All in ${catName}`;
    sellBtn.onclick = async () => {
      for (const i of items) {
        const path = section === "commodities" ? "commodity" : section.replace(/s$/, "");
        await apiRequest("POST", `action/sell/${path}/?${sellableTypes[section]}=${i[idFields[section]]}&quantity=${i.amount}`);
        await sleep(200);
      }
      fetchAndRenderCargo();
    };
    btnRow.appendChild(sellBtn);

    const ejectBtn = document.createElement("button");
    ejectBtn.textContent = `Eject All`;
    ejectBtn.style.marginLeft = "8px";
    ejectBtn.onclick = async () => {
      for (const i of items) {
        await apiRequest("POST", `action/eject/${section}/?${sellableTypes[section]}=${i[idFields[section]]}&quantity=${i.amount}`);
        await sleep(200);
      }
      fetchAndRenderCargo();
    };
    btnRow.appendChild(ejectBtn);
    div.appendChild(btnRow);

    const ul = document.createElement("ul");
    ul.style.listStyle = "none";
    ul.style.paddingLeft = "1em";

    for (const i of items) {
      const name = i[nameFields[section]] || "Unknown";
      const li = document.createElement("li");
      li.textContent = `${i.amount} × ${name} — ${(i.total_weight ?? i.weight ?? 0).toFixed(1)}kg`;
      ul.appendChild(li);
    }

    div.appendChild(ul);
    container.appendChild(div);
  }
}
