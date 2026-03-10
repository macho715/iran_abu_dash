import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AI_STORAGE_KEYS, getAiEndpoint, getAiProxyToken } from "./aiConfig.js";

function resetLocation() {
  window.history.replaceState({}, "", "/");
}

describe("aiConfig", () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.__JPT71_AI_ENDPOINT__;
    delete window.__URGENTDASH_AI_ENDPOINT__;
    delete window.__JPT71_AI_PROXY_TOKEN__;
    delete window.__URGENTDASH_AI_PROXY_TOKEN__;
    resetLocation();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the default local endpoint when nothing is configured", () => {
    expect(getAiEndpoint()).toBe("http://127.0.0.1:3010/api/ai/chat");
    expect(getAiProxyToken()).toBe("");
  });

  it("prefers canonical window config over all other endpoint sources", () => {
    vi.stubEnv("VITE_AI_ENDPOINT", "https://env.example.com/api/ai/chat");
    localStorage.setItem(AI_STORAGE_KEYS.endpoint, "https://stored.example.com/api/ai/chat");
    window.history.replaceState({}, "", "/?aiEndpoint=https%3A%2F%2Fquery.example.com%2Fapi%2Fai%2Fchat");
    window.__JPT71_AI_ENDPOINT__ = "https://window.example.com/api/ai/chat";

    expect(getAiEndpoint()).toBe("https://window.example.com/api/ai/chat");
  });

  it("uses query before env, stores it, and falls back to env before localStorage", () => {
    vi.stubEnv("VITE_AI_ENDPOINT", "https://env.example.com/api/ai/chat");
    localStorage.setItem(AI_STORAGE_KEYS.endpoint, "https://stored.example.com/api/ai/chat");
    window.history.replaceState({}, "", "/?aiEndpoint=https%3A%2F%2Fquery.example.com%2Fapi%2Fai%2Fchat");

    expect(getAiEndpoint()).toBe("https://query.example.com/api/ai/chat");
    expect(localStorage.getItem(AI_STORAGE_KEYS.endpoint)).toBe("https://query.example.com/api/ai/chat");

    resetLocation();
    expect(getAiEndpoint()).toBe("https://env.example.com/api/ai/chat");
  });

  it("resolves token from canonical window, then legacy window, env, and localStorage", () => {
    localStorage.setItem(AI_STORAGE_KEYS.proxyToken, "stored-token");
    vi.stubEnv("VITE_AI_PROXY_TOKEN", "env-token");

    expect(getAiProxyToken()).toBe("env-token");

    window.__URGENTDASH_AI_PROXY_TOKEN__ = "legacy-token";
    expect(getAiProxyToken()).toBe("legacy-token");

    window.__JPT71_AI_PROXY_TOKEN__ = "canonical-token";
    expect(getAiProxyToken()).toBe("canonical-token");
  });
});
