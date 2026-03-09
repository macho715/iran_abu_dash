const STATUS_THEMES = {
  critical: {
    className: "is-critical",
    textColor: "#fda4af",
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderColor: "#b91c1c",
    badgeBackground: "#7f1d1d",
    lineColor: "#f87171"
  },
  high: {
    className: "is-high",
    textColor: "#fdba74",
    backgroundColor: "rgba(249, 115, 22, 0.18)",
    borderColor: "#c2410c",
    badgeBackground: "#7c2d12",
    lineColor: "#fb923c"
  },
  caution: {
    className: "is-caution",
    textColor: "#fcd34d",
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    borderColor: "#b45309",
    badgeBackground: "#78350f",
    lineColor: "#f59e0b"
  },
  blocked: {
    className: "is-blocked",
    textColor: "#fecaca",
    backgroundColor: "rgba(127, 29, 29, 0.34)",
    borderColor: "#7f1d1d",
    badgeBackground: "#7f1d1d",
    lineColor: "#ef4444"
  },
  normal: {
    className: "is-normal",
    textColor: "#86efac",
    backgroundColor: "rgba(34, 197, 94, 0.18)",
    borderColor: "#166534",
    badgeBackground: "#14532d",
    lineColor: "#22c55e"
  },
  repeated: {
    className: "is-repeated",
    textColor: "#cbd5e1",
    backgroundColor: "rgba(71, 85, 105, 0.24)",
    borderColor: "#475569",
    badgeBackground: "#334155",
    lineColor: "#94a3b8"
  }
};

const ROUTE_STATUS_MAP = {
  BLOCKED: STATUS_THEMES.blocked,
  CAUTION: STATUS_THEMES.caution,
  OPEN: STATUS_THEMES.normal,
};

const INTEL_PRIORITY_MAP = {
  CRITICAL: STATUS_THEMES.critical,
  HIGH: STATUS_THEMES.high,
  MEDIUM: STATUS_THEMES.caution,
};

export function getSeverityColor(severity) {
  return getIntelPriorityTheme(severity).textColor;
}

export function getRouteStatusTheme(status) {
  return ROUTE_STATUS_MAP[status] || STATUS_THEMES.normal;
}

export function getIntelPriorityTheme(priority) {
  return INTEL_PRIORITY_MAP[priority] || STATUS_THEMES.repeated;
}

export function getLikelihoodTheme(label) {
  if (label === "HIGHLY LIKELY") return STATUS_THEMES.critical;
  if (label === "LIKELY") return STATUS_THEMES.caution;
  return STATUS_THEMES.normal;
}

export function getCongestionTheme(value) {
  if (value > 0.5) return STATUS_THEMES.critical;
  if (value > 0.3) return STATUS_THEMES.caution;
  return STATUS_THEMES.normal;
}

export function getAssumptionTheme(status) {
  return status === "warn" ? STATUS_THEMES.caution : STATUS_THEMES.repeated;
}

export function getRepeatedTheme() {
  return STATUS_THEMES.repeated;
}
