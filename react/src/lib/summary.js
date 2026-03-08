import { formatDateTimeGST, getRouteEffectiveHours } from "./utils.js";

export function buildOfflineSummary(dash, derived) {
  const topIntel = (dash.intelFeed || []).slice(0, 3);
  const routes = Array.isArray(dash.routes) ? dash.routes : [];
  const usable = routes
    .filter((r) => r.status !== "BLOCKED")
    .map((r) => ({ ...r, eff: getRouteEffectiveHours(r) }))
    .filter((r) => Number.isFinite(r.eff))
    .sort((a, b) => a.eff - b.eff);

  const lines = [];
  lines.push(`요약(${formatDateTimeGST(new Date())} GST)`);
  lines.push(`- MODE: ${derived.modeState} / Gate: ${derived.gateState} / Airspace: ${derived.airspaceState}(${derived.airspaceSegment}) / Evidence: ${derived.evidenceState}`);
  lines.push(`- Leading: ${derived.leadingHypothesis.id} (${derived.leadingHypothesis.name}) score=${Number(derived.leadingHypothesis.score || 0).toFixed(3)} / H2=${derived.h2Score.toFixed(3)} → ${derived.likelihoodLabel} (${derived.likelihoodBand})`);
  lines.push(`- RED 지표: ΔScore=${derived.ds.toFixed(3)} (thr=0.20) / Conf=${derived.ec.toFixed(3)} vs Thr=${derived.effectiveThreshold.toFixed(3)} / Urgency=${derived.urgencyScore.toFixed(2)}`);
  lines.push(`- Evidence floor(TIER0 cv): ${derived.evidenceFloorT0} (target=3) → ${derived.evidenceFloorPassed ? "PASSED" : "NOT YET"}`);

  if (usable.length) {
    lines.push(`- 추천 이동(사용 가능): ${usable.slice(0, 2).map((r) => `Route ${r.id} ${r.status} ~${r.eff.toFixed(1)}h`).join(" · ")}`);
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

export function buildFullReport(dash, derived) {
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
  lines.push(buildOfflineSummary(dash, derived));
  return lines.join("\n");
}
