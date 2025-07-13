import { apiRequest } from "../shared.js";

let panelInitialized = false;

// ----- Constants & Mappings -----
const userMeta = {
  4026: "@sha",
  4050: "@813",
  4024: "@log",
  4068: "@jon",
  4110: "@bob",
  4031: "@nev",
  4094: "@f24",
  4113: "@the",
  4067: "@lay",
  4080: "@ksh",
  4196: "@log+m",
  4341: "@log+d",
};

// Precompute numeric IDs
const userIds = Object.keys(userMeta).map(Number);

// Status icons/colors
const STATUS_ICONS = {
  idle: "🛏",
  travelling: "🧭",
  incombat: "⚔️",
  unknown: "❓",
};
const STATUS_COLORS = {
  idle: "#4dc3ff",
  travelling: "#ffa940",
  incombat: "#ff4d4f",
  unknown: "#aaa",
};

// Auto‐refresh every 60s
const REFRESH_INTERVAL = 60 * 1000;

let accounts = [];
let sortMode = "login";

console.log("🔄 account_manager.js loaded");

// ----- Initialization -----
export function initAccountManagerPanel() {
  if (panelInitialized) return;
  panelInitialized = true;

  const container = document.getElementById("mainContainer");
  if (!container || document.getElementById("account_managerPanel")) return;

  const panel = document.createElement("section");
  panel.id = "account_managerPanel";
  panel.setAttribute("data-panel", "account_manager");
  panel.classList.add("minimizable-panel");

  panel.innerHTML = `
    <div class="panel-header" data-target="#accountManagerContent">
      <h2>👥 Account Manager</h2>
    </div>
    <div class="panel-content" id="accountManagerContent">
      <div style="margin-bottom:6px">
        <label>Sort:
          <select id="accountSortSelect">
            <option value="login">Recent</option>
            <option value="level">Level</option>
            <option value="status">Status</option>
          </select>
        </label>
      </div>
      <div id="accountManagerList">Loading accounts...</div>
    </div>
  `;

  container.appendChild(panel);

  // Toggle panel open/closed
  panel.querySelector(".panel-header").addEventListener("click", () => {
    panel.classList.toggle("open");
  });

  // Change sorting on select
  document.getElementById("accountSortSelect").addEventListener("change", (e) => {
    sortMode = e.target.value;
    renderAccounts();
  });

  startAutoRefresh();
}

// ----- Auto‐Refresh Logic -----
function startAutoRefresh() {
  fetchAccounts();
  setInterval(fetchAccounts, REFRESH_INTERVAL);
}

// ----- Fetch & Update -----
async function fetchAccounts() {
  console.log("🔄 Fetching account data...");
  try {
    const results = await Promise.all(
      userIds.map(async (id) => {
        try {
          const res = await apiRequest("POST", `lookup/user/?user_id=${id}`, true);
          if (res?.results?.[id]) {
            return { id, ...res.results[id], _raw: res };
          }
        } catch (err) {
          console.warn(`❌ Error fetching user ${id}:`, err);
        }
        return null;
      })
    );
    accounts = results.filter(Boolean);
    renderAccounts();
    console.log(`✅ Fetched ${accounts.length} accounts`);
  } catch (err) {
    console.error("❌ fetchAccounts failed:", err);
  }
}

// ----- Render Accounts -----
function renderAccounts() {
  const list = document.getElementById("accountManagerList");
  if (!list) return;

  if (!accounts.length) {
    list.innerHTML = "<p>No accounts found.</p>";
    return;
  }

  // Sort by chosen mode
  let sorted = [...accounts];
  if (sortMode === "level") {
    sorted.sort((a, b) => b.level - a.level);
  } else if (sortMode === "status") {
    sorted.sort((a, b) => {
      const sa = (a.status || "").toLowerCase();
      const sb = (b.status || "").toLowerCase();
      return sa.localeCompare(sb);
    });
  } else {
    sorted.sort((a, b) => a.last_login - b.last_login);
  }

  // Build each card
  list.innerHTML = sorted
    .map((acc) => {
      const emailTag = userMeta[acc.id] || "@???";
      const factionColor = stringToHSL(acc.faction_name || "Unknown");
      const guildColor = stringToHSL(acc.guild_name || "None");
      const levelColorMeta = trackSkillGrowth(acc);

      const statusKey = (acc.status || "unknown").toLowerCase().replace(/\s/g, "");
      const statusIcon = STATUS_ICONS[statusKey] || STATUS_ICONS.unknown;
      const statusColor = STATUS_COLORS[statusKey] || STATUS_COLORS.unknown;

      const loginColor =
        acc.last_login <= 5
          ? "#4dff88"
          : acc.last_login <= 60
          ? "#ffe066"
          : "#ff4d88";
      const fadedClass = acc.last_login > 120 ? "faded" : "";

      return `
        <div class="account-block ${fadedClass}">
          <h3>
            <code class="clickable" data-acc-id="${acc.id}">
              ${acc.name.slice(0, 5)} ${emailTag}
            </code>
          </h3>
          <div style="display:flex; gap:12px; align-items:center; margin-bottom:4px;">
            <div style="color:${statusColor};">
              ${statusIcon} ${acc.status || "Unknown"}
            </div>

          </div>
          <div style="display:flex; gap:12px; font-size:0.9em; margin-bottom:4px;">
            <div style="color:${guildColor};">
              ${(acc.guild_name || "None").slice(0, 5)}
            </div>
            <div style="color:${factionColor};">
            ${acc.faction_name?.slice(0, 6) || "Unknown"}
            </div>
          </div>
                      <div style="color:${loginColor};">
              ${acc.last_login}m
              <span style="color:${levelColorMeta.color};"> - ${acc.level}</span>
            </div>
          <div style="margin-top:6px;">
            ${renderNotesField(acc.id)}
          </div>
        </div>
      `;
    })
    .join("");

  // Attach click‐to‐launch to code elements
  document.querySelectorAll(".clickable").forEach((el) => {
    el.addEventListener("click", () => {
      const accId = el.getAttribute("data-acc-id");
      launchAccount(accId);
    });
  });
}

// ----- Notes Field Only -----
function renderNotesField(id) {
  const storedNote = localStorage.getItem(`note_${id}`) || "";
  return `
    <textarea
      class="char-note"
      oninput="localStorage.setItem('note_${id}', this.value)"
      placeholder="Note..."
      rows="1"
      style="width:100%; max-width:100%; background:#222; color:#eee; border:1px solid #555; padding:4px; box-sizing:border-box; resize:vertical; overflow:auto;"
    >${storedNote}</textarea>
  `;
}

// ----- Skill‐Growth Tracking -----
function trackSkillGrowth(account) {
  const key = `skillLevel_${account.id}`;
  const prev = parseFloat(localStorage.getItem(key) || "0");
  localStorage.setItem(key, account.level);
  return { prev, color: getSkillColor(account.level, prev) };
}
function getSkillColor(current, previous) {
  if (current > previous) return "#80ff80";
  if (current < previous) return "#ff8080";
  return "#ccc";
}

// ----- Utility: String → HSL Color -----
function stringToHSL(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 65%)`;
}

// ----- Launch Account in Incognito Chrome -----
window.launchAccount = function (id) {
  const url = "https://play.textspaced.com";
  const user = userMeta[id] || `User ${id}`;
  const command = `open -na "Google Chrome" --args --incognito --new-window "${url}"`;

  navigator.clipboard
    .writeText(command)
    .then(() => {
      alert(`🚀 Paste this in Terminal to open incognito for ${user}:\n\n${command}`);
    })
    .catch((err) => {
      console.error("❌ Failed to copy launch command:", err);
      alert(`Error preparing launch command for ${user}`);
    });
};
