const encoder = new TextEncoder();
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 100000;

class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function text(value, label, required = false, max = 2000) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new AppError(`${label}: قيمة غير صحيحة`);
  const result = value.trim();
  if ((required && !result) || result.length > max) throw new AppError(`${label}: تحقق من النص المدخل`);
  return result;
}
function number(value, label, min = 0, fallback) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  if (!['number', 'string'].includes(typeof value) || value === '' || (typeof value === 'string' && !value.trim())) throw new AppError(`${label}: أدخل رقمًا صحيحًا`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > 1e12) throw new AppError(`${label}: قيمة خارج النطاق`);
  return result;
}
function choice(value, values, label, fallback) {
  const result = value === undefined ? fallback : value;
  if (!values.includes(result)) throw new AppError(`${label}: قيمة غير صحيحة`);
  return result;
}
function body(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('بيانات الطلب غير صحيحة');
  return value;
}
function role(value = 'warehouse') { return choice(value, ['admin', 'warehouse', 'purchasing'], 'الصلاحية'); }
function credentials(username, password) {
  const uname = text(username, 'اسم المستخدم', true, 100).toLowerCase();
  // Preserve spaces in new passwords; legacy comparison is handled only during migration.
  if (typeof password !== 'string' || !password.trim() || password.length > 128) throw new AppError('كلمة المرور غير صحيحة');
  return { username: uname, password };
}
function newPassword(password) {
  credentials('validation', password);
  if (password.length < 8) throw new AppError('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل');
  return password;
}
function hex(bytes) { return Array.from(bytes, v => v.toString(16).padStart(2, '0')).join(''); }
function unhex(value) { return Uint8Array.from(value.match(/../g) || [], v => parseInt(v, 16)); }
function randomToken() { return hex(crypto.getRandomValues(new Uint8Array(32))); }
function id(prefix = 'mn_') { return prefix + crypto.randomUUID(); }
async function tokenHash(token) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)))); }
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unhex(salt), iterations, hash: 'SHA-256' }, key, 256)));
}
async function hashPassword(password) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${await derive(password, salt, PASSWORD_ITERATIONS)}`;
}
async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2' || !/^\d+$/.test(parts[1]) || Number(parts[1]) !== PASSWORD_ITERATIONS || !/^[a-f0-9]{32}$/.test(parts[2]) || !/^[a-f0-9]{64}$/.test(parts[3])) return false;
  const actual = await derive(password, parts[2], Number(parts[1]));
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ parts[3].charCodeAt(i);
  return difference === 0;
}
function bearer(value) { return typeof value === 'string' && /^Bearer [a-f0-9]{64}$/.test(value) ? value.slice(7) : null; }
function safeUser(user) { if (!user) return null; const { password, ...safe } = user; return safe; }
function hasPurchase(item) { return Number(item.quantityPurchased) > 0 || ['purchased', 'partial', 'completed'].includes(item.status); }
function isDebt(item) { return item.paymentMethod === 'debt' && Number(item.price) > 0; }
function expenses(items) {
  const bought = items.filter(hasPurchase);
  const totalExpenses = bought.reduce((sum, i) => sum + Math.max(0, Number(i.price) || 0), 0);
  const totalDebt = items.filter(isDebt).reduce((sum, i) => sum + Number(i.price), 0);
  return { totalExpenses, totalDebt, totalCash: Math.max(0, totalExpenses - totalDebt), debtCount: items.filter(isDebt).length };
}
function version(item, expected) {
  if (expected !== undefined && number(expected, 'نسخة المادة') !== (item.version || 0)) throw new AppError('تغيرت المادة من جهاز آخر، حدّث القائمة وأعد المحاولة', 409);
}
function event(action, user, details = {}) { return { action, at: new Date().toISOString(), by: user ? { id: user.id, name: user.name } : null, details }; }
function addHistory(item, action, user, details) { return [...(Array.isArray(item.history) ? item.history : []), event(action, user, details)]; }
function canAccess(user, method, pathname, data = {}) {
  if (!user || !['admin', 'warehouse', 'purchasing'].includes(user.role)) throw new AppError('يرجى تسجيل الدخول', 401);
  if (pathname.startsWith('/api/admin/') && user.role !== 'admin') throw new AppError('صلاحية مدير فقط', 403);
  if (method === 'GET') return;
  const purchase = pathname === '/api/purchases/direct' || pathname === '/api/purchases/notify-warehouse' || /\/(purchase|settle-debt)$/.test(pathname);
  const warehouse = (pathname === '/api/items' && method === 'POST') || /\/(confirm|reorder)$/.test(pathname) || method === 'DELETE' && pathname.startsWith('/api/items/') || method === 'PUT' && pathname.startsWith('/api/items/');
  if (purchase && user.role === 'warehouse' || warehouse && user.role === 'purchasing') throw new AppError('هذه العملية غير متاحة لصلاحيتك', 403);
  if (method === 'PUT' && pathname.startsWith('/api/items/') && user.role !== 'admin' && ['price', 'paymentMethod', 'supplier'].some(key => data[key] !== undefined)) throw new AppError('تعديل بيانات الشراء والدفع متاح للمدير فقط', 403);
}
function itemInput(data, direct = false) {
  body(data);
  return {
    name: text(data.name, 'اسم المادة', true, 255), quantity: number(data.quantity, 'الكمية', 0.01, 1),
    unit: text(data.unit === undefined ? 'قطعة' : data.unit, 'الوحدة', true, 50), notes: text(data.notes, 'الملاحظات'),
    priority: choice(data.priority, ['normal', 'urgent', 'emergency'], 'الأولوية', 'normal'),
    price: direct ? Math.round(number(data.price, 'السعر', 0, 0)) : 0,
    supplier: direct ? text(data.supplier, 'المورد', false, 255) : '',
    paymentMethod: direct ? choice(data.paymentMethod, ['cash', 'debt'], 'طريقة الدفع', 'cash') : 'cash'
  };
}
function purchaseChange(item, data, user) {
  body(data); version(item, data.version);
  const status = choice(data.status, ['pending', 'purchased', 'partial', 'unavailable'], 'حالة الشراء');
  if (item.confirmedBy || item.status === 'completed') throw new AppError('المادة جُردت بالمخزن؛ استخدم طلب مرة أخرى لحفظ السجل السابق', 409);
  if (hasPurchase(item) && ['pending', 'unavailable'].includes(status)) throw new AppError('لا يمكن إلغاء شراء مسجل بهذه الطريقة؛ استخدم طلب مرة أخرى', 409);
  const quantityPurchased = ['pending', 'unavailable'].includes(status) ? 0 : number(data.quantityPurchased, 'الكمية المشتراة', 0.01, status === 'purchased' ? Number(item.quantity) : undefined);
  if (quantityPurchased > Number(item.quantity) || status === 'partial' && quantityPurchased >= Number(item.quantity) || status === 'purchased' && quantityPurchased !== Number(item.quantity)) throw new AppError('الكمية لا تطابق حالة الشراء أو تتجاوز المطلوب');
  const actor = user ? { id: user.id, name: user.name } : null;
  const changes = { status, quantityPurchased, missingReason: text(data.missingReason, 'ملاحظة الشراء'),
    price: ['pending', 'unavailable'].includes(status) ? 0 : data.price === undefined ? Number(item.price) || 0 : Math.round(number(data.price, 'السعر')),
    supplier: data.supplier === undefined ? item.supplier || '' : text(data.supplier, 'المورد', false, 255),
    paymentMethod: ['pending', 'unavailable'].includes(status) ? 'cash' : choice(data.paymentMethod, ['cash', 'debt'], 'طريقة الدفع', item.paymentMethod || 'cash'),
    purchasedBy: status === 'pending' ? null : actor, purchasedAt: status === 'pending' ? null : new Date().toISOString() };
  if (hasPurchase(item) && (item.paymentMethod !== changes.paymentMethod || Number(item.price) !== changes.price || Number(item.quantityPurchased) !== quantityPurchased)) throw new AppError('بيانات الشراء مسجلة بالفعل؛ تعديل السعر للمدير وتسديد الدين من زر التسديد', 409);
  changes.history = addHistory(item, 'purchase', user, { status, quantityPurchased, price: changes.price, paymentMethod: changes.paymentMethod });
  return changes;
}
function inventoryChange(item, data, user) {
  body(data); version(item, data.version);
  if (!hasPurchase(item) || !['purchased', 'partial', 'unavailable'].includes(item.status)) throw new AppError('لا يمكن استلام مادة قبل شرائها أو بعد اكتمال جردها', 409);
  const requestedStatus = choice(data.status, ['completed', 'unavailable'], 'حالة الاستلام', 'completed');
  const receivedQuantity = number(data.receivedQuantity, 'الكمية المستلمة', 0);
  if (receivedQuantity > Number(item.quantityPurchased) || requestedStatus === 'completed' && (receivedQuantity <= 0 || receivedQuantity !== Number(item.quantityPurchased))) throw new AppError('الاستلام الكامل يجب أن يطابق المشترى؛ استخدم نقص لم يجهز للاستلام الناقص');
  if (requestedStatus === 'unavailable' && receivedQuantity >= Number(item.quantity)) throw new AppError('الكمية مكتملة؛ استخدم تأكيد الاستلام');
  // Receiving all of a partial purchase does not complete the original shortage.
  const status = receivedQuantity < Number(item.quantity) ? 'unavailable' : 'completed';
  const changes = { status, receivedQuantity, inventoryNotes: text(data.inventoryNotes, 'ملاحظة الجرد'), confirmedBy: { id: user.id, name: user.name }, completedAt: new Date().toISOString() };
  changes.history = addHistory(item, 'confirm', user, { status, receivedQuantity, notes: changes.inventoryNotes });
  return changes;
}
function editChange(item, data, user) {
  body(data); version(item, data.version);
  const changes = {};
  const labels = { name: ['اسم المادة', true, 255], unit: ['الوحدة', true, 50], notes: ['الملاحظات', false, 2000], supplier: ['المورد', false, 255] };
  for (const [key, args] of Object.entries(labels)) if (data[key] !== undefined) changes[key] = text(data[key], ...args);
  if (data.quantity !== undefined) {
    changes.quantity = number(data.quantity, 'الكمية', 0.01);
    if (hasPurchase(item) && changes.quantity !== Number(item.quantity)) throw new AppError('لا يمكن تغيير كمية طلب تم شراؤه؛ أنشئ طلبًا جديدًا');
  }
  if (data.priority !== undefined) changes.priority = choice(data.priority, ['normal', 'urgent', 'emergency'], 'الأولوية');
  if (data.price !== undefined) {
    changes.price = Math.round(number(data.price, 'السعر'));
    if (!hasPurchase(item) && changes.price > 0) throw new AppError('سجل الشراء أولًا قبل إضافة السعر');
  }
  if (data.paymentMethod !== undefined && data.paymentMethod !== item.paymentMethod) throw new AppError('استخدم إجراء الشراء أو تسديد الدين لتغيير الدفع');
  changes.history = addHistory(item, 'edit', user, { before: Object.fromEntries(Object.keys(changes).map(key => [key, item[key]])), after: { ...changes } });
  return changes;
}
function reorderInput(item) {
  if (!['completed', 'partial', 'unavailable'].includes(item.status)) throw new AppError('إعادة الطلب متاحة للمادة المكتملة أو الناقصة فقط', 409);
  const quantity = item.status === 'completed' ? Number(item.quantity) : Math.max(0, Number(item.quantity) - Number(item.confirmedBy ? item.receivedQuantity : item.quantityPurchased));
  if (quantity <= 0) throw new AppError('لا توجد كمية متبقية للطلب');
  return { name: item.name, quantity, unit: item.unit, notes: item.notes, priority: item.priority };
}
module.exports = { AppError, SESSION_MS, text, number, choice, body, role, credentials, newPassword, id, randomToken, tokenHash, hashPassword, verifyPassword, bearer, safeUser, hasPurchase, isDebt, expenses, version, event, addHistory, canAccess, itemInput, purchaseChange, inventoryChange, editChange, reorderInput };
