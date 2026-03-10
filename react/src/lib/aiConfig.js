import { normalizeWhitespace, safeGetLS, safeSetLS } from "./utils.js";

export const AI_STORAGE_KEYS = {
  endpoint: "urgentdash_ai_endpoint",
  proxyToken: "urgentdash_ai_proxy_token",
};

const DEFAULT_AI_ENDPOINT = "http://127.0.0.1:3010/api/ai/chat";

function readWindowValue(key) {
  if (typeof window === "undefined") return "";
  return normalizeWhitespace(window[key] || "");
}

function readEnvValue(key) {
  return normalizeWhitespace(import.meta?.env?.[key] || "");
}

function readStoredValue(key) {
  return normalizeWhitespace(safeGetLS(key, ""));
}

function readQueryValue(name) {
  if (typeof window === "undefined") return "";

  try {
    const url = new URL(window.location.href);
    return normalizeWhitespace(url.searchParams.get(name) || "");
  } catch {
    return "";
  }
}

export function getAiEndpoint() {
  const canonicalWindowValue = readWindowValue("__JPT71_AI_ENDPOINT__");
  if (canonicalWindowValue) return canonicalWindowValue;

  const legacyWindowValue = readWindowValue("__URGENTDASH_AI_ENDPOINT__");
  if (legacyWindowValue) return legacyWindowValue;

  const queryValue = readQueryValue("aiEndpoint");
  if (queryValue) {
    safeSetLS(AI_STORAGE_KEYS.endpoint, queryValue);
    return queryValue;
  }

  const envValue = readEnvValue("VITE_AI_ENDPOINT");
  if (envValue) return envValue;

  const storedValue = readStoredValue(AI_STORAGE_KEYS.endpoint);
  if (storedValue) return storedValue;

  return DEFAULT_AI_ENDPOINT;
}

export function getAiProxyToken() {
  const canonicalWindowValue = readWindowValue("__JPT71_AI_PROXY_TOKEN__");
  if (canonicalWindowValue) return canonicalWindowValue;

  const legacyWindowValue = readWindowValue("__URGENTDASH_AI_PROXY_TOKEN__");
  if (legacyWindowValue) return legacyWindowValue;

  const envValue = readEnvValue("VITE_AI_PROXY_TOKEN");
  if (envValue) return envValue;

  return readStoredValue(AI_STORAGE_KEYS.proxyToken);
}
