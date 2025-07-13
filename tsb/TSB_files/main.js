import { setApiKey, apiRequest } from "./shared.js";


window.systemLookup = async function (ids = []) {
  if (!Array.isArray(ids)) {
    console.error("Expected array of system IDs");
    return;
  }

  const results = {};

  for (const systemId of ids) {
    try {
      const res = await apiRequest("POST", `system/?system_id=${systemId}`);
      const sys = res?.system?.[systemId];

      if (!sys) {
        console.warn(`❌ No data for system ${systemId}`, res);
        continue;
      }

      results[systemId] = {
        name: sys.system_name || "Unnamed",
        position: sys.system_position ?? null,
        region: sys.region_effect_name || "None",
        bodyCount: Object.keys(sys.system_bodies || {}).length
      };
    } catch (e) {
      console.error(`⚠️ Error fetching ${systemId}:`, e);
    }
  }

  console.log("📦 System Lookup Results:", results);
  return results;
};



//
const moduleMap = {
  decrypt: { path: "./modules/mission_decrypt.js", init: "initDecryptPanel" },
  mission_secretSauce: { path: "./modules/mission_secretSauce.js", init: "initSecretSaucePanel" },
  navigation: { path: "./modules/navigation.js", init: "initNavigationPanel" },
  chart: { path: "./modules/chart.js", init: "initChartTestPanel" },
  butcher: { path: "./modules/mission_butcher.js", init: "initButcher" },
  account_manager: { path: "./modules/account_manager.js", init: "initAccountManagerPanel" },
  trafficker: { path: "./modules/mission_trafficker.js", init: "initTraffickerPanel" },
  harvest_escape: { path: "./modules/harvest_escape.js", init: "initEscapeHarvesterPanel" },
  meditation: { path: "./modules/meditation.js", init: "init" },
  systemMarket: { path: "./modules/marketScanner.js", init: "init" },
  adriftLoot: { path: "./modules/adriftLoot.js", init: "init" },
  cargo: { path: "./modules/cargoManager.js", init: "init" },
  collectionPlate: { path: "./modules/mission_collectionPlate.js", init: "initCollectionPlate" },
  mission_speedSquad: { path: "./modules/mission_speedSquad.js", init: "init" },
  regionViewer: { path: "./modules/regionViewer.js", init: "init" },
  combat_log: { path: "./modules/combat_log.js", init: "init" },
  hunting_main: { path: "./modules/hunting_main.js", init: "init" },
  wormholeScanner: { path: "./modules/wormhole_scanner.js", init: "init" },
  account_scanner: { path: "./modules/account_scanner.js", init: "initAccountScannerPanel" },
  ship_command: { path: "./modules/ship_command.js", init: "initShipCommandPanel" },
  structure_browser: { path: "./modules/structure_browser.js", init: "initStructureBrowserPanel" }



};

let activeModules = {};

function applyApiKey(key) {
  setApiKey(key);
}

function saveModulePrefs() {
  const activeKeys = Object.keys(activeModules).filter(k => activeModules[k]);
  localStorage.setItem("activeModules", JSON.stringify(activeKeys));
}

async function toggleModule(moduleKey, shouldLoad) {
  const existing = document.querySelector(`[data-panel='${moduleKey}']`);

  if (shouldLoad && !activeModules[moduleKey]) {
    const { path, init } = moduleMap[moduleKey];
    try {
      const mod = await import(`${path}?t=${Date.now()}`);
      if (typeof mod[init] === "function") {
        mod[init]();

        // 🔁 Special: expose region globals
        if (moduleKey === "regionViewer") {
          window.displayRegionInfo = mod.displayRegionInfo;
          window.displayRegionByIndex = mod.displayRegionByIndex;
        }

        activeModules[moduleKey] = true;
        saveModulePrefs();
      } else {
        console.warn(`⚠️ Module '${moduleKey}' does not export '${init}'`);
      }
    } catch (e) {
      console.error(`❌ Failed to load module '${moduleKey}':`, e);
    }
  } else if (!shouldLoad && existing) {
    existing.remove();
    activeModules[moduleKey] = false;
    saveModulePrefs();

    const modPath = moduleMap[moduleKey]?.path;
    if (modPath) {
      try {
        const fresh = await import(`${modPath}?reset=${Date.now()}`);
        if (typeof fresh.resetModuleState === "function") {
          fresh.resetModuleState();
        }
      } catch (err) {
        // silent fail
      }
    }
  }
}

async function loadConfigAndInit() {
  const selector = document.getElementById("apiSelector");
  selector.innerHTML = "";

  try {
    const res = await fetch("config.json");
    if (!res.ok) throw new Error("Config fetch failed");
    const config = await res.json();

    const savedKey = localStorage.getItem("selectedApiKey");
    config.forEach(({ name, key }) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = name;
      if (key === savedKey) opt.selected = true;
      selector.appendChild(opt);
    });

    const activeKey = selector.value || config[0]?.key;
    applyApiKey(activeKey);

    selector.addEventListener("change", () => {
      const selected = selector.value;
      localStorage.setItem("selectedApiKey", selected);
      applyApiKey(selected);
      location.reload();
    });

  } catch (err) {
    console.warn("⚠️ No config file found, falling back to manual entry");

    const savedKey = localStorage.getItem("selectedApiKey") || "";
    const manualInput = document.createElement("input");
    manualInput.type = "text";
    manualInput.placeholder = "Enter API key";
    manualInput.value = savedKey;
    manualInput.style.width = "250px";
    manualInput.addEventListener("change", () => {
      const newKey = manualInput.value.trim();
      localStorage.setItem("selectedApiKey", newKey);
      applyApiKey(newKey);
      location.reload();
    });

    selector.replaceWith(manualInput);
    applyApiKey(savedKey);
  }

  const storedModules = JSON.parse(localStorage.getItem("activeModules") || "[]");
  for (const key of storedModules) {
    const checkbox = document.querySelector(`input[data-module='${key}']`);
    if (checkbox) checkbox.checked = true;
    await toggleModule(key, true);
  }
}


document.addEventListener("DOMContentLoaded", async () => {
  const { initDebugPanel } = await import("./modules/debug.js?t=" + Date.now());
  initDebugPanel();
  // initMegaStoreViewer()
  await loadConfigAndInit();

  document.querySelectorAll("#moduleManager input[type='checkbox']").forEach(input => {
    input.addEventListener("change", e => {
      const key = e.target.dataset.module;
      toggleModule(key, e.target.checked);
    });
  });
  document.querySelectorAll(".module-group > strong").forEach(header => {
  const group = header.parentElement;
  group.classList.add("collapsed"); // Start collapsed (optional)
  header.addEventListener("click", () => {
    group.classList.toggle("collapsed");
  });
});

});
