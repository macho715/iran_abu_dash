import React from "react";
import { formatTimeGST } from "../lib/utils.js";

const LEVEL_COLORS = { ALERT: "#ef4444", WARN: "#f59e0b", INFO: "#22c55e", SYSTEM: "#94a3b8" };

export default function TimelinePanel({ timeline = [], onClear, onExport }) {
  const list = Array.isArray(timeline) ? timeline : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 900 }}>📋 Timeline Events</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClear}
            className="action-button action-button--muted"
          >
            Clear
          </button>
          <button
            onClick={onExport}
            className="action-button"
          >
            Export
          </button>
        </div>
      </div>

      <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {list.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b", padding: 24, textAlign: "center" }}>No timeline events yet.</div>
        ) : (
          list.map((ev, idx) => {
            const color = LEVEL_COLORS[ev.level] || "#94a3b8";
            const ts = ev.ts ? formatTimeGST(ev.ts) : "—";
            return (
              <div
                key={ev.id || idx}
                className="timeline-item"
                style={{ borderLeft: `4px solid ${color}` }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "#64748b" }}>{ts}</span>
                  <span style={{ fontSize: 10, color, fontWeight: 700 }}>[{ev.level}] {ev.category}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, marginTop: 6, color: "#e2e8f0" }}>{ev.title}</div>
                {ev.detail && (
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, whiteSpace: "pre-wrap" }}>{ev.detail}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
