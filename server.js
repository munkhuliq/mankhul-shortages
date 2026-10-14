const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const db = require('./db');
const core = require('./lib/core.cjs');

function sendError(res, error) {
  if (!error.status) console.error(error);
  return res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'تعذر تنفيذ العملية؛ حاول مرة أخرى' });
}

async function broadcast(event, payload) {
  const notification = payload.notification || (event.startsWith('notification:') ? payload : null);
  if (notification) {
    try {
      const saved = await db.notify(notification);
      if (payload.notification) payload.notification = saved;
      else payload = saved;
    } catch (error) { console.error('تعذر حفظ الإشعار:', error.message); }
  }
  await Promise.all(Array.from(io.sockets.sockets.values(), async socket => {
    try {
      if (await db.getSessionUser(socket.data.token)) socket.emit(event, payload);
      else socket.disconnect(true);
    } catch { socket.disconnect(true); }
  }));
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(cors((req, callback) => {
  const allowed = [`${req.protocol}://${req.get('host')}`, ...(process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)];
  callback(null, { origin: allowed.includes(req.headers.origin) ? req.headers.origin : false });
}));
app.use(express.json({ limit: '64kb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      req.body = req.body === undefined ? {} : req.body;
      core.body(req.body);
    }
    next();
  } catch (error) { sendError(res, error); }
});
app.use(express.static(path.join(__dirname, 'public')));

// Middleware للتعرف على المستخدم من الترويسة (Header)
async function authMiddleware(req, res, next) {
  try {
    await db.ready;
    req.token = core.bearer(req.headers.authorization);
    req.user = await db.getSessionUser(req.token);
    next();
  } catch (error) { sendError(res, error); }
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

    const user = await db.authenticateUser(username, password, req.ip);
    if (!user) {
      return res.status(401).json({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    res.json({
      success: true,
      user,
      token: await db.createSession(user)
    });
  } catch (err) {
    sendError(res, err);
  }
});

// 2. التحقق من الحساب النشط
app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'غير مسجل الدخول' });
  }
  res.json({ success: true, user: req.user });
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    await db.deleteSession(req.token);
    for (const socket of io.sockets.sockets.values()) if (socket.data.token === req.token) socket.disconnect(true);
    res.json({ success: true });
  } catch (error) { sendError(res, error); }
});

app.use('/api', (req, res, next) => {
  try {
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) core.body(req.body);
    core.canAccess(req.user, req.method, req.originalUrl.split('?')[0], req.body);
    res.setHeader('Cache-Control', 'no-store');
    next();
  } catch (error) { sendError(res, error); }
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
    sendError(res, err);
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
    sendError(res, err);
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
    for (const socket of io.sockets.sockets.values()) if (socket.data.userId === id) socket.disconnect(true);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    res.json({ success: true, user: updated });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بالوصول، صلاحية مدير فقط' });
    }
    const { id } = req.params;
    const deleted = await db.deleteUser(id);
    for (const socket of io.sockets.sockets.values()) if (socket.data.userId === id) socket.disconnect(true);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود أو لا يمكن حذفه' });
    }
    res.json({ success: true, user: deleted });
  } catch (err) {
    sendError(res, err);
  }
});

// ==========================================
// مسارات إدارة المواد والنقوصات (Items APIs)
// ==========================================

// حماية عمليات الإضافة والتعديل والحذف على المواد والمشتريات
app.use(['/api/items', '/api/purchases'], (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    if (!req.user || !req.user.id) {
      return res.status(403).json({ success: false, error: 'غير مصرح لك بالوصول، يرجى تسجيل الدخول أولاً' });
    }
  }
  next();
});

// جلب كل المواد
app.get('/api/items', async (req, res) => {
  try {
    const items = await db.getAllItems();
    res.json({ success: true, items, notifications: await db.getNotifications(req.user) });
  } catch (err) {
    sendError(res, err);
  }
});

// جلب الإحصائيات
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json({ success: true, stats });
  } catch (err) {
    sendError(res, err);
  }
});

// إضافة نقص جديد
app.post('/api/items', async (req, res) => {
  try {
    const { name, quantity, unit, notes, priority } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
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

    await broadcast('item:added', {
      item,
      notification: {
        title: notifTitle,
        body: notifBody,
        targetRole: 'purchasing'
      }
    });

    res.json({ success: true, item });
  } catch (err) {
    sendError(res, err);
  }
});

// شراء مباشر من السوق (مادة لم يذكرها المخزن مسبقاً)
app.post('/api/purchases/direct', async (req, res) => {
  try {
    if (req.user && req.user.role === 'warehouse') {
      return res.status(403).json({ success: false, error: 'صلاحية مسؤول المشتريات أو المدير فقط' });
    }
    const { name, quantity, unit, price, supplier, paymentMethod, notes, priority } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'اسم المادة مطلوب' });
    }

    const item = await db.addDirectPurchaseItem({
      name,
      quantity,
      unit,
      price,
      supplier,
      paymentMethod,
      notes,
      priority,
      user: req.user
    });

    const actorName = req.user ? req.user.name : 'مسؤول المشتريات';
    const finalPayment = (item.paymentMethod === 'debt') ? ' [مسجل دين ⏳]' : ' [نقداً 💵]';

    await broadcast('item:purchased', {
      item,
      notification: {
        title: '🛒 شراء مباشر جديد من السوق!',
        body: `تم شراء مادة جديدة مباشرة: ${item.name} (${item.quantity} ${item.unit})${finalPayment} بواسطة ${actorName} - بانتظار الجرد في المخزن`,
        targetRole: 'warehouse'
      }
    });

    res.json({ success: true, item });
  } catch (err) {
    sendError(res, err);
  }
});

// تحديث حالة الشراء
app.post('/api/items/:id/purchase', async (req, res) => {
  try {
    if (req.user && req.user.role === 'warehouse') {
      return res.status(403).json({ success: false, error: 'صلاحية مسؤول المشتريات أو المدير فقط' });
    }
    const { id } = req.params;
    const { status, quantityPurchased, missingReason, price, supplier, paymentMethod } = req.body;

    const item = await db.updatePurchaseStatus(id, { ...req.body, user: req.user });
    if (!item) {
      return res.status(404).json({ success: false, error: 'المادة غير موجودة' });
    }

    const isRevert = status === 'pending';
    let statusText = 'تم الشراء';
    if (isRevert) statusText = 'تمت الإعادة لقائمة المطلوب شراؤها';
    else if (status === 'partial') statusText = 'تم شراء جزء';
    else if (status === 'unavailable') statusText = 'غير متوفرة حالياً';

    const finalPayment = (item.paymentMethod === 'debt') ? ' [مسجل دين ⏳]' : ' [نقداً 💵]';
    const actorName = req.user ? req.user.name : 'مسؤول المشتريات';

    await broadcast('item:purchased', {
      item,
      notification: {
        title: isRevert ? 'تعديل حالة المادة 🔄' : 'تحديث المشتريات 🛒',
        body: `${item.name}: ${statusText}${finalPayment} (بواسطة ${actorName})`,
        targetRole: 'warehouse'
      }
    });

    res.json({ success: true, item });
  } catch (err) {
    sendError(res, err);
  }
});

// إشعار بإتمام جولة الشراء
app.post('/api/purchases/notify-warehouse', async (req, res) => {
  try {
    const message = core.text(req.body.message, 'رسالة الإشعار');
    const actorName = req.user ? req.user.name : 'المشتريات';
    await broadcast('notification:delivery', {
      title: 'وصول مشتريات جديدة! 🚚',
      body: message || `تم إتمام شراء المواد وتجهيزها بواسطة (${actorName})، يرجى فحصها وجردها بالمخزن.`,
      targetRole: 'warehouse'
    });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// تأكيد الجرد والاستلام
app.post('/api/items/:id/confirm', async (req, res) => {
  try {
    if (req.user && req.user.role === 'purchasing') {
      return res.status(403).json({ success: false, error: 'صلاحية مسؤول المخزن أو المدير فقط' });
    }
    const { id } = req.params;
    const { status, inventoryNotes, receivedQuantity } = req.body;

    const item = await db.confirmInventory(id, { ...req.body, user: req.user });
    if (!item) {
      return res.status(404).json({ success: false, error: 'المادة غير موجودة' });
    }

    const actorName = req.user ? req.user.name : 'المخزن';

    await broadcast('item:confirmed', {
      item,
      notification: {
        title: 'اكتمل الجرد في المخزن ✅',
        body: `تم استلام وجرد: ${item.name} (بواسطة ${actorName})`,
        targetRole: 'all'
      }
    });

    res.json({ success: true, item });
  } catch (err) {
    sendError(res, err);
  }
});

// إعادة طلب مادة
app.post('/api/items/:id/reorder', async (req, res) => {
  try {
    if (req.user && req.user.role === 'purchasing') {
      return res.status(403).json({ success: false, error: 'صلاحية مسؤول المخزن أو المدير فقط' });
    }
    const { id } = req.params;
    const item = await db.reorderItem(id, req.user, req.body.version);
    if (!item) {
      return res.status(404).json({ success: false, error: 'المادة غير موجودة' });
    }

    await broadcast('item:added', {
      item,
      notification: {
        title: 'إعادة طلب مادة 🔄',
        body: `تمت إعادة طلب: ${item.name}`,
        targetRole: 'purchasing'
      }
    });

    res.json({ success: true, item });
  } catch (err) {
    sendError(res, err);
  }
});

// تعديل مادة
app.put('/api/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db.updateItem(id, req.body, req.user);
    if (!item) {
      return res.status(404).json({ success: false, error: 'المادة غير موجودة' });
    }
    await broadcast('item:updated', { item });
    res.json({ success: true, item });
  } catch (err) {
    sendError(res, err);
  }
});

// تسديد دين مادة
app.post('/api/items/:id/settle-debt', async (req, res) => {
  try {
    if (req.user && req.user.role === 'warehouse') {
      return res.status(403).json({ success: false, error: 'صلاحية مسؤول المشتريات أو المدير فقط' });
    }
    const { id } = req.params;
    const item = await db.settleDebt(id, req.user, req.body.version);
    if (!item) {
      return res.status(404).json({ success: false, error: 'المادة غير موجودة' });
    }

    const actorName = req.user ? req.user.name : 'المحاسب';
    await broadcast('item:updated', { item });
    await broadcast('notification:debt_settled', {
      title: 'تسديد دين مادة 💰',
      body: `تم تسديد دين: ${item.name} (${Number(item.price || 0).toLocaleString()} د.ع) بنجاح بواسطة ${actorName}`,
      targetRole: 'all'
    });

    res.json({ success: true, item });
  } catch (err) {
    sendError(res, err);
  }
});

// حذف مادة
app.delete('/api/items/:id', async (req, res) => {
  try {
    if (req.user && req.user.role === 'purchasing') {
      return res.status(403).json({ success: false, error: 'صلاحية مسؤول المخزن أو المدير فقط' });
    }
    const { id } = req.params;
    const item = await db.deleteItem(id, req.body.version);
    if (!item) {
      return res.status(404).json({ success: false, error: 'المادة غير موجودة' });
    }

    await broadcast('item:deleted', { id });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
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
    sendError(res, err);
  }
});

io.use(async (socket, next) => {
  try {
    await db.ready;
    const token = socket.handshake.auth?.token;
    const user = await db.getSessionUser(token);
    if (!user) return next(new Error('Unauthorized'));
    socket.data.token = token;
    socket.data.userId = user.id;
    next();
  } catch { next(new Error('Unauthorized')); }
});

// WebSocket Connection
io.on('connection', (socket) => {
  console.log('مستخدم متصل:', socket.id);
  socket.on('disconnect', () => {
    console.log('مستخدم غادر:', socket.id);
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  sendError(res, error.type === 'entity.too.large' ? new core.AppError('بيانات الطلب أكبر من الحد المسموح', 413) : error instanceof SyntaxError ? new core.AppError('صيغة الطلب غير صحيحة') : error);
});

db.ready.then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 خادم النقوصات والمشتريات يعمل بنجاح على المنفذ: ${server.address().port}`);
  });
}).catch(error => {
  console.error('تعذر بدء البرنامج:', error.message);
  process.exitCode = 1;
  void db.close().catch(console.error);
});
