import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { deriveState } from "../../lib/deriveState.js";
import { createDashboard } from "../../test/fixtures.js";
import IndicatorsTab from "./IndicatorsTab.jsx";

describe("IndicatorsTab", () => {
  it("renders the expanded source gap panel below evidence floor", () => {
    const dash = createDashboard();
    const derived = deriveState(dash);

    render(
      <IndicatorsTab
        indicators={dash.indicators}
        derived={derived}
        sourceGapAnalysis={{
          result: {
            summary: "요약",
            missingInfo: ["공백 1"],
            contradictions: ["모순 1"],
            nextChecks: ["확인 1"],
          },
          loading: false,
          error: "",
          stale: true,
          cacheStatus: "stale",
          lastUpdatedAt: "2026-03-06T10:05:00Z",
          severity: "critical",
          refresh: vi.fn(),
        }}
      />
    );

    expect(screen.getByText(/Evidence Floor/)).toBeInTheDocument();
    expect(screen.getByText("지금 빠진 정보")).toBeInTheDocument();
    expect(screen.getByText("충돌 신호")).toBeInTheDocument();
    expect(screen.getByText("이전 상태 기준")).toBeInTheDocument();
  });
});
