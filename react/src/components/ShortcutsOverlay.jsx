import React from "react";

const SHORTCUTS = [
  { key: "1-7", action: "탭 전환" },
  { key: "R", action: "즉시 새로고침" },
  { key: "?", action: "단축키 패널 토글" },
  { key: "Esc", action: "단축키 패널 닫기" }
];

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

export default function ShortcutsOverlay({ visible, onClose }) {
  const panelRef = React.useRef(null);
  const closeButtonRef = React.useRef(null);
  const previousActiveElementRef = React.useRef(null);

  React.useEffect(() => {
    if (!visible) return undefined;

    previousActiveElementRef.current = document.activeElement;
    closeButtonRef.current?.focus();

    return () => {
      const previousElement = previousActiveElementRef.current;
      if (previousElement && previousElement instanceof HTMLElement) {
        previousElement.focus();
      }
    };
  }, [visible]);

  const trapFocus = React.useCallback((event) => {
    if (event.key !== "Tab") return;

    const focusableElements = panelRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
    if (!focusableElements || focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }, []);

  const handleKeyDown = React.useCallback((event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    trapFocus(event);
  }, [onClose, trapFocus]);

  if (!visible) return null;

  return (
    <div className="shortcut-overlay" onClick={onClose}>
      <div
        className="shortcut-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-panel-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        ref={panelRef}
      >
        <div className="shortcut-panel__header">
          <div>
            <div className="shortcut-panel__title" id="shortcut-panel-title">Keyboard Shortcuts</div>
            <div className="shortcut-panel__meta">위기 대시보드 조작을 빠르게 유지하는 단축키입니다.</div>
          </div>
          <button
            className="action-button action-button--muted"
            onClick={onClose}
            ref={closeButtonRef}
          >
            Close
          </button>
        </div>
        <div className="shortcut-list">
          {SHORTCUTS.map((item) => (
            <div key={item.key} className="shortcut-list__row">
              <span className="shortcut-key">{item.key}</span>
              <span className="shortcut-label">{item.action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
