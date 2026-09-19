const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Ensure data folder exists for local fallback
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_USERS = [
  {
    id: 'usr_admin',
    name: 'المدير العام',
    username: 'admin',
    password: '123456',
    role: 'admin',
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr_store',
    name: 'مسؤول المخزن',
    username: 'store',
    password: '1234',
    role: 'warehouse',
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr_buyer',
    name: 'مسؤول المشتريات',
    username: 'buyer',
    password: '1234',
    role: 'purchasing',
    createdAt: new Date().toISOString()
  }
];

// Database Pool (لو تم توفير رابط سحابي أونلاين DATABASE_URL)
let pool = null;
const isCloudDB = !!process.env.DATABASE_URL;

if (isCloudDB) {
  console.log('🌐 تم اكتشاف رابط قاعدة بيانات سحابية أونلاين (PostgreSQL)...');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  // إنشاء الجداول السحابية تلقائياً
  initCloudDB().catch(err => console.error('Cloud DB Init Error:', err));
}

async function initCloudDB() {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS items (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        quantity NUMERIC NOT NULL DEFAULT 1,
        unit VARCHAR(50) DEFAULT 'قطعة',
        notes TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        quantity_purchased NUMERIC DEFAULT 0,
        missing_reason TEXT,
        inventory_notes TEXT,
        received_quantity NUMERIC DEFAULT 0,
        priority VARCHAR(50) DEFAULT 'normal',
        price NUMERIC DEFAULT 0,
        supplier VARCHAR(255),
        created_by JSONB,
        purchased_by JSONB,
        confirmed_by JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        purchased_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE
      );

      ALTER TABLE items ADD COLUMN IF NOT EXISTS received_quantity NUMERIC DEFAULT 0;
      ALTER TABLE items ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'normal';
      ALTER TABLE items ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;
      ALTER TABLE items ADD COLUMN IF NOT EXISTS supplier VARCHAR(255);
    `);

    // تهيئة المستخدمين الافتراضيين إذا كانت قاعدة البيانات جديدة
    const { rows } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) === 0) {
      for (const u of DEFAULT_USERS) {
        await client.query(
          'INSERT INTO users (id, name, username, password, role) VALUES ($1, $2, $3, $4, $5)',
          [u.id, u.name, u.username, u.password, u.role]
        );
      }
      console.log('✅ تم تهيئة حسابات الموظفين الافتراضية في قاعدة البيانات السحابية.');
    }
  } finally {
    client.release();
  }
}

// دالة قراءة الملف المحلي مع استرداد آمن
function readLocalData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = { items: [], users: DEFAULT_USERS, history: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.users || data.users.length === 0) {
      data.users = DEFAULT_USERS;
      writeLocalData(data);
    }
    if (!data.items) data.items = [];
    return data;
  } catch (err) {
    console.error('Error reading local data file, checking backup:', err);
    const backupFile = `${DATA_FILE}.bak`;
    if (fs.existsSync(backupFile)) {
      try {
        const rawBak = fs.readFileSync(backupFile, 'utf-8');
        return JSON.parse(rawBak);
      } catch (bakErr) {}
    }
    return { items: [], users: DEFAULT_USERS, history: [] };
  }
}

function writeLocalData(data) {
  try {
    if (fs.existsSync(DATA_FILE)) {
      try { fs.copyFileSync(DATA_FILE, `${DATA_FILE}.bak`); } catch (bErr) {}
    }
    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DATA_FILE);
    return true;
  } catch (err) {
    console.error('Error writing local data:', err);
    return false;
  }
}

function generateId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
  return 'mn_' + timestamp + randomPart;
}

// كائن db الشامل (يعمل محلياً وسحابياً)
const db = {
  // مصادقة المستخدم
  async authenticateUser(username, password) {
    const uname = (username || '').trim().toLowerCase();
    const pass = (password || '').trim();

    if (isCloudDB && pool) {
      const { rows } = await pool.query(
        'SELECT id, name, username, role FROM users WHERE LOWER(username) = $1 AND password = $2',
        [uname, pass]
      );
      return rows[0] || null;
    }

    const data = readLocalData();
    const user = data.users.find(u => u.username.toLowerCase() === uname && u.password === pass);
    if (!user) return null;
    const { password: _, ...safeUser } = user;
    return safeUser;
  },

  async getAllUsers() {
    if (isCloudDB && pool) {
      const { rows } = await pool.query('SELECT id, name, username, role, created_at FROM users ORDER BY created_at ASC');
      return rows;
    }
    const data = readLocalData();
    return data.users.map(({ password: _, ...user }) => user);
  },

  async getUserById(id) {
    if (isCloudDB && pool) {
      const { rows } = await pool.query('SELECT id, name, username, role FROM users WHERE id = $1', [id]);
      return rows[0] || null;
    }
    const data = readLocalData();
    const user = data.users.find(u => u.id === id);
    if (!user) return null;
    const { password: _, ...safeUser } = user;
    return safeUser;
  },

  async createUser({ name, username, password, role }) {
    const uname = (username || '').trim().toLowerCase();
    const newId = 'usr_' + generateId();

    if (isCloudDB && pool) {
      const { rows } = await pool.query(
        'INSERT INTO users (id, name, username, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, username, role, created_at',
        [newId, (name || '').trim(), uname, (password || '1234').trim(), role || 'warehouse']
      );
      return rows[0];
    }

    const data = readLocalData();
    if (data.users.some(u => u.username.toLowerCase() === uname)) {
      throw new Error('اسم المستخدم مسجل مسبقاً');
    }
    const newUser = {
      id: newId,
      name: (name || '').trim(),
      username: uname,
      password: (password || '1234').trim(),
      role: role || 'warehouse',
      createdAt: new Date().toISOString()
    };
    data.users.push(newUser);
    writeLocalData(data);
    const { password: _, ...safeUser } = newUser;
    return safeUser;
  },

  async updateUser(id, { name, username, password, role }) {
    if (isCloudDB && pool) {
      const fields = [];
      const values = [];
      let idx = 1;

      if (name) { fields.push(`name = $${idx++}`); values.push(name.trim()); }
      if (username) { fields.push(`username = $${idx++}`); values.push(username.trim().toLowerCase()); }
      if (password && password.trim()) { fields.push(`password = $${idx++}`); values.push(password.trim()); }
      if (role) { fields.push(`role = $${idx++}`); values.push(role); }

      values.push(id);
      const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, username, role`;
      const { rows } = await pool.query(query, values);
      return rows[0] || null;
    }

    const data = readLocalData();
    const user = data.users.find(u => u.id === id);
    if (!user) return null;
    if (name) user.name = name.trim();
    if (username) user.username = username.trim().toLowerCase();
    if (password && password.trim()) user.password = password.trim();
    if (role) user.role = role;
    writeLocalData(data);
    const { password: _, ...safeUser } = user;
    return safeUser;
  },

  async deleteUser(id) {
    if (isCloudDB && pool) {
      const { rows } = await pool.query('DELETE FROM users WHERE id = $1 AND username != $2 RETURNING id, name, username', [id, 'admin']);
      return rows[0] || null;
    }

    const data = readLocalData();
    const user = data.users.find(u => u.id === id);
    if (!user || user.username === 'admin') return null;
    const idx = data.users.findIndex(u => u.id === id);
    const [deleted] = data.users.splice(idx, 1);
    writeLocalData(data);
    const { password: _, ...safeUser } = deleted;
    return safeUser;
  },

  // إدارة المواد والنقوصات
  async getAllItems() {
    if (isCloudDB && pool) {
      const { rows } = await pool.query(`
        SELECT 
          id, name, quantity, unit, notes, status, 
          priority, price, supplier,
          quantity_purchased as "quantityPurchased",
          received_quantity as "receivedQuantity",
          missing_reason as "missingReason",
          inventory_notes as "inventoryNotes",
          created_by as "createdBy",
          purchased_by as "purchasedBy",
          confirmed_by as "confirmedBy",
          created_at as "createdAt",
          purchased_at as "purchasedAt",
          completed_at as "completedAt"
        FROM items ORDER BY created_at DESC
      `);
      return rows;
    }

    const data = readLocalData();
    return data.items || [];
  },

  async addItem({ name, quantity, unit, notes, priority, user }) {
    const newItem = {
      id: generateId(),
      name: (name || '').trim(),
      quantity: Number(quantity) || 1,
      unit: (unit || 'قطعة').trim(),
      notes: (notes || '').trim(),
      priority: (priority === 'emergency' || priority === 'urgent') ? priority : 'normal',
      price: 0,
      supplier: '',
      status: 'pending',
      quantityPurchased: 0,
      receivedQuantity: 0,
      missingReason: '',
      inventoryNotes: '',
      createdBy: user ? { id: user.id, name: user.name } : null,
      purchasedBy: null,
      confirmedBy: null,
      createdAt: new Date().toISOString(),
      purchasedAt: null,
      completedAt: null
    };

    if (isCloudDB && pool) {
      await pool.query(`
        INSERT INTO items (id, name, quantity, unit, notes, priority, price, supplier, status, quantity_purchased, received_quantity, missing_reason, inventory_notes, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, '', '', $10, $11)
      `, [newItem.id, newItem.name, newItem.quantity, newItem.unit, newItem.notes, newItem.priority, newItem.price, newItem.supplier, newItem.status, JSON.stringify(newItem.createdBy), newItem.createdAt]);
      return newItem;
    }

    const data = readLocalData();
    data.items.unshift(newItem);
    writeLocalData(data);
    return newItem;
  },

  async updateItem(id, { name, quantity, unit, notes, priority, price, supplier }) {
    if (isCloudDB && pool) {
      const fields = [];
      const values = [];
      let idx = 1;

      if (name !== undefined && name !== null) { fields.push(`name = $${idx++}`); values.push(String(name).trim()); }
      if (quantity !== undefined && quantity !== null && quantity !== '') { fields.push(`quantity = $${idx++}`); values.push(Number(quantity) || 1); }
      if (unit !== undefined && unit !== null) { fields.push(`unit = $${idx++}`); values.push(String(unit).trim()); }
      if (notes !== undefined && notes !== null) { fields.push(`notes = $${idx++}`); values.push(String(notes).trim()); }
      if (priority !== undefined && priority !== null) { fields.push(`priority = $${idx++}`); values.push(priority); }
      if (price !== undefined && price !== null && price !== '') { fields.push(`price = $${idx++}`); values.push(Number(price) || 0); }
      if (supplier !== undefined && supplier !== null) { fields.push(`supplier = $${idx++}`); values.push(String(supplier).trim()); }

      if (fields.length === 0) {
        const { rows } = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
        return rows[0] || null;
      }

      values.push(id);
      const query = `UPDATE items SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
      const { rows } = await pool.query(query, values);
      return rows[0] || null;
    }

    const data = readLocalData();
    const item = data.items.find(i => i.id === id);
    if (!item) return null;
    if (name !== undefined && name !== null) item.name = String(name).trim();
    if (quantity !== undefined && quantity !== null && quantity !== '') item.quantity = Number(quantity) || 1;
    if (unit !== undefined && unit !== null) item.unit = String(unit).trim();
    if (notes !== undefined && notes !== null) item.notes = String(notes).trim();
    if (priority !== undefined && priority !== null) item.priority = priority;
    if (price !== undefined && price !== null && price !== '') item.price = Number(price) || 0;
    if (supplier !== undefined && supplier !== null) item.supplier = String(supplier).trim();
    writeLocalData(data);
    return item;
  },

  async updatePurchaseStatus(id, { status, quantityPurchased, missingReason, price, supplier, user }) {
    const purchasedBy = user ? { id: user.id, name: user.name } : null;
    const purchasedAt = new Date().toISOString();
    const isRevert = status === 'pending';
    const isUnavailable = status === 'unavailable';
    const finalQty = (isRevert || isUnavailable) ? 0 : (quantityPurchased !== undefined ? Number(quantityPurchased) : 1);
    const finalPurchasedBy = isRevert ? null : purchasedBy;
    const finalPurchasedAt = isRevert ? null : purchasedAt;
    const itemPrice = (price !== undefined && price !== null && price !== '') ? Number(price) : null;
    const itemSupplier = (supplier !== undefined && supplier !== null) ? String(supplier).trim() : null;

    if (isCloudDB && pool) {
      const { rows } = await pool.query(`
        UPDATE items 
        SET status = $1, 
            quantity_purchased = $2, 
            missing_reason = $3, 
            purchased_by = $4, 
            purchased_at = $5,
            price = COALESCE($6, price),
            supplier = COALESCE($7, supplier)
        WHERE id = $8
        RETURNING *
      `, [status, finalQty, (missingReason || '').trim(), isRevert ? null : JSON.stringify(finalPurchasedBy), finalPurchasedAt, itemPrice, itemSupplier, id]);
      return rows[0] || null;
    }

    const data = readLocalData();
    const item = data.items.find(i => i.id === id);
    if (!item) return null;
    item.status = status;
    item.quantityPurchased = finalQty;
    item.missingReason = isRevert ? '' : (missingReason !== undefined ? missingReason.trim() : item.missingReason);
    if (itemPrice !== null) item.price = itemPrice;
    if (itemSupplier !== null) item.supplier = itemSupplier;
    item.purchasedBy = finalPurchasedBy;
    item.purchasedAt = finalPurchasedAt;
    writeLocalData(data);
    return item;
  },

  async confirmInventory(id, { status, inventoryNotes, receivedQuantity, user }) {
    const confirmedBy = user ? { id: user.id, name: user.name } : null;
    const completedAt = new Date().toISOString();
    const finalStatus = status || 'completed';
    const finalCompletedAt = finalStatus === 'completed' ? completedAt : null;
    const recQty = Number(receivedQuantity) || 0;

    if (isCloudDB && pool) {
      const { rows } = await pool.query(`
        UPDATE items 
        SET status = $1, inventory_notes = $2, received_quantity = $3, confirmed_by = $4, completed_at = $5
        WHERE id = $6
        RETURNING *
      `, [finalStatus, (inventoryNotes || '').trim(), recQty, JSON.stringify(confirmedBy), finalCompletedAt, id]);
      return rows[0] || null;
    }

    const data = readLocalData();
    const item = data.items.find(i => i.id === id);
    if (!item) return null;
    item.status = finalStatus;
    if (inventoryNotes !== undefined) item.inventoryNotes = inventoryNotes.trim();
    item.receivedQuantity = recQty;
    item.confirmedBy = confirmedBy;
    item.completedAt = finalCompletedAt;
    writeLocalData(data);
    return item;
  },

  async deleteItem(id) {
    if (isCloudDB && pool) {
      const { rows } = await pool.query('DELETE FROM items WHERE id = $1 RETURNING id', [id]);
      return rows[0] || null;
    }
    const data = readLocalData();
    const idx = data.items.findIndex(i => i.id === id);
    if (idx !== -1) {
      const [removed] = data.items.splice(idx, 1);
      writeLocalData(data);
      return removed;
    }
    return null;
  },

  async reorderItem(id, user) {
    const createdBy = user ? { id: user.id, name: user.name } : null;
    const createdAt = new Date().toISOString();

    if (isCloudDB && pool) {
      const { rows } = await pool.query(`
        UPDATE items 
        SET status = 'pending', quantity_purchased = 0, received_quantity = 0, price = 0, missing_reason = '', inventory_notes = '', 
            purchased_by = NULL, purchased_at = NULL, confirmed_by = NULL, completed_at = NULL, 
            created_at = $1, created_by = $2
        WHERE id = $3
        RETURNING *
      `, [createdAt, JSON.stringify(createdBy), id]);
      return rows[0] || null;
    }

    const data = readLocalData();
    const item = data.items.find(i => i.id === id);
    if (!item) return null;
    item.status = 'pending';
    item.quantityPurchased = 0;
    item.receivedQuantity = 0;
    item.price = 0;
    item.missingReason = '';
    item.inventoryNotes = '';
    item.purchasedBy = null;
    item.purchasedAt = null;
    item.confirmedBy = null;
    item.completedAt = null;
    item.createdAt = createdAt;
    if (user) item.createdBy = createdBy;
    writeLocalData(data);
    return item;
  },

  async getStats() {
    const items = await this.getAllItems();
    return {
      total: items.length,
      pendingCount: items.filter(i => i.status === 'pending').length,
      purchasedCount: items.filter(i => i.status === 'purchased' || i.status === 'partial').length,
      unavailableCount: items.filter(i => i.status === 'unavailable').length,
      completedCount: items.filter(i => i.status === 'completed').length
    };
  }
};

module.exports = db;
