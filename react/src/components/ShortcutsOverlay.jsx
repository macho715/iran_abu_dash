import React from "react";

const SHORTCUTS = [
  { key: "1-7", action: "탭 전환" },
  { key: "R", action: "즉시 새로고침" },
  { key: "?", action: "단축키 패널 토글" },
  { key: "Esc", action: "단축키 패널 닫기" }
];

export default function ShortcutsOverlay({ visible, onClose }) {
  if (!visible) return null;
  return (
    <div className="shortcut-overlay" onClick={onClose}>
      <div className="shortcut-panel" onClick={(event) => event.stopPropagation()}>
        <div className="shortcut-panel__header">
          <div>
            <div className="shortcut-panel__title">Keyboard Shortcuts</div>
            <div className="shortcut-panel__meta">위기 대시보드 조작을 빠르게 유지하는 단축키입니다.</div>
          </div>
          <button className="action-button action-button--muted" onClick={onClose}>Close</button>
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
