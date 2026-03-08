export const GST_TIMEZONE = "Asia/Dubai";

export const STORAGE_KEYS = {
  egress: "urgentdash.egressLossETA",
  history: "urgentdash.history.v1",
  timeline: "urgentdash.timeline.v1",
  autoSummary: "urgentdash.autoSummary.v1",
  notifications: "urgentdash.notif.v1",
  sound: "urgentdash.sound.v1"
};

export const HISTORY_MAX_POINTS = 96;
export const TIMELINE_MAX = 220;

export const POLL_INTERVAL_MS = 30 * 60 * 1000;
export const FAST_POLL_MS_DEFAULT = 30 * 1000;
export const FAST_COUNTDOWN_SECONDS = 30;
export const COUNTDOWN_SECONDS = FAST_COUNTDOWN_SECONDS;
export const LIVE_STALE_THRESHOLD_SECONDS = 3600; // 1시간
export const LIVE_STALE_SEVERE_THRESHOLD_SECONDS = 7200; // 2시간
export const LIVE_STALE_CRITICAL_THRESHOLD_SECONDS = 14400; // 4시간

export const MIN_EVIDENCE_SOURCES = 2;
export const FALLBACK_EGRESS_LOSS_ETA = 10;

export const ROUTE_BUFFER_FACTOR = 2.0;
export const EVENT_NOISE_WINDOW_MS = 10 * 60 * 1000;

export const EVIDENCE_FLOOR_T0_TARGET = 3;

export const ROUTE_CONGESTION_DELTA = 0.15;
export const ROUTE_EFF_SPIKE_RATIO = 0.25;
export const ROUTE_EFF_SPIKE_HOURS = 1.5;

export const I02_SEGMENTS = [
  { id: "NORMAL", min: 0.00, max: 0.30, label: "NORMAL", severity: "INFO" },
  { id: "DELAYED", min: 0.30, max: 0.50, label: "DELAYED", severity: "WARN" },
  { id: "DISRUPTED", min: 0.50, max: 0.65, label: "DISRUPTED", severity: "WARN" },
  { id: "SEVERE", min: 0.65, max: 0.80, label: "SEVERE", severity: "ALERT" },
  { id: "CLOSED", min: 0.80, max: 1.01, label: "CLOSED", severity: "ALERT" }
];

export const SNAPSHOT_REQUIRED_KEYS = ["intel_feed", "indicators", "hypotheses", "routes", "checklist"];

export const DEFAULT_LATEST_CANDIDATES = [
  "http://127.0.0.1:8000/api/live/latest",
  "/api/live/latest",
  "./api/live/latest",
  "api/live/latest",
  "https://raw.githubusercontent.com/macho715/iran_abu_dash/urgentdash-live/live/latest.json"
];

export const DEFAULT_DASHBOARD_CANDIDATES = [
  "http://127.0.0.1:8000/api/state",
  "/api/state",
  "./api/state",
  "api/state",
  "https://raw.githubusercontent.com/macho715/iran_abu_dash/urgentdash-live/live/hyie_state.json",
  "./data/dashboard.json"
];

export const DEFAULT_FAST_STATE_CANDIDATES = [
  "http://127.0.0.1:8000/api/state",
  "/api/state",
  "./api/state",
  "api/state",
  "https://raw.githubusercontent.com/macho715/iran_abu_dash/urgentdash-live/live/hyie_state.json"
];

export function getLatestCandidates() {
  const env = import.meta?.env?.VITE_LATEST_CANDIDATES;
  if (typeof env === "string" && env.trim()) {
    return env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_LATEST_CANDIDATES;
}

export function getDashboardCandidates() {
  const env = import.meta?.env?.VITE_DASHBOARD_CANDIDATES;
  if (typeof env === "string" && env.trim()) {
    return env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_DASHBOARD_CANDIDATES;
}

export function getFastStateCandidates() {
  const env = import.meta?.env?.VITE_FAST_STATE_CANDIDATES;
  if (typeof env === "string" && env.trim()) {
    return env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_FAST_STATE_CANDIDATES;
}
