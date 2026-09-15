// Cloudflare Worker API & Backend for Mankhul Shortages System

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id'
    }
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // معالجة طلبات OPTIONS لـ CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id'
        }
      });
    }

    // إذا لم يكن مسار API، قم بتمرير الطلب للملفات الثابتة (Static Assets)
    if (!url.pathname.startsWith('/api')) {
      return env.ASSETS.fetch(request);
    }

    const path = url.pathname;
    const method = request.method;
    const db = env.DB;

    // استخراج هوية المستخدم من الترويسة
    const userId = request.headers.get('x-user-id') || 
                   (request.headers.get('Authorization') ? request.headers.get('Authorization').replace('Bearer ', '') : null);
    let currentUser = null;
    if (userId) {
      currentUser = await db.prepare('SELECT id, name, username, role FROM users WHERE id = ?').bind(userId).first();
    }

    try {
      // 1. تسجيل الدخول
      if (path === '/api/auth/login' && method === 'POST') {
        const body = await request.json();
        const username = (body.username || '').trim().toLowerCase();
        const password = (body.password || '').trim();

        const user = await db.prepare('SELECT id, name, username, role FROM users WHERE LOWER(username) = ? AND password = ?')
                             .bind(username, password)
                             .first();

        if (!user) {
          return jsonResponse({ success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }, 401);
        }

        return jsonResponse({ success: true, user, token: user.id });
      }

      // 2. التحقق من الحساب النشط
      if (path === '/api/auth/me' && method === 'GET') {
        if (!currentUser) return jsonResponse({ success: false, error: 'غير مسجل الدخول' }, 401);
        return jsonResponse({ success: true, user: currentUser });
      }

      // 3. إدارة الموظفين للمدير
      if (path === '/api/admin/users') {
        if (!currentUser || currentUser.role !== 'admin') {
          return jsonResponse({ success: false, error: 'صلاحية مدير فقط' }, 403);
        }

        if (method === 'GET') {
          const { results } = await db.prepare('SELECT id, name, username, role, created_at FROM users ORDER BY created_at ASC').all();
          return jsonResponse({ success: true, users: results });
        }

        if (method === 'POST') {
          const body = await request.json();
          const { name, username, password, role } = body;
          if (!name || !username || !password) return jsonResponse({ success: false, error: 'جميع الحقول مطلوبة' }, 400);
          
          const uname = username.trim().toLowerCase();
          const existing = await db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').bind(uname).first();
          if (existing) return jsonResponse({ success: false, error: 'اسم المستخدم مسجل مسبقاً' }, 400);

          const newId = 'usr_' + generateId();
          await db.prepare('INSERT INTO users (id, name, username, password, role, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))')
                  .bind(newId, name.trim(), uname, password.trim(), role || 'warehouse')
                  .run();

          return jsonResponse({ success: true, user: { id: newId, name: name.trim(), username: uname, role: role || 'warehouse' } });
        }
      }

      // تعديل أو حذف موظف
      if (path.startsWith('/api/admin/users/')) {
        if (!currentUser || currentUser.role !== 'admin') {
          return jsonResponse({ success: false, error: 'صلاحية مدير فقط' }, 403);
        }
        const targetId = path.split('/').pop();

        if (method === 'PUT') {
          const body = await request.json();
          if (body.password) {
            await db.prepare('UPDATE users SET password = ? WHERE id = ?').bind(body.password.trim(), targetId).run();
          }
          if (body.name) {
            await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(body.name.trim(), targetId).run();
          }
          if (body.role) {
            await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, targetId).run();
          }
          return jsonResponse({ success: true });
        }

        if (method === 'DELETE') {
          const userToDelete = await db.prepare('SELECT username FROM users WHERE id = ?').bind(targetId).first();
          if (userToDelete && userToDelete.username === 'admin') {
            return jsonResponse({ success: false, error: 'لا يمكن حذف حساب المدير العام' }, 400);
          }
          await db.prepare('DELETE FROM users WHERE id = ?').bind(targetId).run();
          return jsonResponse({ success: true });
        }
      }

      // 4. جلب جميع المواد
      if (path === '/api/items' && method === 'GET') {
        const { results } = await db.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
        const items = results.map(row => ({
          id: row.id,
          name: row.name,
          quantity: row.quantity,
          unit: row.unit,
          notes: row.notes,
          status: row.status,
          quantityPurchased: row.quantity_purchased,
          missingReason: row.missing_reason,
          inventoryNotes: row.inventory_notes,
          createdBy: row.created_by ? JSON.parse(row.created_by) : null,
          purchasedBy: row.purchased_by ? JSON.parse(row.purchased_by) : null,
          confirmedBy: row.confirmed_by ? JSON.parse(row.confirmed_by) : null,
          createdAt: row.created_at,
          purchasedAt: row.purchased_at,
          completedAt: row.completed_at
        }));
        return jsonResponse({ success: true, items });
      }

      // 5. إضافة نقص جديد
      if (path === '/api/items' && method === 'POST') {
        const body = await request.json();
        const { name, quantity, unit, notes } = body;
        if (!name || !name.trim()) return jsonResponse({ success: false, error: 'اسم المادة مطلوب' }, 400);

        const newId = generateId();
        const createdBy = currentUser ? JSON.stringify({ id: currentUser.id, name: currentUser.name }) : null;
        const now = new Date().toISOString();

        await db.prepare(`
          INSERT INTO items (id, name, quantity, unit, notes, status, quantity_purchased, missing_reason, inventory_notes, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, 'pending', 0, '', '', ?, ?)
        `).bind(newId, name.trim(), Number(quantity) || 1, (unit || 'قطعة').trim(), (notes || '').trim(), createdBy, now).run();

        const newItem = {
          id: newId,
          name: name.trim(),
          quantity: Number(quantity) || 1,
          unit: (unit || 'قطعة').trim(),
          notes: (notes || '').trim(),
          status: 'pending',
          quantityPurchased: 0,
          missingReason: '',
          inventoryNotes: '',
          createdBy: currentUser ? { id: currentUser.id, name: currentUser.name } : null,
          createdAt: now
        };

        return jsonResponse({ success: true, item: newItem });
      }

      // 6. تحديث حالة الشراء
      if (path.match(/^\/api\/items\/[^\/]+\/purchase$/) && method === 'POST') {
        const id = path.split('/')[3];
        const body = await request.json();
        const { status, quantityPurchased, missingReason } = body;
        const purchasedBy = currentUser ? JSON.stringify({ id: currentUser.id, name: currentUser.name }) : null;
        const now = new Date().toISOString();

        await db.prepare(`
          UPDATE items 
          SET status = ?, quantity_purchased = ?, missing_reason = ?, purchased_by = ?, purchased_at = ?
          WHERE id = ?
        `).bind(status, Number(quantityPurchased) || 0, (missingReason || '').trim(), purchasedBy, now, id).run();

        return jsonResponse({ success: true });
      }

      // 7. تأكيد الجرد
      if (path.match(/^\/api\/items\/[^\/]+\/confirm$/) && method === 'POST') {
        const id = path.split('/')[3];
        const body = await request.json();
        const { status, inventoryNotes, receivedQuantity } = body;
        const confirmedBy = currentUser ? JSON.stringify({ id: currentUser.id, name: currentUser.name }) : null;
        const now = new Date().toISOString();

        await db.prepare(`
          UPDATE items 
          SET status = ?, inventory_notes = ?, confirmed_by = ?, completed_at = ?
          WHERE id = ?
        `).bind(status || 'completed', (inventoryNotes || '').trim(), confirmedBy, now, id).run();

        return jsonResponse({ success: true });
      }

      // 8. إعادة الطلب
      if (path.match(/^\/api\/items\/[^\/]+\/reorder$/) && method === 'POST') {
        const id = path.split('/')[3];
        const createdBy = currentUser ? JSON.stringify({ id: currentUser.id, name: currentUser.name }) : null;
        const now = new Date().toISOString();

        await db.prepare(`
          UPDATE items 
          SET status = 'pending', quantity_purchased = 0, missing_reason = '', inventory_notes = '', 
              purchased_at = NULL, completed_at = NULL, created_at = ?, created_by = ?
          WHERE id = ?
        `).bind(now, createdBy, id).run();

        return jsonResponse({ success: true });
      }

      // 9. حذف مادة
      if (path.match(/^\/api\/items\/[^\/]+$/) && method === 'DELETE') {
        const id = path.split('/')[3];
        await db.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
        return jsonResponse({ success: true });
      }

      // 10. إشعار وصول المشتريات
      if (path === '/api/purchases/notify-warehouse' && method === 'POST') {
        return jsonResponse({ success: true });
      }

      // 11. الإحصائيات
      if (path === '/api/stats' && method === 'GET') {
        const { results } = await db.prepare('SELECT status FROM items').all();
        const stats = {
          total: results.length,
          pendingCount: results.filter(r => r.status === 'pending').length,
          purchasedCount: results.filter(r => r.status === 'purchased' || r.status === 'partial').length,
          unavailableCount: results.filter(r => r.status === 'unavailable').length,
          completedCount: results.filter(r => r.status === 'completed').length
        };
        return jsonResponse({ success: true, stats });
      }

      return jsonResponse({ error: 'Endpoint not found' }, 404);

    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }
};
