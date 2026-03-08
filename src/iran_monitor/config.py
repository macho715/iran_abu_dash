from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class Settings(BaseSettings):
    """Runtime settings (env-first).

    Notes
    - Base defaults keep local SQLite mode working out-of-the-box.
    - Phase 4 (cloud) switches to Postgres when DATABASE_URL is set.
    """

    model_config = SettingsConfigDict(extra="ignore")

    # Telegram
    TELEGRAM_BOT_TOKEN: str = "your_bot_token_here"
    TELEGRAM_CHAT_ID: str = "your_chat_id_here"

    # Twilio WhatsApp
    TWILIO_ACCOUNT_SID: str = "your_twilio_account_sid"
    TWILIO_AUTH_TOKEN: str = "your_twilio_auth_token"
    TWILIO_WHATSAPP_FROM: str = "+14155238886"
    # Comma separated: +9715xxxxxxx,+9715yyyyyyy
    WHATSAPP_RECIPIENTS: str = ""

    # General
    HEADLESS: bool = True
    LOG_LEVEL: str = "INFO"

    # RSS
    RSS_ENABLE_AP_FEED: bool = True
    RSS_TIMEOUT_SEC: int = 15
    RSS_LOG_VERBOSE_ERRORS: bool = False
    RSS_USER_AGENT: str = "Iran-UAE-Monitor/1.0"

    # Phase 2
    PHASE2_ENABLED: bool = True
    PHASE2_QUERY_TIMEOUT_SEC: int = 90
    THREAT_THRESHOLD_MEDIUM: int = 40
    THREAT_THRESHOLD_HIGH: int = 70
    THREAT_THRESHOLD_CRITICAL: int = 85
    PHASE2_ALERT_LEVELS: str = "HIGH,CRITICAL"
    PHASE2_PODCAST_ENABLED: bool = False
    PHASE2_REPORT_LANGUAGE: str = "ko"
    PHASE2_REQUIRE_CROSS_CHECK_FOR_ALERT: bool = False

    # Storage (A + B)
    STORAGE_ENABLED: bool = True
    STORAGE_ROOT: str = "."
    STORAGE_DB_PATH: str = "db/iran_monitor.sqlite"
    STORAGE_SCHEMA_PATH: str = "src/iran_monitor/schema.sql"

    # Phase 4: Postgres backend (SSOT for dashboard)
    # - If DATABASE_URL is present, backend auto switches to 'postgres' unless forced to 'sqlite'.
    # - Supported values: sqlite | postgres
    STORAGE_BACKEND: str = "sqlite"
    DATABASE_URL: str = ""
    STORAGE_PG_SCHEMA_PATH: str = "src/iran_monitor/schema_pg.sql"

    # Deduplication across restarts (cloud 필수)
    # - When True, prefer DB check (articles table) for "already seen" filtering.
    DEDUP_USE_DB: bool = True

    # Scheduler observability / health alerts
    SCHEDULER_ALERT_ENABLED: bool = False
    HEALTH_ALERT_ENABLED: bool = False
    LIVE_AUTO_REFRESH_ENABLED: bool = True
    LIVE_REFRESH_STALE_AFTER_SEC: int = 3600
    LIVE_REFRESH_WAIT_TIMEOUT_SEC: int = 120
    LIVE_REFRESH_RETRY_COOLDOWN_SEC: int = 180

    # Scraper timeout/await defaults (shared)
    SCRAPER_TIMEOUT_MS: int = 30000
    SCRAPER_WAIT_UNTIL: str = "domcontentloaded"

    # Outbox mirror (log)
    OUTBOX_MIRROR_ENABLED: bool = True
    STORAGE_NOTEBOOK_ROTATION_CAP: int = 48

    # Option A
    REPORTS_ARCHIVE_ENABLED: bool = True
    REPORTS_ARCHIVE_DIR: str = "reports"

    # Runtime state files
    NOTEBOOKLM_ID_FILE: str = ".notebooklm_id"
    HEALTH_STATE_FILE: str = ".health_state.json"
    SINGLE_INSTANCE_GUARD_ENABLED: bool = True
    SINGLE_INSTANCE_LOCK_FILE: str = "state/monitor.lock"

    # HyIE-ERC2 real-time state
    HYIE_ENABLED: bool = True
    HYIE_STATE_FILE: str = "state/hyie_state.json"
    HYIE_SOURCE_TIMEOUT_SEC: int = 8
    HYIE_APPEND_REPORTS_JSONL: bool = True
    HYIE_APPEND_URGENTDASH_JSONL: bool = True
    HYIE_EGRESS_ETA_FILE: str = "state/egress_eta.json"
    HYIE_INGEST_LOCK_FILE: str = "state/hyie_ingest.lock"
    HYIE_STATE_META_FILE: str = "state/hyie_state.meta.json"

    def resolve_path(self, value: str) -> Path:
        return (Path(self.STORAGE_ROOT) / value).resolve()


settings = Settings()
