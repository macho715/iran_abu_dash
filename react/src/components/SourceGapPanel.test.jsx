import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SourceGapPanel from "./SourceGapPanel.jsx";

function createAnalysis(overrides = {}) {
  return {
    result: {
      summary: "현재 판단에 일부 공백이 있습니다.",
      missingInfo: ["영공 재개 시각 확인 필요"],
      contradictions: ["Gate는 OPEN인데 source health는 낮습니다."],
      nextChecks: ["I02 원문과 대사관 공지를 교차 확인하세요."],
    },
    loading: false,
    error: "",
    stale: false,
    cacheStatus: "current",
    lastUpdatedAt: "2026-03-06T10:05:00Z",
    severity: "critical",
    refresh: vi.fn(),
    ...overrides,
  };
}

describe("SourceGapPanel", () => {
  it("renders compact summary rows and refresh action", () => {
    const analysis = createAnalysis();
    render(<SourceGapPanel variant="compact" analysis={analysis} />);

    expect(screen.getByText("지금 빠진 정보")).toBeInTheDocument();
    expect(screen.getByText(/영공 재개 시각 확인 필요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "재분석" }));
    expect(analysis.refresh).toHaveBeenCalledTimes(1);
  });

  it("renders expanded lists and error state", () => {
    render(<SourceGapPanel variant="expanded" analysis={createAnalysis({ error: "AI proxy error" })} />);

    expect(screen.getByText("충돌 신호")).toBeInTheDocument();
    expect(screen.getByText(/Gate는 OPEN인데 source health는 낮습니다/)).toBeInTheDocument();
    expect(screen.getByText(/AI proxy error/)).toBeInTheDocument();
  });
});
