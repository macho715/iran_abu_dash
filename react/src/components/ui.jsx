import React from "react";

export function Card({ children, style, className = "" }) {
  return (
    <div className={`card-shell ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

export function Pill({ label, value, color = "#94a3b8", className = "" }) {
  return (
    <div className={`pill ${className}`.trim()}>
      <div className="pill__label">{label}</div>
      <div className="pill__value" style={{ color }}>{value}</div>
    </div>
  );
}

export function Bar({ value = 0, color = "#22c55e", h = 8, className = "" }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  return (
    <div className={`bar-track ${className}`.trim()} style={{ height: h }}>
      <div style={{ width: `${v * 100}%`, height: "100%", background: color }} />
    </div>
  );
}

export function Gauge({ value = 0, label = "", sub = "" }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const gaugeColor = v >= 0.8 ? "#ef4444" : v >= 0.4 ? "#f59e0b" : "#22c55e";
  const cx = 45, cy = 52, r = 28;
  const a = v * 180;
  const rad = (deg) => (deg * Math.PI) / 180;
  const ea = 180 - a;
  const x2 = cx + r * Math.cos(rad(ea));
  const y2 = cy - r * Math.sin(rad(ea));

  return (
    <div style={{ textAlign: "center" }}>
      <svg width={90} height={65} viewBox="0 0 90 65">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#1e293b" strokeWidth={5} strokeLinecap="round" />
        {v > 0 && (
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${a > 180 ? 1 : 0} 1 ${x2} ${y2}`} fill="none" stroke={gaugeColor} strokeWidth={5} strokeLinecap="round" />
        )}
        <text x={cx} y={cy - 8} textAnchor="middle" fill={gaugeColor} fontSize={16} fontWeight={800} fontFamily="monospace">{v.toFixed(3)}</text>
        <text x={cx} y={cy + 6} textAnchor="middle" fill="#94a3b8" fontSize={9}>{label}</text>
      </svg>
      {sub && <div style={{ fontSize: 10, color: "#64748b", marginTop: -4 }}>{sub}</div>}
    </div>
  );
}
