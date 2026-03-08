export interface Indicator {
  id: string;
  name: string;
  tier: "TIER0" | "TIER1" | "TIER2" | string;
  state: number;
  cv: boolean;
  detail: string;
  src: string;
  tsIso: string;
  srcCount: number;
}

export interface Hypothesis {
  id: "H0" | "H1" | "H2" | string;
  name: string;
  score: number;
  detail?: string;
}

export interface Route {
  id: string;
  name: string;
  base_h: number;
  status: "OPEN" | "CAUTION" | "BLOCKED" | string;
  cong?: number;
  congestion?: number;
  note?: string;
  newsRefs?: Array<unknown>;
}

export interface IntelFeedItem {
  id: string;
  ts?: string;
  tsIso: string;
  priority: string;
  category: string;
  text: string;
  sources: string;
}

export interface ChecklistItem {
  id: number | string;
  text: string;
  done: boolean;
}

export interface AiAnalysis {
  summary?: string;
  threat_level?: string;
  sentiment?: string;
  key_points?: string[];
  updated_at?: string;
  analysis_source?: string;
  recommended_action?: string;
  [key: string]: unknown;
}

export interface Dashboard {
  intelFeed: IntelFeedItem[];
  indicators: Indicator[];
  hypotheses: Hypothesis[];
  routes: Route[];
  checklist: ChecklistItem[];
  metadata: Record<string, unknown>;
  routeGeo?: Record<string, unknown> | null;
  aiAnalysis?: AiAnalysis | null;
}

export interface TimelineEvent {
  id: string;
  ts: string;
  level: "ALERT" | "WARN" | "INFO" | string;
  category: string;
  title: string;
  detail: string;
  noiseKey?: string;
}

export interface HistoryPoint {
  key: string;
  ts: string;
  stateTs: string;
  scores: {
    H0: number;
    H1: number;
    H2: number;
  };
  ds: number;
  ec: number;
  thr: number;
  mode: string;
  gate: string;
  air: string;
  ev: string;
  i02seg: string;
}

export interface DerivedState {
  ds: number;
  ec: number;
  effectiveThreshold: number;
  gateState: string;
  modeState: string;
  modeColor: string;
  evidenceState: string;
  airspaceState: string;
  airspaceSegment: string;
  airspaceSegmentSeverity: string;
  h2Score: number;
  likelihoodLabel: string;
  likelihoodBand: string;
  likelihoodBasis: string;
  evidenceFloorT0: number;
  evidenceFloorPassed: boolean;
  urgencyScore: number;
  liveLagSeconds: number | null;
  liveStale: boolean;
  staleSeverity: "UNKNOWN" | "FRESH" | "STALE" | "SEVERE" | "CRITICAL";
  sourceHealthLabel: string;
  liveSource: string;
  leadingHypothesis: Hypothesis;
  leadingColor: string;
  conflictStats: Record<string, unknown>;
  conflictDayLabel: string;
  conflictSourceLabel: string;
  [key: string]: unknown;
}
