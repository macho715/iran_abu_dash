import {
  EVIDENCE_FLOOR_T0_TARGET,
  ROUTE_BUFFER_FACTOR,
  ROUTE_CONGESTION_DELTA,
  ROUTE_EFF_SPIKE_HOURS,
  ROUTE_EFF_SPIKE_RATIO
} from "./constants.js";
import { diffI02Detail } from "./i02DetailRules.js";
import { clamp01, getRouteEffectiveHours, hasExplicitRouteEffectiveHours } from "./utils.js";

export function mkEvent({
  level = "INFO",
  category = "SYSTEM",
  title = "",
  detail = "",
  ts = null,
  noiseKey = ""
}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ts: ts || new Date().toISOString(),
    level,
    category,
    title,
    detail,
    noiseKey
  };
}

export function computeDashboardKey(dash) {
  if (!dash || typeof dash !== "object") return "";
  const meta = dash.metadata || {};
  const ts = String(meta.stateTs || "");
  const status = String(meta.status || "");
  const degraded = meta.degraded ? "1" : "0";
  const h = Array.isArray(dash.hypotheses) ? dash.hypotheses.map((x) => `${x.id}:${Number(x.score || 0).toFixed(3)}`).join("|") : "";
  const i = Array.isArray(dash.indicators) ? dash.indicators.map((x) => `${x.id}:${Number(x.state || 0).toFixed(2)}:${x.cv ? 1 : 0}:${Number(x.srcCount || 0)}`).join("|") : "";
  const r = Array.isArray(dash.routes)
    ? dash.routes
        .map((x) => `${x.id}:${x.status}:${Number(x.cong ?? x.congestion ?? 0).toFixed(2)}:${Number(x.base_h || 0).toFixed(1)}:${Number(x.effective_h ?? x.effectiveH ?? -1).toFixed(2)}`)
        .join("|")
    : "";
  const top = (dash.intelFeed || [])[0];
  const f = top ? String(top.tsIso || top.ts || top.text || "") : "";
  return `${ts}#${status}#${degraded}#${h}#${i}#${r}#${f}`;
}

export function appendHistory(prev, dash, derived, maxPoints = 96) {
  const key = computeDashboardKey(dash);
  if (!key) return prev;
  const last = prev[prev.length - 1];
  if (last && last.key === key) return prev;

  const point = {
    key,
    ts: new Date().toISOString(),
    stateTs: String(dash?.metadata?.stateTs || ""),
    scores: {
      H0: Number((dash.hypotheses || []).find((x) => x.id === "H0")?.score || 0),
      H1: Number((dash.hypotheses || []).find((x) => x.id === "H1")?.score || 0),
      H2: Number((dash.hypotheses || []).find((x) => x.id === "H2")?.score || 0)
    },
    ds: Number(derived.ds || 0),
    ec: Number(derived.ec || 0),
    thr: Number(derived.effectiveThreshold || 0.8),
    mode: derived.modeState,
    gate: derived.gateState,
    air: derived.airspaceState,
    ev: derived.evidenceState,
    i02seg: derived.airspaceSegment
  };

  const next = [...prev, point];
  if (next.length > maxPoints) next.splice(0, next.length - maxPoints);
  return next;
}

function routeEffHours(route) {
  return getRouteEffectiveHours(route);
}

function severityForAirspaceSeg(segId = "") {
  const s = String(segId || "").toUpperCase();
  if (s === "CLOSED" || s === "SEVERE") return "ALERT";
  if (s === "DISRUPTED" || s === "DELAYED") return "WARN";
  return "INFO";
}

export function buildDiffEvents(prevDash, nextDash, prevDerived, nextDerived) {
  const events = [];
  const ts = new Date().toISOString();

  if (!prevDash || !prevDerived) {
    events.push(
      mkEvent({
        level: "INFO",
        category: "SYSTEM",
        title: "Dashboard loaded",
        detail: `source=${nextDash?.metadata?.source || "local"}`,
        ts,
        noiseKey: "SYSTEM|DASHBOARD_LOADED"
      })
    );
    return events;
  }

  if (prevDerived.modeState !== nextDerived.modeState) {
    events.push(
      mkEvent({
        level: nextDerived.modeState === "DEGRADED" ? "ALERT" : nextDerived.modeState === "RED_PREP" ? "WARN" : "INFO",
        category: "MODE",
        title: `MODE 변경: ${prevDerived.modeState} → ${nextDerived.modeState}`,
        detail: `Δ=${Number(nextDerived.ds || 0).toFixed(3)} / Conf=${Number(nextDerived.ec || 0).toFixed(3)} / Gate=${nextDerived.gateState}`,
        ts,
        noiseKey: `MODE|${prevDerived.modeState}|${nextDerived.modeState}`
      })
    );
  }

  if (prevDerived.gateState !== nextDerived.gateState) {
    events.push(
      mkEvent({
        level: nextDerived.gateState === "BLOCKED" ? "ALERT" : nextDerived.gateState === "CAUTION" ? "WARN" : "INFO",
        category: "GATE",
        title: `Gate 변경: ${prevDerived.gateState} → ${nextDerived.gateState}`,
        detail: `active=${nextDerived.gateActiveCount}/3 (Stay=${nextDerived.gateStay ? "Y" : "N"}, Strike=${nextDerived.gateStrike ? "Y" : "N"}, Road=${nextDerived.gateRoad ? "Y" : "N"})`,
        ts,
        noiseKey: `GATE|${prevDerived.gateState}|${nextDerived.gateState}`
      })
    );
  }

  if (prevDerived.evidenceState !== nextDerived.evidenceState) {
    events.push(
      mkEvent({
        level: nextDerived.evidenceState === "PASSED" ? "INFO" : "WARN",
        category: "EVIDENCE",
        title: `Evidence 상태: ${prevDerived.evidenceState} → ${nextDerived.evidenceState}`,
        detail: `Conf=${Number(nextDerived.ec || 0).toFixed(3)} vs Thr=${Number(nextDerived.effectiveThreshold || 0.8).toFixed(3)}`,
        ts,
        noiseKey: `EVIDENCE|STATE|${nextDerived.evidenceState}`
      })
    );
  }

  const prevFloor = Number(prevDerived.evidenceFloorT0 ?? 0);
  const nextFloor = Number(nextDerived.evidenceFloorT0 ?? 0);
  const prevPassed = prevFloor >= EVIDENCE_FLOOR_T0_TARGET;
  const nextPassed = nextFloor >= EVIDENCE_FLOOR_T0_TARGET;

  if (prevPassed !== nextPassed) {
    events.push(
      mkEvent({
        level: nextPassed ? "INFO" : "WARN",
        category: "EVIDENCE",
        title: nextPassed ? "Evidence Floor PASSED" : "Evidence Floor FAILED",
        detail: `TIER0 cv count ${prevFloor} → ${nextFloor} (target=${EVIDENCE_FLOOR_T0_TARGET})`,
        ts,
        noiseKey: `EVIDENCE|FLOOR|PASSED=${nextPassed}`
      })
    );
  } else if (prevFloor !== nextFloor) {
    events.push(
      mkEvent({
        level: nextFloor < EVIDENCE_FLOOR_T0_TARGET ? "WARN" : "INFO",
        category: "EVIDENCE",
        title: "TIER0 Evidence floor 변경",
        detail: `cv count ${prevFloor} → ${nextFloor} (target=${EVIDENCE_FLOOR_T0_TARGET})`,
        ts,
        noiseKey: `EVIDENCE|FLOOR_COUNT|${nextFloor}`
      })
    );
  }

  if (prevDerived.airspaceSegment !== nextDerived.airspaceSegment) {
    events.push(
      mkEvent({
        level: severityForAirspaceSeg(nextDerived.airspaceSegment),
        category: "AIRSPACE",
        title: `I02 세부 구간: ${prevDerived.airspaceSegment} → ${nextDerived.airspaceSegment}`,
        detail: `I02 state ${clamp01(prevDerived.i02?.state).toFixed(2)} → ${clamp01(nextDerived.i02?.state).toFixed(2)} / hint="${nextDerived.airspaceHint || ""}"`,
        ts,
        noiseKey: `AIRSPACE|SEGMENT|${nextDerived.airspaceSegment}`
      })
    );
  }

  const i02Diff = diffI02Detail(prevDerived?.i02?.detail || "", nextDerived?.i02?.detail || "");
  if (i02Diff.changed) {
    if (i02Diff.addedTags.length || i02Diff.removedTags.length) {
      events.push(
        mkEvent({
          level: "WARN",
          category: "AIRSPACE",
          title: "I02 detail 분류 업데이트",
          detail: [
            i02Diff.addedTags.length ? `added: ${i02Diff.addedTags.join(", ")}` : "",
            i02Diff.removedTags.length ? `removed: ${i02Diff.removedTags.join(", ")}` : ""
          ].filter(Boolean).join("\n"),
          ts,
          noiseKey: `AIRSPACE|I02_TAGS|${[...i02Diff.addedTags].sort().join(",")}|${[...i02Diff.removedTags].sort().join(",")}`
        })
      );
    }

    if (i02Diff.terminalsAdded.length || i02Diff.terminalsRemoved.length) {
      events.push(
        mkEvent({
          level: "WARN",
          category: "AIRSPACE",
          title: "I02 터미널 범위 변경",
          detail: [
            i02Diff.terminalsAdded.length ? `added: ${i02Diff.terminalsAdded.join(", ")}` : "",
            i02Diff.terminalsRemoved.length ? `removed: ${i02Diff.terminalsRemoved.join(", ")}` : ""
          ].filter(Boolean).join("\n"),
          ts,
          noiseKey: `AIRSPACE|I02_TERMINALS|${[...i02Diff.terminalsAdded].sort().join(",")}|${[...i02Diff.terminalsRemoved].sort().join(",")}`
        })
      );
    }

    if (i02Diff.resumeTimesAdded.length || i02Diff.resumeTimesRemoved.length) {
      events.push(
        mkEvent({
          level: "INFO",
          category: "AIRSPACE",
          title: "I02 재개 시각 업데이트",
          detail: [
            i02Diff.resumeTimesAdded.length ? `added: ${i02Diff.resumeTimesAdded.join(", ")}` : "",
            i02Diff.resumeTimesRemoved.length ? `removed: ${i02Diff.resumeTimesRemoved.join(", ")}` : ""
          ].filter(Boolean).join("\n"),
          ts,
          noiseKey: `AIRSPACE|I02_RESUME|${[...i02Diff.resumeTimesAdded].sort().join(",")}|${[...i02Diff.resumeTimesRemoved].sort().join(",")}`
        })
      );
    }
  }

  const prevRoutes = new Map((prevDash.routes || []).map((route) => [route.id, route]));
  for (const route of (nextDash.routes || [])) {
    const prevRoute = prevRoutes.get(route.id);
    if (!prevRoute) continue;

    if (prevRoute.status !== route.status) {
      events.push(
        mkEvent({
          level: route.status === "BLOCKED" ? "ALERT" : route.status === "CAUTION" ? "WARN" : "INFO",
          category: "ROUTE",
          title: `Route ${route.id} 상태: ${prevRoute.status} → ${route.status}`,
          detail: route.note || "",
          ts,
          noiseKey: `ROUTE|STATUS|${route.id}|${route.status}`
        })
      );
    } else {
      const dc = Math.abs((Number(prevRoute.cong ?? prevRoute.congestion) || 0) - (Number(route.cong ?? route.congestion) || 0));
      if (dc >= ROUTE_CONGESTION_DELTA) {
        events.push(
          mkEvent({
            level: "WARN",
            category: "ROUTE",
            title: `Route ${route.id} 혼잡도 변화`,
            detail: `cong ${(Number(prevRoute.cong ?? prevRoute.congestion) || 0).toFixed(2)} → ${(Number(route.cong ?? route.congestion) || 0).toFixed(2)}`,
            ts,
            noiseKey: `ROUTE|CONG|${route.id}`
          })
        );
      }
    }

    const prevEff = routeEffHours(prevRoute);
    const nextEff = routeEffHours(route);
    if (Number.isFinite(prevEff) && Number.isFinite(nextEff) && nextEff > prevEff) {
      const abs = nextEff - prevEff;
      const ratio = prevEff > 0 ? (nextEff / prevEff - 1) : 0;
      if (abs >= ROUTE_EFF_SPIKE_HOURS && ratio >= ROUTE_EFF_SPIKE_RATIO) {
        const usesExplicitEff = hasExplicitRouteEffectiveHours(prevRoute) || hasExplicitRouteEffectiveHours(route);
        events.push(
          mkEvent({
            level: "WARN",
            category: "ROUTE",
            title: `Route ${route.id} effective time 급증`,
            detail:
              `eff ${prevEff.toFixed(1)}h → ${nextEff.toFixed(1)}h (Δ${abs.toFixed(1)}h, +${Math.round(ratio * 100)}%)\n` +
              (
                usesExplicitEff
                  ? `payload effective_h ${(Number(prevRoute.effective_h ?? prevRoute.effectiveH) || 0).toFixed(1)}→${(Number(route.effective_h ?? route.effectiveH) || 0).toFixed(1)}`
                  : `base ${(Number(prevRoute.base_h) || 0).toFixed(1)}→${(Number(route.base_h) || 0).toFixed(1)} / cong ${(Number(prevRoute.cong ?? prevRoute.congestion) || 0).toFixed(2)}→${(Number(route.cong ?? route.congestion) || 0).toFixed(2)} (buffer x${ROUTE_BUFFER_FACTOR})`
              ),
            ts,
            noiseKey: `ROUTE|EFF_SPIKE|${route.id}`
          })
        );
      }
    }
  }

  if (prevDerived.leadingHypothesis?.id !== nextDerived.leadingHypothesis?.id) {
    events.push(
      mkEvent({
        level: "INFO",
        category: "HYPOTHESIS",
        title: `Leading 변경: ${prevDerived.leadingHypothesis?.id || "?"} → ${nextDerived.leadingHypothesis?.id || "?"}`,
        detail: `${nextDerived.leadingHypothesis?.name || ""}`,
        ts,
        noiseKey: `HYPOTHESIS|LEAD|${nextDerived.leadingHypothesis?.id || "?"}`
      })
    );
  }

  if (Number(prevDerived.ds || 0) < 0.20 && Number(nextDerived.ds || 0) >= 0.20) {
    events.push(
      mkEvent({
        level: "ALERT",
        category: "MODE",
        title: "ΔScore 임계 돌파",
        detail: `ΔScore ${Number(nextDerived.ds || 0).toFixed(3)} ≥ 0.20`,
        ts,
        noiseKey: "MODE|DELTA_SCORE_THRESHOLD"
      })
    );
  }

  const prevTop = (prevDash.intelFeed || [])[0];
  const nextTop = (nextDash.intelFeed || [])[0];
  const prevKey = prevTop ? String(prevTop.tsIso || prevTop.ts || prevTop.text || "") : "";
  const nextKey = nextTop ? String(nextTop.tsIso || nextTop.ts || nextTop.text || "") : "";

  if (prevKey && nextKey && prevKey !== nextKey) {
    events.push(
      mkEvent({
        level: nextTop.priority === "CRITICAL" ? "ALERT" : nextTop.priority === "HIGH" ? "WARN" : "INFO",
        category: "INTEL",
        title: `새 Intel: ${nextTop.priority}`,
        detail: nextTop.text || "",
        ts,
        noiseKey: `INTEL|TOP|${nextKey}`
      })
    );
  }

  return events;
}
