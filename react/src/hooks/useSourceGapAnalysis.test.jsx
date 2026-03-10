import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deriveState } from "../lib/deriveState.js";
import { SOURCE_GAP_CACHE_STORAGE_KEY } from "../lib/sourceGapDetection.js";
import { createDashboard } from "../test/fixtures.js";
import { useSourceGapAnalysis } from "./useSourceGapAnalysis.js";

vi.mock("../lib/aiChat.js", () => ({
  callAiChat: vi.fn(),
}));

import { callAiChat } from "../lib/aiChat.js";

describe("useSourceGapAnalysis", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createParams(overrides = {}) {
    const dash = createDashboard(overrides);
    const derived = deriveState(dash);
    const usableRoutes = dash.routes.map((route) => ({ ...route, eff: route.base_h * (1 + route.cong) * 1.15 }));
    return {
      dash,
      derived,
      usableRoutes,
      summary: { text: "룰 기반 요약", ts: "2026-03-06T10:00:00Z", mode: "OFFLINE" },
    };
  }

  it("loads a matching cached result immediately", async () => {
    const params = createParams();
    const cache = {
      cacheKey: `${params.dash.metadata.stateTs}#live#0#H0:0.180|H1:0.360|H2:0.580#I01:0.10:1:2|I02:0.52:1:2|I03:0.15:1:2|I04:0.10:0:1#R1:OPEN:0.20:4.5:-1.00|R2:CAUTION:0.40:6.0:-1.00#2026-03-06T09:55:00Z#RED_PREP#OPEN#DISRUPTED#PASSED#3#5/6 ok#UNKNOWN`,
      updatedAt: "2026-03-06T10:05:00Z",
      result: {
        summary: "캐시 요약",
        missingInfo: ["부족 1"],
        contradictions: [],
        nextChecks: ["확인 1"],
      },
    };
    window.localStorage.setItem(SOURCE_GAP_CACHE_STORAGE_KEY, JSON.stringify(cache));

    const { result } = renderHook(() => useSourceGapAnalysis(params));

    await waitFor(() => expect(result.current.result?.summary).toBe("캐시 요약"));
    expect(result.current.cacheStatus).toBe("current");
    expect(result.current.stale).toBe(false);
  });

  it("marks cached results as stale when the dashboard key changes", async () => {
    const initial = createParams();
    const { result, rerender } = renderHook(
      ({ params }) => useSourceGapAnalysis(params),
      { initialProps: { params: initial } }
    );

    act(() => {
      window.localStorage.setItem(
        SOURCE_GAP_CACHE_STORAGE_KEY,
        JSON.stringify({
          cacheKey: result.current.cacheStatus === "empty" ? "" : result.current.cacheStatus,
          updatedAt: "2026-03-06T10:05:00Z",
          result: {
            summary: "이전 분석",
            missingInfo: ["부족 1"],
            contradictions: [],
            nextChecks: ["확인 1"],
          },
        })
      );
    });

    rerender({ params: createParams({ metadata: { sourceOk: 2, sourceTotal: 6 } }) });

    await waitFor(() => expect(result.current.result?.summary).toBe("이전 분석"));
    expect(result.current.stale).toBe(true);
    expect(result.current.cacheStatus).toBe("stale");
  });

  it("refreshes analysis and stores the normalized result", async () => {
    vi.mocked(callAiChat).mockResolvedValue({
      text: '{"summary":"새 분석","missingInfo":["공백"],"contradictions":["모순"],"nextChecks":["확인"]}',
      payload: {},
    });

    const params = createParams();
    const { result } = renderHook(() => useSourceGapAnalysis(params));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.result).toEqual({
      summary: "새 분석",
      missingInfo: ["공백"],
      contradictions: ["모순"],
      nextChecks: ["확인"],
    });
    expect(result.current.cacheStatus).toBe("current");
    expect(JSON.parse(window.localStorage.getItem(SOURCE_GAP_CACHE_STORAGE_KEY))).toEqual(
      expect.objectContaining({
        result: expect.objectContaining({ summary: "새 분석" }),
      })
    );
  });
});
