CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'قطعة',
  notes TEXT,
  status TEXT DEFAULT 'pending',
  quantity_purchased REAL DEFAULT 0,
  missing_reason TEXT,
  inventory_notes TEXT,
  received_quantity REAL DEFAULT 0,
  priority TEXT DEFAULT 'normal',
  price REAL DEFAULT 0,
  supplier TEXT,
  payment_method TEXT DEFAULT 'cash',
  created_by TEXT,
  purchased_by TEXT,
  confirmed_by TEXT,
  created_at TEXT,
  purchased_at TEXT,
  completed_at TEXT,
  reordered_from TEXT,
  history TEXT DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_role TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS items_created_idx ON items(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS items_active_reorder_idx ON items(reordered_from) WHERE reordered_from IS NOT NULL AND status IN ('pending', 'purchased', 'partial');
CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications(created_at);
