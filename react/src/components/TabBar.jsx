import React from "react";

export default function TabBar({ tabs = [], activeTab, onChange }) {
  const tabRefs = React.useRef(new Map());

  const moveFocusToTab = React.useCallback((tabId) => {
    const target = tabRefs.current.get(tabId);
    if (target) {
      target.focus();
    }
  }, []);

  const handleKeyDown = React.useCallback((event, index) => {
    const keyHandlers = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keyHandlers.includes(event.key) || tabs.length === 0) return;

    event.preventDefault();

    let nextIndex = index;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % tabs.length;
    }
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    }
    if (event.key === "Home") {
      nextIndex = 0;
    }
    if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }

    const nextTabId = tabs[nextIndex]?.id;
    if (nextTabId) {
      onChange(nextTabId);
      moveFocusToTab(nextTabId);
    }
  }, [moveFocusToTab, onChange, tabs]);

  return (
    <div className="tab-bar" role="tablist" aria-label="Dashboard sections">
      {tabs.map((tab, index) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`tab-button ${active ? "is-active" : ""}`}
            onClick={() => onChange(tab.id)}
            role="tab"
            aria-selected={active}
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(node) => {
              if (node) {
                tabRefs.current.set(tab.id, node);
              } else {
                tabRefs.current.delete(tab.id);
              }
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
