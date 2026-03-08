import React from "react";
import { formatTimeGST } from "../lib/utils.js";

function diffTone(changed) {
  return changed
    ? { borderColor: "#60a5fa", background: "rgba(96,165,250,0.10)" }
    : { borderColor: "#1e293b", background: "#0b1220" };
}

export default function HistoryPlayback({ history = [], selectedIndex = 0, onSelect }) {
  if (!history.length) return null;
  const clampedIndex = Math.max(0, Math.min(history.length - 1, selectedIndex));
  const selected = history[clampedIndex];
  const current = history[history.length - 1];

  const fields = [
    { label: "MODE", current: current.mode, selected: selected.mode },
    { label: "Gate", current: current.gate, selected: selected.gate },
    { label: "Air", current: current.air, selected: selected.air },
    { label: "Evidence", current: current.ev, selected: selected.ev },
    { label: "ΔScore", current: Number(current.ds || 0).toFixed(3), selected: Number(selected.ds || 0).toFixed(3) },
    { label: "Conf", current: Number(current.ec || 0).toFixed(3), selected: Number(selected.ec || 0).toFixed(3) }
  ];

  return (
    <div className="history-playback">
      <div className="history-playback__header">
        <div>
          <div className="section-title">🕰 History Playback</div>
          <div className="section-subtitle">
            selected: {formatTimeGST(selected.stateTs || selected.ts)} · current: {formatTimeGST(current.stateTs || current.ts)}
          </div>
        </div>
        <div className="history-playback__meta">
          {clampedIndex + 1}/{history.length}
        </div>
      </div>
      <input
        type="range"
        min="0"
        max={Math.max(0, history.length - 1)}
        step="1"
        value={clampedIndex}
        onChange={(event) => onSelect(Number(event.target.value))}
        className="playback-slider"
      />
      <div className="playback-diff-grid">
        {fields.map((field) => {
          const changed = field.current !== field.selected;
          const tone = diffTone(changed);
          return (
            <div
              key={field.label}
              className="playback-card"
              style={{ borderColor: tone.borderColor, background: tone.background }}
            >
              <div className="playback-card__label">{field.label}</div>
              <div className="playback-card__value">{field.selected}</div>
              <div className="playback-card__meta">now: {field.current}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
