"""
UAE 미디어 스크래퍼 (투트랙 구조 v2)
======================================
트랙 1 (Primary): Playwright 브라우저 — JS 렌더링
트랙 2 (Fallback): httpx + BeautifulSoup — 방화벽/SSL 우회
두 트랙 결과를 합쳐서 반환합니다.
"""

import asyncio

import httpx
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from ..config import settings

logger = structlog.get_logger()

# 기사 관련성 키워드 (넓게 설정 - UAE/이란 뉴스 모두 포함)
KEYWORDS = [
    "iran", "uae", "abu dhabi", "dubai", "attack", "missile", "drone",
    "airspace", "airport", "military", "conflict", "war", "strike",
    "이란", "아부다비", "두바이", "공격", "미사일", "전쟁",
    "security", "evacuation", "alert", "warning", "explosion",
    "houthi", "hezbollah", "qatar", "gulf"
]

SOURCES = [
    {
        "name": "Gulf News",
        "playwright_url": "https://gulfnews.com/uae",
        "httpx_url": "https://gulfnews.com/uae",
        "base_url": "https://gulfnews.com",
    },
    {
        "name": "Khaleej Times",
        "playwright_url": "https://www.khaleejtimes.com/uae",
        "httpx_url": "https://www.khaleejtimes.com/uae",
        "base_url": "https://www.khaleejtimes.com",
    },
    {
        "name": "The National",
        "playwright_url": "https://www.thenationalnews.com/uae/",
        "httpx_url": "https://www.thenationalnews.com/uae/",
        "base_url": "https://www.thenationalnews.com",
    },
    # 이란-UAE 직접 검색도 병행
    {
        "name": "Gulf News (Search)",
        "playwright_url": "https://gulfnews.com/search?q=iran+uae",
        "httpx_url": "https://gulfnews.com/search?q=iran+uae",
        "base_url": "https://gulfnews.com",
    },
    {
        "name": "Khaleej Times (Search)",
        "playwright_url": "https://www.khaleejtimes.com/search?q=iran+attack",
        "httpx_url": "https://www.khaleejtimes.com/search?q=iran+attack",
        "base_url": "https://www.khaleejtimes.com",
    },
]

# httpx에서 링크를 뽑을 때 사용하는 셀렉터 (다양하게 시도)
LINK_SELECTORS = [
    "article a[href]",
    "h2 a[href]",
    "h3 a[href]",
    ".title a[href]",
    "a.story-card__title[href]",
    "a[href*='/uae/']",
    "a[href*='/world/']",
    "a[href*='/middle-east/']",
    "a[href*='/news/']",
]


# ── 공통 유틸 ──────────────────────────────────────────────────────────────────

def _is_relevant(title: str) -> bool:
    """UAE/이란 관련 기사 필터링 (관대하게)"""
    if not title or len(title) < 10:
        return False
    t = title.lower()
    return any(kw in t for kw in KEYWORDS)


def _build_full_link(href: str, base_url: str) -> str:
    if not href:
        return ""
    if href.startswith("http"):
        return href
    if href.startswith("//"):
        return "https:" + href
    return base_url.rstrip("/") + "/" + href.lstrip("/")


# ── 트랙 1: Playwright ─────────────────────────────────────────────────────────

@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=2))
async def _scrape_playwright(source: dict) -> list[dict]:
    results = []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=settings.HEADLESS)
            context = await browser.new_context(ignore_https_errors=True)
            page = await context.new_page()
            await page.goto(
                source["playwright_url"],
                wait_until=settings.SCRAPER_WAIT_UNTIL,
                timeout=settings.SCRAPER_TIMEOUT_MS,
            )
            # h2, h3 태그 안에 있는 링크 찾기
            headings = await page.query_selector_all("h2 a, h3 a, article a")
            for h in headings[:10]:
                title = (await h.inner_text()).strip()
                href = await h.get_attribute("href") or ""
                if not title or not _is_relevant(title):
                    continue
                link = _build_full_link(href, source["base_url"])
                results.append({"source": source["name"], "title": title, "link": link})
            await browser.close()
    except Exception as e:
        logger.warning(f"[Playwright] {source['name']} 실패", error=str(e))
    return results


# ── 트랙 2: httpx + BeautifulSoup ─────────────────────────────────────────────

async def _scrape_httpx(source: dict) -> list[dict]:
    results = []
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    try:
        async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=25) as client:
            resp = await client.get(source["httpx_url"], headers=headers)
            if resp.status_code != 200:
                logger.warning(f"[httpx] {source['name']} HTTP {resp.status_code}")
                return []
            soup = BeautifulSoup(resp.text, "html.parser")

            seen_titles: set[str] = set()
            for sel in LINK_SELECTORS:
                for a_tag in soup.select(sel)[:8]:
                    title = a_tag.get_text(strip=True)
                    href = a_tag.get("href", "")
                    if not title or not _is_relevant(title):
                        continue
                    if title in seen_titles:
                        continue
                    seen_titles.add(title)
                    link = _build_full_link(href, source["base_url"])
                    results.append({
                        "source": f"{source['name']}",
                        "title": title,
                        "link": link,
                    })
    except Exception as e:
        logger.warning(f"[httpx] {source['name']} 실패", error=str(e))
    return results


# ── 투트랙 통합 ───────────────────────────────────────────────────────────────

async def scrape_uae_media() -> list[dict]:
    """Playwright + httpx 양쪽에서 스크랩 후 합산 반환"""
    logger.info("UAE 미디어 스크랩 시작 (투트랙 v2)")
    tasks = []
    for src in SOURCES:
        tasks.append(_scrape_playwright(src))
        tasks.append(_scrape_httpx(src))

    raw = await asyncio.gather(*tasks, return_exceptions=True)

    # 중복 제거 (제목 기준)
    seen: set[str] = set()
    results = []
    for r in raw:
        if not isinstance(r, list):
            continue
        for art in r:
            key = art["title"].lower().strip()
            if key not in seen:
                seen.add(key)
                results.append(art)

    logger.info("UAE 스크랩 완료", total=len(results))
    return results


if __name__ == "__main__":
    arts = asyncio.run(scrape_uae_media())
    print(f"\n✅ 총 {len(arts)}개 기사 수집")
    for a in arts:
        print(f"\n  [{a['source']}] {a['title']}")
        print(f"  → {a['link']}")
