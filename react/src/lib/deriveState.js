import {
  EVIDENCE_FLOOR_T0_TARGET,
  I02_SEGMENTS,
  FALLBACK_EGRESS_LOSS_ETA,
  LIVE_STALE_CRITICAL_THRESHOLD_SECONDS,
  LIVE_STALE_SEVERE_THRESHOLD_SECONDS,
  LIVE_STALE_THRESHOLD_SECONDS,
  STALE_WARNING_BANNER_THRESHOLD_MINUTES,
} from "./constants.js";
import { clamp01, clampEgress, safeNumber, truncate } from "./utils.js";
import { normalizeConflictStats } from "./normalize.js";

export function getI02Segment(state) {
  const s = clamp01(state);
  const hit = I02_SEGMENTS.find((b) => s >= b.min && s < b.max) || I02_SEGMENTS[I02_SEGMENTS.length - 1];
  return hit;
}

export function deriveState(dash, egressLossETAOverride) {
  const indicators = Array.isArray(dash?.indicators) ? dash.indicators : [];
  const hypotheses = Array.isArray(dash?.hypotheses) ? dash.hypotheses : [];

  const findIndicator = (id) => indicators.find((row) => row.id === id) || {};
  const i01 = findIndicator("I01");
  const i02 = findIndicator("I02");
  const i03 = findIndicator("I03");
  const i04 = findIndicator("I04");

  const hypothesesSorted = [...hypotheses].sort((a, b) => safeNumber(b?.score, 0) - safeNumber(a?.score, 0));
  const leadingHypothesis = hypothesesSorted[0] || { id: "H?", name: "Unknown", score: 0 };
  const leadingColor = leadingHypothesis.id === "H2" ? "#ef4444" : leadingHypothesis.id === "H1" ? "#f59e0b" : "#22c55e";

  const dsFromMeta = dash?.metadata?.deltaScore;
  const ds = Number.isFinite(Number(dsFromMeta))
    ? Number(dsFromMeta)
    : safeNumber(hypotheses.find((h) => h.id === "H2")?.score, 0) - safeNumber(hypotheses.find((h) => h.id === "H1")?.score, 0);

  const ecFromMeta = dash?.metadata?.evidenceConf;
  const ec = Number.isFinite(Number(ecFromMeta)) ? clamp01(ecFromMeta) : 0;

  const thresholdFromMeta = dash?.metadata?.effectiveThreshold;
  const effectiveThreshold = Number.isFinite(Number(thresholdFromMeta)) ? clamp01(thresholdFromMeta) : 0.8;

  const triggers = dash?.metadata?.triggers || {};
  const liveDegraded = Boolean(dash?.metadata?.degraded);

  const gateStay = clamp01(i01?.state) >= 0.7 || Boolean(triggers.kr_leave_immediately);
  const gateStrike = Boolean(triggers.strike_detected) || clamp01(i03?.state) >= 0.7;
  const gateRoad = Boolean(triggers.border_change) || clamp01(i04?.state) >= 0.6;
  const gateActiveCount = [gateStay, gateStrike, gateRoad].filter(Boolean).length;
  const gateState = gateActiveCount >= 2 ? "BLOCKED" : gateActiveCount === 1 ? "CAUTION" : "OPEN";

  const modeState = liveDegraded ? "DEGRADED" : (Boolean(triggers.red_imminent) || ds >= 0.2 ? "RED_PREP" : "AMBER");
  const modeColor = modeState === "DEGRADED" ? "#ef4444" : modeState === "RED_PREP" ? "#f59e0b" : "#22c55e";

  const evidenceState = ec >= effectiveThreshold ? "PASSED" : "WATCH";

  const i02State = clamp01(i02?.state);
  const airspaceState = i02State >= 0.8 ? "CLOSED" : i02State >= 0.5 ? "DISRUPTED" : "OPEN";
  const airspaceHint = truncate(i02?.detail || "", 48);

  const i02Seg = getI02Segment(i02State);

  const h2Score = safeNumber(hypotheses.find((row) => row.id === "H2")?.score, 0);
  const likelihoodLabel = h2Score >= 0.8 ? "HIGHLY LIKELY" : h2Score >= 0.55 ? "LIKELY" : h2Score >= 0.35 ? "POSSIBLE" : "UNLIKELY";
  const likelihoodBand = h2Score >= 0.8 ? ">=80%" : h2Score >= 0.55 ? "55-80%" : h2Score >= 0.35 ? "35-55%" : "<35%";
  const likelihoodBasis = `H2 ${h2Score.toFixed(3)} / ΔScore ${ds.toFixed(3)} / Conf ${ec.toFixed(3)}`;

  const evidenceFloorT0 = indicators.filter((i) => i.tier === "TIER0" && i.cv).length;
  const evidenceFloorPassed = evidenceFloorT0 >= EVIDENCE_FLOOR_T0_TARGET;

  const urgencyFromMeta = dash?.metadata?.urgency;
  const egress =
    Number.isFinite(Number(egressLossETAOverride)) ? Number(egressLossETAOverride)
      : (Number.isFinite(Number(dash?.metadata?.egressLossETA)) ? Number(dash.metadata.egressLossETA) : FALLBACK_EGRESS_LOSS_ETA);

  const urgencyScore = Number.isFinite(Number(urgencyFromMeta))
    ? clamp01(urgencyFromMeta)
    : Math.min(1, Math.max(0, 1 - clampEgress(egress) / 12));

  const confBand = ec >= 0.8 ? "HIGH" : ec >= 0.6 ? "MEDIUM-HIGH" : ec >= 0.4 ? "MEDIUM" : "LOW";

  const conflictStats = normalizeConflictStats(dash?.metadata?.conflictStats ?? dash?.metadata?.conflict_stats ?? {});
  const conflictDayLabel = Number.isFinite(Number(conflictStats.conflict_day)) ? `Day ${conflictStats.conflict_day}` : "n/a";
  const conflictSourceLabel = String(conflictStats?.source || "n/a");

  const stateTsMs = Date.parse(String(dash?.metadata?.stateTs || ""));
  const liveLagSeconds = Number.isFinite(stateTsMs)
    ? Math.max(0, Math.floor((Date.now() - stateTsMs) / 1000))
    : null;
  const liveLagMinutes = Number.isFinite(liveLagSeconds)
    ? Math.floor(liveLagSeconds / 60)
    : null;
  const liveStale = Number.isFinite(liveLagSeconds)
    ? liveLagSeconds >= LIVE_STALE_THRESHOLD_SECONDS
    : false;
  const staleWarningVisible = Number.isFinite(liveLagMinutes)
    ? liveLagMinutes >= STALE_WARNING_BANNER_THRESHOLD_MINUTES
    : false;
  const staleSeverity = !Number.isFinite(liveLagSeconds)
    ? "UNKNOWN"
    : liveLagSeconds >= LIVE_STALE_CRITICAL_THRESHOLD_SECONDS
      ? "CRITICAL"
      : liveLagSeconds >= LIVE_STALE_SEVERE_THRESHOLD_SECONDS
        ? "SEVERE"
        : liveLagSeconds >= LIVE_STALE_THRESHOLD_SECONDS
          ? "STALE"
          : "FRESH";

  const sourceOk = dash?.metadata?.sourceOk;
  const sourceTotal = dash?.metadata?.sourceTotal;
  const liveSource = dash?.metadata?.source || "n/a";
  const sourceHealthLabel =
    (typeof sourceOk === "number" && Number.isFinite(sourceOk) && typeof sourceTotal === "number" && Number.isFinite(sourceTotal))
      ? `${sourceOk}/${sourceTotal} ok`
      : "n/a";

  const integrityStatus = String(dash?.metadata?.integrityStatus || "unknown").toLowerCase();
  const integrityVerifiedAt = String(dash?.metadata?.integrityVerifiedAt || "");
  const integrityFailCount = Number.isFinite(Number(dash?.metadata?.integrityFailCount))
    ? Math.max(0, Math.trunc(Number(dash?.metadata?.integrityFailCount)))
    : 0;
  const integrityLabel = integrityStatus === "verified"
    ? "VERIFIED"
    : integrityStatus === "fallback"
      ? "FALLBACK"
      : integrityStatus === "failed"
        ? "FAILED"
        : "UNKNOWN";
  const integrityColor = integrityLabel === "VERIFIED"
    ? "#22c55e"
    : integrityLabel === "FALLBACK"
      ? "#f59e0b"
      : integrityLabel === "FAILED"
        ? "#ef4444"
        : "#6b7280";

  const dsGap = 0.20 - ds;
  const dsGapLabel = ds >= 0.20 ? `ΔScore 임계 초과 +${Math.abs(dsGap).toFixed(3)}` : `0.20까지 ${Math.abs(dsGap).toFixed(3)} 차이`;
  const dsStateIcon = ds >= 0.20 ? "✅" : "⚠";
  const dsActionLabel = ds >= 0.20 ? "RED_PREP 조건 충족(유지)" : "추가 에스컬레이션 시 RED_PREP 전환";

  const confDelta = ec - effectiveThreshold;
  const confDeltaLabel =
    ec >= effectiveThreshold
      ? `Conf ${ec.toFixed(3)} ≥ ${effectiveThreshold.toFixed(3)} → RED 조건 충족`
      : `Conf ${ec.toFixed(3)} < ${effectiveThreshold.toFixed(3)} → RED 미충족 (${Math.abs(confDelta).toFixed(3)} 차이)`;

  const escalationItems = [
    { text: "한국 대사관 'Leave immediately' 발령", active: Boolean(triggers.kr_leave_immediately), note: `현재: ${Boolean(triggers.kr_leave_immediately) ? "감지됨" : "미감지"}` },
    { text: "미국 Level 4 Do Not Travel 격상", active: clamp01(i01?.state) >= 0.95, note: `I01 state=${clamp01(i01?.state).toFixed(2)}` },
    { text: "국경 RESTRICTED/CLOSED 감지", active: Boolean(triggers.border_change), note: `I04 state=${clamp01(i04?.state).toFixed(2)}` },
    { text: `ΔScore ≥ 0.20 돌파 (현재 ${ds >= 0.20 ? `+${(ds - 0.20).toFixed(3)}` : `${Math.abs(0.20 - ds).toFixed(3)} 차이`})`, active: ds >= 0.20, note: "threshold=0.20" },
    { text: "추가 대규모 strike 감지", active: Boolean(triggers.strike_detected), note: `trigger=${Boolean(triggers.strike_detected)}` }
  ];

  const deEscalationItems = [
    { text: "영공 재개 + 항공 정상화", ok: airspaceState === "OPEN", note: airspaceHint || "I02 detail n/a" },
    { text: "strike window 해제", ok: !gateStrike, note: `strike=${gateStrike ? "active" : "clear"}` },
    { text: "국경 통제 해제", ok: !gateRoad, note: `border=${gateRoad ? "restricted" : "clear"}` },
    { text: "Evidence 대비 Threshold 하향 안정", ok: ec < effectiveThreshold && ds < 0.20, note: `confΔ=${(ec - effectiveThreshold).toFixed(3)}` }
  ];

  const triggerBreakdown = [
    { id: "kr_leave_immediately", label: "대사관 즉시 출국", active: Boolean(triggers.kr_leave_immediately), source: "trigger.kr_leave_immediately" },
    { id: "strike_detected", label: "strike 감지", active: Boolean(triggers.strike_detected), source: "trigger.strike_detected" },
    { id: "border_change", label: "국경 통제", active: Boolean(triggers.border_change), source: "trigger.border_change" },
    { id: "red_imminent", label: "RED 임박", active: Boolean(triggers.red_imminent), source: "trigger.red_imminent" },
  ];

  const thresholdBreakdown = {
    evidence: {
      confidence: ec,
      threshold: effectiveThreshold,
      delta: confDelta,
      passed: ec >= effectiveThreshold,
      source: "metadata.evidenceConf/effectiveThreshold",
    },
    deltaScore: {
      score: ds,
      threshold: 0.2,
      delta: ds - 0.2,
      passed: ds >= 0.2,
      source: "metadata.deltaScore",
    },
    gate: {
      active: gateActiveCount,
      cautionThreshold: 1,
      blockedThreshold: 2,
      state: gateState,
      source: "I01/I03/I04 + triggers",
    },
  };

  const scoreBreakdown = {
    hypotheses: hypothesesSorted.map((item) => ({
      id: item.id,
      score: safeNumber(item?.score, 0),
      source: `hypothesis.${item.id}`,
    })),
    indicators: [i01, i02, i03, i04].map((item) => ({
      id: item?.id,
      state: clamp01(item?.state),
      source: `indicator.${item?.id || "?"}`,
    })),
    leadHypothesisId: leadingHypothesis.id,
    leadHypothesisScore: safeNumber(leadingHypothesis?.score, 0),
  };

  const decisionTrace = {
    summary: {
      modeState,
      gateState,
      evidenceState,
      airspaceState,
    },
    triggerBreakdown,
    thresholdBreakdown,
    scoreBreakdown,
  };

  return {
    i01, i02, i03, i04,
    hypothesesSorted, leadingHypothesis, leadingColor,
    ds, ec, effectiveThreshold, confBand,
    triggers, liveDegraded,
    gateStay, gateStrike, gateRoad, gateActiveCount, gateState,
    modeState, modeColor,
    evidenceState,
    airspaceState, airspaceHint,
    airspaceSegment: i02Seg.id,
    airspaceSegmentSeverity: i02Seg.severity,
    h2Score, likelihoodLabel, likelihoodBand, likelihoodBasis,
    evidenceFloorT0, evidenceFloorPassed,
    urgencyScore,
    conflictStats, conflictDayLabel, conflictSourceLabel,
    liveLagSeconds, liveLagMinutes, liveStale, staleSeverity, staleWarningVisible,
    sourceHealthLabel, liveSource,
    integrityLabel, integrityColor, integrityVerifiedAt, integrityFailCount,
    dsGapLabel, dsStateIcon, dsActionLabel, confDeltaLabel,
    escalationItems, deEscalationItems,
    decisionTrace,
  };
}
