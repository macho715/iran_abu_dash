"""
Phase 2 AI analysis helpers.

NotebookLM query-based analysis is the primary path.
If query fails or returns invalid output, rule-based fallback is used.
"""

from __future__ import annotations

import json
from typing import Any, Literal, TypedDict


ThreatLevel = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
Sentiment = Literal["긴급", "일반", "회복"]
AnalysisSource = Literal["notebooklm", "fallback"]


class AnalysisResult(TypedDict):
    threat_level: ThreatLevel
    threat_score: int
    sentiment: Sentiment
    abu_dhabi_level: ThreatLevel
    dubai_level: ThreatLevel
    summary: str
    recommended_action: str
    key_points: list[str]
    analysis_source: AnalysisSource


VALID_LEVELS: tuple[ThreatLevel, ...] = ("LOW", "MEDIUM", "HIGH", "CRITICAL")
URGENT_KEYWORDS = (
    "missile",
    "drone",
    "strike",
    "attack",
    "explosion",
    "evacuation",
    "airport closed",
    "airspace closed",
    "casualties",
    "killed",
    "injured",
    "emergency",
    "warning",
)
RISK_KEYWORDS = (
    "military",
    "conflict",
    "alert",
    "intercepted",
    "flight suspension",
    "flight cancelled",
)
RECOVERY_KEYWORDS = (
    "resume",
    "reopen",
    "restored",
    "stabilized",
    "de-escalation",
    "normal operations",
)


def score_to_level(
    score: int,
    medium: int = 40,
    high: int = 70,
    critical: int = 85,
) -> ThreatLevel:
    """Map 0~100 score to LOW/MEDIUM/HIGH/CRITICAL."""
    if score >= critical:
        return "CRITICAL"
    if score >= high:
        return "HIGH"
    if score >= medium:
        return "MEDIUM"
    return "LOW"


def normalize_level(level: str | None, default: ThreatLevel = "LOW") -> ThreatLevel:
    if not level:
        return default
    upper = str(level).strip().upper()
    if upper in VALID_LEVELS:
        return upper  # type: ignore[return-value]
    return default


def extract_json_payload(text: str) -> dict[str, Any]:
    """
    Extract JSON object from plain JSON or markdown fenced JSON.
    Raises ValueError if no valid object can be extracted.
    """
    if not text or not text.strip():
        raise ValueError("empty analysis text")

    raw = text.strip()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    fenced = _extract_fenced_json(text)
    if fenced:
        parsed = json.loads(fenced)
        if isinstance(parsed, dict):
            return parsed

    for candidate in _extract_json_candidates(text):
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed

    raise ValueError("no valid JSON object found")


def _extract_fenced_json(text: str) -> str | None:
    lines = text.splitlines()
    in_fence = False
    started = False
    buffer: list[str] = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            marker = stripped[3:].strip().lower()
            if not in_fence:
                if marker == "json" or marker == "":
                    in_fence = True
                    started = True
                    continue
                continue
            if marker == "":
                break
            in_fence = False
            break

        if in_fence:
            buffer.append(line)

    if not in_fence and started:
        content = "\n".join(buffer).strip()
        if content:
            return content
    return None


def _extract_json_candidates(text: str) -> list[str]:
    """
    Return valid JSON candidate substrings by scanning balanced braces.
    Backtracking is avoided by linear scan.
    """
    candidates: list[str] = []
    start = -1
    depth = 0
    in_string = False
    escaped = False

    for i, ch in enumerate(text):
        if escaped:
            escaped = False
            continue

        if ch == "\\" and in_string:
            escaped = True
            continue

        if ch == '"':
            in_string = not in_string
            continue

        if in_string:
            continue

        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
            continue

        if ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start >= 0:
                    candidates.append(text[start : i + 1])
                    start = -1
            continue

    return candidates


def _to_int(value: Any, default: int) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _clip_score(score: int) -> int:
    return max(0, min(100, score))


def _recommended_action(level: ThreatLevel) -> str:
    if level == "CRITICAL":
        return "즉시 실내 대기 후 현지 당국 지침에 따라 대피 준비"
    if level == "HIGH":
        return "불필요한 이동 중단, 공항/교통 운영 공지 수시 확인"
    if level == "MEDIUM":
        return "외출 최소화, 공식 채널 경보 알림 활성화"
    return "일상 모니터링 유지, 신규 경보 발생 시 즉시 확인"


def _normalize_sentiment(sentiment: str | None, summary: str) -> Sentiment:
    if sentiment in ("긴급", "일반", "회복"):
        return sentiment
    text = (summary or "").lower()
    if any(k in text for k in ("긴급", "위험", "공격", "폭발", "대피", "missile", "attack", "explosion")):
        return "긴급"
    if any(k in text for k in ("회복", "복구", "정상화", "resume", "reopen", "restored")):
        return "회복"
    return "일반"


def _keyword_score(text: str) -> int:
    score = 5
    for kw in URGENT_KEYWORDS:
        if kw in text:
            score += 18
    for kw in RISK_KEYWORDS:
        if kw in text:
            score += 10
    for kw in RECOVERY_KEYWORDS:
        if kw in text:
            score -= 10
    return score


def _city_score(articles: list[dict], city_keywords: tuple[str, ...]) -> int:
    city_articles = []
    for a in articles:
        text = f"{a.get('title', '')} {a.get('link', '')}".lower()
        if any(k in text for k in city_keywords):
            city_articles.append(a)

    if not city_articles:
        return 20

    score = 0
    for a in city_articles:
        score += _keyword_score(f"{a.get('title', '')} {a.get('link', '')}".lower())
    score = int(score / max(len(city_articles), 1))
    return _clip_score(score)


def fallback_analyze(
    articles: list[dict],
    threshold_medium: int = 40,
    threshold_high: int = 70,
    threshold_critical: int = 85,
) -> AnalysisResult:
    """Rule-based fallback analysis."""
    if not articles:
        return {
            "threat_level": "LOW",
            "threat_score": 10,
            "sentiment": "일반",
            "abu_dhabi_level": "LOW",
            "dubai_level": "LOW",
            "summary": "새로운 기사 없음",
            "recommended_action": _recommended_action("LOW"),
            "key_points": ["수집된 신규 기사가 없습니다."],
            "analysis_source": "fallback",
        }

    raw_scores = []
    text_blob = []
    for a in articles:
        text = f"{a.get('title', '')} {a.get('link', '')}".lower()
        text_blob.append(text)
        raw_scores.append(_keyword_score(text))

    threat_score = _clip_score(int(sum(raw_scores) / max(len(raw_scores), 1)))
    threat_level = score_to_level(threat_score, threshold_medium, threshold_high, threshold_critical)

    merged = " ".join(text_blob)
    if any(k in merged for k in URGENT_KEYWORDS):
        sentiment = "긴급"
    elif any(k in merged for k in RECOVERY_KEYWORDS):
        sentiment = "회복"
    else:
        sentiment = "일반"

    abu_score = _city_score(articles, ("abu dhabi", "abudhabi", "zayed", "아부다비"))
    dxb_score = _city_score(articles, ("dubai", "dxb", "두바이"))

    abu_level = score_to_level(abu_score, threshold_medium, threshold_high, threshold_critical)
    dxb_level = score_to_level(dxb_score, threshold_medium, threshold_high, threshold_critical)

    top_titles = [a.get("title", "").strip() for a in articles[:3] if a.get("title")]
    if not top_titles:
        top_titles = ["핵심 기사 제목을 확인할 수 없습니다."]

    return {
        "threat_level": threat_level,
        "threat_score": threat_score,
        "sentiment": sentiment,
        "abu_dhabi_level": abu_level,
        "dubai_level": dxb_level,
        "summary": f"총 {len(articles)}건 기준 룰 기반 위험 평가",
        "recommended_action": _recommended_action(threat_level),
        "key_points": top_titles,
        "analysis_source": "fallback",
    }


def build_phase2_prompt(articles: list[dict], language: str = "ko") -> str:
    sample = []
    for a in articles[:12]:
        sample.append(f"- [{a.get('source', 'Unknown')}] {a.get('title', '').strip()} ({a.get('link', '').strip()})")
    joined = "\n".join(sample)
    lang_hint = "Korean" if language.lower().startswith("ko") else "English"
    return (
        "You are a UAE safety analyst. Assess threat levels for residents.\n"
        "Return ONLY valid JSON (no markdown) with keys exactly:\n"
        'threat_level, threat_score, sentiment, abu_dhabi_level, dubai_level, summary, recommended_action, key_points\n'
        "Rules:\n"
        "- threat_level/abu_dhabi_level/dubai_level must be one of LOW|MEDIUM|HIGH|CRITICAL\n"
        "- threat_score must be integer 0..100\n"
        "- sentiment must be one of 긴급|일반|회복\n"
        "- key_points must be a short array of strings\n"
        f"- Write summary and recommended_action in {lang_hint}\n\n"
        f"Articles:\n{joined}"
    )


def parse_analysis_payload(
    payload: dict[str, Any],
    fallback: AnalysisResult,
    threshold_medium: int = 40,
    threshold_high: int = 70,
    threshold_critical: int = 85,
) -> AnalysisResult:
    level_from_payload = normalize_level(payload.get("threat_level"), fallback["threat_level"])
    score = _clip_score(_to_int(payload.get("threat_score"), fallback["threat_score"]))
    normalized_from_score = score_to_level(score, threshold_medium, threshold_high, threshold_critical)

    if VALID_LEVELS.index(level_from_payload) > VALID_LEVELS.index(normalized_from_score):
        final_level = level_from_payload
        score = max(score, {"LOW": 20, "MEDIUM": 50, "HIGH": 75, "CRITICAL": 90}[level_from_payload])
    else:
        final_level = normalized_from_score

    summary = str(payload.get("summary") or fallback["summary"]).strip()
    action = str(payload.get("recommended_action") or _recommended_action(final_level)).strip()
    key_points_raw = payload.get("key_points")
    key_points: list[str] = []
    if isinstance(key_points_raw, list):
        for item in key_points_raw:
            text = str(item).strip()
            if text:
                key_points.append(text)
    if not key_points:
        key_points = fallback["key_points"]

    abu = normalize_level(payload.get("abu_dhabi_level"), fallback["abu_dhabi_level"])
    dxb = normalize_level(payload.get("dubai_level"), fallback["dubai_level"])
    sentiment = _normalize_sentiment(payload.get("sentiment"), summary)

    return {
        "threat_level": final_level,
        "threat_score": score,
        "sentiment": sentiment,
        "abu_dhabi_level": abu,
        "dubai_level": dxb,
        "summary": summary,
        "recommended_action": action,
        "key_points": key_points[:5],
        "analysis_source": "notebooklm",
    }


def analyze_with_notebooklm_client(
    client: Any,
    notebook_id: str,
    articles: list[dict],
    timeout: float = 90.0,
    language: str = "ko",
    threshold_medium: int = 40,
    threshold_high: int = 70,
    threshold_critical: int = 85,
) -> AnalysisResult:
    """Run NotebookLM query analysis and parse structured JSON response."""
    prompt = build_phase2_prompt(articles, language=language)
    response = client.query(notebook_id, prompt, timeout=timeout)
    if not isinstance(response, dict):
        raise ValueError("NotebookLM query returned invalid response")
    answer = str(response.get("answer", "")).strip()
    if not answer:
        raise ValueError("NotebookLM query returned empty answer")

    fallback = fallback_analyze(
        articles,
        threshold_medium=threshold_medium,
        threshold_high=threshold_high,
        threshold_critical=threshold_critical,
    )
    payload = extract_json_payload(answer)
    return parse_analysis_payload(
        payload,
        fallback=fallback,
        threshold_medium=threshold_medium,
        threshold_high=threshold_high,
        threshold_critical=threshold_critical,
    )


def analyze_with_notebooklm_or_fallback(
    client: Any,
    notebook_id: str,
    articles: list[dict],
    timeout: float = 90.0,
    language: str = "ko",
    threshold_medium: int = 40,
    threshold_high: int = 70,
    threshold_critical: int = 85,
) -> AnalysisResult:
    """Try NotebookLM analysis, fallback to rule-based when any error occurs."""
    try:
        return analyze_with_notebooklm_client(
            client=client,
            notebook_id=notebook_id,
            articles=articles,
            timeout=timeout,
            language=language,
            threshold_medium=threshold_medium,
            threshold_high=threshold_high,
            threshold_critical=threshold_critical,
        )
    except Exception:
        return fallback_analyze(
            articles,
            threshold_medium=threshold_medium,
            threshold_high=threshold_high,
            threshold_critical=threshold_critical,
        )


def should_send_immediate_alert(analysis: AnalysisResult | None, alert_levels_csv: str) -> bool:
    if not analysis:
        return False
    allowed = {normalize_level(s.strip(), default="LOW") for s in alert_levels_csv.split(",") if s.strip()}
    return analysis["threat_level"] in allowed
