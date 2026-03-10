import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDashboard } from "../test/fixtures.js";
import Simulator from "./Simulator.jsx";

vi.mock("../lib/aiChat.js", () => ({
  callAiChat: vi.fn(),
}));

import { callAiChat } from "../lib/aiChat.js";

describe("Simulator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the baseline emergency decision view without logging", () => {
    const onLog = vi.fn();

    render(<Simulator liveDash={createDashboard()} onLog={onLog} />);

    expect(screen.getByText("🚨 긴급 판단")).toBeInTheDocument();
    expect(screen.getByText("지금 할 일")).toBeInTheDocument();
    expect(screen.getAllByText("조건부 이동")[0]).toBeInTheDocument();
    expect(screen.getAllByText("추천 경로").length).toBeGreaterThan(0);
    expect(onLog).not.toHaveBeenCalled();
  });

  it("recomputes the guidance and logs once when a scenario changes", () => {
    const onLog = vi.fn();

    render(<Simulator liveDash={createDashboard()} onLog={onLog} />);

    fireEvent.click(screen.getByRole("button", { name: /영공 폐쇄/i }));

    expect(screen.getAllByText("항공 제외, Route R1 권장")[0]).toBeInTheDocument();
    expect(screen.getByText("상황 영공 폐쇄")).toBeInTheDocument();
    expect(screen.getAllByText("폐쇄").length).toBeGreaterThan(0);
    expect(onLog).toHaveBeenCalledTimes(2);
    expect(onLog.mock.calls[0][0]).toMatchObject({
      category: "SIM",
      title: "긴급 판단 갱신 · 항공 제외, Route R1 권장",
      level: "ALERT",
    });
    expect(onLog.mock.calls[1][0]).toMatchObject({
      category: "DECISION_TRACE",
      title: "판단 근거 로그 · 항공 제외, Route R1 권장",
      level: "INFO",
    });
  });

  it("resets the simulated decision back to the live baseline", () => {
    render(<Simulator liveDash={createDashboard()} onLog={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /영공 폐쇄/i }));
    expect(screen.getAllByText("항공 제외, Route R1 권장")[0]).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "현재 기준으로 되돌리기" }));

    expect(screen.getAllByText("조건부 이동")[0]).toBeInTheDocument();
    expect(screen.getByText("상황 현재 유지")).toBeInTheDocument();
    expect(screen.queryByText("항공 제외, Route R1 권장")).not.toBeInTheDocument();
  });

  it("updates route recommendations through the quick route editor", () => {
    render(<Simulator liveDash={createDashboard()} onLog={vi.fn()} />);

    fireEvent.click(screen.getByText(/경로 빠른 수정/i));

    const routeRows = screen.getAllByText(/Route R[12]/i).map((node) => node.closest(".route-summary-row")).filter(Boolean);
    const firstRouteRow = routeRows[0];

    fireEvent.click(within(firstRouteRow).getByRole("button", { name: "폐쇄" }));

    const recommendedTile = screen
      .getAllByText("추천 경로")
      .map((node) => node.closest(".metric-card"))
      .find(Boolean);
    expect(recommendedTile).toHaveTextContent("Route R2");
    expect(recommendedTile).toHaveTextContent("예상");
  });

  it("dedupes automatic timeline logging across rerenders of the same decision", () => {
    const onLog = vi.fn();
    const dash = createDashboard();
    const { rerender } = render(<Simulator liveDash={dash} onLog={onLog} />);

    fireEvent.click(screen.getByRole("button", { name: /공습 징후/i }));
    expect(onLog).toHaveBeenCalledTimes(2);

    rerender(<Simulator liveDash={dash} onLog={onLog} />);
    expect(onLog).toHaveBeenCalledTimes(2);
  });

  it("requests AI guidance on demand and clears it when the recommendation changes", async () => {
    vi.mocked(callAiChat).mockResolvedValue({
      text: "추가로 통신 불안과 야간 이동 리스크를 확인하세요.",
      payload: {},
    });

    render(<Simulator liveDash={createDashboard()} onLog={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /AI가 추가로 고려할 점 보기/i }));

    await waitFor(() => expect(callAiChat).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/통신 불안과 야간 이동 리스크/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /영공 폐쇄/i }));

    expect(screen.queryByText(/통신 불안과 야간 이동 리스크/i)).not.toBeInTheDocument();
  });
});
