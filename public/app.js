// ==========================================
// تطبيق نقوصات منخل - الجانب العميل (Mobile Client with Auth & Admin)
// ==========================================

// حالة المستخدم والجلسة
let currentUser = null;
try {
  const saved = localStorage.getItem('mankhul_user');
  if (saved) currentUser = JSON.parse(saved);
} catch (e) {
  currentUser = null;
}

let currentTab = 'warehouse';
let activePurFilter = 'pending';
let activeWhSubTab = 'pending';
let itemsData = [];
let usersData = [];
let soundEnabled = localStorage.getItem('mankhul_sound') !== 'false';
let socket = null;

// مرجع عناصر الواجهة
const elements = {
  // شاشة الدخول
  loginScreen: document.getElementById('login-screen'),
  loginForm: document.getElementById('login-form'),
  loginUsername: document.getElementById('login-username'),
  loginPassword: document.getElementById('login-password'),
  loginError: document.getElementById('login-error'),
  logoutBtn: document.getElementById('logout-btn'),

  // معلومات المستخدم في الهيدر
  userDisplayName: document.getElementById('user-display-name'),
  userRoleBadge: document.getElementById('user-role-badge'),

  // أزرار التبديل
  tabWarehouseBtn: document.getElementById('tab-warehouse-btn'),
  tabPurchasingBtn: document.getElementById('tab-purchasing-btn'),
  tabArchiveBtn: document.getElementById('tab-archive-btn'),
  tabAdminBtn: document.getElementById('tab-admin-btn'),
  mainNavBar: document.getElementById('main-nav-bar'),

  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  themeIcon: document.getElementById('theme-icon'),
  soundToggleBtn: document.getElementById('sound-toggle-btn'),
  soundIcon: document.getElementById('sound-icon'),
  refreshBtn: document.getElementById('refresh-btn'),
  
  // الشاشات
  warehouseView: document.getElementById('warehouse-view'),
  purchasingView: document.getElementById('purchasing-view'),
  archiveView: document.getElementById('archive-view'),
  adminView: document.getElementById('admin-view'),

  // شارات التنبيه
  warehouseBadge: document.getElementById('warehouse-badge'),
  purchasingBadge: document.getElementById('purchasing-badge'),

  // عناصر المخزن
  addItemForm: document.getElementById('add-item-form'),
  itemName: document.getElementById('item-name'),
  itemQuantity: document.getElementById('item-quantity'),
  itemUnit: document.getElementById('item-unit'),
  itemNotes: document.getElementById('item-notes'),
  commonItemsList: document.getElementById('common-items-list'),
  whSubtabPending: document.getElementById('wh-subtab-pending'),
  whSubtabCheck: document.getElementById('wh-subtab-check'),
  whPendingSection: document.getElementById('wh-pending-section'),
  whCheckSection: document.getElementById('wh-check-section'),
  whPendingList: document.getElementById('wh-pending-list'),
  whCheckList: document.getElementById('wh-check-list'),
  whPendingCount: document.getElementById('wh-pending-count'),
  whCheckCount: document.getElementById('wh-check-count'),

  // عناصر المشتريات
  purchasingList: document.getElementById('purchasing-list'),
  purchasingSummaryText: document.getElementById('purchasing-summary-text'),
  notifyWarehouseBtn: document.getElementById('notify-warehouse-btn'),
  whatsappShareBtn: document.getElementById('whatsapp-share-btn'),
  purCountPending: document.getElementById('pur-count-pending'),
  purCountPurchased: document.getElementById('pur-count-purchased'),
  purCountUnavailable: document.getElementById('pur-count-unavailable'),

  // عناصر السجل
  archiveList: document.getElementById('archive-list'),
  archiveSearch: document.getElementById('archive-search'),
  exportExcelBtn: document.getElementById('export-excel-btn'),
  statTotal: document.getElementById('stat-total'),
  statCompleted: document.getElementById('stat-completed'),
  statPending: document.getElementById('stat-pending'),
  statMissing: document.getElementById('stat-missing'),
  statExpenses: document.getElementById('stat-expenses'),

  // عناصر لوحة تحكم المدير
  addUserForm: document.getElementById('add-user-form'),
  newUserName: document.getElementById('new-user-name'),
  newUserUsername: document.getElementById('new-user-username'),
  newUserPassword: document.getElementById('new-user-password'),
  newUserRole: document.getElementById('new-user-role'),
  adminUsersList: document.getElementById('admin-users-list'),
  adminUsersCount: document.getElementById('admin-users-count'),

  // النوافذ المنبثقة
  purchaseModal: document.getElementById('purchase-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalItemInfo: document.getElementById('modal-item-info'),
  modalPartialFields: document.getElementById('modal-partial-fields'),
  modalPurchasedQty: document.getElementById('modal-purchased-qty'),
  modalPurchasedPrice: document.getElementById('modal-purchased-price'),
  modalReasonFields: document.getElementById('modal-reason-fields'),
  modalMissingReason: document.getElementById('modal-missing-reason'),
  modalConfirmBtn: document.getElementById('modal-confirm-btn'),
  modalCancelBtn: document.getElementById('modal-cancel-btn'),
  modalCloseBtn: document.getElementById('modal-close-btn'),

  inventoryModal: document.getElementById('inventory-modal'),
  invModalItemInfo: document.getElementById('inv-modal-item-info'),
  invModalReceivedQty: document.getElementById('inv-modal-received-qty'),
  invModalNotes: document.getElementById('inv-modal-notes'),
  invModalCompleteBtn: document.getElementById('inv-modal-complete-btn'),
  invModalUnsuppliedBtn: document.getElementById('inv-modal-unsupplied-btn'),
  invModalCloseBtn: document.getElementById('inv-modal-close-btn'),

  toastContainer: document.getElementById('toast-container')
};

// متغيرات النوافذ المؤقتة
let currentModalAction = null;
let currentModalItem = null;

// ==========================================
// دوال الطلبات مع الترويسة الأمنية للمستخدم
// ==========================================
function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (currentUser && currentUser.id) {
    headers['x-user-id'] = currentUser.id;
  }
  return headers;
}

// ==========================================
// إدارة تسجيل الدخول والخروج
// ==========================================
window.quickFillLogin = function(u, p) {
  elements.loginUsername.value = u;
  elements.loginPassword.value = p;
  elements.loginError.classList.add('hidden');
};

elements.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = elements.loginUsername.value.trim();
  const password = elements.loginPassword.value.trim();
  elements.loginError.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success && data.user) {
      currentUser = data.user;
      localStorage.setItem('mankhul_user', JSON.stringify(currentUser));
      elements.loginScreen.classList.add('hidden');
      applyUserRole();
      fetchItems();
      if (currentUser.role === 'admin') {
        fetchAdminUsers();
      }
      showToast(`مرحباً ${currentUser.name}`, 'تم تسجيل الدخول بنجاح', '👋', 'emerald');
    } else {
      elements.loginError.textContent = data.error || 'فشل تسجيل الدخول';
      elements.loginError.classList.remove('hidden');
    }
  } catch (err) {
    elements.loginError.textContent = 'تعذر الاتصال بالخادم';
    elements.loginError.classList.remove('hidden');
  }
});

elements.logoutBtn.addEventListener('click', () => {
  if (!confirm('هل تريد بالتأكيد تسجيل الخروج؟')) return;
  currentUser = null;
  localStorage.removeItem('mankhul_user');
  elements.loginUsername.value = '';
  elements.loginPassword.value = '';
  elements.loginScreen.classList.remove('hidden');
});

// تطبيق صلاحيات المستخدم النشط
function applyUserRole() {
  if (!currentUser) {
    elements.loginScreen.classList.remove('hidden');
    return;
  }

  elements.loginScreen.classList.add('hidden');
  elements.userDisplayName.textContent = currentUser.name;

  const roleLabels = {
    admin: 'مدير عام 👔',
    warehouse: 'موظف المخزن 🏬',
    purchasing: 'موظف المشتريات 🛒'
  };
  const roleBadges = {
    admin: 'bg-purple-600',
    warehouse: 'bg-emerald-600',
    purchasing: 'bg-blue-600'
  };

  elements.userRoleBadge.textContent = roleLabels[currentUser.role] || 'موظف';
  elements.userRoleBadge.className = `px-2 py-0.5 rounded text-[10px] text-white font-bold ${roleBadges[currentUser.role] || 'bg-slate-700'}`;

  // تعديل شريط التنقل حسب الدور
  if (currentUser.role === 'admin') {
    // المدير يرى كل شيء: المخزن، المشتريات، السجل، والموظفين
    elements.mainNavBar.className = 'grid grid-cols-4 gap-1 bg-slate-800/90 p-1 rounded-xl text-xs font-bold text-center';
    elements.tabWarehouseBtn.classList.remove('hidden');
    elements.tabPurchasingBtn.classList.remove('hidden');
    elements.tabArchiveBtn.classList.remove('hidden');
    elements.tabAdminBtn.classList.remove('hidden');
    switchTab('warehouse');
  } else if (currentUser.role === 'warehouse') {
    // موظف المخزن يرى المخزن والسجل فقط
    elements.mainNavBar.className = 'grid grid-cols-2 gap-1 bg-slate-800/90 p-1 rounded-xl text-xs font-bold text-center';
    elements.tabWarehouseBtn.classList.remove('hidden');
    elements.tabPurchasingBtn.classList.add('hidden');
    elements.tabArchiveBtn.classList.remove('hidden');
    elements.tabAdminBtn.classList.add('hidden');
    switchTab('warehouse');
  } else if (currentUser.role === 'purchasing') {
    // موظف المشتريات يرى المشتريات والسجل فقط
    elements.mainNavBar.className = 'grid grid-cols-2 gap-1 bg-slate-800/90 p-1 rounded-xl text-xs font-bold text-center';
    elements.tabWarehouseBtn.classList.add('hidden');
    elements.tabPurchasingBtn.classList.remove('hidden');
    elements.tabArchiveBtn.classList.remove('hidden');
    elements.tabAdminBtn.classList.add('hidden');
    switchTab('purchasing');
  }
}

// ==========================================
// التبديل بين التبويبات
// ==========================================
function switchTab(tab) {
  currentTab = tab;

  // إخفاء كافة الشاشات
  elements.warehouseView.classList.add('hidden');
  elements.purchasingView.classList.add('hidden');
  elements.archiveView.classList.add('hidden');
  elements.adminView.classList.add('hidden');

  // إعادة ضبط التنسيق
  [elements.tabWarehouseBtn, elements.tabPurchasingBtn, elements.tabArchiveBtn, elements.tabAdminBtn].forEach(btn => {
    btn.className = 'py-2 px-1 rounded-lg transition-all flex items-center justify-center gap-1 text-slate-300 hover:text-white';
  });

  if (tab === 'warehouse') {
    elements.warehouseView.classList.remove('hidden');
    elements.tabWarehouseBtn.className = 'py-2 px-1 rounded-lg transition-all flex items-center justify-center gap-1 bg-emerald-600 text-white shadow font-bold';
  } else if (tab === 'purchasing') {
    elements.purchasingView.classList.remove('hidden');
    elements.tabPurchasingBtn.className = 'py-2 px-1 rounded-lg transition-all flex items-center justify-center gap-1 bg-blue-600 text-white shadow font-bold';
  } else if (tab === 'archive') {
    elements.archiveView.classList.remove('hidden');
    elements.tabArchiveBtn.className = 'py-2 px-1 rounded-lg transition-all flex items-center justify-center gap-1 bg-slate-700 text-white shadow font-bold';
  } else if (tab === 'admin') {
    elements.adminView.classList.remove('hidden');
    elements.tabAdminBtn.className = 'py-2 px-1 rounded-lg transition-all flex items-center justify-center gap-1 bg-purple-600 text-white shadow font-bold';
    fetchAdminUsers();
  }

  renderAll();
}

// ==========================================
// تشغيل الصوت (Web Audio API مع دعم iOS Safari والشاشات الذكية)
// ==========================================
let globalAudioCtx = null;
function getAudioContext() {
  try {
    if (!globalAudioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) globalAudioCtx = new AudioCtx();
    }
    if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume().catch(() => {});
    }
    return globalAudioCtx;
  } catch (e) {
    return null;
  }
}

// تفعيل سياق الصوت بمجرد أول لمسة للمستخدم
document.addEventListener('touchstart', () => getAudioContext(), { passive: true });
document.addEventListener('click', () => getAudioContext(), { passive: true });

function playNotificationSound(type = 'chime') {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (type === 'chime') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      osc2.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.45);
      osc2.stop(ctx.currentTime + 0.45);
    } else if (type === 'alert') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    }
  } catch (e) {
    console.warn('Audio playback error:', e);
  }
}

// عرض تنبيه منبثق (Toast)
function showToast(title, message, icon = '🔔', color = 'emerald') {
  try {
    const toast = document.createElement('div');
    const bgColors = {
      emerald: 'bg-emerald-600',
      blue: 'bg-blue-600',
      purple: 'bg-purple-600',
      amber: 'bg-amber-600',
      rose: 'bg-rose-600',
      slate: 'bg-slate-800'
    };
    const bg = bgColors[color] || 'bg-slate-800';

    toast.className = `toast-anim ${bg} text-white px-4 py-3 rounded-2xl shadow-xl flex items-start gap-3 border border-white/20 pointer-events-auto`;
    toast.innerHTML = `
      <span class="text-xl">${icon}</span>
      <div class="flex-1">
        <h4 class="font-bold text-xs">${title}</h4>
        <p class="text-[11px] text-white/90 mt-0.5">${message}</p>
      </div>
      <button class="text-white/60 hover:text-white text-xs font-bold" onclick="this.parentElement.remove()">✕</button>
    `;

    const container = elements.toastContainer || document.getElementById('toast-container') || document.body;
    if (container) {
      container.appendChild(toast);
    }

    setTimeout(() => {
      try {
        if (toast.parentElement) {
          toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
          setTimeout(() => {
            try { toast.remove(); } catch (e) {}
          }, 300);
        }
      } catch (e) {}
    }, 4500);

    // التحقق الآمن من دعم وتصريح إشعارات النظام بالهواتف والمتصفحات
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && window.Notification && window.Notification.permission === 'granted') {
        new window.Notification(title, { body: message });
      }
    } catch (nErr) {
      // تجاهل أخطاء الهواتف (مثل أندرويد كروم التي تشترط Service Worker)
    }
  } catch (err) {
    console.warn('showToast error handled gracefully:', err);
  }
}

// ==========================================
// جلب البيانات والإشعارات السحابية
// ==========================================
const seenNotificationIds = new Set();
let hasLoadedInitialNotifs = false;

function handleIncomingNotifications(notifications) {
  if (!Array.isArray(notifications) || !currentUser) return;
  for (const n of notifications) {
    if (!seenNotificationIds.has(n.id)) {
      seenNotificationIds.add(n.id);
      if (hasLoadedInitialNotifs) {
        if (currentUser.role === n.targetRole || currentUser.role === 'admin') {
          playNotificationSound(n.targetRole === 'warehouse' ? 'alert' : 'chime');
          showToast(n.title, n.body, n.targetRole === 'warehouse' ? '🚚' : '📦', n.targetRole === 'warehouse' ? 'amber' : 'blue');
        }
      }
    }
  }
  hasLoadedInitialNotifs = true;
}

async function fetchItems() {
  try {
    const res = await fetch('/api/items', { headers: authHeaders() });
    const data = await res.json();
    if (data.success) {
      itemsData = data.items || [];
      handleIncomingNotifications(data.notifications);
      renderAll();
    }
  } catch (err) {
    console.error('Error fetching items:', err);
  }
}

// جلب المستخدمين (للمدير)
async function fetchAdminUsers() {
  if (!currentUser || currentUser.role !== 'admin') return;
  try {
    const res = await fetch('/api/admin/users', { headers: authHeaders() });
    const data = await res.json();
    if (data.success) {
      usersData = data.users || [];
      renderAdminUsers();
    }
  } catch (err) {
    console.error('Error fetching users:', err);
  }
}

// ==========================================
// رسم وتحديث الواجهات (Rendering)
// ==========================================
function renderAll() {
  updateBadges();
  renderWarehouse();
  renderPurchasing();
  renderArchive();
}

function formatPrice(num) {
  if (!num || Number(num) <= 0) return '';
  return Number(num).toLocaleString('en-US') + ' د.ع';
}

function getPriorityBadge(priority) {
  if (priority === 'emergency') {
    return '<span class="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center gap-1 shadow-sm animate-pulse">🚨 طارئ متوقف العمل 🔥</span>';
  }
  if (priority === 'urgent') {
    return '<span class="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm">⚡ مهم ومستعجل</span>';
  }
  return '';
}

function sortItemsByPriority(items) {
  const score = { emergency: 3, urgent: 2, normal: 1 };
  return [...items].sort((a, b) => {
    if (a.status === 'pending' && b.status === 'pending') {
      const scoreA = score[a.priority] || 1;
      const scoreB = score[b.priority] || 1;
      if (scoreA !== scoreB) return scoreB - scoreA;
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function updateBadges() {
  const pendingForPur = itemsData.filter(i => i.status === 'pending').length;
  const readyForWhCheck = itemsData.filter(i => i.status === 'purchased' || i.status === 'partial').length;
  const unavailable = itemsData.filter(i => i.status === 'unavailable').length;
  const completed = itemsData.filter(i => i.status === 'completed').length;

  if (pendingForPur > 0) {
    elements.purchasingBadge.textContent = pendingForPur;
    elements.purchasingBadge.classList.remove('hidden');
  } else {
    elements.purchasingBadge.classList.add('hidden');
  }

  if (readyForWhCheck > 0) {
    elements.warehouseBadge.textContent = readyForWhCheck;
    elements.warehouseBadge.classList.remove('hidden');
  } else {
    elements.warehouseBadge.classList.add('hidden');
  }

  elements.whPendingCount.textContent = pendingForPur;
  elements.whCheckCount.textContent = readyForWhCheck;

  elements.purCountPending.textContent = pendingForPur;
  elements.purCountPurchased.textContent = readyForWhCheck;
  elements.purCountUnavailable.textContent = unavailable;
  elements.purchasingSummaryText.textContent = pendingForPur > 0 
    ? `لديك ${pendingForPur} مادة مطلوبة للشراء الآن`
    : `جميع المواد المطلوبة تم التعامل معها 🎉`;

  elements.statTotal.textContent = itemsData.length;
  elements.statCompleted.textContent = completed;
  elements.statPending.textContent = pendingForPur + readyForWhCheck;
  elements.statMissing.textContent = unavailable;

  const totalExpenses = itemsData.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  if (elements.statExpenses) {
    elements.statExpenses.textContent = totalExpenses > 0 ? Number(totalExpenses).toLocaleString('en-US') + ' د.ع' : '0 د.ع';
  }
}

// 1. شاشة المخزن
function renderWarehouse() {
  const pendingItems = sortItemsByPriority(itemsData.filter(i => i.status === 'pending'));
  if (pendingItems.length === 0) {
    elements.whPendingList.innerHTML = `
      <div class="text-center py-8 bg-white rounded-2xl border border-slate-200 text-slate-400">
        <span class="text-3xl block mb-1">✨</span>
        <p class="text-xs font-semibold">لا توجد مواد ناقصة مسجلة حالياً</p>
      </div>
    `;
  } else {
    elements.whPendingList.innerHTML = pendingItems.map(item => `
      <div class="touch-card bg-white p-3.5 rounded-2xl ${item.priority === 'emergency' ? 'emergency-card border-rose-500 bg-rose-50/20' : 'border border-slate-200'} shadow-sm flex items-center justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-1.5">
            <h3 class="text-sm font-bold text-slate-900 truncate">${escapeHtml(item.name)}</h3>
            ${getPriorityBadge(item.priority)}
            <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">بانتظار الشراء</span>
          </div>
          <div class="flex items-center gap-2 mt-1 text-xs text-slate-600">
            <span class="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
              الكمية: ${item.quantity} ${item.unit}
            </span>
            ${item.notes ? `<span class="text-slate-400 truncate">📝 ${escapeHtml(item.notes)}</span>` : ''}
          </div>
          <div class="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
            <span>🕒 ${formatTime(item.createdAt)}</span>
            ${item.createdBy ? `<span class="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded">👤 ${escapeHtml(item.createdBy.name)}</span>` : ''}
          </div>
        </div>
        ${currentUser && (currentUser.role === 'warehouse' || currentUser.role === 'admin') ? `
          <button onclick="deleteItem('${item.id}')" class="p-2 text-slate-300 hover:text-rose-500 rounded-lg text-sm" title="حذف">
            🗑️
          </button>
        ` : ''}
      </div>
    `).join('');
  }

  const checkItems = itemsData.filter(i => i.status === 'purchased' || i.status === 'partial');
  if (checkItems.length === 0) {
    elements.whCheckList.innerHTML = `
      <div class="text-center py-8 bg-white rounded-2xl border border-slate-200 text-slate-400">
        <span class="text-3xl block mb-1">📦</span>
        <p class="text-xs font-semibold">لا توجد مشتريات بانتظار الجرد حالياً</p>
      </div>
    `;
  } else {
    elements.whCheckList.innerHTML = checkItems.map(item => `
      <div class="touch-card bg-white p-3.5 rounded-2xl border-2 border-emerald-500/40 shadow-sm space-y-2">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-1.5">
              <h3 class="text-sm font-bold text-slate-900">${escapeHtml(item.name)}</h3>
              ${getPriorityBadge(item.priority)}
            </div>
            <p class="text-xs text-slate-500 mt-0.5">
              المطلوب: <span class="font-bold">${item.quantity} ${item.unit}</span> | 
              المشترى: <span class="font-bold text-emerald-600">${item.quantityPurchased || item.quantity} ${item.unit}</span>
              ${item.price ? ` | <span class="text-purple-700 font-bold">💰 ${formatPrice(item.price)}</span>` : ''}
            </p>
            ${item.purchasedBy ? `<p class="text-[10px] text-blue-700 font-semibold mt-0.5">🛒 اشتراها: ${escapeHtml(item.purchasedBy.name)}</p>` : ''}
            ${item.missingReason ? `<p class="text-[11px] text-amber-700 bg-amber-50 p-1.5 rounded-lg mt-1">ملاحظة الشراء: ${escapeHtml(item.missingReason)}</p>` : ''}
          </div>
          <span class="px-2 py-0.5 rounded-full ${item.status === 'purchased' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'} text-[10px] font-bold">
            ${item.status === 'purchased' ? 'تم الشراء' : 'شراء جزئي'}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
          <button onclick="confirmInventoryFast('${item.id}')" 
                  class="py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow flex items-center justify-center gap-1">
            <span>✅ تأكيد الاستلام بالكامل</span>
          </button>
          <button onclick="openInventoryModal('${item.id}')" 
                  class="py-2 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1">
            <span>⚠️ جرد / نقص جزئي</span>
          </button>
        </div>
      </div>
    `).join('');
  }
}

// 2. شاشة المشتريات
function renderPurchasing() {
  let filtered = sortItemsByPriority(itemsData);
  if (activePurFilter === 'pending') {
    filtered = filtered.filter(i => i.status === 'pending');
  } else if (activePurFilter === 'purchased') {
    filtered = filtered.filter(i => i.status === 'purchased' || i.status === 'partial');
  } else if (activePurFilter === 'unavailable') {
    filtered = filtered.filter(i => i.status === 'unavailable');
  }

  if (filtered.length === 0) {
    elements.purchasingList.innerHTML = `
      <div class="text-center py-10 bg-white rounded-2xl border border-slate-200 text-slate-400">
        <span class="text-4xl block mb-2">🎉</span>
        <p class="text-xs font-semibold">لا توجد مواد في هذه القائمة</p>
      </div>
    `;
    return;
  }

  elements.purchasingList.innerHTML = filtered.map(item => {
    let statusBadge = '';
    if (item.status === 'pending') statusBadge = '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">مطلوبة للشراء</span>';
    if (item.status === 'purchased') statusBadge = '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">تم الشراء</span>';
    if (item.status === 'partial') statusBadge = `<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">شراء جزئي (${item.quantityPurchased})</span>`;
    if (item.status === 'unavailable') statusBadge = '<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">غير متوفرة</span>';
    if (item.status === 'completed') statusBadge = '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">مستلمة بالمخزن</span>';

    return `
      <div class="touch-card bg-white p-3.5 rounded-2xl ${item.priority === 'emergency' && item.status === 'pending' ? 'emergency-card border-rose-500 bg-rose-50/20' : 'border border-slate-200'} shadow-sm space-y-2.5">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <h3 class="text-sm font-bold text-slate-900">${escapeHtml(item.name)}</h3>
              ${getPriorityBadge(item.priority)}
            </div>
            <div class="flex flex-wrap items-center gap-2 mt-1 text-xs">
              <span class="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                الكمية: ${item.quantity} ${item.unit}
              </span>
              ${item.price ? `<span class="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">💰 ${formatPrice(item.price)}</span>` : ''}
              ${item.notes ? `<span class="text-slate-500 truncate">📝 ${escapeHtml(item.notes)}</span>` : ''}
            </div>
            <div class="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
              ${item.createdBy ? `<span class="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-semibold">طلبها: ${escapeHtml(item.createdBy.name)}</span>` : ''}
              ${item.purchasedBy ? `<span class="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-semibold">المشتري: ${escapeHtml(item.purchasedBy.name)}</span>` : ''}
            </div>
            ${item.missingReason ? `<p class="text-[11px] text-rose-600 bg-rose-50 px-2 py-1 rounded mt-1 font-semibold">ملاحظة: ${escapeHtml(item.missingReason)}</p>` : ''}
          </div>
          <div>${statusBadge}</div>
        </div>

        ${item.status === 'pending' || item.status === 'unavailable' ? `
          <div class="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-100">
            <button onclick="markPurchasedFast('${item.id}')" 
                    class="py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow flex items-center justify-center gap-1 active:scale-95">
              <span>✅ تم الشراء</span>
            </button>
            <button onclick="openPurchaseModal('${item.id}', 'partial')" 
                    class="py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow flex items-center justify-center gap-1 active:scale-95">
              <span>⚠️ شراء جزء</span>
            </button>
            <button onclick="openPurchaseModal('${item.id}', 'unavailable')" 
                    class="py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1 active:scale-95">
              <span>❌ غير متوفر</span>
            </button>
          </div>
        ` : `
          <div class="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
            <span>تم في: ${formatTime(item.purchasedAt || item.createdAt)}</span>
            <button onclick="revertToPending('${item.id}')" class="text-blue-600 hover:underline font-bold text-[11px]">
              تعديل الحالة 🔄
            </button>
          </div>
        `}
      </div>
    `;
  }).join('');
}

// 3. شاشة السجل والأرشيف
function renderArchive() {
  const searchTerm = (elements.archiveSearch.value || '').trim().toLowerCase();
  let filtered = itemsData;
  if (searchTerm) {
    filtered = itemsData.filter(i => 
      i.name.toLowerCase().includes(searchTerm) || 
      (i.notes && i.notes.toLowerCase().includes(searchTerm)) ||
      (i.missingReason && i.missingReason.toLowerCase().includes(searchTerm))
    );
  }

  if (filtered.length === 0) {
    elements.archiveList.innerHTML = `
      <div class="text-center py-8 bg-white rounded-2xl border border-slate-200 text-slate-400">
        <p class="text-xs font-semibold">لا توجد سجلات مطابقة للبحث</p>
      </div>
    `;
    return;
  }

  elements.archiveList.innerHTML = filtered.map(item => {
    let statusLabel = '';
    let statusColor = '';
    if (item.status === 'completed') {
      statusLabel = 'مكتمل ومستلم بالمخزن ✅';
      statusColor = 'bg-emerald-100 text-emerald-800';
    } else if (item.status === 'unavailable') {
      statusLabel = 'غير متوفر / نقص لم يجهز ❌';
      statusColor = 'bg-rose-100 text-rose-800';
    } else if (item.status === 'partial') {
      statusLabel = 'تم شراء جزء ⚠️';
      statusColor = 'bg-blue-100 text-blue-800';
    } else if (item.status === 'purchased') {
      statusLabel = 'تم الشراء بانتظار الجرد 🛒';
      statusColor = 'bg-amber-100 text-amber-800';
    } else {
      statusLabel = 'بانتظار الشراء ⏳';
      statusColor = 'bg-slate-100 text-slate-700';
    }

    return `
      <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1.5 text-xs">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-1.5">
              <h4 class="font-bold text-slate-900">${escapeHtml(item.name)}</h4>
              ${getPriorityBadge(item.priority)}
            </div>
            <p class="text-slate-500 text-[11px] mt-0.5">
              المطلوب: <b>${item.quantity} ${item.unit}</b>
              ${item.quantityPurchased ? ` | المشترى: <b>${item.quantityPurchased}</b>` : ''}
              ${item.receivedQuantity ? ` | المستلم: <b>${item.receivedQuantity}</b>` : ''}
              ${item.price ? ` | السعر: <b class="text-purple-700 font-bold">${formatPrice(item.price)}</b>` : ''}
            </p>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor}">${statusLabel}</span>
        </div>

        <div class="flex flex-wrap gap-2 text-[10px] text-slate-500 bg-slate-50 p-1.5 rounded-lg">
          ${item.createdBy ? `<span>📝 الطلب: <b>${escapeHtml(item.createdBy.name)}</b></span>` : ''}
          ${item.purchasedBy ? `<span>🛒 الشراء: <b>${escapeHtml(item.purchasedBy.name)}</b></span>` : ''}
          ${item.confirmedBy ? `<span>📦 الجرد: <b>${escapeHtml(item.confirmedBy.name)}</b></span>` : ''}
        </div>

        ${item.missingReason ? `<p class="text-rose-600 bg-rose-50 p-1.5 rounded-lg text-[11px]">ملاحظة النقص: ${escapeHtml(item.missingReason)}</p>` : ''}
        ${item.inventoryNotes ? `<p class="text-indigo-600 bg-indigo-50 p-1.5 rounded-lg text-[11px]">ملاحظة المخزن: ${escapeHtml(item.inventoryNotes)}</p>` : ''}

        <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
          <span>${formatTime(item.completedAt || item.purchasedAt || item.createdAt)}</span>
          <div class="flex gap-2">
            ${item.status === 'unavailable' || item.status === 'partial' || item.status === 'completed' ? `
              <button onclick="reorderItem('${item.id}')" class="text-emerald-700 hover:underline font-bold">
                طلب مرة أخرى 🔄
              </button>
            ` : ''}
            ${currentUser && currentUser.role === 'admin' ? `
              <button onclick="deleteItem('${item.id}')" class="text-rose-400 hover:text-rose-600">
                حذف 🗑️
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 4. شاشة لوحة تحكم المدير (الموظفين)
function renderAdminUsers() {
  elements.adminUsersCount.textContent = usersData.length;
  if (usersData.length === 0) {
    elements.adminUsersList.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">لا يوجد موظفين</p>`;
    return;
  }

  const roleTitles = {
    admin: 'مدير عام 👔',
    warehouse: 'موظف مخزن 🏬',
    purchasing: 'موظف مشتريات 🛒'
  };

  elements.adminUsersList.innerHTML = usersData.map(u => `
    <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-2">
      <div>
        <div class="flex items-center gap-1.5">
          <h4 class="font-bold text-xs text-slate-900">${escapeHtml(u.name)}</h4>
          <span class="text-[10px] px-1.5 py-0.2 rounded font-semibold ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : (u.role === 'warehouse' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800')}">
            ${roleTitles[u.role] || u.role}
          </span>
        </div>
        <p class="text-[11px] text-slate-400 font-mono mt-0.5">اسم الدخول: <span class="font-bold text-slate-600">${escapeHtml(u.username)}</span></p>
      </div>
      <div class="flex items-center gap-1">
        <button onclick="changeUserPassword('${u.id}', '${escapeHtml(u.name)}')" class="p-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold" title="تغيير كلمة المرور">
          🔑 رمز
        </button>
        ${u.username !== 'admin' ? `
          <button onclick="deleteUser('${u.id}', '${escapeHtml(u.name)}')" class="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-xs" title="حذف">
            🗑️
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

// ==========================================
// إجراءات المدير على الموظفين
// ==========================================
elements.addUserForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = elements.newUserName.value.trim();
  const username = elements.newUserUsername.value.trim();
  const password = elements.newUserPassword.value.trim();
  const role = elements.newUserRole.value;

  if (!name || !username || !password) return;

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, username, password, role })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      elements.newUserName.value = '';
      elements.newUserUsername.value = '';
      elements.newUserPassword.value = '1234';
      showToast('تمت الإضافة', `تم إنشاء حساب للموظف ${name}`, '👤', 'purple');
      try { await fetchAdminUsers(); } catch (e) {}
    } else {
      showToast('تعذر الإضافة', data.error || 'فشل إنشاء الحساب', '⚠️', 'rose');
    }
  } catch (err) {
    console.error('Add user error:', err);
    showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم لإنشاء الحساب', '⚠️', 'rose');
  }
});

async function changeUserPassword(id, name) {
  const newPass = prompt(`أدخل كلمة المرور / الرمز الجديد للموظف (${name}):`, '1234');
  if (!newPass || !newPass.trim()) return;

  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ password: newPass.trim() })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      showToast('تم التعديل', `تم تغيير كلمة مرور ${name} بنجاح`, '🔑', 'purple');
    } else {
      showToast('تعذر التعديل', data.error || 'تعذر تعديل كلمة المرور', '⚠️', 'rose');
    }
  } catch (e) {
    console.error('Change password error:', e);
    showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم لتعديل كلمة المرور', '⚠️', 'rose');
  }
}

async function deleteUser(id, name) {
  if (!confirm(`هل أنت متأكد من حذف حساب الموظف (${name})؟ لن يتمكن من الدخول للنظام بعد ذلك.`)) return;
  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      showToast('تم الحذف', `تم حذف حساب ${name}`, '🗑️', 'slate');
      try { await fetchAdminUsers(); } catch (e) {}
    } else {
      showToast('تعذر الحذف', data.error || 'تعذر حذف الموظف من الخادم', '⚠️', 'rose');
    }
  } catch (e) {
    console.error('Delete user error:', e);
    showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم لحذف الموظف', '⚠️', 'rose');
  }
}

// ==========================================
// الإجراءات على المواد والنقوصات
// ==========================================
elements.addItemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = elements.itemName.value.trim();
  const quantity = parseFloat(elements.itemQuantity.value) || 1;
  const unit = elements.itemUnit.value;
  const notes = elements.itemNotes.value.trim();
  const priorityEl = document.querySelector('input[name="item-priority"]:checked');
  const priority = priorityEl ? priorityEl.value : 'normal';

  if (!name) return;

  try {
    const res = await fetch('/api/items', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, quantity, unit, notes, priority })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      elements.itemName.value = '';
      elements.itemNotes.value = '';
      elements.itemQuantity.value = 1;
      const normalRadio = document.querySelector('input[name="item-priority"][value="normal"]');
      if (normalRadio) normalRadio.checked = true;

      // إضافة المادة تلقائياً لقائمة الاقتراحات السريعة
      if (elements.commonItemsList && ![...elements.commonItemsList.options].some(o => o.value === name)) {
        const opt = document.createElement('option');
        opt.value = name;
        elements.commonItemsList.appendChild(opt);
      }

      elements.itemName.focus();
      showToast('تم الإرسال بنجاح', `تم إرسال ${name} للمشتريات فوراً`, '🚀', 'emerald');
      try { await fetchItems(); } catch (e) {}
    } else {
      showToast('تعذر الإرسال', data.error || 'فشل إرسال المادة للخادم', '⚠️', 'rose');
    }
  } catch (err) {
    console.error('Add item error:', err);
    showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم لإرسال المادة', '⚠️', 'rose');
  }
});

async function markPurchasedFast(id) {
  try {
    const res = await fetch(`/api/items/${id}/purchase`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'purchased' })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      showToast('تم تسجيل الشراء', 'تم حفظ المادة كـ مشتراة بنجاح', '✅', 'emerald');
      try { await fetchItems(); } catch (e) {}
    } else {
      showToast('تعذر التحديث', data.error || 'فشل تسجيل الشراء في الخادم', '⚠️', 'rose');
    }
  } catch (err) {
    console.error('Mark purchased fast error:', err);
    showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم لتسجيل الشراء', '⚠️', 'rose');
  }
}

function openPurchaseModal(id, action) {
  const item = itemsData.find(i => i.id === id);
  if (!item) return;

  currentModalItem = item;
  currentModalAction = action;

  elements.modalItemInfo.innerHTML = `
    <p class="font-bold">${escapeHtml(item.name)}</p>
    <p class="text-slate-500">الكمية المطلوبة: ${item.quantity} ${item.unit}</p>
  `;

  if (elements.modalPurchasedPrice) {
    elements.modalPurchasedPrice.value = item.price || '';
  }

  const priceFields = document.getElementById('modal-price-fields');

  if (action === 'partial') {
    elements.modalTitle.textContent = 'تسجيل شراء جزء من الكمية';
    elements.modalPartialFields.classList.remove('hidden');
    elements.modalReasonFields.classList.add('hidden');
    if (priceFields) priceFields.classList.remove('hidden');
    elements.modalPurchasedQty.value = Math.max(1, Math.floor(item.quantity / 2));
  } else if (action === 'unavailable') {
    elements.modalTitle.textContent = 'تسجيل مادة غير متوفرة / لم تجهز';
    elements.modalPartialFields.classList.add('hidden');
    elements.modalReasonFields.classList.remove('hidden');
    if (priceFields) priceFields.classList.add('hidden');
    elements.modalMissingReason.value = '';
  }

  elements.purchaseModal.classList.remove('hidden');
}

elements.modalConfirmBtn.addEventListener('click', async () => {
  if (!currentModalItem) return;

  const body = {};
  if (currentModalAction === 'partial') {
    const qty = parseFloat(elements.modalPurchasedQty.value);
    if (!qty || qty <= 0) {
      showToast('تنبيه', 'يرجى تحديد كمية صحيحة', '⚠️', 'amber');
      return;
    }
    body.status = 'partial';
    body.quantityPurchased = qty;
  } else if (currentModalAction === 'unavailable') {
    body.status = 'unavailable';
    body.missingReason = elements.modalMissingReason.value.trim() || 'غير متوفرة بالسوق';
  }

  if (currentModalAction !== 'unavailable' && elements.modalPurchasedPrice) {
    const p = parseFloat(elements.modalPurchasedPrice.value);
    if (!isNaN(p) && p >= 0) {
      body.price = p;
    }
  }

  try {
    const res = await fetch(`/api/items/${currentModalItem.id}/purchase`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      elements.purchaseModal.classList.add('hidden');
      showToast('تم التحديث', 'تم حفظ بيانات الشراء', '👍', 'blue');
      try { await fetchItems(); } catch (e) {}
    } else {
      showToast('تعذر التحديث', data.error || 'فشل حفظ بيانات الشراء', '⚠️', 'rose');
    }
  } catch (err) {
    console.error('Purchase modal error:', err);
    showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم', '⚠️', 'rose');
  }
});

elements.modalCancelBtn.addEventListener('click', () => elements.purchaseModal.classList.add('hidden'));
elements.modalCloseBtn.addEventListener('click', () => elements.purchaseModal.classList.add('hidden'));

async function confirmInventoryFast(id) {
  try {
    const item = itemsData.find(i => i.id === id);
    const received = item ? (item.quantityPurchased || item.quantity) : 1;
    const res = await fetch(`/api/items/${id}/confirm`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'completed', receivedQuantity: received, inventoryNotes: 'مستلمة ومطابقة' })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      showToast('اكتمل الجرد', 'تم تأكيد الاستلام ودخول المادة للمخزن', '✅', 'emerald');
      try { await fetchItems(); } catch (e) {}
    } else {
      showToast('تعذر التأكيد', data.error || 'فشل تأكيد الاستلام من الخادم', '⚠️', 'rose');
    }
  } catch (err) {
    console.error('Confirm fast error:', err);
    showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم لتأكيد الاستلام', '⚠️', 'rose');
  }
}

function openInventoryModal(id) {
  const item = itemsData.find(i => i.id === id);
  if (!item) return;

  currentModalItem = item;
  elements.invModalItemInfo.innerHTML = `
    <p class="font-bold">${escapeHtml(item.name)}</p>
    <p class="text-slate-500">المطلوب: ${item.quantity} ${item.unit} | المشترى: ${item.quantityPurchased || item.quantity} ${item.unit}</p>
  `;
  elements.invModalReceivedQty.value = item.quantityPurchased || item.quantity;
  elements.invModalNotes.value = '';
  elements.inventoryModal.classList.remove('hidden');
}

elements.invModalCompleteBtn.addEventListener('click', async () => {
  if (!currentModalItem) return;
  const receivedQty = parseFloat(elements.invModalReceivedQty.value) || 0;
  const notes = elements.invModalNotes.value.trim();

  try {
    const res = await fetch(`/api/items/${currentModalItem.id}/confirm`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'completed', receivedQuantity: receivedQty, inventoryNotes: notes })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      elements.inventoryModal.classList.add('hidden');
      showToast('اكتمل الجرد', 'تم حفظ جرد المادة في المخزن', '📦', 'emerald');
      try { await fetchItems(); } catch (e) {}
    } else {
      showToast('تعذر الحفظ', data.error || 'فشل تأكيد الاستلام من الخادم', '⚠️', 'rose');
    }
  } catch (err) {
    console.error('Inv complete error:', err);
    showToast('خطأ في الاتصال', 'تعذر حفظ الجرد بسبب مشكلة في الاتصال', '⚠️', 'rose');
  }
});

elements.invModalUnsuppliedBtn.addEventListener('click', async () => {
  if (!currentModalItem) return;
  const notes = elements.invModalNotes.value.trim() || 'نقص لم يتم تجهيزه بالكامل';

  try {
    const res = await fetch(`/api/items/${currentModalItem.id}/confirm`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'unavailable', inventoryNotes: notes })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      elements.inventoryModal.classList.add('hidden');
      showToast('تم التسجيل', 'تم قيد المادة كنقص لم يجهز لمتابعته', '⚠️', 'rose');
      try { await fetchItems(); } catch (e) {}
    } else {
      showToast('تعذر التسجيل', data.error || 'فشل تسجيل النقص في الخادم', '⚠️', 'rose');
    }
  } catch (err) {
    console.error('Inv unsupplied error:', err);
    showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم', '⚠️', 'rose');
  }
});

elements.invModalCloseBtn.addEventListener('click', () => elements.inventoryModal.classList.add('hidden'));

elements.notifyWarehouseBtn.addEventListener('click', async () => {
  if (!confirm('هل تريد إرسال إشعار لموظف المخزن بأن المواد تم شراؤها وجاهزة للجرد الآن؟')) return;
  try {
    const res = await fetch('/api/purchases/notify-warehouse', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message: 'تم شراء المواد من السوق وهي جاهزة للجرد في المخزن.' })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      showToast('تم التنبيه 📢', 'وصل الإشعار فوراً لهاتف موظف المخزن', '🚚', 'blue');
    } else {
      showToast('تعذر التنبيه', data.error || 'فشل إرسال الإشعار للمخزن', '⚠️', 'rose');
    }
  } catch (err) {
    console.error('Notify warehouse error:', err);
    showToast('خطأ في الاتصال', 'تعذر إرسال الإشعار', '⚠️', 'rose');
  }
});

async function revertToPending(id) {
  try {
    const res = await fetch(`/api/items/${id}/purchase`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'pending', missingReason: '' })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      showToast('تم التعديل', 'تمت إعادة المادة لقائمة المطلوب شراؤها', '🔄', 'blue');
      try { await fetchItems(); } catch (e) {}
    } else {
      showToast('تعذر التعديل', data.error || 'فشل تعديل الحالة', '⚠️', 'rose');
    }
  } catch (e) {
    console.error('Revert error:', e);
    showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم', '⚠️', 'rose');
  }
}

async function reorderItem(id) {
  try {
    const res = await fetch(`/api/items/${id}/reorder`, {
      method: 'POST',
      headers: authHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      showToast('تمت إعادة الطلب', 'تمت إضافة المادة كطلب جديد للمشتريات', '🔄', 'emerald');
      try { await fetchItems(); } catch (e) {}
    } else {
      showToast('تعذر الطلب', data.error || 'فشلت إعادة الطلب من الخادم', '⚠️', 'rose');
    }
  } catch (e) {
    console.error('Reorder error:', e);
    showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم', '⚠️', 'rose');
  }
}

async function deleteItem(id) {
  if (!confirm('هل أنت متأكد من حذف هذه المادة؟')) return;
  try {
    const res = await fetch(`/api/items/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      showToast('تم الحذف', 'تم حذف المادة بنجاح', '🗑️', 'slate');
      try { await fetchItems(); } catch (e) {}
    } else {
      showToast('تعذر الحذف', data.error || 'فشلت عملية الحذف من الخادم', '⚠️', 'rose');
    }
  } catch (err) {
    console.error('Delete item error:', err);
    showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم لحذف المادة', '⚠️', 'rose');
  }
}

// مستمعي التبويبات
elements.tabWarehouseBtn.addEventListener('click', () => switchTab('warehouse'));
elements.tabPurchasingBtn.addEventListener('click', () => switchTab('purchasing'));
elements.tabArchiveBtn.addEventListener('click', () => switchTab('archive'));
elements.tabAdminBtn.addEventListener('click', () => switchTab('admin'));

elements.whSubtabPending.addEventListener('click', () => {
  activeWhSubTab = 'pending';
  elements.whSubtabPending.className = 'flex-1 pb-2 text-xs font-bold text-emerald-600 border-b-2 border-emerald-600 text-center flex items-center justify-center gap-1';
  elements.whSubtabCheck.className = 'flex-1 pb-2 text-xs font-bold text-slate-400 border-b-2 border-transparent text-center flex items-center justify-center gap-1';
  elements.whPendingSection.classList.remove('hidden');
  elements.whCheckSection.classList.add('hidden');
});

elements.whSubtabCheck.addEventListener('click', () => {
  activeWhSubTab = 'check';
  elements.whSubtabCheck.className = 'flex-1 pb-2 text-xs font-bold text-emerald-600 border-b-2 border-emerald-600 text-center flex items-center justify-center gap-1';
  elements.whSubtabPending.className = 'flex-1 pb-2 text-xs font-bold text-slate-400 border-b-2 border-transparent text-center flex items-center justify-center gap-1';
  elements.whCheckSection.classList.remove('hidden');
  elements.whPendingSection.classList.add('hidden');
});

document.querySelectorAll('.pur-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pur-filter-btn').forEach(b => {
      b.className = 'pur-filter-btn px-3 py-1.5 rounded-lg font-bold bg-white text-slate-600 border border-slate-200 whitespace-nowrap';
    });
    btn.className = 'pur-filter-btn px-3 py-1.5 rounded-lg font-bold bg-blue-600 text-white whitespace-nowrap';
    activePurFilter = btn.dataset.filter;
    renderPurchasing();
  });
});

elements.archiveSearch.addEventListener('input', () => renderArchive());

elements.refreshBtn.addEventListener('click', () => {
  fetchItems();
  if (currentUser && currentUser.role === 'admin') fetchAdminUsers();
  showToast('تم التحديث', 'تم جلب أحدث البيانات', '🔄', 'slate');
});

elements.soundToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem('mankhul_sound', soundEnabled);
  elements.soundIcon.textContent = soundEnabled ? '🔔' : '🔕';
  if (soundEnabled) {
    playNotificationSound('chime');
    showToast('الصوت مفعل', 'سيتم تشغيل نغمة تنبيه عند وصول إشعار جديد', '🔔', 'emerald');
  } else {
    showToast('تم كتم الصوت', 'لن يتم تشغيل نغمات تنبيه', '🔕', 'slate');
  }
});

// ==========================================
// ربط التزامن اللحظي والإشعارات الذكية
// ==========================================
let previousItemsCount = -1;
let previousPendingCheck = -1;

function initSocket() {
  if (typeof io === 'function') {
    try {
      socket = io({ autoConnect: false, timeout: 3000 });
      socket.connect();

      socket.on('item:added', (data) => {
        fetchItems();
        if (!currentUser) return;
        if (currentUser.role === 'purchasing' || currentUser.role === 'admin') {
          playNotificationSound('chime');
          showToast(data.notification.title, data.notification.body, '📦', 'blue');
        }
      });

      socket.on('item:purchased', (data) => {
        fetchItems();
        if (!currentUser) return;
        if (currentUser.role === 'warehouse' || currentUser.role === 'admin') {
          playNotificationSound('chime');
          showToast(data.notification.title, data.notification.body, '🛒', 'emerald');
        }
      });

      socket.on('notification:delivery', (data) => {
        if (!currentUser) return;
        if (currentUser.role === 'warehouse' || currentUser.role === 'admin') {
          playNotificationSound('alert');
          showToast(data.title, data.body, '🚚', 'amber');
        }
      });

      socket.on('item:confirmed', (data) => {
        fetchItems();
        if (!currentUser) return;
        if (currentUser.role === 'purchasing' || currentUser.role === 'admin') {
          showToast(data.notification.title, data.notification.body, '✅', 'emerald');
        }
      });

      socket.on('item:deleted', () => {
        fetchItems();
      });
    } catch (e) {
      console.log('Socket.io fallback to Cloudflare smart sync');
    }
  }

  // مزامنة ذكية دورية تعمل تلقائياً على كلاودفلاير أونلاين
  setInterval(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/items', { headers: authHeaders() });
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        itemsData = data.items;
        handleIncomingNotifications(data.notifications);
        renderAll();
      }
    } catch (err) {
      // الصمت في حال فقدان الاتصال اللحظي
    }
  }, 3500);
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  return d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==========================================
// مشاركة النواقص عبر WhatsApp فوراً
// ==========================================
if (elements.whatsappShareBtn) {
  elements.whatsappShareBtn.addEventListener('click', () => {
    const pending = itemsData.filter(i => i.status === 'pending');
    if (pending.length === 0) {
      showToast('لا توجد نواقص', 'جميع المواد المطلوبة تم شراؤها حالياً 🎉', '✨', 'blue');
      return;
    }

    const dateStr = new Date().toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' });
    let msg = `*📦 قائمة نقوصات منخل المطلوبة للشراء*\n📅 التاريخ: ${dateStr}\n\n`;

    pending.forEach((item, index) => {
      let priorityTag = '';
      if (item.priority === 'emergency') priorityTag = ' 🚨 [طارئ - متوقف العمل 🔥]';
      else if (item.priority === 'urgent') priorityTag = ' ⚡ [مهم ومستعجل]';

      msg += `${index + 1}. *${item.name}* - الكمية: (${item.quantity} ${item.unit})${priorityTag}\n`;
      if (item.notes) msg += `   📝 ملاحظة: ${item.notes}\n`;
    });

    msg += `\n📊 *المجموع:* ${pending.length} مواد مطلوبة.\n🏢 _نظام نقوصات منخل_`;

    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  });
}

// ==========================================
// تصدير السجل إلى Excel (CSV يدعم العربية 100%)
// ==========================================
if (elements.exportExcelBtn) {
  elements.exportExcelBtn.addEventListener('click', () => {
    if (itemsData.length === 0) {
      showToast('لا توجد بيانات', 'السجل فارغ حالياً للتصدير', 'ℹ️', 'slate');
      return;
    }

    const headers = [
      'اسم المادة',
      'الكمية المطلوبة',
      'الوحدة',
      'درجة الأهمية',
      'الحالة',
      'الكمية المشتراة',
      'سعر الشراء (د.ع)',
      'الكمية المستلمة',
      'ملاحظات الطلب',
      'ملاحظات الشراء',
      'ملاحظات المخزن',
      'تاريخ الطلب',
      'المشتري'
    ];

    const statusMap = {
      pending: 'بانتظار الشراء',
      purchased: 'تم الشراء',
      partial: 'شراء جزئي',
      unavailable: 'غير متوفر',
      completed: 'مكتمل ومستلم'
    };

    const priorityMap = {
      emergency: 'طارئ متوقف العمل',
      urgent: 'مهم ومستعجل',
      normal: 'عادي'
    };

    const rows = itemsData.map(item => [
      `"${(item.name || '').replace(/"/g, '""')}"`,
      item.quantity || 1,
      `"${item.unit || 'قطعة'}"`,
      `"${priorityMap[item.priority] || 'عادي'}"`,
      `"${statusMap[item.status] || item.status}"`,
      item.quantityPurchased || 0,
      item.price || 0,
      item.receivedQuantity || 0,
      `"${(item.notes || '').replace(/"/g, '""')}"`,
      `"${(item.missingReason || '').replace(/"/g, '""')}"`,
      `"${(item.inventoryNotes || '').replace(/"/g, '""')}"`,
      `"${formatTime(item.createdAt)}"`,
      `"${item.purchasedBy ? item.purchasedBy.name : ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `تقرير_نقوصات_منخل_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('تم التصدير بنجاح', 'تم تنزيل ملف الإكسل متوافق مع كافة الأجهزة', '📊', 'emerald');
  });
}

// ==========================================
// الوضع الليلي (Dark Mode)
// ==========================================
let isDarkMode = localStorage.getItem('mankhul_theme') === 'dark';
function applyTheme() {
  document.body.classList.toggle('dark-mode', isDarkMode);
  if (elements.themeIcon) {
    elements.themeIcon.textContent = isDarkMode ? '☀️' : '🌙';
  }
}

if (elements.themeToggleBtn) {
  elements.themeToggleBtn.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    localStorage.setItem('mankhul_theme', isDarkMode ? 'dark' : 'light');
    applyTheme();
    showToast(isDarkMode ? 'الوضع الليلي' : 'الوضع النهاري', isDarkMode ? 'تم تفعيل المظهر الداكن 🌙' : 'تم تفعيل المظهر الفاتح ☀️', isDarkMode ? '🌙' : '☀️', 'slate');
  });
}

// إغلاق النوافذ بمفتاح Escape
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    elements.purchaseModal.classList.add('hidden');
    elements.inventoryModal.classList.add('hidden');
  }
});

// بدء التشغيل
applyTheme();
elements.soundIcon.textContent = soundEnabled ? '🔔' : '🔕';
applyUserRole();
initSocket();
fetchItems();
