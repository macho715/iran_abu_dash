import { formatDateTimeGST, getRouteEffectiveHours } from "./utils.js";

export const KPI_DEFINITIONS = {
  decisionTimeReduction: {
    id: "decision_time_reduction",
    label: "결정 시간 단축",
    unit: "%",
    targetDirection: "up"
  },
  warningAccuracy: {
    id: "warning_accuracy",
    label: "경고 정확도",
    unit: "%",
    targetDirection: "up"
  },
  falseAlarmRate: {
    id: "false_alarm_rate",
    label: "False Alarm Rate",
    unit: "%",
    targetDirection: "down"
  },
  userRevisit: {
    id: "user_revisit",
    label: "사용자 재방문",
    unit: "%",
    targetDirection: "up"
  }
};

function metric(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function pct(value) {
  return `${metric(value).toFixed(2)}%`;
}

export function resolveExperimentVariants() {
  const recommendationCopyVariant =
    import.meta?.env?.VITE_AB_COPY_VARIANT === "variant" ? "variant" : "control";
  const visualizationVariant =
    import.meta?.env?.VITE_AB_VIZ_VARIANT === "variant" ? "variant" : "control";
  return { recommendationCopyVariant, visualizationVariant };
}

export function buildKpiSnapshot({ dashboard, telemetry = [] } = {}) {
  const routeSelection = telemetry.filter((event) => event.type === "route_selected");
  const warningEvents = telemetry.filter((event) => event.type === "alert_response");
  const revisitEvents = telemetry.filter((event) => event.type === "session_revisit");
  const recommendedRoute = (dashboard?.routes || []).filter((route) => route.status !== "BLOCKED").length;

  const avgDecisionSeconds = routeSelection.length
    ? routeSelection.reduce((sum, event) => sum + metric(event.decisionSeconds, 0), 0) / routeSelection.length
    : 0;
  const baselineSeconds = 180;
  const decisionTimeReduction = baselineSeconds > 0
    ? Math.max(0, ((baselineSeconds - avgDecisionSeconds) / baselineSeconds) * 100)
    : 0;

  const resolvedWarnings = warningEvents.filter((event) => event.resolved === true).length;
  const acknowledgedWarnings = warningEvents.filter((event) => event.acknowledged === true).length;
  const falseAlarms = warningEvents.filter((event) => event.falseAlarm === true).length;

  const warningAccuracy = resolvedWarnings > 0
    ? (acknowledgedWarnings / resolvedWarnings) * 100
    : 0;
  const falseAlarmRate = warningEvents.length > 0
    ? (falseAlarms / warningEvents.length) * 100
    : 0;
  const userRevisit = telemetry.length > 0
    ? (revisitEvents.length / Math.max(1, telemetry.filter((event) => event.type === "session_start").length)) * 100
    : 0;

  return {
    recommendedRouteCount: recommendedRoute,
    decisionTimeReduction,
    warningAccuracy,
    falseAlarmRate,
    userRevisit,
    sampleSize: telemetry.length
  };
}

export function buildOfflineSummary(dash, derived, options = {}) {
  const topIntel = (dash.intelFeed || []).slice(0, 3);
  const routes = Array.isArray(dash.routes) ? dash.routes : [];
  const usable = routes
    .filter((r) => r.status !== "BLOCKED")
    .map((r) => ({ ...r, eff: getRouteEffectiveHours(r) }))
    .filter((r) => Number.isFinite(r.eff))
    .sort((a, b) => a.eff - b.eff);
  const experiments = options.experiments || resolveExperimentVariants();
  const kpis = options.kpis || buildKpiSnapshot({ dashboard: dash, telemetry: options.telemetry || [] });

  const lines = [];
  lines.push(`요약(${formatDateTimeGST(new Date())} GST)`);
  lines.push(`- MODE: ${derived.modeState} / Gate: ${derived.gateState} / Airspace: ${derived.airspaceState}(${derived.airspaceSegment}) / Evidence: ${derived.evidenceState}`);
  lines.push(`- Leading: ${derived.leadingHypothesis.id} (${derived.leadingHypothesis.name}) score=${Number(derived.leadingHypothesis.score || 0).toFixed(3)} / H2=${derived.h2Score.toFixed(3)} → ${derived.likelihoodLabel} (${derived.likelihoodBand})`);
  lines.push(`- RED 지표: ΔScore=${derived.ds.toFixed(3)} (thr=0.20) / Conf=${derived.ec.toFixed(3)} vs Thr=${derived.effectiveThreshold.toFixed(3)} / Urgency=${derived.urgencyScore.toFixed(2)}`);
  lines.push(`- Evidence floor(TIER0 cv): ${derived.evidenceFloorT0} (target=3) → ${derived.evidenceFloorPassed ? "PASSED" : "NOT YET"}`);
  lines.push(`- KPI: 결정 시간 단축 ${pct(kpis.decisionTimeReduction)} / 경고 정확도 ${pct(kpis.warningAccuracy)} / False Alarm ${pct(kpis.falseAlarmRate)} / 재방문 ${pct(kpis.userRevisit)}`);
  lines.push(`- A/B: copy=${experiments.recommendationCopyVariant} / viz=${experiments.visualizationVariant}`);

  if (usable.length) {
    const prefix = experiments.recommendationCopyVariant === "variant" ? "- 권고 루트(실험 문구):" : "- 추천 이동(사용 가능):";
    lines.push(`${prefix} ${usable.slice(0, 2).map((r) => `Route ${r.id} ${r.status} ~${r.eff.toFixed(1)}h`).join(" · ")}`);
  } else {
    lines.push(`- 추천 이동: 사용 가능한 루트 없음(BLOCKED)`);
  }

  if (topIntel.length) {
    lines.push(`- 최신 Intel Top3:`);
    topIntel.forEach((it, idx) => {
      lines.push(`  ${idx + 1}) [${it.priority}] ${it.text}`);
    });
  }

  return lines.join("\n");
}

export function buildFullReport(dash, derived, options = {}) {
  const topIntel = (dash.intelFeed || []).slice(0, 5);
  const usableRoutes = (dash.routes || [])
    .filter((route) => route.status !== "BLOCKED")
    .map((route) => ({
      ...route,
      eff: getRouteEffectiveHours(route)
    }))
    .filter((route) => Number.isFinite(route.eff))
    .sort((a, b) => a.eff - b.eff);
  const indicators = (dash.indicators || []).slice(0, 6);
  const aiSummary = dash.aiAnalysis?.summary || "";
  const experiments = options.experiments || resolveExperimentVariants();
  const kpis = options.kpis || buildKpiSnapshot({ dashboard: dash, telemetry: options.telemetry || [] });

  const lines = [
    "UrgentDash Situation Report",
    `Generated: ${formatDateTimeGST(new Date())} GST`,
    "",
    `MODE: ${derived.modeState}`,
    `Gate: ${derived.gateState}`,
    `Airspace: ${derived.airspaceState} (${derived.airspaceSegment})`,
    `Evidence: ${derived.evidenceState} / Conf=${derived.ec.toFixed(3)} / Thr=${derived.effectiveThreshold.toFixed(3)}`,
    `Likelihood: ${derived.likelihoodLabel} (${derived.likelihoodBand})`,
    `Urgency: ${derived.urgencyScore.toFixed(2)}`,
    `Live source: ${derived.liveSource} / Health=${derived.sourceHealthLabel}`,
    `A/B Variant: copy=${experiments.recommendationCopyVariant}, viz=${experiments.visualizationVariant}`,
    `KPI: DTR ${pct(kpis.decisionTimeReduction)} | WarnAcc ${pct(kpis.warningAccuracy)} | FAR ${pct(kpis.falseAlarmRate)} | Revisit ${pct(kpis.userRevisit)}`,
    ""
  ];

  if (indicators.length) {
    lines.push("Indicators:");
    indicators.forEach((indicator) => {
      lines.push(`- ${indicator.id} ${indicator.name}: ${indicator.state.toFixed(2)} / ${indicator.tier} / ${indicator.cv ? "cv" : "partial"}`);
    });
    lines.push("");
  }

  if (usableRoutes.length) {
    lines.push("Recommended Routes:");
    usableRoutes.slice(0, 3).forEach((route) => {
      lines.push(`- Route ${route.id} ${route.status} ~${route.eff.toFixed(1)}h | ${route.name}`);
    });
    lines.push("");
  }

  if (topIntel.length) {
    lines.push("Latest Intel:");
    topIntel.forEach((item, index) => {
      lines.push(`${index + 1}. [${item.priority}] ${item.text}`);
    });
    lines.push("");
  }

  if (aiSummary) {
    lines.push("AI Summary:");
    lines.push(aiSummary);
    lines.push("");
  }

  lines.push("Offline Summary:");
  lines.push(buildOfflineSummary(dash, derived, options));
  return lines.join("\n");
}
