"""Iran-UAE monitor app (canonical runtime).

Pipeline:
1) scrape (UAE + SNS + RSS)
2) deduplicate (persistent in Phase 4)
3) NotebookLM upload + phase2 analysis
4) immediate alert (HIGH/CRITICAL) + periodic report send
5) persist A+B storage (SQLite or Postgres) via persist_run_backend()
6) update health state
"""

from __future__ import annotations

import asyncio
import hashlib
import importlib
import json
import os
import re
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_MISSED, JobExecutionEvent
from notebooklm_tools.core.auth import AuthManager
from notebooklm_tools.core.client import NotebookLMClient

from .config import settings
from .live_publish import (
    default_live_root,
    load_json as load_live_json,
    merge_ai_into_snapshot,
    publish_ai_bundle,
    publish_lite_bundle,
    version_from_ts,
)
from .phase2_ai import (
    AnalysisResult,
    analyze_with_notebooklm_or_fallback,
    fallback_analyze,
    should_send_immediate_alert,
)
from .reporter import build_report_text, send_telegram_report, send_telegram_alert
from .route_geo import build_route_geo_payload
from .scrapers.rss_feed import scrape_rss
from .scrapers.social_media import scrape_social_media
from .scrapers.uae_media import scrape_uae_media
from .sources import collect_tier0_signals, collect_tier1_signals, collect_tier2_signals
from .state_engine import build_state_payload
from .storage import append_jsonl, ensure_layout, make_run_id, save_json
from .storage_adapter import build_article_rows, build_outbox_rows, build_run_payload
from .storage_backend import get_existing_canonical_urls, persist_run_backend

logger = structlog.get_logger()
_CROSS_CHECK_KEYWORDS = ("missile", "drone", "strike", "attack", "explosion", "warning")

# In-process dedup (still useful for long-running local mode)
_seen_hashes: set[str] = set()

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CANONICAL_ROOT = PROJECT_ROOT

NOTEBOOK_TITLE = "실시간 이란-UAE 보안 브리핑 (자동화)"


def _storage_root() -> Path:
    base = Path(settings.STORAGE_ROOT)
    if base.is_absolute():
        return base
    return (PROJECT_ROOT / base).resolve()


def _resolve_storage_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return (_storage_root() / path).resolve()


NOTEBOOKLM_ID_FILE = _resolve_storage_path(settings.NOTEBOOKLM_ID_FILE)
HEALTH_STATE_FILE = _resolve_storage_path(settings.HEALTH_STATE_FILE)
HYIE_STATE_FILE = _resolve_storage_path(settings.HYIE_STATE_FILE)
HYIE_EGRESS_ETA_FILE = _resolve_storage_path(settings.HYIE_EGRESS_ETA_FILE)
HYIE_INGEST_LOCK_FILE = _resolve_storage_path(settings.HYIE_INGEST_LOCK_FILE)
HYIE_STATE_META_FILE = _resolve_storage_path(settings.HYIE_STATE_META_FILE)
AI_INPUT_FILE = _resolve_storage_path("state/ai_input.json")
DUBAI_TZ = ZoneInfo("Asia/Dubai")

_LOCK_HELD_BY_CURRENT_PROCESS = False


def _now_dubai() -> datetime:
    return datetime.now(DUBAI_TZ)


def _article_hash(article: dict) -> str:
    key = (article.get("title", "") + article.get("link", "")).strip().lower()
    return hashlib.md5(key.encode()).hexdigest()


def _unique_by_canonical_url(articles: list[dict]) -> list[dict]:
    """Dedup within the same run by canonical_url(link)."""
    out: list[dict] = []
    seen: set[str] = set()
    for a in articles:
        url = str(a.get("link") or a.get("canonical_url") or "").strip()
        if not url:
            continue
        if url in seen:
            continue
        seen.add(url)
        # normalize for downstream storage_adapter
        a["canonical_url"] = url
        out.append(a)
    return out


def _filter_new_persistent(all_articles: list[dict]) -> list[dict]:
    """Phase 4 핵심: 재시작/크론에서도 중복 제거가 유지되어야 함.

    Priority:
    1) DB dedup (articles.canonical_url 존재 여부)
    2) in-process dedup (_seen_hashes)
    """
    # run-local dedup first
    unique = _unique_by_canonical_url(all_articles)

    # If storage is disabled, DB-dedup disabled, or running under pytest ->
    # fall back to in-process only for deterministic unit tests.
    if not settings.STORAGE_ENABLED or not settings.DEDUP_USE_DB or os.getenv("PYTEST_CURRENT_TEST"):
        return _filter_new_in_process(unique)

    try:
        storage_root = _storage_root()
        db_path = _resolve_storage_path(settings.STORAGE_DB_PATH)
        schema_path = _resolve_storage_path(settings.STORAGE_SCHEMA_PATH)

        urls = [str(a["canonical_url"]) for a in unique if a.get("canonical_url")]
        existing = get_existing_canonical_urls(
            root=storage_root,
            sqlite_db_path=db_path,
            sqlite_schema_path=schema_path,
            canonical_urls=urls,
        )
        new = [a for a in unique if str(a.get("canonical_url")) not in existing]
        # still guard against duplicates in the same process execution
        return _filter_new_in_process(new)
    except Exception as exc:
        logger.warning("DB 기반 dedup 실패 -> in-process dedup으로 fallback", error=str(exc))
        return _filter_new_in_process(unique)


def _filter_new_in_process(articles: list[dict]) -> list[dict]:
    new: list[dict] = []
    for article in articles:
        article_hash = _article_hash(article)
        if article_hash in _seen_hashes:
            continue
        _seen_hashes.add(article_hash)
        new.append(article)
    return new


def _load_notebook_id() -> str | None:
    if NOTEBOOKLM_ID_FILE.exists():
        notebook_id = NOTEBOOKLM_ID_FILE.read_text(encoding="utf-8").strip()
        if notebook_id:
            return notebook_id
    return None


def _save_notebook_id(notebook_id: str) -> None:
    NOTEBOOKLM_ID_FILE.write_text(notebook_id, encoding="utf-8")
    logger.info("노트북 ID 파일 저장", id=notebook_id, path=str(NOTEBOOKLM_ID_FILE))


def _extract_id(obj: Any) -> str:
    if isinstance(obj, dict):
        return obj.get("notebook_id") or obj.get("id", str(obj))
    if hasattr(obj, "model_dump"):
        data = obj.model_dump()
        return data.get("notebook_id") or data.get("id", str(obj))
    if hasattr(obj, "dict"):
        data = obj.dict()
        return data.get("notebook_id") or data.get("id", str(obj))
    return getattr(obj, "id", None) or getattr(obj, "notebook_id", str(obj))


def _create_notebook_client() -> NotebookLMClient:
    auth = AuthManager()
    profile = auth.load_profile()
    return NotebookLMClient(
        cookies=profile.cookies,
        csrf_token=profile.csrf_token,
        session_id=profile.session_id,
    )


def _get_or_create_notebook(client: NotebookLMClient) -> str:
    notebook_id = _load_notebook_id()
    if notebook_id:
        logger.info("저장된 NotebookLM 노트북 ID 재사용", id=notebook_id)
        return notebook_id

    try:
        notebooks = client.list_notebooks()
        matched: list[str] = []
        for notebook in notebooks:
            notebook_title = getattr(notebook, "title", "") or ""
            if NOTEBOOK_TITLE in notebook_title or "이란-UAE" in notebook_title:
                matched.append(_extract_id(notebook))
        if matched:
            notebook_id = matched[0]
            for duplicate_id in matched[1:]:
                try:
                    client.delete_notebook(duplicate_id)
                    logger.info("중복 NotebookLM 노트북 삭제", id=duplicate_id)
                except Exception:
                    pass
            _save_notebook_id(notebook_id)
            logger.info("기존 NotebookLM 노트북 선택", id=notebook_id)
            return notebook_id
    except Exception as exc:
        logger.warning("노트북 목록 조회 실패", error=str(exc))

    notebook = client.create_notebook(NOTEBOOK_TITLE)
    notebook_id = _extract_id(notebook)
    _save_notebook_id(notebook_id)
    logger.info("새 NotebookLM 노트북 생성", id=notebook_id)
    return notebook_id


def _upload_to_notebooklm(articles: list[dict]) -> dict[str, str] | None:
    if not articles:
        return None
    try:
        with _create_notebook_client() as client:
            notebook_id = _get_or_create_notebook(client)
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
            content_lines = [f"# UAE 이란 전황 업데이트 — {now_str}\n"]
            for article in articles:
                content_lines.append(
                    f"**[{article['source']}]** {article['title']}\n링크: {article['link']}\n"
                )
            content = "\n".join(content_lines)
            source = client.add_text_source(notebook_id, content, title=f"업데이트 {now_str}")
            source_id = _extract_id(source)
            client.wait_for_source_ready(notebook_id, source_id)
            logger.info("NotebookLM 소스 업로드 완료", source_id=source_id)
            return {
                "notebook_id": notebook_id,
                "source_id": source_id,
                "notebook_url": f"https://notebooklm.google.com/notebook/{notebook_id}",
            }
    except Exception as exc:
        logger.warning("NotebookLM 업로드 실패", error=str(exc))
        return None


def _read_health_state_file() -> dict[str, Any]:
    payload = load_live_json(HEALTH_STATE_FILE)
    if isinstance(payload, dict):
        return payload
    return {}


def _write_health_state(
    status: str,
    last_success_at: str | None = None,
    last_article_count: int | None = None,
    last_error: str | None = None,
    last_run_ts: str | None = None,
    counts: dict[str, int] | None = None,
    *,
    stage: str | None = None,
    duration_ms: int | None = None,
    stale_reason: str | None = None,
    source_health: dict[str, Any] | None = None,
) -> None:
    try:
        data = _read_health_state_file()
        data["status"] = status
        if last_success_at and stage != "ai":
            data["last_success_at"] = last_success_at
        if last_run_ts:
            data["last_run_ts"] = last_run_ts
            if "last_success_at" not in data and stage != "ai":
                data["last_success_at"] = last_run_ts
        if last_article_count is not None:
            data["last_article_count"] = last_article_count
        if counts is not None:
            data["counts"] = counts
        if last_error:
            data["last_error"] = last_error
            data["last_error_stage"] = stage or data.get("last_error_stage")
        if stale_reason is not None:
            data["stale_reason"] = stale_reason
        if source_health is not None:
            data["source_health"] = source_health
        if stage == "lite":
            if last_success_at or last_run_ts:
                data["last_lite_success_at"] = last_success_at or last_run_ts
                data["last_success_at"] = data["last_lite_success_at"]
            if duration_ms is not None:
                data["last_lite_duration_ms"] = int(duration_ms)
            data["last_lite_status"] = status
        if stage == "ai":
            if last_success_at or last_run_ts:
                data["last_ai_success_at"] = last_success_at or last_run_ts
            if duration_ms is not None:
                data["last_ai_duration_ms"] = int(duration_ms)
            data["last_ai_status"] = status
        HEALTH_STATE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning("헬스 상태 파일 기록 실패", error=str(exc))


def _lock_file_path() -> Path:
    return _resolve_storage_path(settings.SINGLE_INSTANCE_LOCK_FILE)


def _pid_exists(pid: int) -> bool:
    if pid <= 0:
        return False

    if os.name == "nt":
        try:
            import ctypes

            PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            SYNCHRONIZE = 0x00100000
            access = PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE
            handle = ctypes.windll.kernel32.OpenProcess(access, False, int(pid))
            if handle == 0:
                return False
            ctypes.windll.kernel32.CloseHandle(handle)
            return True
        except Exception:
            return False

    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False


def _read_lock_pid(path: Path) -> int | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    raw = payload.get("pid")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _acquire_single_instance_lock() -> bool:
    global _LOCK_HELD_BY_CURRENT_PROCESS
    if not settings.SINGLE_INSTANCE_GUARD_ENABLED:
        return True

    lock_path = _lock_file_path()
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    current_pid = os.getpid()
    while True:
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(
                    {"pid": current_pid, "created_at": datetime.now().isoformat()},
                    f,
                    ensure_ascii=False,
                )
            _LOCK_HELD_BY_CURRENT_PROCESS = True
            logger.info("단일 인스턴스 락 획득", lock_file=str(lock_path), pid=current_pid)
            return True
        except FileExistsError:
            existing_pid = _read_lock_pid(lock_path)
            alive = False
            if existing_pid:
                try:
                    alive = _pid_exists(existing_pid)
                except Exception as exc:
                    logger.warning(
                        "기존 pid 상태 확인 실패, stale lock으로 간주",
                        lock_file=str(lock_path),
                        existing_pid=existing_pid,
                        error=str(exc),
                    )
                    alive = False

            if alive:
                logger.warning(
                    "이미 실행 중인 모니터 인스턴스 감지, 현재 프로세스 종료",
                    lock_file=str(lock_path),
                    existing_pid=existing_pid,
                    current_pid=current_pid,
                )
                return False

            # stale lock cleanup and retry
            try:
                lock_path.unlink()
                logger.warning("stale lock 제거 후 재시도", lock_file=str(lock_path), stale_pid=existing_pid)
            except FileNotFoundError:
                pass
            except Exception as exc:
                logger.error("락 파일 제거 실패", lock_file=str(lock_path), error=str(exc))
                return False
        except Exception as exc:
            logger.error("단일 인스턴스 락 획득 실패", lock_file=str(lock_path), error=str(exc))
            return False


def _release_single_instance_lock() -> None:
    global _LOCK_HELD_BY_CURRENT_PROCESS
    if not settings.SINGLE_INSTANCE_GUARD_ENABLED:
        return
    if not _LOCK_HELD_BY_CURRENT_PROCESS:
        return

    lock_path = _lock_file_path()
    current_pid = os.getpid()
    try:
        if lock_path.exists():
            existing_pid = _read_lock_pid(lock_path)
            if existing_pid in (None, current_pid):
                lock_path.unlink()
                logger.info("단일 인스턴스 락 해제", lock_file=str(lock_path), pid=current_pid)
            else:
                logger.warning(
                    "락 파일 pid 불일치로 해제 생략",
                    lock_file=str(lock_path),
                    lock_pid=existing_pid,
                    current_pid=current_pid,
                )
    except Exception as exc:
        logger.warning("단일 인스턴스 락 해제 실패", lock_file=str(lock_path), error=str(exc))
    finally:
        _LOCK_HELD_BY_CURRENT_PROCESS = False


def _get_runtime_paths() -> dict[str, str]:
    rss_module = importlib.import_module("src.iran_monitor.scrapers.rss_feed")
    return {
        "cwd": str(Path.cwd().resolve()),
        "main_file": str(Path(__file__).resolve()),
        "rss_feed_file": str(Path(rss_module.__file__).resolve()),
        "canonical_root": str(CANONICAL_ROOT),
    }


def _log_runtime_paths() -> None:
    info = _get_runtime_paths()
    logger.info("런타임 경로 진단", **info)
    if Path(info["cwd"]) != CANONICAL_ROOT:
        logger.warning(
            "비권장 실행 경로 감지: canonical_root에서 실행하세요",
            cwd=info["cwd"],
            canonical_root=info["canonical_root"],
        )


def _scheduler_event_message(event: JobExecutionEvent) -> str:
    event_code = event.code
    event_type = []
    if event_code & EVENT_JOB_ERROR:
        event_type.append("JOB_ERROR")
    if event_code & EVENT_JOB_MISSED:
        event_type.append("JOB_MISSED")
    if not event_type:
        event_type.append(f"UNKNOWN({event_code})")
    exception = getattr(event, "exception", None)
    trace = getattr(event, "traceback", None)
    if exception:
        return (
            f"⚠️ 스케줄러 {','.join(event_type)} 예외\n"
            f"Job ID: {event.job_id}\n"
            f"예외: {exception}\n"
            f"Traceback: {trace or 'n/a'}"
        )
    return f"⚠️ 스케줄러 {','.join(event_type)} 발생 (예외 없음) | Job ID: {event.job_id}"


def _on_scheduler_event(event: JobExecutionEvent) -> None:
    event_code = event.code
    exception = getattr(event, "exception", None)
    tb_text = getattr(event, "traceback", None)
    if exception and not tb_text:
        tb_text = "".join(traceback.format_exception(type(exception), exception, exception.__traceback__))
    logger.error(
        "스케줄러 이벤트 발생",
        job_id=event.job_id,
        event_code=event_code,
        exception=repr(exception),
        traceback=tb_text,
    )

    if settings.SCHEDULER_ALERT_ENABLED and (event_code & (EVENT_JOB_ERROR | EVENT_JOB_MISSED)):
        message = _scheduler_event_message(event)
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop and loop.is_running():
            loop.create_task(send_telegram_alert(message))
        else:
            try:
                asyncio.run(send_telegram_alert(message))
            except RuntimeError:
                logger.warning("스케줄러 알림 전송 실패: 이벤트 루프 없음")


def _fallback_analysis(articles: list[dict]) -> AnalysisResult:
    return fallback_analyze(
        articles,
        threshold_medium=settings.THREAT_THRESHOLD_MEDIUM,
        threshold_high=settings.THREAT_THRESHOLD_HIGH,
        threshold_critical=settings.THREAT_THRESHOLD_CRITICAL,
    )


def _analyze_phase2(articles: list[dict], notebook_context: dict[str, str] | None) -> AnalysisResult:
    if not settings.PHASE2_ENABLED:
        return _fallback_analysis(articles)

    notebook_id = (notebook_context or {}).get("notebook_id")
    if not notebook_id:
        return _fallback_analysis(articles)

    try:
        with _create_notebook_client() as client:
            return analyze_with_notebooklm_or_fallback(
                client=client,
                notebook_id=notebook_id,
                articles=articles,
                timeout=float(settings.PHASE2_QUERY_TIMEOUT_SEC),
                language=settings.PHASE2_REPORT_LANGUAGE,
                threshold_medium=settings.THREAT_THRESHOLD_MEDIUM,
                threshold_high=settings.THREAT_THRESHOLD_HIGH,
                threshold_critical=settings.THREAT_THRESHOLD_CRITICAL,
            )
    except Exception as exc:
        logger.warning("Phase2 NotebookLM 분석 실패, fallback 전환", error=str(exc))
        return _fallback_analysis(articles)


def _build_immediate_alert_message(analysis: AnalysisResult, notebook_url: str | None = None) -> str:
    lines = [
        f"🚨 즉시 경보: UAE 위협 레벨 {analysis['threat_level']} ({analysis['threat_score']}/100)",
        f"감성: {analysis['sentiment']}",
        f"아부다비: {analysis['abu_dhabi_level']} | 두바이: {analysis['dubai_level']}",
        f"권고: {analysis['recommended_action']}",
    ]
    if notebook_url:
        lines.append(f"NotebookLM: {notebook_url}")
    return "\n".join(lines)


def _is_cross_checked(analysis: AnalysisResult, articles: list[dict]) -> bool:
    if analysis.get("threat_level") not in {"HIGH", "CRITICAL"}:
        return True

    scored_sources: set[str] = set()
    cross_hit = 0
    for article in articles:
        source = str(article.get("source", "")).strip()
        if source:
            scored_sources.add(source)
        text = f"{article.get('title', '')} {article.get('link', '')} {article.get('source', '')}".lower()
        if any(k in text for k in _CROSS_CHECK_KEYWORDS):
            cross_hit += 1

    return cross_hit >= 2 and len(scored_sources) >= 2


def _apply_verification_gate(analysis: AnalysisResult, articles: list[dict]) -> AnalysisResult:
    if not settings.PHASE2_REQUIRE_CROSS_CHECK_FOR_ALERT:
        # Legacy behavior: do not block alerts unless cross-check is explicitly
        # enabled through configuration.
        result = dict(analysis)
        result["analysis_verified"] = True
        return result

    result: AnalysisResult = dict(analysis)
    verified = _is_cross_checked(analysis, articles)
    result["analysis_verified"] = verified
    if not verified and analysis.get("threat_level") in {"HIGH", "CRITICAL"}:
        result["recommended_action"] = "교차 검증 미완료로 즉시 경보 보류"
    return result


def _maybe_create_podcast_scaffold(notebook_context: dict[str, str] | None) -> None:
    if not settings.PHASE2_PODCAST_ENABLED:
        return
    notebook_id = (notebook_context or {}).get("notebook_id")
    if not notebook_id:
        logger.warning("팟캐스트 스캐폴드 생략: notebook_id 없음")
        return
    try:
        with _create_notebook_client() as client:
            result = client.create_audio_overview(
                notebook_id=notebook_id,
                language=settings.PHASE2_REPORT_LANGUAGE or "ko",
                focus_prompt="UAE resident safety daily audio briefing",
            )
            logger.info(
                "Phase2 팟캐스트 스캐폴드 생성 요청 완료",
                artifact_id=(result or {}).get("artifact_id") if isinstance(result, dict) else None,
            )
    except Exception as exc:
        logger.warning("Phase2 팟캐스트 스캐폴드 실패", error=str(exc))


def _persist_storage(
    *,
    analysis: AnalysisResult,
    articles: list[dict],
    report_text: str,
    notebook_url: str | None,
    flags: list[str],
    run_ts: str | None = None,
    run_id: str | None = None,
) -> None:
    if not settings.STORAGE_ENABLED:
        return

    storage_root = _storage_root()
    sqlite_db_path = _resolve_storage_path(settings.STORAGE_DB_PATH)
    sqlite_schema_path = _resolve_storage_path(settings.STORAGE_SCHEMA_PATH)

    run_payload = build_run_payload(
        analysis=analysis,
        notebook_url=notebook_url,
        articles=articles,
        flags=flags,
        run_ts=run_ts,
        run_id=run_id,
    )
    article_rows = build_article_rows(articles=articles, run_ts=run_payload["run_ts"])

    outbox_rows: list[dict] = []
    if settings.OUTBOX_MIRROR_ENABLED and report_text.strip():
        outbox_rows = build_outbox_rows(report_text=report_text, created_ts=run_payload["run_ts"], include_whatsapp=True)

    persist_result = persist_run_backend(
        storage_root,
        sqlite_db_path,
        sqlite_schema_path,
        run=run_payload,
        articles=article_rows,
        outbox_msgs=outbox_rows,
        notebook_rotation_cap=int(settings.STORAGE_NOTEBOOK_ROTATION_CAP),
    )
    logger.info("저장 레이어 반영 완료", **persist_result)


def _live_root() -> Path:
    return default_live_root(PROJECT_ROOT)


def _build_counts(all_articles: list[dict[str, Any]], new_articles: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "new_count": len(new_articles),
        "total_count": len(all_articles),
        "unique_count": len(new_articles),
    }


def _write_ai_input(payload: dict[str, Any], path: Path | None = None) -> Path:
    target = path or AI_INPUT_FILE
    save_json(target, payload)
    return target


def _load_ai_input(path: str | Path | None = None) -> dict[str, Any]:
    target = Path(path) if path is not None else AI_INPUT_FILE
    payload = load_live_json(target)
    if not isinstance(payload, dict):
        raise FileNotFoundError(f"AI input not found or invalid: {target}")
    return payload


async def _collect_all_articles(flags: list[str]) -> list[dict[str, Any]]:
    uae_articles, social_articles, rss_articles = await asyncio.gather(
        scrape_uae_media(),
        scrape_social_media(),
        scrape_rss(),
        return_exceptions=True,
    )

    if isinstance(uae_articles, Exception):
        logger.warning("UAE 미디어 스크랩 실패", error=str(uae_articles))
        uae_articles = []
        flags.append("SCRAPE_DEGRADED")

    if isinstance(social_articles, Exception):
        logger.warning("소셜미디어 스크랩 실패", error=str(social_articles))
        social_articles = []
        flags.append("SCRAPE_DEGRADED")

    if isinstance(rss_articles, Exception):
        logger.warning("RSS 스크랩 실패", error=str(rss_articles))
        rss_articles = []
        flags.append("SCRAPE_DEGRADED")

    return list(uae_articles) + list(social_articles) + list(rss_articles)


def _lite_storage_analysis(all_articles: list[dict[str, Any]], new_articles: list[dict[str, Any]]) -> AnalysisResult:
    return _fallback_analysis(new_articles or all_articles)


def _publish_lite_outputs(snapshot: dict[str, Any], version: str) -> dict[str, Any]:
    return publish_lite_bundle(
        live_root=_live_root(),
        snapshot=snapshot,
        version=version,
        health=_read_health_state_file(),
    )


def _publish_ai_outputs(snapshot: dict[str, Any], version: str, analysis: AnalysisResult) -> dict[str, Any]:
    return publish_ai_bundle(
        live_root=_live_root(),
        snapshot=snapshot,
        version=version,
        ai_analysis=dict(analysis),
        ai_updated_at=str(analysis.get("updated_at") or _now_dubai().isoformat(timespec="seconds")),
        health=_read_health_state_file(),
    )


async def _probe_sources() -> dict[str, Any]:
    async def _safe_call(label: str, coro):
        try:
            result = await coro
            return {"label": label, "ok": True, "count": len(result) if isinstance(result, list) else 0}
        except Exception as exc:
            return {"label": label, "ok": False, "error": str(exc), "count": 0}

    return {
        "uae_media": await _safe_call("uae_media", scrape_uae_media()),
        "social_media": await _safe_call("social_media", scrape_social_media()),
        "rss": await _safe_call("rss", scrape_rss()),
    }


def _acquire_hyie_ingest_lock() -> bool:
    HYIE_INGEST_LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)

    if HYIE_INGEST_LOCK_FILE.exists():
        try:
            data = json.loads(HYIE_INGEST_LOCK_FILE.read_text(encoding="utf-8"))
            created_at = str(data.get("created_at") or "")
            if created_at:
                created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                age_sec = (_now_dubai() - created_dt.astimezone(DUBAI_TZ)).total_seconds()
                if age_sec > 900:
                    HYIE_INGEST_LOCK_FILE.unlink(missing_ok=True)
        except Exception:
            pass

    try:
        fd = os.open(str(HYIE_INGEST_LOCK_FILE), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"pid": os.getpid(), "created_at": _now_dubai().isoformat(timespec="seconds")}, handle)
        return True
    except FileExistsError:
        return False
    except Exception as exc:
        logger.warning("HyIE 락 획득 실패", error=str(exc), lock_file=str(HYIE_INGEST_LOCK_FILE))
        return False


def _release_hyie_ingest_lock() -> None:
    try:
        if HYIE_INGEST_LOCK_FILE.exists():
            HYIE_INGEST_LOCK_FILE.unlink()
    except Exception as exc:
        logger.warning("HyIE 락 해제 실패", error=str(exc), lock_file=str(HYIE_INGEST_LOCK_FILE))


def _load_manual_egress_eta_h() -> float | None:
    if not HYIE_EGRESS_ETA_FILE.exists():
        return None
    try:
        payload = json.loads(HYIE_EGRESS_ETA_FILE.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return None
        raw_hours = payload.get("egress_loss_eta_h")
        if raw_hours is None:
            return None
        hours = float(raw_hours)
        if hours < 0:
            return 0.0
        return hours
    except Exception as exc:
        logger.warning("manual Egress ETA 파일 읽기 실패", error=str(exc), path=str(HYIE_EGRESS_ETA_FILE))
        return None


def _load_previous_hyie_state() -> dict[str, Any] | None:
    if not HYIE_STATE_FILE.exists():
        return None
    try:
        return json.loads(HYIE_STATE_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("기존 HyIE 상태 읽기 실패", error=str(exc), path=str(HYIE_STATE_FILE))
        return None


_ARTICLE_TRAVEL_TERMS = (
    "travel advisory",
    "do not travel",
    "ordered departure",
    "여행경보",
    "특별여행주의보",
)
_ARTICLE_AIR_TERMS = (
    "flight",
    "airspace",
    "etihad",
    "emirates",
    "notam",
    "airport",
)
_ARTICLE_STRIKE_TERMS = (
    "missile",
    "drone",
    "strike",
    "explosion",
    "attack",
)
_ARTICLE_BORDER_TERMS = (
    "border",
    "checkpoint",
    "crossing",
    "curfew",
)
_ARTICLE_CLOSURE_TERMS = (
    "closed",
    "closure",
    "road closed",
    "blocked",
    "shutdown",
    "shut down",
    "suspended",
)
_ARTICLE_RESTRICTED_TERMS = (
    "restricted",
    "restriction",
    "limited",
    "curfew",
    "checkpoint",
)
_ARTICLE_COMMS_ISSUE_TERMS = (
    "outage",
    "internet outage",
    "service outage",
    "service disruption",
    "network outage",
    "connectivity issue",
    "degraded",
)
_ARTICLE_COMMS_PROVIDER_TERMS = (
    "internet",
    "network",
    "telecom",
    "etisalat",
    "du",
    "aws",
    "azure",
)
_ARTICLE_SUPPLY_TERMS = (
    "fuel",
    "food",
    "supply",
    "supermarket",
    "shortage",
    "rationing",
)
_ARTICLE_EVAC_TERMS = (
    "evacuation",
    "evac",
    "military flight",
    "leave immediately",
)
_ARTICLE_ROUTE_TERMS = {
    "A": ("al ain", "al-ain"),
    "B": ("buraimi", "mezyad", "nizwa", "oman border"),
    "C": ("ghuwaifat", "saudi", "riyadh"),
    "D": ("fujairah", "khatmat", "muscat"),
}


def _article_contains(text: str, phrase: str) -> bool:
    token = str(phrase or "").strip().lower()
    if not token:
        return False
    if re.fullmatch(r"[a-z0-9][a-z0-9 .:/-]*", token):
        return re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])", text) is not None
    return token in text


def _article_matches_any(text: str, phrases: tuple[str, ...]) -> bool:
    return any(_article_contains(text, phrase) for phrase in phrases)


def _article_route_block_tags(text: str, closed_signal: bool) -> set[str]:
    if not closed_signal:
        return set()

    tags: set[str] = set()
    for route_id, phrases in _ARTICLE_ROUTE_TERMS.items():
        if _article_matches_any(text, phrases):
            tags.add(f"route_{route_id.lower()}_blocked")
    return tags


def _article_to_signal(article: dict[str, Any], ts_iso: str) -> dict[str, Any] | None:
    title = str(article.get("title") or "")
    source = str(article.get("source") or "monitor_feed")
    body = " ".join(
        str(article.get(key) or "")
        for key in ("title", "summary", "description", "content", "link", "source")
    ).lower()

    indicator_ids: list[str] = []
    tags: set[str] = set()
    score = 0.45

    travel_signal = _article_matches_any(body, _ARTICLE_TRAVEL_TERMS)
    air_signal = _article_matches_any(body, _ARTICLE_AIR_TERMS)
    strike_signal = _article_matches_any(body, _ARTICLE_STRIKE_TERMS)
    border_context = _article_matches_any(body, _ARTICLE_BORDER_TERMS) or any(
        _article_matches_any(body, phrases) for phrases in _ARTICLE_ROUTE_TERMS.values()
    )
    closed_signal = _article_matches_any(body, _ARTICLE_CLOSURE_TERMS)
    restricted_signal = _article_matches_any(body, _ARTICLE_RESTRICTED_TERMS)
    comms_issue_signal = _article_matches_any(body, _ARTICLE_COMMS_ISSUE_TERMS)
    comms_provider_signal = _article_matches_any(body, _ARTICLE_COMMS_PROVIDER_TERMS)
    supply_signal = _article_matches_any(body, _ARTICLE_SUPPLY_TERMS)
    evac_signal = _article_matches_any(body, _ARTICLE_EVAC_TERMS)

    if travel_signal:
        indicator_ids.extend(["I01", "I07"])
        score = max(score, 0.82)
    if air_signal:
        indicator_ids.append("I02")
        score = max(score, 0.78)
        tags.add("air_update")
    if strike_signal:
        indicator_ids.append("I03")
        score = max(score, 0.88)
        tags.add("strike")
    if border_context and (closed_signal or restricted_signal):
        indicator_ids.append("I04")
        score = max(score, 0.7)
        if closed_signal:
            tags.add("border_closed")
        elif restricted_signal:
            tags.add("border_restricted")
        tags.update(_article_route_block_tags(body, closed_signal))
    if comms_issue_signal and comms_provider_signal:
        indicator_ids.append("I05")
        score = max(score, 0.68)
        tags.add("comms")
    if supply_signal:
        indicator_ids.append("I06")
        score = max(score, 0.62)
    if evac_signal:
        indicator_ids.append("I07")
        score = max(score, 0.8)

    if not indicator_ids:
        return None

    return {
        "source_id": f"article::{source}",
        "source": source,
        "tier": "TIER1",
        "origin": "article",
        "indicator_ids": sorted(set(indicator_ids)),
        "score": score,
        "confirmed": False,
        "ts": ts_iso,
        "summary": title or "article signal",
        "tags": sorted(tags),
    }


async def _collect_hyie_source_signals(now_dt: datetime) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    timeout_sec = float(settings.HYIE_SOURCE_TIMEOUT_SEC)
    calls = await asyncio.gather(
        collect_tier0_signals(timeout_sec=timeout_sec, now=now_dt),
        collect_tier1_signals(timeout_sec=timeout_sec, now=now_dt),
        collect_tier2_signals(timeout_sec=timeout_sec, now=now_dt),
        return_exceptions=True,
    )
    signals: list[dict[str, Any]] = []
    health: dict[str, Any] = {}
    for idx, result in enumerate(calls):
        tier_name = f"tier{idx}"
        if isinstance(result, Exception):
            health[f"{tier_name}_collector"] = {
                "name": tier_name,
                "tier": tier_name.upper(),
                "status": "collector_error",
                "ok": False,
                "checked_at": now_dt.isoformat(timespec="seconds"),
                "error": str(result),
            }
            continue
        tier_signals, tier_health = result
        signals.extend(tier_signals)
        health.update(tier_health)
    return signals, health


def _persist_hyie_state(payload: dict[str, Any]) -> bool:
    root = _storage_root()
    ensure_layout(root)

    state_hash_payload = {
        "indicators": payload.get("indicators", []),
        "hypotheses": payload.get("hypotheses", []),
        "routes": payload.get("routes", []),
        "triggers": payload.get("triggers", {}),
        "degraded": payload.get("degraded"),
        "egress_loss_eta": payload.get("egress_loss_eta"),
        "evidence_conf": payload.get("evidence_conf"),
    }
    state_hash = hashlib.sha1(
        json.dumps(state_hash_payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()

    previous_hash = None
    if HYIE_STATE_META_FILE.exists():
        try:
            meta_payload = json.loads(HYIE_STATE_META_FILE.read_text(encoding="utf-8"))
            if isinstance(meta_payload, dict):
                previous_hash = str(meta_payload.get("state_hash") or "")
        except Exception:
            previous_hash = None

    save_json(HYIE_STATE_FILE, payload)
    save_json(
        HYIE_STATE_META_FILE,
        {
            "state_hash": state_hash,
            "state_ts": payload.get("state_ts"),
            "updated_at": _now_dubai().isoformat(timespec="seconds"),
        },
    )

    changed = state_hash != previous_hash
    if not changed:
        return False

    state_ts = str(payload.get("state_ts") or _now_dubai().isoformat())
    date_part = state_ts[:10]
    hour_part = state_ts[11:13] + "-00"

    if settings.HYIE_APPEND_REPORTS_JSONL:
        append_jsonl(
            root / "reports" / f"{date_part}.jsonl",
            {
                "kind": "hyie_state",
                "state_ts": state_ts,
                "status": payload.get("status"),
                "degraded": payload.get("degraded"),
                "delta_score": payload.get("delta_score"),
                "evidence_conf": payload.get("evidence_conf"),
                "effective_threshold": payload.get("effective_threshold"),
                "flags": payload.get("flags", []),
            },
        )

    if settings.HYIE_APPEND_URGENTDASH_JSONL:
        snapshot_payload = {
            "snapshot_ts": state_ts,
            "state_ts": state_ts,
            "status": payload.get("status"),
            "degraded": payload.get("degraded"),
            "source_health": payload.get("source_health", {}),
            "flags": payload.get("flags", []),
            "triggers": payload.get("triggers", {}),
            "intel_feed": payload.get("intel_feed", []),
            "indicators": payload.get("indicators", []),
            "hypotheses": payload.get("hypotheses", []),
            "routes": payload.get("routes", []),
            "checklist": payload.get("checklist", []),
            "route_geo": payload.get("route_geo"),
        }
        daily_jsonl = root / "urgentdash_snapshots" / f"{date_part}.jsonl"
        hourly_json = root / "urgentdash_snapshots" / date_part / f"{hour_part}.json"
        append_jsonl(daily_jsonl, snapshot_payload)
        save_json(hourly_json, snapshot_payload)

    return True


def _inject_ai_analysis_into_hyie_state(analysis: AnalysisResult, notebook_url: str | None) -> None:
    """AI 분석 결과를 hyie_state.json에 병합 (urgentdash React 앱에서 표시 가능)."""
    if not HYIE_STATE_FILE.exists():
        return
    try:
        payload = json.loads(HYIE_STATE_FILE.read_text(encoding="utf-8"))
        payload["ai_analysis"] = {
            "threat_level": analysis.get("threat_level"),
            "threat_score": analysis.get("threat_score"),
            "sentiment": analysis.get("sentiment"),
            "abu_dhabi_level": analysis.get("abu_dhabi_level"),
            "dubai_level": analysis.get("dubai_level"),
            "summary": analysis.get("summary"),
            "recommended_action": analysis.get("recommended_action"),
            "key_points": analysis.get("key_points", []),
            "analysis_source": analysis.get("analysis_source"),
            "notebook_url": notebook_url,
            "updated_at": analysis.get("updated_at") or _now_dubai().isoformat(timespec="seconds"),
        }
        save_json(HYIE_STATE_FILE, payload)
        logger.info(
            "HyIE state AI 분석 결과 주입 완료",
            threat_level=analysis.get("threat_level"),
            analysis_source=analysis.get("analysis_source"),
        )
    except Exception as exc:
        logger.warning("HyIE state AI 분석 주입 실패", error=str(exc))


async def _update_hyie_state(all_articles: list[dict[str, Any]], run_ts: str, flags: list[str]) -> dict[str, Any] | None:
    if not settings.HYIE_ENABLED:
        return None

    if not _acquire_hyie_ingest_lock():
        flags.append("HYIE_LOCKED_SKIP")
        logger.warning("HyIE 상태 갱신 스킵 (락 점유 중)", lock_file=str(HYIE_INGEST_LOCK_FILE))
        return None

    try:
        now_dt = _now_dubai()
        source_signals, source_health = await _collect_hyie_source_signals(now_dt)

        article_signals = [
            signal
            for article in all_articles
            if (signal := _article_to_signal(article, run_ts)) is not None
        ]
        signals = source_signals + article_signals
        prev_state = _load_previous_hyie_state()
        manual_eta_h = _load_manual_egress_eta_h()
        payload = build_state_payload(
            signals=signals,
            source_health=source_health,
            prev_state=prev_state,
            manual_egress_eta_h=manual_eta_h,
        )
        payload["route_geo"] = build_route_geo_payload()
        changed = _persist_hyie_state(payload)

        if payload.get("degraded"):
            flags.append("HYIE_DEGRADED")
        if payload.get("status") == "warming_up":
            flags.append("HYIE_WARMING_UP")
        if not changed:
            flags.append("HYIE_NO_DELTA")
        return payload
    except Exception as exc:
        logger.warning("HyIE 상태 갱신 실패, 기존 파이프라인 계속 진행", error=str(exc))
        flags.append("HYIE_UPDATE_FAILED")
        return None
    finally:
        _release_hyie_ingest_lock()


async def run_lite_cycle(*, dry_run: bool = False) -> dict[str, Any]:
    now_dt = _now_dubai()
    now = now_dt.strftime("%Y-%m-%d %H:%M")
    run_ts = now_dt.isoformat(timespec="seconds")
    run_id = make_run_id(run_ts)
    stage_started = time.monotonic()
    logger.info("모니터링 사이클 시작", run_at=now, run_ts=run_ts)
    flags: list[str] = []

    try:
        all_articles = await _collect_all_articles(flags)
        logger.info("기사 수집 완료", total=len(all_articles))

        hyie_payload = await _update_hyie_state(all_articles, run_ts, flags)
        if hyie_payload is None:
            hyie_payload = _load_previous_hyie_state()
            if hyie_payload is None:
                raise RuntimeError("HyIE state unavailable after lite stage")
            flags.append("HYIE_STATE_FALLBACK")
        logger.info(
            "HyIE 상태 갱신 완료",
            status=hyie_payload.get("status"),
            degraded=hyie_payload.get("degraded"),
            evidence_conf=hyie_payload.get("evidence_conf"),
            delta_score=hyie_payload.get("delta_score"),
        )

        new_articles = _filter_new_persistent(all_articles)
        logger.info("신규 기사 필터링 완료", new_count=len(new_articles))

        counts = _build_counts(all_articles, new_articles)
        if not new_articles:
            flags.append("NO_NEW_ARTICLES")
        storage_analysis = _lite_storage_analysis(all_articles, new_articles)
        _persist_storage(
            analysis=storage_analysis,
            articles=new_articles,
            report_text="",
            notebook_url=None,
            flags=flags,
            run_ts=run_ts,
            run_id=run_id,
        )

        version = version_from_ts(str(hyie_payload.get("state_ts") or run_ts))
        ai_input_payload = {
            "run_id": run_id,
            "run_ts": run_ts,
            "version": version,
            "counts": counts,
            "flags": sorted(set(flags)),
            "all_articles": all_articles,
            "new_articles": new_articles,
            "lite_snapshot": hyie_payload,
            "dry_run": bool(dry_run),
        }
        _write_ai_input(ai_input_payload)

        duration_ms = int((time.monotonic() - stage_started) * 1000)
        _write_health_state(
            "ok",
            last_success_at=run_ts,
            last_article_count=len(new_articles),
            last_run_ts=run_ts,
            counts=counts,
            stage="lite",
            duration_ms=duration_ms,
            stale_reason=None,
            source_health=hyie_payload.get("source_health", {}),
        )
        _publish_lite_outputs(hyie_payload, version)
        logger.info(
            "Lite publish 완료",
            version=version,
            flags=sorted(set(flags)),
        )
        return ai_input_payload

    except Exception as exc:
        logger.exception("Lite 파이프라인 실패")
        _write_health_state(
            "error",
            last_error=f"{type(exc).__name__}: {exc}",
            last_run_ts=run_ts,
            stage="lite",
            duration_ms=int((time.monotonic() - stage_started) * 1000),
        )
        if settings.HEALTH_ALERT_ENABLED:
            await send_telegram_alert(f"⚠️ Iran-UAE Monitor lite stage 실패\n\n{type(exc).__name__}: {exc}")
        raise


async def _run_ai_cycle_from_payload(
    ai_input: dict[str, Any],
    *,
    approval_required: bool = False,
    dry_run: bool = False,
) -> dict[str, Any]:
    stage_started = time.monotonic()
    run_ts = str(ai_input.get("run_ts") or _now_dubai().isoformat(timespec="seconds"))
    run_id = str(ai_input.get("run_id") or make_run_id(run_ts))
    version = str(ai_input.get("version") or version_from_ts(str(ai_input.get("state_ts") or run_ts)))
    flags = list(ai_input.get("flags") or [])
    all_articles = list(ai_input.get("all_articles") or [])
    new_articles = list(ai_input.get("new_articles") or [])
    counts = ai_input.get("counts") if isinstance(ai_input.get("counts"), dict) else _build_counts(all_articles, new_articles)
    snapshot = ai_input.get("lite_snapshot") if isinstance(ai_input.get("lite_snapshot"), dict) else None
    if snapshot is None:
        snapshot = _load_previous_hyie_state()
    if snapshot is None:
        raise RuntimeError("Lite snapshot unavailable for AI stage")

    save_json(HYIE_STATE_FILE, snapshot)

    try:
        loop = asyncio.get_running_loop()
        analysis_articles = new_articles or all_articles
        notebook_context: dict[str, str] | None = None
        notebook_url: str | None = None

        if new_articles and analysis_articles:
            notebook_context = await loop.run_in_executor(None, _upload_to_notebooklm, analysis_articles)
            if not notebook_context:
                flags.append("NOTEBOOK_UPLOAD_FAILED")

        analysis = await loop.run_in_executor(None, _analyze_phase2, analysis_articles, notebook_context)
        analysis = _apply_verification_gate(analysis, analysis_articles)
        ai_updated_at = _now_dubai().isoformat(timespec="seconds")
        notebook_url = (notebook_context or {}).get("notebook_url")
        ai_payload = dict(analysis)
        ai_payload["notebook_url"] = notebook_url
        ai_payload["updated_at"] = ai_updated_at

        _inject_ai_analysis_into_hyie_state(ai_payload, notebook_url)

        if new_articles and should_send_immediate_alert(analysis, settings.PHASE2_ALERT_LEVELS) and analysis.get("analysis_verified", True):
            alert_ok = await send_telegram_alert(_build_immediate_alert_message(analysis, notebook_url=notebook_url))
            if not alert_ok:
                flags.append("ALERT_SEND_FAILED")
        elif new_articles and should_send_immediate_alert(analysis, settings.PHASE2_ALERT_LEVELS) and not analysis.get("analysis_verified", True):
            logger.warning("AI 교차 검증 미완료: 경보 보류")
            flags.append("ALERT_GATED_UNVERIFIED")

        if settings.PHASE2_PODCAST_ENABLED and analysis_articles:
            await loop.run_in_executor(None, _maybe_create_podcast_scaffold, notebook_context)

        report_text = ""
        send_status = {"telegram": True, "whatsapp": True, "approved": True}
        if new_articles:
            report_text = build_report_text(new_articles, analysis=analysis, notebook_url=notebook_url)
            if dry_run:
                send_status = {"telegram": False, "whatsapp": False, "approved": False}
            else:
                send_status = await send_telegram_report(
                    new_articles,
                    analysis=analysis,
                    notebook_url=notebook_url,
                    approval_required=approval_required,
                )
            if not send_status.get("telegram", False) or not send_status.get("whatsapp", False):
                if not dry_run:
                    if send_status.get("approved", True):
                        flags.append("SEND_FAILED")
                    else:
                        flags.append("SEND_SKIPPED_PENDING_APPROVAL")

        _persist_storage(
            analysis=analysis,
            articles=new_articles,
            report_text=report_text,
            notebook_url=notebook_url,
            flags=flags,
            run_ts=run_ts,
            run_id=run_id,
        )

        duration_ms = int((time.monotonic() - stage_started) * 1000)
        _write_health_state(
            "ok",
            last_success_at=ai_updated_at,
            last_article_count=len(new_articles),
            last_run_ts=ai_updated_at,
            counts=counts,
            stage="ai",
            duration_ms=duration_ms,
            stale_reason=None,
            source_health=snapshot.get("source_health", {}),
        )
        _publish_ai_outputs(snapshot, version, ai_payload)
        logger.info(
            "AI enrich 완료",
            version=version,
            threat_level=analysis.get("threat_level"),
            analysis_source=analysis.get("analysis_source"),
            flags=sorted(set(flags)),
        )
        return {
            "run_id": run_id,
            "run_ts": run_ts,
            "version": version,
            "analysis": ai_payload,
            "flags": sorted(set(flags)),
            "counts": counts,
        }
    except Exception as exc:
        logger.exception("AI 파이프라인 실패")
        _write_health_state(
            "error",
            last_error=f"{type(exc).__name__}: {exc}",
            last_run_ts=_now_dubai().isoformat(timespec="seconds"),
            counts=counts,
            stage="ai",
            duration_ms=int((time.monotonic() - stage_started) * 1000),
        )
        if settings.HEALTH_ALERT_ENABLED:
            await send_telegram_alert(f"⚠️ Iran-UAE Monitor AI stage 실패\n\n{type(exc).__name__}: {exc}")
        raise


async def run_ai_cycle(
    *,
    ai_input_path: str | Path | None = None,
    approval_required: bool = False,
    dry_run: bool = False,
) -> dict[str, Any]:
    ai_input = _load_ai_input(ai_input_path)
    return await _run_ai_cycle_from_payload(ai_input, approval_required=approval_required, dry_run=dry_run)


async def run_full_cycle(*, approval_required: bool = False, dry_run: bool = False) -> dict[str, Any]:
    ai_input = await run_lite_cycle(dry_run=dry_run)
    ai_result = await _run_ai_cycle_from_payload(ai_input, approval_required=approval_required, dry_run=dry_run)
    return {"lite": ai_input, "ai": ai_result}


async def hourly_job(*, approval_required: bool = False, dry_run: bool = False) -> None:
    await run_full_cycle(approval_required=approval_required, dry_run=dry_run)


async def main(*, approval_required: bool = False, dry_run: bool = False) -> None:
    import subprocess
    import sys

    _log_runtime_paths()

    # Ensure chromium deps (local long-run mode)
    subprocess.run(
        [sys.executable, "-m", "playwright", "install", "chromium", "--with-deps"],
        capture_output=True,
    )

    logger.info("이란-UAE 모니터링 시스템 시작 (canonical)", canonical_root=str(CANONICAL_ROOT))

    scheduler = AsyncIOScheduler()
    scheduler.add_listener(_on_scheduler_event, EVENT_JOB_ERROR | EVENT_JOB_MISSED)
    scheduler.add_job(
        hourly_job,
        "interval",
        minutes=30,
        next_run_time=datetime.now(),
        kwargs={"approval_required": approval_required, "dry_run": dry_run},
    )
    scheduler.start()

    try:
        while True:
            await asyncio.sleep(1800)
    except (KeyboardInterrupt, SystemExit):
        logger.info("시스템 종료")
        scheduler.shutdown()


def run(*, approval_required: bool = False, dry_run: bool = False) -> None:
    if not _acquire_single_instance_lock():
        return
    try:
        asyncio.run(main(approval_required=approval_required, dry_run=dry_run))
    finally:
        _release_single_instance_lock()


if __name__ == "__main__":
    run()
