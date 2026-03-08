import React from "react";
import { Bar, Card } from "../ui.jsx";
import { VERSION_HISTORY } from "../../data/hyieLegacyContent.js";

export default function ChecklistTab({ checklist = [], onToggleChecklist, onResetChecklist }) {
  const done = checklist.filter((item) => item.done).length;
  const pct = checklist.length ? done / checklist.length : 0;

  return (
    <div>
      <Card>
        <div className="split-header">
          <div>
            <div className="section-title">✅ Checklist</div>
            <div className="section-subtitle">준비 완료 체크(로컬 저장)</div>
          </div>
          <button className="action-button action-button--muted" onClick={onResetChecklist}>Reset</button>
        </div>
        <div className="section-gap">
          <div className="section-subtitle">{done}/{checklist.length} 완료 ({Math.round(pct * 100)}%)</div>
          <div className="section-gap-top"><Bar value={pct} color={pct === 1 ? "#22c55e" : pct >= 0.5 ? "#f59e0b" : "#ef4444"} h={10} /></div>
        </div>
        <div className="stack-list section-gap">
          {checklist.map((item) => (
            <label key={item.id} className="checklist-row">
              <input type="checkbox" checked={Boolean(item.done)} onChange={() => onToggleChecklist(item.id)} />
              <div className={`checklist-row__text ${item.done ? "is-done" : ""}`}>{item.text}</div>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <div className="section-title section-gap-bottom">📋 Version / Changelog</div>
        <div className="stack-list">
          {VERSION_HISTORY.map((version, index) => (
            <div
              key={`${version.v}-${index}`}
              className="version-row"
              style={{
                background: version.active ? "rgba(124,58,237,0.10)" : "var(--surface-nested)",
                borderColor: version.active ? "#7c3aed" : "var(--border-default)"
              }}
            >
              <div className="version-row__code">{version.v}</div>
              <div className="version-row__body">
                <div className="body-copy">{version.desc}</div>
                <div className="microcopy">{version.change}</div>
              </div>
              {version.active ? <span className="status-chip is-active">ACTIVE</span> : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
