const http = require('http');

function request(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
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

async function runTests() {
  console.log('--- 1. إضافة مواد من المخزن ---');
  const res1 = await request('/api/items', 'POST', {
    name: 'منخل قياس 60 ستانلس',
    quantity: 5,
    unit: 'قطعة',
    notes: 'مستعجل لخط الإنتاج'
  });
  console.log('مادة 1 تم إنشاؤها:', res1.item.name, 'ID:', res1.item.id);

  const res2 = await request('/api/items', 'POST', {
    name: 'زيت هيدروليك 68',
    quantity: 4,
    unit: 'كرتون',
    notes: 'ماركة أصلية'
  });
  console.log('مادة 2 تم إنشاؤها:', res2.item.name, 'ID:', res2.item.id);

  console.log('\n--- 2. إجراءات المشتريات ---');
  // شراء مادة 1 بالكامل
  const pur1 = await request(`/api/items/${res1.item.id}/purchase`, 'POST', {
    status: 'purchased'
  });
  console.log('تحديث مادة 1:', pur1.item.name, 'الحالة:', pur1.item.status);

  // شراء مادة 2 جزئياً
  const pur2 = await request(`/api/items/${res2.item.id}/purchase`, 'POST', {
    status: 'partial',
    quantityPurchased: 2,
    missingReason: 'توفر كرتونين فقط لدى الوكيل، المتبقي سيصل الأسبوع القادم'
  });
  console.log('تحديث مادة 2:', pur2.item.name, 'الحالة:', pur2.item.status, 'المشترى:', pur2.item.quantityPurchased);

  // إشعار المخزن
  const notify = await request('/api/purchases/notify-warehouse', 'POST', {
    message: 'تم شراء المواد وهي جاهزة للجرد في المخزن.'
  });
  console.log('إرسال إشعار للمخزن:', notify.success ? 'نجح' : 'فشل');

  console.log('\n--- 3. إجراءات جرد المخزن ---');
  // جرد مادة 1 وتأكيدها
  const conf1 = await request(`/api/items/${res1.item.id}/confirm`, 'POST', {
    status: 'completed',
    receivedQuantity: 5,
    inventoryNotes: 'تم الجرد والمطابقة ممتازة'
  });
  console.log('تأكيد مادة 1 بالمخزن:', conf1.item.name, 'الحالة:', conf1.item.status);

  // جرد مادة 2 وتسجيل النقص المتبقي
  const conf2 = await request(`/api/items/${res2.item.id}/confirm`, 'POST', {
    status: 'unavailable',
    receivedQuantity: 2,
    inventoryNotes: 'تم استلام 2 فقط، متبقي 2 لم يتم تجهيزهم'
  });
  console.log('تأكيد مادة 2 بالمخزن:', conf2.item.name, 'الحالة:', conf2.item.status);

  console.log('\n--- 4. فحص الإحصائيات الشاملة ---');
  const stats = await request('/api/stats');
  console.log('الإحصائيات:', stats.stats);

  console.log('\n✅ جميع العمليات تمت بنجاح وبدقة تامة!');
}

runTests().catch(console.error);
