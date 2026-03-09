import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TabBar from "./TabBar.jsx";

const tabs = [
  { id: "overview", label: "Overview", icon: "1" },
  { id: "analysis", label: "Analysis", icon: "2" },
  { id: "intel", label: "Intel", icon: "3" }
];

describe("TabBar", () => {
  it("renders tablist semantics and selected state", () => {
    const onChange = vi.fn();
    render(<TabBar tabs={tabs} activeTab="analysis" onChange={onChange} />);

    const tabList = screen.getByRole("tablist", { name: /dashboard sections/i });
    expect(tabList).toBeInTheDocument();

    const overviewTab = screen.getByRole("tab", { name: /overview/i });
    const analysisTab = screen.getByRole("tab", { name: /analysis/i });

    expect(overviewTab).toHaveAttribute("id", "tab-overview");
    expect(overviewTab).toHaveAttribute("aria-controls", "panel-overview");
    expect(overviewTab).toHaveAttribute("aria-selected", "false");
    expect(overviewTab).toHaveAttribute("tabindex", "-1");

    expect(analysisTab).toHaveAttribute("aria-selected", "true");
    expect(analysisTab).toHaveAttribute("tabindex", "0");
  });

  it("supports Arrow/Home/End keyboard navigation with focus move", () => {
    const onChange = vi.fn();
    render(<TabBar tabs={tabs} activeTab="analysis" onChange={onChange} />);

    const overviewTab = screen.getByRole("tab", { name: /overview/i });
    const analysisTab = screen.getByRole("tab", { name: /analysis/i });
    const intelTab = screen.getByRole("tab", { name: /intel/i });

    analysisTab.focus();
    fireEvent.keyDown(analysisTab, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("intel");
    expect(intelTab).toHaveFocus();

    fireEvent.keyDown(intelTab, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("overview");
    expect(overviewTab).toHaveFocus();

    fireEvent.keyDown(overviewTab, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("intel");
    expect(intelTab).toHaveFocus();

    fireEvent.keyDown(intelTab, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("overview");
    expect(overviewTab).toHaveFocus();

    fireEvent.keyDown(overviewTab, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("intel");
    expect(intelTab).toHaveFocus();
  });
});
