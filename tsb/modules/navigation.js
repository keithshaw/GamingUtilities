// modules/navigation.js
import { apiRequest, sleep } from "../shared.js";

let sublightInterval = null;
function formatEta(secondsFromNow) {
  const eta = new Date(Date.now() + secondsFromNow * 1000);
  return eta.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
}

async function fetchStatusBar() {
  const el = document.getElementById("navigationStatus");
  const bar = document.getElementById("travelProgressBar");

  try {
    const status = await apiRequest("POST", "status/");
    const sublight = await apiRequest("POST", "status/sublight/");

    const charge = sublight?.charge ?? "?";

    if (status.in_sublight && sublight?.destination_name) {
      const percent = sublight.percentage ?? 0;
      const secondsLeft = (sublight.time_remaining * 60) - 60;

      const progressBar = bar || document.createElement("progress");
      progressBar.id = "travelProgressBar";
      progressBar.max = 100;
      progressBar.value = percent;
      progressBar.style.width = "100%";
      progressBar.style.marginTop = "4px";

      el.innerHTML = `
        🚀 To ${sublight.destination_name} (${sublight.distance.toFixed(1)} LY)
        | ⏳ ETA: ${formatEta(secondsLeft)} | 🧭 ${percent}% | 🔋 ${charge}
        <button id="cancelSublight" style="float:right;">✋ Stop</button>
      `;

      if (!bar) el.after(progressBar);
      else bar.value = percent;

      document.getElementById("cancelSublight").onclick = async () => {
        await apiRequest("POST", "action/sublight/stop/", {}, true);
        fetchStatusBar();
      };

      if (!sublightInterval) {
        sublightInterval = setInterval(fetchStatusBar, 5000);
      }

    } else {
      el.innerHTML = `
        📍 ${status.orbiting_name ?? "Unknown"} 
        [${status.location?.toFixed(1) ?? "???"}] — 
        ${status.idle ? "🛑 Idle" : "✅ Ready"} 🔋 ${charge}
      `;
      if (bar) bar.remove();
      if (sublightInterval) {
        clearInterval(sublightInterval);
        sublightInterval = null;
      }
    }
  } catch (err) {
    console.error("❌ Failed in fetchStatusBar:", err);
    el.textContent = "⚠️ Failed to load navigation data.";
    if (sublightInterval) clearInterval(sublightInterval);
  }
}




export async function fetchNearbySystems() {
  const systems = await apiRequest("POST", "lookup/nearby/");
  const status = await apiRequest("POST", "status/");
  const current = status?.system_id;
  const list = document.getElementById("travelList");
  if (!list) return;

  list.innerHTML = "";

  systems?.sort((a, b) => a.system_distance - b.system_distance).forEach(sys => {
    const li = document.createElement("li");
    if (sys.system_id === current) li.classList.add("highlight");

    const icons = getSystemIcons(sys);
    li.innerHTML = `
      <span><strong>${sys.system_name || "Unnamed"} (${sys.system_position})</strong> | 
      ${sys.system_faction_name || "Unknown"} | 
      ${sys.system_distance.toFixed(1)} LY ${icons}</span>
      <button class="sublightBtn">Travel</button>
      <button class="ftlBtn">FTL</button>
    `;

    li.querySelector(".sublightBtn").onclick = async () => {
      await apiRequest("POST", "action/sublight/start/", { system_id: sys.system_id }, true);
      fetchNearbySystems();
      fetchStatusBar();
    };

    li.querySelector(".ftlBtn").onclick = async () => {
       await apiRequest("POST", `/action/ftl/?system_id=${systemId}`);

      fetchNearbySystems();
      fetchStatusBar();
    };

    list.appendChild(li);
  });

  const count = document.getElementById("nearbyCount");
  if (count) count.textContent = `(${systems?.length || 0})`;
}

function getSystemIcons(sys) {
  let icons = "";

  if (sys.karma_status !== 0) {
    icons += `<span title="Karma: ${sys.karma_status}">⚠️</span> `;
  }

  const wormholeKeys = ['wormhole', 'wormhole_travel'];
  const hasWormhole = wormholeKeys.some(k =>
    sys.system_rules?.[k] || sys.system_services?.[k]
  );
  if (hasWormhole) icons += `<span title="Wormhole Access">🌀</span> `;

  const ruleEntries = Object.entries(sys.system_rules || {}).filter(
    ([k, v]) => v && !wormholeKeys.includes(k)
  );
  if (ruleEntries.length) icons += `<span title="Rules: ${ruleEntries.map(([k]) => k.replace(/_/g, ' ')).join(', ')}">📜</span> `;

  const keyServices = ['training', 'ship_trading', 'port_fitting'];
  const fullServices = keyServices.filter(k => sys.system_services?.[k]);
  const allServices = Object.entries(sys.system_services || {}).filter(([_, v]) => v);

  if (fullServices.length) {
    icons += `<span title="Full Services: ${fullServices.join(', ')}">🛠️</span> `;
  } else if (allServices.length) {
    icons += `<span title="Limited Services: ${allServices.map(([k]) => k).join(', ')}">🔧</span> `;
  }

  return icons;
}

export async function initNavigationPanel() {
  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("navigationPanel")) return;

  const panel = document.createElement("section");
  panel.id = "navigationPanel";
  panel.setAttribute("data-panel", "navigation");
  panel.classList.add("minimizable-panel");

  panel.innerHTML = `
    <div class="panel-header" data-target="#navigationContent">
      <h2>🗺️ Navigation</h2>
      <div class="status-bar" id="navigationStatus">📡 Loading location...</div>
    </div>
    <div class="panel-content" id="navigationContent">
      <ul id="travelList"></ul>
      <progress id="travelProgressBar" value="0" max="100" style="display:none;"></progress>
      <div id="nearbyCount">(0)</div>
    </div>
  `;

  container.appendChild(panel);

  const header = panel.querySelector(".panel-header");
  header.addEventListener("click", async () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) {
      await fetchNearbySystems();
      await fetchStatusBar();
    }
  });

  fetchNearbySystems();
  fetchStatusBar();
}
