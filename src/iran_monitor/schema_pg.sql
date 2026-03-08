-- Postgres schema for Iran-UAE Monitor (Phase 4 SSOT)
-- Mirrors SQLite schema (src/iran_monitor/schema.sql) for portability.

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  run_ts TEXT NOT NULL,              -- Asia/Dubai ISO 8601 (same as SQLite)
  threat_level TEXT NOT NULL,        -- LOW/MEDIUM/HIGH/CRITICAL
  score INTEGER NOT NULL,
  sentiment TEXT,
  summary_ad TEXT,
  summary_dxb TEXT,
  delta_json TEXT,                   -- JSON string
  flags_json TEXT,                   -- JSON string
  evidence_json TEXT,                -- JSON string
  notebook_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_ts ON runs(run_ts);
CREATE INDEX IF NOT EXISTS idx_runs_threat ON runs(threat_level);

CREATE TABLE IF NOT EXISTS articles (
  article_id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  source TEXT,
  title TEXT,
  city TEXT,                         -- AD/DXB/OTHER
  tier TEXT,                         -- T0/T1/T2/T3
  first_seen_ts TEXT,
  last_seen_ts TEXT
);

CREATE INDEX IF NOT EXISTS idx_articles_last_seen ON articles(last_seen_ts);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);

CREATE TABLE IF NOT EXISTS run_articles (
  run_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  PRIMARY KEY (run_id, article_id),
  FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (article_id) REFERENCES articles(article_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS outbox (
  msg_id TEXT PRIMARY KEY,
  run_id TEXT,
  channel TEXT NOT NULL,             -- telegram/whatsapp
  payload TEXT NOT NULL,
  status TEXT NOT NULL,              -- PENDING/SENT/FAILED
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_ts TEXT NOT NULL,
  file_path TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);
CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox(created_ts);
