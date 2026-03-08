import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_STALE_CRITICAL_THRESHOLD_SECONDS, LIVE_STALE_SEVERE_THRESHOLD_SECONDS, LIVE_STALE_THRESHOLD_SECONDS } from "./constants.js";
import { deriveState } from "./deriveState.js";
import { createDashboard } from "../test/fixtures.js";

describe("deriveState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies stale severity thresholds using inclusive boundaries", () => {
    const fresh = deriveState(
      createDashboard({ metadata: { stateTs: new Date(Date.now() - (LIVE_STALE_THRESHOLD_SECONDS - 60) * 1000).toISOString() } })
    );
    const stale = deriveState(
      createDashboard({ metadata: { stateTs: new Date(Date.now() - LIVE_STALE_THRESHOLD_SECONDS * 1000).toISOString() } })
    );
    const severe = deriveState(
      createDashboard({ metadata: { stateTs: new Date(Date.now() - LIVE_STALE_SEVERE_THRESHOLD_SECONDS * 1000).toISOString() } })
    );
    const critical = deriveState(
      createDashboard({ metadata: { stateTs: new Date(Date.now() - LIVE_STALE_CRITICAL_THRESHOLD_SECONDS * 1000).toISOString() } })
    );

    expect(fresh.staleSeverity).toBe("FRESH");
    expect(fresh.liveStale).toBe(false);
    expect(stale.staleSeverity).toBe("STALE");
    expect(stale.liveStale).toBe(true);
    expect(severe.staleSeverity).toBe("SEVERE");
    expect(critical.staleSeverity).toBe("CRITICAL");
  });

  it("derives mode, gate, and airspace states from indicators and triggers", () => {
    const derived = deriveState(createDashboard({
      metadata: {
        deltaScore: 0.31,
        triggers: {
          kr_leave_immediately: true,
          border_change: true
        }
      },
      indicators: [
        { id: "I01", name: "Embassy", tier: "TIER0", state: 0.96, cv: true, detail: "" },
        { id: "I02", name: "Airspace", tier: "TIER0", state: 0.82, cv: true, detail: "Airport closed" },
        { id: "I03", name: "Strike", tier: "TIER0", state: 0.25, cv: true, detail: "" },
        { id: "I04", name: "Border", tier: "TIER1", state: 0.72, cv: false, detail: "" }
      ]
    }));

    expect(derived.modeState).toBe("RED_PREP");
    expect(derived.gateState).toBe("BLOCKED");
    expect(derived.airspaceState).toBe("CLOSED");
    expect(derived.airspaceSegment).toBe("CLOSED");
    expect(derived.evidenceFloorPassed).toBe(true);
  });
});
