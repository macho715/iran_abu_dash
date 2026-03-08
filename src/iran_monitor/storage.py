from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

try:
    from zoneinfo import ZoneInfo  # py>=3.9
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore[assignment]


DEFAULT_TZ = "Asia/Dubai"


def _tz() -> Any:
    if ZoneInfo is None:
        return timezone.utc
    return ZoneInfo(DEFAULT_TZ)


def iso_now() -> str:
    return datetime.now(_tz()).isoformat(timespec="seconds")


def sha1_hex(text: str) -> str:
    data = text.encode("utf-8")
    try:
        return hashlib.sha1(data, usedforsecurity=False).hexdigest()
    except TypeError:  # pragma: no cover
        return hashlib.sha1(data).hexdigest()


def make_article_id(canonical_url: str) -> str:
    return f"a_{sha1_hex(canonical_url)[:16]}"


def make_run_id(run_ts_iso: str) -> str:
    # stable-ish id: timestamp + short uuid
    u = uuid.uuid4().hex[:8]
    safe = run_ts_iso.replace(":", "").replace("+", "").replace("-", "")
    return f"r_{safe}_{u}"


def ensure_layout(root: Path) -> None:
    (root / "reports").mkdir(parents=True, exist_ok=True)
    (root / "db").mkdir(parents=True, exist_ok=True)
    (root / "state").mkdir(parents=True, exist_ok=True)
    (root / "outbox").mkdir(parents=True, exist_ok=True)
    (root / "ledger").mkdir(parents=True, exist_ok=True)
    (root / "exports" / "notebooklm").mkdir(parents=True, exist_ok=True)
    (root / "urgentdash_snapshots").mkdir(parents=True, exist_ok=True)


def connect_sqlite(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db(conn: sqlite3.Connection, schema_path: Path) -> None:
    sql = schema_path.read_text(encoding="utf-8")
    conn.executescript(sql)
    conn.commit()


def _json_dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _json_loads(text: str | None, default: Any) -> Any:
    if not text:
        return default
    try:
        return json.loads(text)
    except Exception:
        return default


def save_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_json_dumps(obj), encoding="utf-8")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def append_jsonl(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    line = _json_dumps(obj) + "\n"
    with path.open("a", encoding="utf-8") as f:
        f.write(line)


def save_run_json(root: Path, run: Mapping[str, Any]) -> Path:
    run_ts = str(run["run_ts"])
    dt = datetime.fromisoformat(run_ts)
    day = dt.date().isoformat()
    hour = dt.strftime("%H-00")
    out = root / "reports" / day / f"{hour}.json"
    save_json(out, dict(run))
    return out


def append_run_jsonl(root: Path, run: Mapping[str, Any]) -> Path:
    run_ts = str(run["run_ts"])
    dt = datetime.fromisoformat(run_ts)
    day = dt.date().isoformat()
    out = root / "reports" / f"{day}.jsonl"
    append_jsonl(out, dict(run))
    return out


def write_ledger_event(root: Path, event: Mapping[str, Any]) -> Path:
    ts = str(event.get("ts") or iso_now())
    dt = datetime.fromisoformat(ts)
    day = dt.date().isoformat()
    out = root / "ledger" / f"run_{day}.jsonl"
    append_jsonl(out, dict(event))
    return out


def upsert_run(conn: sqlite3.Connection, run: Mapping[str, Any]) -> None:
    conn.execute(
        """
        INSERT INTO runs(
          run_id, run_ts, threat_level, score, sentiment, summary_ad, summary_dxb,
          delta_json, flags_json, evidence_json, notebook_url
        ) VALUES (
          :run_id, :run_ts, :threat_level, :score, :sentiment, :summary_ad, :summary_dxb,
          :delta_json, :flags_json, :evidence_json, :notebook_url
        )
        ON CONFLICT(run_id) DO UPDATE SET
          run_ts=excluded.run_ts,
          threat_level=excluded.threat_level,
          score=excluded.score,
          sentiment=excluded.sentiment,
          summary_ad=excluded.summary_ad,
          summary_dxb=excluded.summary_dxb,
          delta_json=excluded.delta_json,
          flags_json=excluded.flags_json,
          evidence_json=excluded.evidence_json,
          notebook_url=excluded.notebook_url
        """,
        {
            "run_id": run["run_id"],
            "run_ts": run["run_ts"],
            "threat_level": run["threat_level"],
            "score": int(run["score"]),
            "sentiment": run.get("sentiment"),
            "summary_ad": run.get("summary_ad"),
            "summary_dxb": run.get("summary_dxb"),
            "delta_json": _json_dumps(run.get("delta", {})),
            "flags_json": _json_dumps(run.get("flags", [])),
            "evidence_json": _json_dumps(run.get("evidence", {})),
            "notebook_url": run.get("notebook_url"),
        },
    )


def upsert_articles(conn: sqlite3.Connection, articles: Iterable[Mapping[str, Any]]) -> list[str]:
    ids: list[str] = []
    for a in articles:
        canonical = str(a["canonical_url"])
        aid = str(a.get("article_id") or make_article_id(canonical))
        ids.append(aid)
        conn.execute(
            """
            INSERT INTO articles(
              article_id, canonical_url, source, title, city, tier, first_seen_ts, last_seen_ts
            ) VALUES (
              :article_id, :canonical_url, :source, :title, :city, :tier, :first_seen_ts, :last_seen_ts
            )
            ON CONFLICT(canonical_url) DO UPDATE SET
              title=excluded.title,
              source=excluded.source,
              city=excluded.city,
              tier=excluded.tier,
              last_seen_ts=excluded.last_seen_ts
            """,
            {
                "article_id": aid,
                "canonical_url": canonical,
                "source": a.get("source"),
                "title": a.get("title"),
                "city": a.get("city"),
                "tier": a.get("tier"),
                "first_seen_ts": a.get("first_seen_ts"),
                "last_seen_ts": a.get("last_seen_ts"),
            },
        )
    return ids


def link_run_articles(conn: sqlite3.Connection, run_id: str, article_ids: Iterable[str]) -> None:
    for aid in article_ids:
        conn.execute(
            """
            INSERT OR IGNORE INTO run_articles(run_id, article_id)
            VALUES (?, ?)
            """,
            (run_id, aid),
        )


def outbox_dir_for_run(root: Path, run_ts: str) -> Path:
    dt = datetime.fromisoformat(run_ts)
    day = dt.date().isoformat()
    return root / "outbox" / day


def write_outbox_files(
    root: Path,
    run_id: str,
    run_ts: str,
    channel: str,
    payload: str,
    meta: Mapping[str, Any] | None = None,
) -> tuple[Path, Path]:
    dt = datetime.fromisoformat(run_ts)
    day_dir = outbox_dir_for_run(root, run_ts)
    day_dir.mkdir(parents=True, exist_ok=True)
    hour = dt.strftime("%H-00")
    base = day_dir / f"{hour}_{channel}"
    md_path = base.with_suffix(".md")
    meta_path = base.with_suffix(".meta.json")

    md_path.write_text(payload, encoding="utf-8")
    save_json(
        meta_path,
        {
            "msg_id": str(uuid.uuid4()),
            "run_id": run_id,
            "channel": channel,
            "status": "PENDING",
            "attempts": 0,
            "created_ts": iso_now(),
            "meta": dict(meta or {}),
        },
    )
    return md_path, meta_path


def enqueue_outbox(
    conn: sqlite3.Connection,
    *,
    msg_id: str,
    run_id: str,
    channel: str,
    payload: str,
    created_ts: str,
    file_path: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO outbox(msg_id, run_id, channel, payload, status, attempts, last_error, created_ts, file_path)
        VALUES(:msg_id, :run_id, :channel, :payload, 'PENDING', 0, NULL, :created_ts, :file_path)
        ON CONFLICT(msg_id) DO UPDATE SET
          run_id=excluded.run_id,
          channel=excluded.channel,
          payload=excluded.payload,
          created_ts=excluded.created_ts,
          file_path=excluded.file_path
        """,
        {
            "msg_id": msg_id,
            "run_id": run_id,
            "channel": channel,
            "payload": payload,
            "created_ts": created_ts,
            "file_path": file_path,
        },
    )


def update_outbox_status(
    conn: sqlite3.Connection,
    *,
    msg_id: str,
    status: str,
    last_error: str | None = None,
) -> None:
    conn.execute(
        """
        UPDATE outbox
        SET status = ?,
            attempts = attempts + 1,
            last_error = ?,
            created_ts = created_ts
        WHERE msg_id = ?
        """,
        (status, last_error, msg_id),
    )


def mark_seen_articles(root: Path, canonical_urls: Iterable[str]) -> int:
    path = root / "state" / "seen_articles.json"
    data = load_json(path, {"hashes": []})
    hashes = set(data.get("hashes", []))
    before = len(hashes)
    for u in canonical_urls:
        hashes.add(sha1_hex(u))
    data["hashes"] = sorted(hashes)
    save_json(path, data)
    return len(hashes) - before


def rotate_notebook_packs(
    root: Path,
    *,
    pack_id: str,
    notebook_url: str,
    cap: int = 48,
) -> list[dict[str, Any]]:
    path = root / "state" / "nblm_rotation.json"
    data = load_json(path, {"packs": []})
    packs: list[dict[str, Any]] = list(data.get("packs", []))

    packs.append(
        {
            "pack_id": pack_id,
            "notebook_url": notebook_url,
            "created_ts": iso_now(),
        }
    )

    # keep last N
    packs = packs[-cap:]
    data["packs"] = packs
    save_json(path, data)
    return packs


def persist_run(
    root: Path,
    db_path: Path,
    schema_path: Path,
    *,
    run: Mapping[str, Any],
    articles: Iterable[Mapping[str, Any]] = (),
    outbox_msgs: Iterable[Mapping[str, Any]] = (),
    notebook_rotation_cap: int = 48,
) -> dict[str, Any]:
    # materialize to allow multi-pass (generators safe)
    articles_list = list(articles)
    outbox_list = list(outbox_msgs)

    ensure_layout(root)

    report_path = save_run_json(root, run)
    jsonl_path = append_run_jsonl(root, run)

    conn = connect_sqlite(db_path)
    try:
        init_db(conn, schema_path)

        with conn:
            upsert_run(conn, run)
            article_ids = upsert_articles(conn, articles_list)
            link_run_articles(conn, str(run["run_id"]), article_ids)

            # outbox (approval-gated send happens elsewhere)
            for msg in outbox_list:
                msg_id = str(msg.get("msg_id") or uuid.uuid4())
                enqueue_outbox(
                    conn,
                    msg_id=msg_id,
                    run_id=str(run["run_id"]),
                    channel=str(msg["channel"]),
                    payload=str(msg["payload"]),
                    created_ts=str(msg.get("created_ts") or iso_now()),
                    file_path=str(msg.get("file_path") or ""),
                )

        # state updates
        seen_added = mark_seen_articles(
            root, [str(a["canonical_url"]) for a in articles_list if a.get("canonical_url")]
        )

        # notebook rotation
        nb_url = run.get("notebook_url")
        packs = None
        if nb_url:
            packs = rotate_notebook_packs(
                root,
                pack_id=str(run.get("pack_id") or run["run_id"]),
                notebook_url=str(nb_url),
                cap=int(notebook_rotation_cap),
            )

        write_ledger_event(
            root,
            {
                "ts": iso_now(),
                "event": "persist_run_ok",
                "run_id": run.get("run_id"),
                "report_path": str(report_path),
                "jsonl_path": str(jsonl_path),
                "articles": len(articles_list),
                "seen_added": seen_added,
            },
        )

        return {
            "report_path": str(report_path),
            "jsonl_path": str(jsonl_path),
            "seen_added": seen_added,
            "packs": packs,
        }
    finally:
        conn.close()
