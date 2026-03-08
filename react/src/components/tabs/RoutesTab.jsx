import React from "react";
import { ROUTE_BUFFER_FACTOR } from "../../lib/constants.js";
import { getRouteEffectiveHours, hasExplicitRouteEffectiveHours } from "../../lib/utils.js";
import RouteMapLeaflet from "../RouteMapLeaflet.jsx";

function normalizeNewsRef(ref, index) {
  if (typeof ref === "string") {
    const label = ref.trim();
    if (!label) return null;
    return { id: `ref-${index}`, label, url: "" };
  }
  if (!ref || typeof ref !== "object") return null;
  const title = String(ref.title || ref.text || ref.name || ref.label || "").trim();
  const url = String(ref.url || ref.link || "").trim();
  const label = title || url || `ref-${index + 1}`;
  return { id: `ref-${index}`, label, url: /^https?:\/\//i.test(url) ? url : "" };
}

export default function RoutesTab({ routes = [], routeGeo, selectedRouteId, onSelectRouteId }) {
  return (
    <div>
      <div className="route-layout">
        <div>
          <div className="route-sticky-card">
            <RouteMapLeaflet
              routes={routes}
              routeGeo={routeGeo}
              selectedId={selectedRouteId}
              onSelect={(routeId) => onSelectRouteId((prev) => (prev === routeId ? null : routeId))}
            />
            {selectedRouteId && (
              <div className="nested-panel section-gap">
                <div className="section-title">Selected Route: {selectedRouteId}</div>
                <div className="section-subtitle">아래 카드에서 해당 Route가 하이라이트됩니다.</div>
              </div>
            )}
          </div>
        </div>
        <div className="stack-list">
          {routes.map((route) => {
            const eff = getRouteEffectiveHours(route);
            const hasExplicitEff = hasExplicitRouteEffectiveHours(route);
            const isBlocked = route.status === "BLOCKED";
            const isCaution = route.status === "CAUTION";
            const borderColor = selectedRouteId === route.id ? "#3b82f6" : (isBlocked ? "#7f1d1d" : isCaution ? "#92400e" : "#1e293b");
            const badgeBg = isBlocked ? "#7f1d1d" : isCaution ? "#92400e" : "#14532d";
            const statusColor = isBlocked ? "#f87171" : isCaution ? "#f59e0b" : "#22c55e";
            const refs = (Array.isArray(route.newsRefs) ? route.newsRefs : []).map(normalizeNewsRef).filter(Boolean);
            return (
              <div
                key={route.id}
                className="route-card"
                style={{ borderColor, opacity: isBlocked ? 0.82 : 1 }}
              >
                <div className="split-header">
                  <div className="route-card__header">
                    <span className="route-card__badge" style={{ background: badgeBg }}>{route.id}</span>
                    <div>
                      <div className="section-title">{route.name}</div>
                      <div className="route-card__status-row">
                        <span className="priority-label" style={{ color: statusColor }}>{route.status}</span>
                        {isBlocked && <span className="status-chip" style={{ background: "#7f1d1d", color: "#fca5a5" }}>⛔ 사용금지</span>}
                      </div>
                    </div>
                  </div>
                  <div className="route-card__eta">
                    <div className="route-card__eta-value">{isBlocked || !Number.isFinite(eff) ? "—" : `${eff.toFixed(1)}h`}</div>
                    <div className="microcopy">
                      {isBlocked ? "차단" : hasExplicitEff ? "backend effective_h" : `effective (buffer x${ROUTE_BUFFER_FACTOR})`}
                    </div>
                  </div>
                </div>
                <div className="route-card__metrics">
                  <div className="metric-card">
                    <div className="metric-card__label">Base</div>
                    <div className="metric-card__value">{route.base_h}h</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-card__label">Congestion</div>
                    <div
                      className="metric-card__value"
                      style={{
                        color: (route.cong ?? route.congestion ?? 0) > 0.5
                          ? "#f87171"
                          : (route.cong ?? route.congestion ?? 0) > 0.3
                            ? "#f59e0b"
                            : "#22c55e"
                      }}
                    >
                      {(route.cong ?? route.congestion ?? 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-card__label">Status</div>
                    <div className="metric-card__value" style={{ color: statusColor }}>{route.status}</div>
                  </div>
                </div>
                {route.note && <div className="body-copy section-gap-top">{route.note}</div>}
                {refs.length > 0 && (
                  <div className="nested-panel section-gap">
                    <div className="split-header">
                      <div className="section-subtitle">Related refs</div>
                      <div className="microcopy">{refs.length} items</div>
                    </div>
                    <div className="stack-list section-gap-top">
                      {refs.map((ref) => (
                        ref.url
                          ? <a key={ref.id} href={ref.url} target="_blank" rel="noreferrer" className="link-plain">{ref.label}</a>
                          : <div key={ref.id} className="body-copy">{ref.label}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
