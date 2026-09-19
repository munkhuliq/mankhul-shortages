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

function safeJsonParse(val) {
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch (e) {
    return typeof val === 'string' ? { id: '', name: val } : null;
  }
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

    // سد ثغرة 404 لملف socket.io عند العمل على سيرفرليس كلاودفلاير
    if (url.pathname === '/socket.io/socket.io.js') {
      return new Response('window.io = null;', {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
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

      // 4. جلب جميع المواد والإشعارات اللحظية
      if (path === '/api/items' && method === 'GET') {
        const { results } = await db.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
        const items = results.map(row => ({
          id: row.id,
          name: row.name,
          quantity: row.quantity,
          unit: row.unit,
          notes: row.notes,
          status: row.status,
          priority: row.priority || 'normal',
          price: Number(row.price) || 0,
          supplier: row.supplier || '',
          quantityPurchased: row.quantity_purchased,
          receivedQuantity: row.received_quantity || 0,
          missingReason: row.missing_reason,
          inventoryNotes: row.inventory_notes,
          createdBy: safeJsonParse(row.created_by),
          purchasedBy: safeJsonParse(row.purchased_by),
          confirmedBy: safeJsonParse(row.confirmed_by),
          createdAt: row.created_at,
          purchasedAt: row.purchased_at,
          completedAt: row.completed_at
        }));

        // جلب الإشعارات النشطة الحديثة (خلال آخر دقيقتين)
        let notifications = [];
        try {
          const notifRes = await db.prepare(
            "SELECT id, title, body, target_role as \"targetRole\", created_at as \"createdAt\" FROM notifications WHERE created_at >= datetime('now', '-2 minutes') ORDER BY created_at DESC LIMIT 10"
          ).all();
          notifications = notifRes.results || [];
        } catch (e) {
          notifications = [];
        }

        return jsonResponse({ success: true, items, notifications });
      }

      // 5. إضافة نقص جديد
      if (path === '/api/items' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { name, quantity, unit, notes, priority } = body;
        if (!name || !String(name).trim()) return jsonResponse({ success: false, error: 'اسم المادة مطلوب' }, 400);

        const cleanName = String(name).trim();
        const cleanQty = Math.max(0.01, Number(quantity) || 1);
        const cleanUnit = (unit ? String(unit).trim() : 'قطعة') || 'قطعة';
        const cleanNotes = notes ? String(notes).trim() : '';
        const itemPriority = (priority === 'emergency' || priority === 'urgent') ? priority : 'normal';

        const newId = generateId();
        const createdBy = currentUser ? JSON.stringify({ id: currentUser.id, name: currentUser.name }) : null;
        const now = new Date().toISOString();

        await db.prepare(`
          INSERT INTO items (id, name, quantity, unit, notes, status, priority, price, quantity_purchased, received_quantity, missing_reason, inventory_notes, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, 0, 0, '', '', ?, ?)
        `).bind(newId, cleanName, cleanQty, cleanUnit, cleanNotes, itemPriority, createdBy, now).run();

        // إنشاء إشعار لقسم المشتريات
        const actorName = currentUser ? currentUser.name : 'المخزن';
        const notifId = generateId();
        let notifTitle = 'نقص جديد في المخزن! 📦';
        let notifBody = `تم تسجيل نقص: ${cleanName} (${cleanQty} ${cleanUnit}) بواسطة: ${actorName}`;
        if (itemPriority === 'emergency') {
          notifTitle = '🚨 نقص طارئ جداً في المخزن! 🔥';
          notifBody = `⚠️ مادة طارئة متوقف عليها العمل: ${cleanName} (${cleanQty} ${cleanUnit}) بواسطة: ${actorName}`;
        } else if (itemPriority === 'urgent') {
          notifTitle = '⚡ نقص مهم في المخزن!';
          notifBody = `مادة مهمة ومستعجلة: ${cleanName} (${cleanQty} ${cleanUnit}) بواسطة: ${actorName}`;
        }

        await db.prepare(`
          INSERT INTO notifications (id, title, body, target_role, created_at)
          VALUES (?, ?, ?, 'purchasing', datetime('now'))
        `).bind(notifId, notifTitle, notifBody).run().catch(() => {});

        const newItem = {
          id: newId,
          name: cleanName,
          quantity: cleanQty,
          unit: cleanUnit,
          notes: cleanNotes,
          status: 'pending',
          priority: itemPriority,
          price: 0,
          quantityPurchased: 0,
          receivedQuantity: 0,
          missingReason: '',
          inventoryNotes: '',
          createdBy: currentUser ? { id: currentUser.id, name: currentUser.name } : null,
          createdAt: now
        };

        return jsonResponse({ success: true, item: newItem });
      }

      // 6. تحديث حالة الشراء
      if (path.match(/^\/api\/items\/[^\/]+\/purchase$/) && method === 'POST') {
        const id = decodeURIComponent(path.split('/')[3]);
        const body = await request.json().catch(() => ({}));
        const { status, quantityPurchased, missingReason, price, supplier } = body;
        const purchasedBy = currentUser ? JSON.stringify({ id: currentUser.id, name: currentUser.name }) : null;
        const now = new Date().toISOString();
        const itemPrice = (price !== undefined && price !== null && price !== '') ? Math.max(0, Math.round(Number(price))) : null;
        const cleanQtyPurchased = Math.max(0, Number(quantityPurchased) || 0);
        const cleanSupplier = (supplier !== undefined && supplier !== null) ? String(supplier).trim() : null;

        const isRevert = status === 'pending';
        const finalPurchasedBy = isRevert ? null : purchasedBy;
        const finalPurchasedAt = isRevert ? null : now;
        const finalQtyPurchased = isRevert ? 0 : cleanQtyPurchased;

        await db.prepare(`
          UPDATE items 
          SET status = ?, quantity_purchased = ?, missing_reason = ?, price = COALESCE(?, price), supplier = COALESCE(?, supplier), purchased_by = ?, purchased_at = ?
          WHERE id = ?
        `).bind(status, finalQtyPurchased, (missingReason ? String(missingReason).trim() : ''), itemPrice, cleanSupplier, finalPurchasedBy, finalPurchasedAt, id).run();

        // إشعار المخزن بالتحديث
        const itemRow = await db.prepare('SELECT name FROM items WHERE id = ?').bind(id).first();
        const itemName = itemRow ? itemRow.name : 'مادة';
        let statusText = 'تم الشراء';
        if (isRevert) statusText = 'تمت الإعادة لقائمة المطلوب شراؤها';
        else if (status === 'partial') statusText = `تم شراء جزء (${quantityPurchased})`;
        else if (status === 'unavailable') statusText = 'غير متوفرة حالياً';
        const actorName = currentUser ? currentUser.name : 'المشتريات';

        const notifId = generateId();
        await db.prepare(`
          INSERT INTO notifications (id, title, body, target_role, created_at)
          VALUES (?, ?, ?, 'warehouse', datetime('now'))
        `).bind(notifId, isRevert ? 'تعديل حالة المادة 🔄' : 'تحديث المشتريات 🛒', `${itemName}: ${statusText} (بواسطة ${actorName})`).run().catch(() => {});

        return jsonResponse({ success: true });
      }

      // 7. تأكيد الجرد والاستلام
      if (path.match(/^\/api\/items\/[^\/]+\/confirm$/) && method === 'POST') {
        const id = decodeURIComponent(path.split('/')[3]);
        const body = await request.json().catch(() => ({}));
        const { status, inventoryNotes, receivedQuantity } = body;
        const confirmedBy = currentUser ? JSON.stringify({ id: currentUser.id, name: currentUser.name }) : null;
        const now = new Date().toISOString();
        const finalStatus = status || 'completed';
        const completedAt = finalStatus === 'completed' ? now : null;

        await db.prepare(`
          UPDATE items 
          SET status = ?, inventory_notes = ?, received_quantity = ?, confirmed_by = ?, completed_at = ?
          WHERE id = ?
        `).bind(finalStatus, (inventoryNotes || '').trim(), Number(receivedQuantity) || 0, confirmedBy, completedAt, id).run();

        return jsonResponse({ success: true });
      }

      // 8. إعادة الطلب
      if (path.match(/^\/api\/items\/[^\/]+\/reorder$/) && method === 'POST') {
        const id = decodeURIComponent(path.split('/')[3]);
        const createdBy = currentUser ? JSON.stringify({ id: currentUser.id, name: currentUser.name }) : null;
        const now = new Date().toISOString();

        await db.prepare(`
          UPDATE items 
          SET status = 'pending', quantity_purchased = 0, received_quantity = 0, price = 0, missing_reason = '', inventory_notes = '', 
              purchased_by = NULL, purchased_at = NULL, confirmed_by = NULL, completed_at = NULL, 
              created_at = ?, created_by = ?
          WHERE id = ?
        `).bind(now, createdBy, id).run();

        const itemRow = await db.prepare('SELECT name FROM items WHERE id = ?').bind(id).first();
        const itemName = itemRow ? itemRow.name : 'مادة';
        const actorName = currentUser ? currentUser.name : 'المخزن';
        const notifId = generateId();
        await db.prepare(`
          INSERT INTO notifications (id, title, body, target_role, created_at)
          VALUES (?, ?, ?, 'purchasing', datetime('now'))
        `).bind(notifId, 'إعادة طلب مادة! 🔄', `تمت إعادة طلب: ${itemName} بواسطة ${actorName}`).run().catch(() => {});

        return jsonResponse({ success: true });
      }

      // 9. تعديل مادة (الاسم، الكمية، الوحدة، الملاحظة، الأولوية، السعر، المورد)
      if (path.match(/^\/api\/items\/[^\/]+$/) && method === 'PUT') {
        const id = decodeURIComponent(path.split('/')[3]);
        const body = await request.json().catch(() => ({}));
        const { name, quantity, unit, notes, priority, price, supplier } = body;

        const cleanName = (name !== undefined && name !== null) ? String(name).trim() : null;
        const cleanQty = (quantity !== undefined && quantity !== null && quantity !== '') ? Math.max(0.01, Number(quantity) || 1) : null;
        const cleanUnit = (unit !== undefined && unit !== null) ? String(unit).trim() : null;
        const cleanNotes = (notes !== undefined && notes !== null) ? String(notes).trim() : null;
        const cleanPriority = (priority === 'emergency' || priority === 'urgent' || priority === 'normal') ? priority : null;
        const cleanPrice = (price !== undefined && price !== null && price !== '') ? Math.max(0, Math.round(Number(price))) : null;
        const cleanSupplier = (supplier !== undefined && supplier !== null) ? String(supplier).trim() : null;

        await db.prepare(`
          UPDATE items 
          SET name = COALESCE(?, name),
              quantity = COALESCE(?, quantity),
              unit = COALESCE(?, unit),
              notes = COALESCE(?, notes),
              priority = COALESCE(?, priority),
              price = COALESCE(?, price),
              supplier = COALESCE(?, supplier)
          WHERE id = ?
        `).bind(
          cleanName, 
          cleanQty, 
          cleanUnit, 
          cleanNotes, 
          cleanPriority,
          cleanPrice,
          cleanSupplier,
          id
        ).run();

        return jsonResponse({ success: true });
      }

      // 10. حذف مادة
      if (path.match(/^\/api\/items\/[^\/]+$/) && method === 'DELETE') {
        const id = decodeURIComponent(path.split('/')[3]);
        await db.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
        return jsonResponse({ success: true });
      }

      // 11. إشعار وصول المشتريات للمخزن
      if (path === '/api/purchases/notify-warehouse' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const actorName = currentUser ? currentUser.name : 'المشتريات';
        const message = body.message || `تم شراء المواد وتجهيزها بواسطة (${actorName})، يرجى فحصها وجردها بالمخزن.`;
        const notifId = generateId();

        await db.prepare(`
          INSERT INTO notifications (id, title, body, target_role, created_at)
          VALUES (?, ?, ?, 'warehouse', datetime('now'))
        `).bind(notifId, 'وصول مشتريات جديدة! 🚚', message).run();

        return jsonResponse({ success: true });
      }

      // 12. الإحصائيات
      if (path === '/api/stats' && method === 'GET') {
        const { results } = await db.prepare('SELECT status, priority, price FROM items').all();
        const purchasedItems = results.filter(r => r.status === 'purchased' || r.status === 'partial' || r.status === 'completed');
        const totalExpenses = purchasedItems.reduce((sum, r) => sum + Math.max(0, Math.round(Number(r.price) || 0)), 0);
        const stats = {
          total: results.length,
          pendingCount: results.filter(r => r.status === 'pending').length,
          purchasedCount: results.filter(r => r.status === 'purchased' || r.status === 'partial').length,
          unavailableCount: results.filter(r => r.status === 'unavailable').length,
          completedCount: results.filter(r => r.status === 'completed').length,
          emergencyCount: results.filter(r => r.status === 'pending' && r.priority === 'emergency').length,
          totalExpenses
        };
        return jsonResponse({ success: true, stats });
      }

      return jsonResponse({ error: 'Endpoint not found' }, 404);

    } catch (err) {
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }
};
