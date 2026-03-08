import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DashboardHeader from "./DashboardHeader.jsx";

describe("DashboardHeader", () => {
  it("renders stale and offline banners and wires controls", () => {
    const onRefresh = vi.fn();
    const onToggleNotifications = vi.fn();
    const onToggleSound = vi.fn();
    const onToggleShortcuts = vi.fn();

    render(
      <DashboardHeader
        derived={{
          staleSeverity: "SEVERE",
          liveLagSeconds: 3900,
          liveStale: true,
          modeState: "RED_PREP",
          modeColor: "#f59e0b",
          gateState: "CAUTION",
          airspaceState: "DISRUPTED",
          airspaceSegment: "DISRUPTED"
        }}
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
        onToggleShortcuts={onToggleShortcuts}
        usingCachedData
        cachedAt="2026-03-06T11:59:00Z"
        isOffline
      />
    );

    expect(screen.getByText(/OFFLINE/i)).toBeInTheDocument();
    expect(screen.getByText(/cached data from/i)).toBeInTheDocument();
    expect(screen.getByText(/Pointer fallback active/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Refresh Now|🔄 Refresh/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Alerts Off/i }));
    fireEvent.click(screen.getByRole("button", { name: /Sound On/i }));
    fireEvent.click(screen.getByRole("button", { name: /\? Shortcuts/i }));

    expect(onRefresh).toHaveBeenCalled();
    expect(onToggleNotifications).toHaveBeenCalled();
    expect(onToggleSound).toHaveBeenCalled();
    expect(onToggleShortcuts).toHaveBeenCalled();
  });
});
