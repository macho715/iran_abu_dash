import React from "react";

import { formatTimeGST } from "../lib/utils.js";

function statusLabel(cacheStatus) {
  if (cacheStatus === "current") return "최근 분석";
  if (cacheStatus === "stale") return "재분석 필요";
  return "아직 분석 없음";
}

function readFirst(items, fallback) {
  return items?.[0] || fallback;
}

function renderList(items, emptyLabel) {
  if (!items?.length) {
    return <div className="microcopy">{emptyLabel}</div>;
  }

  return (
    <ul className="body-list source-gap-panel__list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export default function SourceGapPanel({
  variant = "compact",
  analysis,
}) {
  const {
    result,
    loading,
    error,
    stale,
    cacheStatus,
    lastUpdatedAt,
    severity,
    refresh,
  } = analysis;

  const contradictions = result?.contradictions || [];
  const missingInfo = result?.missingInfo || [];
  const nextChecks = result?.nextChecks || [];
  const summary = result?.summary || "";
  const isExpanded = variant === "expanded";

  return (
    <div
      className={`source-gap-panel source-gap-panel--${variant} is-${severity || "neutral"}`.trim()}
      aria-live="polite"
    >
      <div className="split-header">
        <div>
          <div className="section-title">🧩 소스 공백·모순 탐지</div>
          <div className="section-subtitle">
            {statusLabel(cacheStatus)}
            {lastUpdatedAt ? ` · last: ${formatTimeGST(lastUpdatedAt)}` : ""}
          </div>
        </div>
        <div className="filter-row">
          {contradictions.length > 0 && (
            <span className="status-chip is-blocked">상충 {contradictions.length}건</span>
          )}
          {missingInfo.length > 0 && (
            <span className="status-chip is-caution">부족 {missingInfo.length}건</span>
          )}
          {stale && <span className="status-chip is-muted">이전 상태 기준</span>}
          <button
            type="button"
            className="action-button"
            disabled={loading}
            onClick={refresh}
          >
            {loading ? "재분석 중..." : "재분석"}
          </button>
        </div>
      </div>

      {summary && (
        <div className="body-copy section-gap-top">{summary}</div>
      )}

      {error && <div className="error-banner section-gap-top">❗ {error}</div>}

      {!result && !loading && !error && (
        <div className="nested-panel section-gap-top">
          <div className="microcopy">아직 분석이 없습니다. 필요할 때 재분석을 실행하세요.</div>
        </div>
      )}

      {result && !isExpanded && (
        <div className="source-gap-panel__compact-grid section-gap-top">
          <div className="source-gap-panel__row">
            <div className="source-gap-panel__label">지금 빠진 정보</div>
            <div className="body-copy">{readFirst(missingInfo, "특이한 공백은 아직 감지되지 않았습니다.")}</div>
          </div>
          <div className="source-gap-panel__row">
            <div className="source-gap-panel__label">충돌 신호</div>
            <div className="body-copy">{readFirst(contradictions, "뚜렷한 상충 신호는 아직 감지되지 않았습니다.")}</div>
          </div>
          <div className="source-gap-panel__row">
            <div className="source-gap-panel__label">우선 확인</div>
            <div className="body-copy">{readFirst(nextChecks, "현재 상태를 계속 모니터링하세요.")}</div>
          </div>
        </div>
      )}

      {result && isExpanded && (
        <div className="source-gap-panel__detail-grid section-gap-top">
          <div className="nested-panel">
            <div className="section-title">지금 빠진 정보</div>
            {renderList(missingInfo, "특이한 공백은 아직 감지되지 않았습니다.")}
          </div>
          <div className="nested-panel">
            <div className="section-title">충돌 신호</div>
            {renderList(contradictions, "뚜렷한 상충 신호는 아직 감지되지 않았습니다.")}
          </div>
          <div className="nested-panel">
            <div className="section-title">우선 확인 항목</div>
            {renderList(nextChecks, "현재 상태를 계속 모니터링하세요.")}
          </div>
        </div>
      )}
    </div>
  );
}
