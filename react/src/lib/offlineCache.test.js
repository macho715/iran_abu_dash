import { describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  store: new Map()
}));

vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key) => mockState.store.get(key)),
  set: vi.fn(async (key, value) => {
    mockState.store.set(key, value);
  })
}));

import { get, set } from "idb-keyval";
import { cacheLastDash, loadCachedDash } from "./offlineCache.js";

describe("offlineCache", () => {
  it("stores and reloads the latest dashboard payload", async () => {
    mockState.store.clear();
    const payload = await cacheLastDash({ metadata: { stateTs: "2026-03-06T10:00:00Z" }, indicators: [], hypotheses: [] });
    const cached = await loadCachedDash();

    expect(set).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(payload.cachedAt).toBeTruthy();
    expect(cached.dashboard.metadata.stateTs).toBe("2026-03-06T10:00:00Z");
  });
});
