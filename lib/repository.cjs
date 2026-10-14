const core = require('./core.cjs');

function createRepository(store) {
  return {
    async authenticateUser(username, password, client = 'local') {
      const login = core.credentials(username, password);
      const key = await core.tokenHash(`${client}\n${login.username}`);
      const attempt = await store.getAttempt(key);
      if (attempt && attempt.expiresAt > Date.now() && attempt.count >= 10) throw new core.AppError('محاولات كثيرة؛ أعد المحاولة بعد 15 دقيقة', 429);
      const user = (await store.listUsers()).find(u => u.username.toLowerCase() === login.username);
      if (!user || !await core.verifyPassword(login.password, user.password)) {
        await store.failAttempt(key);
        return null;
      }
      await store.clearAttempt(key);
      return core.safeUser(user);
    },
    async createSession(user) {
      const token = core.randomToken();
      await store.saveSession({ hash: await core.tokenHash(token), userId: user.id, expiresAt: Date.now() + core.SESSION_MS });
      return token;
    },
    async getSessionUser(token) {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
      const session = await store.getSession(await core.tokenHash(token));
      if (!session || session.expiresAt <= Date.now()) return null;
      return core.safeUser(await store.getUser(session.userId));
    },
    async deleteSession(token) { if (token) await store.deleteSession(await core.tokenHash(token)); },
    async getAllUsers() { return (await store.listUsers()).map(core.safeUser); },
    async getUserById(id) { return core.safeUser(await store.getUser(id)); },
    async createUser(data) {
      core.body(data);
      const login = core.credentials(data.username, core.newPassword(data.password));
      const user = { id: core.id('usr_'), name: core.text(data.name, 'اسم الموظف', true, 255), username: login.username, password: await core.hashPassword(login.password), role: core.role(data.role), createdAt: new Date().toISOString() };
      await store.insertUser(user);
      return core.safeUser(user);
    },
    async updateUser(id, data) {
      core.body(data);
      const old = await store.getUser(id);
      if (!old) return null;
      const changes = {};
      if (data.name !== undefined) changes.name = core.text(data.name, 'اسم الموظف', true, 255);
      if (data.username !== undefined) changes.username = core.text(data.username, 'اسم المستخدم', true, 100).toLowerCase();
      if (data.password !== undefined) changes.password = await core.hashPassword(core.newPassword(data.password));
      if (data.role !== undefined) changes.role = core.role(data.role);
      if ((old.id === 'usr_admin' || old.username === 'admin') && (changes.role && changes.role !== 'admin' || changes.username && changes.username !== old.username)) throw new core.AppError('لا يمكن تغيير اسم دخول المدير الأساسي أو صلاحياته');
      await store.updateUser(id, changes);
      return core.safeUser(await store.getUser(id));
    },
    async deleteUser(id) {
      const user = await store.getUser(id);
      if (!user) return null;
      if (user.id === 'usr_admin' || user.username === 'admin') throw new core.AppError('لا يمكن حذف حساب المدير الأساسي');
      await store.deleteUser(id);
      return core.safeUser(user);
    },
    async getAllItems() { return store.listItems(); },
    async notify(notification) {
      const value = { ...notification, id: core.id('nt_'), createdAt: new Date().toISOString() };
      await store.saveNotification(value);
      return value;
    },
    async getNotifications(user) { return (await store.listNotifications()).filter(n => user.role === 'admin' || n.targetRole === 'all' || n.targetRole === user.role); },
    async getItem(id) { return store.getItem(id); },
    async addItem(data) { return this.createItem(data, false); },
    async addDirectPurchaseItem(data) { return this.createItem(data, true); },
    async createItem(data, direct) {
      const fields = core.itemInput(data, direct);
      const now = new Date().toISOString();
      const actor = data.user ? { id: data.user.id, name: data.user.name } : null;
      const item = { ...fields, id: core.id(), status: direct ? 'purchased' : 'pending', quantityPurchased: direct ? fields.quantity : 0, receivedQuantity: 0, missingReason: '', inventoryNotes: '', createdBy: actor, purchasedBy: direct ? actor : null, confirmedBy: null, createdAt: now, purchasedAt: direct ? now : null, completedAt: null, reorderedFrom: data.reorderedFrom || null, version: 0, history: [core.event(direct ? 'direct-purchase' : 'created', data.user, { quantity: fields.quantity, price: fields.price, paymentMethod: fields.paymentMethod })] };
      await store.insertItem(item);
      return item;
    },
    async updateItem(id, data, user) {
      const item = await store.getItem(id);
      if (!item) return null;
      core.canAccess(user, 'PUT', `/api/items/${id}`, data);
      return store.updateItem(item, core.editChange(item, data, user));
    },
    async updatePurchaseStatus(id, data) {
      const item = await store.getItem(id);
      if (!item) return null;
      return store.updateItem(item, core.purchaseChange(item, data, data.user));
    },
    async confirmInventory(id, data) {
      const item = await store.getItem(id);
      if (!item) return null;
      return store.updateItem(item, core.inventoryChange(item, data, data.user));
    },
    async settleDebt(id, user, expectedVersion) {
      const item = await store.getItem(id);
      if (!item) return null;
      core.version(item, expectedVersion);
      if (!core.isDebt(item)) throw new core.AppError('لا يوجد دين معلق لهذه المادة', 409);
      return store.updateItem(item, { paymentMethod: 'cash', history: core.addHistory(item, 'settle-debt', user, { amount: Number(item.price) }) });
    },
    async deleteItem(id, expectedVersion) {
      const item = await store.getItem(id);
      if (!item) return null;
      core.version(item, expectedVersion);
      if (core.hasPurchase(item) || core.isDebt(item)) throw new core.AppError('لا يمكن حذف مادة مشتراة أو عليها دين حفاظًا على السجل');
      await store.deleteItem(item);
      return item;
    },
    async reorderItem(id, user, expectedVersion) {
      const item = await store.getItem(id);
      if (!item) return null;
      core.version(item, expectedVersion);
      if ((await store.listItems()).some(row => row.reorderedFrom === id && ['pending', 'purchased', 'partial'].includes(row.status))) throw new core.AppError('يوجد طلب مفتوح لهذه المادة بالفعل', 409);
      return this.addItem({ ...core.reorderInput(item), reorderedFrom: id, user });
    },
    async getStats() {
      const items = await store.listItems();
      return { total: items.length, pendingCount: items.filter(i => i.status === 'pending').length, purchasedCount: items.filter(i => ['purchased', 'partial'].includes(i.status)).length, unavailableCount: items.filter(i => i.status === 'unavailable').length, completedCount: items.filter(i => i.status === 'completed').length, emergencyCount: items.filter(i => i.status === 'pending' && i.priority === 'emergency').length, ...core.expenses(items) };
    }
  };
}
module.exports = { createRepository };
