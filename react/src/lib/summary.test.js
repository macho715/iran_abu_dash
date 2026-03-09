import { describe, expect, it } from "vitest";

import { buildKpiSnapshot, buildOfflineSummary } from "./summary.js";

const sampleDash = {
  intelFeed: [{ priority: "HIGH", text: "intel-a" }],
  routes: [{ id: "A", status: "OPEN", name: "Route A", base_h: 3, cong: 0 }]
};

const sampleDerived = {
  modeState: "NORMAL",
  gateState: "OPEN",
  airspaceState: "OPEN",
  airspaceSegment: "ALL",
  evidenceState: "SUFFICIENT",
  leadingHypothesis: { id: "H1", name: "Demo", score: 0.5 },
  h2Score: 0.2,
  likelihoodLabel: "UNLIKELY",
  likelihoodBand: "LOW",
  ds: 0.1,
  ec: 0.4,
  effectiveThreshold: 0.3,
  urgencyScore: 0.55,
  evidenceFloorT0: 3,
  evidenceFloorPassed: true
};

describe("summary instrumentation", () => {
  it("builds KPI snapshot from anonymous telemetry", () => {
    const snapshot = buildKpiSnapshot({
      dashboard: sampleDash,
      telemetry: [
        { type: "session_start" },
        { type: "session_revisit" },
        { type: "route_selected", decisionSeconds: 120 },
        { type: "alert_response", acknowledged: true, resolved: true, falseAlarm: false }
      ]
    });

    expect(snapshot.decisionTimeReduction).toBeGreaterThan(0);
    expect(snapshot.warningAccuracy).toBe(100);
    expect(snapshot.userRevisit).toBe(100);
  });

  it("embeds KPI and A/B metadata in offline summary", () => {
    const text = buildOfflineSummary(sampleDash, sampleDerived, {
      experiments: { recommendationCopyVariant: "variant", visualizationVariant: "control" },
      kpis: {
        decisionTimeReduction: 21.1,
        warningAccuracy: 80.2,
        falseAlarmRate: 7.0,
        userRevisit: 35.0
      }
    });

    expect(text).toContain("KPI:");
    expect(text).toContain("A/B:");
  });
});
