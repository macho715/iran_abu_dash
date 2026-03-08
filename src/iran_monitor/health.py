"""
헬스체크 API (Phase 1 안정화)
==============================
FastAPI 엔드포인트:
- GET /health
- GET /api/state
- stale `latest.json` 감지 시 lite refresh 자동 실행
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import structlog

from .config import settings
from .live_publish import AI_FILENAME, LATEST_FILENAME, LEGACY_FILENAME, LITE_FILENAME, VERSION_DIRNAME, default_live_root
from .state_engine import warming_up_payload

app = FastAPI(title="Iran-UAE Monitor Health")
logger = structlog.get_logger()
_storage_root = Path(settings.STORAGE_ROOT)
if not _storage_root.is_absolute():
    _storage_root = (Path(__file__).resolve().parents[2] / _storage_root).resolve()

HEALTH_STATE_FILE = (_storage_root / settings.HEALTH_STATE_FILE).resolve()
HYIE_STATE_FILE = (_storage_root / settings.HYIE_STATE_FILE).resolve()
HYIE_EGRESS_ETA_FILE = (_storage_root / settings.HYIE_EGRESS_ETA_FILE).resolve()
LIVE_ROOT = default_live_root(Path(__file__).resolve().parents[2])
_LIVE_REFRESH_LOCK: asyncio.Lock | None = None
_LIVE_REFRESH_LOCK_LOOP: asyncio.AbstractEventLoop | None = None
_LIVE_REFRESH_LAST_ATTEMPT_AT: datetime | None = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def _read_json_file(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    return payload


def _read_live_file(name: str) -> dict[str, Any] | None:
    return _read_json_file(LIVE_ROOT / name)


def _parse_iso_ts(raw: Any) -> datetime | None:
    text = str(raw or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _latest_reference_ts(payload: dict[str, Any] | None) -> datetime | None:
    if not isinstance(payload, dict):
        return None
    for key in ("collectedAt", "collected_at", "stateTs", "state_ts"):
        parsed = _parse_iso_ts(payload.get(key))
        if parsed is not None:
            return parsed
    return None


def _latest_is_stale(payload: dict[str, Any] | None) -> bool:
    reference_ts = _latest_reference_ts(payload)
    if reference_ts is None:
        return True
    age_seconds = (datetime.now(timezone.utc) - reference_ts).total_seconds()
    return age_seconds >= int(settings.LIVE_REFRESH_STALE_AFTER_SEC)


def _refresh_cooldown_active(now: datetime) -> bool:
    if _LIVE_REFRESH_LAST_ATTEMPT_AT is None:
        return False
    age_seconds = (now - _LIVE_REFRESH_LAST_ATTEMPT_AT).total_seconds()
    return age_seconds < int(settings.LIVE_REFRESH_RETRY_COOLDOWN_SEC)


def _get_refresh_lock() -> asyncio.Lock:
    global _LIVE_REFRESH_LOCK
    global _LIVE_REFRESH_LOCK_LOOP

    loop = asyncio.get_running_loop()
    if _LIVE_REFRESH_LOCK is None or _LIVE_REFRESH_LOCK_LOOP is not loop:
        _LIVE_REFRESH_LOCK = asyncio.Lock()
        _LIVE_REFRESH_LOCK_LOOP = loop
    return _LIVE_REFRESH_LOCK


async def _refresh_live_bundle(reason: str) -> dict[str, Any] | None:
    global _LIVE_REFRESH_LAST_ATTEMPT_AT

    async with _get_refresh_lock():
        current_payload = _read_live_file(LATEST_FILENAME)
        if current_payload is not None and not _latest_is_stale(current_payload):
            return current_payload

        now = datetime.now(timezone.utc)
        if _refresh_cooldown_active(now):
            logger.info("live bundle refresh skipped due to cooldown", reason=reason)
            return current_payload

        _LIVE_REFRESH_LAST_ATTEMPT_AT = now
        logger.info("live bundle refresh triggered", reason=reason)
        try:
            from .app import run_lite_cycle

            await asyncio.wait_for(run_lite_cycle(dry_run=False), timeout=float(settings.LIVE_REFRESH_WAIT_TIMEOUT_SEC))
        except asyncio.TimeoutError:
            logger.warning("live bundle refresh timed out", reason=reason)
        except Exception as exc:
            logger.warning("live bundle refresh failed", reason=reason, error=str(exc))

        return _read_live_file(LATEST_FILENAME)


async def _ensure_live_bundle(reason: str) -> dict[str, Any] | None:
    payload = _read_live_file(LATEST_FILENAME)
    if not settings.LIVE_AUTO_REFRESH_ENABLED:
        return payload
    if payload is not None and not _latest_is_stale(payload):
        return payload
    return await _refresh_live_bundle(reason)


@app.get("/health")
def health():
    """마지막 파이프라인 실행 상태 및 성공 시각/기사 수 반환."""
    data = _read_json_file(HEALTH_STATE_FILE)
    if data is None:
        return {
            "status": "unknown",
            "message": "아직 한 번도 실행되지 않음",
            "last_success_at": None,
            "last_lite_success_at": None,
            "last_ai_success_at": None,
        }

    last_lite_success_at = data.get("last_lite_success_at", data.get("last_success_at"))
    last_ai_success_at = data.get("last_ai_success_at")
    last_run_ts = data.get("last_run_ts", last_lite_success_at)
    return {
        "status": data.get("status", "unknown"),
        "last_success_at": last_lite_success_at,
        "last_lite_success_at": last_lite_success_at,
        "last_ai_success_at": last_ai_success_at,
        "last_lite_duration_ms": data.get("last_lite_duration_ms"),
        "last_ai_duration_ms": data.get("last_ai_duration_ms"),
        "last_error_stage": data.get("last_error_stage"),
        "stale_reason": data.get("stale_reason"),
        "last_run_ts": last_run_ts,
        "last_article_count": data.get("last_article_count", data.get("counts", {}).get("new_count")),
        "counts": data.get("counts") or {},
        "last_error": data.get("last_error"),
        "source_health": data.get("source_health") or {},
    }


@app.get("/api/state")
async def api_state() -> dict[str, Any]:
    """HyIE-ERC² 상태 payload 반환. 파일이 없으면 warming_up 상태를 반환."""
    await _ensure_live_bundle("api_state")
    data = _read_live_file(LEGACY_FILENAME) or _read_json_file(HYIE_STATE_FILE)
    if data is None:
        return warming_up_payload()

    required_keys = {
        "state_ts",
        "status",
        "source_health",
        "degraded",
        "flags",
        "intel_feed",
        "indicators",
        "hypotheses",
        "routes",
        "checklist",
    }
    missing = sorted(required_keys - set(data.keys()))
    if missing:
        payload = warming_up_payload()
        payload["flags"] = payload.get("flags", []) + [f"STATE_SCHEMA_MISSING:{','.join(missing)}"]
        payload["status"] = "warming_up"
        return payload

    return data


@app.get("/api/live/latest")
async def api_live_latest() -> JSONResponse:
    payload = await _ensure_live_bundle("api_live_latest")
    if payload is None:
        return JSONResponse(status_code=404, content={"error": "latest.json not found"})
    return JSONResponse(content=payload)


@app.get("/api/live/v/{version}/{artifact}")
def api_live_versioned(version: str, artifact: str) -> JSONResponse:
    if artifact not in {LITE_FILENAME, AI_FILENAME}:
        return JSONResponse(status_code=404, content={"error": "unsupported artifact"})
    payload = _read_json_file(LIVE_ROOT / VERSION_DIRNAME / version / artifact)
    if payload is None:
        return JSONResponse(status_code=404, content={"error": "artifact not found"})
    return JSONResponse(content=payload)


@app.get("/api/state/egress-eta")
def get_egress_eta() -> dict[str, Any]:
    payload = _read_json_file(HYIE_EGRESS_ETA_FILE) or {}
    return {
        "egress_loss_eta_h": payload.get("egress_loss_eta_h"),
        "note": payload.get("note"),
        "updated_at": payload.get("updated_at"),
        "source": "manual_file",
        "path": str(HYIE_EGRESS_ETA_FILE),
    }


@app.post("/api/state/egress-eta")
def set_egress_eta(body: dict[str, Any]) -> dict[str, Any]:
    raw = body.get("egress_loss_eta_h")
    if raw is None:
        return {"ok": False, "error": "egress_loss_eta_h is required"}
    try:
        hours = max(0.0, float(raw))
    except (TypeError, ValueError):
        return {"ok": False, "error": "egress_loss_eta_h must be numeric"}

    payload = {
        "egress_loss_eta_h": hours,
        "note": str(body.get("note") or ""),
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }
    HYIE_EGRESS_ETA_FILE.parent.mkdir(parents=True, exist_ok=True)
    HYIE_EGRESS_ETA_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, **payload}


@app.get("/")
def root():
    """엔드포인트 안내."""
    return {
        "service": "Iran-UAE Monitor",
        "health": "/health",
        "state": "/api/state",
        "live_latest": "/api/live/latest",
        "live_versioned": "/api/live/v/{version}/{artifact}",
        "egress_eta": "/api/state/egress-eta",
    }
