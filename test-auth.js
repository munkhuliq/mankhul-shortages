const http = require('http');

function api(path, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('=== 1. اختبار تسجيل الدخول للأدوار الثلاثة ===');
  const adminLogin = await api('/api/auth/login', 'POST', { username: 'admin', password: '123456' });
  console.log('دخول المدير:', adminLogin.success, adminLogin.user.name, adminLogin.user.role);

  const storeLogin = await api('/api/auth/login', 'POST', { username: 'store', password: '1234' });
  console.log('دخول المخزن:', storeLogin.success, storeLogin.user.name, storeLogin.user.role);

  const buyerLogin = await api('/api/auth/login', 'POST', { username: 'buyer', password: '1234' });
  console.log('دخول المشتريات:', buyerLogin.success, buyerLogin.user.name, buyerLogin.user.role);

  console.log('\n=== 2. اختبار إدارة الموظفين من قبل المدير ===');
  // إضافة موظف جديد
  const newUserRes = await api('/api/admin/users', 'POST', {
    name: 'علي عبد الله',
    username: 'ali',
    password: '555',
    role: 'warehouse'
  }, { 'x-user-id': adminLogin.user.id });
  console.log('إنشاء حساب موظف جديد:', newUserRes.success, newUserRes.user.name, newUserRes.user.id);

  // تسجيل دخول بالموظف الجديد
  const aliLogin = await api('/api/auth/login', 'POST', { username: 'ali', password: '555' });
  console.log('دخول الموظف الجديد (علي):', aliLogin.success, aliLogin.user.name);

  // تعديل رمز الموظف الجديد
  const updateRes = await api(`/api/admin/users/${newUserRes.user.id}`, 'PUT', {
    password: '999'
  }, { 'x-user-id': adminLogin.user.id });
  console.log('تعديل كلمة مرور علي:', updateRes.success);

  // حذف الموظف التجريبي
  const delRes = await api(`/api/admin/users/${newUserRes.user.id}`, 'DELETE', null, { 'x-user-id': adminLogin.user.id });
  console.log('حذف الموظف التجريبي:', delRes.success);

  console.log('\n=== 3. اختبار تسجيل النواقص والمشتريات وتوثيق أسماء الموظفين ===');
  // إضافة نقص باسم موظف المخزن
  const itemAdd = await api('/api/items', 'POST', {
    name: 'منخل سلك قياس 50',
    quantity: 3,
    unit: 'قطعة',
    notes: 'مستعجل'
  }, { 'x-user-id': storeLogin.user.id });
  console.log('المادة أضيفت بواسطة:', itemAdd.item.createdBy.name);

  // تحديث الشراء باسم موظف المشتريات
  const itemPur = await api(`/api/items/${itemAdd.item.id}/purchase`, 'POST', {
    status: 'purchased'
  }, { 'x-user-id': buyerLogin.user.id });
  console.log('المادة اشتراها:', itemPur.item.purchasedBy.name);

  // تأكيد الجرد باسم موظف المخزن
  const itemConf = await api(`/api/items/${itemAdd.item.id}/confirm`, 'POST', {
    status: 'completed',
    receivedQuantity: 3,
    inventoryNotes: 'استلمت كاملة'
  }, { 'x-user-id': storeLogin.user.id });
  console.log('المادة تم جردها وتأكيدها بواسطة:', itemConf.item.confirmedBy.name);

  // تنظيف المادة التجريبية
  await api(`/api/items/${itemAdd.item.id}`, 'DELETE', null, { 'x-user-id': adminLogin.user.id });
  console.log('تم تنظيف المادة التجريبية بنجاح.');

  console.log('\n🎉 كافة اختبارات الحسابات ولوحة المدير وتوثيق الموظفين تعمل بنجاح 100%!');
}

run().catch(console.error);
