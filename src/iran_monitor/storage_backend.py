from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import structlog

from .config import settings
from .storage import (
    connect_sqlite,
    ensure_layout,
    init_db,
    iso_now,
    make_article_id,
    persist_run as persist_run_sqlite,
    write_ledger_event,
)

logger = structlog.get_logger()


def _resolve(root: Path, value: str) -> Path:
    p = Path(value)
    if p.is_absolute():
        return p
    return (root / p).resolve()


def _backend() -> str:
    """Backend selector.

    Priority:
    1) STORAGE_BACKEND explicitly set in env -> honor value
    2) DATABASE_URL set -> postgres
    3) fallback sqlite
    """
    forced = (settings.STORAGE_BACKEND or "").strip().lower()
    has_explicit_override = "STORAGE_BACKEND" in os.environ
    if has_explicit_override and forced == "sqlite":
        return "sqlite"
    if has_explicit_override and forced in ("postgres", "pg"):
        return "postgres"
    if (settings.DATABASE_URL or "").strip():
        return "postgres"
    return "sqlite"


def persist_run_backend(
    root: Path,
    sqlite_db_path: Path,
    sqlite_schema_path: Path,
    *,
    run: Mapping[str, Any],
    articles: Iterable[Mapping[str, Any]] = (),
    outbox_msgs: Iterable[Mapping[str, Any]] = (),
    notebook_rotation_cap: int = 48,
) -> dict[str, Any]:
    """Persist to A(JSON/JSONL) + B(DB). DB backend auto-switches in Phase 4."""
    backend = _backend()
    if backend == "postgres":
        dsn = (settings.DATABASE_URL or "").strip()
        if not dsn:
            logger.warning("postgres backend requested but DATABASE_URL missing -> sqlite fallback")
            backend = "sqlite"
        else:
            return _persist_postgres(
                root=root,
                dsn=dsn,
                schema_path=_resolve(root, settings.STORAGE_PG_SCHEMA_PATH),
                run=run,
                articles=articles,
                outbox_msgs=outbox_msgs,
                notebook_rotation_cap=notebook_rotation_cap,
            )

    # default: sqlite
    return persist_run_sqlite(
        root,
        sqlite_db_path,
        sqlite_schema_path,
        run=run,
        articles=articles,
        outbox_msgs=outbox_msgs,
        notebook_rotation_cap=notebook_rotation_cap,
    )


def get_existing_canonical_urls(
    *,
    root: Path,
    sqlite_db_path: Path,
    sqlite_schema_path: Path,
    canonical_urls: Sequence[str],
) -> set[str]:
    """Return canonical_url set that already exists in storage.

    Used for persistent dedup (cloud restarts).
    """
    urls = [u.strip() for u in canonical_urls if u and str(u).strip()]
    if not urls:
        return set()

    backend = _backend()
    if backend == "postgres" and (settings.DATABASE_URL or "").strip():
        return _existing_urls_postgres(
            dsn=settings.DATABASE_URL.strip(),
            schema_path=_resolve(root, settings.STORAGE_PG_SCHEMA_PATH),
            urls=urls,
        )

    return _existing_urls_sqlite(db_path=sqlite_db_path, schema_path=sqlite_schema_path, urls=urls)


def _existing_urls_sqlite(db_path: Path, schema_path: Path, urls: Sequence[str]) -> set[str]:
    conn = connect_sqlite(db_path)
    try:
        init_db(conn, schema_path)
        placeholders = ",".join("?" for _ in urls)
        rows = conn.execute(
            f"SELECT canonical_url FROM articles WHERE canonical_url IN ({placeholders})",
            list(urls),
        ).fetchall()
        return {str(r[0]) for r in rows}
    finally:
        conn.close()


def _existing_urls_postgres(dsn: str, schema_path: Path, urls: Sequence[str]) -> set[str]:
    import psycopg  # type: ignore

    with psycopg.connect(dsn) as conn:
        _init_postgres(conn, schema_path)
        with conn.cursor() as cur:
            cur.execute("SELECT canonical_url FROM articles WHERE canonical_url = ANY(%s)", (list(urls),))
            return {str(r[0]) for r in cur.fetchall()}


def _persist_postgres(
    *,
    root: Path,
    dsn: str,
    schema_path: Path,
    run: Mapping[str, Any],
    articles: Iterable[Mapping[str, Any]],
    outbox_msgs: Iterable[Mapping[str, Any]],
    notebook_rotation_cap: int,
) -> dict[str, Any]:
    """Postgres persistence (Phase 4).

    Keeps Option A (reports/*.json + *.jsonl) as a reproducible ledger.
    """
    import uuid

    import psycopg  # type: ignore

    from .storage import (
        _json_dumps,
        append_run_jsonl,
        mark_seen_articles,
        rotate_notebook_packs,
        save_run_json,
        write_outbox_files,
    )

    articles_list = list(articles)
    outbox_list = list(outbox_msgs)

    ensure_layout(root)

    # Option A (file ledger)
    report_path = save_run_json(root, run)
    jsonl_path = append_run_jsonl(root, run)

    with psycopg.connect(dsn) as conn:
        _init_postgres(conn, schema_path)

        with conn.cursor() as cur:
            _upsert_run_pg(cur, run, _json_dumps)
            article_ids = _upsert_articles_pg(cur, articles_list)
            _link_run_articles_pg(cur, str(run["run_id"]), article_ids)

            # outbox mirror: also writes files to outbox/YYYY-MM-DD/HH-00_channel.*
            for msg in outbox_list:
                channel = str(msg.get("channel") or "telegram")
                payload = str(msg.get("payload") or "")
                created_ts = str(msg.get("created_ts") or iso_now())

                msg_id = str(msg.get("msg_id") or uuid.uuid4())
                md_path, meta_path = write_outbox_files(
                    root,
                    run_id=str(run["run_id"]),
                    run_ts=str(run["run_ts"]),
                    channel=channel,
                    payload=payload,
                    meta=dict(msg.get("meta") or {}),
                )
                _enqueue_outbox_pg(
                    cur,
                    msg_id=msg_id,
                    run_id=str(run["run_id"]),
                    channel=channel,
                    payload=payload,
                    created_ts=created_ts,
                    file_path=str(meta_path),
                )

        conn.commit()

    # state updates (local state files; cloud에서는 artifact로 남길 수 있음)
    seen_added = mark_seen_articles(
        root,
        [str(a["canonical_url"]) for a in articles_list if a.get("canonical_url")],
    )

    packs = None
    nb_url = run.get("notebook_url")
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
            "backend": "postgres",
            "run_id": run.get("run_id"),
            "report_path": str(report_path),
            "jsonl_path": str(jsonl_path),
            "articles": len(articles_list),
            "seen_added": seen_added,
        },
    )

    return {
        "backend": "postgres",
        "report_path": str(report_path),
        "jsonl_path": str(jsonl_path),
        "seen_added": seen_added,
        "packs": packs,
    }


def _init_postgres(conn: Any, schema_path: Path) -> None:
    schema_path.parent.mkdir(parents=True, exist_ok=True)
    sql = schema_path.read_text(encoding="utf-8")
    statements = [s.strip() for s in sql.split(";") if s.strip()]
    with conn.cursor() as cur:
        for stmt in statements:
            cur.execute(stmt)
    conn.commit()


def _upsert_run_pg(cur: Any, run: Mapping[str, Any], json_dumps: Any) -> None:
    cur.execute(
        """
        INSERT INTO runs(
          run_id, run_ts, threat_level, score, sentiment, summary_ad, summary_dxb,
          delta_json, flags_json, evidence_json, notebook_url
        )
        VALUES (
          %(run_id)s, %(run_ts)s, %(threat_level)s, %(score)s, %(sentiment)s, %(summary_ad)s, %(summary_dxb)s,
          %(delta_json)s, %(flags_json)s, %(evidence_json)s, %(notebook_url)s
        )
        ON CONFLICT (run_id) DO UPDATE SET
          run_ts = EXCLUDED.run_ts,
          threat_level = EXCLUDED.threat_level,
          score = EXCLUDED.score,
          sentiment = EXCLUDED.sentiment,
          summary_ad = EXCLUDED.summary_ad,
          summary_dxb = EXCLUDED.summary_dxb,
          delta_json = EXCLUDED.delta_json,
          flags_json = EXCLUDED.flags_json,
          evidence_json = EXCLUDED.evidence_json,
          notebook_url = EXCLUDED.notebook_url
        """,
        {
            "run_id": run["run_id"],
            "run_ts": run["run_ts"],
            "threat_level": run["threat_level"],
            "score": int(run["score"]),
            "sentiment": run.get("sentiment"),
            "summary_ad": run.get("summary_ad"),
            "summary_dxb": run.get("summary_dxb"),
            "delta_json": json_dumps(run.get("delta", {})),
            "flags_json": json_dumps(run.get("flags", [])),
            "evidence_json": json_dumps(run.get("evidence", {})),
            "notebook_url": run.get("notebook_url"),
        },
    )


def _upsert_articles_pg(cur: Any, articles: list[Mapping[str, Any]]) -> list[str]:
    ids: list[str] = []
    for a in articles:
        canonical = str(a["canonical_url"])
        aid = str(a.get("article_id") or make_article_id(canonical))
        ids.append(aid)

        cur.execute(
            """
            INSERT INTO articles(
              article_id, canonical_url, source, title, city, tier, first_seen_ts, last_seen_ts
            )
            VALUES (
              %(article_id)s, %(canonical_url)s, %(source)s, %(title)s, %(city)s, %(tier)s, %(first_seen_ts)s, %(last_seen_ts)s
            )
            ON CONFLICT (canonical_url) DO UPDATE SET
              title = EXCLUDED.title,
              source = EXCLUDED.source,
              city = EXCLUDED.city,
              tier = EXCLUDED.tier,
              last_seen_ts = EXCLUDED.last_seen_ts
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


def _link_run_articles_pg(cur: Any, run_id: str, article_ids: Iterable[str]) -> None:
    for aid in article_ids:
        cur.execute(
            """
            INSERT INTO run_articles(run_id, article_id) VALUES (%s, %s)
            ON CONFLICT DO NOTHING
            """,
            (run_id, aid),
        )


def _enqueue_outbox_pg(
    cur: Any,
    *,
    msg_id: str,
    run_id: str,
    channel: str,
    payload: str,
    created_ts: str,
    file_path: str,
) -> None:
    cur.execute(
        """
        INSERT INTO outbox(
          msg_id, run_id, channel, payload, status, attempts, last_error, created_ts, file_path
        )
        VALUES (
          %(msg_id)s, %(run_id)s, %(channel)s, %(payload)s, %(status)s, %(attempts)s, %(last_error)s, %(created_ts)s, %(file_path)s
        )
        ON CONFLICT (msg_id) DO UPDATE SET
          run_id = EXCLUDED.run_id,
          channel = EXCLUDED.channel,
          payload = EXCLUDED.payload,
          created_ts = EXCLUDED.created_ts,
          file_path = EXCLUDED.file_path
        """,
        {
            "msg_id": msg_id,
            "run_id": run_id,
            "channel": channel,
            "payload": payload,
            "status": "PENDING",
            "attempts": 0,
            "last_error": None,
            "created_ts": created_ts,
            "file_path": file_path,
        },
    )
