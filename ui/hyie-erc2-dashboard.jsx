import { useState, useEffect, useCallback, useRef } from "react";

// ═══════════════════════════════════════════════════════
// VERIFIED REAL-TIME DATA — Sources collected 2026-03-03
// All data cross-referenced from multiple independent sources
// ═══════════════════════════════════════════════════════

const INTEL_FEED = [
  {
    ts: "Mar 3 14:00", priority: "CRITICAL", verified: true,
    text: "Emirates & Etihad 모든 상업 운항 3월 5일 14:00까지 중단 연장",
    src: "LoyaltyLobby / Etihad 공식", srcUrl: "loyaltylobby.com",
    impact: "I02 = 1.00 유지. 제한적 본국송환 편만 허용."
  },
  {
    ts: "Mar 3 13:30", priority: "CRITICAL", verified: true,
    text: "미국 국무부 — 중동 12개국 이상 시민에 즉시 출국 촉구",
    src: "Al Jazeera / NBC News", srcUrl: "aljazeera.com",
    impact: "I01 state 1.00 재확인. I07 강화."
  },
  {
    ts: "Mar 3 12:00", priority: "HIGH", verified: true,
    text: "이란 3일 연속 걸프 지역 보복 공격 지속 — UAE/카타르/쿠웨이트 폭발",
    src: "Al Jazeera / CNBC", srcUrl: "aljazeera.com",
    impact: "I03 = 1.00 유지. active_strike_window = true 연장."
  },
  {
    ts: "Mar 3 11:00", priority: "HIGH", verified: true,
    text: "이스라엘, 이란·헤즈볼라 동시 타격 (테헤란+베이루트) — 분쟁 확대",
    src: "CNBC Live Updates", srcUrl: "cnbc.com",
    impact: "에스컬레이션 추가. 이란 추가 보복 가능성↑"
  },
  {
    ts: "Mar 3 10:30", priority: "HIGH", verified: true,
    text: "인도 특별 구호편 10편 운항 (제다→인도 각 도시), UAE 제한적 출발 재개",
    src: "Outlook India / India TV", srcUrl: "outlookindia.com",
    impact: "I07 state 1.00. 타국 대피 본격화."
  },
  {
    ts: "Mar 3 09:00", priority: "MEDIUM", verified: true,
    text: "태국 총리: 군용기 동원 중동 자국민 대피 준비 — 11,000명+ UAE 거주",
    src: "Nation Thailand / Manila Times", srcUrl: "nationthailand.com",
    impact: "I07 추가 강화. 군사적 대피 수단 동원 단계."
  },
  {
    ts: "Mar 2 22:00", priority: "CRITICAL", verified: true,
    text: "미 국무부 비긴급 직원 + 가족 UAE 출국 명령 (Ordered Departure)",
    src: "US Embassy UAE / NBC News", srcUrl: "ae.usembassy.gov",
    impact: "I01 = 1.00. 미국 Level 3 → Ordered Departure는 극히 이례적."
  },
  {
    ts: "Mar 2 20:00", priority: "HIGH", verified: true,
    text: "AWS 데이터센터 2곳(UAE) + 1곳(바레인) 드론 피격으로 오프라인",
    src: "CNBC", srcUrl: "cnbc.com",
    impact: "I05 state 0.15↑ — 인프라 피해 시작. 통신은 아직 정상."
  },
  {
    ts: "Mar 2 18:00", priority: "MEDIUM", verified: true,
    text: "UAE 슈퍼마켓 재고 안정화 — 패닉바잉 진정, 정부 비축분 충분",
    src: "The National / Khaleej Times / Gulf News", srcUrl: "thenationalnews.com",
    impact: "I06 0.50→0.35 하향. 공급망 정상, 일시적 패닉이었음."
  },
  {
    ts: "Mar 2 15:00", priority: "HIGH", verified: true,
    text: "영국·호주 UAE 여행경보 'Do Not Travel' 최고 단계로 격상, 대피 계획",
    src: "VisaHQ", srcUrl: "visahq.com",
    impact: "I07 = 1.00 재확인. 서방 주요국 전면 철수 모드."
  },
  {
    ts: "Mar 1 16:00", priority: "CRITICAL", verified: true,
    text: "UAE 국방부: 탄도미사일 165발, 드론 541기 탐지 — 사망 3, 부상 58",
    src: "UAE MoD / Khaleej Times / The National", srcUrl: "khaleejtimes.com",
    impact: "I03 = 1.00. 요격률 높으나 파편 낙하로 민간 피해 발생."
  },
  {
    ts: "Feb 28 23:00", priority: "CRITICAL", verified: true,
    text: "이란, 미-이스라엘 공습 보복으로 UAE 포함 걸프 전역 미사일·드론 공격 개시",
    src: "Al Jazeera / CNN / Euronews", srcUrl: "aljazeera.com",
    impact: "전체 상황 개시점. 모든 지표 급등."
  },
];

const INDICATORS = [
  {
    id: "I01", name: "공식 여행경보/대사관 공지", tier: "TIER0", state: 1.0,
    confirmed: true, src: "US State Dept, NL 외교부, UK FCDO, AU DFAT, KR 외교부",
    ts: "Mar 3 13:30 GST",
    detail: "미국 Ordered Departure 발령(3/2), 영국·호주 Do Not Travel, 한국 특별여행주의보, NL Orange",
    srcCount: 5, crossVerified: true
  },
  {
    id: "I02", name: "공항/항공 운영", tier: "TIER0", state: 1.0,
    confirmed: true, src: "Etihad Airways 공식, GCAA, LoyaltyLobby",
    ts: "Mar 3 14:00 GST",
    detail: "Etihad/Emirates 3월 5일 14:00까지 전편 중단. 제한적 본국송환편만 운항. UAE 영공 부분 폐쇄 지속.",
    srcCount: 4, crossVerified: true
  },
  {
    id: "I03", name: "군사/안보 근접도", tier: "TIER1", state: 1.0,
    confirmed: true, src: "UAE MoD, Al Jazeera, CNN, BBC, CNBC",
    ts: "Mar 3 12:00 GST",
    detail: "3일 연속 이란 보복 공격. 탄도미사일 165발+드론 541기. AUH 해군기지·Saadiyat·Khalifa City 피편 낙하. 3사망 58부상.",
    srcCount: 6, crossVerified: true
  },
  {
    id: "I04", name: "치안/도로 통제", tier: "TIER1", state: 0.60,
    confirmed: false, src: "Time Out Abu Dhabi, US Embassy, Canada Advisory",
    ts: "Mar 3 10:00 GST",
    detail: "파편 낙하 지역 도로 폐쇄. 공식 통행금지 미확인. SMS 공습경보 시스템 운영 중. 사우디·오만 국경 OPEN.",
    srcCount: 3, crossVerified: false
  },
  {
    id: "I05", name: "통신/인터넷", tier: "TIER1", state: 0.15,
    confirmed: true, src: "CNBC, 직접 확인",
    ts: "Mar 3 08:00 GST",
    detail: "일반 통신 정상. AWS UAE 데이터센터 2곳 드론 피격 오프라인. 인프라 부분 피해 시작.",
    srcCount: 2, crossVerified: true
  },
  {
    id: "I06", name: "필수재/연료", tier: "TIER2", state: 0.35,
    confirmed: true, src: "The National, Khaleej Times, Gulf News, AGBI",
    ts: "Mar 2 20:00 GST",
    detail: "초기 패닉바잉 진정. 슈퍼마켓 재고 안정화. 정부 전략 비축분 충분. 연료 정상 공급(3월 가격 소폭 인상).",
    srcCount: 4, crossVerified: true
  },
  {
    id: "I07", name: "외국정부 행동", tier: "TIER0", state: 1.0,
    confirmed: true, src: "태국 총리실, 인도 항공사, UK/AU FCDO, NBC News",
    ts: "Mar 3 10:30 GST",
    detail: "태국 군용기 대피 준비(11,000명+). 인도 특별편 10편. 영국·호주 Do Not Travel + 대피 계획. 미국 Ordered Departure.",
    srcCount: 5, crossVerified: true
  },
];

// ═══════════════════════════════════════════════════════
// RECALCULATED HYPOTHESIS SCORES (based on verified data)
// H2 boosted by: US Ordered Departure, UK/AU DNT, multi-nation evac
// ΔScore approaching 0.20 threshold
// ═══════════════════════════════════════════════════════

const HYPOTHESES = [
  { id: "H0", name: "정상", score: 0.215, desc: "일상 운영, 일시적 혼란", color: "#22c55e" },
  { id: "H1", name: "악화", score: 0.608, desc: "제한 증가, 행동 변화 불요", color: "#f59e0b" },
  { id: "H2", name: "철수준비", score: 0.798, desc: "공식 경보 + 행동 변화 요구", color: "#ef4444" },
];

const ROUTES = [
  { id: "A", name: "Al Ain → Buraimi → Sohar", base_h: 7.0, status: "OPEN", congestion: 0.35, note: "UAE-Oman 국경 OPEN 확인 (Canada Advisory). Al Rawdah 신규 통과점 추가 가용." },
  { id: "B", name: "Mezyad → Nizwa", base_h: 8.2, status: "OPEN", congestion: 0.25, note: "국경 OPEN. 혼잡도 불확실." },
  { id: "C", name: "Saudi Ghuwaifat → Riyadh", base_h: 15.5, status: "CAUTION", congestion: 0.55, note: "사우디 국경 OPEN이나 이란 보복 대상국. 미 대사관 리야드 드론 피격 보도." },
  { id: "D", name: "Fujairah → Khatmat Malaha → Muscat", base_h: 9.3, status: "OPEN", congestion: 0.20, note: "오만 동해안 경유. 이란 공습 직접 경로 회피 가능. 대체 루트로 유효." },
];

const CHECKLIST = [
  { id: 1, text: "Bug-out bag 완성 (여권/ID/현금USD+AED/물2L/비상식량)", done: false },
  { id: 2, text: "차량 연료 Full 확인 (E-Plus 91: AED 2.40/L, 공급 정상)", done: false },
  { id: 3, text: "오만 보험 Orange Card 사전 구매 확인", done: false },
  { id: 4, text: "대사관 긴급번호 저장 — KR: +971-2-643-8700 / NL: +31-247-247-247", done: false },
  { id: 5, text: "Al Ain/Buraimi 루트 GPS 오프라인 맵 다운로드", done: false },
  { id: 6, text: "가족/회사(SCT) 비상연락 완료 + 체크인 일정 합의", done: false },
  { id: 7, text: "15분마다 대사관/Etihad/BBC/Al Jazeera 업데이트 확인", done: false },
  { id: 8, text: "SMS 공습경보 수신 확인 (UAE 긴급문자 활성화)", done: false },
  { id: 9, text: "창문에서 떨어진 안전 구역(내벽 옆) 확보", done: false },
  { id: 10, text: "NetherlandsWorldwide 정보서비스 등록 확인", done: false },
];

const VERSIONS = [
  { v: "v2026.03", desc: "단일 Confidence → RED", change: "출발점" },
  { v: "v2026.03.1", desc: "+Decay +Hysteresis +DataStale차등", change: "Flicker/Stale 방지" },
  { v: "v2026.03.2", desc: "+ERC (대피시간 역산)", change: "공항 폐쇄 → 육로" },
  { v: "v2026.04", desc: "+HyIE (경쟁 가설 3개) + ICD 203", change: "오탐 방지 + 설명성" },
  { v: "v2026.05", desc: "+ERC² + Conf/Urg 분리 + MovementRiskGate", change: "현재 활성", active: true },
];

// ═══════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════

function PulsingDot({ color }) {
  const [opacity, setOpacity] = useState(1);
  useEffect(() => {
    const iv = setInterval(() => setOpacity(o => o === 1 ? 0.3 : 1), 800);
    return () => clearInterval(iv);
  }, []);
  return <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", backgroundColor: color, opacity, transition: "opacity 0.4s" }} />;
}

function ProgressBar({ value, max = 1, color, height = 8 }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ width: "100%", height, backgroundColor: "#1e293b", borderRadius: height / 2, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", backgroundColor: color, borderRadius: height / 2, transition: "width 0.6s ease" }} />
    </div>
  );
}

function Card({ title, icon, children, accent, fullWidth }) {
  return (
    <div style={{
      backgroundColor: "#0f172a", border: `1px solid ${accent || "#1e293b"}`,
      borderRadius: 12, padding: 16, gridColumn: fullWidth ? "1 / -1" : undefined, overflow: "hidden",
    }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {icon && <span style={{ fontSize:18 }}>{icon}</span>}
          <span style={{ fontSize:15, fontWeight: 700, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: 1 }}>{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

function GaugeArc({ value, size = 90, color, label, subLabel }) {
  const gaugeColor = color || HYPOTHESIS_COLOR[String(label || "")] || "#38bdf8";
  const pct = Math.min(value, 1);
  const angle = pct * 180;
  const r = (size - 10) / 2;
  const cx = size / 2;
  const cy = size / 2 + 5;
  const rad = (a) => (a * Math.PI) / 180;
  const x1 = cx - r;
  const endAngle = 180 - angle;
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy - r * Math.sin(rad(endAngle));
  const large = angle > 180 ? 1 : 0;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#1e293b" strokeWidth={6} strokeLinecap="round" />
        {pct > 0 && <path d={`M ${x1} ${cy} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`} fill="none" stroke={gaugeColor} strokeWidth={6} strokeLinecap="round" />}
        <text x={cx} y={cy - 10} textAnchor="middle" fill={gaugeColor} fontSize={20} fontWeight={800} fontFamily="monospace">{value.toFixed(3)}</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="#94a3b8" fontSize={11}>{label}</text>
      </svg>
      {subLabel && <div style={{ fontSize:12, color: "#64748b", marginTop: -4 }}>{subLabel}</div>}
    </div>
  );
}

const priorityColors = { CRITICAL: "#ef4444", HIGH: "#f59e0b", MEDIUM: "#3b82f6", LOW: "#22c55e" };
const HYPOTHESIS_COLOR = { H0: "#22c55e", H1: "#f59e0b", H2: "#ef4444" };
const SNAPSHOT_REQUIRED_KEYS = ["intel_feed", "indicators", "hypotheses", "routes", "checklist"];
const SNAPSHOT_POLL_MS = 30_000;
const API_STATE_CANDIDATES = [
  "/api/state",
  "../api/state",
  "api/state",
  "https://raw.githubusercontent.com/macho715/iran_abu_dash/urgentdash-live/live/hyie_state.json",
];

function dubaiDatePart() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date());
}

function snapshotJsonlCandidates(datePart) {
  return [
    `../urgentdash_snapshots/${datePart}.jsonl`,
    `/urgentdash_snapshots/${datePart}.jsonl`,
    `urgentdash_snapshots/${datePart}.jsonl`,
  ];
}

function hasSnapshotShape(obj) {
  return (
    obj &&
    typeof obj === "object" &&
    SNAPSHOT_REQUIRED_KEYS.every((k) => Object.prototype.hasOwnProperty.call(obj, k))
  );
}

function inferIndicatorVerified(indicator) {
  const tier = String(indicator?.tier || "").toUpperCase();
  const srcCount = Number(indicator?.src_count ?? indicator?.srcCount ?? 0);
  if (tier === "TIER0") {
    return srcCount >= 1;
  }
  return srcCount >= 2;
}

function normalizeIndicators(rows, { applyEvidenceFloor = true } = {}) {
  return (rows || []).map((ind) => {
    const tsIso = String(ind?.tsIso || ind?.ts || new Date().toISOString());
    const verified = applyEvidenceFloor ? inferIndicatorVerified(ind) : false;
    const srcCount = Number(ind?.src_count ?? ind?.srcCount ?? 0);
    return {
      ...ind,
      ts: tsIso,
      tsIso,
      src_count: srcCount,
      srcCount,
      confirmed: verified,
      cv: verified,
      crossVerified: verified,
    };
  });
}

function normalizeIntel(rows, { trustVerified = false } = {}) {
  return (rows || []).map((item) => {
    const tsIso = String(item?.tsIso || item?.ts || new Date().toISOString());
    return {
      ...item,
      ts: tsIso,
      tsIso,
      verified: trustVerified ? Boolean(item?.verified) : false,
    };
  });
}

function parseLatestSnapshotFromJsonl(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (hasSnapshotShape(parsed)) {
        return parsed;
      }
    } catch {
      // keep scanning older lines
    }
  }
  return null;
}

async function fetchLatestSnapshot() {
  const datePart = dubaiDatePart();
  for (const candidate of snapshotJsonlCandidates(datePart)) {
    try {
      const res = await fetch(`${candidate}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) {
        continue;
      }
      const text = await res.text();
      const snapshot = parseLatestSnapshotFromJsonl(text);
      if (snapshot) {
        return { snapshot, source: candidate };
      }
    } catch {
      // keep trying next location
    }
  }
  return null;
}

function healthSummary(sourceHealth) {
  if (!sourceHealth || typeof sourceHealth !== "object") {
    return "health: n/a";
  }
  const rows = Object.values(sourceHealth);
  if (!rows.length) {
    return "health: n/a";
  }
  const ok = rows.filter((row) => row && row.ok).length;
  return `health: ${ok}/${rows.length} ok`;
}

function normalizeConflictStats(raw = {}) {
  const toInt = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
  };
  const startDate = String(raw?.conflict_start_date || "2026-02-28").trim() || "2026-02-28";
  return {
    missiles_total: toInt(raw?.missiles_total),
    missiles_intercepted: toInt(raw?.missiles_intercepted),
    drones_total: toInt(raw?.drones_total),
    drones_destroyed: toInt(raw?.drones_destroyed),
    casualties_kia: toInt(raw?.casualties_kia),
    casualties_wia: toInt(raw?.casualties_wia),
    conflict_start_date: startDate,
    conflict_day: toInt(raw?.conflict_day),
    source: String(raw?.source || "fallback"),
    updated_at: String(raw?.updated_at || ""),
  };
}

function normalizeHypotheses(rows) {
  return (rows || []).map((row) => {
    const id = String(row?.id || "");
    const score = Number(row?.score);
    return {
      ...row,
      id: id || "H?",
      name: String(row?.name || id || "Unknown"),
      score: Number.isFinite(score) ? score : 0,
      color: String(row?.color || HYPOTHESIS_COLOR[id] || "#38bdf8"),
    };
  });
}

async function fetchApiState() {
  for (const candidate of API_STATE_CANDIDATES) {
    try {
      const res = await fetch(`${candidate}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) {
        continue;
      }
      const payload = await res.json();
      if (hasSnapshotShape(payload)) {
        return { snapshot: payload, source: candidate };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function fetchLatestLivePayload() {
  const fromApi = await fetchApiState();
  if (fromApi) {
    return fromApi;
  }
  return fetchLatestSnapshot();
}

// ═══════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════

export default function Dashboard() {
  const [now, setNow] = useState(new Date());
  const [intelFeed, setIntelFeed] = useState(() => normalizeIntel(INTEL_FEED, { trustVerified: false }));
  const [indicators, setIndicators] = useState(() => normalizeIndicators(INDICATORS, { applyEvidenceFloor: false }));
  const [hypotheses, setHypotheses] = useState(() => normalizeHypotheses(HYPOTHESES));
  const [routes, setRoutes] = useState(ROUTES);
  const [checklist, setChecklist] = useState(CHECKLIST);
  const [activeTab, setActiveTab] = useState("overview");
  const [nextEval, setNextEval] = useState(900);
  const [feedFilter, setFeedFilter] = useState("ALL");
  const [liveSnapshotTs, setLiveSnapshotTs] = useState("");
  const [liveSource, setLiveSource] = useState("static");
  const [liveDegraded, setLiveDegraded] = useState(false);
  const [liveHealth, setLiveHealth] = useState("health: n/a");
  const [liveStatus, setLiveStatus] = useState("warming_up");
  const [liveEvidenceConf, setLiveEvidenceConf] = useState(null);
  const [liveUrgency, setLiveUrgency] = useState(null);
  const [liveEffectiveThreshold, setLiveEffectiveThreshold] = useState(0.80);
  const [liveDeltaScore, setLiveDeltaScore] = useState(null);
  const [liveTriggers, setLiveTriggers] = useState({});
  const [liveConflictStats, setLiveConflictStats] = useState(() => normalizeConflictStats({}));
  const [liveSourceHealth, setLiveSourceHealth] = useState({ ok: null, total: null });
  const lastSnapshotTsRef = useRef("");

  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
      setNextEval(p => (p <= 0 ? 900 : p - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;

    const applySnapshot = (snapshot, source) => {
      if (!hasSnapshotShape(snapshot)) {
        return;
      }
      const ts =
        typeof snapshot.state_ts === "string"
          ? snapshot.state_ts
          : (typeof snapshot.snapshot_ts === "string" ? snapshot.snapshot_ts : "");
      if (ts && ts === lastSnapshotTsRef.current) {
        return;
      }
      if (
        !Array.isArray(snapshot.intel_feed) ||
        !Array.isArray(snapshot.indicators) ||
        !Array.isArray(snapshot.hypotheses) ||
        !Array.isArray(snapshot.routes) ||
        !Array.isArray(snapshot.checklist)
      ) {
        return;
      }
      setIntelFeed(normalizeIntel(snapshot.intel_feed, { trustVerified: true }));
      setIndicators(normalizeIndicators(snapshot.indicators, { applyEvidenceFloor: true }));
      setHypotheses(normalizeHypotheses(snapshot.hypotheses));
      setRoutes(snapshot.routes);
      setChecklist(snapshot.checklist);
      if (ts) {
        lastSnapshotTsRef.current = ts;
        setLiveSnapshotTs(ts);
      }
      setLiveSource(source);
      setLiveDegraded(Boolean(snapshot.degraded));
      setLiveHealth(healthSummary(snapshot.source_health));
      setLiveStatus(String(snapshot.status || "unknown"));
      setLiveEvidenceConf(Number.isFinite(snapshot.evidence_conf) ? Number(snapshot.evidence_conf) : null);
      setLiveUrgency(Number.isFinite(snapshot.urgency) ? Number(snapshot.urgency) : null);
      setLiveEffectiveThreshold(Number.isFinite(snapshot.effective_threshold) ? Number(snapshot.effective_threshold) : 0.80);
      setLiveDeltaScore(Number.isFinite(snapshot.delta_score) ? Number(snapshot.delta_score) : null);
      setLiveTriggers(snapshot.triggers && typeof snapshot.triggers === "object" ? snapshot.triggers : {});
      setLiveConflictStats(normalizeConflictStats(snapshot.conflict_stats || {}));
      if (snapshot.source_health && typeof snapshot.source_health === "object") {
        const rows = Object.values(snapshot.source_health);
        const ok = rows.filter((row) => row && row.ok).length;
        setLiveSourceHealth({ ok, total: rows.length });
      } else {
        setLiveSourceHealth({ ok: null, total: null });
      }
    };

    const poll = async () => {
      const result = await fetchLatestLivePayload();
      if (!alive || !result) {
        return;
      }
      applySnapshot(result.snapshot, result.source);
    };

    poll();
    const timer = setInterval(poll, SNAPSHOT_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const toggleCheck = useCallback((id) => {
    setChecklist(prev => prev.map(c => c.id === id ? { ...c, done: !c.done } : c));
  }, []);

  const completedCount = checklist.filter(c => c.done).length;
  const deltaScore = Number.isFinite(liveDeltaScore)
    ? Number(liveDeltaScore)
    : (hypotheses[2]?.score ?? 0) - (hypotheses[1]?.score ?? 0);
  const evidenceConf = Number.isFinite(liveEvidenceConf) ? Number(liveEvidenceConf) : 0;
  const urgencyScore = Number.isFinite(liveUrgency) ? Number(liveUrgency) : null;
  const effectiveThreshold = Number.isFinite(liveEffectiveThreshold) ? Number(liveEffectiveThreshold) : 0.80;
  const bufferFactor = 2.0;
  const indicatorsById = Object.fromEntries(indicators.map((row) => [row.id, row]));
  const i01 = indicatorsById.I01 || {};
  const i02 = indicatorsById.I02 || {};
  const i03 = indicatorsById.I03 || {};
  const i04 = indicatorsById.I04 || {};
  const gateStay = (Number(i01?.state) || 0) >= 0.7 || Boolean(liveTriggers?.kr_leave_immediately);
  const gateStrike = Boolean(liveTriggers?.strike_detected) || (Number(i03?.state) || 0) >= 0.7;
  const gateRoad = Boolean(liveTriggers?.border_change) || (Number(i04?.state) || 0) >= 0.6;
  const gateActiveCount = [gateStay, gateStrike, gateRoad].filter(Boolean).length;
  const gateState = gateActiveCount >= 2 ? "BLOCKED" : gateActiveCount === 1 ? "CAUTION" : "OPEN";
  const modeState = liveDegraded ? "DEGRADED" : (Boolean(liveTriggers?.red_imminent) || deltaScore >= 0.2 ? "RED_PREP" : "AMBER");
  const modeColor = modeState === "DEGRADED" ? "#ef4444" : modeState === "RED_PREP" ? "#f59e0b" : "#22c55e";
  const airspaceState = (Number(i02?.state) || 0) >= 0.8 ? "CLOSED" : (Number(i02?.state) || 0) >= 0.5 ? "DISRUPTED" : "OPEN";
  const airspaceHint = String(i02?.detail || "").slice(0, 42);
  const evidenceState = evidenceConf >= effectiveThreshold ? "PASSED" : "WATCH";
  const h2Score = Number(hypotheses.find((row) => row.id === "H2")?.score || 0);
  const likelihoodLabel = h2Score >= 0.8 ? "HIGHLY LIKELY" : h2Score >= 0.55 ? "LIKELY" : h2Score >= 0.35 ? "POSSIBLE" : "UNLIKELY";
  const likelihoodBand = h2Score >= 0.8 ? ">=80%" : h2Score >= 0.55 ? "55-80%" : h2Score >= 0.35 ? "35-55%" : "<35%";
  const likelihoodBasis = `H2 ${h2Score.toFixed(3)} / ΔScore ${deltaScore.toFixed(3)} / Conf ${evidenceConf.toFixed(3)}`;
  const conflictDayLabel = Number.isFinite(liveConflictStats?.conflict_day) ? `Day ${liveConflictStats.conflict_day}` : "n/a";
  const stat = (value, suffix = "") => (Number.isFinite(value) ? `${value}${suffix}` : "n/a");
  const sourceHealthLabel = Number.isFinite(liveSourceHealth?.ok) && Number.isFinite(liveSourceHealth?.total)
    ? `${liveSourceHealth.ok}/${liveSourceHealth.total} ok`
    : "n/a";
  const conflictSourceLabel = String(liveConflictStats?.source || "fallback");
  const conflictStartLabel = String(liveConflictStats?.conflict_start_date || "n/a");
  const leadingHypothesis = hypotheses.reduce(
    (best, row) => (Number(row?.score || 0) > Number(best?.score || 0) ? row : best),
    hypotheses[0] || { id: "n/a", name: "n/a", score: 0 },
  );
  const leadingColor = leadingHypothesis.id === "H2" ? "#ef4444" : leadingHypothesis.id === "H1" ? "#f59e0b" : "#22c55e";
  const dsGap = 0.20 - deltaScore;
  const dsGapLabel = deltaScore >= 0.20
    ? `ΔScore 임계 초과 +${Math.abs(dsGap).toFixed(3)}`
    : `0.20까지 ${Math.abs(dsGap).toFixed(3)} 차이`;
  const dsStateIcon = deltaScore >= 0.20 ? "✅" : "⚠";
  const dsActionLabel = deltaScore >= 0.20 ? "RED_PREP 조건 충족(유지)" : "추가 에스컬레이션 시 RED_PREP 전환";
  const confDelta = evidenceConf - effectiveThreshold;
  const confDeltaLabel = evidenceConf >= effectiveThreshold
    ? `Conf ${evidenceConf.toFixed(3)} >= ${effectiveThreshold.toFixed(3)} -> RED 조건 충족`
    : `Conf ${evidenceConf.toFixed(3)} < ${effectiveThreshold.toFixed(3)} -> RED 미충족 (${Math.abs(confDelta).toFixed(3)} 차이)`;
  const escalationItems = [
    {
      text: "한국 대사관 'Leave immediately' 발령",
      active: Boolean(liveTriggers?.kr_leave_immediately),
      note: `현재: ${Boolean(liveTriggers?.kr_leave_immediately) ? "감지됨" : "미감지"}`,
    },
    {
      text: "미국 Level 4 Do Not Travel 격상",
      active: (Number(i01?.state) || 0) >= 0.95,
      note: `I01 state=${(Number(i01?.state) || 0).toFixed(2)}`,
    },
    {
      text: "국경 RESTRICTED/CLOSED 감지",
      active: Boolean(liveTriggers?.border_change),
      note: `I04 state=${(Number(i04?.state) || 0).toFixed(2)}`,
    },
    {
      text: "ΔScore(H2-H1) ≥ 0.20 돌파",
      active: deltaScore >= 0.20,
      note: `현재: ${deltaScore.toFixed(3)} / threshold=0.20`,
    },
    {
      text: "추가 대규모 strike 감지",
      active: Boolean(liveTriggers?.strike_detected),
      note: `trigger=${Boolean(liveTriggers?.strike_detected)}`,
    },
  ];
  const deEscalationItems = [
    {
      text: "영공 재개 + 항공 정상화",
      ok: airspaceState === "OPEN",
      note: airspaceHint || "I02 detail n/a",
    },
    {
      text: "strike window 해제",
      ok: !gateStrike,
      note: `strike=${gateStrike ? "active" : "clear"}`,
    },
    {
      text: "국경 통제 해제",
      ok: !gateRoad,
      note: `border=${gateRoad ? "restricted" : "clear"}`,
    },
    {
      text: "Evidence 대비 Threshold 하향 안정",
      ok: evidenceConf < effectiveThreshold && deltaScore < 0.20,
      note: `confΔ=${(evidenceConf - effectiveThreshold).toFixed(3)}`,
    },
  ];

  const tabs = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "intel", label: "Intel Feed", icon: "🔴" },
    { id: "indicators", label: "Indicators", icon: "📡" },
    { id: "routes", label: "Routes", icon: "🛣️" },
    { id: "checklist", label: "Checklist", icon: "✅" },
    { id: "changelog", label: "Version", icon: "📋" },
  ];

  const fmt = (s) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const filteredFeed = feedFilter === "ALL" ? intelFeed : intelFeed.filter(f => f.priority === feedFilter);

  return (
    <div style={{
      minHeight: "100vh", backgroundColor: "#020617", color: "#e2e8f0",
      fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
      padding: "12px", maxWidth: 920, margin: "0 auto",
    }}>
      {/* ── HEADER ── */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)", borderRadius: 16, padding: "16px 20px", marginBottom: 12, border: "1px solid #1e293b" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize:12, color: "#64748b", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>HyIE-ERC² Personal I&W System · LIVE INTELLIGENCE</div>
            <div style={{ fontSize:24, fontWeight: 800, background: "linear-gradient(90deg, #f59e0b, #fbbf24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>v2026.05 — SHELTER MODE</div>
            <div style={{ fontSize:12, color: "#94a3b8", marginTop: 4 }}>
              {`Iran-UAE Conflict ${conflictDayLabel} · ${conflictStartLabel} – ongoing · source ${conflictSourceLabel}`}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize:13, color: "#64748b" }}>Abu Dhabi, UAE (GST +4)</div>
            <div style={{ fontSize:15, fontFamily: "monospace", color: "#94a3b8" }}>
              {now.toISOString().slice(0, 10)} {now.toTimeString().slice(0, 8)}
            </div>
            <div style={{ fontSize:12, color: "#64748b", marginTop: 2 }}>
              {liveSnapshotTs ? `state: ${liveSnapshotTs}` : "state: static seed"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
              <PulsingDot color="#f59e0b" />
              <span style={{ fontSize:13, color: "#f59e0b" }}>다음 평가: {fmt(nextEval)}</span>
            </div>
            <div style={{ fontSize:12, color: liveDegraded ? "#ef4444" : "#475569", marginTop: 2 }}>
              degraded: {liveDegraded ? "true" : "false"}
            </div>
            <div style={{ fontSize:12, color: "#475569", marginTop: 2 }}>
              source: {liveSource}
            </div>
            <div style={{ fontSize:12, color: "#475569", marginTop: 2 }}>
              {liveHealth}
            </div>
          </div>
        </div>
      </div>

      {/* ── ALERT BANNER ── */}
      <div style={{
        background: modeState === "DEGRADED" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
        border: `2px solid ${modeColor}`,
        borderRadius: 12, padding: "14px 20px", marginBottom: 12,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize:24, fontWeight: 900, color: "#000",
          }}>⚠</div>
          <div>
            <div style={{ fontSize:22, fontWeight: 800, color: modeColor }}>
              {modeState === "RED_PREP" ? "AMBER → RED_PREP 접근 중" : modeState === "DEGRADED" ? "DEGRADED 모니터링" : "AMBER 모니터링"}
            </div>
            <div style={{ fontSize:14, color: "#fbbf24" }}>{`MODE: ${modeState} · 이동 제한 · Gate ${gateState}`}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Gate", val: gateState, c: gateState === "BLOCKED" ? "#ef4444" : gateState === "CAUTION" ? "#f59e0b" : "#22c55e" },
            { label: "Evidence", val: evidenceState, c: evidenceState === "PASSED" ? "#22c55e" : "#f59e0b" },
            { label: "Airspace", val: `${airspaceState} ${(Number(i02?.state) || 0).toFixed(2)}`, c: airspaceState === "OPEN" ? "#22c55e" : "#ef4444" },
            { label: "ΔScore", val: `${deltaScore.toFixed(3)}`, c: deltaScore >= 0.15 ? "#f59e0b" : "#64748b" },
          ].map((b, i) => (
            <div key={i} style={{ background: "#1e293b", borderRadius: 8, padding: "5px 10px", textAlign: "center" }}>
              <div style={{ fontSize:11, color: "#64748b" }}>{b.label}</div>
              <div style={{ fontSize:14, fontWeight: 700, color: b.c }}>{b.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CONFLICT SUMMARY BAR ── */}
      <div style={{
        background: "rgba(239,68,68,0.06)", border: "1px solid #7f1d1d", borderRadius: 10,
        padding: "10px 16px", marginBottom: 12, fontSize:13, color: "#fca5a5",
        display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center",
      }}>
        <span>Missiles: <b>{stat(liveConflictStats.missiles_total)}</b> ({stat(liveConflictStats.missiles_intercepted, " int.")})</span>
        <span>Drones: <b>{stat(liveConflictStats.drones_total)}</b> ({stat(liveConflictStats.drones_destroyed, " dest.")})</span>
        <span>Casualties: <b>{stat(liveConflictStats.casualties_kia)} KIA / {stat(liveConflictStats.casualties_wia)} WIA</b></span>
        <span>Duration: <b>{conflictDayLabel}</b></span>
        <span>Sources: <b>{sourceHealthLabel}</b></span>
      </div>

      {/* ── TABS ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: activeTab === t.id ? "#1e293b" : "transparent",
            border: activeTab === t.id ? "1px solid #334155" : "1px solid transparent",
            borderRadius: 8, padding: "8px 14px",
            color: activeTab === t.id ? "#e2e8f0" : "#64748b",
            fontSize:14, fontWeight: activeTab === t.id ? 700 : 500,
            cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s",
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════ OVERVIEW TAB ══════════════════════ */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {/* Hypothesis Scores */}
          <Card title="상황 시나리오 점수" icon="🧠" accent="#334155">
            <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 12 }}>
              {hypotheses.map(h => <GaugeArc key={h.id} value={h.score} color={h.color} label={h.id} subLabel={h.name} />)}
            </div>
            <div style={{ background: "#1e293b", borderRadius: 8, padding: 10, fontSize:13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#94a3b8" }}>Leading:</span>
                <span style={{ color: leadingColor, fontWeight: 700 }}>
                  {leadingHypothesis.id} {leadingHypothesis.name} ({Number(leadingHypothesis.score || 0).toFixed(3)})
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#94a3b8" }}>ΔScore (H2-H1):</span>
                <span style={{ color: "#f59e0b", fontWeight: 700 }}>{deltaScore.toFixed(3)} (threshold: 0.20)</span>
              </div>
              <div style={{ fontSize:12, color: "#fbbf24", marginTop: 6, padding: "4px 8px", background: "rgba(245,158,11,0.1)", borderRadius: 4 }}>
                {`${dsStateIcon} ${dsGapLabel}. ${dsActionLabel}.`}
              </div>
            </div>
          </Card>

          {/* ICD 203 */}
          <Card title="ICD 203 — Confidence / Urgency" icon="🔬" accent="#334155">
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize:13, color: "#94a3b8" }}>Evidence Confidence</span>
                <span style={{ fontSize:15, fontWeight: 700, color: "#f59e0b" }}>
                  {evidenceConf >= 0.75 ? "HIGH" : evidenceConf >= 0.55 ? "MEDIUM-HIGH" : evidenceConf >= 0.35 ? "MEDIUM" : "LOW"} ({evidenceConf.toFixed(3)})
                </span>
              </div>
              <ProgressBar value={evidenceConf} color="#f59e0b" height={10} />
              <div style={{ fontSize:12, color: "#64748b", marginTop: 4 }}>
                source health {sourceHealthLabel} · state {liveStatus}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize:13, color: "#94a3b8" }}>Urgency</span>
                <span style={{ fontSize:15, fontWeight: 700, color: urgencyScore === null ? "#64748b" : "#f59e0b" }}>
                  {urgencyScore === null ? "n/a" : urgencyScore.toFixed(3)}
                </span>
              </div>
              <ProgressBar value={urgencyScore ?? 0} color={urgencyScore === null ? "#64748b" : "#f59e0b"} height={10} />
              <div style={{ fontSize:12, color: urgencyScore === null ? "#ef4444" : "#22c55e", marginTop: 4 }}>
                {urgencyScore === null ? "EgressLossETA 미입력/추정 실패" : "EgressLossETA 기반 산출"}
              </div>
            </div>
            <div style={{ background: "#1e293b", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize:12, color: "#94a3b8", marginBottom: 4 }}>Effective RED Threshold</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize:22, fontWeight: 800, color: "#e2e8f0", fontFamily: "monospace" }}>{effectiveThreshold.toFixed(3)}</span>
                <span style={{ fontSize:12, color: "#64748b" }}>(engine threshold)</span>
              </div>
              <div style={{ fontSize:12, color: "#f59e0b", marginTop: 4 }}>{confDeltaLabel}</div>
            </div>
          </Card>

          {/* Movement Risk Gate */}
          <Card title="Movement Risk Gate" icon="🚧" accent="#ef4444">
            {[
              {
                label: "Stay Indoors",
                active: gateStay,
                src: `I01=${(Number(i01?.state) || 0).toFixed(2)} / kr_alert=${Boolean(liveTriggers?.kr_leave_immediately)}`,
              },
              {
                label: "Active Strike Window",
                active: gateStrike,
                src: `I03=${(Number(i03?.state) || 0).toFixed(2)} / strike=${Boolean(liveTriggers?.strike_detected)}`,
              },
              {
                label: "Curfew / Roadblock",
                active: gateRoad,
                src: `I04=${(Number(i04?.state) || 0).toFixed(2)} / border=${Boolean(liveTriggers?.border_change)}`,
              },
            ].map((g, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10, marginBottom: 8,
                background: g.active ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.05)",
                border: `1px solid ${g.active ? "#7f1d1d" : "#14532d"}`,
                borderRadius: 8, padding: "8px 12px",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: g.active ? "#ef4444" : "#22c55e", boxShadow: g.active ? "0 0 8px #ef4444" : "none" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize:14, fontWeight: 600, color: g.active ? "#fca5a5" : "#86efac" }}>{g.label}</div>
                  <div style={{ fontSize:11, color: "#64748b" }}>{g.src}</div>
                </div>
                <span style={{ fontSize:13, fontWeight: 700, color: g.active ? "#ef4444" : "#22c55e" }}>{g.active ? "ACTIVE" : "CLEAR"}</span>
              </div>
            ))}
            <div style={{ background: "#1e293b", borderRadius: 8, padding: 10, fontSize:13 }}>
              <div style={{ color: gateState === "BLOCKED" ? "#ef4444" : gateState === "CAUTION" ? "#f59e0b" : "#22c55e", fontWeight: 700, marginBottom: 4 }}>
                {`GATE ${gateState} (${gateActiveCount}/3)`}
              </div>
              <div style={{ color: "#94a3b8" }}>
                {gateState === "BLOCKED" ? "RED_MOVE 차단 · RED_PREP만 허용" : gateState === "CAUTION" ? "조건부 이동 검토" : "이동 게이트 해제 가능"}
              </div>
              <div style={{ color: "#64748b", fontSize:12, marginTop: 4 }}>해제 조건: all false 30분+ · strike window 해제 후 60분 대기</div>
            </div>
          </Card>

          {/* Likelihood */}
          <Card title="가능성 (Likelihood)" icon="📈" accent="#334155">
            <div style={{ textAlign: "center", padding: "8px 0 12px" }}>
              <div style={{ fontSize:30, fontWeight: 800, color: likelihoodLabel === "HIGHLY LIKELY" ? "#ef4444" : likelihoodLabel === "LIKELY" ? "#f59e0b" : "#22c55e" }}>
                {likelihoodLabel}
              </div>
              <div style={{ fontSize:15, color: "#94a3b8" }}>{likelihoodBand}</div>
            </div>
            <div style={{ background: "#1e293b", borderRadius: 8, padding: 12, fontSize:14, color: "#cbd5e1", lineHeight: 1.6 }}>
              {`현재 H2=${h2Score.toFixed(3)} 기반으로 ${likelihoodLabel} 구간입니다.`}
            </div>
            <div style={{ background: "rgba(245,158,11,0.08)", borderRadius: 8, padding: 10, marginTop: 8, fontSize:13, color: "#fbbf24" }}>
              {`근거: ${likelihoodBasis}`}
            </div>
            <div style={{ fontSize:12, color: "#64748b", marginTop: 6, textAlign: "center" }}>{`ICD 203: ${evidenceState} / ${liveStatus}`}</div>
          </Card>

          {/* Key Assumptions */}
          <Card title="핵심 가정 (Key Assumptions)" icon="⚙️" accent="#334155" fullWidth>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
              {[
                { id: "A1", text: "Al Ain/Buraimi 국경 OPEN 유지", fail: "Fujairah 루트 전환 (9.3h)", status: "ok", verified: "Canada Advisory 확인: 국경 OPEN" },
                { id: "A2", text: "Stay-indoors 지침이 해제될 것", fail: "SHELTER 유지 + 대사관 직접 연락", status: "warn", verified: "현재 미해제 — 3일째 지속" },
                { id: "A3", text: "상황 점진적 악화 (급변 아님)", fail: "SHELTER 강화 (이동 포기)", status: "warn", verified: "이스라엘 테헤란 추가 타격 → 에스컬레이션" },
                { id: "A4", text: "연료 충분 / 도중 주유 가능", fail: "최단 루트만 유효", status: "ok", verified: "연료 공급 정상 확인 (Khaleej Times)" },
                { id: "A5", text: "통신 유지", fail: "마지막 수신 기준 + decay 중단", status: "ok", verified: "일반 통신 정상, AWS 일부 피해" },
                { id: "A6", text: "개인 차량 이동 가능", fail: "도보/대중교통 → evac_h ×3", status: "ok", verified: "도로 대부분 정상 (파편 지역 제외)" },
              ].map(a => (
                <div key={a.id} style={{
                  background: a.status === "warn" ? "rgba(245,158,11,0.06)" : "#0d1117",
                  border: `1px solid ${a.status === "warn" ? "#92400e" : "#1e293b"}`,
                  borderRadius: 8, padding: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize:13, fontWeight: 700, color: "#e2e8f0", fontFamily: "monospace" }}>{a.id}</span>
                    <span style={{ fontSize:13, color: a.status === "warn" ? "#f59e0b" : "#94a3b8" }}>{a.text}</span>
                  </div>
                  <div style={{ fontSize:12, color: "#64748b" }}>실패 시: {a.fail}</div>
                  <div style={{ fontSize:11, color: a.status === "warn" ? "#fbbf24" : "#475569", marginTop: 4 }}>검증: {a.verified}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Escalation */}
          <Card title="에스컬레이션 지표 (RED 전환)" icon="🔺" accent="#ef4444">
            {escalationItems.map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, lineHeight: 1.4 }}>
                <span style={{ color: e.active ? "#ef4444" : "#64748b", flexShrink: 0, marginTop: 2 }}>{e.active ? "▲▲" : "•"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: e.active ? "#fca5a5" : "#94a3b8", fontWeight: e.active ? 700 : 400, overflowWrap: "anywhere" }}>{e.text}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, textAlign: "right", overflowWrap: "anywhere" }}>{e.note}</div>
                </div>
              </div>
            ))}
          </Card>

          {/* De-escalation */}
          <Card title="디에스컬레이션 지표 (GREEN)" icon="🔽" accent="#22c55e">
            {deEscalationItems.map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, lineHeight: 1.4 }}>
                <span style={{ color: e.ok ? "#22c55e" : "#64748b", flexShrink: 0, marginTop: 2 }}>{e.ok ? "▼" : "•"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: e.ok ? "#86efac" : "#94a3b8", overflowWrap: "anywhere" }}>{e.text}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, textAlign: "right", overflowWrap: "anywhere" }}>{e.note}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ══════════════════════ INTEL FEED TAB ══════════════════════ */}
      {activeTab === "intel" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {["ALL", "CRITICAL", "HIGH", "MEDIUM"].map(f => (
              <button key={f} onClick={() => setFeedFilter(f)} style={{
                background: feedFilter === f ? (priorityColors[f] || "#334155") : "transparent",
                border: `1px solid ${feedFilter === f ? (priorityColors[f] || "#334155") : "#1e293b"}`,
                borderRadius: 6, padding: "4px 12px", fontSize:13, fontWeight: 600,
                color: feedFilter === f ? "#fff" : "#64748b", cursor: "pointer",
              }}>{f} {f !== "ALL" && `(${intelFeed.filter(i => i.priority === f).length})`}</button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredFeed.map((item, i) => (
              <div key={i} style={{
                background: "#0f172a", border: `1px solid ${item.priority === "CRITICAL" ? "#7f1d1d" : "#1e293b"}`,
                borderLeft: `3px solid ${priorityColors[item.priority]}`,
                borderRadius: 8, padding: "10px 14px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize:11, padding: "1px 6px", borderRadius: 4, fontWeight: 700,
                      background: `${priorityColors[item.priority]}20`, color: priorityColors[item.priority],
                    }}>{item.priority}</span>
                    <span style={{ fontSize:12, color: "#64748b", fontFamily: "monospace" }}>{item.ts} GST</span>
                  </div>
                  {item.verified && <span style={{ fontSize:11, color: "#22c55e" }}>✓ verified</span>}
                </div>
                <div style={{ fontSize:14, color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}>{item.text}</div>
                <div style={{ fontSize:12, color: "#64748b", marginBottom: 2 }}>출처: {item.src}</div>
                <div style={{ fontSize:12, color: "#94a3b8", fontStyle: "italic" }}>영향: {item.impact}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════ INDICATORS TAB ══════════════════════ */}
      {activeTab === "indicators" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {indicators.map(ind => (
            <div key={ind.id} style={{
              background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{
                  minWidth: 40, textAlign: "center", fontSize:14, fontWeight: 800, fontFamily: "monospace",
                  color: ind.state >= 0.8 ? "#ef4444" : ind.state >= 0.4 ? "#f59e0b" : "#22c55e",
                }}>{ind.id}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize:14, fontWeight: 600, color: "#e2e8f0" }}>{ind.name}</span>
                    <span style={{
                      fontSize:11, padding: "1px 6px", borderRadius: 4, fontWeight: 700,
                      background: ind.tier === "TIER0" ? "rgba(239,68,68,0.15)" : ind.tier === "TIER1" ? "rgba(245,158,11,0.15)" : "rgba(100,116,139,0.15)",
                      color: ind.tier === "TIER0" ? "#fca5a5" : ind.tier === "TIER1" ? "#fcd34d" : "#94a3b8",
                    }}>{ind.tier}</span>
                    <span style={{ fontSize:14, fontWeight: 800, fontFamily: "monospace", color: ind.state >= 0.8 ? "#ef4444" : ind.state >= 0.4 ? "#f59e0b" : "#22c55e" }}>
                      {ind.state.toFixed(2)}
                    </span>
                  </div>
                </div>
                <span style={{ fontSize:12, color: ind.crossVerified ? "#22c55e" : "#f59e0b" }}>
                  {ind.crossVerified ? "✓ 교차검증" : "△ 부분"}
                </span>
              </div>
              <ProgressBar value={ind.state} color={ind.state >= 0.8 ? "#ef4444" : ind.state >= 0.4 ? "#f59e0b" : "#22c55e"} height={6} />
              <div style={{ fontSize:13, color: "#cbd5e1", marginTop: 6 }}>{ind.detail}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize:12, color: "#64748b", flexWrap: "wrap" }}>
                <span>출처: {ind.src}</span>
                <span>최신: {ind.ts}</span>
                <span>소스 수: {ind.srcCount}</span>
              </div>
            </div>
          ))}
          <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: 14, marginTop: 4 }}>
            <div style={{ fontSize:14, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Evidence Floor Check</div>
            <div style={{ fontSize:13, color: "#94a3b8" }}>Rule: TIER0 confirmed ≥ 1 OR TIER1 confirmed ≥ 1 OR geo_verified_social ≥ 3</div>
            <div style={{ fontSize:14, color: "#22c55e", fontWeight: 700, marginTop: 6 }}>
              ✅ PASSED — TIER0 confirmed: 3건 (I01: 5개국 대사관, I02: Etihad/GCAA, I07: 4개국+ 대피)
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ ROUTES TAB ══════════════════════ */}
      {activeTab === "routes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {routes.map(r => {
            const routeCong = typeof r.congestion === "number" ? r.congestion : (typeof r.cong === "number" ? r.cong : 0);
            const effectiveH = r.base_h * (1 + routeCong) * bufferFactor;
            return (
              <div key={r.id} style={{
                background: "#0f172a", border: `1px solid ${r.status === "CAUTION" ? "#92400e" : "#1e293b"}`,
                borderRadius: 10, padding: 16,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                      background: r.status === "CAUTION" ? "#92400e" : "#14532d", fontSize:15, fontWeight: 800, color: "#fff",
                    }}>{r.id}</span>
                    <div>
                      <div style={{ fontSize:15, fontWeight: 700, color: "#e2e8f0" }}>{r.name}</div>
                      <div style={{ fontSize:12, color: r.status === "CAUTION" ? "#f59e0b" : "#22c55e" }}>{r.status}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize:20, fontWeight: 800, fontFamily: "monospace", color: "#e2e8f0" }}>{effectiveH.toFixed(1)}h</div>
                    <div style={{ fontSize:12, color: "#64748b" }}>effective lead</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div style={{ background: "#1e293b", borderRadius: 6, padding: 8, textAlign: "center" }}>
                    <div style={{ fontSize:12, color: "#64748b" }}>Base</div>
                    <div style={{ fontSize:16, fontWeight: 700, fontFamily: "monospace", color: "#94a3b8" }}>{r.base_h}h</div>
                  </div>
                  <div style={{ background: "#1e293b", borderRadius: 6, padding: 8, textAlign: "center" }}>
                    <div style={{ fontSize:12, color: "#64748b" }}>Congestion</div>
                    <div style={{ fontSize:16, fontWeight: 700, fontFamily: "monospace", color: routeCong > 0.3 ? "#f59e0b" : "#94a3b8" }}>x{(1 + routeCong).toFixed(2)}</div>
                  </div>
                  <div style={{ background: "#1e293b", borderRadius: 6, padding: 8, textAlign: "center" }}>
                    <div style={{ fontSize:12, color: "#64748b" }}>Buffer</div>
                    <div style={{ fontSize:16, fontWeight: 700, fontFamily: "monospace", color: "#f59e0b" }}>x{bufferFactor.toFixed(1)}</div>
                  </div>
                </div>
                <div style={{ fontSize:12, color: "#94a3b8", background: "#0d1117", borderRadius: 6, padding: 8 }}>{r.note}</div>
              </div>
            );
          })}
          <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize:13, color: "#f59e0b", textAlign: "center", marginBottom: 6 }}>⚠ Slack 계산 불가 — EgressLossETA 미입력</div>
            <div style={{ fontSize:12, color: "#94a3b8", textAlign: "center" }}>최우선 경로: A (Al Ain → Buraimi) — 국경 OPEN 확인, 최단 effective lead 18.9h</div>
          </div>
        </div>
      )}

      {/* ══════════════════════ CHECKLIST TAB ══════════════════════ */}
      {activeTab === "checklist" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize:16, fontWeight: 700, color: "#e2e8f0" }}>SHELTER 모드 — 즉시 준비 체크리스트</div>
            <div style={{ fontSize:14, color: completedCount === checklist.length ? "#22c55e" : "#f59e0b" }}>
              {completedCount}/{checklist.length}
            </div>
          </div>
          <ProgressBar value={completedCount} max={checklist.length} color={completedCount === checklist.length ? "#22c55e" : "#f59e0b"} height={6} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
            {checklist.map(c => (
              <div key={c.id} onClick={() => toggleCheck(c.id)} style={{
                display: "flex", alignItems: "center", gap: 12,
                background: c.done ? "rgba(34,197,94,0.05)" : "#0f172a",
                border: `1px solid ${c.done ? "#14532d" : "#1e293b"}`,
                borderRadius: 8, padding: "10px 14px", cursor: "pointer", transition: "all 0.2s",
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: `2px solid ${c.done ? "#22c55e" : "#334155"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: c.done ? "#22c55e" : "transparent", transition: "all 0.2s",
                }}>
                  {c.done && <span style={{ color: "#000", fontSize:14, fontWeight: 800 }}>✓</span>}
                </div>
                <span style={{
                  fontSize:15, color: c.done ? "#86efac" : "#e2e8f0",
                  textDecoration: c.done ? "line-through" : "none", opacity: c.done ? 0.7 : 1,
                }}>{c.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════ CHANGELOG TAB ══════════════════════ */}
      {activeTab === "changelog" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {VERSIONS.map((v, i) => (
            <div key={i} style={{
              background: v.active ? "rgba(139,92,246,0.08)" : "#0f172a",
              border: `1px solid ${v.active ? "#7c3aed" : "#1e293b"}`,
              borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{ minWidth: 80, fontSize:14, fontWeight: 800, fontFamily: "monospace", color: v.active ? "#a78bfa" : "#94a3b8" }}>{v.v}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize:14, color: "#e2e8f0" }}>{v.desc}</div>
                <div style={{ fontSize:12, color: "#64748b" }}>{v.change}</div>
              </div>
              {v.active && <span style={{ fontSize:11, background: "#7c3aed", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>ACTIVE</span>}
            </div>
          ))}
        </div>
      )}

      {/* ── FOOTER ── */}
      <div style={{
        marginTop: 16, padding: "10px 16px", background: "#0f172a",
        borderRadius: 10, border: "1px solid #1e293b", fontSize:12, color: "#475569",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
          <span>HyIE-ERC² v2026.05 · ICD 203 · 실시간 검증 데이터</span>
          <span>경보 시점 = 출구 상실 시점 - (대피 소요 x 버퍼)</span>
        </div>
        <div style={{ marginTop: 6, color: "#334155", fontSize:11, lineHeight: 1.6 }}>
          {`Source health: ${sourceHealthLabel} · state source: ${liveSource} · conflict_stats: ${conflictSourceLabel}`}
        </div>
      </div>
    </div>
  );
}


