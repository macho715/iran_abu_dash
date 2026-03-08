import React from "react";
import { Pill } from "./ui.jsx";
import { formatDateTimeGST } from "../lib/utils.js";

function staleBannerConfig(severity) {
  if (severity === "CRITICAL") {
    return {
      className: "banner banner--critical",
      icon: "🔴"
    };
  }
  if (severity === "SEVERE") {
    return {
      className: "banner banner--severe",
      icon: "🟠"
    };
  }
  return {
    className: "banner banner--stale",
    icon: "🟡"
  };
}

export default function DashboardHeader({
  derived,
  error,
  gstDateTime,
  updateTs,
  nextEta,
  fastCountdownSeconds,
  lagLabel,
  onRefresh,
  notifEnabled,
  onToggleNotifications,
  soundEnabled,
  onToggleSound,
  onToggleShortcuts,
  usingCachedData,
  cachedAt,
  isOffline
}) {
  const staleConfig = staleBannerConfig(derived.staleSeverity);

  return (
    <>
      {derived.staleSeverity !== "FRESH" && derived.staleSeverity !== "UNKNOWN" && (
        <div className={staleConfig.className}>
          <div>
            <span className="banner__title">
              {staleConfig.icon} 데이터가 {Math.floor((derived.liveLagSeconds || 0) / 60)}분 전입니다
            </span>
            <span className="banner__meta">최신 정보가 아닐 수 있습니다</span>
          </div>
          <button className="action-button" onClick={onRefresh}>Refresh Now</button>
        </div>
      )}

      {(usingCachedData || isOffline) && (
        <div className="banner banner--offline">
          <div>
            <span className="banner__title">OFFLINE</span>
            <span className="banner__meta">
              {usingCachedData && cachedAt
                ? `cached data from ${formatDateTimeGST(cachedAt)}`
                : "network unavailable"}
            </span>
          </div>
          <button className="action-button" onClick={onRefresh}>Retry</button>
        </div>
      )}

      <div className="dash-header">
        <div className="dash-header__row">
          <div>
            <div className="dash-header__title">HYIE ERC² Dashboard</div>
            <div className="dash-header__meta">
              GST: {gstDateTime} · last fetch: {updateTs} · next in: {Math.floor(nextEta / 60)}:{String(nextEta % 60).padStart(2, "0")} (fast)
            </div>
            <div className={`dash-header__sub ${derived.liveStale ? "is-stale" : ""}`}>
              latest poll every {fastCountdownSeconds}s · live lag: {lagLabel} · {derived.liveStale ? "STALE" : "fresh"}
            </div>
          </div>
          <div className="header-actions">
            <Pill label="MODE" value={derived.modeState} color={derived.modeColor} />
            <Pill
              label="Gate"
              value={derived.gateState}
              color={derived.gateState === "BLOCKED" ? "#ef4444" : derived.gateState === "CAUTION" ? "#f59e0b" : "#22c55e"}
            />
            <Pill
              label="I02"
              value={`${derived.airspaceState}/${derived.airspaceSegment}`}
              color={derived.airspaceState === "OPEN" ? "#22c55e" : derived.airspaceState === "DISRUPTED" ? "#f59e0b" : "#ef4444"}
            />
            <button className="action-button" onClick={onRefresh}>🔄 Refresh</button>
            <button className={`action-button ${notifEnabled ? "is-active" : ""}`} onClick={onToggleNotifications}>
              {notifEnabled ? "🔔 Alerts On" : "🔕 Alerts Off"}
            </button>
            <button className={`action-button ${soundEnabled ? "is-active" : ""}`} onClick={onToggleSound}>
              {soundEnabled ? "🔊 Sound On" : "🔇 Sound Off"}
            </button>
            <button className="action-button action-button--muted" onClick={onToggleShortcuts}>? Shortcuts</button>
          </div>
        </div>
        {error && <div className="error-banner">❗ {error}</div>}
      </div>
    </>
  );
}
