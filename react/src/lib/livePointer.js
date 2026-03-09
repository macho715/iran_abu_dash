import { normalizeWhitespace } from "./utils.js";

async function fetchJson(url) {
  const sep = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${sep}t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

export function resolveArtifactUrl(baseUrl, relativeUrl) {
  const raw = normalizeWhitespace(relativeUrl || "");
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

export function normalizeLatestPointer(raw, sourceUrl) {
  if (!raw || typeof raw !== "object") return null;
  const version = normalizeWhitespace(raw.version || "");
  const liteUrlRaw = normalizeWhitespace(raw.liteUrl || raw.lite_url || raw.litePath || raw.lite_path || "");
  if (!version || !liteUrlRaw) return null;

  const aiUrlRaw = normalizeWhitespace(raw.aiUrl || raw.ai_url || raw.aiPath || raw.ai_path || "");
  const status =
    raw.status && typeof raw.status === "object"
      ? raw.status
      : {
          lite: normalizeWhitespace(raw.status || "") || null,
          ai: normalizeWhitespace(raw.aiStatus || raw.ai_status || "") || null
        };

  return {
    version,
    collectedAt: normalizeWhitespace(raw.collectedAt || raw.collected_at || raw.publishedAt || raw.published_at || ""),
    stateTs: normalizeWhitespace(raw.stateTs || raw.state_ts || ""),
    liteUrl: resolveArtifactUrl(sourceUrl, liteUrlRaw),
    aiVersion: normalizeWhitespace(raw.aiVersion || raw.ai_version || "") || null,
    aiUpdatedAt: normalizeWhitespace(raw.aiUpdatedAt || raw.ai_updated_at || "") || null,
    aiUrl: aiUrlRaw ? resolveArtifactUrl(sourceUrl, aiUrlRaw) : null,
    legacyUrl: resolveArtifactUrl(sourceUrl, normalizeWhitespace(raw.legacyUrl || raw.legacy_url || raw.legacyPath || raw.legacy_path || "/api/state")),
    sourceUrl,
    status
  };
}

export async function fetchLatestPointer(candidates = []) {
  for (const candidate of candidates) {
    try {
      const payload = await fetchJson(candidate);
      const normalized = normalizeLatestPointer(payload, candidate);
      if (normalized) return normalized;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function fetchPointerArtifact(url) {
  if (!url) return null;
  try {
    return await fetchJson(url);
  } catch {
    return null;
  }
}

export function connectLivePointerStream({
  candidates = [],
  onVersion,
  onStatus,
  onError
} = {}) {
  if (typeof EventSource === "undefined" || !Array.isArray(candidates) || !candidates.length) {
    return () => {};
  }

  let source = null;
  let closed = false;
  let reconnectTimer = null;
  let candidateIdx = 0;

  const setStatus = (status) => {
    if (typeof onStatus === "function") onStatus(status);
  };

  const cleanup = () => {
    if (source) {
      source.close();
      source = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      candidateIdx = (candidateIdx + 1) % candidates.length;
      connect();
    }, 2000);
  };

  const connect = () => {
    cleanup();
    const pointerUrl = candidates[candidateIdx];
    const streamUrl = resolveArtifactUrl(pointerUrl, "/api/live/stream");
    setStatus("reconnecting");

    try {
      source = new EventSource(streamUrl);
    } catch (error) {
      if (typeof onError === "function") onError(error);
      scheduleReconnect();
      return;
    }

    source.addEventListener("open", () => {
      setStatus("connected");
    });

    source.addEventListener("version", (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        if (typeof onVersion === "function") onVersion(payload);
      } catch (error) {
        if (typeof onError === "function") onError(error);
      }
    });

    source.addEventListener("error", (event) => {
      if (typeof onError === "function") onError(event);
      setStatus("reconnecting");
      cleanup();
      scheduleReconnect();
    });
  };

  connect();

  return () => {
    closed = true;
    cleanup();
  };
}
