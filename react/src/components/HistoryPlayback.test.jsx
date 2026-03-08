import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import HistoryPlayback from "./HistoryPlayback.jsx";
import { createHistory } from "../test/fixtures.js";

describe("HistoryPlayback", () => {
  it("shows selected history state and updates selection", () => {
    const onSelect = vi.fn();
    render(<HistoryPlayback history={createHistory()} selectedIndex={0} onSelect={onSelect} />);

    expect(screen.getByText(/History Playback/i)).toBeInTheDocument();
    expect(screen.getByText(/1\/2/)).toBeInTheDocument();
    expect(screen.getByText("AMBER")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });

    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
