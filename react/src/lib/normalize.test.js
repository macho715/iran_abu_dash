import { describe, expect, it } from "vitest";

import { normalizeIncomingPayload } from "./normalize.js";
import { createDashboard, createSnapshot } from "../test/fixtures.js";

describe("normalizeIncomingPayload", () => {
  it("normalizes legacy snapshot payloads into dashboard state", () => {
    const normalized = normalizeIncomingPayload(createSnapshot());

    expect(normalized).not.toBeNull();
    expect(normalized.metadata.stateTs).toBe("2026-03-06T10:00:00Z");
    expect(normalized.metadata.conflictStats.source).toBe("fixture");
    expect(normalized.intelFeed[0].priority).toBe("CRITICAL");
    expect(normalized.routeGeo.nodes.A.lat).toBe(25.2);
    expect(normalized.aiAnalysis.summary).toBe("AI summary");
  });

  it("normalizes direct dashboard payloads and preserves aiAnalysis", () => {
    const normalized = normalizeIncomingPayload({ dashboard: createDashboard({ aiAnalysis: { summary: "Nested AI" } }) });

    expect(normalized).not.toBeNull();
    expect(normalized.aiAnalysis.summary).toBe("Nested AI");
    expect(normalized.routes).toHaveLength(2);
  });

  it("preserves route effective_h from backend payloads", () => {
    const normalized = normalizeIncomingPayload({
      dashboard: createDashboard({
        routes: [
          { id: "R1", name: "North", base_h: 4.5, status: "OPEN", cong: 0.2, effective_h: 7.4, note: "", newsRefs: [] }
        ]
      })
    });

    expect(normalized).not.toBeNull();
    expect(normalized.routes[0].effective_h).toBe(7.4);
    expect(normalized.routes[0].effectiveH).toBe(7.4);
  });

  it("marks payload degraded when schemaVersion is missing", () => {
    const normalized = normalizeIncomingPayload(createSnapshot({ metadata: { schemaVersion: undefined } }));

    expect(normalized).not.toBeNull();
    expect(normalized.metadata.schemaCompatible).toBe(false);
    expect(normalized.metadata.schemaMismatchReason).toBe("SCHEMA_VERSION_MISSING");
    expect(normalized.metadata.degraded).toBe(true);
  });

  it("marks payload degraded when schemaVersion is unsupported", () => {
    const normalized = normalizeIncomingPayload(createSnapshot({ metadata: { schemaVersion: "2026.01" } }));

    expect(normalized).not.toBeNull();
    expect(normalized.metadata.schemaCompatible).toBe(false);
    expect(normalized.metadata.schemaMismatchReason).toBe("SCHEMA_VERSION_UNSUPPORTED");
    expect(normalized.metadata.degraded).toBe(true);
  });

});
