import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import IntelTab from "./IntelTab.jsx";
import { createDashboard } from "../../test/fixtures.js";

describe("IntelTab", () => {
  it("shows counts from the full feed while rendering the filtered list", () => {
    const allIntelFeed = createDashboard().intelFeed;
    const filteredIntelFeed = allIntelFeed.filter((item) => item.priority === "CRITICAL");
    const onFilterChange = vi.fn();

    render(
      <IntelTab
        allIntelFeed={allIntelFeed}
        filteredIntelFeed={filteredIntelFeed}
        intelFilter="CRITICAL"
        onFilterChange={onFilterChange}
      />
    );

    expect(screen.getByRole("button", { name: /ALL \(3\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CRITICAL \(1\)/i })).toBeInTheDocument();
    expect(screen.queryByText("Border congestion rising")).not.toBeInTheDocument();
    expect(screen.getByText("Critical airspace update")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /HIGH \(1\)/i }));
    expect(onFilterChange).toHaveBeenCalledWith("HIGH");
  });
});
