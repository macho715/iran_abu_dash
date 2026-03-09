import React from "react";

import { countIntelStatuses } from "../lib/intelStatus.js";
import { getRouteEffectiveHours } from "../lib/utils.js";
import { Card } from "./ui.jsx";

function formatHours(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}h` : "n/a";
}

function formatPercent(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : "n/a";
}

function buildTabContext({
  activeTab,
  dash,
  derived,
  usableRoutes,
  timeline,
  history,
  selectedHistoryIndex,
  intelFilter,
  filteredIntelFeed,
  summary,
  selectedRouteId,
}) {
  const routes = Array.isArray(dash?.routes) ? dash.routes : [];
  const indicators = Array.isArray(dash?.indicators) ? dash.indicators : [];
  const checklist = Array.isArray(dash?.checklist) ? dash.checklist : [];
  const doneCount = checklist.filter((item) => item?.done).length;
  const intelSummary = countIntelStatuses(dash?.intelFeed || []);
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) || null;
  const focusRoute = selectedRoute || usableRoutes?.[0] || null;
  const selectedHistory = history?.[selectedHistoryIndex] || history?.[history.length - 1] || null;

  switch (activeTab) {
    case "analysis":
      return {
        title: "Analysis Focus",
        note: selectedHistory?.stateTs ? `selected frame: ${selectedHistory.stateTs}` : "select a frame to compare trend changes",
        items: [
          { label: "History", value: String(history?.length || 0), meta: "captured points" },
          { label: "Timeline", value: String(timeline?.length || 0), meta: "event rows" },
          { label: "Delta", value: derived?.ds?.toFixed?.(3) || "n/a", meta: derived?.dsActionLabel || "trend threshold" },
          { label: "Evidence", value: derived?.ec?.toFixed?.(3) || "n/a", meta: derived?.confDeltaLabel || "confidence gap" },
        ],
      };
    case "intel":
      return {
        title: "Intel Feed Context",
        note: intelSummary.hasFresh ? "fresh or official signals exist in the current feed" : "repeated items dominate the current feed",
        items: [
          { label: "Filter", value: intelFilter || "ALL", meta: `${filteredIntelFeed?.length || 0} visible` },
          { label: "Fresh", value: String(intelSummary.freshCount + intelSummary.officialCount), meta: "fresh + official" },
          { label: "Repeated", value: String(intelSummary.repeatedCount), meta: "unchanged items" },
          { label: "Critical", value: String((dash?.intelFeed || []).filter((item) => item.priority === "CRITICAL").length), meta: "priority count" },
        ],
      };
    case "indicators":
      return {
        title: "Indicator Context",
        note: derived?.evidenceFloorPassed ? "TIER0 evidence floor is currently satisfied" : "TIER0 evidence floor still needs reinforcement",
        items: [
          { label: "Indicators", value: String(indicators.length), meta: "tracked signals" },
          { label: "TIER0 CV", value: String(derived?.evidenceFloorT0 ?? 0), meta: "cross-validated" },
          { label: "Airspace", value: derived?.airspaceState || "n/a", meta: `segment ${derived?.airspaceSegment || "n/a"}` },
          { label: "Lead", value: derived?.leadingHypothesis?.id || "n/a", meta: derived?.leadingHypothesis?.name || "hypothesis" },
        ],
      };
    case "routes":
      return {
        title: "Route Context",
        note: focusRoute ? focusRoute.name : "select a route on the map to pin context here",
        items: [
          { label: "Focus", value: focusRoute ? `Route ${focusRoute.id}` : "n/a", meta: focusRoute?.status || "no route selected" },
          { label: "ETA", value: formatHours(focusRoute ? getRouteEffectiveHours(focusRoute) : NaN), meta: selectedRoute ? "selected route" : "best usable route" },
          { label: "Usable", value: String(usableRoutes?.length || 0), meta: `${routes.length || 0} total routes` },
          { label: "Blocked", value: String(routes.filter((route) => route.status === "BLOCKED").length), meta: "hard stop routes" },
        ],
      };
    case "sim":
      return {
        title: "Simulator Baseline",
        note: "scenario changes stay local to the simulator and do not mutate live data",
        items: [
          { label: "Mode", value: derived?.modeState || "n/a", meta: "current baseline" },
          { label: "Gate", value: derived?.gateState || "n/a", meta: "land movement" },
          { label: "Urgency", value: formatPercent(derived?.urgencyScore), meta: "baseline urgency" },
          { label: "Best Route", value: usableRoutes?.[0] ? `Route ${usableRoutes[0].id}` : "n/a", meta: usableRoutes?.[0] ? formatHours(usableRoutes[0].eff) : "no usable route" },
        ],
      };
    case "checklist":
      return {
        title: "Checklist Context",
        note: checklist.length ? `${checklist.length - doneCount} tasks remain before departure readiness` : "no checklist data",
        items: [
          { label: "Done", value: `${doneCount}/${checklist.length || 0}`, meta: "completed tasks" },
          { label: "Ready", value: formatPercent(checklist.length ? doneCount / checklist.length : 0), meta: "completion ratio" },
          { label: "Mode", value: derived?.modeState || "n/a", meta: "current dashboard state" },
          { label: "Route", value: usableRoutes?.[0] ? `Route ${usableRoutes[0].id}` : "n/a", meta: usableRoutes?.[0] ? formatHours(usableRoutes[0].eff) : "no fallback route" },
        ],
      };
    case "overview":
    default:
      return {
        title: "Overview Context",
        note: dash?.aiAnalysis?.summary ? "NotebookLM analysis is attached to the current snapshot" : "operating on live dashboard and rule-based summary only",
        items: [
          { label: "Best Route", value: usableRoutes?.[0] ? `Route ${usableRoutes[0].id}` : "n/a", meta: usableRoutes?.[0] ? formatHours(usableRoutes[0].eff) : "no usable route" },
          { label: "Urgency", value: formatPercent(derived?.urgencyScore), meta: derived?.conflictDayLabel || "conflict day" },
          { label: "Summary", value: summary?.mode || "OFFLINE", meta: summary?.ts ? "generated" : "not generated" },
          { label: "AI", value: dash?.aiAnalysis?.threat_level || "none", meta: dash?.aiAnalysis?.sentiment || "NotebookLM" },
        ],
      };
  }
}

export default function DashboardAside({
  tabs = [],
  activeTab,
  dash,
  derived,
  usableRoutes,
  timeline,
  history,
  selectedHistoryIndex,
  intelFilter,
  filteredIntelFeed,
  summary,
  selectedRouteId,
}) {
  const tabLabel = tabs.find((tab) => tab.id === activeTab)?.label || activeTab;
  const context = buildTabContext({
    activeTab,
    dash,
    derived,
    usableRoutes,
    timeline,
    history,
    selectedHistoryIndex,
    intelFilter,
    filteredIntelFeed,
    summary,
    selectedRouteId,
  });

  return (
    <div className="dashboard-aside-stack">
      <Card className="dashboard-aside-card">
        <div className="split-header">
          <div>
            <div className="section-title">Operational Snapshot</div>
            <div className="section-subtitle">{tabLabel} tab context</div>
          </div>
          <div className="status-chip is-muted">{derived.sourceHealthLabel || "n/a"}</div>
        </div>

        <div className="dashboard-aside-grid section-gap">
          <div className="dashboard-aside-stat">
            <div className="dashboard-aside-stat__label">Mode</div>
            <div className="dashboard-aside-stat__value" style={{ color: derived.modeColor }}>{derived.modeState}</div>
            <div className="dashboard-aside-stat__meta">dashboard posture</div>
          </div>
          <div className="dashboard-aside-stat">
            <div className="dashboard-aside-stat__label">Gate</div>
            <div className="dashboard-aside-stat__value">{derived.gateState}</div>
            <div className="dashboard-aside-stat__meta">land movement</div>
          </div>
          <div className="dashboard-aside-stat">
            <div className="dashboard-aside-stat__label">Airspace</div>
            <div className="dashboard-aside-stat__value">{derived.airspaceState}</div>
            <div className="dashboard-aside-stat__meta">segment {derived.airspaceSegment}</div>
          </div>
          <div className="dashboard-aside-stat">
            <div className="dashboard-aside-stat__label">Lead</div>
            <div className="dashboard-aside-stat__value" style={{ color: derived.leadingColor }}>{derived.leadingHypothesis?.id || "n/a"}</div>
            <div className="dashboard-aside-stat__meta">{derived.leadingHypothesis?.name || "hypothesis"}</div>
          </div>
        </div>

        <div className="dashboard-aside-list section-gap">
          <div className="dashboard-aside-list__row">
            <span>Live lag</span>
            <span>{Number.isFinite(derived.liveLagSeconds) ? `${derived.liveLagSeconds}s` : "n/a"}</span>
          </div>
          <div className="dashboard-aside-list__row">
            <span>Conflict</span>
            <span>{derived.conflictDayLabel}</span>
          </div>
          <div className="dashboard-aside-list__row">
            <span>Usable routes</span>
            <span>{usableRoutes?.length || 0}</span>
          </div>
          <div className="dashboard-aside-list__row">
            <span>Intel items</span>
            <span>{dash?.intelFeed?.length || 0}</span>
          </div>
        </div>
      </Card>

      <Card className="dashboard-aside-card">
        <div className="section-title">{context.title}</div>
        <div className="dashboard-aside-grid section-gap">
          {context.items.map((item) => (
            <div key={item.label} className="dashboard-aside-stat">
              <div className="dashboard-aside-stat__label">{item.label}</div>
              <div className="dashboard-aside-stat__value">{item.value}</div>
              <div className="dashboard-aside-stat__meta">{item.meta}</div>
            </div>
          ))}
        </div>
        <div className="dashboard-aside-note section-gap">{context.note}</div>
      </Card>

      <Card className="dashboard-aside-card">
        <div className="section-title">Decision Watchlist</div>
        <div className="section-subtitle">현재 판단에 가장 직접적인 트리거</div>
        <div className="dashboard-watchlist section-gap">
          {(derived.escalationItems || []).slice(0, 4).map((item) => (
            <div key={item.text} className="dashboard-watchlist__item">
              <div className={`status-chip ${item.active ? "" : "is-muted"}`}>{item.active ? "ACTIVE" : "watch"}</div>
              <div className="dashboard-watchlist__body">
                <div className="dashboard-watchlist__title">{item.text}</div>
                <div className="dashboard-watchlist__meta">{item.note}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
