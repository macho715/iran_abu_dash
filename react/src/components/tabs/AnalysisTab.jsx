import React from "react";
import { Card } from "../ui.jsx";
import { MultiLineChart, Sparkline } from "../charts.jsx";
import TimelinePanel from "../TimelinePanel.jsx";
import HistoryPlayback from "../HistoryPlayback.jsx";
import { HISTORY_MAX_POINTS } from "../../lib/constants.js";

export default function AnalysisTab({
  history,
  derived,
  timeline,
  histH0,
  histH1,
  histH2,
  histDs,
  histEc,
  onClearHistory,
  onClearTimeline,
  onExportTimeline,
  selectedHistoryIndex,
  onSelectHistoryIndex
}) {
  const labels = history.map((point) => point.stateTs || point.ts || "");
  const decisionLogs = (timeline || []).filter((event) => event.category === "DECISION_TRACE");

  return (
    <div className="analysis-layout">
      <Card className="analysis-card">
        <div className="split-header">
          <div>
            <div className="section-title">📈 Hypothesis Trend Graph</div>
            <div className="section-subtitle">최근 {history.length} 포인트 (최대 {HISTORY_MAX_POINTS})</div>
          </div>
          <button className="action-button action-button--muted" onClick={onClearHistory}>Reset history</button>
        </div>
        <div className="section-gap">
          <MultiLineChart
            height={160}
            min={0}
            max={1}
            selectedIndex={selectedHistoryIndex}
            onSelectIndex={onSelectHistoryIndex}
            labels={labels}
            series={[
              { id: "H0", label: "H0", color: "#22c55e", data: histH0 },
              { id: "H1", label: "H1", color: "#f59e0b", data: histH1 },
              { id: "H2", label: "H2", color: "#ef4444", data: histH2 }
            ]}
          />
        </div>
        <div className="analysis-spark-grid section-gap">
          <div>
            <div className="sparkline-header"><span>ΔScore trend</span><span>{derived.ds.toFixed(3)}</span></div>
            <Sparkline data={histDs} min={-0.2} max={0.6} color="#f59e0b" selectedIndex={selectedHistoryIndex} />
          </div>
          <div>
            <div className="sparkline-header"><span>EvidenceConf trend</span><span>{derived.ec.toFixed(3)}</span></div>
            <Sparkline data={histEc} min={0} max={1} color="#22c55e" selectedIndex={selectedHistoryIndex} />
          </div>
        </div>
        <HistoryPlayback history={history} selectedIndex={selectedHistoryIndex} onSelect={onSelectHistoryIndex} />
      </Card>

      <Card className="analysis-card">
        <div className="split-header" style={{ marginBottom: 12 }}>
          <div>
            <div className="section-title">🧾 Decision Trace Review</div>
            <div className="section-subtitle">Simulator에서 저장한 판단 근거 로그 {decisionLogs.length}건</div>
          </div>
        </div>

        {decisionLogs.length ? (
          <div className="stack-list" style={{ marginBottom: 16, maxHeight: 180, overflowY: "auto" }}>
            {decisionLogs.slice(0, 8).map((event) => (
              <div key={event.id} className="nested-panel" style={{ marginBottom: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#e2e8f0" }}>{event.title}</div>
                <div style={{ marginTop: 6, fontSize: 11, color: "#94a3b8", whiteSpace: "pre-wrap" }}>{event.detail}</div>
              </div>
            ))}
          </div>
        ) : null}
        <TimelinePanel timeline={timeline} onClear={onClearTimeline} onExport={onExportTimeline} />
      </Card>
    </div>
  );
}
