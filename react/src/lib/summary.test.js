import { describe, expect, it } from "vitest";

import { deriveState } from "./deriveState.js";
import { buildKpiSnapshot, buildOfflineSummary } from "./summary.js";
import { createDashboard } from "../test/fixtures.js";

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
  it("prefers backend effective_h in offline summary", () => {
    const dash = createDashboard({
      routes: [
        { id: "R1", name: "North", base_h: 4.5, status: "OPEN", cong: 0.2, effective_h: 3.3, note: "", newsRefs: [] }
      ]
    });

    const text = buildOfflineSummary(dash, deriveState(dash));

    expect(text).toContain("Route R1 OPEN ~3.3h");
  });

  it("falls back to legacy route calculation when effective_h is missing", () => {
    const dash = createDashboard({
      routes: [
        { id: "R1", name: "North", base_h: 4.5, status: "OPEN", cong: 0.2, note: "", newsRefs: [] }
      ]
    });

    const text = buildOfflineSummary(dash, deriveState(dash));

    expect(text).toContain("Route R1 OPEN ~10.8h");
  });

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

  it("ignores notification preference events in alert KPI calculations", () => {
    const snapshot = buildKpiSnapshot({
      dashboard: sampleDash,
      telemetry: [
        { type: "notification_preference", enabled: true, action: "permission_granted" },
        { type: "session_start" }
      ]
    });

    expect(snapshot.warningAccuracy).toBe(0);
    expect(snapshot.falseAlarmRate).toBe(0);
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
