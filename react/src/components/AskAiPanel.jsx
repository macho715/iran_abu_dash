import React from "react";

import { callAiChat } from "../lib/aiChat.js";
import { getRouteEffectiveHours, normalizeWhitespace, truncate } from "../lib/utils.js";

const PRESET_QUESTIONS = [
  "지금 가장 주의해야 할 리스크 3가지를 알려줘.",
  "현재 기준으로 가장 현실적인 이동 판단을 요약해줘.",
  "추가 확인이 필요한 불확실성을 짚어줘.",
];

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

function formatRoute(route) {
  const eta = getRouteEffectiveHours(route);
  if (!route) return "";
  return `${route.id} ${route.status || "n/a"} ${Number.isFinite(eta) ? `~${eta.toFixed(1)}h` : "n/a"}`;
}

function formatIntelItem(item) {
  if (!item) return "";
  return `[${item.priority || "n/a"}] ${truncate(item.text || "", 120)}`;
}

function readSummaryText(summary) {
  if (typeof summary === "string") return normalizeWhitespace(summary);
  return normalizeWhitespace(summary?.text || "");
}

export function buildAskAiContextSummary({ dash, derived, usableRoutes, summary, activeTab }) {
  const topRoutes = (usableRoutes || [])
    .slice(0, 3)
    .map(formatRoute)
    .filter(Boolean);
  const topIntel = (dash?.intelFeed || [])
    .slice(0, 3)
    .map(formatIntelItem)
    .filter(Boolean);
  const notebookSummary = normalizeWhitespace(dash?.aiAnalysis?.summary || "");
  const ruleSummary = readSummaryText(summary);
  const conflictStats = derived?.conflictStats || {};

  const sections = [
    `active_tab: ${activeTab || "overview"}`,
    `mode: ${derived?.modeState || "n/a"}`,
    `gate: ${derived?.gateState || "n/a"}`,
    `airspace: ${derived?.airspaceState || "n/a"} (${derived?.airspaceSegment || "n/a"})`,
    `evidence: ${derived?.evidenceState || "n/a"} conf=${Number(derived?.ec || 0).toFixed(3)} thr=${Number(derived?.effectiveThreshold || 0).toFixed(3)}`,
    `urgency: ${Number(derived?.urgencyScore || 0).toFixed(2)} (${derived?.conflictDayLabel || "n/a"})`,
    `source_health: ${derived?.sourceHealthLabel || "n/a"} live_lag=${Number.isFinite(derived?.liveLagSeconds) ? `${derived.liveLagSeconds}s` : "n/a"}`,
    `conflict: missiles=${conflictStats.missiles_total ?? "n/a"} drones=${conflictStats.drones_total ?? "n/a"} kia=${conflictStats.casualties_kia ?? "n/a"} wia=${conflictStats.casualties_wia ?? "n/a"}`,
  ];

  if (topRoutes.length) {
    sections.push(`top_routes: ${topRoutes.join(" | ")}`);
  }

  if (topIntel.length) {
    sections.push(`top_intel: ${topIntel.join(" | ")}`);
  }

  if (ruleSummary) {
    sections.push(`rule_summary: ${truncate(ruleSummary, 600)}`);
  }

  if (notebookSummary) {
    sections.push(`notebooklm_summary: ${truncate(notebookSummary, 500)}`);
  }

  return sections.join("\n");
}

export default function AskAiPanel({
  visible,
  onClose,
  dash,
  derived,
  usableRoutes,
  summary,
  activeTab,
}) {
  const [question, setQuestion] = React.useState("");
  const [responseText, setResponseText] = React.useState("");
  const [responseQuestion, setResponseQuestion] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const panelRef = React.useRef(null);
  const closeButtonRef = React.useRef(null);
  const previousActiveElementRef = React.useRef(null);
  const abortRef = React.useRef(null);

  const contextSummary = React.useMemo(() => (
    buildAskAiContextSummary({ dash, derived, usableRoutes, summary, activeTab })
  ), [activeTab, dash, derived, summary, usableRoutes]);

  React.useEffect(() => {
    if (!visible) {
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
      return undefined;
    }

    previousActiveElementRef.current = document.activeElement;
    closeButtonRef.current?.focus();

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
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

  const handleSubmit = React.useCallback(async (event) => {
    event.preventDefault();

    const nextQuestion = normalizeWhitespace(question);
    if (!nextQuestion || loading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    setResponseText("");
    setResponseQuestion(nextQuestion);

    try {
      const result = await callAiChat({
        messages: [
          {
            role: "system",
            content: "당신은 UrgentDash 상황 판단 보조 AI입니다. 제공된 요약 컨텍스트만 사용해 한국어로 간결하게 답하고, 확실하지 않은 내용은 불확실하다고 명시하세요.",
          },
          {
            role: "user",
            content: [
              `질문: ${nextQuestion}`,
              "대시보드 요약:",
              contextSummary,
            ].join("\n\n"),
          },
        ],
        signal: controller.signal,
      });

      if (abortRef.current !== controller) return;

      setResponseText(result.text);
      setError("");
    } catch (submitError) {
      if (controller.signal.aborted) return;
      setError(submitError instanceof Error ? submitError.message : "Ask AI 요청에 실패했습니다.");
      setResponseText("");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [contextSummary, loading, question]);

  if (!visible) return null;

  return (
    <div className="shortcut-overlay" onClick={onClose}>
      <div
        className="shortcut-panel ask-ai-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-ai-panel-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        ref={panelRef}
      >
        <div className="shortcut-panel__header">
          <div>
            <div className="shortcut-panel__title" id="ask-ai-panel-title">Ask AI</div>
            <div className="shortcut-panel__meta">원문 데이터 대신 요약 컨텍스트만 전송합니다.</div>
          </div>
          <button
            className="action-button action-button--muted"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="ask-ai-panel__body">
          <div className="ask-ai-presets">
            {PRESET_QUESTIONS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="action-button action-button--muted"
                onClick={() => setQuestion(preset)}
              >
                {preset}
              </button>
            ))}
          </div>

          <form className="ask-ai-form" onSubmit={handleSubmit}>
            <label className="section-title" htmlFor="ask-ai-question">질문</label>
            <textarea
              id="ask-ai-question"
              className="ask-ai-textarea section-gap-top"
              placeholder="예: 지금 가장 현실적인 이동 판단과 추가 확인 포인트를 알려줘."
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={6}
            />
            <div className="filter-row section-gap-top">
              <button type="submit" className="action-button" disabled={loading || !normalizeWhitespace(question)}>
                {loading ? "답변 생성 중..." : "Ask AI"}
              </button>
              <div className="microcopy">active tab: {activeTab || "overview"}</div>
            </div>
          </form>

          {(loading || error || responseText) && (
            <div className="nested-panel ask-ai-response" aria-live="polite">
              {responseQuestion && (
                <div className="ask-ai-response__question">Q. {responseQuestion}</div>
              )}
              {loading && <div className="body-copy section-gap-top">AI가 요약 컨텍스트를 검토 중입니다…</div>}
              {error && <div className="error-banner section-gap-top">❗ {error}</div>}
              {responseText && <div className="body-copy section-gap-top">{responseText}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
