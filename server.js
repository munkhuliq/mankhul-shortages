const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware للتعرف على المستخدم من الترويسة (Header)
async function authMiddleware(req, res, next) {
  try {
    const userId = req.headers['x-user-id'] || (req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : null);
    if (userId) {
      req.user = await db.getUserById(userId);
    }
  } catch (e) {
    req.user = null;
  }
  next();
}

app.use(authMiddleware);

// ==========================================
// مسارات المصادقة وتأكيد الحساب (Auth APIs)
// ==========================================

// 1. تسجيل الدخول
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }

    const user = await db.authenticateUser(username, password);
    if (!user) {
      return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    res.json({
      success: true,
      user,
      token: user.id
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. التحقق من الحساب النشط
app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'غير مسجل الدخول' });
  }
  res.json({ success: true, user: req.user });
});

// ==========================================
// مسارات إدارة الموظفين - خاصة بالمدير (Admin APIs)
// ==========================================

app.get('/api/admin/users', async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بالوصول، صلاحية مدير فقط' });
    }
    const users = await db.getAllUsers();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بالوصول، صلاحية مدير فقط' });
    }
    const { name, username, password, role } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
    }
    const newUser = await db.createUser({ name, username, password, role });
    res.json({ success: true, user: newUser });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/users/:id', async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بالوصول، صلاحية مدير فقط' });
    }
    const { id } = req.params;
    const { name, username, password, role } = req.body;
    const updated = await db.updateUser(id, { name, username, password, role });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بالوصول، صلاحية مدير فقط' });
    }
    const { id } = req.params;
    const deleted = await db.deleteUser(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود أو لا يمكن حذفه' });
    }
    res.json({ success: true, user: deleted });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// مسارات إدارة المواد والنقوصات (Items APIs)
// ==========================================

// جلب كل المواد
app.get('/api/items', async (req, res) => {
  try {
    const items = await db.getAllItems();
    res.json({ success: true, items, notifications: [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// جلب الإحصائيات
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// إضافة نقص جديد
app.post('/api/items', async (req, res) => {
  try {
    const { name, quantity, unit, notes, priority } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'اسم المادة مطلوب' });
    }

    const item = await db.addItem({ name, quantity, unit, notes, priority, user: req.user });
    const actorName = req.user ? req.user.name : 'مسؤول المخزن';

    let notifTitle = 'نقص جديد في المخزن! 📦';
    let notifBody = `تم تسجيل نقص: ${item.name} (${item.quantity} ${item.unit}) بواسطة: ${actorName}`;
    if (item.priority === 'emergency') {
      notifTitle = '🚨 نقص طارئ جداً في المخزن! 🔥';
      notifBody = `⚠️ مادة طارئة متوقف عليها العمل: ${item.name} (${item.quantity} ${item.unit}) بواسطة: ${actorName}`;
    } else if (item.priority === 'urgent') {
      notifTitle = '⚡ نقص مهم في المخزن!';
      notifBody = `مادة مهمة ومستعجلة: ${item.name} (${item.quantity} ${item.unit}) بواسطة: ${actorName}`;
    }

    io.emit('item:added', {
      item,
      notification: {
        title: notifTitle,
        body: notifBody,
        targetRole: 'purchasing'
      }
    });

    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// تحديث حالة الشراء
app.post('/api/items/:id/purchase', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, quantityPurchased, missingReason, price, supplier } = req.body;

    const item = await db.updatePurchaseStatus(id, { status, quantityPurchased, missingReason, price, supplier, user: req.user });
    if (!item) {
      return res.status(404).json({ success: false, error: 'المادة غير موجودة' });
    }

    const isRevert = status === 'pending';
    let statusText = 'تم الشراء';
    if (isRevert) statusText = 'تمت الإعادة لقائمة المطلوب شراؤها';
    else if (status === 'partial') statusText = 'تم شراء جزء';
    else if (status === 'unavailable') statusText = 'غير متوفرة حالياً';

    const actorName = req.user ? req.user.name : 'مسؤول المشتريات';

    io.emit('item:purchased', {
      item,
      notification: {
        title: isRevert ? 'تعديل حالة المادة 🔄' : 'تحديث المشتريات 🛒',
        body: `${item.name}: ${statusText} (بواسطة ${actorName})`,
        targetRole: 'warehouse'
      }
    });

    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// إشعار بإتمام جولة الشراء
app.post('/api/purchases/notify-warehouse', (req, res) => {
  try {
    const { message } = req.body;
    const actorName = req.user ? req.user.name : 'المشتريات';
    io.emit('notification:delivery', {
      title: 'وصول مشتريات جديدة! 🚚',
      body: message || `تم إتمام شراء المواد وتجهيزها بواسطة (${actorName})، يرجى فحصها وجردها بالمخزن.`,
      targetRole: 'warehouse'
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// تأكيد الجرد والاستلام
app.post('/api/items/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, inventoryNotes, receivedQuantity } = req.body;

    const item = await db.confirmInventory(id, { status, inventoryNotes, receivedQuantity, user: req.user });
    if (!item) {
      return res.status(404).json({ success: false, error: 'المادة غير موجودة' });
    }

    const actorName = req.user ? req.user.name : 'المخزن';

    io.emit('item:confirmed', {
      item,
      notification: {
        title: 'اكتمل الجرد في المخزن ✅',
        body: `تم استلام وجرد: ${item.name} (بواسطة ${actorName})`,
        targetRole: 'all'
      }
    });

    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// إعادة طلب مادة
app.post('/api/items/:id/reorder', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db.reorderItem(id, req.user);
    if (!item) {
      return res.status(404).json({ success: false, error: 'المادة غير موجودة' });
    }

    io.emit('item:added', {
      item,
      notification: {
        title: 'إعادة طلب مادة 🔄',
        body: `تمت إعادة طلب: ${item.name}`,
        targetRole: 'purchasing'
      }
    });

    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// تعديل مادة
app.put('/api/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db.updateItem(id, req.body);
    if (!item) {
      return res.status(404).json({ success: false, error: 'المادة غير موجودة' });
    }
    io.emit('item:updated', { item });
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// حذف مادة
app.delete('/api/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db.deleteItem(id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'المادة غير موجودة' });
    }

    io.emit('item:deleted', { id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// تصدير البيانات للمدير
app.get('/api/admin/export', async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'غير مصرح' });
    }
    const items = await db.getAllItems();
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// WebSocket Connection
io.on('connection', (socket) => {
  console.log('مستخدم متصل:', socket.id);
  socket.on('disconnect', () => {
    console.log('مستخدم غادر:', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 خادم النقوصات والمشتريات يعمل بنجاح على المنفذ: ${PORT}`);
});
