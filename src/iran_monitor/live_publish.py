from __future__ import annotations

import json
import hashlib
import os
import shutil
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

LATEST_FILENAME = "latest.json"
LEGACY_FILENAME = "hyie_state.json"
LAST_UPDATED_FILENAME = "last_updated.json"
VERSION_DIRNAME = "v"
LITE_FILENAME = "state-lite.json"
AI_FILENAME = "state-ai.json"


def _json_text(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _compute_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _compute_sig(filename: str, digest: str) -> str:
    return hashlib.sha256(f"{filename}:{digest}".encode("utf-8")).hexdigest()


def _write_integrity_sidecar(path: Path, text: str) -> dict[str, str]:
    digest = _compute_hash(text)
    signature = _compute_sig(path.name, digest)
    path.with_suffix(f"{path.suffix}.sha256").write_text(f"sha256:{digest}\n", encoding="utf-8")
    path.with_suffix(f"{path.suffix}.sig").write_text(f"sha256sig:{signature}\n", encoding="utf-8")
    return {"hash": digest, "sig": signature}


def _provenance_payload(collected_at: str | None = None) -> dict[str, str]:
    return {
        "build_commit": str(os.getenv("GITHUB_SHA", "")),
        "generated_by": str(os.getenv("GITHUB_ACTOR", "local")),
        "generated_at": str(collected_at or utc_now_iso()),
        "workflow_run_id": str(os.getenv("GITHUB_RUN_ID", "")),
    }


def default_live_root(project_root: Path) -> Path:
    return (project_root / "live").resolve()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def version_from_ts(ts_iso: str | None) -> str:
    if not ts_iso:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")

    try:
        dt = datetime.fromisoformat(str(ts_iso).replace("Z", "+00:00"))
    except ValueError:
        safe = "".join(ch if ch.isalnum() else "-" for ch in str(ts_iso))
        return safe.strip("-") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")


def parse_version(version: str) -> datetime | None:
    try:
        return datetime.strptime(version, "%Y-%m-%dT%H-%M-%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    return payload


def save_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = _json_text(payload)
    path.write_text(text, encoding="utf-8")
    _write_integrity_sidecar(path, text)


def lite_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    payload = deepcopy(snapshot)
    payload.pop("ai_analysis", None)
    return payload


def merge_ai_into_snapshot(snapshot: dict[str, Any], ai_analysis: dict[str, Any] | None) -> dict[str, Any]:
    payload = lite_snapshot(snapshot)
    if ai_analysis:
        payload["ai_analysis"] = deepcopy(ai_analysis)
    return payload


def load_live_latest(live_root: Path) -> dict[str, Any] | None:
    return load_json(live_root / LATEST_FILENAME)


def load_live_compat(live_root: Path) -> dict[str, Any] | None:
    return load_json(live_root / LEGACY_FILENAME)


def _with_health_fields(latest: dict[str, Any], health: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(health, dict):
        return latest

    mapping = {
        "last_lite_success_at": "lastLiteSuccessAt",
        "last_ai_success_at": "lastAiSuccessAt",
        "last_lite_duration_ms": "lastLiteDurationMs",
        "last_ai_duration_ms": "lastAiDurationMs",
        "last_error_stage": "lastErrorStage",
        "stale_reason": "staleReason",
    }
    for src_key, dst_key in mapping.items():
        value = health.get(src_key)
        if value is not None:
            latest[dst_key] = value
    return latest


def _last_updated_payload(snapshot: dict[str, Any], latest: dict[str, Any]) -> dict[str, Any]:
    return {
        "published_at": latest.get("collectedAt"),
        "state_ts": snapshot.get("state_ts"),
        "status": snapshot.get("status"),
        "degraded": snapshot.get("degraded"),
        "version": latest.get("version"),
        "ai_version": latest.get("aiVersion"),
        "ai_updated_at": latest.get("aiUpdatedAt"),
    }


def _version_dir(live_root: Path, version: str) -> Path:
    return live_root / VERSION_DIRNAME / version


def _rel_version_file(version: str, filename: str) -> str:
    return f"{VERSION_DIRNAME}/{version}/{filename}"


def _integrity_rel_file(version: str, filename: str, suffix: str) -> str:
    return f"{VERSION_DIRNAME}/{version}/{filename}{suffix}"


def _file_integrity(path: Path) -> dict[str, str]:
    payload = load_json(path)
    text = _json_text(payload or {})
    digest = _compute_hash(text)
    return {"hash": digest, "sig": _compute_sig(path.name, digest)}


def publish_lite_bundle(
    *,
    live_root: Path,
    snapshot: dict[str, Any],
    version: str,
    collected_at: str | None = None,
    health: dict[str, Any] | None = None,
) -> dict[str, Any]:
    collected_at = collected_at or utc_now_iso()
    lite = lite_snapshot(snapshot)
    provenance = _provenance_payload(collected_at)
    latest = {
        "version": version,
        "collectedAt": collected_at,
        "stateTs": lite.get("state_ts"),
        "liteUrl": _rel_version_file(version, LITE_FILENAME),
        "aiVersion": None,
        "aiUpdatedAt": None,
        "aiUrl": None,
        "legacyUrl": LEGACY_FILENAME,
        "status": {"lite": "ok", "ai": "pending"},
        "sourceHealth": lite.get("source_health", {}),
        "provenance": provenance,
        "integrity": {
            "lite": {
                "hash": _compute_hash(_json_text(lite)),
                "sig": _compute_sig(LITE_FILENAME, _compute_hash(_json_text(lite))),
                "hashUrl": _integrity_rel_file(version, LITE_FILENAME, ".sha256"),
                "sigUrl": _integrity_rel_file(version, LITE_FILENAME, ".sig"),
            }
        },
    }
    latest = _with_health_fields(latest, health)

    save_json(_version_dir(live_root, version) / LITE_FILENAME, lite)
    save_json(live_root / LATEST_FILENAME, latest)
    save_json(live_root / LEGACY_FILENAME, lite)
    save_json(live_root / LAST_UPDATED_FILENAME, _last_updated_payload(lite, latest))
    return latest


def publish_ai_bundle(
    *,
    live_root: Path,
    snapshot: dict[str, Any],
    version: str,
    ai_analysis: dict[str, Any],
    ai_updated_at: str | None = None,
    health: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ai_updated_at = ai_updated_at or str(ai_analysis.get("updated_at") or utc_now_iso())
    provenance = _provenance_payload(ai_updated_at)
    latest = load_live_latest(live_root) or {
        "version": version,
        "collectedAt": utc_now_iso(),
        "stateTs": snapshot.get("state_ts"),
        "liteUrl": _rel_version_file(version, LITE_FILENAME),
        "aiVersion": None,
        "aiUpdatedAt": None,
        "aiUrl": None,
        "legacyUrl": LEGACY_FILENAME,
        "status": {"lite": "ok", "ai": "pending"},
        "sourceHealth": snapshot.get("source_health", {}),
    }
    latest["version"] = version
    latest["stateTs"] = snapshot.get("state_ts")
    latest["liteUrl"] = _rel_version_file(version, LITE_FILENAME)
    latest["aiVersion"] = ai_updated_at
    latest["aiUpdatedAt"] = ai_updated_at
    latest["aiUrl"] = _rel_version_file(version, AI_FILENAME)
    latest["legacyUrl"] = LEGACY_FILENAME
    latest["status"] = {
        "lite": str((latest.get("status") or {}).get("lite") or "ok"),
        "ai": "ok",
    }
    latest["sourceHealth"] = snapshot.get("source_health", {})
    latest["provenance"] = provenance

    ai_payload = {
        "version": version,
        "aiVersion": ai_updated_at,
        "aiUpdatedAt": ai_updated_at,
        "aiStatus": "ok",
        "ai_analysis": deepcopy(ai_analysis),
        "provenance": provenance,
    }
    save_json(_version_dir(live_root, version) / AI_FILENAME, ai_payload)

    latest["integrity"] = latest.get("integrity") or {}
    latest["integrity"]["lite"] = _file_integrity(_version_dir(live_root, version) / LITE_FILENAME)
    latest["integrity"]["lite"]["hashUrl"] = _integrity_rel_file(version, LITE_FILENAME, ".sha256")
    latest["integrity"]["lite"]["sigUrl"] = _integrity_rel_file(version, LITE_FILENAME, ".sig")
    latest["integrity"]["ai"] = _file_integrity(_version_dir(live_root, version) / AI_FILENAME)
    latest["integrity"]["ai"]["hashUrl"] = _integrity_rel_file(version, AI_FILENAME, ".sha256")
    latest["integrity"]["ai"]["sigUrl"] = _integrity_rel_file(version, AI_FILENAME, ".sig")
    latest = _with_health_fields(latest, health)

    compat_payload = merge_ai_into_snapshot(snapshot, ai_analysis)
    save_json(live_root / LATEST_FILENAME, latest)
    save_json(live_root / LEGACY_FILENAME, compat_payload)
    save_json(live_root / LAST_UPDATED_FILENAME, _last_updated_payload(compat_payload, latest))
    return latest


def export_bundle_from_state(
    *,
    live_root: Path,
    snapshot: dict[str, Any],
    version: str | None = None,
    collected_at: str | None = None,
    health: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resolved_version = version or version_from_ts(str(snapshot.get("state_ts") or ""))
    latest = publish_lite_bundle(
        live_root=live_root,
        snapshot=snapshot,
        version=resolved_version,
        collected_at=collected_at,
        health=health,
    )
    ai_analysis = snapshot.get("ai_analysis")
    if isinstance(ai_analysis, dict) and ai_analysis:
        latest = publish_ai_bundle(
            live_root=live_root,
            snapshot=snapshot,
            version=resolved_version,
            ai_analysis=ai_analysis,
            ai_updated_at=str(ai_analysis.get("updated_at") or collected_at or utc_now_iso()),
            health=health,
        )
    return latest


def prune_old_versions(live_root: Path, keep_days: int, now: datetime | None = None) -> list[str]:
    base = live_root / VERSION_DIRNAME
    if keep_days <= 0 or not base.exists():
        return []

    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=keep_days)
    removed: list[str] = []
    for entry in sorted(base.iterdir()):
        if not entry.is_dir():
            continue
        parsed = parse_version(entry.name)
        if parsed is None or parsed >= cutoff:
            continue
        shutil.rmtree(entry, ignore_errors=True)
        removed.append(entry.name)
    return removed
