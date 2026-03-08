import React, { useState } from "react";

function clampToRange(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function nearestIndex(event, width, count) {
  if (count < 2) return 0;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * width;
  return Math.max(0, Math.min(count - 1, Math.round((x / width) * (count - 1))));
}

function tooltipX(x, width) {
  return Math.max(10, Math.min(width - 118, x + 8));
}

export function Sparkline({ data = [], min = 0, max = 1, color = "#60a5fa", height = 44, selectedIndex = null, label = "", valueFormatter = (value) => Number(value ?? 0).toFixed(3) }) {
  const width = 220;
  const n = Array.isArray(data) ? data.length : 0;
  const [hoverIndex, setHoverIndex] = useState(null);

  if (n < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height }}>
        <rect x="0" y="0" width={width} height={height} rx="10" fill="#0b1220" stroke="#1e293b" />
        <text x={width / 2} y={height / 2 + 4} textAnchor="middle" fill="#475569" fontSize="11">no data</text>
      </svg>
    );
  }

  const span = (max - min) || 1;
  const xs = Array.from({ length: n }, (_, i) => (i / (n - 1)) * width);
  const ys = xs.map((_, i) => {
    const v = Number(data[i] ?? 0);
    const vv = Number.isFinite(v) ? clampToRange(v, min, max) : 0;
    return height - ((vv - min) / span) * height;
  });
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${ys[i].toFixed(2)}`).join(" ");
  const activeIndex = hoverIndex ?? (Number.isInteger(selectedIndex) ? selectedIndex : null);
  const activeX = activeIndex != null ? xs[activeIndex] : null;
  const activeY = activeIndex != null ? ys[activeIndex] : null;
  const activeValue = activeIndex != null ? data[activeIndex] : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height }}
      onMouseMove={(event) => setHoverIndex(nearestIndex(event, width, n))}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <rect x="0" y="0" width={width} height={height} rx="10" fill="#0b1220" stroke="#1e293b" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" opacity="0.95" />
      {activeIndex != null && activeX != null && activeY != null && (
        <g>
          <line x1={activeX} x2={activeX} y1={0} y2={height} stroke="#334155" strokeDasharray="4 4" />
          <circle cx={activeX} cy={activeY} r="3.6" fill={color} stroke="#0b1220" strokeWidth="2" />
          <g transform={`translate(${tooltipX(activeX, width)}, 8)`}>
            <rect width="108" height="30" rx="8" fill="#020617" stroke="#334155" />
            <text x="8" y="13" fill="#94a3b8" fontSize="9">{label || "value"}</text>
            <text x="8" y="24" fill="#e2e8f0" fontSize="11" fontWeight="700">{valueFormatter(activeValue)}</text>
          </g>
        </g>
      )}
    </svg>
  );
}

export function MultiLineChart({ series = [], min = 0, max = 1, height = 160, selectedIndex = null, onSelectIndex, labels = [] }) {
  const width = 560;
  const n = Math.max(0, ...(series.map((s) => (Array.isArray(s.data) ? s.data.length : 0))));
  const [hoverIndex, setHoverIndex] = useState(null);

  if (n < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height }}>
        <rect x="0" y="0" width={width} height={height} rx="12" fill="#0b1220" stroke="#1e293b" />
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="#475569" fontSize="11">no history yet</text>
      </svg>
    );
  }

  const span = (max - min) || 1;
  const xs = Array.from({ length: n }, (_, i) => (i / (n - 1)) * width);
  const gridY = [0.25, 0.5, 0.75].map((p) => height - p * height);
  const activeIndex = hoverIndex ?? (Number.isInteger(selectedIndex) ? selectedIndex : null);
  const activeX = activeIndex != null ? xs[activeIndex] : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height }}
      onMouseMove={(event) => setHoverIndex(nearestIndex(event, width, n))}
      onMouseLeave={() => setHoverIndex(null)}
      onClick={(event) => {
        if (!onSelectIndex) return;
        onSelectIndex(nearestIndex(event, width, n));
      }}
    >
      <rect x="0" y="0" width={width} height={height} rx="12" fill="#0b1220" stroke="#1e293b" />
      {gridY.map((y, i) => (
        <line key={i} x1="0" x2={width} y1={y} y2={y} stroke="#111827" strokeWidth="1" />
      ))}
      {activeX != null && (
        <line x1={activeX} x2={activeX} y1={0} y2={height} stroke="#60a5fa" strokeDasharray="4 4" />
      )}
      {series.map((s, si) => {
        const data = Array.isArray(s.data) ? s.data : [];
        const ys = xs.map((_, i) => {
          const v = Number(data[i] ?? 0);
          const vv = Number.isFinite(v) ? clampToRange(v, min, max) : 0;
          return height - ((vv - min) / span) * height;
        });
        const path = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${ys[i].toFixed(2)}`).join(" ");
        const lastX = xs[xs.length - 1];
        const lastY = ys[ys.length - 1];
        return (
          <g key={si}>
            <path d={path} fill="none" stroke={s.color || "#60a5fa"} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" opacity="0.95" />
            <circle cx={lastX} cy={lastY} r="3.6" fill={s.color || "#60a5fa"} />
            {activeIndex != null && (
              <circle cx={xs[activeIndex]} cy={ys[activeIndex]} r="4.2" fill={s.color || "#60a5fa"} stroke="#020617" strokeWidth="2" />
            )}
          </g>
        );
      })}
      {activeIndex != null && activeX != null && (
        <g transform={`translate(${tooltipX(activeX, width)}, 8)`}>
          <rect width="108" height={18 + series.length * 14} rx="8" fill="#020617" stroke="#334155" />
          <text x="8" y="13" fill="#94a3b8" fontSize="9">{labels[activeIndex] || `point ${activeIndex + 1}`}</text>
          {series.map((item, index) => (
            <text key={item.id || index} x="8" y={28 + index * 14} fill={item.color || "#60a5fa"} fontSize="10">
              {item.label || item.id}: {Number(item.data?.[activeIndex] ?? 0).toFixed(3)}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}
