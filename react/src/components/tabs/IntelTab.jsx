import React, { useMemo } from "react";
import TabStatePanel from "../TabStatePanel.jsx";
import { Card } from "../ui.jsx";
import { countIntelStatuses } from "../../lib/intelStatus.js";
import { formatTimeGST } from "../../lib/utils.js";
import { getIntelPriorityTheme, getRepeatedTheme } from "../../lib/statusTheme.js";

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
  const statusSummary = useMemo(() => countIntelStatuses(allIntelFeed), [allIntelFeed]);
  const allRepeated = allIntelFeed.length > 0 && statusSummary.repeatedCount === allIntelFeed.length;

  return (
    <div>
      <Card>
        <div className="section-title">🔴 Intel Feed</div>
        <div className="section-subtitle">최신순</div>

        {allRepeated && (
          <TabStatePanel
            variant="no-fresh"
            message="반복 감지(repeated) 항목만 표시 중입니다."
            detail={`반복(repeated): ${statusSummary.repeatedCount}`}
          />
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
            const priorityTheme = getIntelPriorityTheme(item.priority);
            const repeatedTheme = getRepeatedTheme();

            return (
              <div
                key={item.id}
                className={`intel-card ${priorityTheme.className} ${isRepeated ? repeatedTheme.className : ""}`.trim()}
              >
                <div className="split-header">
                  <div className="section-subtitle">{formatTimeGST(item.tsIso)}</div>
                  <div className="inline-row">
                    {isRepeated && (
                      <span className="status-tag is-repeated">
                        변동없음{staleLabel ? ` ${staleLabel}` : ""}
                      </span>
                    )}
                    <div className={`priority-label ${priorityTheme.className}`}>
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
