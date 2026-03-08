"""Canonical compatibility entrypoint.

This file keeps root-level imports/test hooks stable while delegating runtime to
`src/iran_monitor.app`.
"""

from __future__ import annotations

import inspect
import argparse
import asyncio
import json
import subprocess
import os
import sys
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from src.iran_monitor.config import settings  # noqa: E402

from src.iran_monitor import app as _app
from src.iran_monitor import reporter as _canonical_reporter
from src.iran_monitor.reporter import send_telegram_alert

_LOGGER = logging.getLogger(__name__)

# Re-exported compatibility symbols (can be monkeypatched by tests)
scrape_uae_media = _app.scrape_uae_media
scrape_social_media = _app.scrape_social_media
scrape_rss = _app.scrape_rss
_send_report_text = _canonical_reporter.send_report_text
_analyze_phase2 = _app._analyze_phase2
_upload_to_notebooklm = _app._upload_to_notebooklm
_write_health_state = _app._write_health_state
_seen_hashes = _app._seen_hashes
run_full_cycle = _app.run_full_cycle
run_lite_cycle = _app.run_lite_cycle
run_ai_cycle = _app.run_ai_cycle
run = _app.run

# Compatibility indirection target. `_app` calls this variable through
# _send_telegram_report_compat(), so tests can monkeypatch `main.send_telegram_report`
# without breaking keyword compatibility.
_send_telegram_report_impl = _canonical_reporter.send_telegram_report


def _resolve_archive_dir() -> Path:
    target = Path(settings.REPORTS_ARCHIVE_DIR)
    if target.is_absolute():
        return target
    return (ROOT / target).resolve()


def _save_report_archive(
    articles: list[dict],
    analysis: dict | None,
    notebook_url: str | None,
) -> None:
    """Compatibility wrapper for legacy archive tests."""
    if not settings.REPORTS_ARCHIVE_ENABLED:
        return

    archive_dir = _resolve_archive_dir()
    now = datetime.now(timezone.utc)
    day = now.date().isoformat()
    run_file = archive_dir / day / f"{now.strftime('%H')}-00.json"
    run_file.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "run_ts": now.isoformat(timespec="minutes"),
        "articles": articles,
        "analysis": analysis or {},
        "notebook_url": notebook_url,
    }
    run_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _get_runtime_paths() -> dict[str, str]:
    paths = _app._get_runtime_paths()
    paths["main_file"] = str(Path(__file__).resolve())
    return paths


def _accepts_approval_kw(fn: object) -> bool:
    try:
        sig = inspect.signature(fn)
    except Exception:
        _LOGGER.exception("지원 함수 시그니처 검사 실패: approval_required 전달 경로 비활성 fallback")
        return False

    params = sig.parameters.values()
    return any(param.kind == inspect.Parameter.VAR_KEYWORD for param in params) or "approval_required" in sig.parameters


def _resolve_report_status(raw_status: Any) -> dict[str, bool]:
    if raw_status is None:
        return {"telegram": True, "whatsapp": True, "approved": True}

    if isinstance(raw_status, dict):
        return {
            "telegram": bool(raw_status.get("telegram", False)),
            "whatsapp": bool(raw_status.get("whatsapp", False)),
            "approved": bool(raw_status.get("approved", True)),
        }

    if isinstance(raw_status, bool):
        return {
            "telegram": bool(raw_status),
            "whatsapp": bool(raw_status),
            "approved": True,
        }

    return {"telegram": False, "whatsapp": False, "approved": False}


async def _invoke_report_sender(
    sender: Any,
    articles: list[dict],
    *,
    analysis: dict | None = None,
    notebook_url: str | None = None,
    approval_required: bool = False,
) -> dict[str, bool]:
    if sender is None:
        return {"telegram": False, "whatsapp": False, "approved": False}

    try:
        if _accepts_approval_kw(sender):
            result = sender(
                articles,
                analysis=analysis,
                notebook_url=notebook_url,
                approval_required=approval_required,
            )
        else:
            result = sender(articles, analysis=analysis, notebook_url=notebook_url)

        if asyncio.iscoroutine(result):
            result = await result

        return _resolve_report_status(result)
    except Exception:
        _LOGGER.exception("리포트 전송자 실행 실패: 경고 플래그로 처리")
        return {"telegram": False, "whatsapp": False, "approved": True}


async def send_telegram_report(
    articles: list[dict],
    analysis: dict | None = None,
    notebook_url: str | None = None,
    approval_required: bool = False,
) -> dict[str, bool]:
    """Compatibility wrapper; forwards to patched implementation if monkeypatched."""
    return await _invoke_report_sender(
        _send_telegram_report_impl,
        articles,
        analysis=analysis,
        notebook_url=notebook_url,
        approval_required=approval_required,
    )


# Canonical root wrapper identity for monkeypatch-safe resolution in tests/compat path.
_DEFAULT_ROOT_SEND_TELEGRAM_REPORT = send_telegram_report


async def _send_telegram_report_bridge(
    articles: list[dict],
    analysis: dict | None = None,
    notebook_url: str | None = None,
    approval_required: bool = False,
) -> dict[str, bool]:
    """Canonical bridge used by app runtime after hook binding."""
    return await _invoke_report_sender(
        _send_telegram_report_impl,
        articles,
        analysis=analysis,
        notebook_url=notebook_url,
        approval_required=approval_required,
    )


def _bind_testable_hooks() -> None:
    # Keep app-level hooks aligned with root-level monkeypatches.
    globals_map = globals()
    _app.scrape_uae_media = globals_map["scrape_uae_media"]
    _app.scrape_social_media = globals_map["scrape_social_media"]
    _app.scrape_rss = globals_map["scrape_rss"]
    _app._analyze_phase2 = globals_map["_analyze_phase2"]
    _app._upload_to_notebooklm = globals_map["_upload_to_notebooklm"]
    _app._write_health_state = globals_map["_write_health_state"]
    _app.send_telegram_alert = globals_map["send_telegram_alert"]
    global _send_telegram_report_impl
    candidate_impl = globals_map["send_telegram_report"]
    if candidate_impl in (
        _send_telegram_report_bridge,
        _DEFAULT_ROOT_SEND_TELEGRAM_REPORT,
    ):
        _send_telegram_report_impl = _canonical_reporter.send_telegram_report
    else:
        _send_telegram_report_impl = candidate_impl
    _app.send_telegram_report = _send_telegram_report_bridge


# Compatibility symbol for legacy imports
send_telegram_alert = send_telegram_alert
send_telegram_report = send_telegram_report


async def hourly_job(*, approval_required: bool = False, dry_run: bool = False) -> None:
    _bind_testable_hooks()
    await _app.hourly_job(approval_required=approval_required, dry_run=dry_run)


def _run_once(
    *,
    telegram_send: bool,
    dry_run: bool,
    json_archive: bool | None = None,
    mode: str = "full",
    ai_input: str | None = None,
) -> None:
    if json_archive is False:
        settings.REPORTS_ARCHIVE_ENABLED = False
    if json_archive is True:
        settings.REPORTS_ARCHIVE_ENABLED = True

    approval_required = not telegram_send
    _bind_testable_hooks()
    if mode == "lite":
        asyncio.run(_app.run_lite_cycle(dry_run=dry_run))
        return
    if mode == "ai":
        asyncio.run(_app.run_ai_cycle(ai_input_path=ai_input, approval_required=approval_required, dry_run=dry_run))
        return
    asyncio.run(_app.run_full_cycle(approval_required=approval_required, dry_run=dry_run))


def _run_serve(*, telegram_send: bool, dry_run: bool) -> None:
    approval_required = not telegram_send
    _bind_testable_hooks()
    run(approval_required=approval_required, dry_run=dry_run)


async def _probe_mode() -> dict:
    return await _app._probe_sources()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="iran-war-uae monitor runner")
    parser.add_argument("--once", action="store_true", help="Run one cycle and exit")
    parser.add_argument("--dry-run", action="store_true", help="Scrape + analyze only (no outbound sends)")
    parser.add_argument("--telegram-send", action="store_true", help="Skip approval gate and send immediately")
    parser.add_argument("--mode", choices=("full", "lite", "ai"), default="full", help="Execution mode for one-shot runs")
    parser.add_argument("--ai-input", help="Path to saved AI input payload for --mode ai")
    parser.add_argument("--probe-sources", action="store_true", help="Probe each source and print status")
    parser.add_argument("--serve", action="store_true", help="Run scheduler service")
    parser.add_argument("--json-archive", action="store_true", help="Force JSON archive on")
    parser.add_argument("--json-archive-off", action="store_true", help="Force JSON archive off for this run")
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args([] if os.getenv("PYTEST_CURRENT_TEST") else None)

    if args.probe_sources:
        result = asyncio.run(_probe_mode())
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    json_archive = True if args.json_archive else (False if args.json_archive_off else None)

    if args.mode == "ai" and not args.ai_input and (args.once or args.dry_run or not args.serve):
        args.ai_input = str(_app.AI_INPUT_FILE)

    if args.once or args.dry_run or args.mode != "full":
        _run_once(
            telegram_send=args.telegram_send,
            dry_run=args.dry_run,
            json_archive=json_archive,
            mode=args.mode,
            ai_input=args.ai_input,
        )
        return 0

    if args.serve:
        _run_serve(telegram_send=args.telegram_send, dry_run=args.dry_run)
        return 0

    legacy_script = ROOT / "iran-war-uae-monitor" / "scripts" / "run_monitor.py"
    result = subprocess.call([sys.executable, str(legacy_script)], cwd=str((ROOT / "iran-war-uae-monitor").resolve()))
    return int(result)


if __name__ == "__main__":
    raise SystemExit(main())
