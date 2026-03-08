import React from "react";

export default function TabBar({ tabs = [], activeTab, onChange }) {
  return (
    <div className="tab-bar">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`tab-button ${active ? "is-active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
