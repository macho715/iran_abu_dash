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

  return (
    <div>
      <Card>
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
        <div className="two-col section-gap">
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

      <Card style={{ marginBottom: 0 }}>
        <TimelinePanel timeline={timeline} onClear={onClearTimeline} onExport={onExportTimeline} />
      </Card>
    </div>
  );
}
