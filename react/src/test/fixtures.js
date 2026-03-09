export function createDashboard(overrides = {}) {
  const base = {
    metadata: {
      stateTs: "2026-03-06T10:00:00Z",
      version: "2026-03-06T10-00-00Z",
      schemaVersion: "2025.10",
      generatedAt: "2026-03-06T10:00:00Z",
      status: "live",
      degraded: false,
      egressLossETA: 8,
      evidenceConf: 0.84,
      effectiveThreshold: 0.8,
      deltaScore: 0.22,
      urgency: 0.72,
      triggers: {},
      conflictStats: {
        conflict_start_date: "2026-02-28",
        conflict_day: 7,
        source: "fixture",
        missiles_total: 12,
        missiles_intercepted: 10,
        drones_total: 8,
        drones_destroyed: 7,
        casualties_kia: 2,
        casualties_wia: 4
      },
      sourceOk: 5,
      sourceTotal: 6,
      source: "fixture://live"
    },
    indicators: [
      { id: "I01", name: "Embassy", tier: "TIER0", state: 0.1, cv: true, detail: "", src: "gov", tsIso: "2026-03-06T09:50:00Z", srcCount: 2 },
      { id: "I02", name: "Airspace", tier: "TIER0", state: 0.52, cv: true, detail: "Delays at T1", src: "faa", tsIso: "2026-03-06T09:51:00Z", srcCount: 2 },
      { id: "I03", name: "Strike", tier: "TIER0", state: 0.15, cv: true, detail: "", src: "press", tsIso: "2026-03-06T09:52:00Z", srcCount: 2 },
      { id: "I04", name: "Border", tier: "TIER1", state: 0.10, cv: false, detail: "", src: "press", tsIso: "2026-03-06T09:53:00Z", srcCount: 1 }
    ],
    hypotheses: [
      { id: "H0", name: "Stable", score: 0.18, detail: "" },
      { id: "H1", name: "Escalation", score: 0.36, detail: "" },
      { id: "H2", name: "Evacuation", score: 0.58, detail: "" }
    ],
    intelFeed: [
      { id: "intel-critical", tsIso: "2026-03-06T09:55:00Z", priority: "CRITICAL", category: "AIRSPACE", text: "Critical airspace update", sources: "faa" },
      { id: "intel-high", tsIso: "2026-03-06T09:45:00Z", priority: "HIGH", category: "BORDER", text: "Border congestion rising", sources: "reuters" },
      { id: "intel-medium", tsIso: "2026-03-06T09:35:00Z", priority: "MEDIUM", category: "GENERAL", text: "General situation unchanged", sources: "ap" }
    ],
    routes: [
      { id: "R1", name: "North", base_h: 4.5, status: "OPEN", cong: 0.2, note: "", newsRefs: [] },
      { id: "R2", name: "South", base_h: 6.0, status: "CAUTION", cong: 0.4, note: "", newsRefs: [] }
    ],
    checklist: [
      { id: 1, text: "Documents ready", done: false },
      { id: 2, text: "Transport confirmed", done: true }
    ],
    routeGeo: {
      nodes: {
        A: { label: "A", lat: 25.2, lng: 55.3 },
        B: { label: "B", lat: 26.1, lng: 56.1 }
      },
      routes: {
        R1: { waypoints: ["A", "B"], coords: [[25.2, 55.3], [26.1, 56.1]], provider: "osrm", profile: "driving" }
      }
    },
    aiAnalysis: {
      summary: "AI summary",
      threat_level: "HIGH",
      sentiment: "watchful",
      analysis_source: "notebooklm",
      updated_at: "2026-03-06T09:58:00Z",
      key_points: ["Point A", "Point B"],
      recommended_action: "Monitor routes"
    }
  };

  const next = {
    ...base,
    ...overrides,
    metadata: {
      ...base.metadata,
      ...(overrides.metadata || {}),
      triggers: {
        ...base.metadata.triggers,
        ...(overrides.metadata?.triggers || {})
      },
      conflictStats: {
        ...base.metadata.conflictStats,
        ...(overrides.metadata?.conflictStats || {})
      }
    }
  };

  if (overrides.indicators) next.indicators = overrides.indicators;
  if (overrides.hypotheses) next.hypotheses = overrides.hypotheses;
  if (overrides.intelFeed) next.intelFeed = overrides.intelFeed;
  if (overrides.routes) next.routes = overrides.routes;
  if (overrides.checklist) next.checklist = overrides.checklist;
  if (overrides.routeGeo !== undefined) next.routeGeo = overrides.routeGeo;
  if (Object.prototype.hasOwnProperty.call(overrides, "aiAnalysis")) next.aiAnalysis = overrides.aiAnalysis;

  return next;
}

export function createSnapshot(overrides = {}) {
  const dashboard = createDashboard(overrides);
  return {
    ...dashboard.metadata,
    conflict_stats: dashboard.metadata.conflictStats,
    intel_feed: dashboard.intelFeed,
    indicators: dashboard.indicators,
    hypotheses: dashboard.hypotheses,
    routes: dashboard.routes,
    checklist: dashboard.checklist,
    route_geo: dashboard.routeGeo,
    ai_analysis: dashboard.aiAnalysis
  };
}

export function createHistory() {
  return [
    {
      key: "point-1",
      ts: "2026-03-06T09:00:00Z",
      stateTs: "2026-03-06T08:59:00Z",
      scores: { H0: 0.4, H1: 0.3, H2: 0.3 },
      ds: 0.05,
      ec: 0.61,
      thr: 0.8,
      mode: "AMBER",
      gate: "OPEN",
      air: "OPEN",
      ev: "WATCH",
      i02seg: "NORMAL"
    },
    {
      key: "point-2",
      ts: "2026-03-06T10:00:00Z",
      stateTs: "2026-03-06T09:59:00Z",
      scores: { H0: 0.2, H1: 0.32, H2: 0.63 },
      ds: 0.22,
      ec: 0.84,
      thr: 0.8,
      mode: "RED_PREP",
      gate: "CAUTION",
      air: "DISRUPTED",
      ev: "PASSED",
      i02seg: "DISRUPTED"
    }
  ];
}

export function createHealthyDashboard(overrides = {}) {
  return createDashboard({
    ...overrides,
    metadata: {
      stateTs: new Date(Date.now() - (5 * 60 * 1000)).toISOString(),
      sourceOk: 6,
      sourceTotal: 6,
      ...(overrides.metadata || {}),
    },
  });
}

export function createStaleDashboard(overrides = {}) {
  return createDashboard({
    ...overrides,
    metadata: {
      stateTs: new Date(Date.now() - (125 * 60 * 1000)).toISOString(),
      sourceOk: 2,
      sourceTotal: 6,
      ...(overrides.metadata || {}),
    },
  });
}
