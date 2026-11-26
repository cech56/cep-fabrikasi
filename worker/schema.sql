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

CREATE TABLE IF NOT EXISTS likes (
  app_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (app_id, device_id)
);
CREATE INDEX IF NOT EXISTS likes_recent ON likes (created_at);

-- Birlikte kullan: ortak uygulama odaları ve canlı veriler
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL,
  owner TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  html_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS room_data (
  room_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  device_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, key)
);
CREATE INDEX IF NOT EXISTS room_data_changes ON room_data (room_id, updated_at);

-- Uygulama çökme raporları (30 gün saklanır)
CREATE TABLE IF NOT EXISTS crashes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  stack TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
