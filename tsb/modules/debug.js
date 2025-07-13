let logBuffer = [];
const maxLogs = 30;
let callCount = 0;
let lastCall = "–";
let callsPerMin = 0;
let intervalStarted = false;

export function initDebugPanel() {
  if (document.getElementById("debugPanel")) return;

  const panel = document.createElement("section");
  panel.id = "debugPanel";
  panel.className = "debug-panel collapsed";
  panel.innerHTML = `
    <div class="debug-header">
      <span id="debugSummary">Debug</span>
      <button id="debugToggle">▲</button>
    </div>
    <div class="debug-content" id="debugLog" style="white-space:pre; overflow-y:auto;"></div>
  `;

  document.body.appendChild(panel);

  if (!intervalStarted) {
    setInterval(() => {
      callsPerMin = callCount;
      callCount = 0;
      updateSummaryBar();
    }, 60000);
    intervalStarted = true;
  }

  document.getElementById("debugToggle").onclick = () => {
    panel.classList.toggle("collapsed");
  };

  interceptConsole();
}

function interceptConsole() {
  const origLog = console.log;
  const origError = console.error;

  console.log = (...args) => {
    origLog(...args); // Skip log capture
  };

  console.error = (...args) => {
    addDebugEntry("error", ...args);
    origError(...args);
  };
}

export function logApiCall(method, endpoint) {
  callCount++;
  lastCall = `${method} ${shorten(endpoint)}`;
  addDebugEntry("api", `${method} ${endpoint}`);
  updateSummaryBar();
}

function updateSummaryBar() {
  const el = document.getElementById("debugSummary");
  if (el) {
    el.textContent = `Debug | ${callsPerMin}/min | ${lastCall}`;
  }
}

function shorten(url) {
  return url.length > 60 ? url.slice(0, 57).replace(/%20/g, " ") + "..." : url;
}

function addDebugEntry(type, message) {
  const time = new Date().toLocaleTimeString();
  const msg = typeof message === "string" ? message : JSON.stringify(message);

  if (type === "api" && logBuffer.length > 0) {
    const last = logBuffer[logBuffer.length - 1];
    if (last.type === "api" && last.msg === msg) return;
  }

  logBuffer.push({ type, time, msg });
  if (logBuffer.length > maxLogs) logBuffer.shift();

  renderLog();
}

function renderLog() {
  const container = document.getElementById("debugLog");
  if (!container) return;

  const reversed = [...logBuffer].reverse();

  container.innerHTML = reversed
    .filter(entry => entry.type === "api")
    .map(entry => {
      return `<div style="
        color: #6cf;
        font-family: monospace;
        font-size: 12px;
        line-height: 1.4;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      ">[${entry.time}] ${entry.msg}</div>`;
    })
    .join("");
}
