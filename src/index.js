import core from '../lib/core.cjs';
import repositories from '../lib/repository.cjs';
import sql from '../lib/sql-store.cjs';

// Initialization is shared only for this database binding, never for users or request data.
const readyRepositories = new WeakMap();
async function repository(env) {
  if (!readyRepositories.has(env.DB)) {
    const ready = (async () => {
      const store = sql.createSQLStore(sql.d1Driver(env.DB));
      await store.initialize(env.INITIAL_ADMIN_PASSWORD);
      return repositories.createRepository(store);
    })();
    readyRepositories.set(env.DB, ready);
    void ready.catch(() => readyRepositories.delete(env.DB));
  }
  return readyRepositories.get(env.DB);
}
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
async function readJson(request) {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) { await reader.cancel(); throw new core.AppError('بيانات الطلب أكبر من الحد المسموح', 413); }
    chunks.push(value);
  }
  if (!size) return {};
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return core.body(JSON.parse(new TextDecoder().decode(bytes))); }
  catch (error) { if (error.status) throw error; throw new core.AppError('صيغة الطلب غير صحيحة'); }
}
function found(value, name = 'المادة') { if (!value) throw new core.AppError(`${name} غير موجودة`, 404); return value; }
async function notify(db, title, body, targetRole) {
  try { await db.notify({ title, body, targetRole }); }
  catch (error) { console.error(JSON.stringify({ event: 'notification-save-failed', message: error.message })); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname === '/socket.io/socket.io.js') return new Response('window.io = null;', { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('Origin');
    const response = (data, status = 200) => {
      const result = jsonResponse(data, status);
      if (origin && (origin === url.origin || (env.ALLOWED_ORIGINS || '').split(',').includes(origin))) {
        result.headers.set('Access-Control-Allow-Origin', origin);
        result.headers.set('Vary', 'Origin');
      }
      return result;
    };
    if (origin && origin !== url.origin && !(env.ALLOWED_ORIGINS || '').split(',').includes(origin)) return response({ success: false, error: 'مصدر الطلب غير مسموح' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Vary': 'Origin' } });
    try {
      const db = await repository(env);
      const method = request.method;
      const token = core.bearer(request.headers.get('Authorization'));
      if (pathname === '/api/auth/login' && method === 'POST') {
        const data = await readJson(request);
        const user = await db.authenticateUser(data.username, data.password, request.headers.get('CF-Connecting-IP') || 'local');
        if (!user) throw new core.AppError('اسم المستخدم أو كلمة المرور غير صحيحة', 401);
        return response({ success: true, user, token: await db.createSession(user) });
      }
      if (pathname === '/api/auth/logout' && method === 'POST') { await db.deleteSession(token); return response({ success: true }); }
      const user = await db.getSessionUser(token);
      core.canAccess(user, method, pathname);
      if (pathname === '/api/auth/me' && method === 'GET') return response({ success: true, user });
      const data = ['POST', 'PUT', 'DELETE'].includes(method) ? await readJson(request) : {};
      core.canAccess(user, method, pathname, data);
      if (pathname === '/api/admin/users') {
        if (method === 'GET') return response({ success: true, users: await db.getAllUsers() });
        if (method === 'POST') return response({ success: true, user: await db.createUser(data) });
      }
      const userRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (userRoute) {
        const id = decodeURIComponent(userRoute[1]);
        if (method === 'PUT') return response({ success: true, user: found(await db.updateUser(id, data), 'المستخدم') });
        if (method === 'DELETE') return response({ success: true, user: found(await db.deleteUser(id), 'المستخدم') });
      }
      if (pathname === '/api/admin/export' && method === 'GET') return response({ success: true, items: await db.getAllItems() });
      if (pathname === '/api/stats' && method === 'GET') return response({ success: true, stats: await db.getStats() });
      if (pathname === '/api/items') {
        if (method === 'GET') return response({ success: true, items: await db.getAllItems(), notifications: await db.getNotifications(user) });
        if (method === 'POST') {
          const item = await db.addItem({ ...data, user });
          await notify(db, item.priority === 'emergency' ? '🚨 نقص طارئ في المخزن' : 'نقص جديد في المخزن 📦', `تم تسجيل ${item.name} (${item.quantity} ${item.unit}) بواسطة ${user.name}`, 'purchasing');
          return response({ success: true, item });
        }
      }
      if (pathname === '/api/purchases/direct' && method === 'POST') {
        const item = await db.addDirectPurchaseItem({ ...data, user });
        await notify(db, 'شراء مباشر جديد 🛒', `${item.name} (${item.quantity} ${item.unit}) بواسطة ${user.name} — بانتظار الجرد`, 'warehouse');
        return response({ success: true, item });
      }
      if (pathname === '/api/purchases/notify-warehouse' && method === 'POST') {
        await db.notify({ title: 'وصول مشتريات جديدة 🚚', body: core.text(data.message, 'رسالة الإشعار') || `المشتريات جاهزة للجرد بواسطة ${user.name}`, targetRole: 'warehouse' });
        return response({ success: true });
      }
      const itemRoute = pathname.match(/^\/api\/items\/([^/]+)(?:\/(purchase|confirm|reorder|settle-debt))?$/);
      if (itemRoute) {
        const id = decodeURIComponent(itemRoute[1]);
        const action = itemRoute[2];
        let item;
        if (method === 'POST' && action === 'purchase') {
          item = found(await db.updatePurchaseStatus(id, { ...data, user }));
          await notify(db, 'تحديث المشتريات 🛒', `${item.name}: ${item.status === 'unavailable' ? 'غير متوفرة' : item.status === 'pending' ? 'بانتظار الشراء' : 'تم تسجيل الشراء'} بواسطة ${user.name}`, 'warehouse');
        } else if (method === 'POST' && action === 'confirm') {
          item = found(await db.confirmInventory(id, { ...data, user }));
          await notify(db, 'تحديث جرد المخزن 📦', `${item.name}: استلم ${item.receivedQuantity} ${item.unit} بواسطة ${user.name}`, 'purchasing');
        } else if (method === 'POST' && action === 'reorder') {
          item = found(await db.reorderItem(id, user, data.version));
          await notify(db, 'طلب جديد للمادة 🔄', `${item.name} (${item.quantity} ${item.unit}) بواسطة ${user.name}`, 'purchasing');
        } else if (method === 'POST' && action === 'settle-debt') {
          item = found(await db.settleDebt(id, user, data.version));
          await notify(db, 'تسديد دين 💰', `${item.name}: ${Number(item.price).toLocaleString()} د.ع بواسطة ${user.name}`, 'all');
        } else if (!action && method === 'PUT') item = found(await db.updateItem(id, data, user));
        else if (!action && method === 'DELETE') { found(await db.deleteItem(id, data.version)); return response({ success: true, id }); }
        if (item) return response({ success: true, item });
      }
      throw new core.AppError('المسار غير موجود', 404);
    } catch (error) {
      if (!error.status) console.error(JSON.stringify({ event: 'request-failed', path: pathname, message: error.message }));
      return response({ success: false, error: error.status ? error.message : 'تعذر تنفيذ العملية؛ حاول مرة أخرى' }, error.status || 500);
    }
  }
};
