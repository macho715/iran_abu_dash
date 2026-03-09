import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FIXED_PUBLISH_SOURCE_LABEL,
  buildLiveArtifactUrl,
  computeExpectedSig,
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

function textResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => String(payload)
  };
}

function sha256Hex(raw) {
  return crypto.createHash("sha256").update(String(raw || ""), "utf8").digest("hex");
}

describe("/api/state", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetPublishSourceWarningForTest();
    delete process.env.URGENTDASH_INTEGRITY_FAILURE_POLICY;
  });

  it("merges lite and ai payloads with integrity verification", async () => {
    const version = "2026-03-08T16-59-33Z";
    const latestUrl = buildLiveArtifactUrl("latest.json");
    const liteUrl = buildLiveArtifactUrl("v", version, "state-lite.json");
    const aiUrl = buildLiveArtifactUrl("v", version, "state-ai.json");

    const litePayload = {
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
    };
    const aiPayload = {
      ai_analysis: { summary: "live ai" },
      aiVersion: "2026-03-08T21:00:02+04:00",
      aiUpdatedAt: "2026-03-08T21:00:02+04:00",
      aiStatus: "ok"
    };
    const liteBody = JSON.stringify(litePayload);
    const aiBody = JSON.stringify(aiPayload);
    const liteHash = sha256Hex(liteBody);
    const aiHash = sha256Hex(aiBody);

    fetch.mockImplementation(async (url) => {
      const requestUrl = String(url).replace(/\?ts=\d+$/, "");
      if (requestUrl === latestUrl) {
        return jsonResponse({
          version,
          schemaVersion: "2025.10",
          collectedAt: "2026-03-08T17:00:00Z",
          status: { lite: "ok", ai: "ok" },
          liteUrl: `v/${version}/state-lite.json`,
          aiUrl: `v/${version}/state-ai.json`,
          integrity: {
            lite: {
              hash: liteHash,
              sig: computeExpectedSig("state-lite.json", liteHash),
              hashUrl: `v/${version}/state-lite.json.sha256`,
              sigUrl: `v/${version}/state-lite.json.sig`
            },
            ai: {
              hash: aiHash,
              sig: computeExpectedSig("state-ai.json", aiHash),
              hashUrl: `v/${version}/state-ai.json.sha256`,
              sigUrl: `v/${version}/state-ai.json.sig`
            }
          }
        });
      }
      if (requestUrl === liteUrl) return textResponse(liteBody);
      if (requestUrl === aiUrl) return textResponse(aiBody);
      if (requestUrl === buildLiveArtifactUrl("v", version, "state-lite.json.sha256")) return textResponse(`sha256:${liteHash}`);
      if (requestUrl === buildLiveArtifactUrl("v", version, "state-lite.json.sig")) return textResponse(`sha256sig:${computeExpectedSig("state-lite.json", liteHash)}`);
      if (requestUrl === buildLiveArtifactUrl("v", version, "state-ai.json.sha256")) return textResponse(`sha256:${aiHash}`);
      if (requestUrl === buildLiveArtifactUrl("v", version, "state-ai.json.sig")) return textResponse(`sha256sig:${computeExpectedSig("state-ai.json", aiHash)}`);
      throw new Error(`Unexpected URL: ${requestUrl}`);
    });

    const response = createResponse();
    await handler({}, response);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      status: "ok",
      ai_analysis: { summary: "live ai" }
    });
    expect(response.headers["X-UrgentDash-Upstream"]).toBe(liteUrl);
    expect(response.headers["X-UrgentDash-AI-Upstream"]).toBe(aiUrl);
    expect(response.headers["X-UrgentDash-Publish-Source"]).toBe(FIXED_PUBLISH_SOURCE_LABEL);
    expect(response.headers["X-UrgentDash-State-Mode"]).toBe("latest-pointer-merged");
    expect(response.headers["X-UrgentDash-Integrity"]).toBe("verified");
  });

  it("returns fallback when integrity verification fails", async () => {
    const version = "2026-03-08T16-59-33Z";
    const latestUrl = buildLiveArtifactUrl("latest.json");
    const liteUrl = buildLiveArtifactUrl("v", version, "state-lite.json");
    const legacyUrl = buildLiveArtifactUrl("hyie_state.json");

    fetch.mockImplementation(async (url) => {
      const requestUrl = String(url).replace(/\?ts=\d+$/, "");
      if (requestUrl === latestUrl) {
        return jsonResponse({
          version,
          schemaVersion: "2025.10",
          collectedAt: "2026-03-08T17:00:00Z",
          status: { lite: "ok", ai: "pending" },
          liteUrl: `v/${version}/state-lite.json`,
          legacyUrl: "hyie_state.json",
          integrity: { lite: { hash: "bad", sig: "bad" } }
        });
      }
      if (requestUrl === liteUrl) return jsonResponse({ status: "ok" });
      if (requestUrl === legacyUrl) return jsonResponse({ status: "legacy" });
      throw new Error(`Unexpected URL: ${requestUrl}`);
    });

    const response = createResponse();
    await handler({}, response);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ status: "legacy" });
    expect(response.headers["X-UrgentDash-Integrity"]).toBe("fallback");
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
    const liteBody = JSON.stringify({
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
    const liteHash = sha256Hex(liteBody);

    fetch.mockImplementation(async (url) => {
      const requestUrl = String(url).replace(/\?ts=\d+$/, "");
      if (requestUrl === latestUrl) {
        return jsonResponse({
          version,
          schemaVersion: "2025.10",
          collectedAt: "2026-03-08T17:00:00Z",
          status: { lite: "ok", ai: "pending" },
          liteUrl: `v/${version}/state-lite.json`,
          integrity: {
            lite: {
              hash: liteHash,
              sig: computeExpectedSig("state-lite.json", liteHash),
              hashUrl: `v/${version}/state-lite.json.sha256`,
              sigUrl: `v/${version}/state-lite.json.sig`
            }
          }
        });
      }
      if (requestUrl === liteUrl) return textResponse(liteBody);
      if (requestUrl === buildLiveArtifactUrl("v", version, "state-lite.json.sha256")) return textResponse(`sha256:${liteHash}`);
      if (requestUrl === buildLiveArtifactUrl("v", version, "state-lite.json.sig")) return textResponse(`sha256sig:${computeExpectedSig("state-lite.json", liteHash)}`);
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
