import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deriveState } from "../lib/deriveState.js";
import { createDashboard } from "../test/fixtures.js";
import AskAiPanel from "./AskAiPanel.jsx";

vi.mock("../lib/aiChat.js", () => ({
  callAiChat: vi.fn(),
}));

import { callAiChat } from "../lib/aiChat.js";

describe("AskAiPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderPanel(props = {}) {
    const dash = createDashboard();
    const derived = deriveState(dash);
    const usableRoutes = dash.routes.map((route) => ({ ...route, eff: route.base_h * (1 + route.cong) * 1.15 }));

    return render(
      <AskAiPanel
        visible
        onClose={vi.fn()}
        dash={dash}
        derived={derived}
        usableRoutes={usableRoutes}
        summary={{ text: "룰 기반 요약", ts: "2026-03-06T10:00:00Z", mode: "OFFLINE" }}
        activeTab="overview"
        {...props}
      />
    );
  }

  it("applies dialog semantics and focuses the close button", () => {
    renderPanel();

    const dialog = screen.getByRole("dialog", { name: /ask ai/i });
    const closeButton = screen.getByRole("button", { name: /close/i });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "ask-ai-panel-title");
    expect(closeButton).toHaveFocus();
  });

  it("submits a question and renders the latest answer", async () => {
    vi.mocked(callAiChat).mockResolvedValue({ text: "현재는 Route R1 우선 검토가 현실적입니다.", payload: {} });
    renderPanel();

    fireEvent.change(screen.getByLabelText("질문"), {
      target: { value: "현재 이동 판단을 요약해줘." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Ask AI$/i }));

    await waitFor(() => expect(callAiChat).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Q\. 현재 이동 판단을 요약해줘\./i)).toBeInTheDocument();
    expect(await screen.findByText(/Route R1 우선 검토/i)).toBeInTheDocument();
  });

  it("renders proxy errors without closing the panel", async () => {
    vi.mocked(callAiChat).mockRejectedValue(new Error("AI proxy error: policy blocked"));
    const onClose = vi.fn();
    renderPanel({ onClose });

    fireEvent.change(screen.getByLabelText("질문"), {
      target: { value: "왜 차단됐는지 알려줘." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Ask AI$/i }));

    expect(await screen.findByText(/policy blocked/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
