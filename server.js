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
function authMiddleware(req, res, next) {
  const userId = req.headers['x-user-id'] || (req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : null);
  if (userId) {
    req.user = db.getUserById(userId);
  }
  next();
}

app.use(authMiddleware);

// ==========================================
// مسارات المصادقة وتأكيد الحساب (Auth APIs)
// ==========================================

// 1. تسجيل الدخول
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }

    const user = db.authenticateUser(username, password);
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

app.get('/api/admin/users', (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بالوصول، صلاحية مدير فقط' });
    }
    const users = db.getAllUsers();
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/users', (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بالوصول، صلاحية مدير فقط' });
    }
    const { name, username, password, role } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
    }
    const newUser = db.createUser({ name, username, password, role });
    res.json({ success: true, user: newUser });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/users/:id', (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بالوصول، صلاحية مدير فقط' });
    }
    const { id } = req.params;
    const { name, username, password, role } = req.body;
    const updated = db.updateUser(id, { name, username, password, role });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/users/:id', (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بالوصول، صلاحية مدير فقط' });
    }
    const { id } = req.params;
    const deleted = db.deleteUser(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
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
app.get('/api/items', (req, res) => {
  try {
    const items = db.getAllItems();
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// جلب الإحصائيات
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// إضافة نقص جديد (المخزن أو المدير)
app.post('/api/items', (req, res) => {
  try {
    const { name, quantity, unit, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'اسم المادة مطلوب' });
    }

    const item = db.addItem({ name, quantity, unit, notes, user: req.user });
    const actorName = req.user ? req.user.name : 'مسؤول المخزن';

    // بث للمشتريات والمخزن بتحديث القائمة وإشعار فوري
    io.emit('item:added', {
      item,
      notification: {
        title: 'نقص جديد في المخزن! 📦',
        body: `تم تسجيل نقص: ${item.name} (${item.quantity} ${item.unit}) بواسطة: ${actorName}`,
        targetRole: 'purchasing'
      }
    });

    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// تحديث حالة الشراء (المشتريات أو المدير)
app.post('/api/items/:id/purchase', (req, res) => {
  try {
    const { id } = req.params;
    const { status, quantityPurchased, missingReason } = req.body;

    const item = db.updatePurchaseStatus(id, { status, quantityPurchased, missingReason, user: req.user });
    if (!item) {
      return res.status(404).json({ success: false, error: 'المادة غير موجودة' });
    }

    let statusText = 'تم الشراء';
    if (status === 'partial') statusText = 'تم شراء جزء';
    if (status === 'unavailable') statusText = 'غير متوفرة حالياً';

    const actorName = req.user ? req.user.name : 'مسؤول المشتريات';

    // بث تحديث للمخزن
    io.emit('item:purchased', {
      item,
      notification: {
        title: 'تحديث المشتريات 🛒',
        body: `${item.name}: ${statusText} (بواسطة ${actorName})`,
        targetRole: 'warehouse'
      }
    });

    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// إشعار بإتمام جولة الشراء وإرسال البضاعة للمخزن
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

// تأكيد الجرد والاستلام من قبل المخزن أو المدير
app.post('/api/items/:id/confirm', (req, res) => {
  try {
    const { id } = req.params;
    const { status, inventoryNotes, receivedQuantity } = req.body;

    const item = db.confirmInventory(id, { status, inventoryNotes, receivedQuantity, user: req.user });
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
app.post('/api/items/:id/reorder', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.reorderItem(id, req.user);
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

// حذف مادة (صلاحية المدير أو موظف المخزن)
app.delete('/api/items/:id', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.deleteItem(id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'المادة غير موجودة' });
    }

    io.emit('item:deleted', { id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// إحصائيات للمدير وتصدير البيانات
app.get('/api/admin/export', (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'غير مصرح' });
    }
    const items = db.getAllItems();
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

// Kill previous server if port is busy or let it re-bind
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 خادم النقوصات والمشتريات والحسابات يعمل على المنفذ: ${PORT}`);
});
