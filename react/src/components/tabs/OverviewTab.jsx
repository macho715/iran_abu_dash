import React from "react";
import { Card, Gauge } from "../ui.jsx";
import SourceGapPanel from "../SourceGapPanel.jsx";
import { KEY_ASSUMPTIONS } from "../../data/hyieLegacyContent.js";
import { formatTimeGST } from "../../lib/utils.js";
import { getAssumptionTheme, getIntelPriorityTheme, getLikelihoodTheme } from "../../lib/statusTheme.js";

function stat(value, suffix = "") {
  return Number.isFinite(Number(value)) ? `${Number(value)}${suffix}` : "n/a";
}

export default function OverviewTab({
  dash,
  derived,
  usableRoutes,
  egressLossETA,
  autoSummary,
  onToggleAutoSummary,
  summary,
  onGenerateSummary,
  onCopySummary,
  onExportReport,
  sourceGapAnalysis,
}) {
  return (
    <div>
      <Card>
        <SourceGapPanel variant="compact" analysis={sourceGapAnalysis} />
      </Card>

      <Card>
        <div className="gauge-grid">
          <Gauge value={Math.min(1, Math.max(0, derived.ec))} label="EvidenceConf" sub={`thr=${derived.effectiveThreshold.toFixed(2)}`} />
          <Gauge value={Math.min(1, Math.max(0, (derived.ds + 0.2) / 0.8))} label="ΔScore" sub={`raw=${derived.ds.toFixed(3)}`} />
          <Gauge value={derived.urgencyScore} label="Urgency" sub={`egress=${Number(egressLossETA).toFixed(2)}h`} />
        </div>

        <div className="two-col section-gap">
          <div className="nested-panel">
            <div className="section-title">Likelihood</div>
            <div
              className={`big-stat ${getLikelihoodTheme(derived.likelihoodLabel).className}`}
            >
              {derived.likelihoodLabel}
            </div>
            <div className="section-subtitle">{derived.likelihoodBand}</div>
            <div className="microcopy section-gap-top">{derived.likelihoodBasis}</div>
          </div>

          <div className="nested-panel">
            <div className="section-title">Top routes (usable)</div>
            <div className="microcopy">effective = base × (1+cong) × buffer</div>
            <div className="stack-list section-gap-top">
              {usableRoutes.slice(0, 3).map((route) => (
                <div key={route.id} className="route-summary-row">
                  <div>
                    <div className="route-summary-row__title">Route {route.id}</div>
                    <div className="section-subtitle">{route.name}</div>
                  </div>
                  <div className="route-summary-row__value">{route.eff.toFixed(1)}h</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="section-title">Conflict Stats</div>
        <div className="stat-grid section-gap">
          <div className="metric-card">
            <div className="metric-card__label">Missiles</div>
            <div className="metric-card__value">{stat(derived.conflictStats.missiles_total)}</div>
            <div className="metric-card__meta">intercepted: {stat(derived.conflictStats.missiles_intercepted)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__label">Drones</div>
            <div className="metric-card__value">{stat(derived.conflictStats.drones_total)}</div>
            <div className="metric-card__meta">destroyed: {stat(derived.conflictStats.drones_destroyed)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__label">Casualties</div>
            <div className="metric-card__value">{stat(derived.conflictStats.casualties_kia)} KIA</div>
            <div className="metric-card__meta">{stat(derived.conflictStats.casualties_wia)} WIA</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__label">Duration / Source</div>
            <div className="metric-card__value">{derived.conflictDayLabel}</div>
            <div className="metric-card__meta">{derived.conflictStats.conflict_start_date || "n/a"} · {derived.conflictSourceLabel}</div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="section-title section-gap-bottom">⚙️ Key Assumptions</div>
        <div className="assumption-grid">
          {KEY_ASSUMPTIONS.map((item) => (
            <div
              key={item.id}
              className={`assumption-card ${getAssumptionTheme(item.status).className}`}
            >
              <div className="assumption-card__header">
                <span className="assumption-card__id">{item.id}</span>
                <span className="assumption-card__text">{item.text}</span>
              </div>
              <div className="assumption-card__meta">실패 시: {item.fail}</div>
              <div className="assumption-card__verified">검증: {item.verified}</div>
            </div>
          ))}
        </div>
      </Card>

      {dash.aiAnalysis && (
        <Card>
          <div className="split-header">
            <div>
              <div className="section-title">🧠 NotebookLM AI Analysis</div>
              <div className="section-subtitle">
                source: {dash.aiAnalysis.analysis_source || "—"} · {dash.aiAnalysis.updated_at ? formatTimeGST(dash.aiAnalysis.updated_at) : "—"}
              </div>
            </div>
            <div className="filter-row">
              {dash.aiAnalysis.threat_level && (
                <span
                  className={`status-chip ${getIntelPriorityTheme(dash.aiAnalysis.threat_level).className}`}
                >
                  {dash.aiAnalysis.threat_level}
                </span>
              )}
              {dash.aiAnalysis.sentiment && <span className="status-chip is-muted">{dash.aiAnalysis.sentiment}</span>}
            </div>
          </div>
          <div className="nested-panel section-gap">
            {dash.aiAnalysis.summary && <div className="body-copy">{dash.aiAnalysis.summary}</div>}
            {dash.aiAnalysis.recommended_action && (
              <div className="warning-copy section-gap-top">권고: {dash.aiAnalysis.recommended_action}</div>
            )}
            {dash.aiAnalysis.key_points?.length > 0 && (
              <ul className="body-list">
                {dash.aiAnalysis.key_points.map((point, index) => <li key={index}>{point}</li>)}
              </ul>
            )}
          </div>
        </Card>
      )}

      <Card>
        <div className="split-header">
          <div>
            <div className="section-title">🤖 AI-ish Situation Summary</div>
            <div className="section-subtitle">룰 기반 요약과 텍스트 보고서 export를 제공합니다.</div>
          </div>
          <div className="header-actions">
            <label className="toggle-row">
              <input type="checkbox" checked={autoSummary} onChange={(event) => onToggleAutoSummary(event.target.checked)} /> auto summary
            </label>
            <button className="action-button" onClick={onGenerateSummary}>Generate</button>
            <button className="action-button" onClick={onCopySummary}>Copy</button>
            <button className="action-button" onClick={onExportReport}>Export TXT</button>
          </div>
        </div>
        <div className="nested-panel section-gap">
          <div className="section-subtitle">{summary.ts ? `last: ${formatTimeGST(summary.ts)} · mode=${summary.mode}` : "no summary yet"}</div>
          <div className="body-copy section-gap-top">{summary.text || "—"}</div>
        </div>
      </Card>
    </div>
  );
}
