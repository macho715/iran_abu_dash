import { describe, expect, it } from "vitest";

import { mergeTimelineWithNoiseGate } from "./noiseGate.js";

describe("noiseGate", () => {
  it("suppresses duplicate events within the noise window", () => {
    const existing = [
      {
        id: "existing",
        ts: "2026-03-06T10:00:00Z",
        category: "SYSTEM",
        title: "Fast poll degraded",
        detail: "latest pointer unavailable",
        noiseKey: "SYSTEM|FAST_POLL|FAIL"
      }
    ];
    const incoming = [
      {
        id: "incoming",
        ts: "2026-03-06T10:05:00Z",
        category: "SYSTEM",
        title: "Fast poll degraded",
        detail: "latest pointer unavailable",
        noiseKey: "SYSTEM|FAST_POLL|FAIL"
      }
    ];

    const merged = mergeTimelineWithNoiseGate(existing, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("existing");
  });
});
