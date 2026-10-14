const fs = require('fs');
const path = require('path');
const core = require('./core.cjs');

function createLocalStore(directory) {
  const file = path.join(directory, 'store.json');
  fs.mkdirSync(directory, { recursive: true });
  function read() {
    // Do not replace a corrupt business database with empty data.
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data.users) || !Array.isArray(data.items)) throw new Error('ملف البيانات غير صالح؛ استعد نسخة احتياطية قبل المتابعة');
    data.sessions ||= []; data.authAttempts ||= {}; data.notifications ||= [];
    for (const item of data.items) { item.version ||= 0; item.history ||= []; item.paymentMethod ||= 'cash'; }
    return data;
  }
  function write(data) {
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    const temp = `${file}.tmp`;
    const fd = fs.openSync(temp, 'w');
    try { fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  }
  function mutate(action) { const data = read(); const result = action(data); write(data); return result; }
  return {
    async initialize(password) {
      let data;
      if (!fs.existsSync(file)) {
        if (!password) throw new core.AppError('اضبط INITIAL_ADMIN_PASSWORD لإعداد المدير أول مرة', 503);
        data = { users: [{ id: 'usr_admin', name: 'المدير العام', username: 'admin', password: await core.hashPassword(core.newPassword(password)), role: 'admin', createdAt: new Date().toISOString() }], items: [], sessions: [], authAttempts: {} };
        write(data); return;
      }
      data = read();
      if (!data.users.length) throw new Error('لا توجد حسابات في قاعدة البيانات؛ استعد نسخة احتياطية');
      let migrated = false;
      for (const user of data.users) if (typeof user.password === 'string' && !user.password.startsWith('pbkdf2$')) { user.password = await core.hashPassword(user.password); migrated = true; }
      if (migrated) { write(data); fs.copyFileSync(file, `${file}.bak`); }
    },
    async listUsers() { return read().users; },
    async getUser(id) { return read().users.find(u => u.id === id) || null; },
    async insertUser(user) { mutate(data => { if (data.users.some(u => u.username.toLowerCase() === user.username)) throw new core.AppError('اسم المستخدم مسجل مسبقًا'); data.users.push(user); }); },
    async updateUser(id, changes) { mutate(data => { if (changes.username && data.users.some(u => u.id !== id && u.username.toLowerCase() === changes.username)) throw new core.AppError('اسم المستخدم مسجل مسبقًا'); const user = data.users.find(u => u.id === id); if (!user) throw new core.AppError('المستخدم غير موجود', 404); Object.assign(user, changes); data.sessions = data.sessions.filter(s => s.userId !== id); }); },
    async deleteUser(id) { mutate(data => { data.users = data.users.filter(u => u.id !== id); data.sessions = data.sessions.filter(s => s.userId !== id); }); },
    async listItems() { return read().items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); },
    async getItem(id) { return read().items.find(i => i.id === id) || null; },
    async saveNotification(n) { mutate(data => { data.notifications = data.notifications.filter(row => new Date(row.createdAt).getTime() > Date.now() - 7 * 86400000); data.notifications.unshift(n); }); },
    async listNotifications() { return read().notifications.filter(row => new Date(row.createdAt).getTime() > Date.now() - 7 * 86400000).slice(0, 100); },
    async insertItem(item) { mutate(data => { if (item.reorderedFrom && data.items.some(row => row.reorderedFrom === item.reorderedFrom && ['pending', 'purchased', 'partial'].includes(row.status))) throw new core.AppError('يوجد طلب مفتوح لهذه المادة بالفعل', 409); data.items.unshift(item); }); },
    async updateItem(old, changes) { return mutate(data => { const item = data.items.find(i => i.id === old.id); if (!item || item.version !== old.version) throw new core.AppError('تغيرت المادة من جهاز آخر، حدّث القائمة وأعد المحاولة', 409); Object.assign(item, changes, { version: old.version + 1 }); return item; }); },
    async deleteItem(old) { mutate(data => { const index = data.items.findIndex(i => i.id === old.id && i.version === old.version); if (index < 0) throw new core.AppError('تغيرت المادة من جهاز آخر، أعد المحاولة', 409); data.items.splice(index, 1); }); },
    async saveSession(session) { mutate(data => { data.sessions = data.sessions.filter(s => s.expiresAt > Date.now()); data.sessions.push(session); }); },
    async getSession(hash) { return read().sessions.find(s => s.hash === hash) || null; },
    async deleteSession(hash) { mutate(data => { data.sessions = data.sessions.filter(s => s.hash !== hash); }); },
    async getAttempt(key) { return read().authAttempts[key] || null; },
    async failAttempt(key) { mutate(data => { const now = Date.now(); for (const [k, a] of Object.entries(data.authAttempts)) if (a.expiresAt <= now) delete data.authAttempts[k]; const attempt = data.authAttempts[key] || { count: 0, expiresAt: now + 900000 }; attempt.count++; data.authAttempts[key] = attempt; }); },
    async clearAttempt(key) { mutate(data => { delete data.authAttempts[key]; }); }
  };
}
module.exports = { createLocalStore };
