import { describe, expect, it } from "vitest";

import { deriveState } from "./deriveState.js";
import { buildOfflineSummary } from "./summary.js";
import { createDashboard } from "../test/fixtures.js";

describe("summary", () => {
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
});
