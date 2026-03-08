"""
RSS 피드 스크래퍼 (Phase 1 안정화)
====================================
Gulf News, Al Bawaba, BBC, AP 등 RSS로 수집.
기존 파이프라인과 동일한 형식: list[dict] with source, title, link.
"""

import asyncio
import socket
from typing import Any

import feedparser
import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from ..config import settings

logger = structlog.get_logger()

# UAE/이란 관련 키워드 (uae_media와 동일한 관대한 필터)
KEYWORDS = [
    "iran", "uae", "abu dhabi", "dubai", "attack", "missile", "drone",
    "airspace", "airport", "military", "conflict", "war", "strike",
    "security", "evacuation", "alert", "warning", "explosion",
    "gulf", "middle east", "saudi", "qatar", "bahrain", "oman",
]

# UAE local / MENA first, then international (verified 2026-03-01)
RSS_FEEDS = [
    {"name": "Gulf News", "url": "https://gulfnews.com/feed"},
    {"name": "Al Bawaba News", "url": "https://www.albawaba.com/rss/news"},
    {"name": "BBC Middle East", "url": "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml"},
    {"name": "BBC World", "url": "https://feeds.bbci.co.uk/news/world/rss.xml"},
]

AP_FEEDS = [
    {"name": "AP Top News", "url": "https://feeds.apnews.com/rss/topnews"},
]


def _is_relevant(title: str, summary: str = "") -> bool:
    """UAE/이란/걸프 관련 기사만 필터 (관대하게)"""
    if not title or len(title) < 5:
        return False
    text = (title + " " + (summary or "")).lower()
    return any(kw in text for kw in KEYWORDS)


def _entry_to_article(entry: Any, source_name: str) -> dict | None:
    """feedparser entry -> {source, title, link}"""
    title = (getattr(entry, "title", None) or "").strip()
    link = (getattr(entry, "link", None) or "").strip()
    if not title or not link:
        return None
    summary = getattr(entry, "summary", "") or getattr(entry, "description", "") or ""
    if not _is_relevant(title, summary):
        return None
    return {"source": source_name, "title": title, "link": link}


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=2))
def _fetch_feed(url: str) -> tuple[list[Any], bool, str]:
    """
    동기: 단일 RSS URL fetch (run_in_executor용).
    Returns (entries, failed, fail_reason).
    fail_reason: ok | dns_error | timeout | http_non_2xx | html_content | parse_error | unknown_error
    """
    headers = {"User-Agent": settings.RSS_USER_AGENT}
    try:
        response = httpx.get(url, headers=headers, timeout=settings.RSS_TIMEOUT_SEC)
        if response.status_code >= 400:
            logger.debug("RSS skip: non-2xx", url=url, status=response.status_code)
            return ([], True, "http_non_2xx")
        ct = response.headers.get("content-type", "").lower()
        if "text/html" in ct:
            logger.debug("RSS skip: HTML response", url=url)
            return ([], True, "html_content")
        parsed = feedparser.parse(response.content)
        if getattr(parsed, "bozo", False) and parsed.bozo_exception:
            if settings.RSS_LOG_VERBOSE_ERRORS:
                logger.warning("RSS 파싱 경고", url=url, error=str(parsed.bozo_exception))
            else:
                logger.debug("RSS parse bozo", url=url, error=str(parsed.bozo_exception))
            if not list(parsed.entries or []):
                return ([], True, "parse_error")
        return (list(parsed.entries or []), False, "ok")
    except httpx.TimeoutException as e:
        if settings.RSS_LOG_VERBOSE_ERRORS:
            logger.warning("RSS fetch timeout", url=url, error=str(e))
        return ([], True, "timeout")
    except httpx.ConnectError as e:
        err = str(e).lower()
        cause = getattr(e, "__cause__", None)
        is_dns = "getaddrinfo" in err or isinstance(cause, socket.gaierror)
        if settings.RSS_LOG_VERBOSE_ERRORS:
            logger.warning("RSS connect error", url=url, error=str(e), dns_error=is_dns)
        return ([], True, "dns_error" if is_dns else "unknown_error")
    except Exception as e:
        if settings.RSS_LOG_VERBOSE_ERRORS:
            logger.warning("RSS fetch 실패", url=url, error=str(e))
        return ([], True, "unknown_error")


def _build_feed_list() -> list[dict]:
    feeds = list(RSS_FEEDS)
    if settings.RSS_ENABLE_AP_FEED:
        feeds.extend(AP_FEEDS)
    return feeds


async def scrape_rss() -> list[dict]:
    """
    모든 RSS 피드를 비동기로 수집하여 기사 리스트 반환.
    반환 형식: [{"source": str, "title": str, "link": str}, ...]
    """
    all_entries: list[tuple[str, Any]] = []
    feeds = _build_feed_list()
    loop = asyncio.get_event_loop()

    async def fetch_one(name: str, url: str) -> tuple[list[tuple[str, Any]], bool, str]:
        entries, failed, fail_reason = await loop.run_in_executor(None, _fetch_feed, url)
        return ([(name, e) for e in entries], failed, fail_reason)

    results = await asyncio.gather(*[fetch_one(f["name"], f["url"]) for f in feeds])
    fail_count = sum(1 for _, failed, _ in results if failed)
    fail_by_reason: dict[str, int] = {}
    for result_entries, failed, fail_reason in results:
        all_entries.extend(result_entries)
        if failed:
            fail_by_reason[fail_reason] = fail_by_reason.get(fail_reason, 0) + 1

    seen_links: set[str] = set()
    articles: list[dict] = []
    for source_name, entry in all_entries:
        a = _entry_to_article(entry, source_name)
        if a and a["link"] not in seen_links:
            seen_links.add(a["link"])
            articles.append(a)

    success_count = len(feeds) - fail_count
    logger.info(
        "RSS 스크랩 완료",
        total=len(articles),
        feeds=len(feeds),
        success_count=success_count,
        fail_count=fail_count,
        fail_by_reason=fail_by_reason,
    )
    return articles
