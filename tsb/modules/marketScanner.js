// modules/marketScanner.js
import { apiRequest, sleep } from "../shared.js";

export function init() {
  renderMarketScannerPanel();
}

function renderMarketScannerPanel() {
  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("marketScannerPanel")) return;

  const panel = document.createElement("section");
  panel.id = "marketScannerPanel";
  panel.setAttribute("data-panel", "systemMarket");
  panel.classList.add("minimizable-panel");
  panel.innerHTML = `
    <div class="panel-header" data-target="#marketScannerContent">
      <h2>📦 Market Scanner</h2>
      <button id="runMarketScan">Run Scan</button>
    </div>
    <div class="panel-content" id="marketScannerContent">
      <div id="systemMarketResults">Idle.</div>
    </div>
  `;

  container.appendChild(panel);

  panel.querySelector(".panel-header").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") panel.classList.toggle("open");
  });

  document.getElementById("runMarketScan").onclick = fetchSystemMarket;
}

async function fetchSystemMarket() {
  const container = document.getElementById("systemMarketResults");
  if (!container) return;
  container.innerHTML = "Loading...";

  const status = await apiRequest("POST", "status/");
  const systemId = status?.system_id;
  if (!systemId) {
    container.innerHTML = "Unable to determine system.";
    return;
  }

  async function fetchAllPages(section, key) {
    let page = 0, allItems = [];
    while (true) {
      const res = await apiRequest("GET", "system/stock/all/", {
        system_id: systemId,
        page,
        section
      }, true);
      const data = res?.[key];
      if (!data || Object.keys(data).length === 0) break;
      allItems = allItems.concat(Object.values(data));
      page++;
    }
    return allItems;
  }

  const parts = await fetchAllPages("trading_parts", "structure_components");
  const consumables = await fetchAllPages("trading_consumables", "consumables");
  container.innerHTML = "";

  const allItems = [];

  if (parts.length > 0) {
    allItems.push(...parts);
    renderPartSummary(parts, container, systemId);
  }

  const grouped = {};
  if (consumables.length > 0) {
    consumables.forEach(item => {
      const cat = item.consumable_sub_category_name?.trim() || item.consumable_category_name;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    Object.values(grouped).forEach(arr => allItems.push(...arr));
    renderConsumableCategories(grouped, container, systemId);
  }

  const lightItems = allItems.filter(item => (item.weight ?? 0) <= 0.1 && item.stock_amount > 0);
  if (lightItems.length > 0) {
    const btn = document.createElement("button");
    btn.textContent = "🪶 Buy All ≤ 0.1kg Items";
    btn.style.marginTop = "10px";
    btn.onclick = async () => {
      for (const item of lightItems) {
        const type = item.structure_component_id ? "structure_components" : "consumable";
        const id = item.structure_component_id ?? item.consumable_id;
        const amount = item.stock_amount;
        await apiRequest("POST", `action/buy/${type}/?system_id=${systemId}&${type === "consumable" ? "consumable_id" : "structure_component_id"}=${id}&quantity=${amount}&steal=false`);
        await sleep(300);
      }
    };
    container.appendChild(btn);
  }
}

function renderPartSummary(parts, container, systemId) {
  let totalCost = 0, totalWeight = 0, totalQty = 0;
  parts.forEach(item => {
    totalCost += item.cost * item.stock_amount;
    totalWeight += item.weight * item.stock_amount;
    totalQty += item.stock_amount;
  });

  const header = document.createElement("h4");
  header.textContent = `Structure Components`;
  container.appendChild(header);

  const summary = document.createElement("p");
  summary.textContent = `${totalQty} components | ${totalWeight.toFixed(1)} kg | ${totalCost.toLocaleString()} credits`;
  container.appendChild(summary);

  const btn = document.createElement("button");
  btn.textContent = "Buy All Components";
  btn.onclick = async () => {
    for (const item of parts) {
      for (let i = 0; i < item.stock_amount; i++) {
        await apiRequest("POST", `action/buy/structure_components/?system_id=${systemId}&structure_component_id=${item.structure_component_id}&quantity=1&steal=false`);
        await sleep(300);
      }
    }
  };
  container.appendChild(btn);
}

function renderConsumableCategories(grouped, container, systemId) {
  const fuelItems = [];

  for (const [category, items] of Object.entries(grouped)) {
    grouped[category] = items.filter(item => {
      const isFuel = /fuel/i.test(item.consumable_sub_category_name || "") ||
                     /fuel/i.test(item.consumable_category_name || "") ||
                     /fuel/i.test(item.consumable_name || "");
      if (isFuel) {
        fuelItems.push(item);
        return false;
      }
      return true;
    });
  }

  if (fuelItems.length > 0) {
    renderConsumableCategoryBlock("Fuel", fuelItems, container, systemId);
  }

  Object.entries(grouped).forEach(([category, items]) => {
    if (items.length > 0) {
      renderConsumableCategoryBlock(category, items, container, systemId);
    }
  });
}

function renderConsumableCategoryBlock(category, items, container, systemId) {
  let totalQty = 0, totalCost = 0, totalWeight = 0;
  items.forEach(item => {
    totalQty += item.stock_amount;
    totalCost += item.cost * item.stock_amount;
    totalWeight += (item.weight || 0) * item.stock_amount;
  });

  const section = document.createElement("div");
  section.classList.add("consumable-category");

  const header = document.createElement("h4");
  header.textContent = `Consumables - ${category}`;
  section.appendChild(header);

  const summary = document.createElement("p");
  summary.textContent = `${totalQty} items | ${totalWeight.toFixed(1)} kg | ${totalCost.toLocaleString()} credits`;
  section.appendChild(summary);

  const btn = document.createElement("button");
  btn.textContent = `Buy All ${category}`;
  btn.onclick = async () => {
    for (const item of items) {
      await apiRequest("POST", `action/buy/consumable/?system_id=${systemId}&consumable_id=${item.consumable_id}&quantity=${item.stock_amount}&steal=false`);
      await sleep(300);
    }
  };
  section.appendChild(btn);

  container.appendChild(section);
}
