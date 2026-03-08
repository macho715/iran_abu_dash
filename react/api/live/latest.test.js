import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FIXED_PUBLISH_SOURCE_LABEL,
  buildLiveArtifactUrl,
  resetPublishSourceWarningForTest
} from "../_liveProxy.js";
import handler from "./latest.js";

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

describe("/api/live/latest", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetPublishSourceWarningForTest();
  });

  it("proxies latest.json from the fixed upstream source", async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ version: "2026-03-08T16-59-33Z", liteUrl: "v/2026-03-08T16-59-33Z/state-lite.json" })
    });

    const response = createResponse();
    await handler({}, response);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).version).toBe("2026-03-08T16-59-33Z");
    expect(response.headers["X-UrgentDash-Upstream"]).toBe(buildLiveArtifactUrl("latest.json"));
    expect(response.headers["X-UrgentDash-Publish-Source"]).toBe(FIXED_PUBLISH_SOURCE_LABEL);
  });
});
