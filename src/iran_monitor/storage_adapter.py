from __future__ import annotations

from typing import Iterable

from .phase2_ai import AnalysisResult
from .storage import iso_now, make_run_id, sha1_hex

THREAT_LEVELS = ("LOW", "MEDIUM", "HIGH", "CRITICAL")

AD_KEYWORDS = ("abu dhabi", "abudhabi", "zayed", "아부다비")
DXB_KEYWORDS = ("dubai", "dxb", "두바이")

TIER_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("T0", ("missile", "drone strike", "airport closed", "airspace closed", "evacuation", "casualties")),
    ("T1", ("attack", "strike", "explosion", "emergency", "warning", "intercepted")),
    ("T2", ("military", "alert", "conflict", "flight suspension", "flight cancelled")),
)


def _normalize_level(level: str | None, default: str = "LOW") -> str:
    upper = str(level or "").strip().upper()
    if upper in THREAT_LEVELS:
        return upper
    return default


def _city_from_article(article: dict) -> str:
    text = f"{article.get('title', '')} {article.get('link', '')}".lower()
    if any(k in text for k in AD_KEYWORDS):
        return "AD"
    if any(k in text for k in DXB_KEYWORDS):
        return "DXB"
    return "OTHER"


def _tier_from_article(article: dict) -> str:
    text = f"{article.get('title', '')} {article.get('link', '')}".lower()
    for tier, keywords in TIER_RULES:
        if any(k in text for k in keywords):
            return tier
    return "T3"


def build_run_payload(
    *,
    analysis: AnalysisResult,
    notebook_url: str | None,
    articles: list[dict],
    flags: Iterable[str] | None = None,
    run_ts: str | None = None,
    run_id: str | None = None,
) -> dict:
    run_ts = run_ts or iso_now()
    run_id = run_id or make_run_id(run_ts)
    links = [a.get("link", "").strip() for a in articles if a.get("link")]
    links_sorted = sorted(set(links))
    evidence_hash = sha1_hex("".join(links_sorted))
    summary = str(analysis.get("summary", "")).strip()

    ad_level = _normalize_level(analysis.get("abu_dhabi_level"))
    dxb_level = _normalize_level(analysis.get("dubai_level"))

    summary_ad = f"Abu Dhabi({ad_level}): {summary}" if summary else f"Abu Dhabi({ad_level})"
    summary_dxb = f"Dubai({dxb_level}): {summary}" if summary else f"Dubai({dxb_level})"

    return {
        "run_id": run_id,
        "run_ts": run_ts,
        "threat_level": _normalize_level(analysis.get("threat_level")),
        "score": int(analysis.get("threat_score", 0)),
        "sentiment": analysis.get("sentiment", "일반"),
        "summary_ad": summary_ad,
        "summary_dxb": summary_dxb,
        "delta": {"NEW": links_sorted, "UPDATED": [], "REMOVED": []},
        "flags": sorted(set(flags or [])),
        "evidence": {"links": links_sorted, "hash": evidence_hash},
        "notebook_url": notebook_url or "",
        "pack_id": run_id,
    }


def build_article_rows(*, articles: list[dict], run_ts: str) -> list[dict]:
    rows: list[dict] = []
    for article in articles:
        link = str(article.get("link") or "").strip()
        if not link:
            continue
        rows.append(
            {
                "canonical_url": link,
                "source": str(article.get("source") or ""),
                "title": str(article.get("title") or ""),
                "city": _city_from_article(article),
                "tier": _tier_from_article(article),
                "first_seen_ts": run_ts,
                "last_seen_ts": run_ts,
            }
        )
    return rows


def build_outbox_rows(
    *,
    report_text: str,
    created_ts: str | None = None,
    include_whatsapp: bool = True,
) -> list[dict]:
    created_ts = created_ts or iso_now()
    rows = [
        {
            "channel": "telegram",
            "payload": report_text,
            "created_ts": created_ts,
        }
    ]
    if include_whatsapp:
        rows.append(
            {
                "channel": "whatsapp",
                "payload": report_text,
                "created_ts": created_ts,
            }
        )
    return rows
