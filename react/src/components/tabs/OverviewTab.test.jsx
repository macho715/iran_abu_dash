import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { deriveState } from "../../lib/deriveState.js";
import { createDashboard } from "../../test/fixtures.js";
import OverviewTab from "./OverviewTab.jsx";

describe("OverviewTab", () => {
  it("renders the source gap compact card at the top", () => {
    const dash = createDashboard();
    const derived = deriveState(dash);
    const usableRoutes = dash.routes.map((route) => ({ ...route, eff: route.base_h * (1 + route.cong) * 1.15 }));

    render(
      <OverviewTab
        dash={dash}
        derived={derived}
        usableRoutes={usableRoutes}
        egressLossETA={8}
        autoSummary={false}
        onToggleAutoSummary={vi.fn()}
        summary={{ text: "룰 기반 요약", ts: "2026-03-06T10:00:00Z", mode: "OFFLINE" }}
        onGenerateSummary={vi.fn()}
        onCopySummary={vi.fn()}
        onExportReport={vi.fn()}
        sourceGapAnalysis={{
          result: {
            summary: "요약",
            missingInfo: ["공백 1"],
            contradictions: [],
            nextChecks: ["확인 1"],
          },
          loading: false,
          error: "",
          stale: false,
          cacheStatus: "current",
          lastUpdatedAt: "2026-03-06T10:05:00Z",
          severity: "warning",
          refresh: vi.fn(),
        }}
      />
    );

    expect(screen.getByText("🧩 소스 공백·모순 탐지")).toBeInTheDocument();
    expect(screen.getByText("지금 빠진 정보")).toBeInTheDocument();
    expect(screen.getByText("Likelihood")).toBeInTheDocument();
  });
});
