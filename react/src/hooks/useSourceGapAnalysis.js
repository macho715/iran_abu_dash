import React from "react";

import { callAiChat } from "../lib/aiChat.js";
import {
  buildGapDetectionContext,
  getGapDetectionCacheKey,
  getGapDetectionSeverity,
  loadGapDetectionCache,
  parseGapDetectionResponse,
  saveGapDetectionCache,
} from "../lib/sourceGapDetection.js";

function deriveStateFromCache(cache, cacheKey) {
  if (!cache?.result) {
    return {
      result: null,
      cacheStatus: "empty",
      stale: false,
      lastUpdatedAt: "",
      severity: "neutral",
    };
  }

  const isCurrent = cache.cacheKey === cacheKey;
  return {
    result: cache.result,
    cacheStatus: isCurrent ? "current" : "stale",
    stale: !isCurrent,
    lastUpdatedAt: cache.updatedAt || "",
    severity: getGapDetectionSeverity(cache.result),
  };
}

export function useSourceGapAnalysis({ dash, derived, usableRoutes, summary }) {
  const abortRef = React.useRef(null);
  const cacheKey = React.useMemo(() => getGapDetectionCacheKey(dash, derived), [dash, derived]);
  const contextSummary = React.useMemo(
    () => buildGapDetectionContext({ dash, derived, usableRoutes, summary }),
    [dash, derived, usableRoutes, summary]
  );

  const [state, setState] = React.useState(() => ({
    ...deriveStateFromCache(loadGapDetectionCache(), cacheKey),
    loading: false,
    error: "",
  }));

  React.useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((prev) => ({
      ...prev,
      ...deriveStateFromCache(loadGapDetectionCache(), cacheKey),
      loading: false,
      error: "",
    }));
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [cacheKey]);

  const refresh = React.useCallback(async () => {
    if (!cacheKey || !contextSummary) return null;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({
      ...prev,
      loading: true,
      error: "",
    }));

    try {
      const result = await callAiChat({
        messages: [
          {
            role: "system",
            content: [
              "당신은 UrgentDash 소스 공백·모순 탐지 보조 AI입니다.",
              "제공된 구조화 요약만 사용해 한국어로 판단 품질 보조 의견을 만드세요.",
              "최종 이동 결정을 내리지 말고, 부족한 정보·상충 신호·추가 확인 포인트만 짚으세요.",
              "반드시 JSON 한 줄만 반환하세요.",
              '형식: {"summary":"...", "missingInfo":["..."], "contradictions":["..."], "nextChecks":["..."]}',
              "각 배열은 최대 3개, 각 항목은 짧은 문장으로 제한하세요.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              "대시보드 구조화 요약:",
              contextSummary,
            ].join("\n\n"),
          },
        ],
        signal: controller.signal,
      });

      if (abortRef.current !== controller) return null;

      const parsed = parseGapDetectionResponse(result.text);
      const updatedAt = new Date().toISOString();

      saveGapDetectionCache({
        cacheKey,
        updatedAt,
        result: parsed,
      });

      setState({
        result: parsed,
        cacheStatus: "current",
        stale: false,
        lastUpdatedAt: updatedAt,
        severity: getGapDetectionSeverity(parsed),
        loading: false,
        error: "",
      });

      return parsed;
    } catch (submitError) {
      if (controller.signal.aborted) return null;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: submitError instanceof Error ? submitError.message : "소스 공백·모순 탐지 분석에 실패했습니다.",
      }));
      return null;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [cacheKey, contextSummary]);

  return {
    ...state,
    refresh,
  };
}
