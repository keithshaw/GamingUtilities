// modules/adriftLoot.js
import { apiRequest, sleep } from "../shared.js";

export function init() {
  renderAdriftLootPanel();
}

function renderAdriftLootPanel() {
  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("adriftLootPanel")) return;

  const panel = document.createElement("section");
  panel.id = "adriftLootPanel";
  panel.setAttribute("data-panel", "adriftLoot");
  panel.classList.add("minimizable-panel");

  panel.innerHTML = `
    <div class="panel-header" data-target="#adriftLootContent">
      <h2>🌌 Adrift Loot</h2>
      <button id="runAdriftLoot">Scan</button>
    </div>
    <div class="panel-content" id="adriftLootContent">
      <div id="adriftLootResults">Idle.</div>
    </div>
  `;

  container.appendChild(panel);

  panel.querySelector(".panel-header").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") panel.classList.toggle("open");
  });

  document.getElementById("runAdriftLoot").onclick = fetchAdriftLoot;
}

async function fetchAdriftLoot() {
  const output = document.getElementById("adriftLootResults");
  if (!output) return;
  output.innerHTML = "Scanning...";

  const res = await apiRequest("POST", "status/hold/");
  const adrift = res?.adrift_cargo;
  if (!adrift || typeof adrift !== "object") {
    output.innerHTML = "No adrift cargo found.";
    return;
  }

  const results = [];
  for (const section of Object.keys(adrift)) {
    const items = Object.values(adrift[section] || {});
    for (const item of items) {
      if (!item?.amount) continue;
      results.push({
        name: item.commodity_name || item.consumable_name || item.component_name || item.weapon_name || "Unknown",
        amount: item.amount,
        weight: item.total_weight ?? item.weight ?? 0,
        section,
        id: item.commodity_id || item.consumable_id || item.component_id || item.weapon_id || "?"
      });
    }
  }

  if (results.length === 0) {
    output.innerHTML = "No lootable cargo found.";
    return;
  }

  const list = document.createElement("ul");
  results.forEach(item => {
    const li = document.createElement("li");
    li.style.marginBottom = "5px";
    li.innerHTML = `
      ${item.name} — ${item.amount} @ ${item.weight.toFixed(1)}kg
      <button style="margin-left: 10px;" data-id="${item.id}" data-type="${item.section}">Loot</button>
    `;
    list.appendChild(li);
  });

  output.innerHTML = "";
  output.appendChild(list);

  list.querySelectorAll("button").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const type = btn.dataset.type.replace(/s$/, "");
      await apiRequest("POST", `action/cargo/${type}/recover/?${type}_id=${id}`);
      btn.textContent = "Looted ✅";
      btn.disabled = true;
    };
  });
}
