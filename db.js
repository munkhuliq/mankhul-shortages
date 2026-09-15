const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_USERS = [
  {
    id: 'usr_admin',
    name: 'المدير العام',
    username: 'admin',
    password: '123456',
    role: 'admin', // admin | warehouse | purchasing
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

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = { items: [], users: DEFAULT_USERS, history: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw);
    
    // Ensure users array exists
    if (!data.users || data.users.length === 0) {
      data.users = DEFAULT_USERS;
      writeData(data);
    }
    if (!data.items) {
      data.items = [];
    }
    return data;
  } catch (err) {
    console.error('Error reading data file:', err);
    return { items: [], users: DEFAULT_USERS, history: [] };
  }
}

function writeData(data) {
  try {
    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DATA_FILE);
    return true;
  } catch (err) {
    console.error('Error saving data:', err);
    return false;
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

const db = {
  // ===================== إدارة المستخدمين والمصادقة =====================
  
  authenticateUser(username, password) {
    const data = readData();
    const uname = (username || '').trim().toLowerCase();
    const pass = (password || '').trim();
    const user = data.users.find(u => u.username.toLowerCase() === uname && u.password === pass);
    if (!user) return null;
    
    // لا نرجع كلمة المرور في بيانات الجلسة
    const { password: _, ...safeUser } = user;
    return safeUser;
  },

  getAllUsers() {
    const data = readData();
    return data.users.map(({ password: _, ...user }) => user);
  },

  getUserById(id) {
    const data = readData();
    const user = data.users.find(u => u.id === id);
    if (!user) return null;
    const { password: _, ...safeUser } = user;
    return safeUser;
  },

  createUser({ name, username, password, role }) {
    const data = readData();
    const uname = (username || '').trim().toLowerCase();
    
    if (data.users.some(u => u.username.toLowerCase() === uname)) {
      throw new Error('اسم المستخدم مسجل مسبقاً، يرجى اختيار اسم آخر');
    }

    const newUser = {
      id: 'usr_' + generateId(),
      name: (name || '').trim(),
      username: uname,
      password: (password || '1234').trim(),
      role: role || 'warehouse', // admin | warehouse | purchasing
      createdAt: new Date().toISOString()
    };

    data.users.push(newUser);
    writeData(data);

    const { password: _, ...safeUser } = newUser;
    return safeUser;
  },

  updateUser(id, { name, username, password, role }) {
    const data = readData();
    const user = data.users.find(u => u.id === id);
    if (!user) return null;

    if (username) {
      const uname = username.trim().toLowerCase();
      const existing = data.users.find(u => u.username.toLowerCase() === uname && u.id !== id);
      if (existing) {
        throw new Error('اسم المستخدم مستخدم من قبل موظف آخر');
      }
      user.username = uname;
    }

    if (name) user.name = name.trim();
    if (password && password.trim()) user.password = password.trim();
    if (role) user.role = role;

    writeData(data);
    const { password: _, ...safeUser } = user;
    return safeUser;
  },

  deleteUser(id) {
    const data = readData();
    const user = data.users.find(u => u.id === id);
    if (!user) return null;

    // حماية المدير الأساسي من الحذف
    if (user.username === 'admin') {
      throw new Error('لا يمكن حذف حساب المدير العام الرئيسي');
    }

    const idx = data.users.findIndex(u => u.id === id);
    const [deleted] = data.users.splice(idx, 1);
    writeData(data);

    const { password: _, ...safeUser } = deleted;
    return safeUser;
  },

  // ===================== إدارة المواد والنقوصات =====================

  getAllItems() {
    const data = readData();
    return data.items || [];
  },

  addItem({ name, quantity, unit, notes, user }) {
    const data = readData();
    const newItem = {
      id: generateId(),
      name: (name || '').trim(),
      quantity: Number(quantity) || 1,
      unit: (unit || 'قطعة').trim(),
      notes: (notes || '').trim(),
      status: 'pending', // pending | purchased | partial | unavailable | completed
      quantityPurchased: 0,
      missingReason: '',
      inventoryNotes: '',
      createdBy: user ? { id: user.id, name: user.name } : null,
      purchasedBy: null,
      confirmedBy: null,
      createdAt: new Date().toISOString(),
      purchasedAt: null,
      completedAt: null
    };

    data.items.unshift(newItem);
    writeData(data);
    return newItem;
  },

  updatePurchaseStatus(id, { status, quantityPurchased, missingReason, user }) {
    const data = readData();
    const item = data.items.find(i => i.id === id);
    if (!item) return null;

    item.status = status; // purchased | partial | unavailable
    if (quantityPurchased !== undefined) {
      item.quantityPurchased = Number(quantityPurchased);
    } else if (status === 'purchased') {
      item.quantityPurchased = item.quantity;
    }
    if (missingReason !== undefined) {
      item.missingReason = missingReason.trim();
    }
    item.purchasedBy = user ? { id: user.id, name: user.name } : null;
    item.purchasedAt = new Date().toISOString();

    writeData(data);
    return item;
  },

  confirmInventory(id, { status, inventoryNotes, receivedQuantity, user }) {
    const data = readData();
    const item = data.items.find(i => i.id === id);
    if (!item) return null;

    item.status = status || 'completed';
    if (inventoryNotes !== undefined) {
      item.inventoryNotes = inventoryNotes.trim();
    }
    if (receivedQuantity !== undefined) {
      item.receivedQuantity = Number(receivedQuantity);
    }
    item.confirmedBy = user ? { id: user.id, name: user.name } : null;
    item.completedAt = new Date().toISOString();

    writeData(data);
    return item;
  },

  deleteItem(id) {
    const data = readData();
    const idx = data.items.findIndex(i => i.id === id);
    if (idx !== -1) {
      const removed = data.items.splice(idx, 1)[0];
      writeData(data);
      return removed;
    }
    return null;
  },

  reorderItem(id, user) {
    const data = readData();
    const item = data.items.find(i => i.id === id);
    if (!item) return null;

    item.status = 'pending';
    item.quantityPurchased = 0;
    item.missingReason = '';
    item.inventoryNotes = '';
    item.purchasedAt = null;
    item.completedAt = null;
    item.createdAt = new Date().toISOString();
    if (user) {
      item.createdBy = { id: user.id, name: user.name };
    }

    writeData(data);
    return item;
  },

  getStats() {
    const items = this.getAllItems();
    return {
      total: items.length,
      pendingCount: items.filter(i => i.status === 'pending').length,
      purchasedCount: items.filter(i => i.status === 'purchased' || i.status === 'partial').length,
      unavailableCount: items.filter(i => i.status === 'unavailable').length,
      completedCount: items.filter(i => i.status === 'completed').length,
      usersCount: readData().users.length
    };
  }
};

module.exports = db;
