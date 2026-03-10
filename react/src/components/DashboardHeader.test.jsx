import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { deriveState } from "../lib/deriveState.js";
import { createHealthyDashboard, createStaleDashboard } from "../test/fixtures.js";
import DashboardHeader from "./DashboardHeader.jsx";

describe("DashboardHeader", () => {
  it("renders stale and offline banners and wires controls", () => {
    const onRefresh = vi.fn();
    const onToggleNotifications = vi.fn();
    const onToggleSound = vi.fn();
    const onOpenAskAi = vi.fn();
    const onToggleShortcuts = vi.fn();

    render(
      <DashboardHeader
        derived={deriveState(createStaleDashboard({
          metadata: { stateTs: new Date(Date.now() - (65 * 60 * 1000)).toISOString() },
        }))}
        error="Pointer fallback active"
        gstDateTime="2026. 3. 6. 16:00:00"
        updateTs="16:00"
        nextEta={30}
        fastCountdownSeconds={30}
        lagLabel="3900s"
        onRefresh={onRefresh}
        notifEnabled={false}
        onToggleNotifications={onToggleNotifications}
        soundEnabled
        onToggleSound={onToggleSound}
        onOpenAskAi={onOpenAskAi}
        onToggleShortcuts={onToggleShortcuts}
        usingCachedData
        cachedAt="2026-03-06T11:59:00Z"
        isOffline
        stateTs="2026-03-06T11:55:00Z"
        sourceHealthLabel="2/6 ok"
      />
    );

    expect(screen.getByText(/OFFLINE/i)).toBeInTheDocument();
    expect(screen.getByText(/cached data from/i)).toBeInTheDocument();
    expect(screen.getByText(/데이터가 65분 전/i)).toBeInTheDocument();
    expect(screen.getByText(/stateTs: 2026-03-06T11:55:00Z/i)).toBeInTheDocument();
    expect(screen.getByText(/source health: 2\/6 ok/i)).toBeInTheDocument();
    expect(screen.getByText(/Pointer fallback active/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Refresh Now|🔄 Refresh/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Alerts Off/i }));
    fireEvent.click(screen.getByRole("button", { name: /Sound On/i }));
    fireEvent.click(screen.getByRole("button", { name: /Ask AI/i }));
    fireEvent.click(screen.getByRole("button", { name: /\? Shortcuts/i }));

    expect(onRefresh).toHaveBeenCalled();
    expect(onToggleNotifications).toHaveBeenCalled();
    expect(onToggleSound).toHaveBeenCalled();
    expect(onOpenAskAi).toHaveBeenCalled();
    expect(onToggleShortcuts).toHaveBeenCalled();
  });

  it("does not render stale warning banner for healthy data", () => {
    render(
      <DashboardHeader
        derived={deriveState(createHealthyDashboard({
          metadata: { stateTs: new Date(Date.now() - (4 * 60 * 1000)).toISOString() },
        }))}
        error={null}
        gstDateTime="2026. 3. 6. 16:00:00"
        updateTs="16:00"
        nextEta={30}
        fastCountdownSeconds={30}
        lagLabel="240s"
        onRefresh={vi.fn()}
        notifEnabled={false}
        onToggleNotifications={vi.fn()}
        soundEnabled={false}
        onToggleSound={vi.fn()}
        onOpenAskAi={vi.fn()}
        onToggleShortcuts={vi.fn()}
        usingCachedData={false}
        cachedAt={null}
        isOffline={false}
        stateTs="2026-03-06T15:56:00Z"
        sourceHealthLabel="6/6 ok"
      />
    );

    expect(screen.queryByText(/최신 정보가 아닐 수 있습니다/i)).not.toBeInTheDocument();
  });
});
