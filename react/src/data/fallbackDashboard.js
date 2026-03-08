import { normalizeDashboard } from "../lib/normalize.js";

export const FALLBACK_DASHBOARD = {
  intelFeed: [
    { ts: "Mar 4 09:10", priority: "CRITICAL", category: "MIL", text: "걸프 지역 긴장 고조 — 일부 공항 운항 변동 가능", sources: "BBC/Al Jazeera" },
    { ts: "Mar 4 08:30", priority: "HIGH", category: "AVIATION", text: "항공사 공지: 특정 구간 재평가 진행", sources: "Etihad/Emirates" },
    { ts: "Mar 4 07:55", priority: "MEDIUM", category: "BORDER", text: "오만 방향 육로 혼잡 증가 가능성", sources: "SNS/Local" }
  ],
  indicators: [
    { id: "I01", name: "KR/US travel advisory", tier: "TIER0", state: 0.62, cv: true, detail: "Advisory watch", src: "KR MFA/US State", ts: "Mar 4 08:40" },
    { id: "I02", name: "Airspace/Airport status", tier: "TIER0", state: 0.48, cv: true, detail: "부분 지연(일부 슬롯 제한)", src: "Airport ops/Etihad", ts: "Mar 4 08:20" },
    { id: "I03", name: "Strike window", tier: "TIER1", state: 0.35, cv: true, detail: "추가 strike 신호 낮음", src: "OSINT/Local", ts: "Mar 4 07:50" },
    { id: "I04", name: "Border/Roadblocks", tier: "TIER1", state: 0.25, cv: false, detail: "국경 통제 징후 낮음", src: "Traffic/Local", ts: "Mar 4 07:40" }
  ],
  hypotheses: [
    { id: "H0", name: "De-escalation / stabilization", score: 0.25, detail: "확전 억제 신호" },
    { id: "H1", name: "Contained escalation", score: 0.35, detail: "제한적 충돌 지속" },
    { id: "H2", name: "Regional spillover", score: 0.40, detail: "확전/연쇄 차질 가능" }
  ],
  routes: [
    { id: "A", name: "Abu Dhabi → Al Ain → Buraimi → Sohar", base_h: 5.7, status: "OPEN", cong: 0.22, note: "내륙 우회로, 변동 적음", newsRefs: [] },
    { id: "B", name: "Abu Dhabi → Mezyad → Nizwa", base_h: 6.5, status: "CAUTION", cong: 0.40, note: "보더 대기 증가 가능", newsRefs: [] },
    { id: "C", name: "Abu Dhabi → Ghuwaifat → Riyadh", base_h: 13.4, status: "OPEN", cong: 0.18, note: "장거리, 보급 필요", newsRefs: [] },
    { id: "D", name: "Fujairah → Khatmat Malaha → Muscat", base_h: 9.3, status: "BLOCKED", cong: 0.35, note: "동해안 차단 상태", newsRefs: [] }
  ],
  checklist: [
    { id: 1, text: "Bug-out bag (여권/ID/현금/물/비상식량)", done: false },
    { id: 2, text: "차량 연료 Full 확인", done: false },
    { id: 3, text: "오만 보험(Orange Card) 확인", done: false },
    { id: 4, text: "대사관 긴급번호 저장", done: false },
    { id: 5, text: "오프라인 맵 다운로드", done: false },
    { id: 6, text: "비상연락망 업데이트", done: false },
    { id: 7, text: "15분마다 공지/뉴스 확인", done: false },
    { id: 8, text: "경보 수신 채널 점검", done: false }
  ],
  metadata: {
    stateTs: new Date().toISOString(),
    status: "fallback",
    degraded: false,
    egressLossETA: 10,
    evidenceConf: 0.55,
    effectiveThreshold: 0.80,
    deltaScore: 0.05,
    urgency: 0.30,
    triggers: { kr_leave_immediately: false, strike_detected: false, border_change: false, red_imminent: false },
    conflictStats: { conflict_start_date: null, missiles_total: 0, missiles_intercepted: 0, drones_total: 0, drones_destroyed: 0 }
  }
};

export const INITIAL_DASHBOARD = normalizeDashboard(FALLBACK_DASHBOARD) || FALLBACK_DASHBOARD;
