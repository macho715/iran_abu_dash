import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { INITIAL_DASHBOARD } from "../data/fallbackDashboard.js";
import { deriveState } from "../lib/deriveState.js";
import { normalizeIncomingPayload } from "../lib/normalize.js";
import { mergeTimelineWithNoiseGate } from "../lib/noiseGate.js";
import { loadCachedDash, cacheLastDash } from "../lib/offlineCache.js";
import { requestNotifPermission, sendCrisisNotif } from "../lib/notifications.js";
import {
  buildFullReport,
  buildKpiSnapshot,
  buildOfflineSummary,
  resolveExperimentVariants
} from "../lib/summary.js";
import { alertSound, warnSound } from "../lib/sounds.js";
import { appendHistory, buildDiffEvents, computeDashboardKey, mkEvent } from "../lib/timelineRules.js";
import { fetchLatestPointer, fetchPointerArtifact } from "../lib/livePointer.js";
import {
  FALLBACK_EGRESS_LOSS_ETA,
  DATA_REVALIDATION_POLICY,
  FAST_COUNTDOWN_SECONDS,
  HISTORY_MAX_POINTS,
  STORAGE_KEYS,
  TIMELINE_MAX,
  getDashboardCandidates,
  getFastStateCandidates,
  getLatestCandidates
} from "../lib/constants.js";
import {
  clampEgress,
  downloadJson,
  downloadText,
  formatDateTimeGST,
  getRouteEffectiveHours,
  isEditableTarget,
  safeGetLS,
  safeJsonParse,
  safeSetLS,
  tryCopyText
} from "../lib/utils.js";

const FAST_FAIL_THRESHOLD = 5;

const TELEMETRY_STORAGE_KEY = "urgentdash_anon_telemetry";
const TELEMETRY_SESSION_KEY = "urgentdash_anon_session";
const TELEMETRY_MAX_ITEMS = 500;

function nowIso() {
  return new Date().toISOString();
}

function readTelemetryQueue() {
  const parsed = safeJsonParse(safeGetLS(TELEMETRY_STORAGE_KEY, "[]"), []);
  return Array.isArray(parsed) ? parsed : [];
}

function appendTelemetryEvent(event) {
  const queue = [...readTelemetryQueue(), event].slice(-TELEMETRY_MAX_ITEMS);
  safeSetLS(TELEMETRY_STORAGE_KEY, JSON.stringify(queue));
}

function getOrCreateAnonSessionId() {
  const existing = safeGetLS(TELEMETRY_SESSION_KEY, "");
  if (existing) return existing;
  const id = `anon-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  safeSetLS(TELEMETRY_SESSION_KEY, id);
  return id;
}

const TABS = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "analysis", label: "Trends & Log", icon: "📈" },
  { id: "intel", label: "Intel Feed", icon: "🔴" },
  { id: "indicators", label: "Indicators", icon: "📡" },
  { id: "routes", label: "Routes", icon: "🗺️" },
  { id: "sim", label: "긴급 판단", icon: "🚨" },
  { id: "checklist", label: "Checklist", icon: "✅" }
];

function mergeChecklist(payloadChecklist, prevChecklist) {
  return (payloadChecklist || []).map((item) => {
    const prev = (prevChecklist || []).find((row) => row.id === item.id);
    return prev ? { ...item, done: prev.done } : item;
  });
}

export function useDashboardData() {
  const [now, setNow] = useState(new Date());
  const [tab, setTab] = useState("overview");
  const [nextEta, setNextEta] = useState(FAST_COUNTDOWN_SECONDS);
  const [dash, setDash] = useState(INITIAL_DASHBOARD);
  const [egressLossETA, setEgressLossETA] = useState(INITIAL_DASHBOARD?.metadata?.egressLossETA ?? FALLBACK_EGRESS_LOSS_ETA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [history, setHistory] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [summary, setSummary] = useState({ text: "", ts: null, mode: "OFFLINE" });
  const [autoSummary, setAutoSummary] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [intelFilter, setIntelFilter] = useState("ALL");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(0);
  const [telemetryEvents, setTelemetryEvents] = useState([]);

  const mounted = useRef(true);
  const tabEnteredAtRef = useRef(Date.now());
  const routeViewStartedAtRef = useRef(null);
  const synced = useRef(false);
  const dashRef = useRef(INITIAL_DASHBOARD);
  const prevDashRef = useRef(null);
  const prevDerivedRef = useRef(null);
  const didStartTicker = useRef(false);
  const didStartPolling = useRef(false);
  const fastFailCountRef = useRef(0);
  const fastFailLoggedRef = useRef(false);
  const latestVersionRef = useRef("");
  const latestAiVersionRef = useRef("");
  const lastSummaryKeyRef = useRef("");

  const fastPollMs = useMemo(() => {
    const env = Number(import.meta?.env?.VITE_FAST_POLL_MS);
    if (Number.isFinite(env) && env >= 1000) return Math.floor(env);
    return DATA_REVALIDATION_POLICY.pollIntervalMs;
  }, []);
  const fastCountdownSeconds = useMemo(() => Math.max(1, Math.ceil(fastPollMs / 1000)), [fastPollMs]);
  const latestCandidates = useMemo(() => getLatestCandidates(), []);
  const legacyCandidates = useMemo(
    () => [...new Set([...getFastStateCandidates(), ...getDashboardCandidates()])],
    []
  );
  const derived = useMemo(() => deriveState(dash, egressLossETA), [dash, egressLossETA]);
  const experiments = useMemo(() => resolveExperimentVariants(), []);
  const kpiSnapshot = useMemo(
    () => buildKpiSnapshot({ dashboard: dash, telemetry: telemetryEvents }),
    [dash, telemetryEvents]
  );

  useEffect(() => {
    dashRef.current = dash;
  }, [dash]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const rawEgress = Number(safeGetLS(STORAGE_KEYS.egress, ""));
    if (Number.isFinite(rawEgress) && rawEgress >= 0) setEgressLossETA(rawEgress);

    const parsedHistory = safeJsonParse(safeGetLS(STORAGE_KEYS.history, ""), []);
    if (Array.isArray(parsedHistory)) setHistory(parsedHistory);

    const parsedTimeline = safeJsonParse(safeGetLS(STORAGE_KEYS.timeline, ""), []);
    if (Array.isArray(parsedTimeline)) setTimeline(parsedTimeline);

    setAutoSummary(safeGetLS(STORAGE_KEYS.autoSummary, "0") === "1");
    setNotifEnabled(safeGetLS(STORAGE_KEYS.notifications, "0") === "1");
    setSoundEnabled(safeGetLS(STORAGE_KEYS.sound, "0") === "1");
    const existingTelemetry = readTelemetryQueue();
    setTelemetryEvents(existingTelemetry);

    const sessionId = getOrCreateAnonSessionId();
    const hasPreviousSession = existingTelemetry.some((event) => event.type === "session_start");
    const bootEvents = [{ type: "session_start", sessionId, ts: nowIso() }];
    if (hasPreviousSession) {
      bootEvents.push({ type: "session_revisit", sessionId, ts: nowIso() });
    }
    bootEvents.forEach((event) => appendTelemetryEvent(event));
    setTelemetryEvents((prev) => [...prev, ...bootEvents].slice(-TELEMETRY_MAX_ITEMS));
  }, []);

  useEffect(() => {
    safeSetLS(STORAGE_KEYS.egress, String(Number.isFinite(egressLossETA) ? egressLossETA : FALLBACK_EGRESS_LOSS_ETA));
  }, [egressLossETA]);

  useEffect(() => {
    safeSetLS(STORAGE_KEYS.history, JSON.stringify(history.slice(-HISTORY_MAX_POINTS)));
  }, [history]);

  useEffect(() => {
    safeSetLS(STORAGE_KEYS.timeline, JSON.stringify(timeline.slice(0, TIMELINE_MAX)));
  }, [timeline]);

  useEffect(() => {
    safeSetLS(STORAGE_KEYS.autoSummary, autoSummary ? "1" : "0");
  }, [autoSummary]);

  useEffect(() => {
    safeSetLS(STORAGE_KEYS.notifications, notifEnabled ? "1" : "0");
  }, [notifEnabled]);

  useEffect(() => {
    safeSetLS(STORAGE_KEYS.sound, soundEnabled ? "1" : "0");
  }, [soundEnabled]);

  useEffect(() => {
    setNextEta(fastCountdownSeconds);
  }, [fastCountdownSeconds]);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    setSelectedHistoryIndex((prev) => {
      if (!history.length) return 0;
      if (prev == null || prev >= history.length) return history.length - 1;
      return prev;
    });
  }, [history.length]);

  const logEvent = useCallback((event) => {
    setTimeline((prev) => mergeTimelineWithNoiseGate(prev, [mkEvent(event)], { maxItems: TIMELINE_MAX }));
  }, []);

  const trackTelemetry = useCallback((event) => {
    const sessionId = getOrCreateAnonSessionId();
    const payload = {
      ts: nowIso(),
      sessionId,
      ...event
    };
    appendTelemetryEvent(payload);
    setTelemetryEvents((prev) => [...prev, payload].slice(-TELEMETRY_MAX_ITEMS));
  }, []);

  const fetchCandidates = useCallback(async (candidates = []) => {
    for (const candidate of candidates) {
      try {
        const separator = candidate.includes("?") ? "&" : "?";
        const response = await fetch(`${candidate}${separator}t=${Date.now()}`, {
          cache: DATA_REVALIDATION_POLICY.requestCacheMode,
        });
        if (!response.ok) continue;
        const payload = await response.json();
        const normalized = normalizeIncomingPayload(payload);
        if (!normalized) continue;
        if (normalized?.metadata) normalized.metadata.source = candidate;
        return normalized;
      } catch {
        /* try next */
      }
    }
    return null;
  }, []);

  const handleCriticalDiffEvents = useCallback((events) => {
    if (!events.length) return;
    const important = events.filter((event) => event.level === "ALERT" || event.level === "WARN");
    if (!important.length) return;

    if (notifEnabled) {
      important.forEach((event) => {
        const sent = sendCrisisNotif(event);
        trackTelemetry({
          type: "alert_response",
          level: event.level,
          acknowledged: Boolean(sent),
          resolved: true,
          falseAlarm: false
        });
      });
    }
    if (soundEnabled) {
      if (important.some((event) => event.level === "ALERT")) {
        alertSound();
      } else {
        warnSound();
      }
    }
  }, [notifEnabled, soundEnabled, trackTelemetry]);

  const applyDashboard = useCallback((nextDash, { announce = true } = {}) => {
    const mergedDash = {
      ...nextDash,
      checklist: mergeChecklist(nextDash?.checklist, dashRef.current?.checklist)
    };
    const egressNext = clampEgress(mergedDash?.metadata?.egressLossETA);
    const nextDerived = deriveState(mergedDash, egressNext);

    setEgressLossETA(egressNext);
    setDash(mergedDash);
    synced.current = true;

    setHistory((prev) => appendHistory(prev, mergedDash, nextDerived, HISTORY_MAX_POINTS));

    const prevDash = prevDashRef.current;
    const prevDerived = prevDerivedRef.current;
    const diff = buildDiffEvents(prevDash, mergedDash, prevDerived, nextDerived);
    if (diff.length) {
      setTimeline((prev) => mergeTimelineWithNoiseGate(prev, diff, { maxItems: TIMELINE_MAX }));
      if (announce) handleCriticalDiffEvents(diff);
    }

    prevDashRef.current = mergedDash;
    prevDerivedRef.current = nextDerived;
    return mergedDash;
  }, [handleCriticalDiffEvents]);

  const applyAiAnalysis = useCallback((aiPayload) => {
    const aiAnalysis = aiPayload?.ai_analysis ?? aiPayload?.aiAnalysis ?? null;
    if (!aiAnalysis || !mounted.current) return false;
    setDash((prev) => {
      const merged = { ...prev, aiAnalysis };
      void cacheLastDash(merged);
      dashRef.current = merged;
      return merged;
    });
    return true;
  }, []);

  const fetchLatestState = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);

    try {
      const pointer = await fetchLatestPointer(latestCandidates);
      if (!pointer) throw new Error("Latest pointer unavailable");

      if (pointer.version !== latestVersionRef.current || !synced.current) {
        const litePayload = await fetchPointerArtifact(pointer.liteUrl);
        const normalized = normalizeIncomingPayload(litePayload);
        if (!normalized) throw new Error("Invalid lite snapshot");
        if (!mounted.current) return;
        if (normalized.metadata) normalized.metadata.source = pointer.liteUrl;
        const merged = applyDashboard(normalized);
        await cacheLastDash(merged);
        latestVersionRef.current = pointer.version;
        latestAiVersionRef.current = "";
      }

      if (pointer.aiVersion && pointer.aiUrl && pointer.aiVersion !== latestAiVersionRef.current) {
        const aiPayload = await fetchPointerArtifact(pointer.aiUrl);
        if (aiPayload) {
          applyAiAnalysis(aiPayload);
          latestAiVersionRef.current = pointer.aiVersion;
        }
      } else if (!pointer.aiVersion && latestAiVersionRef.current) {
        latestAiVersionRef.current = "";
        setDash((prev) => {
          const next = prev?.aiAnalysis ? { ...prev, aiAnalysis: null } : prev;
          dashRef.current = next;
          return next;
        });
      }

      if (!mounted.current) return;
      setLastUpdated(new Date());
      setNextEta(fastCountdownSeconds);
      setError(null);
      setUsingCachedData(false);
      setCachedAt(null);

      if (fastFailLoggedRef.current) {
        logEvent({
          level: "INFO",
          category: "SYSTEM",
          title: "Fast poll recovered",
          detail: `Recovered after ${fastFailCountRef.current} consecutive failures`,
          noiseKey: "SYSTEM|FAST_POLL|RECOVERED"
        });
      }
      fastFailCountRef.current = 0;
      fastFailLoggedRef.current = false;
    } catch (pointerErr) {
      try {
        const normalized = await fetchCandidates(legacyCandidates);
        if (!normalized) throw new Error("Legacy snapshot unavailable");
        if (!mounted.current) return;
        const merged = applyDashboard(normalized);
        await cacheLastDash(merged);
        latestVersionRef.current = "";
        latestAiVersionRef.current = "";
        setLastUpdated(new Date());
        setNextEta(fastCountdownSeconds);
        setUsingCachedData(false);
        setCachedAt(null);
        setError("latest.json unavailable; legacy snapshot fallback in use.");
        logEvent({
          level: "WARN",
          category: "SYSTEM",
          title: "Pointer fallback active",
          detail: String(pointerErr?.message || pointerErr || ""),
          noiseKey: "SYSTEM|LATEST_POINTER|FALLBACK"
        });
      } catch (legacyErr) {
        try {
          const cached = await loadCachedDash();
          const normalized = normalizeIncomingPayload(cached?.dashboard);
          if (!normalized) throw new Error("No cached dashboard");
          if (!mounted.current) return;
          applyDashboard(normalized, { announce: false });
          setLastUpdated(cached?.cachedAt ? new Date(cached.cachedAt) : new Date());
          setNextEta(fastCountdownSeconds);
          setUsingCachedData(true);
          setCachedAt(cached?.cachedAt || null);
          setError("네트워크를 사용할 수 없어 마지막 정상 스냅샷을 표시합니다.");
          logEvent({
            level: "WARN",
            category: "SYSTEM",
            title: "Cached dashboard in use",
            detail: String(legacyErr?.message || legacyErr || ""),
            noiseKey: "SYSTEM|CACHED_DASH|USED"
          });
        } catch {
          fastFailCountRef.current += 1;
          if (!mounted.current) return;
          if (!synced.current) applyDashboard(INITIAL_DASHBOARD, { announce: false });
          setUsingCachedData(false);
          setCachedAt(null);
          setError("데이터를 불러오지 못했습니다. 기본 데이터를 표시합니다.");
          if (fastFailCountRef.current >= FAST_FAIL_THRESHOLD && !fastFailLoggedRef.current) {
            fastFailLoggedRef.current = true;
            logEvent({
              level: "WARN",
              category: "SYSTEM",
              title: "Fast poll degraded",
              detail: `latest.json and legacy fallback both failed: ${String(legacyErr?.message || legacyErr || "")}`,
              noiseKey: "SYSTEM|FAST_POLL|FAIL"
            });
          }
        }
      }
    } finally {
      if (showLoading && mounted.current) setLoading(false);
    }
  }, [applyAiAnalysis, applyDashboard, fastCountdownSeconds, fetchCandidates, latestCandidates, legacyCandidates, logEvent]);

  useEffect(() => {
    if (didStartTicker.current) return;
    didStartTicker.current = true;
    const timer = setInterval(() => {
      setNow(new Date());
      setNextEta((prev) => (prev <= 0 ? fastCountdownSeconds : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [fastCountdownSeconds]);

  useEffect(() => {
    if (didStartPolling.current) return;
    didStartPolling.current = true;
    fetchLatestState(true);
    const intervalId = setInterval(() => fetchLatestState(false), fastPollMs);
    return () => clearInterval(intervalId);
  }, [fastPollMs, fetchLatestState]);

  useEffect(() => {
    if (!autoSummary) return;
    const key = computeDashboardKey(dash);
    if (!key || key === lastSummaryKeyRef.current) return;
    lastSummaryKeyRef.current = key;
    setSummary({
      text: buildOfflineSummary(dash, derived, { experiments, kpis: kpiSnapshot, telemetry: telemetryEvents }),
      ts: new Date().toISOString(),
      mode: "OFFLINE"
    });
  }, [autoSummary, dash, derived, experiments, kpiSnapshot, telemetryEvents]);

  useEffect(() => {
    const currentTs = Date.now();
    const prevEnteredAt = tabEnteredAtRef.current;
    if (prevEnteredAt) {
      trackTelemetry({
        type: "tab_usage",
        tab,
        dwellSeconds: Math.max(0, (currentTs - prevEnteredAt) / 1000)
      });
    }
    tabEnteredAtRef.current = currentTs;
  }, [tab, trackTelemetry]);

  useEffect(() => {
    const tabMap = {
      "1": "overview",
      "2": "analysis",
      "3": "intel",
      "4": "indicators",
      "5": "routes",
      "6": "sim",
      "7": "checklist"
    };
    const handler = (event) => {
      if (isEditableTarget(event.target)) return;
      if (tabMap[event.key]) {
        setTab(tabMap[event.key]);
        return;
      }
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        void fetchLatestState(true);
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }
      if (event.key === "Escape") {
        setShowShortcuts(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fetchLatestState]);

  const histH0 = useMemo(() => history.map((point) => point.scores?.H0 ?? 0), [history]);
  const histH1 = useMemo(() => history.map((point) => point.scores?.H1 ?? 0), [history]);
  const histH2 = useMemo(() => history.map((point) => point.scores?.H2 ?? 0), [history]);
  const histDs = useMemo(() => history.map((point) => point.ds ?? 0), [history]);
  const histEc = useMemo(() => history.map((point) => point.ec ?? 0), [history]);
  const lagLabel = useMemo(
    () => (Number.isFinite(derived.liveLagSeconds) ? `${derived.liveLagSeconds}s` : "n/a"),
    [derived.liveLagSeconds]
  );
  const gstDateTime = useMemo(() => formatDateTimeGST(now), [now]);
  const updateTs = useMemo(() => {
    if (!lastUpdated) return "—";
    return lastUpdated.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Dubai"
    });
  }, [lastUpdated]);

  const usableRoutes = useMemo(() => {
    return (dash.routes || [])
      .filter((route) => route.status !== "BLOCKED")
      .map((route) => ({
        ...route,
        eff: getRouteEffectiveHours(route)
      }))
      .filter((route) => Number.isFinite(route.eff))
      .sort((a, b) => a.eff - b.eff);
  }, [dash.routes]);

  const selectRoute = useCallback((routeId) => {
    const nowMs = Date.now();
    const viewedAt = routeViewStartedAtRef.current || nowMs;
    setSelectedRouteId(routeId);
    trackTelemetry({
      type: "route_selected",
      routeId: routeId || "none",
      decisionSeconds: Math.max(0, (nowMs - viewedAt) / 1000)
    });
    routeViewStartedAtRef.current = nowMs;
  }, [trackTelemetry]);

  const filteredIntelFeed = useMemo(() => {
    if (intelFilter === "ALL") return dash.intelFeed || [];
    return (dash.intelFeed || []).filter((item) => item.priority === intelFilter);
  }, [dash.intelFeed, intelFilter]);

  const exportTimeline = useCallback(() => {
    const name = `timeline_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    downloadJson(name, timeline);
    logEvent({ level: "INFO", category: "SYSTEM", title: "Timeline exported", detail: name });
  }, [logEvent, timeline]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setSelectedHistoryIndex(0);
    logEvent({ level: "INFO", category: "SYSTEM", title: "History cleared" });
  }, [logEvent]);

  const clearTimeline = useCallback(() => {
    setTimeline([]);
    logEvent({ level: "INFO", category: "SYSTEM", title: "Timeline cleared" });
  }, [logEvent]);

  const toggleChecklist = useCallback((itemId) => {
    setDash((prev) => {
      const next = {
        ...prev,
        checklist: (prev.checklist || []).map((item) => (item.id === itemId ? { ...item, done: !item.done } : item))
      };
      dashRef.current = next;
      void cacheLastDash(next);
      return next;
    });
  }, []);

  const resetChecklist = useCallback(() => {
    setDash((prev) => {
      const next = {
        ...prev,
        checklist: (prev.checklist || []).map((item) => ({ ...item, done: false }))
      };
      dashRef.current = next;
      void cacheLastDash(next);
      return next;
    });
    logEvent({ level: "INFO", category: "CHECKLIST", title: "Checklist reset" });
  }, [logEvent]);

  const generateSummary = useCallback(() => {
    const text = buildOfflineSummary(dashRef.current, deriveState(dashRef.current, egressLossETA), {
      experiments,
      kpis: kpiSnapshot,
      telemetry: telemetryEvents
    });
    setSummary({ text, ts: new Date().toISOString(), mode: "OFFLINE" });
    logEvent({ level: "INFO", category: "SUMMARY", title: "Summary generated" });
  }, [egressLossETA, experiments, kpiSnapshot, logEvent, telemetryEvents]);

  const copySummary = useCallback(async () => {
    const ok = await tryCopyText(summary.text);
    logEvent({ level: ok ? "INFO" : "WARN", category: "SUMMARY", title: ok ? "Summary copied" : "Copy failed" });
    return ok;
  }, [logEvent, summary.text]);

  const exportReport = useCallback(() => {
    const text = buildFullReport(dashRef.current, deriveState(dashRef.current, egressLossETA), {
      experiments,
      kpis: kpiSnapshot,
      telemetry: telemetryEvents
    });
    const name = `urgentdash_report_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    downloadText(name, text);
    logEvent({ level: "INFO", category: "SUMMARY", title: "Report exported", detail: name });
  }, [egressLossETA, experiments, kpiSnapshot, logEvent, telemetryEvents]);

  const toggleNotifications = useCallback(async () => {
    if (notifEnabled) {
      setNotifEnabled(false);
      trackTelemetry({ type: "alert_response", acknowledged: false, resolved: true, falseAlarm: false, action: "disabled" });
      return false;
    }
    const status = await requestNotifPermission();
    if (status === "granted") {
      setNotifEnabled(true);
      setError(null);
      trackTelemetry({ type: "alert_response", acknowledged: true, resolved: true, falseAlarm: false, action: "permission_granted" });
      return true;
    }
    if (status === "unsupported") {
      trackTelemetry({ type: "alert_response", acknowledged: false, resolved: false, falseAlarm: false, action: "unsupported" });
      setError("브라우저가 알림을 지원하지 않습니다.");
    } else {
      setError("브라우저 알림 권한이 거부되었습니다.");
      trackTelemetry({ type: "alert_response", acknowledged: false, resolved: false, falseAlarm: false, action: "permission_denied" });
    }
    return false;
  }, [notifEnabled, trackTelemetry]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => !prev);
  }, []);

  return {
    tabs: TABS,
    tab,
    setTab,
    now,
    nextEta,
    fastCountdownSeconds,
    dash,
    derived,
    egressLossETA,
    setEgressLossETA,
    loading,
    error,
    lastUpdated,
    updateTs,
    gstDateTime,
    lagLabel,
    history,
    timeline,
    selectedRouteId,
    setSelectedRouteId: selectRoute,
    summary,
    autoSummary,
    setAutoSummary,
    notifEnabled,
    soundEnabled,
    intelFilter,
    setIntelFilter,
    showShortcuts,
    setShowShortcuts,
    usingCachedData,
    cachedAt,
    isOffline,
    selectedHistoryIndex,
    setSelectedHistoryIndex,
    histH0,
    histH1,
    histH2,
    histDs,
    histEc,
    usableRoutes,
    filteredIntelFeed,
    experiments,
    kpiSnapshot,
    telemetryEvents,
    fetchLatestState,
    logEvent,
    exportTimeline,
    clearHistory,
    clearTimeline,
    toggleChecklist,
    resetChecklist,
    generateSummary,
    copySummary,
    exportReport,
    toggleNotifications,
    toggleSound
  };
}
