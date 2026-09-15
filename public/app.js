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
  purCountPending: document.getElementById('pur-count-pending'),
  purCountPurchased: document.getElementById('pur-count-purchased'),
  purCountUnavailable: document.getElementById('pur-count-unavailable'),

  // عناصر السجل
  archiveList: document.getElementById('archive-list'),
  archiveSearch: document.getElementById('archive-search'),
  statTotal: document.getElementById('stat-total'),
  statCompleted: document.getElementById('stat-completed'),
  statPending: document.getElementById('stat-pending'),
  statMissing: document.getElementById('stat-missing'),

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
// تشغيل الصوت (Web Audio API)
// ==========================================
function playNotificationSound(type = 'chime') {
  if (!soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

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

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);

  if (Notification && Notification.permission === 'granted') {
    new Notification(title, { body: message });
  }
}

// ==========================================
// جلب البيانات من الخادم
// ==========================================
async function fetchItems() {
  try {
    const res = await fetch('/api/items', { headers: authHeaders() });
    const data = await res.json();
    if (data.success) {
      itemsData = data.items || [];
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
}

// 1. شاشة المخزن
function renderWarehouse() {
  const pendingItems = itemsData.filter(i => i.status === 'pending');
  if (pendingItems.length === 0) {
    elements.whPendingList.innerHTML = `
      <div class="text-center py-8 bg-white rounded-2xl border border-slate-200 text-slate-400">
        <span class="text-3xl block mb-1">✨</span>
        <p class="text-xs font-semibold">لا توجد مواد ناقصة مسجلة حالياً</p>
      </div>
    `;
  } else {
    elements.whPendingList.innerHTML = pendingItems.map(item => `
      <div class="touch-card bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-bold text-slate-900 truncate">${escapeHtml(item.name)}</h3>
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
            <h3 class="text-sm font-bold text-slate-900">${escapeHtml(item.name)}</h3>
            <p class="text-xs text-slate-500 mt-0.5">
              المطلوب: <span class="font-bold">${item.quantity} ${item.unit}</span> | 
              المشترى: <span class="font-bold text-emerald-600">${item.quantityPurchased || item.quantity} ${item.unit}</span>
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
  let filtered = itemsData;
  if (activePurFilter === 'pending') {
    filtered = itemsData.filter(i => i.status === 'pending');
  } else if (activePurFilter === 'purchased') {
    filtered = itemsData.filter(i => i.status === 'purchased' || i.status === 'partial');
  } else if (activePurFilter === 'unavailable') {
    filtered = itemsData.filter(i => i.status === 'unavailable');
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
      <div class="touch-card bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1">
            <h3 class="text-sm font-bold text-slate-900">${escapeHtml(item.name)}</h3>
            <div class="flex items-center gap-2 mt-1 text-xs">
              <span class="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                الكمية: ${item.quantity} ${item.unit}
              </span>
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
            <h4 class="font-bold text-slate-900">${escapeHtml(item.name)}</h4>
            <p class="text-slate-500 text-[11px] mt-0.5">
              المطلوب: <b>${item.quantity} ${item.unit}</b>
              ${item.quantityPurchased ? ` | المشترى: <b>${item.quantityPurchased}</b>` : ''}
              ${item.receivedQuantity ? ` | المستلم: <b>${item.receivedQuantity}</b>` : ''}
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
    const data = await res.json();
    if (data.success) {
      elements.newUserName.value = '';
      elements.newUserUsername.value = '';
      elements.newUserPassword.value = '1234';
      fetchAdminUsers();
      showToast('تمت الإضافة', `تم إنشاء حساب للموظف ${name}`, '👤', 'purple');
    } else {
      alert(data.error || 'فشل إنشاء الحساب');
    }
  } catch (err) {
    alert('حدث خطأ');
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
    const data = await res.json();
    if (data.success) {
      showToast('تم التعديل', `تم تغيير كلمة مرور ${name} بنجاح`, '🔑', 'purple');
    } else {
      alert(data.error || 'تعذر التعديل');
    }
  } catch (e) {
    alert('حدث خطأ');
  }
}

async function deleteUser(id, name) {
  if (!confirm(`هل أنت متأكد من حذف حساب الموظف (${name})؟ لن يتمكن من الدخول للنظام بعد ذلك.`)) return;
  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await res.json();
    if (data.success) {
      fetchAdminUsers();
      showToast('تم الحذف', `تم حذف حساب ${name}`, '🗑️', 'slate');
    } else {
      alert(data.error || 'تعذر الحذف');
    }
  } catch (e) {
    alert('حدث خطأ');
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

  if (!name) return;

  try {
    const res = await fetch('/api/items', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, quantity, unit, notes })
    });
    const data = await res.json();
    if (data.success) {
      elements.itemName.value = '';
      elements.itemNotes.value = '';
      elements.itemQuantity.value = 1;
      elements.itemName.focus();
      showToast('تم الإرسال بنجاح', `تم إرسال ${name} للمشتريات فوراً`, '🚀', 'emerald');
    }
  } catch (err) {
    alert('حدث خطأ أثناء الإرسال');
  }
});

async function markPurchasedFast(id) {
  try {
    const res = await fetch(`/api/items/${id}/purchase`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'purchased' })
    });
    const data = await res.json();
    if (data.success) {
      showToast('تم تسجيل الشراء', 'تم حفظ المادة كـ مشتراة بنجاح', '✅', 'emerald');
    }
  } catch (err) {
    alert('تعذر تحديث الحالة');
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

  if (action === 'partial') {
    elements.modalTitle.textContent = 'تسجيل شراء جزء من الكمية';
    elements.modalPartialFields.classList.remove('hidden');
    elements.modalReasonFields.classList.add('hidden');
    elements.modalPurchasedQty.value = Math.max(1, Math.floor(item.quantity / 2));
  } else if (action === 'unavailable') {
    elements.modalTitle.textContent = 'تسجيل مادة غير متوفرة / لم تجهز';
    elements.modalPartialFields.classList.add('hidden');
    elements.modalReasonFields.classList.remove('hidden');
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
      alert('يرجى تحديد كمية صحيحة');
      return;
    }
    body.status = 'partial';
    body.quantityPurchased = qty;
  } else if (currentModalAction === 'unavailable') {
    body.status = 'unavailable';
    body.missingReason = elements.modalMissingReason.value.trim() || 'غير متوفرة بالسوق';
  }

  try {
    const res = await fetch(`/api/items/${currentModalItem.id}/purchase`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.success) {
      elements.purchaseModal.classList.add('hidden');
      showToast('تم التحديث', 'تم حفظ بيانات الشراء', '👍', 'blue');
    }
  } catch (err) {
    alert('حدث خطأ');
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
    const data = await res.json();
    if (data.success) {
      showToast('اكتمل الجرد', 'تم تأكيد الاستلام ودخول المادة للمخزن', '✅', 'emerald');
    }
  } catch (err) {
    alert('حدث خطأ أثناء التأكيد');
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
    const data = await res.json();
    if (data.success) {
      elements.inventoryModal.classList.add('hidden');
      showToast('اكتمل الجرد', 'تم حفظ جرد المادة في المخزن', '📦', 'emerald');
    }
  } catch (err) {
    alert('حدث خطأ');
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
    const data = await res.json();
    if (data.success) {
      elements.inventoryModal.classList.add('hidden');
      showToast('تم التسجيل', 'تم قيد المادة كنقص لم يجهز لمتابعته', '⚠️', 'rose');
    }
  } catch (err) {
    alert('حدث خطأ');
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
    const data = await res.json();
    if (data.success) {
      showToast('تم التنبيه 📢', 'وصل الإشعار فوراً لهاتف موظف المخزن', '🚚', 'blue');
    }
  } catch (err) {
    alert('حدث خطأ في الإرسال');
  }
});

async function revertToPending(id) {
  try {
    await fetch(`/api/items/${id}/purchase`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'pending', missingReason: '' })
    });
  } catch (e) {
    alert('حدث خطأ');
  }
}

async function reorderItem(id) {
  try {
    const res = await fetch(`/api/items/${id}/reorder`, {
      method: 'POST',
      headers: authHeaders()
    });
    const data = await res.json();
    if (data.success) {
      showToast('تمت إعادة الطلب', 'تمت إضافة المادة كطلب جديد للمشتريات', '🔄', 'emerald');
    }
  } catch (e) {
    alert('حدث خطأ');
  }
}

async function deleteItem(id) {
  if (!confirm('هل أنت متأكد من حذف هذه المادة؟')) return;
  try {
    const res = await fetch(`/api/items/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await res.json();
    if (data.success) {
      showToast('تم الحذف', 'تم حذف المادة بنجاح', '🗑️', 'slate');
    }
  } catch (err) {
    alert('تعذر الحذف');
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
        const newItems = data.items;
        
        // كشف وصول مواد ناقصة جديدة للمشتريات
        if (previousItemsCount !== -1 && newItems.length > previousItemsCount) {
          if (currentUser.role === 'purchasing' || currentUser.role === 'admin') {
            playNotificationSound('chime');
            showToast('نقص جديد في المخزن! 📦', 'تم تسجيل مواد ناقصة جديدة بانتظار الشراء', '📦', 'blue');
          }
        }

        // كشف اكتمال شراء مواد جديدة للمخزن
        const readyForCheck = newItems.filter(i => i.status === 'purchased' || i.status === 'partial').length;
        if (previousPendingCheck !== -1 && readyForCheck > previousPendingCheck) {
          if (currentUser.role === 'warehouse' || currentUser.role === 'admin') {
            playNotificationSound('alert');
            showToast('مشتريات جاهزة للجرد! 🚚', 'قام موظف المشتريات بشراء المواد، يرجى جردها', '🛒', 'amber');
          }
        }

        previousItemsCount = newItems.length;
        previousPendingCheck = readyForCheck;
        itemsData = newItems;
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

// بدء التشغيل
elements.soundIcon.textContent = soundEnabled ? '🔔' : '🔕';
applyUserRole();
initSocket();
fetchItems();
