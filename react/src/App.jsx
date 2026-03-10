import React from "react";

import AskAiPanel from "./components/AskAiPanel.jsx";
import DashboardAside from "./components/DashboardAside.jsx";
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
import { useSourceGapAnalysis } from "./hooks/useSourceGapAnalysis.js";

export default function App() {
  const dashboard = useDashboardData();
  const [showAskAi, setShowAskAi] = React.useState(false);
  const sourceGapAnalysis = useSourceGapAnalysis({
    dash: dashboard.dash,
    derived: dashboard.derived,
    usableRoutes: dashboard.usableRoutes,
    summary: dashboard.summary,
  });
  let tabContent = null;

  if (dashboard.tab === "overview") {
    tabContent = (
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
        sourceGapAnalysis={sourceGapAnalysis}
      />
    );
  } else if (dashboard.tab === "analysis") {
    tabContent = (
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
    tabContent = (
      <IntelTab
        allIntelFeed={dashboard.dash.intelFeed || []}
        filteredIntelFeed={dashboard.filteredIntelFeed}
        intelFilter={dashboard.intelFilter}
        onFilterChange={dashboard.setIntelFilter}
      />
    );
  } else if (dashboard.tab === "indicators") {
    tabContent = (
      <IndicatorsTab
        indicators={dashboard.dash.indicators || []}
        derived={dashboard.derived}
        sourceGapAnalysis={sourceGapAnalysis}
      />
    );
  } else if (dashboard.tab === "routes") {
    tabContent = (
      <RoutesTab
        routes={dashboard.dash.routes || []}
        routeGeo={dashboard.dash.routeGeo}
        selectedRouteId={dashboard.selectedRouteId}
        onSelectRouteId={dashboard.setSelectedRouteId}
      />
    );
  } else if (dashboard.tab === "sim") {
    tabContent = <Simulator liveDash={dashboard.dash} onLog={dashboard.logEvent} />;
  } else if (dashboard.tab === "checklist") {
    tabContent = (
      <ChecklistTab
        checklist={dashboard.dash.checklist || []}
        onToggleChecklist={dashboard.toggleChecklist}
        onResetChecklist={dashboard.resetChecklist}
      />
    );
  }

  return (
    <div className="dash-container">
      <div className="dashboard-shell">
        <header className="dashboard-shell__header">
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
            onOpenAskAi={() => setShowAskAi(true)}
            onToggleShortcuts={() => dashboard.setShowShortcuts((prev) => !prev)}
            usingCachedData={dashboard.usingCachedData}
            cachedAt={dashboard.cachedAt}
            isOffline={dashboard.isOffline}
            stateTs={dashboard.dash?.metadata?.stateTs}
            sourceHealthLabel={dashboard.derived.sourceHealthLabel}
            liveConnectionStatus={dashboard.liveConnectionStatus}
          />
        </header>

        <div className="dashboard-shell__tabs">
          <TabBar tabs={dashboard.tabs} activeTab={dashboard.tab} onChange={dashboard.setTab} />
        </div>

        <div className="dashboard-content">
          <main className="dashboard-main">
            <section
              className={`dashboard-tab-panel dashboard-tab-panel--${dashboard.tab}`}
              role="tabpanel"
              id={`panel-${dashboard.tab}`}
              aria-labelledby={`tab-${dashboard.tab}`}
            >
              {tabContent}
            </section>
          </main>

          <aside className="dashboard-aside">
            <DashboardAside
              tabs={dashboard.tabs}
              activeTab={dashboard.tab}
              dash={dashboard.dash}
              derived={dashboard.derived}
              usableRoutes={dashboard.usableRoutes}
              timeline={dashboard.timeline}
              history={dashboard.history}
              selectedHistoryIndex={dashboard.selectedHistoryIndex}
              intelFilter={dashboard.intelFilter}
              filteredIntelFeed={dashboard.filteredIntelFeed}
              summary={dashboard.summary}
              selectedRouteId={dashboard.selectedRouteId}
            />
          </aside>
        </div>

        <div className="dashboard-footer">
          {dashboard.loading ? "loading…" : "ready"} · source: {dashboard.derived.liveSource} · sourceHealth: {dashboard.derived.sourceHealthLabel} · conflict_stats: {dashboard.derived.conflictSourceLabel} · lag: {dashboard.lagLabel}
        </div>
      </div>

      <ShortcutsOverlay visible={dashboard.showShortcuts} onClose={() => dashboard.setShowShortcuts(false)} />
      <AskAiPanel
        visible={showAskAi}
        onClose={() => setShowAskAi(false)}
        dash={dashboard.dash}
        derived={dashboard.derived}
        usableRoutes={dashboard.usableRoutes}
        summary={dashboard.summary}
        activeTab={dashboard.tab}
      />
    </div>
  );
}
