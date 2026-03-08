import React from "react";

const VARIANT_CONFIGS = {
  loading: {
    defaultTitle: "로딩 중",
    style: {
      background: "rgba(59,130,246,0.08)",
      border: "1px solid rgba(59,130,246,0.25)",
      color: "#93c5fd",
    },
  },
  error: {
    defaultTitle: "오류",
    style: {
      background: "rgba(239,68,68,0.10)",
      border: "1px solid #7f1d1d",
      color: "#fca5a5",
    },
  },
  empty: {
    defaultTitle: "데이터 없음",
    style: {
      background: "rgba(148,163,184,0.10)",
      border: "1px solid rgba(148,163,184,0.30)",
      color: "#cbd5e1",
    },
  },
  "no-fresh": {
    defaultTitle: "신규 시그널 없음",
    style: {
      background: "rgba(234,179,8,0.08)",
      border: "1px solid rgba(234,179,8,0.25)",
      color: "#eab308",
    },
  },
};

export default function TabStatePanel({
  variant,
  title,
  message,
  detail,
  actions,
  className = "",
  style,
  testId,
}) {
  const config = VARIANT_CONFIGS[variant] || VARIANT_CONFIGS.empty;
  const mergedStyle = {
    padding: "8px 12px",
    borderRadius: 6,
    fontSize: 13,
    lineHeight: 1.5,
    ...config.style,
    ...style,
  };

  return (
    <div
      className={`section-gap ${className}`.trim()}
      style={mergedStyle}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? undefined : "polite"}
      data-testid={testId}
    >
      <div style={{ fontWeight: 700 }}>{title || config.defaultTitle}</div>
      {message && <div>{message}</div>}
      {detail && <div className="microcopy section-gap-top">{detail}</div>}
      {actions && <div className="section-gap-top">{actions}</div>}
    </div>
  );
}
