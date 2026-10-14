const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const { once } = require('events');
const { Miniflare } = require('miniflare');
const core = require('../lib/core.cjs');
const { createRepository } = require('../lib/repository.cjs');
const { createSQLStore, d1Driver, pgDriver, mapItem } = require('../lib/sql-store.cjs');
const { createLocalStore } = require('../lib/local-store.cjs');
const helpers = require('../public/helpers.js');
const root = path.resolve(__dirname, '..');
const seedUsers = () => [
  { id: 'usr_admin', name: 'مدير تجريبي', username: 'admin', password: '123456', role: 'admin', createdAt: new Date().toISOString() },
  { id: 'usr_store', name: 'مخزن تجريبي', username: 'store', password: '1234', role: 'warehouse', createdAt: new Date().toISOString() },
  { id: 'usr_buyer', name: 'مشتريات تجريبي', username: 'buyer', password: '1234', role: 'purchasing', createdAt: new Date().toISOString() }
];
function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'mankhul-tests-')); }
function cleanTemp(dir) { assert.equal(path.dirname(dir), os.tmpdir()); assert.ok(path.basename(dir).startsWith('mankhul-tests-')); fs.rmSync(dir, { recursive: true, force: true }); }
function apiClient(dispatch) {
  return async (url, method = 'GET', body, token, extraHeaders = {}) => {
    const response = await dispatch(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
}
async function nodeRuntime() {
  const directory = tempDir();
  fs.writeFileSync(path.join(directory, 'store.json'), JSON.stringify({ users: seedUsers(), items: [] }));
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, DATABASE_URL: '', DATA_DIR: directory, PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  let port;
  for (let n = 0; n < 150; n++) {
    port = logs.match(/المنفذ: (\d+)/)?.[1];
    if (port) break;
    if (child.exitCode !== null) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!port) { child.kill(); throw new Error('Isolated Node server did not start: ' + logs); }
  return { api: apiClient((url, options) => fetch(`http://127.0.0.1:${port}${url}`, options)), baseUrl: `http://127.0.0.1:${port}`, directory, async close() { const exited = once(child, 'exit'); child.kill(); await exited; cleanTemp(directory); } };
}
async function workerRuntime() {
  execFileSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--dry-run', '--outdir', '.system_generated/worker-build'], { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, windowsHide: true, stdio: 'pipe' });
  const mf = new Miniflare({ telemetry: { enabled: false }, cf: false, workers: [{ config: { name: 'mankhul-test', compatibilityDate: '2026-09-15', manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: fs.readFileSync(path.join(root, '.system_generated/worker-build/index.js'), 'utf8') } } }, env: { DB: { type: 'd1', name: 'mankhul-test-db', id: 'mankhul-test-db' } } } }] });
  const d1 = await mf.getD1Database('DB');
  // Seed legacy credentials only in the isolated test database to verify migration.
  await d1.exec('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT);');
  for (const user of seedUsers()) await d1.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)').bind(user.id, user.name, user.username, user.password, user.role, user.createdAt).run();
  return { api: apiClient((url, options) => mf.dispatchFetch('http://localhost' + url, options)), d1, mf, close: () => mf.dispose() };
}

async function scenarios(t, runtime) {
  const { api } = runtime;
  let admin, store, buyer;
  await t.test('sessions reject impersonation, anonymous access and invalid credentials', async () => {
    for (const route of ['/api/items', '/api/stats', '/api/admin/users']) assert.equal((await api(route, 'GET', undefined, undefined, { 'x-user-id': 'usr_admin' })).status, 401);
    assert.equal((await api('/api/auth/me', 'GET', undefined, 'usr_admin')).status, 401);
    assert.equal((await api('/api/auth/login', 'POST', { username: 'admin', password: 'wrong' })).status, 401);
    assert.equal((await api('/api/auth/login', 'POST', { username: 10, password: '123456' })).status, 400);
    admin = (await api('/api/auth/login', 'POST', { username: 'ADMIN', password: '123456' })).body;
    store = (await api('/api/auth/login', 'POST', { username: 'store', password: '1234' })).body;
    buyer = (await api('/api/auth/login', 'POST', { username: 'buyer', password: '1234' })).body;
    assert.match(admin.token, /^[a-f0-9]{64}$/);
    assert.notEqual(admin.token, admin.user.id);
    assert.ok(!('password' in admin.user));
    assert.equal((await api('/api/auth/me', 'GET', undefined, admin.token)).status, 200);
    const rows = runtime.d1 ? (await runtime.d1.prepare('SELECT password FROM users').all()).results : JSON.parse(fs.readFileSync(path.join(runtime.directory, 'store.json'), 'utf8')).users;
    assert.ok(rows.every(row => row.password.startsWith('pbkdf2$')));
  });
  await t.test('server roles protect operations and financial fields', async () => {
    assert.equal((await api('/api/items', 'POST', { name: 'Forbidden' }, buyer.token)).status, 403);
    assert.equal((await api('/api/purchases/direct', 'POST', { name: 'Forbidden' }, store.token)).status, 403);
    assert.equal((await api('/api/purchases/notify-warehouse', 'POST', {}, store.token)).status, 403);
    assert.equal((await api('/api/admin/users', 'GET', undefined, buyer.token)).status, 403);
    assert.equal((await api('/api/admin/users', 'POST', { name: 'Invalid', username: 'invalid', password: 'Long-test-password', role: 'unknown' }, admin.token)).status, 400);
    assert.equal((await api('/api/admin/users', 'POST', { name: 'Weak', username: 'weak', password: '1234', role: 'warehouse' }, admin.token)).status, 400);
    assert.equal((await api('/api/admin/users/usr_admin', 'PUT', { role: 'warehouse' }, admin.token)).status, 400);
  });
  await t.test('partial receipt preserves money, quantity, history and prior purchase on reorder', async () => {
    const added = await api('/api/items', 'POST', { name: 'مادة تجريبية', quantity: 5, unit: 'قطعة' }, store.token);
    assert.equal(added.status, 200);
    const id = added.body.item.id;
    assert.equal((await api(`/api/items/${id}`, 'PUT', { price: 8000 }, store.token)).status, 403);
    assert.equal((await api(`/api/items/${id}`, 'PUT', { notes: 'test' }, buyer.token)).status, 403);
    assert.equal((await api(`/api/items/${id}/confirm`, 'POST', { status: 'completed', receivedQuantity: 1 }, buyer.token)).status, 403);
    assert.equal((await api(`/api/items/${id}/confirm`, 'POST', { status: 'completed', receivedQuantity: 1 }, store.token)).status, 409);
    const purchased = await api(`/api/items/${id}/purchase`, 'POST', { version: 0, status: 'partial', quantityPurchased: 2, price: 8000, paymentMethod: 'debt', supplier: 'مورد تجريبي' }, buyer.token);
    assert.equal(purchased.status, 200);
    assert.equal(purchased.body.item.paymentMethod, 'debt');
    assert.equal(purchased.body.item.purchasedBy.id, buyer.user.id);
    assert.equal(purchased.body.item.version, 1);
    assert.equal((await api(`/api/items/${id}/purchase`, 'POST', { version: 0, status: 'partial', quantityPurchased: 2 }, buyer.token)).status, 409);
    assert.equal((await api(`/api/items/${id}/purchase`, 'POST', { version: 1, status: 'pending' }, buyer.token)).status, 409);
    assert.equal((await api(`/api/items/${id}/confirm`, 'POST', { version: 1, status: 'completed', receivedQuantity: 0 }, store.token)).status, 400);
    assert.equal((await api(`/api/items/${id}/confirm`, 'POST', { version: 1, status: 'unavailable' }, store.token)).status, 400);
    const receipt = await api(`/api/items/${id}/confirm`, 'POST', { version: 1, status: 'unavailable', receivedQuantity: 1, inventoryNotes: 'استلام ناقص' }, store.token);
    assert.equal(receipt.status, 200);
    assert.equal(receipt.body.item.receivedQuantity, 1);
    let stats = (await api('/api/stats', 'GET', undefined, admin.token)).body.stats;
    assert.equal(stats.totalDebt, 8000); assert.equal(stats.totalExpenses, 8000); assert.equal(stats.totalCash, 0);
    const reordered = await api(`/api/items/${id}/reorder`, 'POST', { version: 2 }, store.token);
    assert.equal(reordered.status, 200);
    assert.notEqual(reordered.body.item.id, id);
    assert.equal(reordered.body.item.reorderedFrom, id);
    assert.equal(reordered.body.item.quantity, 4);
    assert.equal((await api(`/api/items/${id}/reorder`, 'POST', { version: 2 }, store.token)).status, 409);
    const list = (await api('/api/items', 'GET', undefined, admin.token)).body.items;
    const old = list.find(i => i.id === id);
    assert.equal(list.length, 2); assert.equal(old.price, 8000); assert.equal(old.quantityPurchased, 2); assert.ok(old.purchasedAt);
    assert.equal((await api(`/api/items/${id}`, 'DELETE', { version: 2 }, admin.token)).status, 400);
    const settled = await api(`/api/items/${id}/settle-debt`, 'POST', { version: 2 }, buyer.token);
    assert.equal(settled.status, 200); assert.equal(settled.body.item.paymentMethod, 'cash');
    assert.equal(settled.body.item.history.at(-1).action, 'settle-debt'); assert.equal(settled.body.item.history.at(-1).details.amount, 8000);
    assert.equal((await api(`/api/items/${id}/settle-debt`, 'POST', { version: 3 }, buyer.token)).status, 409);
    stats = (await api('/api/stats', 'GET', undefined, admin.token)).body.stats;
    assert.equal(stats.totalDebt, 0); assert.equal(stats.totalExpenses, 8000); assert.equal(stats.totalCash, 8000);
    assert.equal((await api(`/api/items/${reordered.body.item.id}`, 'DELETE', { version: 0 }, store.token)).status, 200);
  });
  await t.test('input validation and concurrent updates protect records', async () => {
    assert.equal((await api('/api/items', 'POST', { name: 100 }, store.token)).status, 400);
    assert.equal((await api('/api/purchases/direct', 'POST', { name: 100 }, buyer.token)).status, 400);
    for (const quantity of [-5, 0, 'Infinity', 'abc']) assert.equal((await api('/api/items', 'POST', { name: 'Invalid', quantity }, store.token)).status, 400);
    const item = (await api('/api/items', 'POST', { name: 'Concurrent', quantity: 5, unit: '<img src=x onerror=alert(1)>' }, store.token)).body.item;
    assert.equal((await api(`/api/items/${item.id}/purchase`, 'POST', { status: 'INVALID', quantityPurchased: 9999 }, buyer.token)).status, 400);
    assert.equal((await api(`/api/items/${item.id}/purchase`, 'POST', { status: 'partial', quantityPurchased: 9999 }, buyer.token)).status, 400);
    const responses = await Promise.all(['one', 'two'].map(notes => api(`/api/items/${item.id}`, 'PUT', { notes, version: 0 }, store.token)));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    assert.equal((await api('/api/admin/export', 'GET', undefined, admin.token)).status, 200);
  });
  await t.test('direct purchase and full inventory flow preserve API fields', async () => {
    const direct = await api('/api/purchases/direct', 'POST', { name: 'شراء مباشر', quantity: 3, unit: 'قطعة', price: 15000, supplier: 'مورد', paymentMethod: 'cash' }, buyer.token);
    assert.equal(direct.status, 200); assert.equal(direct.body.item.quantityPurchased, 3); assert.equal(direct.body.item.status, 'purchased');
    const id = direct.body.item.id;
    const complete = await api(`/api/items/${id}/confirm`, 'POST', { status: 'completed', receivedQuantity: 3, version: 0 }, store.token);
    assert.equal(complete.status, 200); assert.equal(complete.body.item.confirmedBy.id, store.user.id);
    const edited = await api(`/api/items/${id}`, 'PUT', { price: 16000, version: 1 }, admin.token);
    assert.equal(edited.status, 200); assert.equal(edited.body.item.history.at(-1).action, 'edit');
    assert.equal(edited.body.item.paymentMethod, 'cash'); assert.equal(edited.body.item.quantityPurchased, 3);
    const reorder = await api(`/api/items/${id}/reorder`, 'POST', { version: 2 }, store.token);
    assert.equal(reorder.status, 200); assert.equal(reorder.body.item.quantity, 3); assert.notEqual(reorder.body.item.id, id);
  });
  await t.test('receiving a partial purchase keeps the outstanding requested quantity', async () => {
    const item = (await api('/api/items', 'POST', { name: 'طلب جزئي', quantity: 5 }, store.token)).body.item;
    assert.equal((await api(`/api/items/${item.id}/purchase`, 'POST', { status: 'partial', quantityPurchased: 2, price: 1000, version: 0 }, buyer.token)).status, 200);
    const receipt = await api(`/api/items/${item.id}/confirm`, 'POST', { status: 'completed', receivedQuantity: 2, version: 1 }, store.token);
    assert.equal(receipt.status, 200); assert.equal(receipt.body.item.status, 'unavailable'); assert.equal(receipt.body.item.receivedQuantity, 2);
    const next = await api(`/api/items/${item.id}/reorder`, 'POST', { version: 2 }, store.token);
    assert.equal(next.status, 200); assert.equal(next.body.item.quantity, 3);
  });
  await t.test('changing password, deleting users and logging out revoke sessions', async () => {
    const created = (await api('/api/admin/users', 'POST', { name: 'موظف جديد', username: 'new-user', password: 'Password-2026!', role: 'warehouse' }, admin.token)).body.user;
    const login = (await api('/api/auth/login', 'POST', { username: 'new-user', password: 'Password-2026!' })).body;
    assert.equal((await api(`/api/admin/users/${created.id}`, 'PUT', { password: 'Changed-2026!' }, admin.token)).status, 200);
    assert.equal((await api('/api/items', 'GET', undefined, login.token)).status, 401);
    assert.equal((await api('/api/auth/login', 'POST', { username: 'new-user', password: 'Password-2026!' })).status, 401);
    const changed = (await api('/api/auth/login', 'POST', { username: 'new-user', password: 'Changed-2026!' })).body;
    assert.equal((await api('/api/auth/logout', 'POST', {}, changed.token)).status, 200);
    assert.equal((await api('/api/items', 'GET', undefined, changed.token)).status, 401);
    assert.equal((await api('/api/admin/users/usr_buyer', 'DELETE', {}, admin.token)).status, 200);
    assert.equal((await api('/api/items', 'GET', undefined, buyer.token)).status, 401);
    if (runtime.d1) {
      // Reinitializing the actual SQL store reproduces a new Worker isolate's initialization.
      await createSQLStore(d1Driver(runtime.d1)).initialize();
      assert.equal(await runtime.d1.prepare("SELECT id FROM users WHERE id = 'usr_buyer'").first(), null);
    }
  });
  await t.test('login failure limit is persisted', async () => {
    for (let n = 0; n < 10; n++) assert.equal((await api('/api/auth/login', 'POST', { username: 'rate-limit-fixture', password: 'wrong' })).status, 401);
    assert.equal((await api('/api/auth/login', 'POST', { username: 'rate-limit-fixture', password: 'wrong' })).status, 429);
  });
}
test('Node + JSON integration', async t => {
  const runtime = await nodeRuntime();
  try {
    await scenarios(t, runtime);
    await t.test('Socket.IO refuses unauthenticated clients and logout closes connections', async () => {
      const login = (await runtime.api('/api/auth/login', 'POST', { username: 'admin', password: '123456' })).body;
      async function connect(token) {
        const ws = new WebSocket(runtime.baseUrl.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket');
        const connected = new Promise((resolve, reject) => {
          const timer = setTimeout(() => { ws.close(); reject(new Error('Socket.IO handshake timeout')); }, 5000);
          ws.addEventListener('message', event => {
            const message = String(event.data);
            if (message.startsWith('0')) ws.send('40' + JSON.stringify(token ? { token } : {}));
            else if (message.startsWith('40') || message.startsWith('44')) { clearTimeout(timer); resolve(message); }
            else if (message === '2') ws.send('3');
          });
          ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Socket.IO connection failed')); });
        });
        return { ws, message: await connected };
      }
      const denied = await connect(); assert.ok(denied.message.startsWith('44')); denied.ws.close();
      const accepted = await connect(login.token); assert.ok(accepted.message.startsWith('40'));
      const closed = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Socket stayed open after logout')), 5000); accepted.ws.addEventListener('close', () => { clearTimeout(timer); resolve(); }); });
      await runtime.api('/api/auth/logout', 'POST', {}, login.token);
      await closed;
    });
  } finally { await runtime.close(); }
});
test('Cloudflare Worker + local D1 integration', async t => { const runtime = await workerRuntime(); try { await scenarios(t, runtime); } finally { await runtime.close(); } });

test('local persistence fails explicitly on corruption and write failure', async () => {
  const directory = tempDir();
  try {
    const store = createLocalStore(directory);
    await store.initialize('Fixture-password-2026');
    const repo = createRepository(store);
    const filename = path.join(directory, 'store.json');
    const original = fs.readFileSync(filename, 'utf8');
    fs.writeFileSync(filename, 'CORRUPT');
    await assert.rejects(() => repo.addItem({ name: 'Must not save' }));
    assert.equal(fs.readFileSync(filename, 'utf8'), 'CORRUPT');
    fs.writeFileSync(filename, original);
    fs.mkdirSync(`${filename}.tmp`);
    await assert.rejects(() => repo.addItem({ name: 'Disk failure' }));
    assert.equal((await repo.getAllItems()).length, 0);
  } finally { cleanTemp(directory); }
});
test('sessions expire and their tokens are not stored as plaintext', async () => {
  const directory = tempDir();
  try {
    const store = createLocalStore(directory); await store.initialize('Fixture-password-2026');
    const repo = createRepository(store);
    const user = await repo.getUserById('usr_admin');
    const token = await repo.createSession(user);
    const filename = path.join(directory, 'store.json');
    assert.ok(!fs.readFileSync(filename, 'utf8').includes(token));
    const data = JSON.parse(fs.readFileSync(filename, 'utf8')); data.sessions[0].expiresAt = Date.now() - 1; fs.writeFileSync(filename, JSON.stringify(data));
    assert.equal(await repo.getSessionUser(token), null);
  } finally { cleanTemp(directory); }
});
test('PostgreSQL row mapping and transaction rollback contract', async () => {
  const item = mapItem({ id: 'pg', quantity: '5', price: '8000', quantity_purchased: '2', received_quantity: '1', payment_method: 'debt', purchased_by: { id: 'usr_buyer', name: 'Buyer' }, history: [{ action: 'purchase' }], version: 2 });
  assert.equal(item.paymentMethod, 'debt'); assert.equal(item.quantityPurchased, 2); assert.equal(item.purchasedBy.id, 'usr_buyer'); assert.equal(core.expenses([item]).totalDebt, 8000);
  const calls = [];
  const driver = pgDriver({ async connect() { return { async query(sql) { calls.push(sql); if (sql.startsWith('UPDATE')) throw new Error('fixture failure'); }, release() { calls.push('RELEASE'); } }; } });
  await assert.rejects(() => driver.batch([{ sql: 'UPDATE users SET name = ? WHERE id = ?', values: ['test', 'id'] }]));
  assert.deepEqual(calls, ['BEGIN', 'UPDATE users SET name = $1 WHERE id = $2', 'ROLLBACK', 'RELEASE']);
});
test('CSV formula escaping, dates and totals preserve meaning', () => {
  assert.equal(helpers.csvCell('=1+1'), '"\'=1+1"');
  assert.equal(helpers.csvCell('a,"b"'), '"a,""b"""');
  assert.equal(helpers.csvCell('\t=1'), '"\'\t=1"');
  assert.equal(helpers.quantityTotals([{ unit: 'قطعة', quantity: 5 }, { unit: 'لتر', quantity: 2 }], 'quantity'), '5 قطعة + 2 لتر');
  assert.equal(helpers.absoluteDate('2026-10-14T10:00:00Z'), '2026-10-14 13:00:00 +03:00');
});
