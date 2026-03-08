import React, { useMemo } from "react";
import { Card } from "../ui.jsx";
import { formatTimeGST } from "../../lib/utils.js";

const FILTERS = ["ALL", "CRITICAL", "HIGH", "MEDIUM"];

function staleDurationLabel(firstSeenTs) {
  if (!firstSeenTs) return null;
  try {
    const first = new Date(firstSeenTs);
    if (Number.isNaN(first.getTime())) return null;
    const hours = Math.floor((Date.now() - first.getTime()) / 3600000);
    if (hours < 1) return null;
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  } catch {
    return null;
  }
}

export default function IntelTab({ allIntelFeed = [], filteredIntelFeed = [], intelFilter, onFilterChange }) {
  const freshCount = useMemo(
    () => allIntelFeed.filter((item) => item.status === "fresh" || item.status === "official").length,
    [allIntelFeed]
  );
  const allRepeated = allIntelFeed.length > 0 && freshCount === 0;

  return (
    <div>
      <Card>
        <div className="section-title">🔴 Intel Feed</div>
        <div className="section-subtitle">최신순</div>

        {allRepeated && (
          <div
            className="section-gap"
            style={{
              padding: "8px 12px",
              background: "rgba(234,179,8,0.08)",
              border: "1px solid rgba(234,179,8,0.25)",
              borderRadius: 6,
              color: "#eab308",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            신규 시그널 없음 — 기존 모니터링 결과를 표시 중입니다
          </div>
        )}

        <div className="filter-row section-gap">
          {FILTERS.map((filter) => {
            const count = filter === "ALL"
              ? allIntelFeed.length
              : allIntelFeed.filter((item) => item.priority === filter).length;
            return (
              <button
                key={filter}
                className={`filter-button ${intelFilter === filter ? "is-active" : ""}`}
                onClick={() => onFilterChange(filter)}
              >
                {filter} ({count})
              </button>
            );
          })}
        </div>
        <div className="stack-list section-gap">
          {filteredIntelFeed.map((item) => {
            const isRepeated = item.status === "repeated";
            const staleLabel = isRepeated ? staleDurationLabel(item.firstSeenTs) : null;

            return (
              <div
                key={item.id}
                className="intel-card"
                style={{
                  borderLeft: item.priority === "CRITICAL" ? "3px solid #ef4444" : "1px solid var(--border-default)",
                  opacity: isRepeated ? 0.7 : 1,
                }}
              >
                <div className="split-header">
                  <div className="section-subtitle">{formatTimeGST(item.tsIso)}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isRepeated && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 5px",
                          borderRadius: 3,
                          background: "rgba(148,163,184,0.15)",
                          color: "#94a3b8",
                        }}
                      >
                        변동없음{staleLabel ? ` ${staleLabel}` : ""}
                      </span>
                    )}
                    <div
                      className="priority-label"
                      style={{
                        color: item.priority === "CRITICAL" ? "#ef4444" : item.priority === "HIGH" ? "#f59e0b" : "#94a3b8"
                      }}
                    >
                      {item.priority}
                    </div>
                  </div>
                </div>
                <div className="body-copy section-gap-top">{item.text}</div>
                <div className="microcopy section-gap-top">sources: {item.sources || "n/a"}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
