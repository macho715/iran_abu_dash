from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import httpx

from ..state_engine import SignalEvent, SourceHealth


@dataclass(frozen=True)
class SourceSpec:
    source_id: str
    name: str
    url: str
    tier: str
    indicator_ids: tuple[str, ...]
    keywords: tuple[str, ...]
    critical_keywords: tuple[str, ...] = ()
    tags: tuple[str, ...] = field(default_factory=tuple)


def _classify_error(exc: Exception) -> str:
    if isinstance(exc, httpx.ReadTimeout | httpx.ConnectTimeout | httpx.TimeoutException):
        return "timeout"
    if isinstance(exc, httpx.HTTPStatusError):
        return "http_non_2xx"
    if isinstance(exc, httpx.TooManyRedirects):
        return "rate_limited"
    if isinstance(exc, httpx.ConnectError):
        return "unreachable"
    return "parse_error"


async def _fetch_text(client: httpx.AsyncClient, url: str) -> tuple[str, str, int | None, str | None]:
    try:
        response = await client.get(url)
        response.raise_for_status()
        return "ok", response.text[:200000], response.status_code, None
    except Exception as exc:
        status = _classify_error(exc)
        code = None
        if isinstance(exc, httpx.HTTPStatusError):
            code = exc.response.status_code
        return status, "", code, str(exc)


def _build_signal(spec: SourceSpec, text: str, checked_at: str) -> SignalEvent | None:
    body = (text or "").lower()
    if not body:
        return None

    hits = [kw for kw in spec.keywords if kw.lower() in body]
    critical_hits = [kw for kw in spec.critical_keywords if kw.lower() in body]
    if not hits and not critical_hits:
        return None

    base = 0.35 + min(0.30, 0.06 * len(hits))
    if critical_hits:
        base = max(base, 0.80)
    if spec.tier == "TIER0":
        base += 0.12

    tags = set(spec.tags)
    joined_hits = " ".join(hits + critical_hits).lower()
    closed_terms = ("closed", "closure", "blocked", "road closed", "shutdown", "shut down", "suspended")
    restricted_terms = ("restricted", "restriction", "checkpoint", "curfew", "limited")
    has_closed_term = any(term in body or term in joined_hits for term in closed_terms)
    has_restricted_term = any(term in body or term in joined_hits for term in restricted_terms)

    if ("border" in body or "crossing" in body or "border" in joined_hits or "crossing" in joined_hits):
        if has_closed_term:
            tags.add("border_closed")
        elif has_restricted_term:
            tags.add("border_restricted")

    if "route_a_congested" in tags and has_closed_term:
        tags.add("route_a_blocked")
    if "fujairah_disruption" in tags and has_closed_term:
        tags.add("route_d_blocked")
    if any(term in body for term in ("ghuwaifat", "saudi")):
        if has_closed_term:
            tags.add("route_c_blocked")
        elif has_restricted_term:
            tags.add("saudi_warning")
    if "leave immediately" in joined_hits:
        tags.add("kr_alert")
    if any(k in joined_hits for k in ("missile", "drone", "explosion", "strike")):
        tags.add("strike")

    summary = f"{spec.name}: matched {', '.join((critical_hits + hits)[:4])}"
    return {
        "source_id": spec.source_id,
        "source": spec.name,
        "tier": spec.tier,
        "origin": "source_probe",
        "indicator_ids": list(spec.indicator_ids),
        "score": max(0.0, min(1.0, base)),
        "confirmed": spec.tier == "TIER0" or len(hits) >= 2 or bool(critical_hits),
        "ts": checked_at,
        "summary": summary,
        "tags": sorted(tags),
    }


async def collect_source_specs(
    specs: list[SourceSpec],
    *,
    timeout_sec: float,
    checked_at: datetime,
) -> tuple[list[SignalEvent], dict[str, SourceHealth]]:
    signals: list[SignalEvent] = []
    health: dict[str, SourceHealth] = {}
    checked_iso = checked_at.isoformat(timespec="seconds")

    timeout = httpx.Timeout(timeout_sec)
    headers = {
        "User-Agent": "Iran-UAE-Monitor/HyIE-ERC2",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
        tasks = [_fetch_text(client, spec.url) for spec in specs]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    for spec, result in zip(specs, results):
        if isinstance(result, Exception):
            status = _classify_error(result)
            health[spec.source_id] = {
                "name": spec.name,
                "url": spec.url,
                "tier": spec.tier,
                "status": status,
                "ok": False,
                "checked_at": checked_iso,
                "error": str(result),
            }
            continue

        status, text, http_status, error = result
        item: SourceHealth = {
            "name": spec.name,
            "url": spec.url,
            "tier": spec.tier,
            "status": status,
            "ok": status == "ok",
            "checked_at": checked_iso,
        }
        if http_status is not None:
            item["http_status"] = int(http_status)
        if error:
            item["error"] = error
        health[spec.source_id] = item

        if status != "ok":
            continue

        signal = _build_signal(spec, text, checked_iso)
        if signal:
            signals.append(signal)

    return signals, health
