import React, { useEffect, useMemo, useRef, useState } from "react";

import { ROUTE_BUFFER_FACTOR } from "../lib/constants.js";
import { deriveState } from "../lib/deriveState.js";
import { normalizeDashboard } from "../lib/normalize.js";
import {
  clamp01,
  clampEgress,
  deepClone,
  getRouteEffectiveHours,
} from "../lib/utils.js";
import { Card } from "./ui.jsx";

const STATUS_ORDER = {
  OPEN: 0,
  CAUTION: 1,
  BLOCKED: 2,
};

const SCENARIOS = [
  { id: "current", label: "현재 유지", hint: "라이브 기준 그대로 판단" },
  { id: "strike", label: "공습 징후", hint: "strike 감지 / 추가 타격 우려" },
  { id: "airspace", label: "영공 폐쇄", hint: "항공 이동 제외 전제" },
  { id: "border", label: "국경 봉쇄", hint: "육로 통제 / 대기열 급증" },
  { id: "embassy", label: "대사관 경보", hint: "즉시 이동 판단 필요" },
  { id: "normalize", label: "부분 정상화", hint: "차단 신호 완화 가정" },
];

const SCOPES = [
  { id: "local", label: "국지", hint: "부분 지연 중심" },
  { id: "regional", label: "광역", hint: "다수 경로 동시 영향" },
  { id: "full", label: "전면", hint: "복수 경로 차단 가정" },
];

const URGENCIES = [
  { id: "immediate", label: "즉시", hint: "2시간 내 판단" },
  { id: "today", label: "오늘 안", hint: "당일 이동 우선" },
  { id: "wait", label: "대기 가능", hint: "모니터링 후 결정" },
];

const CONSTRAINTS = [
  { id: "no_flight", label: "항공 불가" },
  { id: "land_risk", label: "육로 불안" },
  { id: "comms_risk", label: "통신 불안" },
  { id: "avoid_night", label: "야간 회피" },
];

function createInitialUiState() {
  return {
    scenario: "current",
    scope: "",
    urgency: "",
    constraints: [],
    routeOverrides: {},
    whatIf: {
      ecDelta: 0,
      dsDelta: 0,
    },
  };
}

function normalizeStatus(status) {
  const nextStatus = String(status || "OPEN").toUpperCase();
  return Object.prototype.hasOwnProperty.call(STATUS_ORDER, nextStatus) ? nextStatus : "OPEN";
}

function routeLabel(route) {
  return `Route ${route?.id ?? "?"}`;
}

function formatEta(hours) {
  return Number.isFinite(hours) ? `${hours.toFixed(1)}h` : "불가";
}

function liftMin(obj, key, value) {
  obj[key] = Math.max(Number(obj[key] || 0), value);
}

function lowerMax(obj, key, value) {
  obj[key] = Math.min(Number(obj[key] || 0), value);
}

function getAllRouteIds(sim) {
  return (sim.routes || []).map((route) => route.id);
}

function getLongestRouteIds(sim, count = 1) {
  return [...(sim.routes || [])]
    .sort((a, b) => Number(b.base_h || 0) - Number(a.base_h || 0))
    .slice(0, count)
    .map((route) => route.id);
}

function getLeadingRouteIds(sim, count = 1) {
  return (sim.routes || []).slice(0, count).map((route) => route.id);
}

function setRouteStatus(sim, routeIds, nextStatus, mode = "worse") {
  const targetStatus = normalizeStatus(nextStatus);
  const routeIdSet = new Set((routeIds || []).map((id) => String(id)));

  sim.routes = (sim.routes || []).map((route) => {
    if (!routeIdSet.has(String(route.id))) return route;

    const currentStatus = normalizeStatus(route.status);
    const updatedStatus = mode === "better"
      ? (STATUS_ORDER[targetStatus] < STATUS_ORDER[currentStatus] ? targetStatus : currentStatus)
      : (STATUS_ORDER[targetStatus] > STATUS_ORDER[currentStatus] ? targetStatus : currentStatus);

    return {
      ...route,
      status: updatedStatus,
      effective_h: undefined,
      effectiveH: undefined,
    };
  });
}

function addRouteCong(sim, routeIds, delta) {
  const routeIdSet = new Set((routeIds || []).map((id) => String(id)));

  sim.routes = (sim.routes || []).map((route) => {
    if (!routeIdSet.has(String(route.id))) return route;
    return {
      ...route,
      cong: clamp01(Number(route.cong || 0) + Number(delta || 0)),
      effective_h: undefined,
      effectiveH: undefined,
    };
  });
}

function addRouteBase(sim, routeIds, delta) {
  const routeIdSet = new Set((routeIds || []).map((id) => String(id)));

  sim.routes = (sim.routes || []).map((route) => {
    if (!routeIdSet.has(String(route.id))) return route;
    return {
      ...route,
      base_h: Math.max(0, Number(route.base_h || 0) + Number(delta || 0)),
      effective_h: undefined,
      effectiveH: undefined,
    };
  });
}

function buildInitialSim(liveDash) {
  const dash = liveDash || {};
  const findHypothesis = (id) => (dash.hypotheses || []).find((row) => row.id === id)?.score ?? 0;
  const findIndicator = (id) => (dash.indicators || []).find((row) => row.id === id)?.state ?? 0;

  return {
    hypotheses: {
      H0: clamp01(findHypothesis("H0")),
      H1: clamp01(findHypothesis("H1")),
      H2: clamp01(findHypothesis("H2")),
    },
    indicators: {
      I01: clamp01(findIndicator("I01")),
      I02: clamp01(findIndicator("I02")),
      I03: clamp01(findIndicator("I03")),
      I04: clamp01(findIndicator("I04")),
    },
    triggers: { ...(dash.metadata?.triggers || {}) },
    degraded: Boolean(dash.metadata?.degraded),
    egressLossETA: clampEgress(dash.metadata?.egressLossETA ?? 2),
    evidenceConf: clamp01(dash.metadata?.evidenceConf ?? 0.55),
    effectiveThreshold: clamp01(dash.metadata?.effectiveThreshold ?? 0.8),
    deltaScore: Number.isFinite(Number(dash.metadata?.deltaScore))
      ? Number(dash.metadata.deltaScore)
      : 0,
    routes: (dash.routes || []).map((route) => ({
      id: route.id,
      name: route.name || routeLabel(route),
      note: route.note || "",
      status: normalizeStatus(route.status),
      cong: clamp01(route.cong ?? route.congestion),
      base_h: Math.max(0, Number(route.base_h || 0)),
      effective_h: undefined,
      effectiveH: undefined,
    })),
  };
}

function buildDashFromSim(liveDash, sim) {
  if (!sim) return null;

  const dash = liveDash || {};

  const hypotheses = ["H0", "H1", "H2"].map((id) => {
    const liveRow = (dash.hypotheses || []).find((row) => row.id === id);
    return {
      ...(liveRow || {}),
      id,
      name: liveRow?.name || id,
      score: clamp01(sim.hypotheses[id] || 0),
    };
  });

  const indicators = ["I01", "I02", "I03", "I04"].map((id) => {
    const liveRow = (dash.indicators || []).find((row) => row.id === id);
    return {
      ...(liveRow || {}),
      id,
      name: liveRow?.name || id,
      state: clamp01(sim.indicators[id] || 0),
      srcCount: liveRow?.srcCount ?? 0,
      cv: liveRow?.cv ?? true,
    };
  });

  const routes = (sim.routes || []).map((route) => {
    const liveRoute = (dash.routes || []).find((row) => row.id === route.id);
    return {
      ...(liveRoute || {}),
      ...route,
      status: normalizeStatus(route.status),
      cong: clamp01(route.cong ?? route.congestion),
      base_h: Math.max(0, Number(route.base_h || 0)),
      effective_h: undefined,
      effectiveH: undefined,
    };
  });

  const next = {
    intelFeed: dash.intelFeed || [],
    indicators,
    hypotheses,
    routes,
    checklist: dash.checklist || [],
    routeGeo: dash.routeGeo || null,
    aiAnalysis: dash.aiAnalysis || null,
    metadata: {
      ...(dash.metadata || {}),
      egressLossETA: clampEgress(sim.egressLossETA),
      evidenceConf: clamp01(sim.evidenceConf),
      effectiveThreshold: clamp01(sim.effectiveThreshold ?? 0.8),
      deltaScore: Number(sim.deltaScore || 0),
      degraded: Boolean(sim.degraded),
      triggers: { ...(sim.triggers || {}) },
      source: "SIM_QUICK_DECISION",
      status: "sim",
      stateTs: new Date().toISOString(),
    },
  };

  return normalizeDashboard(next) || next;
}

function applyScenarioPreset(sim, scenarioId) {
  const allRoutes = getAllRouteIds(sim);
  const longestRoutes = getLongestRouteIds(sim, 2);
  const leadingRoutes = getLeadingRouteIds(sim, 3);
  const primaryRoad = leadingRoutes[0];
  const secondaryRoads = leadingRoutes.slice(1);

  switch (scenarioId) {
    case "strike":
      lowerMax(sim.hypotheses, "H0", 0.18);
      liftMin(sim.hypotheses, "H1", 0.70);
      liftMin(sim.hypotheses, "H2", 0.88);
      liftMin(sim.indicators, "I03", 0.90);
      sim.evidenceConf = Math.max(sim.evidenceConf, 0.76);
      sim.deltaScore = Math.max(sim.deltaScore, 0.26);
      sim.triggers.strike_detected = true;
      sim.triggers.red_imminent = true;
      sim.degraded = true;
      setRouteStatus(sim, longestRoutes, "CAUTION", "worse");
      addRouteCong(sim, allRoutes, 0.12);
      addRouteBase(sim, allRoutes, 0.8);
      return;

    case "airspace":
      liftMin(sim.hypotheses, "H2", 0.78);
      liftMin(sim.indicators, "I02", 0.90);
      sim.evidenceConf = Math.max(sim.evidenceConf, 0.72);
      sim.deltaScore = Math.max(sim.deltaScore, 0.14);
      sim.degraded = true;
      addRouteCong(sim, allRoutes, 0.06);
      addRouteBase(sim, longestRoutes, 1.0);
      return;

    case "border":
      liftMin(sim.hypotheses, "H2", 0.82);
      liftMin(sim.indicators, "I04", 0.90);
      sim.evidenceConf = Math.max(sim.evidenceConf, 0.74);
      sim.deltaScore = Math.max(sim.deltaScore, 0.18);
      sim.triggers.border_change = true;
      sim.degraded = true;
      if (primaryRoad) setRouteStatus(sim, [primaryRoad], "BLOCKED", "worse");
      if (secondaryRoads.length) setRouteStatus(sim, secondaryRoads.slice(0, 2), "CAUTION", "worse");
      addRouteCong(sim, allRoutes, 0.10);
      addRouteBase(sim, [primaryRoad, ...secondaryRoads.slice(0, 1)].filter(Boolean), 1.2);
      return;

    case "embassy":
      liftMin(sim.hypotheses, "H2", 0.76);
      liftMin(sim.indicators, "I01", 0.96);
      sim.evidenceConf = Math.max(sim.evidenceConf, 0.74);
      sim.deltaScore = Math.max(sim.deltaScore, 0.16);
      sim.triggers.kr_leave_immediately = true;
      sim.degraded = true;
      addRouteCong(sim, allRoutes, 0.08);
      return;

    case "normalize":
      liftMin(sim.hypotheses, "H0", 0.68);
      lowerMax(sim.hypotheses, "H1", 0.42);
      lowerMax(sim.hypotheses, "H2", 0.28);
      lowerMax(sim.indicators, "I01", 0.45);
      lowerMax(sim.indicators, "I02", 0.28);
      lowerMax(sim.indicators, "I03", 0.22);
      lowerMax(sim.indicators, "I04", 0.28);
      sim.evidenceConf = Math.max(sim.evidenceConf, 0.66);
      sim.deltaScore = Math.min(sim.deltaScore, -0.02);
      sim.triggers = {
        ...sim.triggers,
        kr_leave_immediately: false,
        strike_detected: false,
        border_change: false,
        red_imminent: false,
      };
      sim.degraded = false;
      sim.routes = (sim.routes || []).map((route) => ({
        ...route,
        status: normalizeStatus(route.status) === "BLOCKED" ? "CAUTION" : "OPEN",
        cong: clamp01(Number(route.cong || 0) * 0.55),
        base_h: Math.max(0, Number(route.base_h || 0) - 0.6),
        effective_h: undefined,
        effectiveH: undefined,
      }));
      return;

    case "current":
    default:
      return;
  }
}

function applyScopePreset(sim, scopeId) {
  const allRoutes = getAllRouteIds(sim);

  switch (scopeId) {
    case "local":
      liftMin(sim.hypotheses, "H2", 0.55);
      addRouteCong(sim, allRoutes, 0.04);
      addRouteBase(sim, allRoutes, 0.4);
      return;

    case "regional":
      liftMin(sim.hypotheses, "H2", 0.68);
      sim.evidenceConf = Math.max(sim.evidenceConf, 0.64);
      addRouteCong(sim, allRoutes, 0.10);
      addRouteBase(sim, allRoutes, 0.8);
      setRouteStatus(sim, getLongestRouteIds(sim, 1), "CAUTION", "worse");
      return;

    case "full":
      liftMin(sim.hypotheses, "H2", 0.82);
      sim.evidenceConf = Math.max(sim.evidenceConf, 0.70);
      sim.degraded = true;
      addRouteCong(sim, allRoutes, 0.18);
      addRouteBase(sim, allRoutes, 1.6);
      setRouteStatus(sim, allRoutes, "CAUTION", "worse");
      setRouteStatus(sim, getLongestRouteIds(sim, 1), "BLOCKED", "worse");
      return;

    default:
      return;
  }
}

function applyUrgencyPreset(sim, urgencyId) {
  switch (urgencyId) {
    case "immediate":
      sim.egressLossETA = clampEgress(Math.min(sim.egressLossETA, 2));
      return;
    case "today":
      sim.egressLossETA = clampEgress(Math.min(sim.egressLossETA, 6));
      return;
    case "wait":
      sim.egressLossETA = clampEgress(Math.max(sim.egressLossETA, 10));
      return;
    default:
      return;
  }
}

function applyConstraintPreset(sim, constraintId) {
  const allRoutes = getAllRouteIds(sim);

  switch (constraintId) {
    case "no_flight":
      liftMin(sim.indicators, "I02", 0.92);
      sim.evidenceConf = Math.max(sim.evidenceConf, 0.70);
      sim.degraded = true;
      return;

    case "land_risk":
      liftMin(sim.indicators, "I04", 0.86);
      sim.triggers.border_change = true;
      setRouteStatus(sim, allRoutes, "CAUTION", "worse");
      addRouteCong(sim, allRoutes, 0.10);
      return;

    case "comms_risk":
      sim.degraded = true;
      sim.evidenceConf = Math.min(sim.evidenceConf, 0.64);
      sim.effectiveThreshold = Math.max(sim.effectiveThreshold, 0.72);
      return;

    case "avoid_night":
      addRouteBase(sim, allRoutes, 1.8);
      addRouteCong(sim, allRoutes, 0.04);
      return;

    default:
      return;
  }
}

function applyRouteOverrides(sim, routeOverrides) {
  if (!routeOverrides || typeof routeOverrides !== "object") return;

  sim.routes = (sim.routes || []).map((route) => {
    const override = routeOverrides[route.id];
    if (!override) return route;

    const nextBase = Math.max(0, Number(route.base_h || 0) + Number(override.baseDelta || 0));
    const nextCong = clamp01(Number(route.cong || 0) + Number(override.congDelta || 0));

    return {
      ...route,
      status: override.status ? normalizeStatus(override.status) : route.status,
      base_h: nextBase,
      cong: nextCong,
      effective_h: undefined,
      effectiveH: undefined,
    };
  });
}

function applyUiToSim(baseSim, ui) {
  const next = deepClone(baseSim);

  applyScenarioPreset(next, ui.scenario);

  if (ui.scope) applyScopePreset(next, ui.scope);
  if (ui.urgency) applyUrgencyPreset(next, ui.urgency);

  (ui.constraints || []).forEach((constraintId) => {
    applyConstraintPreset(next, constraintId);
  });

  const ecDelta = Number(ui.whatIf?.ecDelta || 0);
  const dsDelta = Number(ui.whatIf?.dsDelta || 0);
  if (Number.isFinite(ecDelta) && ecDelta !== 0) {
    next.evidenceConf = clamp01(Number(next.evidenceConf || 0) + ecDelta);
  }
  if (Number.isFinite(dsDelta) && dsDelta !== 0) {
    next.deltaScore = Number(next.deltaScore || 0) + dsDelta;
  }

  applyRouteOverrides(next, ui.routeOverrides);

  return next;
}

function translateGate(state) {
  if (state === "BLOCKED") return "차단";
  if (state === "CAUTION") return "주의";
  return "사용 가능";
}

function translateAirspace(state) {
  if (state === "CLOSED") return "폐쇄";
  if (state === "DISRUPTED") return "차질";
  return "열림";
}

function translateEvidence(state) {
  return state === "PASSED" ? "충분" : "주의";
}

function translateMode(state) {
  if (state === "DEGRADED") return "불안정";
  if (state === "RED_PREP") return "고위험 대비";
  return "경계";
}

function translateRouteStatus(status) {
  if (status === "BLOCKED") return "불가";
  if (status === "CAUTION") return "주의";
  return "사용";
}

function getStatusColor(status) {
  if (status === "BLOCKED") return "#ef4444";
  if (status === "CAUTION") return "#f59e0b";
  return "#22c55e";
}

function getTonePalette(tone) {
  if (tone === "danger") {
    return {
      border: "#7f1d1d",
      text: "#fecaca",
      title: "#fca5a5",
      bg: "rgba(127, 29, 29, 0.28)",
    };
  }

  if (tone === "warning") {
    return {
      border: "#92400e",
      text: "#fde68a",
      title: "#fbbf24",
      bg: "rgba(146, 64, 14, 0.24)",
    };
  }

  return {
    border: "#14532d",
    text: "#bbf7d0",
    title: "#4ade80",
    bg: "rgba(20, 83, 45, 0.24)",
  };
}

function getRouteRecommendations(dash) {
  return (dash?.routes || [])
    .map((route) => {
      const status = normalizeStatus(route.status);
      const eff = status === "BLOCKED" ? null : getRouteEffectiveHours(route, ROUTE_BUFFER_FACTOR);

      return {
        ...route,
        status,
        eff: Number.isFinite(eff) ? eff : null,
      };
    })
    .sort((a, b) => {
      const aBlocked = a.status === "BLOCKED" ? 1 : 0;
      const bBlocked = b.status === "BLOCKED" ? 1 : 0;

      if (aBlocked !== bBlocked) return aBlocked - bBlocked;
      if (a.eff == null && b.eff == null) return String(a.id || "").localeCompare(String(b.id || ""));
      if (a.eff == null) return 1;
      if (b.eff == null) return -1;
      return a.eff - b.eff;
    });
}

function collectReasons(derived, routes) {
  const reasons = [];

  if (!(routes || []).some((route) => route.status !== "BLOCKED")) {
    reasons.push("사용 가능한 육로 없음");
  }
  if (derived.airspaceState === "CLOSED") reasons.push("영공 폐쇄");
  else if (derived.airspaceState === "DISRUPTED") reasons.push("항공 차질");

  if (derived.gateRoad) reasons.push("국경 통제");
  if (derived.gateStrike) reasons.push("strike 징후");
  if (derived.gateStay) reasons.push("대사관 경보");
  if (derived.modeState === "DEGRADED") reasons.push("운영 degraded");
  if (!reasons.length) reasons.push("현재 차단 신호 낮음");

  return reasons;
}

function getUrgencyCopy(ui, sim) {
  if (ui.urgency === "immediate") return "2시간 내 출발 권고";
  if (ui.urgency === "today") return "오늘 안 출발 권고";
  if (ui.urgency === "wait") return "즉시 이동보다 대기 우선";

  const eta = clampEgress(sim?.egressLossETA ?? 10);
  if (eta <= 3) return "이동 여유가 거의 없습니다";
  if (eta <= 6) return "당일 이동 검토";
  return "상황 모니터링 가능";
}

function buildActionSummary({ derived, routes, baselineRoutes, ui, sim }) {
  const availableRoutes = (routes || []).filter((route) => route.status !== "BLOCKED");
  const bestRoute = availableRoutes[0] || null;
  const baselineMap = new Map((baselineRoutes || []).map((route) => [route.id, route]));
  const bestBaseline = bestRoute ? baselineMap.get(bestRoute.id) : null;
  const delta = bestRoute?.eff != null && bestBaseline?.eff != null ? bestRoute.eff - bestBaseline.eff : null;

  const urgencyCopy = getUrgencyCopy(ui, sim);
  const reasons = collectReasons(derived, routes);
  const evidenceLinks = [
    `indicator:I02(${derived.airspaceState})`,
    `indicator:I01/I03/I04(${derived.gateState})`,
    `hypothesis:H2(${derived.h2Score.toFixed(2)})`,
    `metadata:Conf(${derived.ec.toFixed(2)})/Δ(${derived.ds.toFixed(2)})`,
  ];
  const deltaCopy = Number.isFinite(delta) && Math.abs(delta) >= 0.1
    ? `현재 기준 ${delta > 0 ? "+" : ""}${delta.toFixed(1)}h`
    : "현재 기준과 유사";

  if (!bestRoute) {
    return {
      tone: "danger",
      title: "즉시 대기",
      detail: `사용 가능한 육로가 없습니다. ${urgencyCopy}.`,
      reason: reasons.join(" + "),
      evidenceLinks,
      bestRouteId: null,
      bestRoute: null,
    };
  }

  if (derived.airspaceState === "CLOSED") {
    return {
      tone: "danger",
      title: `항공 제외, ${routeLabel(bestRoute)} 권장`,
      detail: `예상 ${formatEta(bestRoute.eff)} · ${urgencyCopy} · ${deltaCopy}`,
      reason: reasons.join(" + "),
      evidenceLinks,
      bestRouteId: bestRoute.id,
      bestRoute,
    };
  }

  if (derived.gateState === "BLOCKED") {
    return {
      tone: "warning",
      title: `우회 이동, ${routeLabel(bestRoute)} 우선`,
      detail: `기본 경로 차단 신호가 강합니다. 예상 ${formatEta(bestRoute.eff)} · ${urgencyCopy} · ${deltaCopy}`,
      reason: reasons.join(" + "),
      evidenceLinks,
      bestRouteId: bestRoute.id,
      bestRoute,
    };
  }

  if (bestRoute.status === "CAUTION" || derived.airspaceState === "DISRUPTED" || derived.modeState === "DEGRADED") {
    return {
      tone: "warning",
      title: "조건부 이동",
      detail: `${routeLabel(bestRoute)} 우선 검토 · 예상 ${formatEta(bestRoute.eff)} · ${urgencyCopy} · ${deltaCopy}`,
      reason: reasons.join(" + "),
      evidenceLinks,
      bestRouteId: bestRoute.id,
      bestRoute,
    };
  }

  return {
    tone: "success",
    title: "이동 가능",
    detail: `${routeLabel(bestRoute)} 기준 예상 ${formatEta(bestRoute.eff)} · ${urgencyCopy} · ${deltaCopy}`,
    reason: reasons.join(" + "),
    evidenceLinks,
    bestRouteId: bestRoute.id,
    bestRoute,
  };
}

function hasUserInput(ui) {
  const routeOverrides = Object.values(ui.routeOverrides || {});
  const hasRouteOverride = routeOverrides.some((override) => {
    return override && (
      override.status ||
      Number(override.baseDelta || 0) !== 0 ||
      Number(override.congDelta || 0) !== 0
    );
  });

  return (
    ui.scenario !== "current" ||
    Boolean(ui.scope) ||
    Boolean(ui.urgency) ||
    (ui.constraints || []).length > 0 ||
    Math.abs(Number(ui.whatIf?.ecDelta || 0)) > 0 ||
    Math.abs(Number(ui.whatIf?.dsDelta || 0)) > 0 ||
    hasRouteOverride
  );
}

function buildSelectionSummary(ui) {
  const parts = [];
  const scenario = SCENARIOS.find((item) => item.id === ui.scenario);
  const scope = SCOPES.find((item) => item.id === ui.scope);
  const urgency = URGENCIES.find((item) => item.id === ui.urgency);

  if (scenario && scenario.id !== "current") parts.push(scenario.label);
  if (scope) parts.push(scope.label);
  if (urgency) parts.push(urgency.label);
  if (Math.abs(Number(ui.whatIf?.ecDelta || 0)) > 0 || Math.abs(Number(ui.whatIf?.dsDelta || 0)) > 0) {
    parts.push(`What-if EC ${Number(ui.whatIf?.ecDelta || 0) >= 0 ? "+" : ""}${Number(ui.whatIf?.ecDelta || 0).toFixed(2)} / Δ ${Number(ui.whatIf?.dsDelta || 0) >= 0 ? "+" : ""}${Number(ui.whatIf?.dsDelta || 0).toFixed(2)}`);
  }

  (ui.constraints || []).forEach((constraintId) => {
    const constraint = CONSTRAINTS.find((item) => item.id === constraintId);
    if (constraint) parts.push(constraint.label);
  });

  return parts.length ? parts.join(" / ") : "현재 유지";
}

function countRouteOverrides(routeOverrides) {
  return Object.values(routeOverrides || {}).filter((override) => {
    return override && (
      override.status ||
      Number(override.baseDelta || 0) !== 0 ||
      Number(override.congDelta || 0) !== 0
    );
  }).length;
}

function buildDeltaCopy(route, baselineRoute) {
  if (route?.eff == null || baselineRoute?.eff == null) return "비교 불가";
  const delta = route.eff - baselineRoute.eff;
  if (Math.abs(delta) < 0.1) return "현재 기준과 유사";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}h`;
}

function ChoiceButton({ active, label, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        background: active ? "rgba(37, 99, 235, 0.18)" : "#0b1220",
        border: active ? "1px solid #60a5fa" : "1px solid #1e293b",
        borderRadius: 12,
        padding: "12px 12px",
        color: "#e2e8f0",
        cursor: "pointer",
        minHeight: 74,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 900 }}>{label}</div>
      <div
        style={{
          marginTop: 4,
          fontSize: 11,
          color: active ? "#bfdbfe" : "#94a3b8",
          lineHeight: 1.35,
        }}
      >
        {hint}
      </div>
    </button>
  );
}

function ToggleChip({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "rgba(37, 99, 235, 0.18)" : "#0b1220",
        border: active ? "1px solid #60a5fa" : "1px solid #1e293b",
        borderRadius: 999,
        color: active ? "#dbeafe" : "#cbd5e1",
        padding: "8px 12px",
        fontSize: 11,
        fontWeight: 900,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function MetricTile({ label, value, meta, color = "#e2e8f0" }) {
  return (
    <div className="metric-card">
      <div className="metric-card__label">{label}</div>
      <div
        style={{
          marginTop: 6,
          fontSize: 18,
          fontWeight: 900,
          color,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {meta ? <div className="metric-card__meta">{meta}</div> : null}
    </div>
  );
}

function RouteRecommendationCard({ route, baselineRoute, rank, bestRouteId }) {
  const statusColor = getStatusColor(route.status);
  const isBest = route.id === bestRouteId;
  const etaValue = route.eff != null ? formatEta(route.eff) : "불가";

  return (
    <div
      className="route-card"
      style={{
        borderColor: isBest ? "#60a5fa" : statusColor,
        boxShadow: isBest ? "0 0 0 1px rgba(96, 165, 250, 0.28) inset" : "none",
      }}
    >
      <div className="route-card__header">
        <div
          className="route-card__badge"
          style={{ background: isBest ? "#2563eb" : statusColor }}
        >
          {rank + 1}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="route-summary-row__title">
            {routeLabel(route)}
            {isBest ? (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  color: "#93c5fd",
                  fontWeight: 900,
                }}
              >
                권장
              </span>
            ) : null}
          </div>
          <div className="microcopy">{route.name || route.note || "설명 없음"}</div>
        </div>

        <div className="route-card__eta">
          <div
            className="status-chip"
            style={{ color: statusColor, borderColor: statusColor }}
          >
            {translateRouteStatus(route.status)}
          </div>
          <div className="route-card__eta-value">{etaValue}</div>
          <div className="metric-card__meta">{buildDeltaCopy(route, baselineRoute)}</div>
        </div>
      </div>

      {route.note ? (
        <div style={{ marginTop: 10, fontSize: 11, color: "#cbd5e1" }}>
          {route.note}
        </div>
      ) : null}
    </div>
  );
}

function RouteOverrideRow({
  route,
  hasOverride,
  onSetStatus,
  onAddDelay,
  onReset,
}) {
  return (
    <div
      className="route-summary-row"
      style={{
        alignItems: "flex-start",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="route-summary-row__title">{routeLabel(route)}</div>
          <div className="microcopy">
            현재 {translateRouteStatus(route.status)} · 예상 {formatEta(route.eff)}
          </div>
        </div>
        {hasOverride ? (
          <div style={{ fontSize: 10, color: "#93c5fd", fontWeight: 900 }}>
            수정 적용 중
          </div>
        ) : null}
      </div>

      <div className="filter-row">
        <ToggleChip active={route.status === "OPEN"} label="정상" onClick={() => onSetStatus("OPEN")} />
        <ToggleChip active={route.status === "CAUTION"} label="주의" onClick={() => onSetStatus("CAUTION")} />
        <ToggleChip active={route.status === "BLOCKED"} label="폐쇄" onClick={() => onSetStatus("BLOCKED")} />
        <ToggleChip active={false} label="+1h" onClick={() => onAddDelay(1)} />
        <ToggleChip active={false} label="초기화" onClick={onReset} />
      </div>
    </div>
  );
}

function WhatIfSlider({ label, min, max, step, value, onChange }) {
  return (
    <div>
      <div className="split-header" style={{ marginBottom: 6 }}>
        <div className="section-subtitle">{label}</div>
        <div className="status-chip is-muted">{value >= 0 ? "+" : ""}{value.toFixed(2)}</div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

export default function Simulator({ liveDash, onLog = () => {} }) {
  const [ui, setUi] = useState(createInitialUiState());
  const lastLogSignatureRef = useRef("");

  const normalizedLiveDash = useMemo(() => {
    return normalizeDashboard(liveDash || {}) || liveDash || null;
  }, [liveDash]);

  const baseSim = useMemo(() => buildInitialSim(normalizedLiveDash), [normalizedLiveDash]);
  const baseRouteMap = useMemo(() => {
    return new Map((baseSim.routes || []).map((route) => [route.id, route]));
  }, [baseSim.routes]);

  const baselineDash = useMemo(() => {
    return buildDashFromSim(normalizedLiveDash, baseSim);
  }, [normalizedLiveDash, baseSim]);

  const baselineDerived = useMemo(() => {
    return baselineDash ? deriveState(baselineDash, baseSim.egressLossETA) : null;
  }, [baselineDash, baseSim.egressLossETA]);

  const sim = useMemo(() => applyUiToSim(baseSim, ui), [baseSim, ui]);

  const simDash = useMemo(() => {
    return buildDashFromSim(normalizedLiveDash, sim);
  }, [normalizedLiveDash, sim]);

  const simDerived = useMemo(() => {
    return simDash ? deriveState(simDash, sim.egressLossETA) : null;
  }, [simDash, sim.egressLossETA]);

  const baselineRoutes = useMemo(() => {
    return baselineDash ? getRouteRecommendations(baselineDash) : [];
  }, [baselineDash]);

  const recommendedRoutes = useMemo(() => {
    return simDash ? getRouteRecommendations(simDash) : [];
  }, [simDash]);

  const baselineAction = useMemo(() => {
    if (!baselineDerived) return null;
    return buildActionSummary({
      derived: baselineDerived,
      routes: baselineRoutes,
      baselineRoutes,
      ui: createInitialUiState(),
      sim: baseSim,
    });
  }, [baselineDerived, baselineRoutes, baseSim]);

  const action = useMemo(() => {
    if (!simDerived) return null;
    return buildActionSummary({
      derived: simDerived,
      routes: recommendedRoutes,
      baselineRoutes,
      ui,
      sim,
    });
  }, [simDerived, recommendedRoutes, baselineRoutes, ui, sim]);

  const overrideCount = useMemo(() => countRouteOverrides(ui.routeOverrides), [ui.routeOverrides]);

  useEffect(() => {
    if (!action || !simDerived || !hasUserInput(ui)) return;

    const signature = JSON.stringify({
      scenario: ui.scenario,
      scope: ui.scope,
      urgency: ui.urgency,
      constraints: [...(ui.constraints || [])].sort(),
      routeOverrides: ui.routeOverrides,
      title: action.title,
      detail: action.detail,
      reason: action.reason,
      bestRouteId: action.bestRouteId,
      gateState: simDerived.gateState,
      airspaceState: simDerived.airspaceState,
      modeState: simDerived.modeState,
      whatIf: ui.whatIf,
    });

    if (signature === lastLogSignatureRef.current) return;
    lastLogSignatureRef.current = signature;

    onLog({
      level: action.tone === "danger" ? "ALERT" : action.tone === "warning" ? "WARN" : "INFO",
      category: "SIM",
      title: `긴급 판단 갱신 · ${action.title}`,
      detail: `${buildSelectionSummary(ui)} | ${action.detail} | 이유: ${action.reason}`,
      noiseKey: `SIM|QUICK_DECISION|${action.title}|${action.bestRouteId ?? "NONE"}`,
    });

    onLog({
      level: "INFO",
      category: "DECISION_TRACE",
      title: `판단 근거 로그 · ${action.title}`,
      detail: [
        `selection=${buildSelectionSummary(ui)}`,
        `trigger=${simDerived.decisionTrace.triggerBreakdown.map((item) => `${item.id}:${item.active ? "Y" : "N"}`).join(",")}`,
        `confidence=${simDerived.decisionTrace.thresholdBreakdown.evidence.confidence.toFixed(3)} threshold=${simDerived.decisionTrace.thresholdBreakdown.evidence.threshold.toFixed(3)} delta=${simDerived.decisionTrace.thresholdBreakdown.evidence.delta.toFixed(3)}`,
        `deltaScore=${simDerived.decisionTrace.thresholdBreakdown.deltaScore.score.toFixed(3)} threshold=${simDerived.decisionTrace.thresholdBreakdown.deltaScore.threshold.toFixed(3)} gap=${simDerived.decisionTrace.thresholdBreakdown.deltaScore.delta.toFixed(3)}`,
        `evidenceLinks=${action.evidenceLinks.join(" | ")}`,
      ].join("\n"),
      noiseKey: `SIM|TRACE|${action.title}|${action.bestRouteId ?? "NONE"}`,
    });
  }, [action, onLog, simDerived, ui]);

  if (!normalizedLiveDash || !baselineDash || !baselineDerived || !simDash || !simDerived || !action) {
    return <Card>긴급 판단 화면을 준비 중입니다…</Card>;
  }

  const palette = getTonePalette(action.tone);
  const baselineRouteMap = new Map(baselineRoutes.map((route) => [route.id, route]));
  const selectedScenario = SCENARIOS.find((item) => item.id === ui.scenario);
  const selectedScope = SCOPES.find((item) => item.id === ui.scope);
  const selectedUrgency = URGENCIES.find((item) => item.id === ui.urgency);

  const setScenario = (scenarioId) => {
    setUi((prev) => ({ ...prev, scenario: scenarioId }));
  };

  const setScope = (scopeId) => {
    setUi((prev) => ({ ...prev, scope: prev.scope === scopeId ? "" : scopeId }));
  };

  const setUrgency = (urgencyId) => {
    setUi((prev) => ({ ...prev, urgency: prev.urgency === urgencyId ? "" : urgencyId }));
  };

  const toggleConstraint = (constraintId) => {
    setUi((prev) => {
      const hasConstraint = (prev.constraints || []).includes(constraintId);
      return {
        ...prev,
        constraints: hasConstraint
          ? prev.constraints.filter((id) => id !== constraintId)
          : [...prev.constraints, constraintId],
      };
    });
  };

  const patchRouteOverride = (routeId, patch) => {
    setUi((prev) => {
      const baseRoute = baseRouteMap.get(routeId) || {};
      const current = prev.routeOverrides?.[routeId] || {};
      const nextOverride = { ...current, ...patch };

      if (Object.prototype.hasOwnProperty.call(patch, "baseDeltaAdd")) {
        nextOverride.baseDelta = Number(current.baseDelta || 0) + Number(patch.baseDeltaAdd || 0);
        delete nextOverride.baseDeltaAdd;
      }

      if (!nextOverride.status || nextOverride.status === baseRoute.status) {
        delete nextOverride.status;
      }
      if (Math.abs(Number(nextOverride.baseDelta || 0)) < 0.001) {
        delete nextOverride.baseDelta;
      }
      if (Math.abs(Number(nextOverride.congDelta || 0)) < 0.001) {
        delete nextOverride.congDelta;
      }

      const nextRouteOverrides = { ...(prev.routeOverrides || {}) };

      if (Object.keys(nextOverride).length === 0) {
        delete nextRouteOverrides[routeId];
      } else {
        nextRouteOverrides[routeId] = nextOverride;
      }

      return {
        ...prev,
        routeOverrides: nextRouteOverrides,
      };
    });
  };

  const resetRouteOverride = (routeId) => {
    setUi((prev) => {
      const nextRouteOverrides = { ...(prev.routeOverrides || {}) };
      delete nextRouteOverrides[routeId];
      return {
        ...prev,
        routeOverrides: nextRouteOverrides,
      };
    });
  };

  const resetAll = () => {
    setUi(createInitialUiState());
    lastLogSignatureRef.current = "";
  };

  const setWhatIf = (key, value) => {
    setUi((prev) => ({
      ...prev,
      whatIf: {
        ...(prev.whatIf || {}),
        [key]: Number(value || 0),
      },
    }));
  };

  return (
    <Card>
      <div className="split-header">
        <div>
          <div className="section-title">🚨 긴급 판단</div>
          <div className="section-subtitle">
            상황을 고르면 바로 행동 권고와 추천 경로를 보여줍니다.
          </div>
        </div>

        <div className="filter-row">
          <button
            type="button"
            className="action-button action-button--muted"
            onClick={resetAll}
          >
            현재 기준으로 되돌리기
          </button>
        </div>
      </div>

      <div
        className="nested-panel"
        style={{
          marginTop: 12,
          background: palette.bg,
          borderColor: palette.border,
        }}
      >
        <div style={{ fontSize: 11, color: palette.text, fontWeight: 900 }}>
          지금 할 일
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 28,
            fontWeight: 900,
            color: palette.title,
            lineHeight: 1.15,
          }}
        >
          {action.title}
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: "#e2e8f0" }}>
          {action.detail}
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: palette.text,
            fontWeight: 800,
          }}
        >
          왜? {action.reason}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#bfdbfe" }}>
          Evidence: {action.evidenceLinks.join(" · ")}
        </div>

        <div className="filter-row" style={{ marginTop: 12 }}>
          <div className="status-chip is-muted">상황 {selectedScenario?.label || "현재 유지"}</div>
          <div className="status-chip is-muted">범위 {selectedScope?.label || "선택 안 함"}</div>
          <div className="status-chip is-muted">시급도 {selectedUrgency?.label || "선택 안 함"}</div>
          {overrideCount > 0 ? <div className="status-chip is-active">경로 수정 {overrideCount}</div> : null}
        </div>
      </div>

      <div className="sim-grid section-gap">
        <div className="stack-list">
          <div className="nested-panel">
            <div className="section-title">어떤 상황입니까?</div>
            <div className="section-subtitle">
              선택 안 하면 현재 라이브 상태 기준으로 판단합니다.
            </div>

            <div
              style={{
                marginTop: 10,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 8,
              }}
            >
              {SCENARIOS.map((item) => (
                <ChoiceButton
                  key={item.id}
                  active={ui.scenario === item.id}
                  label={item.label}
                  hint={item.hint}
                  onClick={() => setScenario(item.id)}
                />
              ))}
            </div>

            <div className="section-gap">
              <div className="section-title">영향 범위</div>
              <div className="section-subtitle">선택 안 하면 현재 범위로 유지합니다.</div>
              <div className="filter-row section-gap-top">
                {SCOPES.map((item) => (
                  <ToggleChip
                    key={item.id}
                    active={ui.scope === item.id}
                    label={`${item.label} · ${item.hint}`}
                    onClick={() => setScope(item.id)}
                  />
                ))}
              </div>
            </div>

            <div className="section-gap">
              <div className="section-title">출발 시급도</div>
              <div className="section-subtitle">선택 안 하면 현재 ETA 기준으로 표시합니다.</div>
              <div className="filter-row section-gap-top">
                {URGENCIES.map((item) => (
                  <ToggleChip
                    key={item.id}
                    active={ui.urgency === item.id}
                    label={`${item.label} · ${item.hint}`}
                    onClick={() => setUrgency(item.id)}
                  />
                ))}
              </div>
            </div>

            <div className="section-gap">
              <div className="section-title">추가 제약</div>
              <div className="filter-row section-gap-top">
                {CONSTRAINTS.map((item) => (
                  <ToggleChip
                    key={item.id}
                    active={(ui.constraints || []).includes(item.id)}
                    label={item.label}
                    onClick={() => toggleConstraint(item.id)}
                  />
                ))}
              </div>
            </div>

            <div className="section-gap">
              <div className="section-title">가정 변경 시 결과 (What-if)</div>
              <div className="section-subtitle">EC/ΔScore를 가정값으로 조정해 결과 민감도를 확인합니다.</div>
              <div className="stack-list section-gap-top">
                <WhatIfSlider
                  label="Evidence Confidence (ec) Δ"
                  min={-0.3}
                  max={0.3}
                  step={0.01}
                  value={Number(ui.whatIf?.ecDelta || 0)}
                  onChange={(value) => setWhatIf("ecDelta", value)}
                />
                <WhatIfSlider
                  label="Delta Score (ds) Δ"
                  min={-0.3}
                  max={0.3}
                  step={0.01}
                  value={Number(ui.whatIf?.dsDelta || 0)}
                  onChange={(value) => setWhatIf("dsDelta", value)}
                />
              </div>
            </div>
          </div>

          <details className="nested-panel">
            <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 13 }}>
              경로 빠른 수정 {overrideCount > 0 ? `(${overrideCount})` : "(선택)"}
            </summary>
            <div className="section-subtitle" style={{ marginTop: 8 }}>
              기본 화면은 단순하게 유지하고, 필요할 때만 경로 상태를 빠르게 덮어씁니다.
            </div>

            <div className="stack-list section-gap-top">
              {recommendedRoutes.map((route) => (
                <RouteOverrideRow
                  key={route.id}
                  route={route}
                  hasOverride={Boolean(ui.routeOverrides?.[route.id])}
                  onSetStatus={(status) => patchRouteOverride(route.id, { status })}
                  onAddDelay={(hours) => patchRouteOverride(route.id, { baseDeltaAdd: Number(hours || 0) })}
                  onReset={() => resetRouteOverride(route.id)}
                />
              ))}
            </div>
          </details>
        </div>

        <div className="stack-list">
          <div className="nested-panel">
            <div className="section-title">판단 근거</div>
            <div className="section-subtitle">trigger hit, confidence, delta를 단계별로 표시합니다.</div>
            <div className="stack-list section-gap-top">
              {simDerived.decisionTrace.triggerBreakdown.map((item) => (
                <div key={item.id} className="route-summary-row">
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{item.label}</div>
                  <div className={item.active ? "status-chip is-active" : "status-chip is-muted"}>{item.active ? "HIT" : "MISS"}</div>
                </div>
              ))}
            </div>
            <div className="two-col section-gap-top">
              <MetricTile
                label="Confidence"
                value={`${simDerived.decisionTrace.thresholdBreakdown.evidence.confidence.toFixed(3)}`}
                meta={`Th ${simDerived.decisionTrace.thresholdBreakdown.evidence.threshold.toFixed(3)} / Δ ${simDerived.decisionTrace.thresholdBreakdown.evidence.delta.toFixed(3)}`}
                color={simDerived.decisionTrace.thresholdBreakdown.evidence.passed ? "#4ade80" : "#fbbf24"}
              />
              <MetricTile
                label="ΔScore"
                value={`${simDerived.decisionTrace.thresholdBreakdown.deltaScore.score.toFixed(3)}`}
                meta={`Th ${simDerived.decisionTrace.thresholdBreakdown.deltaScore.threshold.toFixed(3)} / Δ ${simDerived.decisionTrace.thresholdBreakdown.deltaScore.delta.toFixed(3)}`}
                color={simDerived.decisionTrace.thresholdBreakdown.deltaScore.passed ? "#4ade80" : "#fbbf24"}
              />
            </div>
          </div>

          <div className="nested-panel">
            <div className="section-title">현재 판단</div>
            <div className="two-col section-gap-top">
              <MetricTile
                label="권고"
                value={action.title}
                meta={baselineAction ? `현재 기준: ${baselineAction.title}` : ""}
                color={palette.title}
              />
              <MetricTile
                label="추천 경로"
                value={action.bestRoute ? routeLabel(action.bestRoute) : "대기"}
                meta={action.bestRoute?.eff != null ? `예상 ${formatEta(action.bestRoute.eff)}` : "경로 없음"}
                color={action.bestRoute ? "#93c5fd" : "#fca5a5"}
              />
              <MetricTile
                label="육로"
                value={translateGate(simDerived.gateState)}
                meta={`현재 기준: ${translateGate(baselineDerived.gateState)}`}
                color={getStatusColor(simDerived.gateState === "OPEN" ? "OPEN" : simDerived.gateState)}
              />
              <MetricTile
                label="항공"
                value={translateAirspace(simDerived.airspaceState)}
                meta={`현재 기준: ${translateAirspace(baselineDerived.airspaceState)}`}
                color={getStatusColor(simDerived.airspaceState === "OPEN" ? "OPEN" : simDerived.airspaceState === "CLOSED" ? "BLOCKED" : "CAUTION")}
              />
              <MetricTile
                label="근거"
                value={translateEvidence(simDerived.evidenceState)}
                meta={`Conf ${simDerived.ec.toFixed(2)} / Th ${simDerived.effectiveThreshold.toFixed(2)}`}
                color={simDerived.evidenceState === "PASSED" ? "#22c55e" : "#f59e0b"}
              />
              <MetricTile
                label="상태"
                value={translateMode(simDerived.modeState)}
                meta={`현재 기준: ${translateMode(baselineDerived.modeState)}`}
                color={simDerived.modeState === "DEGRADED" ? "#f87171" : simDerived.modeState === "RED_PREP" ? "#fbbf24" : "#86efac"}
              />
            </div>
          </div>

          <div className="nested-panel">
            <div className="split-header">
              <div>
                <div className="section-title">추천 경로</div>
                <div className="section-subtitle">
                  사용 가능 여부와 현재 기준 대비 시간 변화를 함께 보여줍니다.
                </div>
              </div>
              <div className="status-chip is-muted">buffer x{ROUTE_BUFFER_FACTOR}</div>
            </div>

            <div className="stack-list section-gap-top">
              {recommendedRoutes.map((route, index) => (
                <RouteRecommendationCard
                  key={route.id}
                  route={route}
                  baselineRoute={baselineRouteMap.get(route.id)}
                  rank={index}
                  bestRouteId={action.bestRouteId}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="microcopy" style={{ marginTop: 12 }}>
        이 화면은 라이브 데이터를 직접 바꾸지 않습니다. 선택값만으로 즉시 판단을 다시 계산합니다.
      </div>
    </Card>
  );
}
