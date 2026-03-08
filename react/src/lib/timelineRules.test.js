import { describe, expect, it } from "vitest";

import { deriveState } from "./deriveState.js";
import { appendHistory, buildDiffEvents } from "./timelineRules.js";
import { createDashboard } from "../test/fixtures.js";

describe("timelineRules", () => {
  it("deduplicates unchanged snapshots in appendHistory", () => {
    const dash = createDashboard();
    const derived = deriveState(dash);

    const once = appendHistory([], dash, derived, 96);
    const twice = appendHistory(once, dash, derived, 96);

    expect(once).toHaveLength(1);
    expect(twice).toHaveLength(1);
  });

  it("emits alert and warning events for meaningful state changes", () => {
    const prevDash = createDashboard({
      metadata: {
        deltaScore: 0.08,
        triggers: {}
      },
      indicators: [
        { id: "I01", name: "Embassy", tier: "TIER0", state: 0.1, cv: true, detail: "" },
        { id: "I02", name: "Airspace", tier: "TIER0", state: 0.2, cv: true, detail: "Open" },
        { id: "I03", name: "Strike", tier: "TIER0", state: 0.15, cv: true, detail: "" },
        { id: "I04", name: "Border", tier: "TIER1", state: 0.1, cv: false, detail: "" }
      ],
      intelFeed: [
        { id: "intel-prev", tsIso: "2026-03-06T09:10:00Z", priority: "MEDIUM", category: "GENERAL", text: "Older item", sources: "ap" }
      ]
    });
    const nextDash = createDashboard({
      metadata: {
        deltaScore: 0.26,
        triggers: {
          border_change: true,
          strike_detected: true
        }
      },
      indicators: [
        { id: "I01", name: "Embassy", tier: "TIER0", state: 0.1, cv: true, detail: "" },
        { id: "I02", name: "Airspace", tier: "TIER0", state: 0.67, cv: true, detail: "Multiple terminal delays" },
        { id: "I03", name: "Strike", tier: "TIER0", state: 0.78, cv: true, detail: "" },
        { id: "I04", name: "Border", tier: "TIER1", state: 0.65, cv: false, detail: "" }
      ],
      intelFeed: [
        { id: "intel-next", tsIso: "2026-03-06T09:55:00Z", priority: "CRITICAL", category: "AIRSPACE", text: "Critical closure update", sources: "faa" }
      ]
    });

    const events = buildDiffEvents(
      prevDash,
      nextDash,
      deriveState(prevDash),
      deriveState(nextDash)
    );

    expect(events.some((event) => event.category === "MODE" && event.level === "WARN")).toBe(true);
    expect(events.some((event) => event.category === "GATE" && event.level === "ALERT")).toBe(true);
    expect(events.some((event) => event.category === "INTEL" && event.level === "ALERT")).toBe(true);
    expect(events.some((event) => event.title.includes("ΔScore 임계 돌파"))).toBe(true);
  });

  it("uses backend effective_h when detecting route ETA spikes", () => {
    const prevDash = createDashboard({
      routes: [
        { id: "R1", name: "North", base_h: 4.5, status: "OPEN", cong: 0.2, effective_h: 5.0, note: "", newsRefs: [] }
      ]
    });
    const nextDash = createDashboard({
      routes: [
        { id: "R1", name: "North", base_h: 4.5, status: "OPEN", cong: 0.2, effective_h: 8.0, note: "", newsRefs: [] }
      ]
    });

    const events = buildDiffEvents(
      prevDash,
      nextDash,
      deriveState(prevDash),
      deriveState(nextDash)
    );

    expect(events.some((event) => event.title.includes("Route R1 effective time 급증"))).toBe(true);
    expect(events.some((event) => event.detail.includes("payload effective_h 5.0→8.0"))).toBe(true);
  });
});
