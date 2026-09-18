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

// ==========================================
// دوال معالجة وتدقيق الأرقام والحسابات الرياضية بدقة
// ==========================================
function normalizeArabicNumerals(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[٠۰]/g, '0')
    .replace(/[١۱]/g, '1')
    .replace(/[٢۲]/g, '2')
    .replace(/[٣۳]/g, '3')
    .replace(/[٤۴]/g, '4')
    .replace(/[٥۵]/g, '5')
    .replace(/[٦۶]/g, '6')
    .replace(/[٧۷]/g, '7')
    .replace(/[٨۸]/g, '8')
    .replace(/[٩۹]/g, '9')
    .replace(/[،٫]/g, '.')
    .replace(/\s+/g, '');
}

function parseCleanNumber(val, defaultVal = 0, isPrice = false) {
  if (val === null || val === undefined || val === '') return defaultVal;
  const normalized = normalizeArabicNumerals(val);
  const parsed = parseFloat(normalized);
  if (isNaN(parsed) || !isFinite(parsed)) return defaultVal;
  if (isPrice) {
    return Math.max(0, Math.round(parsed));
  }
  // للكميات: تقريب لمنزلتين عشريتين كحد أقصى لمنع أخطاء الفاصلة العائمة
  return Math.max(0, Math.round(parsed * 100) / 100);
}

function roundNumber(num, decimals = 2) {
  const p = Math.pow(10, decimals);
  return Math.round((Number(num) || 0) * p) / p;
}

// دالة منع التكرار وتعطيل الأزرار أثناء التحميل (Debouncing)
function setButtonLoading(btn, isLoading, originalHtml, loadingText = 'جاري المعالجة...') {
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.dataset.originalContent = originalHtml || btn.innerHTML;
    btn.innerHTML = `<span class="inline-block animate-spin">⏳</span> <span>${loadingText}</span>`;
    btn.classList.add('opacity-70', 'cursor-not-allowed');
  } else {
    btn.disabled = false;
    if (btn.dataset.originalContent) {
      btn.innerHTML = btn.dataset.originalContent;
    }
    btn.classList.remove('opacity-70', 'cursor-not-allowed');
  }
}

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
  submitItemBtn: document.getElementById('submit-item-btn'),
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
  // عناصر السجل والبحث والتحليلات
  archiveList: document.getElementById('archive-list'),
  archiveSearch: document.getElementById('archive-search'),
  toggleFiltersBtn: document.getElementById('toggle-filters-btn'),
  filtersBadge: document.getElementById('filters-badge'),
  advancedFiltersPanel: document.getElementById('advanced-filters-panel'),
  resetFiltersBtn: document.getElementById('reset-filters-btn'),
  filterStatus: document.getElementById('filter-status'),
  filterPriority: document.getElementById('filter-priority'),
  filterDateFrom: document.getElementById('filter-date-from'),
  filterDateTo: document.getElementById('filter-date-to'),
  filterMatchedCount: document.getElementById('filter-matched-count'),
  filterActiveIndicator: document.getElementById('filter-active-indicator'),

  toggleAnalyticsBtn: document.getElementById('toggle-analytics-btn'),
  analyticsPanel: document.getElementById('analytics-panel'),
  topShortagesChart: document.getElementById('top-shortages-chart'),
  expensesSvgChart: document.getElementById('expenses-svg-chart'),
  analyticsExpensesTotal: document.getElementById('analytics-expenses-total'),

  openVoucherBtn: document.getElementById('open-voucher-btn'),
  exportExcelBtn: document.getElementById('export-excel-btn'),
  statTotal: document.getElementById('stat-total'),
  statCompleted: document.getElementById('stat-completed'),
  statPending: document.getElementById('stat-pending'),
  statMissing: document.getElementById('stat-missing'),
  statExpenses: document.getElementById('stat-expenses'),

  // عناصر لوحة تحكم المدير
  addUserForm: document.getElementById('add-user-form'),
  addUserSubmitBtn: document.getElementById('add-user-submit-btn'),
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
  modalPriceHistoryTip: document.getElementById('modal-price-history-tip'),
  modalLastPriceVal: document.getElementById('modal-last-price-val'),
  modalPurchasedSupplier: document.getElementById('modal-purchased-supplier'),
  commonSuppliersList: document.getElementById('common-suppliers-list'),
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

  editItemModal: document.getElementById('edit-item-modal'),
  editItemForm: document.getElementById('edit-item-form'),
  editItemName: document.getElementById('edit-item-name'),
  editItemQuantity: document.getElementById('edit-item-quantity'),
  editItemUnit: document.getElementById('edit-item-unit'),
  editItemNotes: document.getElementById('edit-item-notes'),
  editItemPrice: document.getElementById('edit-item-price'),
  editItemSupplier: document.getElementById('edit-item-supplier'),
  editModalSaveBtn: document.getElementById('edit-modal-save-btn'),
  editModalCancelBtn: document.getElementById('edit-modal-cancel-btn'),
  editModalCloseBtn: document.getElementById('edit-modal-close-btn'),

  // مسار الحركة والتتبع
  itemTimelineModal: document.getElementById('item-timeline-modal'),
  timelineModalCloseBtn: document.getElementById('timeline-modal-close-btn'),
  timelineModalOkBtn: document.getElementById('timeline-modal-ok-btn'),
  timelineItemHeader: document.getElementById('timeline-item-header'),
  timelineStepsContainer: document.getElementById('timeline-steps-container'),

  // سند استلام المشتريات للطباعة
  voucherPrintModal: document.getElementById('voucher-print-modal'),
  voucherCloseBtn: document.getElementById('voucher-close-btn'),
  voucherNumber: document.getElementById('voucher-number'),
  voucherDate: document.getElementById('voucher-date'),
  voucherItemsTbody: document.getElementById('voucher-items-tbody'),
  voucherTotalQty: document.getElementById('voucher-total-qty'),
  voucherTotalAmount: document.getElementById('voucher-total-amount'),
  voucherAmountWords: document.getElementById('voucher-amount-words'),

  // شريط تثبيت PWA
  pwaInstallBanner: document.getElementById('pwa-install-banner'),
  pwaInstallBtn: document.getElementById('pwa-install-btn'),
  pwaDismissBtn: document.getElementById('pwa-dismiss-btn'),

  toastContainer: document.getElementById('toast-container')
};

// متغيرات النوافذ المؤقتة
let currentModalAction = null;
let currentModalItem = null;
let editingItemId = null;

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
// ذكاء المشتريات وتاريخ الأسعار والموردين
// ==========================================
function getLastPurchaseInfo(itemName) {
  if (!itemName || !Array.isArray(itemsData)) return null;
  const clean = itemName.trim().toLowerCase();
  const matches = itemsData.filter(i => 
    i.name && i.name.trim().toLowerCase() === clean && 
    (Number(i.price) > 0 || i.supplier) &&
    (i.status === 'purchased' || i.status === 'partial' || i.status === 'completed')
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => new Date(b.purchasedAt || b.createdAt) - new Date(a.purchasedAt || a.createdAt));
  const latest = matches[0];
  return {
    price: Number(latest.price) || 0,
    supplier: latest.supplier || '',
    date: latest.purchasedAt || latest.createdAt
  };
}

function updateSuppliersList() {
  if (!elements.commonSuppliersList) return;
  const suppliers = new Set();
  itemsData.forEach(item => {
    if (item.supplier && item.supplier.trim()) {
      suppliers.add(item.supplier.trim());
    }
  });
  elements.commonSuppliersList.innerHTML = Array.from(suppliers)
    .map(s => `<option value="${escapeHtml(s)}">`)
    .join('');
}

// تفقيط مبالغ الدينار العراقي رسمياً للوصولات
function tafqeetIQD(num) {
  if (!num || num <= 0) return 'صفر دينار عراقي';
  const units = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
  const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function convertChunk(n) {
    let res = '';
    const h = Math.floor(n / 100);
    const r = n % 100;
    if (h > 0) res += hundreds[h];
    if (r > 0) {
      if (res) res += ' و ';
      if (r < 10) res += units[r];
      else if (r < 20) res += teens[r - 10];
      else {
        const u = r % 10;
        const t = Math.floor(r / 10);
        if (u > 0) res += units[u] + ' و ';
        res += tens[t];
      }
    }
    return res;
  }

  const millions = Math.floor(num / 1000000);
  const thousands = Math.floor((num % 1000000) / 1000);
  const remainder = num % 1000;

  const parts = [];
  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else parts.push(convertChunk(millions) + ' ملايين');
  }
  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands >= 3 && thousands <= 10) parts.push(convertChunk(thousands) + ' آلاف');
    else parts.push(convertChunk(thousands) + ' ألف');
  }
  if (remainder > 0) {
    parts.push(convertChunk(remainder));
  }

  return parts.join(' و ') + ' دينار عراقي فقط لا غير';
}

// متغيرات الفلاتر المتقدمة
let filterStatusVal = 'all';
let filterPriorityVal = 'all';
let filterDateFromVal = '';
let filterDateToVal = '';

function getFilteredArchiveItems() {
  const searchTerm = (elements.archiveSearch ? elements.archiveSearch.value || '' : '').trim().toLowerCase();
  return itemsData.filter(item => {
    // 1. نص البحث
    if (searchTerm) {
      const matchName = item.name && item.name.toLowerCase().includes(searchTerm);
      const matchNotes = item.notes && item.notes.toLowerCase().includes(searchTerm);
      const matchReason = item.missingReason && item.missingReason.toLowerCase().includes(searchTerm);
      const matchSupplier = item.supplier && item.supplier.toLowerCase().includes(searchTerm);
      const matchBuyer = item.purchasedBy && item.purchasedBy.name && item.purchasedBy.name.toLowerCase().includes(searchTerm);
      if (!matchName && !matchNotes && !matchReason && !matchSupplier && !matchBuyer) return false;
    }

    // 2. فلتر الحالة
    if (filterStatusVal !== 'all' && item.status !== filterStatusVal) {
      return false;
    }

    // 3. فلتر درجة الأهمية
    if (filterPriorityVal !== 'all' && (item.priority || 'normal') !== filterPriorityVal) {
      return false;
    }

    // 4. النطاق الزمني
    if (filterDateFromVal) {
      const itemDate = (item.createdAt || '').slice(0, 10);
      if (itemDate && itemDate < filterDateFromVal) return false;
    }
    if (filterDateToVal) {
      const itemDate = (item.createdAt || '').slice(0, 10);
      if (itemDate && itemDate > filterDateToVal) return false;
    }

    return true;
  });
}

// ==========================================
// رسم وتحديث الواجهات (Rendering)
// ==========================================
function renderAll() {
  updateSuppliersList();
  updateBadges();
  renderWarehouse();
  renderPurchasing();
  renderArchive();
  renderAnalytics();
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

  // المصاريف الفعلية: تشمل فقط المواد التي تم شراؤها أو اكتملت
  const totalExpenses = itemsData
    .filter(i => ['purchased', 'partial', 'completed'].includes(i.status))
    .reduce((sum, i) => sum + parseCleanNumber(i.price, 0, true), 0);

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
          <div class="flex items-center gap-1">
            <button onclick="openEditModal('${item.id}')" class="p-2 text-slate-400 hover:text-emerald-600 rounded-lg text-sm transition-colors" title="تعديل المادة">
              ✏️
            </button>
            <button onclick="deleteItem('${item.id}')" class="p-2 text-slate-300 hover:text-rose-500 rounded-lg text-sm transition-colors" title="حذف">
              🗑️
            </button>
          </div>
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
              ${item.supplier ? `<span class="font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">🏬 ${escapeHtml(item.supplier)}</span>` : ''}
              ${item.notes ? `<span class="text-slate-500 truncate">📝 ${escapeHtml(item.notes)}</span>` : ''}
            </div>
            <div class="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
              ${item.createdBy ? `<span class="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-semibold">طلبها: ${escapeHtml(item.createdBy.name)}</span>` : ''}
              ${item.purchasedBy ? `<span class="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-semibold">المشتري: ${escapeHtml(item.purchasedBy.name)}</span>` : ''}
              <button onclick="openItemTimeline('${item.id}')" class="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5">
                <span>🕒</span> <span>المسار</span>
              </button>
            </div>
            ${item.missingReason ? `<p class="text-[11px] text-rose-600 bg-rose-50 px-2 py-1 rounded mt-1 font-semibold">ملاحظة: ${escapeHtml(item.missingReason)}</p>` : ''}
          </div>
          <div>${statusBadge}</div>
        </div>

        ${item.status === 'pending' || item.status === 'unavailable' ? `
          <div class="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-100">
            <button onclick="openPurchaseModal('${item.id}', 'purchased')" 
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
            <div class="flex items-center gap-2">
              <button onclick="openItemTimeline('${item.id}')" class="text-indigo-600 hover:underline font-bold text-[11px]">
                تتبع الحركة 🕒
              </button>
              <button onclick="revertToPending('${item.id}')" class="text-blue-600 hover:underline font-bold text-[11px]">
                تعديل الحالة 🔄
              </button>
            </div>
          </div>
        `}
      </div>
    `;
  }).join('');
}

// 3. شاشة السجل والأرشيف مع الفلاتر المتقدمة
function renderArchive() {
  const filtered = getFilteredArchiveItems();

  // تحديث مؤشرات الفلترة
  const isCustomFilterActive = (filterStatusVal !== 'all' || filterPriorityVal !== 'all' || filterDateFromVal || filterDateToVal);
  if (elements.filterActiveIndicator) {
    elements.filterActiveIndicator.classList.toggle('hidden', !isCustomFilterActive);
  }
  if (elements.filtersBadge) {
    elements.filtersBadge.classList.toggle('hidden', !isCustomFilterActive);
  }
  if (elements.filterMatchedCount) {
    elements.filterMatchedCount.textContent = filtered.length;
  }

  if (filtered.length === 0) {
    elements.archiveList.innerHTML = `
      <div class="text-center py-8 bg-white rounded-2xl border border-slate-200 text-slate-400">
        <p class="text-xs font-semibold">لا توجد سجلات مطابقة للفلاتر المحددة</p>
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
      <div class="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2 text-xs">
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
          ${item.supplier ? `<span>🏬 المحل: <b>${escapeHtml(item.supplier)}</b></span>` : ''}
          ${item.confirmedBy ? `<span>📦 الجرد: <b>${escapeHtml(item.confirmedBy.name)}</b></span>` : ''}
        </div>

        ${item.missingReason ? `<p class="text-rose-600 bg-rose-50 p-1.5 rounded-lg text-[11px]">ملاحظة النقص: ${escapeHtml(item.missingReason)}</p>` : ''}
        ${item.inventoryNotes ? `<p class="text-indigo-600 bg-indigo-50 p-1.5 rounded-lg text-[11px]">ملاحظة المخزن: ${escapeHtml(item.inventoryNotes)}</p>` : ''}

        <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
          <span>${formatTime(item.completedAt || item.purchasedAt || item.createdAt)}</span>
          <div class="flex items-center gap-2">
            <button onclick="openItemTimeline('${item.id}')" class="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5">
              <span>🕒</span> <span>المسار</span>
            </button>
            ${item.status === 'unavailable' || item.status === 'partial' || item.status === 'completed' ? `
              <button onclick="reorderItem('${item.id}')" class="text-emerald-700 hover:underline font-bold">
                طلب مرة أخرى 🔄
              </button>
            ` : ''}
            ${currentUser && (currentUser.role === 'admin' || currentUser.role === 'warehouse') ? `
              <button onclick="openEditModal('${item.id}')" class="text-slate-400 hover:text-emerald-600">
                ✏️
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

  setButtonLoading(elements.addUserSubmitBtn, true, elements.addUserSubmitBtn ? elements.addUserSubmitBtn.innerHTML : null, 'جاري الإنشاء...');

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
  } finally {
    setButtonLoading(elements.addUserSubmitBtn, false);
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
  const quantity = parseCleanNumber(elements.itemQuantity.value, 1);
  const unit = elements.itemUnit.value;
  const notes = elements.itemNotes.value.trim();
  const priorityEl = document.querySelector('input[name="item-priority"]:checked');
  const priority = priorityEl ? priorityEl.value : 'normal';

  if (!name) return;

  setButtonLoading(elements.submitItemBtn, true, elements.submitItemBtn ? elements.submitItemBtn.innerHTML : null, 'جاري الإرسال...');

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
  } finally {
    setButtonLoading(elements.submitItemBtn, false);
  }
});

// نافذة تعديل المادة
function openEditModal(id) {
  const item = itemsData.find(i => i.id === id);
  if (!item) return;

  editingItemId = id;
  if (elements.editItemName) elements.editItemName.value = item.name || '';
  if (elements.editItemQuantity) elements.editItemQuantity.value = item.quantity || 1;
  if (elements.editItemUnit) elements.editItemUnit.value = item.unit || 'قطعة';
  if (elements.editItemNotes) elements.editItemNotes.value = item.notes || '';
  if (elements.editItemPrice) elements.editItemPrice.value = (item.price !== undefined && item.price !== null && item.price > 0) ? item.price : '';
  if (elements.editItemSupplier) elements.editItemSupplier.value = item.supplier || '';

  const priorityRadios = document.querySelectorAll('input[name="edit-item-priority"]');
  priorityRadios.forEach(radio => {
    radio.checked = radio.value === (item.priority || 'normal');
  });

  if (elements.editItemModal) elements.editItemModal.classList.remove('hidden');
}

function closeEditModal() {
  editingItemId = null;
  if (elements.editItemModal) elements.editItemModal.classList.add('hidden');
}

if (elements.editModalCloseBtn) elements.editModalCloseBtn.addEventListener('click', closeEditModal);
if (elements.editModalCancelBtn) elements.editModalCancelBtn.addEventListener('click', closeEditModal);

if (elements.editItemForm) {
  elements.editItemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingItemId) return;

    const name = elements.editItemName.value.trim();
    const quantity = parseCleanNumber(elements.editItemQuantity.value, 1);
    const unit = elements.editItemUnit.value;
    const notes = elements.editItemNotes.value.trim();
    const priorityEl = document.querySelector('input[name="edit-item-priority"]:checked');
    const priority = priorityEl ? priorityEl.value : 'normal';

    if (!name) {
      showToast('تنبيه', 'يرجى كتابة اسم المادة', '⚠️', 'amber');
      return;
    }

    const payload = { name, quantity, unit, notes, priority };
    if (elements.editItemPrice) {
      const p = parseCleanNumber(elements.editItemPrice.value, -1, true);
      if (p >= 0) payload.price = p;
    }
    if (elements.editItemSupplier) {
      payload.supplier = elements.editItemSupplier.value.trim();
    }

    setButtonLoading(elements.editModalSaveBtn, true, elements.editModalSaveBtn ? elements.editModalSaveBtn.innerHTML : null, 'جاري الحفظ...');

    try {
      const res = await fetch(`/api/items/${editingItemId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.success === undefined)) {
        closeEditModal();
        showToast('تم التعديل', `تم تحديث بيانات المادة ${name}`, '✏️', 'emerald');
        try { await fetchItems(); } catch (err) {}
      } else {
        showToast('تعذر التعديل', data.error || 'فشل تحديث المادة في الخادم', '⚠️', 'rose');
      }
    } catch (err) {
      console.error('Edit item error:', err);
      showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم لتحديث المادة', '⚠️', 'rose');
    } finally {
      setButtonLoading(elements.editModalSaveBtn, false);
    }
  });
}

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
  currentModalAction = action || 'purchased';

  elements.modalItemInfo.innerHTML = `
    <p class="font-bold">${escapeHtml(item.name)}</p>
    <p class="text-slate-500">الكمية المطلوبة: ${item.quantity} ${item.unit}</p>
  `;

  // ذكاء الأسعار التلقائي: استخراج آخر سعر ومورد مسجل للمادة
  const lastInfo = getLastPurchaseInfo(item.name);
  if (lastInfo && lastInfo.price > 0 && elements.modalPriceHistoryTip) {
    if (elements.modalLastPriceVal) {
      elements.modalLastPriceVal.textContent = Number(lastInfo.price).toLocaleString('en-US');
    }
    elements.modalPriceHistoryTip.classList.remove('hidden');
    elements.modalPriceHistoryTip.onclick = () => {
      if (elements.modalPurchasedPrice) {
        elements.modalPurchasedPrice.value = lastInfo.price;
      }
      if (elements.modalPurchasedSupplier && lastInfo.supplier && !elements.modalPurchasedSupplier.value) {
        elements.modalPurchasedSupplier.value = lastInfo.supplier;
      }
      showToast('تم اعتماد السعر', `تم ملء السعر (${formatPrice(lastInfo.price)}) والمورد السابق`, '💡', 'purple');
    };
  } else if (elements.modalPriceHistoryTip) {
    elements.modalPriceHistoryTip.classList.add('hidden');
  }

  if (elements.modalPurchasedPrice) {
    elements.modalPurchasedPrice.value = (item.price && item.price > 0) ? item.price : (lastInfo ? lastInfo.price : '');
  }
  if (elements.modalPurchasedSupplier) {
    elements.modalPurchasedSupplier.value = item.supplier || (lastInfo ? lastInfo.supplier : '') || '';
  }

  const priceFields = document.getElementById('modal-price-fields');
  const supplierFields = document.getElementById('modal-supplier-fields');

  if (currentModalAction === 'partial') {
    elements.modalTitle.textContent = 'تسجيل شراء جزء من الكمية';
    elements.modalPartialFields.classList.remove('hidden');
    elements.modalReasonFields.classList.add('hidden');
    if (priceFields) priceFields.classList.remove('hidden');
    if (supplierFields) supplierFields.classList.remove('hidden');
    elements.modalPurchasedQty.value = Math.max(1, Math.floor(item.quantity / 2));
  } else if (currentModalAction === 'unavailable') {
    elements.modalTitle.textContent = 'تسجيل مادة غير متوفرة / لم تجهز';
    elements.modalPartialFields.classList.add('hidden');
    elements.modalReasonFields.classList.remove('hidden');
    if (priceFields) priceFields.classList.add('hidden');
    if (supplierFields) supplierFields.classList.add('hidden');
    elements.modalMissingReason.value = '';
  } else {
    // شراء كامل مع إمكانية توثيق السعر والمحل فوراً
    elements.modalTitle.textContent = 'تسجيل شراء المادة وتوثيق السعر';
    elements.modalPartialFields.classList.add('hidden');
    elements.modalReasonFields.classList.add('hidden');
    if (priceFields) priceFields.classList.remove('hidden');
    if (supplierFields) supplierFields.classList.remove('hidden');
  }

  elements.purchaseModal.classList.remove('hidden');
}

elements.modalConfirmBtn.addEventListener('click', async () => {
  if (!currentModalItem) return;

  const body = {};
  if (currentModalAction === 'partial') {
    const qty = parseCleanNumber(elements.modalPurchasedQty.value, 0);
    if (!qty || qty <= 0) {
      showToast('تنبيه', 'يرجى تحديد كمية صحيحة', '⚠️', 'amber');
      return;
    }
    body.status = 'partial';
    body.quantityPurchased = qty;
  } else if (currentModalAction === 'unavailable') {
    body.status = 'unavailable';
    body.missingReason = elements.modalMissingReason.value.trim() || 'غير متوفرة بالسوق';
  } else {
    body.status = 'purchased';
    body.quantityPurchased = currentModalItem.quantity;
  }

  if (currentModalAction !== 'unavailable') {
    if (elements.modalPurchasedPrice) {
      const p = parseCleanNumber(elements.modalPurchasedPrice.value, -1, true);
      if (p >= 0) {
        body.price = p;
      }
    }
    if (elements.modalPurchasedSupplier) {
      body.supplier = elements.modalPurchasedSupplier.value.trim();
    }
  }

  setButtonLoading(elements.modalConfirmBtn, true, elements.modalConfirmBtn ? elements.modalConfirmBtn.innerHTML : null, 'جاري الحفظ...');

  try {
    const res = await fetch(`/api/items/${currentModalItem.id}/purchase`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      elements.purchaseModal.classList.add('hidden');
      showToast('تم التحديث', 'تم حفظ بيانات الشراء والمورد بنجاح', '👍', 'blue');
      try { await fetchItems(); } catch (e) {}
    } else {
      showToast('تعذر التحديث', data.error || 'فشل حفظ بيانات الشراء', '⚠️', 'rose');
    }
  } catch (err) {
    console.error('Purchase modal error:', err);
    showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم', '⚠️', 'rose');
  } finally {
    setButtonLoading(elements.modalConfirmBtn, false);
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
  const receivedQty = parseCleanNumber(elements.invModalReceivedQty.value, 0);
  const notes = elements.invModalNotes.value.trim();

  setButtonLoading(elements.invModalCompleteBtn, true, elements.invModalCompleteBtn ? elements.invModalCompleteBtn.innerHTML : null, 'جاري التأكيد...');

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
  } finally {
    setButtonLoading(elements.invModalCompleteBtn, false);
  }
});

elements.invModalUnsuppliedBtn.addEventListener('click', async () => {
  if (!currentModalItem) return;
  const notes = elements.invModalNotes.value.trim() || 'نقص لم يتم تجهيزه بالكامل';

  setButtonLoading(elements.invModalUnsuppliedBtn, true, elements.invModalUnsuppliedBtn ? elements.invModalUnsuppliedBtn.innerHTML : null, 'جاري القيد...');

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
  } finally {
    setButtonLoading(elements.invModalUnsuppliedBtn, false);
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

  // مزامنة ذكية دورية تعمل تلقائياً على كلاودفلاير أونلاين مع قفل لمنع تداخل الطلبات
  let isPolling = false;
  setInterval(async () => {
    if (!currentUser || isPolling) return;
    isPolling = true;
    try {
      const res = await fetch('/api/items', { headers: authHeaders() });
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        itemsData = data.items;
        handleIncomingNotifications(data.notifications);
        renderAll();
      }
    } catch (err) {
      // الصمت في حال انقطاع الشبكة اللحظي
    } finally {
      isPolling = false;
    }
  }, 3500);
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 12) return `منذ ${diffHours} ساعة`;

  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const timeStr = d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `اليوم ${timeStr}`;
  if (isYesterday) return `أمس ${timeStr}`;

  return `${d.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'numeric', day: 'numeric' })} ${timeStr}`;
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
// تصدير السجل إلى Excel (CSV يدعم العربية 100% مع صف إجمالي)
// ==========================================
// ==========================================
// مسار الحركة والتتبع التاريخي للمادة (Item Audit Trail)
// ==========================================
function openItemTimeline(id) {
  const item = itemsData.find(i => i.id === id);
  if (!item) return;

  if (elements.timelineItemHeader) {
    elements.timelineItemHeader.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div>
          <h4 class="font-black text-sm text-slate-900">${escapeHtml(item.name)}</h4>
          <p class="text-xs text-slate-500 mt-0.5">الكمية المطلوبة: <b class="text-slate-800">${item.quantity} ${item.unit}</b></p>
        </div>
        <div>
          ${getPriorityBadge(item.priority) || '<span class="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">عادي</span>'}
        </div>
      </div>
    `;
  }

  // 1. مرحلة الطلب
  const step1 = `
    <div class="relative flex items-start gap-3">
      <div class="timeline-dot bg-emerald-600 text-white font-bold flex items-center justify-center shadow-sm">1</div>
      <div class="flex-1 bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-xs space-y-1">
        <div class="flex items-center justify-between font-bold text-slate-800">
          <span>طلب المادة في النواقص</span>
          <span class="text-[10px] text-slate-400 font-normal">${formatTime(item.createdAt)}</span>
        </div>
        <p class="text-slate-600">بواسطة: <b>${escapeHtml(item.createdBy ? item.createdBy.name : 'موظف المخزن')}</b></p>
        <p class="text-slate-500">الكمية المطلوبة: ${item.quantity} ${item.unit}</p>
        ${item.notes ? `<p class="text-slate-600 bg-slate-50 p-1.5 rounded mt-1 border border-slate-100">📝 ملاحظة: ${escapeHtml(item.notes)}</p>` : ''}
      </div>
    </div>
  `;

  // 2. مرحلة الشراء
  let step2 = '';
  if (item.status === 'pending') {
    step2 = `
      <div class="relative flex items-start gap-3 opacity-60">
        <div class="timeline-dot bg-slate-300 text-slate-600 font-bold flex items-center justify-center">2</div>
        <div class="flex-1 bg-slate-50 p-3 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500">
          <div class="flex items-center justify-between font-bold">
            <span>مرحلة الشراء من السوق</span>
            <span class="text-[10px] text-amber-600 font-bold">قيد الانتظار ⏳</span>
          </div>
          <p class="mt-1">بانتظار شراء المادة من قبل مسؤول المشتريات.</p>
        </div>
      </div>
    `;
  } else if (item.status === 'unavailable') {
    step2 = `
      <div class="relative flex items-start gap-3">
        <div class="timeline-dot bg-rose-600 text-white font-bold flex items-center justify-center shadow-sm">✕</div>
        <div class="flex-1 bg-rose-50 p-3 rounded-xl border border-rose-200 shadow-sm text-xs space-y-1">
          <div class="flex items-center justify-between font-bold text-rose-800">
            <span>تعذر الشراء / غير متوفرة</span>
            <span class="text-[10px] text-rose-600 font-normal">${formatTime(item.purchasedAt || item.createdAt)}</span>
          </div>
          <p class="text-rose-700">المشتري: <b>${escapeHtml(item.purchasedBy ? item.purchasedBy.name : 'مسؤول المشتريات')}</b></p>
          <p class="text-rose-600 font-semibold bg-white/70 p-1.5 rounded">السبب: ${escapeHtml(item.missingReason || 'غير متوفرة في السوق')}</p>
        </div>
      </div>
    `;
  } else {
    const isPartial = item.status === 'partial' || (item.quantityPurchased && item.quantityPurchased < item.quantity);
    step2 = `
      <div class="relative flex items-start gap-3">
        <div class="timeline-dot bg-blue-600 text-white font-bold flex items-center justify-center shadow-sm">2</div>
        <div class="flex-1 bg-white p-3 rounded-xl border border-blue-200 shadow-sm text-xs space-y-1">
          <div class="flex items-center justify-between font-bold text-blue-900">
            <span>${isPartial ? 'تم شراء جزء من الكمية ⚠️' : 'تم الشراء من السوق ✅'}</span>
            <span class="text-[10px] text-slate-400 font-normal">${formatTime(item.purchasedAt || item.createdAt)}</span>
          </div>
          <p class="text-slate-600">المشتري: <b>${escapeHtml(item.purchasedBy ? item.purchasedBy.name : 'مسؤول المشتريات')}</b></p>
          <p class="text-slate-700">الكمية المشتراة: <b>${item.quantityPurchased || item.quantity} ${item.unit}</b></p>
          ${item.price ? `<p class="text-purple-700 font-bold">💰 السعر: ${formatPrice(item.price)}</p>` : ''}
          ${item.supplier ? `<p class="text-blue-800 font-semibold">🏬 المحل / المورد: ${escapeHtml(item.supplier)}</p>` : ''}
        </div>
      </div>
    `;
  }

  // 3. مرحلة الجرد والمطابقة بالمخزن
  let step3 = '';
  if (item.status === 'completed') {
    step3 = `
      <div class="relative flex items-start gap-3">
        <div class="timeline-dot bg-emerald-600 text-white font-bold flex items-center justify-center shadow-sm">3</div>
        <div class="flex-1 bg-emerald-50 p-3 rounded-xl border border-emerald-200 shadow-sm text-xs space-y-1">
          <div class="flex items-center justify-between font-bold text-emerald-900">
            <span>تم الجرد ودخول المخزن 📦</span>
            <span class="text-[10px] text-emerald-700 font-normal">${formatTime(item.completedAt || item.purchasedAt)}</span>
          </div>
          <p class="text-slate-600">المستلم: <b>${escapeHtml(item.confirmedBy ? item.confirmedBy.name : 'أمين المخزن')}</b></p>
          <p class="text-slate-700">الكمية المستلمة: <b>${item.receivedQuantity !== undefined ? item.receivedQuantity : (item.quantityPurchased || item.quantity)} ${item.unit}</b></p>
          ${item.inventoryNotes ? `<p class="text-slate-600 bg-white/70 p-1.5 rounded">ملاحظة الاستلام: ${escapeHtml(item.inventoryNotes)}</p>` : ''}
        </div>
      </div>
    `;
  } else if (item.status === 'purchased' || item.status === 'partial') {
    step3 = `
      <div class="relative flex items-start gap-3 opacity-80">
        <div class="timeline-dot bg-amber-500 text-white font-bold flex items-center justify-center shadow-sm">3</div>
        <div class="flex-1 bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
          <div class="flex items-center justify-between font-bold">
            <span>بانتظار مطابقة واستلام المخزن</span>
            <span class="text-[10px] text-amber-700 font-bold">قيد الفحص 🚚</span>
          </div>
          <p class="text-xs">المادة مشتراة وبانتظار معاينتها وجردها في المخزن لتأكيد الاستلام النهائي.</p>
        </div>
      </div>
    `;
  } else {
    step3 = `
      <div class="relative flex items-start gap-3 opacity-40">
        <div class="timeline-dot bg-slate-300 text-slate-600 font-bold flex items-center justify-center">3</div>
        <div class="flex-1 bg-slate-50 p-3 rounded-xl border border-dashed border-slate-300 text-xs text-slate-400">
          <span>الجرد النهائي في المخزن</span>
        </div>
      </div>
    `;
  }

  if (elements.timelineStepsContainer) {
    elements.timelineStepsContainer.innerHTML = step1 + step2 + step3;
  }

  if (elements.itemTimelineModal) {
    elements.itemTimelineModal.classList.remove('hidden');
  }
}

if (elements.timelineModalCloseBtn) {
  elements.timelineModalCloseBtn.addEventListener('click', () => {
    if (elements.itemTimelineModal) elements.itemTimelineModal.classList.add('hidden');
  });
}
if (elements.timelineModalOkBtn) {
  elements.timelineModalOkBtn.addEventListener('click', () => {
    if (elements.itemTimelineModal) elements.itemTimelineModal.classList.add('hidden');
  });
}

// ==========================================
// لوحة الإحصائيات والرسوم البيانية التفاعلية (Pure SVG & Bars)
// ==========================================
function renderAnalytics() {
  if (!elements.topShortagesChart && !elements.expensesSvgChart) return;

  // 1. حساب أكثر النواقص تكراراً
  const nameCounts = {};
  const displayNameMap = {};
  itemsData.forEach(item => {
    if (!item.name) return;
    const clean = item.name.trim().toLowerCase();
    nameCounts[clean] = (nameCounts[clean] || 0) + 1;
    if (!displayNameMap[clean]) displayNameMap[clean] = item.name.trim();
  });

  const sortedShortages = Object.entries(nameCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxShortage = sortedShortages.length > 0 ? sortedShortages[0][1] : 1;

  if (elements.topShortagesChart) {
    if (sortedShortages.length === 0) {
      elements.topShortagesChart.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">لا توجد بيانات كافية</p>';
    } else {
      const colors = [
        'bg-emerald-500',
        'bg-blue-500',
        'bg-amber-500',
        'bg-purple-500',
        'bg-rose-500'
      ];
      elements.topShortagesChart.innerHTML = sortedShortages.map(([key, count], idx) => {
        const pct = Math.max(12, Math.round((count / maxShortage) * 100));
        const colorClass = colors[idx % colors.length];
        return `
          <div class="space-y-1">
            <div class="flex justify-between text-xs font-bold">
              <span class="text-slate-800 truncate">${escapeHtml(displayNameMap[key])}</span>
              <span class="text-slate-500 font-mono">${count} مرات</span>
            </div>
            <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div class="h-2 rounded-full ${colorClass} transition-all duration-500" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 2. حساب إجمالي المصروفات والرسم البياني للمشتريات
  const purchasedItems = itemsData.filter(i => 
    ['purchased', 'partial', 'completed'].includes(i.status) && Number(i.price) > 0
  );

  const totalExpenses = purchasedItems.reduce((sum, i) => sum + (Number(i.price) || 0), 0);
  if (elements.analyticsExpensesTotal) {
    elements.analyticsExpensesTotal.textContent = totalExpenses > 0 ? formatPrice(totalExpenses) : '0 د.ع';
  }

  if (elements.expensesSvgChart) {
    if (purchasedItems.length === 0) {
      elements.expensesSvgChart.innerHTML = '<div class="text-xs text-slate-400 text-center py-8">لا توجد مشتريات بأسعار مسجلة حتى الآن</div>';
    } else {
      const dailyExpenses = {};
      purchasedItems.forEach(item => {
        const d = (item.purchasedAt || item.createdAt || '').slice(0, 10);
        if (d) {
          dailyExpenses[d] = (dailyExpenses[d] || 0) + (Number(item.price) || 0);
        }
      });

      const days = Object.keys(dailyExpenses).sort().slice(-7);
      const maxDaily = Math.max(...days.map(d => dailyExpenses[d]), 1);

      const chartWidth = 320;
      const chartHeight = 120;
      const barWidth = Math.max(16, Math.floor((chartWidth - 40) / Math.max(days.length, 1)) - 10);

      const barsSvg = days.map((day, idx) => {
        const val = dailyExpenses[day];
        const barH = Math.max(6, Math.round((val / maxDaily) * 75));
        const x = 20 + idx * (barWidth + 10);
        const y = 92 - barH;
        const shortDate = day.slice(5); // MM-DD
        return `
          <g class="transition-all hover:opacity-80">
            <title>${day}: ${formatPrice(val)}</title>
            <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="3" fill="#059669" />
            <text x="${x + barWidth / 2}" y="108" text-anchor="middle" font-size="8" fill="#64748b" font-weight="bold">${shortDate}</text>
            <text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle" font-size="8" fill="#1e293b" font-weight="bold">${Math.round(val / 1000)}k</text>
          </g>
        `;
      }).join('');

      elements.expensesSvgChart.innerHTML = `
        <svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="w-full h-auto overflow-visible">
          <line x1="10" y1="92" x2="${chartWidth - 10}" y2="92" stroke="#e2e8f0" stroke-width="1" />
          ${barsSvg}
        </svg>
      `;
    }
  }
}

// ==========================================
// إصدار ومعاينة وطباعة سند استلام مشتريات رسمي
// ==========================================
function openVoucherModal() {
  const filtered = getFilteredArchiveItems();
  const voucherItems = filtered.filter(i => ['purchased', 'partial', 'completed'].includes(i.status));
  const listToUse = voucherItems.length > 0 ? voucherItems : filtered;

  if (listToUse.length === 0) {
    showToast('تنبيه', 'لا توجد مواد مطابقة في السجل لإصدار سند استلام', '⚠️', 'amber');
    return;
  }

  const dateObj = new Date();
  const dateStr = dateObj.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'numeric', day: 'numeric' });
  const voucherNum = 'MN-' + Math.floor(1000 + Math.random() * 9000);

  if (elements.voucherNumber) elements.voucherNumber.textContent = voucherNum;
  if (elements.voucherDate) elements.voucherDate.textContent = dateStr;

  let totalQty = 0;
  let totalAmount = 0;

  if (elements.voucherItemsTbody) {
    elements.voucherItemsTbody.innerHTML = listToUse.map((item, idx) => {
      const qty = parseCleanNumber(item.quantityPurchased || item.quantity, 1);
      const price = parseCleanNumber(item.price, 0, true);
      totalQty += qty;
      totalAmount += price;

      return `
        <tr class="border-b border-slate-200">
          <td class="p-2 border border-slate-300 text-center font-bold">${idx + 1}</td>
          <td class="p-2 border border-slate-300 font-bold">${escapeHtml(item.name)}</td>
          <td class="p-2 border border-slate-300 text-center font-bold">${qty} ${item.unit || 'قطعة'}</td>
          <td class="p-2 border border-slate-300">${escapeHtml(item.supplier || '-')}</td>
          <td class="p-2 border border-slate-300 text-center font-bold text-slate-800">${price > 0 ? formatPrice(price) : 'غير مسجل'}</td>
          <td class="p-2 border border-slate-300">${escapeHtml(item.purchasedBy ? item.purchasedBy.name : (item.createdBy ? item.createdBy.name : ''))}</td>
        </tr>
      `;
    }).join('');
  }

  if (elements.voucherTotalQty) elements.voucherTotalQty.textContent = roundNumber(totalQty);
  if (elements.voucherTotalAmount) elements.voucherTotalAmount.textContent = formatPrice(totalAmount) || '0 د.ع';
  if (elements.voucherAmountWords) elements.voucherAmountWords.textContent = tafqeetIQD(totalAmount);

  if (elements.voucherPrintModal) {
    elements.voucherPrintModal.classList.remove('hidden');
  }
}

if (elements.voucherCloseBtn) {
  elements.voucherCloseBtn.addEventListener('click', () => {
    if (elements.voucherPrintModal) elements.voucherPrintModal.classList.add('hidden');
  });
}
if (elements.openVoucherBtn) {
  elements.openVoucherBtn.addEventListener('click', openVoucherModal);
}

// ==========================================
// مستمعي الفلاتر المتقدمة والتحليلات
// ==========================================
if (elements.toggleFiltersBtn) {
  elements.toggleFiltersBtn.addEventListener('click', () => {
    if (elements.advancedFiltersPanel) {
      elements.advancedFiltersPanel.classList.toggle('hidden');
    }
  });
}

if (elements.toggleAnalyticsBtn) {
  elements.toggleAnalyticsBtn.addEventListener('click', () => {
    if (elements.analyticsPanel) {
      elements.analyticsPanel.classList.toggle('hidden');
    }
  });
}

if (elements.resetFiltersBtn) {
  elements.resetFiltersBtn.addEventListener('click', () => {
    filterStatusVal = 'all';
    filterPriorityVal = 'all';
    filterDateFromVal = '';
    filterDateToVal = '';
    if (elements.filterStatus) elements.filterStatus.value = 'all';
    if (elements.filterPriority) elements.filterPriority.value = 'all';
    if (elements.filterDateFrom) elements.filterDateFrom.value = '';
    if (elements.filterDateTo) elements.filterDateTo.value = '';
    renderArchive();
  });
}

if (elements.filterStatus) {
  elements.filterStatus.addEventListener('change', (e) => {
    filterStatusVal = e.target.value;
    renderArchive();
  });
}

if (elements.filterPriority) {
  elements.filterPriority.addEventListener('change', (e) => {
    filterPriorityVal = e.target.value;
    renderArchive();
  });
}

if (elements.filterDateFrom) {
  elements.filterDateFrom.addEventListener('input', (e) => {
    filterDateFromVal = e.target.value;
    renderArchive();
  });
}

if (elements.filterDateTo) {
  elements.filterDateTo.addEventListener('input', (e) => {
    filterDateToVal = e.target.value;
    renderArchive();
  });
}

// ==========================================
// دعم PWA و Service Worker وتثبيت التطبيق
// ==========================================
let deferredPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('Service Worker registered:', reg.scope);
    }).catch(err => {
      console.warn('Service Worker registration failed:', err);
    });
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (elements.pwaInstallBanner && !localStorage.getItem('mankhul_pwa_dismissed')) {
    elements.pwaInstallBanner.classList.remove('hidden');
  }
});

if (elements.pwaInstallBtn) {
  elements.pwaInstallBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('تم التثبيت', 'تمت إضافة تطبيق نقوصات منخل للشاشة الرئيسية', '📱', 'emerald');
      }
      deferredPrompt = null;
    }
    if (elements.pwaInstallBanner) elements.pwaInstallBanner.classList.add('hidden');
  });
}

if (elements.pwaDismissBtn) {
  elements.pwaDismissBtn.addEventListener('click', () => {
    if (elements.pwaInstallBanner) elements.pwaInstallBanner.classList.add('hidden');
    localStorage.setItem('mankhul_pwa_dismissed', 'true');
  });
}

// ==========================================
// تصدير السجل إلى Excel (CSV يدعم العربية 100% مع صف إجمالي والمورد)
// ==========================================
if (elements.exportExcelBtn) {
  elements.exportExcelBtn.addEventListener('click', () => {
    const itemsToExport = getFilteredArchiveItems();
    if (itemsToExport.length === 0) {
      showToast('لا توجد بيانات', 'لا توجد بيانات مطابقة في السجل للتصدير', 'ℹ️', 'slate');
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
      'المحل / المورد',
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

    const rows = itemsToExport.map(item => [
      `"${(item.name || '').replace(/"/g, '""')}"`,
      parseCleanNumber(item.quantity, 1),
      `"${item.unit || 'قطعة'}"`,
      `"${priorityMap[item.priority] || 'عادي'}"`,
      `"${statusMap[item.status] || item.status}"`,
      parseCleanNumber(item.quantityPurchased, 0),
      parseCleanNumber(item.price, 0, true),
      `"${(item.supplier || '').replace(/"/g, '""')}"`,
      parseCleanNumber(item.receivedQuantity, 0),
      `"${(item.notes || '').replace(/"/g, '""')}"`,
      `"${(item.missingReason || '').replace(/"/g, '""')}"`,
      `"${(item.inventoryNotes || '').replace(/"/g, '""')}"`,
      `"${formatTime(item.createdAt)}"`,
      `"${item.purchasedBy ? item.purchasedBy.name : ''}"`
    ]);

    // حساب الإجماليات بدقة تامة
    const totalQty = itemsToExport.reduce((sum, i) => sum + parseCleanNumber(i.quantity, 0), 0);
    const totalPurchasedQty = itemsToExport.reduce((sum, i) => sum + parseCleanNumber(i.quantityPurchased, 0), 0);
    const totalReceivedQty = itemsToExport.reduce((sum, i) => sum + parseCleanNumber(i.receivedQuantity, 0), 0);
    const totalExpenses = itemsToExport
      .filter(i => ['purchased', 'partial', 'completed'].includes(i.status))
      .reduce((sum, i) => sum + parseCleanNumber(i.price, 0, true), 0);

    const summaryRow = [
      '"الإجمالي الكلي"',
      roundNumber(totalQty),
      '""',
      '""',
      `"إجمالي المواد: ${itemsToExport.length}"`,
      roundNumber(totalPurchasedQty),
      totalExpenses,
      '""',
      roundNumber(totalReceivedQty),
      '""',
      '""',
      '""',
      '""',
      '""'
    ];

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(',')), summaryRow.join(',')].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `تقرير_نقوصات_منخل_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('تم التصدير بنجاح', 'تم تنزيل ملف الإكسل المصفى متضمناً الموردين والإجماليات', '📊', 'emerald');
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
    if (elements.purchaseModal) elements.purchaseModal.classList.add('hidden');
    if (elements.inventoryModal) elements.inventoryModal.classList.add('hidden');
    if (elements.editItemModal) elements.editItemModal.classList.add('hidden');
    if (elements.itemTimelineModal) elements.itemTimelineModal.classList.add('hidden');
    if (elements.voucherPrintModal) elements.voucherPrintModal.classList.add('hidden');
  }
});

// إتاحة الدوال العامة على كائن window للأمان التام
window.openItemTimeline = openItemTimeline;
window.openVoucherModal = openVoucherModal;
window.openPurchaseModal = openPurchaseModal;
window.markPurchasedFast = markPurchasedFast;
window.openEditModal = openEditModal;
window.confirmInventoryFast = confirmInventoryFast;
window.openInventoryModal = openInventoryModal;
window.revertToPending = revertToPending;
window.reorderItem = reorderItem;
window.deleteItem = deleteItem;
window.changeUserPassword = changeUserPassword;
window.deleteUser = deleteUser;

// بدء التشغيل
applyTheme();
elements.soundIcon.textContent = soundEnabled ? '🔔' : '🔕';
applyUserRole();
initSocket();
fetchItems();

