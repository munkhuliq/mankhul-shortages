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
  created_by TEXT,
  purchased_by TEXT,
  confirmed_by TEXT,
  created_at TEXT,
  purchased_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_role TEXT,
  created_at TEXT
);

INSERT OR IGNORE INTO users (id, name, username, password, role, created_at) VALUES 
('usr_admin', 'المدير العام', 'admin', '123456', 'admin', datetime('now')),
('usr_store', 'مسؤول المخزن', 'store', '1234', 'warehouse', datetime('now')),
('usr_buyer', 'مسؤول المشتريات', 'buyer', '1234', 'purchasing', datetime('now'));
