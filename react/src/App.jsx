import React from "react";

import DashboardHeader from "./components/DashboardHeader.jsx";
import Simulator from "./components/Simulator.jsx";
import ShortcutsOverlay from "./components/ShortcutsOverlay.jsx";
import TabBar from "./components/TabBar.jsx";
import AnalysisTab from "./components/tabs/AnalysisTab.jsx";
import ChecklistTab from "./components/tabs/ChecklistTab.jsx";
import IndicatorsTab from "./components/tabs/IndicatorsTab.jsx";
import IntelTab from "./components/tabs/IntelTab.jsx";
import OverviewTab from "./components/tabs/OverviewTab.jsx";
import RoutesTab from "./components/tabs/RoutesTab.jsx";
import { useDashboardData } from "./hooks/useDashboardData.js";

export default function App() {
  const dashboard = useDashboardData();
  const activeTab = dashboard.tabs.find((tab) => tab.id === dashboard.tab);

  let mainContent = null;
  if (dashboard.tab === "overview") {
    mainContent = (
      <OverviewTab
        dash={dashboard.dash}
        derived={dashboard.derived}
        usableRoutes={dashboard.usableRoutes}
        egressLossETA={dashboard.egressLossETA}
        summary={dashboard.summary}
        autoSummary={dashboard.autoSummary}
        onToggleAutoSummary={dashboard.setAutoSummary}
        onGenerateSummary={dashboard.generateSummary}
        onCopySummary={dashboard.copySummary}
        onExportReport={dashboard.exportReport}
      />
    );
  } else if (dashboard.tab === "analysis") {
    mainContent = (
      <AnalysisTab
        history={dashboard.history}
        derived={dashboard.derived}
        timeline={dashboard.timeline}
        histH0={dashboard.histH0}
        histH1={dashboard.histH1}
        histH2={dashboard.histH2}
        histDs={dashboard.histDs}
        histEc={dashboard.histEc}
        onClearHistory={dashboard.clearHistory}
        onClearTimeline={dashboard.clearTimeline}
        onExportTimeline={dashboard.exportTimeline}
        selectedHistoryIndex={dashboard.selectedHistoryIndex}
        onSelectHistoryIndex={dashboard.setSelectedHistoryIndex}
      />
    );
  } else if (dashboard.tab === "intel") {
    mainContent = (
      <IntelTab
        allIntelFeed={dashboard.dash.intelFeed || []}
        filteredIntelFeed={dashboard.filteredIntelFeed}
        intelFilter={dashboard.intelFilter}
        onFilterChange={dashboard.setIntelFilter}
      />
    );
  } else if (dashboard.tab === "indicators") {
    mainContent = (
      <IndicatorsTab indicators={dashboard.dash.indicators || []} derived={dashboard.derived} />
    );
  } else if (dashboard.tab === "routes") {
    mainContent = (
      <RoutesTab
        routes={dashboard.dash.routes || []}
        routeGeo={dashboard.dash.routeGeo}
        selectedRouteId={dashboard.selectedRouteId}
        onSelectRouteId={dashboard.setSelectedRouteId}
      />
    );
  } else if (dashboard.tab === "sim") {
    mainContent = <Simulator liveDash={dashboard.dash} onLog={dashboard.logEvent} />;
  } else if (dashboard.tab === "checklist") {
    mainContent = (
      <ChecklistTab
        checklist={dashboard.dash.checklist || []}
        onToggleChecklist={dashboard.toggleChecklist}
        onResetChecklist={dashboard.resetChecklist}
      />
    );
  }

  return (
    <div className="dash-container dashboard-shell">
      <DashboardHeader
        derived={dashboard.derived}
        error={dashboard.error}
        gstDateTime={dashboard.gstDateTime}
        updateTs={dashboard.updateTs}
        nextEta={dashboard.nextEta}
        fastCountdownSeconds={dashboard.fastCountdownSeconds}
        lagLabel={dashboard.lagLabel}
        onRefresh={() => dashboard.fetchLatestState(true)}
        notifEnabled={dashboard.notifEnabled}
        onToggleNotifications={dashboard.toggleNotifications}
        soundEnabled={dashboard.soundEnabled}
        onToggleSound={dashboard.toggleSound}
        onToggleShortcuts={() => dashboard.setShowShortcuts((prev) => !prev)}
        usingCachedData={dashboard.usingCachedData}
        cachedAt={dashboard.cachedAt}
        isOffline={dashboard.isOffline}
        stateTs={dashboard.dash?.metadata?.stateTs}
        sourceHealthLabel={dashboard.derived.sourceHealthLabel}
      />

      <div className="tab-bar-sticky-wrap">
        <TabBar tabs={dashboard.tabs} activeTab={dashboard.tab} onChange={dashboard.setTab} />
      </div>

      <div className="dashboard-content-grid">
        <main className="dashboard-main">{mainContent}</main>
        <aside className="dashboard-aside">
          <div className="card-shell dashboard-aside-card">
            <div className="section-title">현재 섹션</div>
            <div className="dashboard-aside-value">{activeTab?.icon} {activeTab?.label}</div>
            <div className="microcopy">활성 탭에 맞춰 메인 카드 구성이 동적으로 전환됩니다.</div>
          </div>
          <div className="card-shell dashboard-aside-card">
            <div className="section-title">상태 요약</div>
            <div className="dashboard-aside-kv section-gap-top">
              <span className="pill__label">Source</span>
              <span className="pill__value">{dashboard.derived.liveSource}</span>
            </div>
            <div className="dashboard-aside-kv">
              <span className="pill__label">Health</span>
              <span className="pill__value">{dashboard.derived.sourceHealthLabel}</span>
            </div>
            <div className="dashboard-aside-kv">
              <span className="pill__label">Lag</span>
              <span className="pill__value">{dashboard.lagLabel}</span>
            </div>
          </div>
        </aside>
      </div>

      <ShortcutsOverlay visible={dashboard.showShortcuts} onClose={() => dashboard.setShowShortcuts(false)} />

      <div className="dashboard-footer">
        {dashboard.loading ? "loading…" : "ready"} · source: {dashboard.derived.liveSource} · sourceHealth: {dashboard.derived.sourceHealthLabel} · conflict_stats: {dashboard.derived.conflictSourceLabel} · lag: {dashboard.lagLabel}
      </div>
    </div>
  );
}
