import { SNAPSHOT_REQUIRED_KEYS } from "./constants.js";
import { clamp01, clampEgress, inferEvidenceFromSource, summarizeSourceHealth, toTsIso, normalizeWhitespace, safeNumber } from "./utils.js";

export function normalizeConflictStats(raw = {}) {
  const toInt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
  };
  const startDateStr = normalizeWhitespace(raw?.conflict_start_date ?? raw?.conflictStartDate ?? "2026-02-28") || "2026-02-28";
  const rawDay = raw?.conflict_day ?? raw?.conflictDay;
  let conflict_day = Number.isFinite(Number(rawDay)) ? Math.trunc(Number(rawDay)) : null;
  const startDate = new Date(startDateStr);
  if (conflict_day == null && !Number.isNaN(startDate.getTime())) {
    const now = new Date();
    conflict_day = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / 86400000) + 1);
  }
  return {
    conflict_start_date: startDateStr,
    conflict_day,
    source: normalizeWhitespace(raw?.source ?? raw?.conflict_source ?? raw?.conflictSource ?? "n/a") || "n/a",
    missiles_total: toInt(raw?.missiles_total ?? raw?.missilesTotal),
    missiles_intercepted: toInt(raw?.missiles_intercepted ?? raw?.missilesIntercepted),
    drones_total: toInt(raw?.drones_total ?? raw?.dronesTotal),
    drones_destroyed: toInt(raw?.drones_destroyed ?? raw?.dronesDestroyed),
    casualties_kia: toInt(raw?.casualties_kia ?? raw?.casualtiesKia),
    casualties_wia: toInt(raw?.casualties_wia ?? raw?.casualtiesWia)
  };
}

function normalizeIntelFeedItem(raw = {}, idx = 0) {
  const tsIso = normalizeWhitespace(raw?.tsIso || raw?.ts_iso || toTsIso(raw?.ts) || "");
  const ts = normalizeWhitespace(raw?.ts || "");
  const priority = normalizeWhitespace(raw?.priority || "MEDIUM").toUpperCase();
  const category = normalizeWhitespace(raw?.category || "GENERAL").toUpperCase();
  const text = normalizeWhitespace(raw?.text || "");
  const sources = normalizeWhitespace(raw?.sources || raw?.src || "");
  const id = normalizeWhitespace(raw?.id) || (tsIso ? `${tsIso}-${idx}` : `feed-${idx}-${Math.random().toString(16).slice(2)}`);
  const status = normalizeWhitespace(raw?.status || "fresh").toLowerCase();
  const firstSeenTs = normalizeWhitespace(raw?.firstSeenTs || raw?.first_seen_ts || tsIso || "");
  return { id, ts, tsIso, priority, category, text, sources, status, firstSeenTs };
}

function normalizeIndicatorItem(raw = {}, idx = 0) {
  const id = normalizeWhitespace(raw?.id || `I??-${idx}`);
  const name = normalizeWhitespace(raw?.name || "Indicator");
  const tier = normalizeWhitespace(raw?.tier || raw?.level || "TIER2").toUpperCase();
  const state = clamp01(raw?.state);
  const detail = normalizeWhitespace(raw?.detail || raw?.note || "");
  const src = normalizeWhitespace(raw?.src || raw?.sources || "");
  const ts = normalizeWhitespace(raw?.ts || "");
  const tsIso = normalizeWhitespace(raw?.tsIso || raw?.ts_iso || toTsIso(ts) || "");
  const inferred = inferEvidenceFromSource(src);
  const srcCount = Number.isFinite(Number(raw?.srcCount)) ? Math.max(0, Math.trunc(Number(raw.srcCount))) : inferred.sourceCount;
  const cv = typeof raw?.cv === "boolean" ? raw.cv : inferred.verified;
  return { id, name, tier, state, cv, detail, src, ts, tsIso, srcCount };
}

function normalizeHypothesisItem(raw = {}, idx = 0) {
  const id = normalizeWhitespace(raw?.id || `H?-${idx}`);
  const name = normalizeWhitespace(raw?.name || "Hypothesis");
  const score = clamp01(raw?.score);
  const detail = normalizeWhitespace(raw?.detail || "");
  return { id, name, score, detail };
}

function normalizeRouteItem(raw = {}, idx = 0) {
  const id = normalizeWhitespace(raw?.id || `R-${idx}`);
  const name = normalizeWhitespace(raw?.name || "Route");
  const statusRaw = normalizeWhitespace(raw?.status || "OPEN").toUpperCase();
  const status = ["OPEN", "CAUTION", "BLOCKED"].includes(statusRaw) ? statusRaw : "OPEN";
  const base_h = Math.max(0, safeNumber(raw?.base_h ?? raw?.baseH, 0));
  const cong = clamp01(raw?.cong ?? raw?.congestion ?? 0);
  const rawEffective = raw?.effective_h ?? raw?.effectiveH;
  const effective_h = Number.isFinite(Number(rawEffective)) && Number(rawEffective) >= 0 ? Number(rawEffective) : null;
  const note = normalizeWhitespace(raw?.note || "");
  const newsRefs = Array.isArray(raw?.newsRefs) ? raw.newsRefs : [];
  return { id, name, base_h, status, cong, effective_h, effectiveH: effective_h, note, newsRefs };
}

function normalizeRouteGeo(raw = null) {
  if (!raw || typeof raw !== "object") return null;

  const nodes = Object.fromEntries(
    Object.entries(raw.nodes || {})
      .map(([id, node]) => {
        const lat = Number(node?.lat ?? node?.latlng?.[0]);
        const lng = Number(node?.lng ?? node?.latlng?.[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return [
          id,
          {
            label: String(node?.label || id),
            lat,
            lng
          }
        ];
      })
      .filter(Boolean)
  );

  const routes = Object.fromEntries(
    Object.entries(raw.routes || {}).map(([routeId, route]) => {
      const waypoints = Array.isArray(route?.waypoints) ? route.waypoints.map((w) => String(w)).filter((w) => Boolean(nodes[w])) : [];
      const coords = Array.isArray(route?.coords)
        ? route.coords
            .map((coord) => {
              if (Array.isArray(coord) && coord.length >= 2) {
                const lat = Number(coord[0]);
                const lng = Number(coord[1]);
                return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
              }
              const lat = Number(coord?.lat);
              const lng = Number(coord?.lng);
              return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, label: String(coord?.label || "") } : null;
            })
            .filter(Boolean)
        : [];

      return [
        routeId,
        {
          waypoints,
          coords,
          provider: String(route?.provider || "osrm"),
          profile: String(route?.profile || "driving")
        }
      ];
    })
  );

  return { nodes, routes };
}

function normalizeChecklistItem(raw = {}, idx = 0) {
  const id = Number.isFinite(Number(raw?.id)) ? Number(raw.id) : idx + 1;
  const text = normalizeWhitespace(raw?.text || "");
  const done = Boolean(raw?.done);
  return { id, text, done };
}

export function normalizeMetadata(raw = {}) {
  const stateTs = normalizeWhitespace(raw?.stateTs ?? raw?.state_ts ?? raw?.state_ts_gst ?? "");
  const status = normalizeWhitespace(raw?.status ?? "").toLowerCase();
  const degraded = Boolean(raw?.degraded);
  const egressLossETA = clampEgress(raw?.egressLossETA ?? raw?.egress_loss_eta ?? raw?.egressLossEta ?? raw?.egress_loss_eta_hours);
  const evidenceConf = clamp01(raw?.evidenceConf ?? raw?.evidence_conf);
  const effectiveThreshold = clamp01(raw?.effectiveThreshold ?? raw?.effective_threshold ?? 0.8);
  const deltaScore = safeNumber(raw?.deltaScore ?? raw?.delta_score, 0);
  const urgency = clamp01(raw?.urgency);
  const triggers = (raw?.triggers && typeof raw.triggers === "object") ? raw.triggers : {};
  const conflictStats = normalizeConflictStats(raw?.conflictStats ?? raw?.conflict_stats ?? {});
  const sourceHealth = raw?.sourceHealth ?? raw?.source_health ?? null;
  const { ok, total } = summarizeSourceHealth(sourceHealth);
  const source = normalizeWhitespace(raw?.source || "");
  return {
    stateTs, status, degraded, egressLossETA, evidenceConf, effectiveThreshold,
    deltaScore, urgency, triggers, conflictStats, sourceHealth, sourceOk: ok, sourceTotal: total, source
  };
}

export function normalizeDashboard(dash) {
  if (!dash || typeof dash !== "object") return null;
  const intelFeedRaw = dash.intelFeed ?? dash.intel_feed ?? [];
  const indicatorsRaw = dash.indicators ?? [];
  const hypothesesRaw = dash.hypotheses ?? [];
  const routesRaw = dash.routes ?? [];
  const checklistRaw = dash.checklist ?? [];
  const intelFeed = (Array.isArray(intelFeedRaw) ? intelFeedRaw : []).map(normalizeIntelFeedItem);
  const indicators = (Array.isArray(indicatorsRaw) ? indicatorsRaw : []).map(normalizeIndicatorItem);
  const hypotheses = (Array.isArray(hypothesesRaw) ? hypothesesRaw : []).map(normalizeHypothesisItem);
  const routes = (Array.isArray(routesRaw) ? routesRaw : []).map(normalizeRouteItem);
  const checklist = (Array.isArray(checklistRaw) ? checklistRaw : []).map(normalizeChecklistItem);
  const metadata = normalizeMetadata(dash.metadata ?? dash);
  const routeGeo = normalizeRouteGeo(dash.routeGeo ?? dash.route_geo ?? null);
  const aiAnalysis = dash.aiAnalysis ?? dash.ai_analysis ?? null;
  return { intelFeed, indicators, hypotheses, routes, checklist, metadata, routeGeo, aiAnalysis };
}

export function hasSnapshotShape(obj) {
  if (!obj || typeof obj !== "object") return false;
  return SNAPSHOT_REQUIRED_KEYS.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

export function snapshotToDashboard(snapshot) {
  const dash = {
    intelFeed: snapshot?.intel_feed,
    indicators: snapshot?.indicators,
    hypotheses: snapshot?.hypotheses,
    routes: snapshot?.routes,
    checklist: snapshot?.checklist,
    routeGeo: normalizeRouteGeo(snapshot?.route_geo ?? snapshot?.routeGeo ?? null),
    ai_analysis: snapshot?.ai_analysis ?? null,
    metadata: { ...snapshot }
  };
  return normalizeDashboard(dash);
}

export function normalizeIncomingPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (hasSnapshotShape(payload)) return snapshotToDashboard(payload);
  if (hasSnapshotShape(payload.snapshot)) return snapshotToDashboard(payload.snapshot);
  if (hasSnapshotShape(payload.data)) return snapshotToDashboard(payload.data);
  if (payload.dashboard && typeof payload.dashboard === "object") return normalizeDashboard(payload.dashboard);
  const normalized = normalizeDashboard(payload);
  if (normalized && normalized.indicators?.length && normalized.hypotheses?.length) return normalized;
  return null;
}
