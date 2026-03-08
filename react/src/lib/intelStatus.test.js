import { describe, expect, it } from "vitest";

import { countIntelStatuses } from "./intelStatus.js";

describe("countIntelStatuses", () => {
  it("counts each intel status and reports hasFresh", () => {
    expect(
      countIntelStatuses([
        { status: "fresh" },
        { status: "fresh" },
        { status: "repeated" },
        { status: "official" },
      ])
    ).toEqual({
      freshCount: 2,
      repeatedCount: 1,
      officialCount: 1,
      hasFresh: true,
    });
  });

  it("treats official items as fresh when hasFresh is derived", () => {
    expect(countIntelStatuses([{ status: "official" }]).hasFresh).toBe(true);
    expect(countIntelStatuses([{ status: "repeated" }]).hasFresh).toBe(false);
  });

  it("treats missing status as fresh by default", () => {
    expect(countIntelStatuses([{}])).toEqual({
      freshCount: 1,
      repeatedCount: 0,
      officialCount: 0,
      hasFresh: true,
    });
  });
});
