import React from "react";
import { Bar, Card } from "../ui.jsx";
import { formatTimeGST } from "../../lib/utils.js";

export default function IndicatorsTab({ indicators = [], derived }) {
  return (
    <div>
      <Card>
        <div className="section-title">📡 Indicators</div>
        <div className="stack-list section-gap">
          {indicators.map((indicator) => {
            const color = indicator.state >= 0.8 ? "#ef4444" : indicator.state >= 0.4 ? "#f59e0b" : "#22c55e";
            return (
              <div key={indicator.id} className="indicator-card">
                <div className="split-header">
                  <div className="indicator-title-row">
                    <div className="indicator-code" style={{ color }}>{indicator.id}</div>
                    <div>
                      <div className="indicator-name-row">
                        <span className="indicator-name">{indicator.name}</span>
                        <span className="tier-chip">{indicator.tier}</span>
                        <span className="indicator-score" style={{ color }}>{indicator.state.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <span className="priority-label" style={{ color: indicator.cv ? "#22c55e" : "#f59e0b" }}>
                    {indicator.cv ? "✓ 교차검증" : "△ 부분"}
                  </span>
                </div>
                <div className="section-gap"><Bar value={indicator.state} color={color} h={8} /></div>
                <div className="body-copy">{indicator.detail}</div>
                <div className="microcopy section-gap-top">
                  출처: {indicator.src || "n/a"} · 최신: {formatTimeGST(indicator.tsIso)} · 소스 {Math.max(indicator.srcCount || 0, 0)}건
                </div>
              </div>
            );
          })}
        </div>
        <div className="nested-panel section-gap">
          <div className="status-text" style={{ color: derived.evidenceFloorPassed ? "#22c55e" : "#f59e0b" }}>
            {derived.evidenceFloorPassed ? "✅ Evidence Floor PASSED" : "⚠ Evidence Floor not reached"} — TIER0 교차검증: {derived.evidenceFloorT0}건
          </div>
        </div>
      </Card>
    </div>
  );
}
