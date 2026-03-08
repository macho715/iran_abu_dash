from __future__ import annotations

import os
import sys
from datetime import datetime

import structlog
from telegram import Bot
from telegram.error import BadRequest

from .config import settings

logger = structlog.get_logger()
TELEGRAM_MAX_MESSAGE_LEN = 4096
APPROVE_SEND_TOKEN = os.getenv("APPROVE_SEND_TOKEN", "APPROVE_SEND")
IMPORTANT_LINK_MIN_COUNT = 2
IMPORTANT_LINK_MAX_COUNT = 3
IMPORTANT_LINK_KEYWORDS = (
    "missile",
    "drone",
    "strike",
    "attack",
    "explosion",
    "retaliation",
    "evacu",
    "airspace",
    "airport",
    "warning",
    "alert",
    "military",
    "base",
    "security",
    "미사일",
    "드론",
    "공습",
    "폭발",
    "경보",
    "공항",
    "안보",
)


def _split_by_city(articles: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    ad_keywords = ("abu dhabi", "abudhabi", "zayed", "아부다비")
    dxb_keywords = ("dubai", "dxb", "두바이")

    ad_articles: list[dict] = []
    dxb_articles: list[dict] = []
    other_articles: list[dict] = []

    for article in articles:
        text = f"{article.get('title', '')} {article.get('link', '')}".lower()
        if any(k in text for k in ad_keywords):
            ad_articles.append(article)
            continue
        if any(k in text for k in dxb_keywords):
            dxb_articles.append(article)
            continue
        other_articles.append(article)

    return ad_articles, dxb_articles, other_articles


def _level_emoji(level: str) -> str:
    if level == "CRITICAL":
        return "🚨"
    if level == "HIGH":
        return "🔴"
    if level == "MEDIUM":
        return "🟡"
    return "🟢"


def _importance_score(article: dict) -> int:
    text = f"{article.get('title', '')} {article.get('source', '')} {article.get('link', '')}".lower()
    score = 0
    for kw in IMPORTANT_LINK_KEYWORDS:
        if kw in text:
            score += 1
    if "abu dhabi" in text or "아부다비" in text:
        score += 1
    if "dubai" in text or "두바이" in text:
        score += 1
    return score


def _select_priority_links(articles: list[dict], max_links: int = IMPORTANT_LINK_MAX_COUNT) -> list[str]:
    scored: list[tuple[int, int, str]] = []
    for idx, article in enumerate(articles):
        link = str(article.get("link", "")).strip()
        if not link:
            continue
        score = _importance_score(article)
        if score < 2:
            continue
        scored.append((score, idx, link))

    scored.sort(key=lambda item: (-item[0], item[1]))
    selected: list[str] = []
    seen: set[str] = set()
    for _, _, link in scored:
        if link in seen:
            continue
        selected.append(link)
        seen.add(link)
        if len(selected) >= max_links:
            break
    return selected


def _build_report(
    articles: list[dict],
    analysis: dict | None = None,
    notebook_url: str | None = None,
) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    report = f"🚨 *이란 전쟁 UAE 상황 실시간 보고* ({now})\n\n"

    if analysis:
        threat_level = str(analysis.get("threat_level", "LOW"))
        threat_score = analysis.get("threat_score", 0)
        sentiment = analysis.get("sentiment", "일반")
        ad_level = str(analysis.get("abu_dhabi_level", "LOW"))
        dxb_level = str(analysis.get("dubai_level", "LOW"))
        summary = str(analysis.get("summary", "")).strip()
        action = str(analysis.get("recommended_action", "")).strip()
        key_points = analysis.get("key_points") or []
        analysis_source = analysis.get("analysis_source", "unknown")

        report += "🧠 *Phase 2 AI 위협 평가*\n"
        report += f"• 전체 위협: {_level_emoji(threat_level)} *{threat_level}* ({threat_score}/100)\n"
        report += f"• 감성 톤: *{sentiment}*\n"
        report += f"• 도시별: Abu Dhabi {_level_emoji(ad_level)} *{ad_level}* | Dubai {_level_emoji(dxb_level)} *{dxb_level}*\n"
        report += f"• 분석 소스: `{analysis_source}`\n"
        if summary:
            report += f"• 요약: {summary}\n"
        if action:
            report += f"• 권고: {action}\n"

        if isinstance(key_points, list) and key_points:
            report += "• 핵심 포인트:\n"
            for point in key_points[:3]:
                report += f"  - {point}\n"
        report += "\n"

    ad_articles, dxb_articles, other = _split_by_city(articles)

    report += "📍 *1순위 (아부다비)*\n"
    for a in ad_articles[:3]:
        report += f"• [{a['source']}] {a['title']}\n"
    if not ad_articles:
        report += "• 현재 아부다비 관련 특이 동향 없음\n"

    report += "\n📍 *2순위 (두바이)*\n"
    for a in dxb_articles[:3]:
        report += f"• [{a['source']}] {a['title']}\n"
    if not dxb_articles:
        report += "• 현재 두바이 관련 특이 동향 없음\n"

    report += "\n📌 *전체 뉴스*\n"
    for a in other[:5]:
        report += f"• [{a['source']}] {a['title']}\n"

    if analysis and analysis.get("recommended_action"):
        report += f"\n> 🛡️ *안전 메시지*: {analysis['recommended_action']}\n"
    else:
        report += "\n> 🛡️ *안전 메시지*: Abu Dhabi / Dubai에 계신 분들은 불필요한 외출 자제 권고\n"

    priority_links = _select_priority_links(articles, IMPORTANT_LINK_MAX_COUNT)
    if len(priority_links) >= IMPORTANT_LINK_MIN_COUNT:
        report += "\n🔗 *주요 링크*\n"
        for link in priority_links:
            report += f"• {link}\n"
    elif notebook_url:
        logger.debug("중요 링크 미검출로 링크 섹션 생략", notebook_url=notebook_url)

    return report


def build_report_text(
    articles: list[dict],
    analysis: dict | None = None,
    notebook_url: str | None = None,
) -> str:
    """Public API: reusable report payload builder."""
    return _build_report(articles, analysis=analysis, notebook_url=notebook_url)


def _split_telegram_chunks(text: str, max_len: int = TELEGRAM_MAX_MESSAGE_LEN) -> list[str]:
    if not text:
        return []

    chunks: list[str] = []
    current = ""
    lines = text.splitlines(keepends=True)

    for line in lines:
        if len(line) > max_len:
            if current:
                chunks.append(current)
                current = ""
            for start in range(0, len(line), max_len):
                piece = line[start : start + max_len]
                if piece:
                    chunks.append(piece)
            continue

        if not current:
            current = line
            continue

        if len(current) + len(line) <= max_len:
            current += line
            continue

        chunks.append(current)
        current = line

    if current:
        chunks.append(current)

    return chunks


def _is_markdown_parse_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "can't parse entities" in message
        or "parse entities" in message
        or "can't find end of" in message
        or "entity" in message
    )


async def _send_telegram_chunk(bot: Bot, chunk: str, chunk_index: int, total_chunks: int) -> bool:
    try:
        await bot.send_message(
            chat_id=settings.TELEGRAM_CHAT_ID,
            text=chunk,
            parse_mode="Markdown",
        )
        return True
    except BadRequest as e:
        if not _is_markdown_parse_error(e):
            logger.error(
                "텔레그램 청크 전송 실패",
                error=str(e),
                chunk_index=chunk_index,
                total_chunks=total_chunks,
                chunk_length=len(chunk),
            )
            return False

        logger.warning(
            "텔레그램 Markdown 파싱 실패, plain text fallback 재시도",
            error=str(e),
            chunk_index=chunk_index,
            total_chunks=total_chunks,
            chunk_length=len(chunk),
        )
        try:
            await bot.send_message(
                chat_id=settings.TELEGRAM_CHAT_ID,
                text=chunk,
                parse_mode=None,
            )
            return True
        except Exception as fallback_error:
            logger.error(
                "텔레그램 plain text fallback 전송 실패",
                error=str(fallback_error),
                chunk_index=chunk_index,
                total_chunks=total_chunks,
                chunk_length=len(chunk),
            )
            return False
    except Exception as e:
        logger.error(
            "텔레그램 청크 전송 실패",
            error=str(e),
            chunk_index=chunk_index,
            total_chunks=total_chunks,
            chunk_length=len(chunk),
        )
        return False


async def _send_telegram(report: str) -> bool:
    if not settings.TELEGRAM_BOT_TOKEN or settings.TELEGRAM_BOT_TOKEN == "your_bot_token_here":
        logger.warning("TELEGRAM_BOT_TOKEN 미설정, 텔레그램 전송 생략")
        return True
    try:
        bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
        chunks = _split_telegram_chunks(report, TELEGRAM_MAX_MESSAGE_LEN)
        if not chunks:
            logger.warning("전송할 텔레그램 보고서가 비어 있음")
            return True

        total_chunks = len(chunks)
        logger.debug(
            "텔레그램 분할 전송 시작",
            total_chunks=total_chunks,
            total_length=len(report),
        )

        for index, chunk in enumerate(chunks, start=1):
            logger.debug(
                "텔레그램 청크 전송 시도",
                chunk_index=index,
                total_chunks=total_chunks,
                chunk_length=len(chunk),
            )
            ok = await _send_telegram_chunk(bot, chunk, index, total_chunks)
            if not ok:
                return False

        logger.info("📱 텔레그램 보고서 전송 완료", total_chunks=total_chunks)
        return True
    except Exception as e:
        logger.error("텔레그램 전송 실패", error=str(e))
        return False


def _send_whatsapp(report: str) -> bool:
    if not settings.TWILIO_ACCOUNT_SID or settings.TWILIO_ACCOUNT_SID == "your_twilio_account_sid":
        logger.warning("TWILIO_ACCOUNT_SID 미설정, WhatsApp 전송 생략")
        return True

    try:
        from twilio.rest import Client

        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

        max_len = 1500
        chunks = [report[i : i + max_len] for i in range(0, len(report), max_len)]
        recipients = [n.strip() for n in settings.WHATSAPP_RECIPIENTS.split(",") if n.strip()]

        for number in recipients:
            to = f"whatsapp:{number}"
            frm = f"whatsapp:{settings.TWILIO_WHATSAPP_FROM}"
            for chunk in chunks:
                client.messages.create(body=chunk, from_=frm, to=to)
            logger.info("💬 WhatsApp 전송 완료", to=number)
        return True
    except Exception as e:
        logger.error("WhatsApp 전송 실패", error=str(e))
        return False


async def send_telegram_alert(message: str) -> bool:
    if not settings.TELEGRAM_BOT_TOKEN or settings.TELEGRAM_BOT_TOKEN == "your_bot_token_here":
        logger.warning("TELEGRAM_BOT_TOKEN 미설정, 즉시 경보 생략")
        return True
    try:
        bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
        await bot.send_message(chat_id=settings.TELEGRAM_CHAT_ID, text=message)
        logger.info("📢 즉시 경보 전송 완료")
        return True
    except Exception as e:
        logger.error("즉시 경보 전송 실패", error=str(e))
        return False


def _approve_send_required() -> bool:
    if sys.stdin is None or not getattr(sys.stdin, "isatty", lambda: False)():
        expected_token = os.getenv("APPROVE_SEND_TOKEN", APPROVE_SEND_TOKEN)
        if os.getenv("APPROVE_SEND") == expected_token:
            logger.info("승인 토큰 환경변수 확인: 전송 승인", token=expected_token)
            return True
        logger.warning("비대화형 모드 승인 토큰 미확인: 전송 생략", expected_token=expected_token)
        return False

    try:
        entered = input(f"전송 승인 토큰 입력 ({APPROVE_SEND_TOKEN}): ").strip()
        if entered == APPROVE_SEND_TOKEN:
            logger.info("승인 토큰 입력 완료")
            return True
        logger.warning("승인 토큰 불일치")
        return False
    except Exception:
        logger.warning("승인 입력 실패: 전송 생략")
        return False


async def send_report_text(
    report: str,
    *,
    approval_required: bool = False,
) -> dict[str, bool]:
    if approval_required and not _approve_send_required():
        logger.warning("승인되지 않음: 텔레그램/WhatsApp 미전송 (outbox mirror 대상)")
        return {"telegram": False, "whatsapp": False, "approved": False}

    telegram_ok = await _send_telegram(report)
    whatsapp_ok = _send_whatsapp(report)
    return {"telegram": telegram_ok, "whatsapp": whatsapp_ok, "approved": True}


async def send_telegram_report(
    articles: list[dict],
    analysis: dict | None = None,
    notebook_url: str | None = None,
    approval_required: bool = False,
) -> dict[str, bool]:
    report = build_report_text(articles, analysis=analysis, notebook_url=notebook_url)
    return await send_report_text(report, approval_required=approval_required)
