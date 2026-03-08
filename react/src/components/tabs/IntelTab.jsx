import React from "react";
import { Card } from "../ui.jsx";
import { formatTimeGST } from "../../lib/utils.js";

const FILTERS = ["ALL", "CRITICAL", "HIGH", "MEDIUM"];

export default function IntelTab({ allIntelFeed = [], filteredIntelFeed = [], intelFilter, onFilterChange }) {
  return (
    <div>
      <Card>
        <div className="section-title">🔴 Intel Feed</div>
        <div className="section-subtitle">최신순</div>
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
          {filteredIntelFeed.map((item) => (
            <div
              key={item.id}
              className="intel-card"
              style={{
                borderLeft: item.priority === "CRITICAL" ? "3px solid #ef4444" : "1px solid var(--border-default)"
              }}
            >
              <div className="split-header">
                <div className="section-subtitle">{formatTimeGST(item.tsIso)}</div>
                <div
                  className="priority-label"
                  style={{
                    color: item.priority === "CRITICAL" ? "#ef4444" : item.priority === "HIGH" ? "#f59e0b" : "#94a3b8"
                  }}
                >
                  {item.priority}
                </div>
              </div>
              <div className="body-copy section-gap-top">{item.text}</div>
              <div className="microcopy section-gap-top">sources: {item.sources || "n/a"}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
