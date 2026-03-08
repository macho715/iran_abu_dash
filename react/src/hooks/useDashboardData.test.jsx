import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  cachedPayload: {
    dashboard: {
      metadata: {
        stateTs: "2026-03-06T10:05:00Z",
        status: "live",
        degraded: false,
        egressLossETA: 8,
        evidenceConf: 0.84,
        effectiveThreshold: 0.8,
        deltaScore: 0.22,
        urgency: 0.72,
        triggers: {},
        conflictStats: {
          conflict_start_date: "2026-02-28",
          conflict_day: 7,
          source: "fixture",
          missiles_total: 12,
          missiles_intercepted: 10,
          drones_total: 8,
          drones_destroyed: 7,
          casualties_kia: 2,
          casualties_wia: 4
        },
        sourceOk: 5,
        sourceTotal: 6,
        source: "cache://latest"
      },
      indicators: [
        { id: "I01", name: "Embassy", tier: "TIER0", state: 0.1, cv: true, detail: "", srcCount: 2, tsIso: "2026-03-06T09:50:00Z" },
        { id: "I02", name: "Airspace", tier: "TIER0", state: 0.52, cv: true, detail: "Delays at T1", srcCount: 2, tsIso: "2026-03-06T09:51:00Z" },
        { id: "I03", name: "Strike", tier: "TIER0", state: 0.15, cv: true, detail: "", srcCount: 2, tsIso: "2026-03-06T09:52:00Z" },
        { id: "I04", name: "Border", tier: "TIER1", state: 0.10, cv: false, detail: "", srcCount: 1, tsIso: "2026-03-06T09:53:00Z" }
      ],
      hypotheses: [
        { id: "H0", name: "Stable", score: 0.18, detail: "" },
        { id: "H1", name: "Escalation", score: 0.36, detail: "" },
        { id: "H2", name: "Evacuation", score: 0.58, detail: "" }
      ],
      intelFeed: [
        { id: "intel-cache", tsIso: "2026-03-06T10:00:00Z", priority: "HIGH", category: "GENERAL", text: "Cached feed", sources: "cache" }
      ],
      routes: [
        { id: "R1", name: "North", base_h: 4.5, status: "OPEN", cong: 0.2, note: "", newsRefs: [] }
      ],
      checklist: [
        { id: 1, text: "Documents", done: false }
      ],
      routeGeo: null,
      aiAnalysis: null
    },
    cachedAt: "2026-03-06T10:06:00Z"
  }
}));

vi.mock("../lib/livePointer.js", () => ({
  fetchLatestPointer: vi.fn(async () => {
    throw new Error("pointer offline");
  }),
  fetchPointerArtifact: vi.fn(async () => null)
}));

vi.mock("../lib/offlineCache.js", () => ({
  loadCachedDash: vi.fn(async () => mockState.cachedPayload),
  cacheLastDash: vi.fn(async () => null)
}));

vi.mock("../lib/notifications.js", () => ({
  requestNotifPermission: vi.fn(async () => "granted"),
  sendCrisisNotif: vi.fn(() => true)
}));

vi.mock("../lib/sounds.js", () => ({
  alertSound: vi.fn(() => true),
  warnSound: vi.fn(() => true)
}));

import { useDashboardData } from "./useDashboardData.js";

describe("useDashboardData", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to cached dashboard data when pointer and legacy sources fail", async () => {
    const { result, unmount } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.usingCachedData).toBe(true));

    expect(result.current.error).toMatch(/마지막 정상 스냅샷/);
    expect(result.current.dash.metadata.source).toBe("cache://latest");
    expect(result.current.cachedAt).toBe("2026-03-06T10:06:00Z");

    unmount();
  });
});
