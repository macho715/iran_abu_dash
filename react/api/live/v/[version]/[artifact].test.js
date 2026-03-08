import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FIXED_PUBLISH_SOURCE_LABEL,
  buildLiveArtifactUrl,
  resetPublishSourceWarningForTest
} from "../../../_liveProxy.js";
import handler from "./[artifact].js";

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

describe("/api/live/v/:version/:artifact", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetPublishSourceWarningForTest();
  });

  it("proxies supported versioned artifacts from the fixed upstream source", async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: "ok" })
    });

    const response = createResponse();
    await handler(
      { query: { version: "2026-03-08T16-59-33Z", artifact: "state-lite.json" } },
      response
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "ok" });
    expect(response.headers["X-UrgentDash-Upstream"]).toBe(
      buildLiveArtifactUrl("v", "2026-03-08T16-59-33Z", "state-lite.json")
    );
    expect(response.headers["X-UrgentDash-Publish-Source"]).toBe(FIXED_PUBLISH_SOURCE_LABEL);
  });

  it("rejects unsupported artifacts", async () => {
    const response = createResponse();
    await handler(
      { query: { version: "2026-03-08T16-59-33Z", artifact: "latest.json" } },
      response
    );

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: "unsupported_artifact" });
  });
});
