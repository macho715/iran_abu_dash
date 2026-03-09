import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FIXED_PUBLISH_SOURCE_LABEL,
  buildLiveArtifactUrl,
  resetPublishSourceWarningForTest
} from "./_liveProxy.js";
import handler from "./state.js";

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

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload)
  };
}

describe("/api/state", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetPublishSourceWarningForTest();
  });

  it("merges lite and ai payloads from the fixed upstream source", async () => {
    const version = "2026-03-08T16-59-33Z";
    const latestUrl = buildLiveArtifactUrl("latest.json");
    const liteUrl = buildLiveArtifactUrl("v", version, "state-lite.json");
    const aiUrl = buildLiveArtifactUrl("v", version, "state-ai.json");

    fetch.mockImplementation(async (url) => {
      const requestUrl = String(url).replace(/\?ts=\d+$/, "");
      if (requestUrl === latestUrl) {
        return jsonResponse({
          version,
          schemaVersion: "2025.10",
          collectedAt: "2026-03-08T17:00:00Z",
          status: { lite: "ok", ai: "ok" },
          liteUrl: `v/${version}/state-lite.json`,
          aiUrl: `v/${version}/state-ai.json`
        });
      }
      if (requestUrl === liteUrl) {
        return jsonResponse({
          version,
          schemaVersion: "2025.10",
          generatedAt: "2026-03-08T17:00:00Z",
          state_ts: "2026-03-08T17:00:00Z",
          status: "ok",
          source_health: {},
          degraded: false,
          flags: [],
          intel_feed: [],
          routes: [],
          indicators: [],
          hypotheses: [],
          checklist: []
        });
      }
      if (requestUrl === aiUrl) {
        return jsonResponse({
          ai_analysis: { summary: "live ai" },
          aiVersion: "2026-03-08T21:00:02+04:00",
          aiUpdatedAt: "2026-03-08T21:00:02+04:00",
          aiStatus: "ok"
        });
      }
      throw new Error(`Unexpected URL: ${requestUrl}`);
    });

    const response = createResponse();
    await handler({}, response);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      status: "ok",
      ai_analysis: { summary: "live ai" },
      aiVersion: "2026-03-08T21:00:02+04:00",
      aiUpdatedAt: "2026-03-08T21:00:02+04:00",
      aiStatus: "ok"
    });
    expect(response.headers["X-UrgentDash-Upstream"]).toBe(liteUrl);
    expect(response.headers["X-UrgentDash-AI-Upstream"]).toBe(aiUrl);
    expect(response.headers["X-UrgentDash-Publish-Source"]).toBe(FIXED_PUBLISH_SOURCE_LABEL);
    expect(response.headers["X-UrgentDash-State-Mode"]).toBe("latest-pointer-merged");
  });

  it("returns contract error when latest pointer misses schemaVersion", async () => {
    const latestUrl = buildLiveArtifactUrl("latest.json");

    fetch.mockImplementation(async (url) => {
      const requestUrl = String(url).replace(/\?ts=\d+$/, "");
      if (requestUrl === latestUrl) {
        return jsonResponse({ version: "2026-03-08T16-59-33Z", liteUrl: "v/x/state-lite.json" });
      }
      throw new Error(`Unexpected URL: ${requestUrl}`);
    });

    const response = createResponse();
    await handler({}, response);

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toMatchObject({
      errorCode: "LATEST_CONTRACT_ERROR",
      reasonCode: "LATEST_REQUIRED_KEYS_MISSING"
    });
  });

  it("returns contract error when state payload misses generatedAt", async () => {
    const version = "2026-03-08T16-59-33Z";
    const latestUrl = buildLiveArtifactUrl("latest.json");
    const liteUrl = buildLiveArtifactUrl("v", version, "state-lite.json");

    fetch.mockImplementation(async (url) => {
      const requestUrl = String(url).replace(/\?ts=\d+$/, "");
      if (requestUrl === latestUrl) {
        return jsonResponse({
          version,
          schemaVersion: "2025.10",
          collectedAt: "2026-03-08T17:00:00Z",
          status: { lite: "ok", ai: "ok" },
          liteUrl: `v/${version}/state-lite.json`
        });
      }
      if (requestUrl === liteUrl) {
        return jsonResponse({
          version,
          schemaVersion: "2025.10",
          state_ts: "2026-03-08T17:00:00Z",
          status: "ok",
          source_health: {},
          degraded: false,
          flags: [],
          intel_feed: [],
          routes: [],
          indicators: [],
          hypotheses: [],
          checklist: []
        });
      }
      throw new Error(`Unexpected URL: ${requestUrl}`);
    });

    const response = createResponse();
    await handler({}, response);

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toMatchObject({
      errorCode: "STATE_CONTRACT_ERROR",
      reasonCode: "STATE_REQUIRED_KEYS_MISSING"
    });
  });

});
