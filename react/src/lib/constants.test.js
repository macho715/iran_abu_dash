import { describe, expect, it } from "vitest";

import {
  DEFAULT_DASHBOARD_CANDIDATES,
  DEFAULT_FAST_STATE_CANDIDATES,
  DEFAULT_LATEST_CANDIDATES
} from "./constants.js";

describe("candidate ordering", () => {
  it("prefers same-origin live pointer API before GitHub raw", () => {
    expect(DEFAULT_LATEST_CANDIDATES.indexOf("/api/live/latest")).toBeGreaterThan(-1);
    expect(DEFAULT_LATEST_CANDIDATES.indexOf("/api/live/latest")).toBeLessThan(
      DEFAULT_LATEST_CANDIDATES.indexOf("https://raw.githubusercontent.com/macho715/iran_abu_dash/urgentdash-live/live/latest.json")
    );
  });

  it("prefers same-origin dashboard API before GitHub raw", () => {
    expect(DEFAULT_DASHBOARD_CANDIDATES.indexOf("/api/state")).toBeGreaterThan(-1);
    expect(DEFAULT_DASHBOARD_CANDIDATES.indexOf("/api/state")).toBeLessThan(
      DEFAULT_DASHBOARD_CANDIDATES.indexOf("https://raw.githubusercontent.com/macho715/iran_abu_dash/urgentdash-live/live/hyie_state.json")
    );
    expect(DEFAULT_FAST_STATE_CANDIDATES.indexOf("/api/state")).toBeLessThan(
      DEFAULT_FAST_STATE_CANDIDATES.indexOf("https://raw.githubusercontent.com/macho715/iran_abu_dash/urgentdash-live/live/hyie_state.json")
    );
  });
});
