import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ShortcutsOverlay from "./ShortcutsOverlay.jsx";

describe("ShortcutsOverlay", () => {
  it("applies dialog semantics and focuses close button when opened", () => {
    render(<ShortcutsOverlay visible onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: /keyboard shortcuts/i });
    const closeButton = screen.getByRole("button", { name: /close/i });

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "shortcut-panel-title");
    expect(closeButton).toHaveFocus();
  });

  it("traps Tab focus and closes on Escape", () => {
    const onClose = vi.fn();
    render(<ShortcutsOverlay visible onClose={onClose} />);

    const closeButton = screen.getByRole("button", { name: /close/i });
    closeButton.focus();

    fireEvent.keyDown(closeButton, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(closeButton, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores focus to trigger when closed", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <div>
        <button type="button">Trigger</button>
        <ShortcutsOverlay visible={false} onClose={onClose} />
      </div>
    );

    const trigger = screen.getByRole("button", { name: /trigger/i });
    trigger.focus();

    rerender(
      <div>
        <button type="button">Trigger</button>
        <ShortcutsOverlay visible onClose={onClose} />
      </div>
    );

    expect(screen.getByRole("button", { name: /close/i })).toHaveFocus();

    rerender(
      <div>
        <button type="button">Trigger</button>
        <ShortcutsOverlay visible={false} onClose={onClose} />
      </div>
    );

    expect(trigger).toHaveFocus();
  });
});
