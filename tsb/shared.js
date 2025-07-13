import { logApiCall } from "./modules/debug.js";


export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// shared.js
export let API_KEY = "";
export const BASE_URL = "https://play.textspaced.com/api/";
const apiCallTimestamps = [];

export function setApiKey(key) {
  API_KEY = key;
}


window.apiRequest = apiRequest;
export async function apiRequest(method, endpoint, data = {}, useQuery = false) {
  const now = Date.now();
  apiCallTimestamps.push(now);
  while (apiCallTimestamps.length > 0 && now - apiCallTimestamps[0] > 10000) {
    apiCallTimestamps.shift();
  }

  const url = (method === "GET" || useQuery)
    ? BASE_URL + endpoint + "?" + new URLSearchParams(data).toString()
    : BASE_URL + endpoint;

  const opts = {
    method,
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    redirect: "manual"
  };

  if (!(method === "GET" || useQuery)) {
    opts.body = JSON.stringify(data);
  }

  logApiCall(method, endpoint);

  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    if (text.startsWith("<")) throw new Error("Unexpected HTML response");

    const json = JSON.parse(text);
    return json;
  } catch (e) {
    console.warn(`⚠️ API request failed (${endpoint}):`, e.message);
    return null;
  }
}
