import { computeDashboardKey } from "./timelineRules.js";
import {
  getRouteEffectiveHours,
  normalizeWhitespace,
  safeGetLS,
  safeJsonParse,
  safeSetLS,
  truncate,
} from "./utils.js";

export const SOURCE_GAP_CACHE_STORAGE_KEY = "urgentdash_ai_source_gap_v1";

const MAX_ITEMS = 3;

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeWhitespace(item))
      .filter(Boolean)
      .slice(0, MAX_ITEMS);
  }

  if (typeof value === "string") {
    return value
      .split(/\s*(?:\n|•|-|\d+\.)\s+/)
      .map((item) => normalizeWhitespace(item))
      .filter(Boolean)
      .slice(0, MAX_ITEMS);
  }

  return [];
}

function formatRoute(route) {
  if (!route) return "";
  const eta = getRouteEffectiveHours(route);
  return `${route.id} ${route.status || "n/a"} ${Number.isFinite(eta) ? `~${eta.toFixed(1)}h` : "n/a"} ${truncate(route.name || "", 60)}`;
}

function formatIntel(item) {
  if (!item) return "";
  return `[${item.priority || "n/a"}] ${truncate(item.text || "", 120)}`;
}

function formatIndicator(indicator) {
  if (!indicator) return "";
  return `${indicator.id} tier=${indicator.tier || "n/a"} state=${Number(indicator.state || 0).toFixed(2)} cv=${indicator.cv ? "verified" : "partial"} src=${Math.max(Number(indicator.srcCount || 0), 0)} ${truncate(indicator.detail || "", 80)}`;
}

function formatTrigger(trigger) {
  if (!trigger) return "";
  return `${trigger.label || trigger.id || "unknown"}=${trigger.active ? "active" : "clear"}`;
}

function readSummaryText(summary) {
  if (typeof summary === "string") return normalizeWhitespace(summary);
  return normalizeWhitespace(summary?.text || "");
}

function extractJsonBlock(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf("{");
  if (start === -1) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return "";
}

function parseMaybeJson(text) {
  const candidates = [extractJsonBlock(text), text].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return null;
}

function normalizeGapDetectionResult(value) {
  const summary = normalizeWhitespace(
    value?.summary
      || value?.overview
      || value?.message
      || ""
  );
  return {
    summary,
    missingInfo: normalizeList(value?.missingInfo ?? value?.missing_info ?? value?.missing ?? []),
    contradictions: normalizeList(value?.contradictions ?? value?.conflicts ?? value?.conflictSignals ?? []),
    nextChecks: normalizeList(value?.nextChecks ?? value?.next_checks ?? value?.checks ?? []),
  };
}

export function parseGapDetectionResponse(input) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return normalizeGapDetectionResult(input);
  }

  const rawText = typeof input === "string" ? input.trim() : "";
  if (!rawText) {
    return normalizeGapDetectionResult({});
  }

  const parsed = parseMaybeJson(rawText);
  if (parsed && typeof parsed === "object") {
    return normalizeGapDetectionResult(parsed);
  }

  return normalizeGapDetectionResult({ summary: rawText });
}

export function buildGapDetectionContext({ dash, derived, usableRoutes, summary }) {
  const topIntel = (dash?.intelFeed || [])
    .slice(0, MAX_ITEMS)
    .map(formatIntel)
    .filter(Boolean);
  const topRoutes = (usableRoutes || [])
    .slice(0, MAX_ITEMS)
    .map(formatRoute)
    .filter(Boolean);
  const unverifiedIndicators = (dash?.indicators || [])
    .filter((indicator) => !indicator?.cv || Math.max(Number(indicator?.srcCount || 0), 0) < 2)
    .slice(0, 5)
    .map(formatIndicator)
    .filter(Boolean);
  const hypotheses = (derived?.decisionTrace?.scoreBreakdown?.hypotheses || [])
    .slice(0, MAX_ITEMS)
    .map((item) => `${item.id}:${Number(item.score || 0).toFixed(3)}`)
    .join(" | ");
  const triggers = (derived?.decisionTrace?.triggerBreakdown || [])
    .slice(0, 5)
    .map(formatTrigger)
    .filter(Boolean)
    .join(" | ");
  const thresholdBreakdown = derived?.decisionTrace?.thresholdBreakdown || {};
  const ruleSummary = readSummaryText(summary);

  const sections = [
    `mode: ${derived?.modeState || "n/a"}`,
    `gate: ${derived?.gateState || "n/a"}`,
    `airspace: ${derived?.airspaceState || "n/a"} (${derived?.airspaceSegment || "n/a"})`,
    `urgency: ${Number(derived?.urgencyScore || 0).toFixed(2)}`,
    `evidence_state: ${derived?.evidenceState || "n/a"} conf=${Number(derived?.ec || 0).toFixed(3)} thr=${Number(derived?.effectiveThreshold || 0).toFixed(3)}`,
    `evidence_floor: tier0_cv=${Number(derived?.evidenceFloorT0 || 0)} passed=${derived?.evidenceFloorPassed ? "yes" : "no"}`,
    `source_health: ${derived?.sourceHealthLabel || "n/a"} stale=${derived?.staleSeverity || "n/a"} live_lag=${Number.isFinite(derived?.liveLagSeconds) ? `${derived.liveLagSeconds}s` : "n/a"} integrity=${derived?.integrityLabel || "n/a"}`,
    `thresholds: evidence_pass=${thresholdBreakdown?.evidence?.passed ? "yes" : "no"} delta_pass=${thresholdBreakdown?.deltaScore?.passed ? "yes" : "no"} gate_state=${thresholdBreakdown?.gate?.state || "n/a"}`,
    `top_hypotheses: ${hypotheses || "n/a"}`,
    `triggers: ${triggers || "n/a"}`,
  ];

  if (unverifiedIndicators.length) {
    sections.push(`unverified_indicators: ${unverifiedIndicators.join(" | ")}`);
  }

  if (topIntel.length) {
    sections.push(`top_intel: ${topIntel.join(" | ")}`);
  }

  if (topRoutes.length) {
    sections.push(`top_routes: ${topRoutes.join(" | ")}`);
  }

  if (ruleSummary) {
    sections.push(`rule_summary: ${truncate(ruleSummary, 700)}`);
  }

  if (dash?.aiAnalysis?.summary) {
    sections.push(`notebooklm_summary: ${truncate(dash.aiAnalysis.summary, 500)}`);
  }

  return sections.join("\n");
}

export function getGapDetectionCacheKey(dash, derived) {
  const dashboardKey = computeDashboardKey(dash);
  const parts = [
    dashboardKey,
    derived?.modeState || "",
    derived?.gateState || "",
    derived?.airspaceState || "",
    derived?.evidenceState || "",
    String(derived?.evidenceFloorT0 ?? ""),
    derived?.sourceHealthLabel || "",
    derived?.integrityLabel || "",
  ];
  return parts.join("#");
}

export function loadGapDetectionCache() {
  const raw = safeGetLS(SOURCE_GAP_CACHE_STORAGE_KEY, "");
  const parsed = safeJsonParse(raw, null);
  if (!parsed || typeof parsed !== "object") return null;
  if (!parsed.result || typeof parsed.result !== "object") return null;
  return {
    cacheKey: normalizeWhitespace(parsed.cacheKey || ""),
    updatedAt: normalizeWhitespace(parsed.updatedAt || ""),
    result: normalizeGapDetectionResult(parsed.result),
  };
}

export function saveGapDetectionCache({ cacheKey, updatedAt, result }) {
  safeSetLS(
    SOURCE_GAP_CACHE_STORAGE_KEY,
    JSON.stringify({
      cacheKey: normalizeWhitespace(cacheKey),
      updatedAt: normalizeWhitespace(updatedAt),
      result: normalizeGapDetectionResult(result),
    })
  );
}

export function getGapDetectionSeverity(result) {
  if ((result?.contradictions || []).length > 0) return "critical";
  if ((result?.missingInfo || []).length > 0) return "warning";
  return "neutral";
}
