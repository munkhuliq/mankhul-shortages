const core = require('./core.cjs');
const itemColumns = { id: 'id', name: 'name', quantity: 'quantity', unit: 'unit', notes: 'notes', status: 'status', priority: 'priority', price: 'price', supplier: 'supplier', paymentMethod: 'payment_method', quantityPurchased: 'quantity_purchased', receivedQuantity: 'received_quantity', missingReason: 'missing_reason', inventoryNotes: 'inventory_notes', createdBy: 'created_by', purchasedBy: 'purchased_by', confirmedBy: 'confirmed_by', createdAt: 'created_at', purchasedAt: 'purchased_at', completedAt: 'completed_at', reorderedFrom: 'reordered_from', history: 'history', version: 'version' };
const jsonFields = ['createdBy', 'purchasedBy', 'confirmedBy', 'history'];
function json(value, fallback) {
  if (typeof value !== 'string') return value || fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
function mapItem(row) {
  if (!row) return null;
  const item = {};
  for (const [key, column] of Object.entries(itemColumns)) item[key] = row[column];
  for (const key of ['quantity', 'quantityPurchased', 'receivedQuantity', 'price', 'version']) item[key] = Number(item[key]) || 0;
  for (const key of jsonFields) {
    const value = item[key];
    item[key] = json(value, key === 'history' ? [] : null);
    if (key !== 'history' && typeof value === 'string' && value.trim() && value !== 'null' && !item[key]) item[key] = { id: '', name: value };
  }
  for (const key of ['createdAt', 'purchasedAt', 'completedAt']) if (item[key] instanceof Date) item[key] = item[key].toISOString();
  item.priority ||= 'normal'; item.paymentMethod ||= 'cash'; item.supplier ||= '';
  return item;
}
function mapUser(row) { if (!row) return null; const { created_at, ...rest } = row; return { ...rest, createdAt: created_at instanceof Date ? created_at.toISOString() : created_at }; }
function valuesForItem(item, keys) { return keys.map(key => jsonFields.includes(key) ? JSON.stringify(item[key]) : item[key]); }

function createSQLStore(driver) {
  const { all, first, run, batch, postgres } = driver;
  const store = {
    async initialize(initialPassword) {
      await run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT)`);
      await run(`CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, name TEXT NOT NULL, quantity ${postgres ? 'NUMERIC' : 'REAL'} NOT NULL DEFAULT 1, unit TEXT DEFAULT 'قطعة', notes TEXT, status TEXT DEFAULT 'pending', quantity_purchased ${postgres ? 'NUMERIC' : 'REAL'} DEFAULT 0, missing_reason TEXT, inventory_notes TEXT, received_quantity ${postgres ? 'NUMERIC' : 'REAL'} DEFAULT 0, priority TEXT DEFAULT 'normal', price ${postgres ? 'NUMERIC' : 'REAL'} DEFAULT 0, supplier TEXT, payment_method TEXT DEFAULT 'cash', created_by ${postgres ? 'JSONB' : 'TEXT'}, purchased_by ${postgres ? 'JSONB' : 'TEXT'}, confirmed_by ${postgres ? 'JSONB' : 'TEXT'}, created_at TEXT, purchased_at TEXT, completed_at TEXT)`);
      await run('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      await run('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at BIGINT NOT NULL)');
      await run('CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)');
      await run('CREATE TABLE IF NOT EXISTS auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at BIGINT NOT NULL)');
      await run('CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, target_role TEXT, created_at TEXT)');
      const additions = { received_quantity: 'REAL DEFAULT 0', priority: "TEXT DEFAULT 'normal'", price: 'REAL DEFAULT 0', supplier: 'TEXT', payment_method: "TEXT DEFAULT 'cash'", quantity_purchased: 'REAL DEFAULT 0', missing_reason: 'TEXT', inventory_notes: 'TEXT', created_by: postgres ? 'JSONB' : 'TEXT', purchased_by: postgres ? 'JSONB' : 'TEXT', confirmed_by: postgres ? 'JSONB' : 'TEXT', purchased_at: 'TEXT', completed_at: 'TEXT', reordered_from: 'TEXT', history: postgres ? "JSONB DEFAULT '[]'" : "TEXT DEFAULT '[]'", version: 'INTEGER NOT NULL DEFAULT 0' };
      if (postgres) {
        for (const [name, type] of Object.entries(additions)) await run(`ALTER TABLE items ADD COLUMN IF NOT EXISTS ${name} ${type}`);
      } else {
        const names = new Set((await all('PRAGMA table_info(items)')).map(r => r.name));
        for (const [name, type] of Object.entries(additions)) if (!names.has(name)) {
          try { await run(`ALTER TABLE items ADD COLUMN ${name} ${type}`); }
          catch (error) { if (!(await all('PRAGMA table_info(items)')).some(r => r.name === name)) throw error; }
        }
      }
      await run('CREATE INDEX IF NOT EXISTS items_created_idx ON items(created_at)');
      await run("CREATE UNIQUE INDEX IF NOT EXISTS items_active_reorder_idx ON items(reordered_from) WHERE reordered_from IS NOT NULL AND status IN ('pending', 'purchased', 'partial')");
      await run('CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications(created_at)');
      if (!await first("SELECT value FROM app_meta WHERE key = 'bootstrap'")) {
        const users = await store.listUsers();
        if (!users.length) {
          if (!initialPassword) throw new core.AppError('اضبط INITIAL_ADMIN_PASSWORD لإعداد المدير أول مرة', 503);
          await run('INSERT INTO users (id, name, username, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING', ['usr_admin', 'المدير العام', 'admin', await core.hashPassword(core.newPassword(initialPassword)), 'admin', new Date().toISOString()]);
        }
        await run("INSERT INTO app_meta (key, value) VALUES ('bootstrap', 'done') ON CONFLICT DO NOTHING");
      }
      // Migrate existing passwords without changing employees' current credentials.
      for (const user of await store.listUsers()) if (!user.password.startsWith('pbkdf2$')) {
        await run('UPDATE users SET password = ? WHERE id = ? AND password = ?', [await core.hashPassword(user.password), user.id, user.password]);
      }
    },
    async listUsers() { return (await all('SELECT * FROM users ORDER BY created_at ASC')).map(mapUser); },
    async getUser(id) { return mapUser(await first('SELECT * FROM users WHERE id = ?', [id])); },
    async insertUser(user) {
      if (await first('SELECT id FROM users WHERE LOWER(username) = ?', [user.username])) throw new core.AppError('اسم المستخدم مسجل مسبقًا');
      try { await run('INSERT INTO users (id, name, username, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', [user.id, user.name, user.username, user.password, user.role, user.createdAt]); }
      catch (error) { if (await first('SELECT id FROM users WHERE LOWER(username) = ?', [user.username])) throw new core.AppError('اسم المستخدم مسجل مسبقًا'); throw error; }
    },
    async updateUser(id, changes) {
      const keys = Object.keys(changes);
      if (!keys.length) return;
      if (changes.username && await first('SELECT id FROM users WHERE LOWER(username) = ? AND id != ?', [changes.username, id])) throw new core.AppError('اسم المستخدم مسجل مسبقًا');
      await batch([{ sql: `UPDATE users SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, values: [...keys.map(k => changes[k]), id] }, { sql: 'DELETE FROM sessions WHERE user_id = ?', values: [id] }]);
    },
    async deleteUser(id) { await batch([{ sql: 'DELETE FROM sessions WHERE user_id = ?', values: [id] }, { sql: 'DELETE FROM users WHERE id = ?', values: [id] }]); },
    async listItems() { return (await all('SELECT * FROM items ORDER BY created_at DESC')).map(mapItem); },
    async getItem(id) { return mapItem(await first('SELECT * FROM items WHERE id = ?', [id])); },
    async saveNotification(n) { await batch([{ sql: 'DELETE FROM notifications WHERE created_at < ?', values: [new Date(Date.now() - 7 * 86400000).toISOString()] }, { sql: 'INSERT INTO notifications (id, title, body, target_role, created_at) VALUES (?, ?, ?, ?, ?)', values: [n.id, n.title, n.body, n.targetRole, n.createdAt] }]); },
    async listNotifications() { return (await all('SELECT * FROM notifications WHERE created_at >= ? ORDER BY created_at DESC LIMIT 100', [new Date(Date.now() - 7 * 86400000).toISOString()])).map(row => ({ id: row.id, title: row.title, body: row.body, targetRole: row.target_role, createdAt: row.created_at })); },
    async insertItem(item) {
      const keys = Object.keys(itemColumns);
      try { await run(`INSERT INTO items (${keys.map(k => itemColumns[k]).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, valuesForItem(item, keys)); }
      catch (error) { if (item.reorderedFrom && await first("SELECT id FROM items WHERE reordered_from = ? AND status IN ('pending', 'purchased', 'partial')", [item.reorderedFrom])) throw new core.AppError('يوجد طلب مفتوح لهذه المادة بالفعل', 409); throw error; }
    },
    async updateItem(old, changes) {
      const keys = Object.keys(changes);
      const result = await run(`UPDATE items SET ${keys.map(k => `${itemColumns[k]} = ?`).join(', ')}, version = version + 1 WHERE id = ? AND version = ?`, [...valuesForItem(changes, keys), old.id, old.version || 0]);
      if (!result.changes) throw new core.AppError('تغيرت المادة من جهاز آخر، حدّث القائمة وأعد المحاولة', 409);
      return { ...old, ...changes, version: (old.version || 0) + 1 };
    },
    async deleteItem(old) {
      const result = await run('DELETE FROM items WHERE id = ? AND version = ?', [old.id, old.version || 0]);
      if (!result.changes) throw new core.AppError('تغيرت المادة من جهاز آخر، أعد المحاولة', 409);
    },
    async saveSession(s) { await batch([{ sql: 'DELETE FROM sessions WHERE expires_at <= ?', values: [Date.now()] }, { sql: 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', values: [s.hash, s.userId, s.expiresAt] }]); },
    async getSession(hash) { const row = await first('SELECT * FROM sessions WHERE token_hash = ?', [hash]); return row ? { userId: row.user_id, expiresAt: Number(row.expires_at) } : null; },
    async deleteSession(hash) { await run('DELETE FROM sessions WHERE token_hash = ?', [hash]); },
    async getAttempt(key) { const row = await first('SELECT * FROM auth_attempts WHERE key = ?', [key]); return row ? { count: row.count, expiresAt: Number(row.expires_at) } : null; },
    async failAttempt(key) { const now = Date.now(); await run('INSERT INTO auth_attempts (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT (key) DO UPDATE SET count = CASE WHEN auth_attempts.expires_at <= ? THEN 1 ELSE auth_attempts.count + 1 END, expires_at = CASE WHEN auth_attempts.expires_at <= ? THEN ? ELSE auth_attempts.expires_at END', [key, now + 900000, now, now, now + 900000]); },
    async clearAttempt(key) { await run('DELETE FROM auth_attempts WHERE key = ?', [key]); }
  };
  return store;
}
function d1Driver(db) {
  const statement = (sql, values = []) => values.length ? db.prepare(sql).bind(...values) : db.prepare(sql);
  return { postgres: false, all: async (s, v) => (await statement(s, v).all()).results || [], first: (s, v) => statement(s, v).first(), run: async (s, v) => { const result = await statement(s, v).run(); return { changes: result.meta?.changes || 0 }; }, batch: ops => db.batch(ops.map(op => statement(op.sql, op.values))) };
}
function pgDriver(pool) {
  const sql = text => { let index = 0; return text.replace(/\?/g, () => `$${++index}`); };
  return { postgres: true, all: async (s, v = []) => (await pool.query(sql(s), v)).rows, first: async (s, v = []) => (await pool.query(sql(s), v)).rows[0] || null, run: async (s, v = []) => ({ changes: (await pool.query(sql(s), v)).rowCount || 0 }), batch: async ops => { const client = await pool.connect(); try { await client.query('BEGIN'); for (const op of ops) await client.query(sql(op.sql), op.values || []); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } } };
}
module.exports = { createSQLStore, d1Driver, pgDriver, mapItem };
