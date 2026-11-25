-- Cep Fabrikası veritabanı (Cloudflare D1). Her yayında çalıştırılır; tekrar çalıştırmak güvenlidir.
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL,
  device_id TEXT NOT NULL,
  parent_id TEXT,
  created_at INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  remixes INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS apps_new ON apps (hidden, created_at DESC);
CREATE INDEX IF NOT EXISTS apps_popular ON apps (hidden, remixes DESC, views DESC);

CREATE TABLE IF NOT EXISTS usage (
  device_id TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, day)
);

CREATE TABLE IF NOT EXISTS reports (
  app_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (app_id, device_id)
);
