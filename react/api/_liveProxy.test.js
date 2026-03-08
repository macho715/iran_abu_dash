import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FIXED_PUBLISH_SOURCE,
  FIXED_PUBLISH_SOURCE_LABEL,
  applyProxyHeaders,
  buildLiveArtifactUrl,
  getPublishSource,
  resetPublishSourceWarningForTest
} from "./_liveProxy.js";

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    }
  };
}

describe("_liveProxy", () => {
  afterEach(() => {
    resetPublishSourceWarningForTest();
    vi.restoreAllMocks();
  });

  it("locks the publish source to iran_abu_dash urgentdash-live", () => {
    expect(getPublishSource()).toEqual(FIXED_PUBLISH_SOURCE);
    expect(buildLiveArtifactUrl("v", "2026-03-08T16-59-33Z", "state-lite.json")).toBe(
      "https://raw.githubusercontent.com/macho715/iran_abu_dash/urgentdash-live/live/v/2026-03-08T16-59-33Z/state-lite.json"
    );
  });

  it("ignores publish source env overrides and warns once", () => {
    const warn = vi.fn();
    const env = {
      URGENTDASH_GITHUB_OWNER: "macho715",
      URGENTDASH_GITHUB_REPO: "escapeplan",
      URGENTDASH_PUBLISH_BRANCH: "main"
    };

    expect(getPublishSource({ env, logger: { warn } })).toEqual(FIXED_PUBLISH_SOURCE);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("URGENTDASH_GITHUB_REPO=escapeplan");
    expect(warn.mock.calls[0][0]).toContain(FIXED_PUBLISH_SOURCE_LABEL);
  });

  it("applies publish source diagnostics headers", () => {
    const response = createResponse();
    const upstreamUrl = buildLiveArtifactUrl("latest.json");

    applyProxyHeaders(response, upstreamUrl);

    expect(response.headers["X-UrgentDash-Upstream"]).toBe(upstreamUrl);
    expect(response.headers["X-UrgentDash-Publish-Source"]).toBe(FIXED_PUBLISH_SOURCE_LABEL);
    expect(response.headers["Cache-Control"]).toBe("private, no-store, max-age=0, must-revalidate");
  });
});
