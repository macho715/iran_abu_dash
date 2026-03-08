from __future__ import annotations

from datetime import datetime
import re
from typing import Any, TypedDict

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None


DUBAI_TZ = ZoneInfo("Asia/Dubai") if ZoneInfo else None


class SignalEvent(TypedDict, total=False):
    source_id: str
    source: str
    tier: str
    origin: str
    indicator_ids: list[str]
    score: float
    confirmed: bool
    ts: str
    summary: str
    tags: list[str]
    egress_eta_h: float


class SourceHealth(TypedDict, total=False):
    name: str
    url: str
    tier: str
    status: str
    ok: bool
    checked_at: str
    error: str
    http_status: int


INDICATOR_META: dict[str, dict[str, str]] = {
    "I01": {"name": "공식 여행경보/대사관 공지", "tier": "TIER0"},
    "I02": {"name": "공항/항공 운영", "tier": "TIER0"},
    "I03": {"name": "군사/안보 근접도", "tier": "TIER1"},
    "I04": {"name": "치안/도로 통제", "tier": "TIER1"},
    "I05": {"name": "통신/인프라", "tier": "TIER1"},
    "I06": {"name": "필수재/연료", "tier": "TIER2"},
    "I07": {"name": "외국정부 행동", "tier": "TIER0"},
}

TIER_WEIGHT = {
    "TIER0": 1.0,
    "TIER1": 0.85,
    "TIER2": 0.7,
}

DEFAULT_ROUTES: list[dict[str, Any]] = [
    {
        "id": "A",
        "name": "Al Ain → Buraimi → Sohar",
        "base_h": 7.0,
        "status": "OPEN",
        "congestion": 0.35,
        "note": "Default route",
    },
    {
        "id": "B",
        "name": "Mezyad → Nizwa",
        "base_h": 8.2,
        "status": "OPEN",
        "congestion": 0.25,
        "note": "Default route",
    },
    {
        "id": "C",
        "name": "Saudi Ghuwaifat → Riyadh",
        "base_h": 15.5,
        "status": "CAUTION",
        "congestion": 0.55,
        "note": "Default route",
    },
    {
        "id": "D",
        "name": "Fujairah → Khatmat → Muscat",
        "base_h": 9.3,
        "status": "OPEN",
        "congestion": 0.20,
        "note": "Default route",
    },
]

CHECKLIST_DEFAULT: list[dict[str, Any]] = [
    {"id": 1, "text": "Bug-out bag (여권/ID/현금USD+AED/물2L/비상식량)", "done": False},
    {"id": 2, "text": "차량 연료 Full 확인", "done": False},
    {"id": 3, "text": "오만 보험 Orange Card 사전 구매", "done": False},
    {"id": 4, "text": "대사관 긴급번호 저장", "done": False},
    {"id": 5, "text": "Al Ain/Buraimi 루트 오프라인 맵", "done": False},
    {"id": 6, "text": "가족/회사 비상연락 완료", "done": False},
    {"id": 7, "text": "15분 단위 주요 소스 확인", "done": False},
    {"id": 8, "text": "SMS 공습경보 수신 확인", "done": False},
]


def _now() -> datetime:
    if DUBAI_TZ is not None:
        return datetime.now(DUBAI_TZ)
    return datetime.utcnow()


def _iso(ts: datetime | None = None) -> str:
    return (ts or _now()).isoformat(timespec="seconds")


def _to_ts_iso(raw: Any) -> str:
    if isinstance(raw, datetime):
        dt = raw
        if dt.tzinfo is None and DUBAI_TZ is not None:
            dt = dt.replace(tzinfo=DUBAI_TZ)
        return dt.isoformat(timespec="seconds")

    text = str(raw or "").strip()
    if not text:
        return _iso()

    # Try ISO first (supports trailing Z)
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if dt.tzinfo is None and DUBAI_TZ is not None:
            dt = dt.replace(tzinfo=DUBAI_TZ)
        return dt.isoformat(timespec="seconds")
    except Exception:
        pass

    # Best-effort parse for legacy "Mar 3 14:00" style strings.
    match = re.match(r"^(?P<mon>[A-Za-z]{3})\s+(?P<day>\d{1,2})\s+(?P<hour>\d{1,2}):(?P<minute>\d{2})$", text)
    if match and DUBAI_TZ is not None:
        months = {
            "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
            "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
        }
        mon = months.get(match.group("mon").lower())
        if mon is not None:
            now = _now()
            dt = datetime(
                year=now.year,
                month=mon,
                day=int(match.group("day")),
                hour=int(match.group("hour")),
                minute=int(match.group("minute")),
                tzinfo=DUBAI_TZ,
            )
            return dt.isoformat(timespec="seconds")

    return _iso()


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _priority(score: float) -> str:
    if score >= 0.85:
        return "CRITICAL"
    if score >= 0.65:
        return "HIGH"
    return "MEDIUM"


def _round(value: float | None, digits: int = 3) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def _signal_fingerprint(source: Any, summary: Any) -> tuple[str, str]:
    return (
        str(source or "").strip().lower(),
        str(summary or "").strip().lower(),
    )


def _signal_sort_key(row: SignalEvent) -> tuple[float, float, str, str]:
    score = float(row.get("score", 0.0))
    ts_iso = _to_ts_iso(row.get("ts"))
    try:
        ts_value = datetime.fromisoformat(ts_iso.replace("Z", "+00:00")).timestamp()
    except Exception:
        ts_value = 0.0
    return (
        score,
        ts_value,
        str(row.get("source") or row.get("source_id") or ""),
        str(row.get("summary") or ""),
    )


_ROUTE_STATUS_PRIORITY = {
    "OPEN": 0,
    "CAUTION": 1,
    "BLOCKED": 2,
}


def _promote_route_status(mod: dict[str, Any], status: str) -> None:
    current = str(mod.get("status") or "OPEN").upper()
    next_status = str(status or "OPEN").upper()
    if _ROUTE_STATUS_PRIORITY.get(next_status, 0) >= _ROUTE_STATUS_PRIORITY.get(current, 0):
        mod["status"] = next_status


def _route_modifiers(signals: list[SignalEvent]) -> dict[str, dict[str, Any]]:
    mods: dict[str, dict[str, Any]] = {
        "A": {"congestion": 0.0, "status": None, "notes": []},
        "B": {"congestion": 0.0, "status": None, "notes": []},
        "C": {"congestion": 0.0, "status": None, "notes": []},
        "D": {"congestion": 0.0, "status": None, "notes": []},
    }

    for signal in signals:
        tags = {str(t).lower() for t in (signal.get("tags") or [])}
        summary = str(signal.get("summary") or "").lower()

        if "border_closed" in tags or any(term in summary for term in ("border closed", "border closure", "crossing closed")):
            _promote_route_status(mods["A"], "BLOCKED")
            _promote_route_status(mods["B"], "BLOCKED")
            mods["A"]["congestion"] += 0.25
            mods["B"]["congestion"] += 0.25
            mods["A"]["notes"].append("Border closure signal")
            mods["B"]["notes"].append("Border closure signal")

        if "border_restricted" in tags or any(term in summary for term in ("border restricted", "checkpoint restriction", "curfew")):
            _promote_route_status(mods["A"], "CAUTION")
            _promote_route_status(mods["B"], "CAUTION")
            mods["A"]["congestion"] += 0.15
            mods["B"]["congestion"] += 0.15
            mods["A"]["notes"].append("Border restriction signal")
            mods["B"]["notes"].append("Border restriction signal")

        if "route_a_congested" in tags or "al ain" in summary:
            mods["A"]["congestion"] += 0.2
            mods["A"]["notes"].append("Al Ain congestion")

        if "route_b_congested" in tags or "buraimi" in summary or "nizwa" in summary:
            mods["B"]["congestion"] += 0.2

        if "saudi_warning" in tags or "ghuwaifat" in summary:
            _promote_route_status(mods["C"], "CAUTION")
            mods["C"]["congestion"] += 0.1

        if "fujairah_disruption" in tags or "fujairah" in summary:
            _promote_route_status(mods["D"], "CAUTION")
            mods["D"]["congestion"] += 0.15

        if "route_a_blocked" in tags:
            _promote_route_status(mods["A"], "BLOCKED")
            mods["A"]["notes"].append("Route A blocked")
        if "route_b_blocked" in tags:
            _promote_route_status(mods["B"], "BLOCKED")
            mods["B"]["notes"].append("Route B blocked")
        if "route_c_blocked" in tags:
            _promote_route_status(mods["C"], "BLOCKED")
            mods["C"]["notes"].append("Route C blocked")
        if "route_d_blocked" in tags:
            _promote_route_status(mods["D"], "BLOCKED")
            mods["D"]["notes"].append("Route D blocked")

    return mods


def _indicator_values(signals: list[SignalEvent], prev_state: dict[str, Any] | None) -> tuple[list[dict[str, Any]], dict[str, float]]:
    by_id: dict[str, list[SignalEvent]] = {k: [] for k in INDICATOR_META}
    for signal in signals:
        for indicator_id in signal.get("indicator_ids") or []:
            if indicator_id in by_id:
                by_id[indicator_id].append(signal)

    prev_map = {
        str(item.get("id")): float(item.get("state", 0.0))
        for item in (prev_state or {}).get("indicators", [])
        if isinstance(item, dict)
    }

    indicators: list[dict[str, Any]] = []
    values: dict[str, float] = {}

    for indicator_id, meta in INDICATOR_META.items():
        rows = sorted(
            by_id.get(indicator_id, []),
            key=lambda row: float(row.get("score", 0.0)),
            reverse=True,
        )

        if rows:
            top = rows[0]
            tier_weight = TIER_WEIGHT.get(str(top.get("tier") or meta["tier"]), 0.75)
            state = _clamp(float(top.get("score", 0.0)) * tier_weight)
            srcs = sorted({str(r.get("source") or r.get("source_id") or "unknown") for r in rows})
            tier0_confirmed = any(str(r.get("tier") or "").upper() == "TIER0" and bool(r.get("confirmed")) for r in rows)
            confirmed_sources = {
                str(r.get("source") or r.get("source_id") or "unknown")
                for r in rows
                if bool(r.get("confirmed"))
            }
            # Evidence floor:
            # - at least one confirmed TIER0 source, OR
            # - at least two independent confirmed sources
            confirmed = bool(tier0_confirmed or len(confirmed_sources) >= 2)
            detail = " | ".join(
                [str(r.get("summary") or "").strip() for r in rows[:2] if str(r.get("summary") or "").strip()]
            ) or "fresh signal"
            ts = _to_ts_iso(top.get("ts"))
        else:
            state = _clamp(prev_map.get(indicator_id, 0.0) * 0.92)
            confirmed = False
            srcs = []
            detail = "No fresh signal in this cycle"
            ts = _iso()

        indicators.append(
            {
                "id": indicator_id,
                "name": meta["name"],
                "tier": meta["tier"],
                "state": _round(state, 3),
                "confirmed": confirmed,
                "detail": detail,
                "ts": ts,
                "tsIso": ts,
                "src": ", ".join(srcs[:4]) if srcs else "none",
                "src_count": len(srcs),
                # backward-compatible aliases for existing dashboard seed structure
                "srcCount": len(srcs),
                "cv": confirmed,
                "crossVerified": confirmed,
            }
        )
        values[indicator_id] = state

    return indicators, values


def _build_hypotheses(values: dict[str, float]) -> list[dict[str, Any]]:
    i01 = values.get("I01", 0.0)
    i02 = values.get("I02", 0.0)
    i03 = values.get("I03", 0.0)
    i04 = values.get("I04", 0.0)
    i05 = values.get("I05", 0.0)
    i06 = values.get("I06", 0.0)
    i07 = values.get("I07", 0.0)

    h2 = _clamp(0.15 + 0.22 * i01 + 0.20 * i02 + 0.22 * i03 + 0.08 * i04 + 0.08 * i05 + 0.08 * i06 + 0.15 * i07)
    h1 = _clamp(0.20 + 0.20 * i03 + 0.15 * i04 + 0.12 * i05 + 0.12 * i06 + 0.12 * i07 + 0.05 * i01)
    h0 = _clamp(1.0 - max(h1, h2) * 0.85)

    return [
        {"id": "H0", "name": "정상", "score": _round(h0)},
        {"id": "H1", "name": "악화", "score": _round(h1)},
        {"id": "H2", "name": "철수준비", "score": _round(h2)},
    ]


def _build_intel_feed(signals: list[SignalEvent], prev_state: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    prev_feed_items = [
        item for item in (prev_state or {}).get("intel_feed", [])
        if isinstance(item, dict)
    ]
    previous_fingerprints = {
        _signal_fingerprint(item.get("src") or item.get("source"), item.get("text") or item.get("summary"))
        for item in prev_feed_items
    }
    # Map fingerprint → firstSeenTs from previous feed for staleness tracking.
    prev_first_seen: dict[tuple[str, str], str] = {}
    for item in prev_feed_items:
        fp = _signal_fingerprint(item.get("src") or item.get("source"), item.get("text") or item.get("summary"))
        first = str(item.get("firstSeenTs") or item.get("tsIso") or item.get("ts") or "")
        if fp not in prev_first_seen and first:
            prev_first_seen[fp] = first

    official: list[SignalEvent] = []
    fresh: list[SignalEvent] = []
    repeated: list[SignalEvent] = []

    for row in signals:
        fingerprint = _signal_fingerprint(row.get("source") or row.get("source_id"), row.get("summary"))
        is_official = (
            str(row.get("origin") or "").lower() == "source_probe"
            and bool(row.get("confirmed"))
            and str(row.get("tier") or "").upper() == "TIER0"
        )
        if is_official:
            official.append(row)
        elif fingerprint in previous_fingerprints:
            repeated.append(row)
        else:
            fresh.append(row)

    ranked = (
        sorted(official, key=_signal_sort_key, reverse=True)
        + sorted(fresh, key=_signal_sort_key, reverse=True)
        + sorted(repeated, key=_signal_sort_key, reverse=True)
    )
    now_iso = _iso()
    feed: list[dict[str, Any]] = []
    for row in ranked[:24]:
        score = float(row.get("score", 0.0))
        ids = ", ".join(row.get("indicator_ids") or [])
        fingerprint = _signal_fingerprint(row.get("source") or row.get("source_id"), row.get("summary"))

        if row in official:
            status = "official"
        elif row in fresh:
            status = "fresh"
        else:
            status = "repeated"

        first_seen_ts = prev_first_seen.get(fingerprint, "") if status == "repeated" else ""
        if not first_seen_ts:
            first_seen_ts = _to_ts_iso(row.get("ts")) or now_iso

        feed.append(
            {
                "ts": _to_ts_iso(row.get("ts")),
                "tsIso": _to_ts_iso(row.get("ts")),
                "priority": _priority(score),
                "verified": bool(row.get("confirmed")),
                "text": str(row.get("summary") or "signal"),
                "src": str(row.get("source") or row.get("source_id") or "unknown"),
                "impact": f"{ids} updated (score={_round(score, 2)})",
                "status": status,
                "firstSeenTs": first_seen_ts,
            }
        )
    return feed


def build_state_payload(
    *,
    signals: list[SignalEvent],
    source_health: dict[str, SourceHealth] | None = None,
    prev_state: dict[str, Any] | None = None,
    now: datetime | None = None,
    manual_egress_eta_h: float | None = None,
) -> dict[str, Any]:
    now_dt = now or _now()
    state_ts = _iso(now_dt)
    source_health = source_health or {}

    indicators, values = _indicator_values(signals, prev_state)
    hypotheses = _build_hypotheses(values)
    h_scores = {h["id"]: float(h["score"]) for h in hypotheses}
    delta_score = _round(h_scores.get("H2", 0.0) - h_scores.get("H1", 0.0), 3) or 0.0

    failed_sources = [k for k, v in source_health.items() if not bool(v.get("ok"))]
    health_count = max(1, len(source_health))
    unique_sources = {str(s.get("source") or s.get("source_id") or "unknown") for s in signals}
    confirmed_count = sum(1 for s in signals if s.get("confirmed"))
    tier0_count = sum(1 for s in signals if str(s.get("tier") or "").upper() == "TIER0")
    signal_count = max(1, len(signals))
    source_diversity = _clamp(len(unique_sources) / 8.0)
    confirmed_ratio = _clamp(confirmed_count / signal_count)
    tier0_ratio = _clamp(tier0_count / signal_count)
    fail_ratio = _clamp(len(failed_sources) / health_count)

    evidence_conf = _clamp(
        0.15
        + 0.35 * source_diversity
        + 0.30 * confirmed_ratio
        + 0.20 * tier0_ratio
        - 0.15 * fail_ratio
    )

    egress_candidates = [
        float(s.get("egress_eta_h"))
        for s in signals
        if s.get("egress_eta_h") is not None
    ]
    egress_source = "none"
    egress_loss_eta = min(egress_candidates) if egress_candidates else None
    if egress_loss_eta is not None:
        egress_source = "signal"
    if manual_egress_eta_h is not None:
        manual_value = max(0.0, float(manual_egress_eta_h))
        egress_loss_eta = manual_value
        egress_source = "manual"

    urgency: float | None = None
    effective_threshold = 0.8
    routes: list[dict[str, Any]] = []
    slack_hours: float | None = None

    joined_text = " ".join(str(s.get("summary") or "") for s in signals).lower()

    triggers = {
        "red_imminent": False,
        "air_update": any("I02" in (s.get("indicator_ids") or []) for s in signals),
        "border_change": any(
            ("border_closed" in {str(t).lower() for t in (s.get("tags") or [])})
            or ("border_restricted" in {str(t).lower() for t in (s.get("tags") or [])})
            for s in signals
        ),
        "strike_detected": (
            any(k in joined_text for k in ("explosion", "missile", "drone", "strike"))
            and any(k in joined_text for k in ("uae", "abu dhabi", "dubai"))
        ),
        "comms_degraded": len(failed_sources) >= 3,
        "kr_leave_immediately": (
            "leave immediately" in joined_text
            and any(k in joined_text for k in ("korea", "한국", "외교부"))
        ),
    }

    # Estimate egress ETA when no explicit signal/manual value is present.
    if egress_loss_eta is None:
        if triggers["border_change"]:
            egress_loss_eta = 12.0
            egress_source = "estimated_border"
        elif triggers["strike_detected"]:
            egress_loss_eta = 18.0
            egress_source = "estimated_strike"
        elif evidence_conf >= 0.75:
            egress_loss_eta = 24.0
            egress_source = "estimated_confidence"

    if egress_loss_eta is not None:
        urgency = _clamp(1.0 - (egress_loss_eta / 48.0))
    effective_threshold = _clamp(0.80 - (0.15 * urgency if urgency is not None else 0.0), 0.55, 0.90)

    route_mods = _route_modifiers(signals)
    buffer_factor = _clamp(2.2 - (urgency * 0.8 if urgency is not None else 0.2), 1.4, 2.2)
    routes = []
    for base in DEFAULT_ROUTES:
        route_id = str(base["id"])
        mod = route_mods[route_id]
        congestion = _clamp(float(base["congestion"]) + float(mod["congestion"]), 0.0, 0.95)
        status = str(mod["status"] or base["status"])
        effective_h = float(base["base_h"]) * (1.0 + congestion) * buffer_factor
        note = "; ".join(mod["notes"]) if mod["notes"] else str(base["note"])
        routes.append(
            {
                "id": route_id,
                "name": base["name"],
                "status": status,
                "base_h": float(base["base_h"]),
                "congestion": _round(congestion, 3),
                "effective_h": _round(effective_h, 2),
                "note": note,
            }
        )

    min_effective_h = min((float(r["effective_h"]) for r in routes), default=None)
    if egress_loss_eta is not None and min_effective_h is not None:
        slack_hours = _round(egress_loss_eta - min_effective_h, 2)

    triggers["red_imminent"] = bool(delta_score > 0.20 or evidence_conf > effective_threshold)

    degraded = bool(fail_ratio >= 0.40 or triggers["comms_degraded"])
    flags: list[str] = []
    if not signals:
        flags.append("NO_SIGNALS")
    if degraded:
        flags.append("SOURCE_DEGRADED")
    if egress_loss_eta is None:
        flags.append("EGRESS_ETA_MISSING")
    if failed_sources:
        flags.append("SOURCE_FAILURES:" + ",".join(sorted(failed_sources)[:6]))

    payload = {
        "state_ts": state_ts,
        "status": "degraded" if degraded else "ok",
        "source_health": source_health,
        "degraded": degraded,
        "flags": flags,
        "indicators": indicators,
        "hypotheses": hypotheses,
        "evidence_conf": _round(evidence_conf),
        "urgency": _round(urgency),
        "effective_threshold": _round(effective_threshold),
        "egress_loss_eta": _round(egress_loss_eta, 2),
        "egress_eta_source": egress_source,
        "slack_hours": _round(slack_hours, 2),
        "routes": routes,
        "triggers": triggers,
        "delta_score": _round(delta_score),
        "intel_feed": _build_intel_feed(signals, prev_state=prev_state),
        "checklist": CHECKLIST_DEFAULT,
        # urgentdash compatibility payload keys
        "snapshot_ts": state_ts,
        "state_version": "hyie-erc2-v2026.05",
    }
    return payload


def warming_up_payload() -> dict[str, Any]:
    return {
        "state_ts": _iso(),
        "status": "warming_up",
        "source_health": {},
        "degraded": True,
        "flags": ["STATE_FILE_MISSING"],
        "indicators": [
            {
                "id": indicator_id,
                "name": meta["name"],
                "tier": meta["tier"],
                "state": 0.0,
                "confirmed": False,
                "detail": "warming_up",
                "ts": _iso(),
                "tsIso": _iso(),
                "src": "none",
                "src_count": 0,
                "srcCount": 0,
                "cv": False,
                "crossVerified": False,
            }
            for indicator_id, meta in INDICATOR_META.items()
        ],
        "hypotheses": [
            {"id": "H0", "name": "정상", "score": 0.0},
            {"id": "H1", "name": "악화", "score": 0.0},
            {"id": "H2", "name": "철수준비", "score": 0.0},
        ],
        "evidence_conf": 0.0,
        "urgency": None,
        "effective_threshold": 0.8,
        "egress_loss_eta": None,
        "egress_eta_source": "none",
        "slack_hours": None,
        "routes": [dict(route, effective_h=None) for route in DEFAULT_ROUTES],
        "triggers": {
            "red_imminent": False,
            "air_update": False,
            "border_change": False,
            "strike_detected": False,
            "comms_degraded": True,
            "kr_leave_immediately": False,
        },
        "delta_score": 0.0,
        "intel_feed": [],
        "checklist": CHECKLIST_DEFAULT,
        "snapshot_ts": _iso(),
        "state_version": "hyie-erc2-v2026.05",
    }
