import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ChecklistTab from "./ChecklistTab.jsx";

describe("ChecklistTab", () => {
  it("renders progress and forwards checklist actions", () => {
    const onToggleChecklist = vi.fn();
    const onResetChecklist = vi.fn();

    render(
      <ChecklistTab
        checklist={[
          { id: 1, text: "Documents", done: true },
          { id: 2, text: "Transport", done: false }
        ]}
        onToggleChecklist={onToggleChecklist}
        onResetChecklist={onResetChecklist}
      />
    );

    expect(screen.getByText(/1\/2 완료 \(50%\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reset/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Transport/i }));

    expect(onResetChecklist).toHaveBeenCalledTimes(1);
    expect(onToggleChecklist).toHaveBeenCalledWith(2);
  });
});
