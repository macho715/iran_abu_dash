import crypto from "node:crypto";

const DEFAULT_OWNER = "macho715";
const DEFAULT_REPO = "iran_abu_dash";
const DEFAULT_BRANCH = "urgentdash-live";
const IGNORED_OVERRIDE_KEYS = [
  "URGENTDASH_GITHUB_OWNER",
  "URGENTDASH_GITHUB_REPO",
  "URGENTDASH_PUBLISH_BRANCH"
];

let didWarnIgnoredOverrides = false;

export const FIXED_PUBLISH_SOURCE = Object.freeze({
  owner: DEFAULT_OWNER,
  repo: DEFAULT_REPO,
  branch: DEFAULT_BRANCH
});

export const FIXED_PUBLISH_SOURCE_LABEL = `${DEFAULT_OWNER}/${DEFAULT_REPO}@${DEFAULT_BRANCH}`;

export function getIgnoredPublishOverrides(env = process.env) {
  return IGNORED_OVERRIDE_KEYS.flatMap((key) => {
    const value = String(env?.[key] || "").trim();
    return value ? [`${key}=${value}`] : [];
  });
}

export function warnIgnoredPublishOverrides(env = process.env, logger = console) {
  const ignoredOverrides = getIgnoredPublishOverrides(env);
  if (!ignoredOverrides.length || didWarnIgnoredOverrides) return;

  didWarnIgnoredOverrides = true;
  if (typeof logger?.warn === "function") {
    logger.warn(
      `[urgentdash] Ignoring publish source override(s): ${ignoredOverrides.join(", ")}. Using fixed production source ${FIXED_PUBLISH_SOURCE_LABEL}.`
    );
  }
}

export function resetPublishSourceWarningForTest() {
  didWarnIgnoredOverrides = false;
}

export function getPublishSource({ env = process.env, logger = console } = {}) {
  warnIgnoredPublishOverrides(env, logger);
  return FIXED_PUBLISH_SOURCE;
}

export function buildLiveArtifactUrl(...segments) {
  const { owner, repo, branch } = getPublishSource();
  const path = segments
    .filter(Boolean)
    .map((segment) => encodeURIComponent(String(segment)))
    .join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/live/${path}`;
}

function withCacheBust(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}ts=${Date.now()}`;
}

export async function fetchUpstreamJson(url) {
  const response = await fetch(withCacheBust(url), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache"
    }
  });

  const body = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

export function applyProxyHeaders(response, upstreamUrl) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.setHeader("CDN-Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.setHeader("Vercel-CDN-Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("X-UrgentDash-Upstream", upstreamUrl);
  response.setHeader("X-UrgentDash-Publish-Source", FIXED_PUBLISH_SOURCE_LABEL);
  response.setHeader("X-UrgentDash-Proxy-Version", "2026-03-08-integrity-v1");
}

function sha256Hex(raw) {
  return crypto.createHash("sha256").update(String(raw || ""), "utf8").digest("hex");
}

function parseHashBody(body) {
  const text = String(body || "").trim();
  return text.replace(/^sha256:/, "").trim();
}

function parseSigBody(body) {
  const text = String(body || "").trim();
  return text.replace(/^sha256sig:/, "").trim();
}

export function computeExpectedSig(filename, digest) {
  return sha256Hex(`${filename}:${digest}`);
}

export function verifyBodyIntegrity(filename, body, expectedHash, expectedSig) {
  const digest = sha256Hex(body);
  const sig = computeExpectedSig(filename, digest);
  return {
    digest,
    sig,
    hashMatch: Boolean(expectedHash) && digest === expectedHash,
    sigMatch: Boolean(expectedSig) && sig === expectedSig
  };
}

export async function fetchText(url) {
  const response = await fetch(withCacheBust(url), {
    cache: "no-store",
    headers: {
      Accept: "text/plain",
      "Cache-Control": "no-cache",
      Pragma: "no-cache"
    }
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

export async function fetchAndVerifyArtifact({ artifactUrl, filename, integrity }) {
  const upstream = await fetchUpstreamJson(artifactUrl);
  if (!upstream.ok) {
    return { ok: false, reason: "artifact_fetch_failed", status: upstream.status };
  }

  const verification = verifyBodyIntegrity(
    filename,
    upstream.body,
    String(integrity?.hash || ""),
    String(integrity?.sig || "")
  );

  const hashUrl = integrity?.hashUrl ? buildLiveArtifactUrl(...String(integrity.hashUrl).split("/")) : "";
  const sigUrl = integrity?.sigUrl ? buildLiveArtifactUrl(...String(integrity.sigUrl).split("/")) : "";

  if (hashUrl) {
    const hashDoc = await fetchText(hashUrl);
    if (!hashDoc.ok || parseHashBody(hashDoc.body) !== verification.digest) {
      return { ok: false, reason: "hash_sidecar_mismatch", verification };
    }
  }

  if (sigUrl) {
    const sigDoc = await fetchText(sigUrl);
    if (!sigDoc.ok || parseSigBody(sigDoc.body) !== verification.sig) {
      return { ok: false, reason: "sig_sidecar_mismatch", verification };
    }
  }

  if (!verification.hashMatch || !verification.sigMatch) {
    return { ok: false, reason: "pointer_integrity_mismatch", verification };
  }

  return { ok: true, body: upstream.body, verification };
}

export async function proxyUpstreamJson(response, upstreamUrl) {
  applyProxyHeaders(response, upstreamUrl);

  try {
    const upstream = await fetchUpstreamJson(upstreamUrl);
    if (!upstream.ok) {
      response.status(upstream.status).send(
        JSON.stringify({
          error: "upstream_fetch_failed",
          upstreamStatus: upstream.status,
          upstreamUrl
        })
      );
      return;
    }

    response.status(200).send(upstream.body);
  } catch (error) {
    response.status(502).send(
      JSON.stringify({
        error: "upstream_request_error",
        message: String(error?.message || error || ""),
        upstreamUrl
      })
    );
  }
}

export async function proxyLiveJson(response, ...segments) {
  const upstreamUrl = buildLiveArtifactUrl(...segments);
  await proxyUpstreamJson(response, upstreamUrl);
}
