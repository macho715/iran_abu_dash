import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import IntelTab from "./IntelTab.jsx";
import * as intelStatus from "../../lib/intelStatus.js";
import { createDashboard } from "../../test/fixtures.js";

describe("IntelTab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("shows the no-new-signal banner when every item is repeated", () => {
    const repeatedTs = "2026-03-06T08:00:00Z";
    const allIntelFeed = createDashboard({
      intelFeed: [
        {
          id: "intel-repeated-official",
          tsIso: "2026-03-06T09:55:00Z",
          priority: "CRITICAL",
          category: "AIRSPACE",
          text: "Critical airspace update",
          sources: "faa",
          status: "repeated",
          firstSeenTs: repeatedTs,
        },
        {
          id: "intel-repeated-high",
          tsIso: "2026-03-06T09:45:00Z",
          priority: "HIGH",
          category: "BORDER",
          text: "Border congestion rising",
          sources: "reuters",
          status: "repeated",
          firstSeenTs: repeatedTs,
        },
      ],
    }).intelFeed;

    render(
      <IntelTab
        allIntelFeed={allIntelFeed}
        filteredIntelFeed={allIntelFeed}
        intelFilter="ALL"
        onFilterChange={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("신규 시그널 없음");
    expect(screen.getByText("반복 감지(repeated) 항목만 표시 중입니다.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("반복(repeated): 2");
    expect(screen.getAllByText(/변동없음/)).toHaveLength(2);
    expect(screen.getByText("Critical airspace update")).toBeInTheDocument();
  });

  it("derives repeated-only banner state through the shared status utility", () => {
    const allIntelFeed = [
      {
        id: "intel-repeated-only",
        tsIso: "2025-02-10T12:00:00.000Z",
        priority: "MEDIUM",
        status: "repeated",
        text: "No movement",
      },
    ];
    const spy = vi.spyOn(intelStatus, "countIntelStatuses");

    render(
      <IntelTab
        allIntelFeed={allIntelFeed}
        filteredIntelFeed={allIntelFeed}
        intelFilter="ALL"
        onFilterChange={vi.fn()}
      />
    );

    expect(spy).toHaveBeenCalledWith(allIntelFeed);
    expect(screen.getByRole("status")).toHaveTextContent("신규 시그널 없음");
    expect(screen.getByText("반복 감지(repeated) 항목만 표시 중입니다.")).toBeInTheDocument();
  });

  it("does not show the no-new-signal banner when the feed only has official items", () => {
    const allIntelFeed = [
      {
        id: "intel-official-1",
        tsIso: "2026-03-06T09:55:00Z",
        priority: "CRITICAL",
        text: "Critical airspace update",
        status: "official",
      },
      {
        id: "intel-official-2",
        tsIso: "2026-03-06T09:45:00Z",
        priority: "HIGH",
        text: "Embassy confirms route advisory",
        status: "official",
      },
    ];

    render(
      <IntelTab
        allIntelFeed={allIntelFeed}
        filteredIntelFeed={allIntelFeed}
        intelFilter="ALL"
        onFilterChange={vi.fn()}
      />
    );

    expect(screen.queryByText(/신규 시그널 없음/i)).not.toBeInTheDocument();
  });

  it("does not show the no-new-signal banner when official and repeated items are mixed", () => {
    const allIntelFeed = [
      {
        id: "intel-repeated-1",
        tsIso: "2026-03-06T09:55:00Z",
        priority: "CRITICAL",
        text: "Critical airspace update",
        status: "repeated",
      },
      {
        id: "intel-official-1",
        tsIso: "2026-03-06T09:45:00Z",
        priority: "HIGH",
        text: "Embassy confirms route advisory",
        status: "official",
      },
    ];

    render(
      <IntelTab
        allIntelFeed={allIntelFeed}
        filteredIntelFeed={allIntelFeed}
        intelFilter="ALL"
        onFilterChange={vi.fn()}
      />
    );

    expect(screen.queryByText(/신규 시그널 없음/i)).not.toBeInTheDocument();
  });
});
