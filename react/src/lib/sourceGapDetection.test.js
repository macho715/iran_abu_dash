import { describe, expect, it } from "vitest";

import { deriveState } from "./deriveState.js";
import {
  buildGapDetectionContext,
  getGapDetectionCacheKey,
  parseGapDetectionResponse,
} from "./sourceGapDetection.js";
import { createDashboard } from "../test/fixtures.js";

describe("sourceGapDetection", () => {
  it("builds a structured context with evidence, source health, triggers, and indicators", () => {
    const dash = createDashboard({
      metadata: {
        triggers: {
          strike_detected: true,
          red_imminent: true,
        },
        sourceOk: 2,
        sourceTotal: 6,
      },
    });
    const derived = deriveState(dash);
    const usableRoutes = dash.routes.map((route) => ({ ...route, eff: route.base_h * (1 + route.cong) * 1.15 }));

    const context = buildGapDetectionContext({
      dash,
      derived,
      usableRoutes,
      summary: { text: "룰 기반 요약", ts: "2026-03-06T10:00:00Z", mode: "OFFLINE" },
    });

    expect(context).toContain("evidence_floor:");
    expect(context).toContain("source_health:");
    expect(context).toContain("triggers:");
    expect(context).toContain("unverified_indicators:");
    expect(context).toContain("top_routes:");
  });

  it("changes the cache key when key dashboard evidence metadata changes", () => {
    const dashA = createDashboard();
    const dashB = createDashboard({
      metadata: {
        sourceOk: 2,
        sourceTotal: 6,
      },
    });

    const derivedA = deriveState(dashA);
    const derivedB = deriveState(dashB);

    expect(getGapDetectionCacheKey(dashA, derivedA)).not.toBe(getGapDetectionCacheKey(dashB, derivedB));
  });

  it("parses JSON output into normalized sections", () => {
    const parsed = parseGapDetectionResponse(
      '{"summary":"요약입니다.","missingInfo":["영공 재개 시각 확인 필요"],"contradictions":["Gate는 OPEN인데 source health는 낮음"],"nextChecks":["I02 원문 재확인"]}'
    );

    expect(parsed).toEqual({
      summary: "요약입니다.",
      missingInfo: ["영공 재개 시각 확인 필요"],
      contradictions: ["Gate는 OPEN인데 source health는 낮음"],
      nextChecks: ["I02 원문 재확인"],
    });
  });
});
