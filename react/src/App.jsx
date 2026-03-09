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

  return (
    <div className="dash-container">
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
        liveConnectionStatus={dashboard.liveConnectionStatus}
      />

      <TabBar tabs={dashboard.tabs} activeTab={dashboard.tab} onChange={dashboard.setTab} />

      {dashboard.tab === "overview" && (
        <section role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
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
        </section>
      )}

      {dashboard.tab === "analysis" && (
        <section role="tabpanel" id="panel-analysis" aria-labelledby="tab-analysis">
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
        </section>
      )}

      {dashboard.tab === "intel" && (
        <section role="tabpanel" id="panel-intel" aria-labelledby="tab-intel">
          <IntelTab
            allIntelFeed={dashboard.dash.intelFeed || []}
            filteredIntelFeed={dashboard.filteredIntelFeed}
            intelFilter={dashboard.intelFilter}
            onFilterChange={dashboard.setIntelFilter}
          />
        </section>
      )}

      {dashboard.tab === "indicators" && (
        <section role="tabpanel" id="panel-indicators" aria-labelledby="tab-indicators">
          <IndicatorsTab indicators={dashboard.dash.indicators || []} derived={dashboard.derived} />
        </section>
      )}

      {dashboard.tab === "routes" && (
        <section role="tabpanel" id="panel-routes" aria-labelledby="tab-routes">
          <RoutesTab
            routes={dashboard.dash.routes || []}
            routeGeo={dashboard.dash.routeGeo}
            selectedRouteId={dashboard.selectedRouteId}
            onSelectRouteId={dashboard.setSelectedRouteId}
          />
        </section>
      )}

      {dashboard.tab === "sim" && (
        <section role="tabpanel" id="panel-sim" aria-labelledby="tab-sim">
          <Simulator liveDash={dashboard.dash} onLog={dashboard.logEvent} />
        </section>
      )}

      {dashboard.tab === "checklist" && (
        <section role="tabpanel" id="panel-checklist" aria-labelledby="tab-checklist">
          <ChecklistTab
            checklist={dashboard.dash.checklist || []}
            onToggleChecklist={dashboard.toggleChecklist}
            onResetChecklist={dashboard.resetChecklist}
          />
        </section>
      )}

      <ShortcutsOverlay visible={dashboard.showShortcuts} onClose={() => dashboard.setShowShortcuts(false)} />

      <div className="dashboard-footer">
        {dashboard.loading ? "loading…" : "ready"} · source: {dashboard.derived.liveSource} · sourceHealth: {dashboard.derived.sourceHealthLabel} · conflict_stats: {dashboard.derived.conflictSourceLabel} · lag: {dashboard.lagLabel}
      </div>
    </div>
  );
}
