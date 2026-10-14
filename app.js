// ==========================================
// تطبيق نقوصات منخل - الجانب العميل (Mobile Client with Auth & Admin)
// ==========================================

// حالة المستخدم والجلسة
let currentUser = null;
let sessionToken = null;
try {
  const saved = localStorage.getItem('mankhul_user');
  sessionToken = localStorage.getItem('mankhul_token');
  if (saved && sessionToken && /^[a-f0-9]{64}$/.test(sessionToken)) currentUser = JSON.parse(saved);
  else sessionToken = null;
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
  insertedHistoryList: document.getElementById('inserted-history-list'),
  insertedHistoryCount: document.getElementById('inserted-history-count'),

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
  statCash: document.getElementById('stat-cash'),
  statDebt: document.getElementById('stat-debt'),
  statDebtBox: document.getElementById('stat-debt-box'),
  openDebtListBtn: document.getElementById('open-debt-list-btn'),
  debtCountBadge: document.getElementById('debt-count-badge'),
  filterPayment: document.getElementById('filter-payment'),

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

  // نافذة تغيير رمز الموظف
  changePasswordModal: document.getElementById('change-password-modal'),
  changePassUserInfo: document.getElementById('change-pass-user-info'),
  changePassUserId: document.getElementById('change-pass-user-id'),
  changePassInput: document.getElementById('change-pass-input'),
  changePassSubmitBtn: document.getElementById('change-pass-submit-btn'),
  changePassCancelBtn: document.getElementById('change-pass-cancel-btn'),
  changePassCloseBtn: document.getElementById('change-pass-close-btn'),
  changePasswordForm: document.getElementById('change-password-form'),
  // نافذة كشف الديون والطباعة
  debtListModal: document.getElementById('debt-list-modal'),
  debtModalCloseBtn: document.getElementById('debt-modal-close-btn'),
  debtPrintBtn: document.getElementById('debt-print-btn'),
  debtExportExcelBtn: document.getElementById('debt-export-excel-btn'),
  debtModalTotalSum: document.getElementById('debt-modal-total-sum'),
  debtModalTotalCount: document.getElementById('debt-modal-total-count'),
  debtModalTotalSumTitle: document.getElementById('debt-modal-total-sum-title'),
  debtModalTotalCountTitle: document.getElementById('debt-modal-total-count-title'),
  debtSupplierFilter: document.getElementById('debt-supplier-filter'),
  debtStatementDate: document.getElementById('debt-statement-date'),
  debtStatementBadge: document.getElementById('debt-statement-badge'),
  debtStatementSupplierBox: document.getElementById('debt-statement-supplier-box'),
  debtStatementSupplierName: document.getElementById('debt-statement-supplier-name'),
  debtItemsTbody: document.getElementById('debt-items-tbody'),
  debtTableTotalAmount: document.getElementById('debt-table-total-amount'),
  debtTableTotalLabel: document.getElementById('debt-table-total-label'),
  debtAmountWords: document.getElementById('debt-amount-words'),
  modalPaymentFields: document.getElementById('modal-payment-fields'),

  // نافذة الشراء المباشر (مادة لم يذكرها المخزن)
  openDirectPurchaseBtn: document.getElementById('open-direct-purchase-btn'),
  directPurchaseModal: document.getElementById('direct-purchase-modal'),
  directPurchaseForm: document.getElementById('direct-purchase-form'),
  directPurchaseCloseBtn: document.getElementById('direct-purchase-close-btn'),
  directPurchaseCancelBtn: document.getElementById('direct-purchase-cancel-btn'),
  directPurchaseSubmitBtn: document.getElementById('direct-purchase-submit-btn'),
  directItemName: document.getElementById('direct-item-name'),
  directItemQuantity: document.getElementById('direct-item-quantity'),
  directItemUnit: document.getElementById('direct-item-unit'),
  directItemPrice: document.getElementById('direct-item-price'),
  directItemSupplier: document.getElementById('direct-item-supplier'),
  directItemNotes: document.getElementById('direct-item-notes'),

  toastContainer: document.getElementById('toast-container')
};

// متغيرات النوافذ المؤقتة
let currentModalAction = null;
let currentModalItem = null;
let editingItemId = null;
let editingItemVersion = 0;
let isFetchingItems = false;
let lastItemsJson = '';

// ==========================================
// دوال الطلبات مع الترويسة الأمنية للمستخدم
// ==========================================
function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (currentUser && currentUser.id) {
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  }
  return headers;
}

// ==========================================
// إدارة تسجيل الدخول والخروج
// ==========================================
async function apiFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const usedToken = sessionToken;
  try {
    const res = await fetch((window.MANKHUL_API_BASE || '') + url, { ...options, signal: controller.signal });
    if (res.status === 401 && !url.includes('/auth/login') && usedToken === sessionToken && sessionToken) clearSession();
    return res;
  } finally { clearTimeout(timeout); }
}
window.quickFillLogin = function(u) {
  if (elements.loginUsername) elements.loginUsername.value = u;
  if (elements.loginPassword) {
    elements.loginPassword.value = '';
    elements.loginPassword.focus();
  }
  if (elements.loginError) elements.loginError.classList.add('hidden');
};

elements.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = elements.loginUsername.value.trim();
  const password = elements.loginPassword.value;
  elements.loginError.classList.add('hidden');

  try {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success && data.user) {
      sessionToken = data.token;
      localStorage.setItem('mankhul_token', sessionToken);
      seenNotificationIds.clear();
      hasLoadedInitialNotifs = false;
      connectSocket();
      currentUser = data.user;
      window.currentUser = currentUser;
      localStorage.setItem('mankhul_user', JSON.stringify(currentUser));
      elements.loginScreen.classList.add('hidden');
      applyUserRole(false);
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

function clearSession() {
  currentUser = null;
  sessionToken = null;
  window.currentUser = null;
  localStorage.removeItem('mankhul_user');
  localStorage.removeItem('mankhul_token');
  if (socket) socket.disconnect();
  itemsData = []; usersData = []; lastItemsJson = '';
  seenNotificationIds.clear(); hasLoadedInitialNotifs = false;
  currentModalItem = null; editingItemId = null;
  elements.userDisplayName.textContent = '';
  elements.userRoleBadge.textContent = '';
  for (const modal of document.querySelectorAll('[role="dialog"]')) modal.classList.add('hidden');
  if (elements.adminUsersList) elements.adminUsersList.innerHTML = '';
  renderAll();
  applyUserRole(false);
}

elements.logoutBtn.addEventListener('click', async () => {
  if (!confirm('هل تريد بالتأكيد تسجيل الخروج؟')) return;
  try {
    const res = await apiFetch('/api/auth/logout', { method: 'POST', headers: authHeaders() });
    if (!res.ok) throw new Error('logout failed');
    clearSession();
    elements.loginUsername.value = '';
    elements.loginPassword.value = '';
  } catch {
    showToast('تعذر تسجيل الخروج', 'تحقق من الاتصال وأعد المحاولة لإبطال الجلسة بأمان', '⚠️', 'rose');
  }
});

// تطبيق صلاحيات المستخدم النشط
function applyUserRole(keepCurrentTab = false) {
  if (!currentUser) {
    for (const view of [elements.warehouseView, elements.purchasingView, elements.archiveView, elements.adminView]) view.classList.add('hidden');
    elements.loginScreen.classList.remove('hidden');
    elements.tabWarehouseBtn.classList.add('hidden');
    elements.tabPurchasingBtn.classList.add('hidden');
    elements.tabArchiveBtn.classList.add('hidden');
    elements.tabAdminBtn.classList.add('hidden');
    return;
  }

  elements.loginScreen.classList.add('hidden');
  elements.userDisplayName.textContent = currentUser.name;

  const roleLabels = {
    admin: 'المدير العام 👔',
    warehouse: 'مدير المخزن 🏬',
    purchasing: 'مدير المشتريات 🛒'
  };
  const roleBadges = {
    admin: 'bg-purple-600',
    warehouse: 'bg-emerald-600',
    purchasing: 'bg-blue-600'
  };

  elements.userRoleBadge.textContent = roleLabels[currentUser.role] || 'موظف';
  elements.userRoleBadge.className = `px-2 py-0.5 rounded text-[10px] text-white font-bold ${roleBadges[currentUser.role] || 'bg-slate-700'}`;

  // تعديل شريط التنقل وتأمين الشاشات حسب الصلاحية بدقة صارمة
  let defaultTab = 'warehouse';
  if (currentUser.role === 'admin') {
    // المدير العام يرى كافة الأقسام (المخزن، المشتريات، السجل، الموظفين)
    elements.mainNavBar.className = 'grid grid-cols-4 gap-1 bg-slate-800/90 p-1 rounded-xl text-xs font-bold text-center';
    elements.tabWarehouseBtn.classList.remove('hidden');
    elements.tabPurchasingBtn.classList.remove('hidden');
    elements.tabArchiveBtn.classList.remove('hidden');
    elements.tabAdminBtn.classList.remove('hidden');
    defaultTab = 'warehouse';
  } else if (currentUser.role === 'warehouse') {
    // مدير المخزن يرى المخزن والسجل فقط، وتختفي المشتريات والموظفين تماماً
    elements.mainNavBar.className = 'grid grid-cols-2 gap-1 bg-slate-800/90 p-1 rounded-xl text-xs font-bold text-center';
    elements.tabWarehouseBtn.classList.remove('hidden');
    elements.tabPurchasingBtn.classList.add('hidden');
    elements.tabArchiveBtn.classList.remove('hidden');
    elements.tabAdminBtn.classList.add('hidden');
    defaultTab = 'warehouse';
  } else if (currentUser.role === 'purchasing') {
    // مدير المشتريات يرى المشتريات والسجل فقط، ويختفي المخزن والموظفين تماماً
    elements.mainNavBar.className = 'grid grid-cols-2 gap-1 bg-slate-800/90 p-1 rounded-xl text-xs font-bold text-center';
    elements.tabWarehouseBtn.classList.add('hidden');
    elements.tabPurchasingBtn.classList.remove('hidden');
    elements.tabArchiveBtn.classList.remove('hidden');
    elements.tabAdminBtn.classList.add('hidden');
    defaultTab = 'purchasing';
  }

  // التأكد من أن التبويب المطلوب مصرح به للمستخدم
  let targetTab = (keepCurrentTab && currentTab) ? currentTab : defaultTab;
  if (currentUser.role === 'warehouse' && targetTab !== 'warehouse' && targetTab !== 'archive') {
    targetTab = 'warehouse';
  } else if (currentUser.role === 'purchasing' && targetTab !== 'purchasing' && targetTab !== 'archive') {
    targetTab = 'purchasing';
  } else if (currentUser.role !== 'admin' && targetTab === 'admin') {
    targetTab = 'archive';
  }

  switchTab(targetTab);
}

// ==========================================
// التبديل بين التبويبات
// ==========================================
function switchTab(tab) {
  if (!currentUser) return;

  // حماية وتأمين الصلاحيات: كل مستخدم يرى شاشاته المصرح بها فقط
  if (currentUser.role === 'warehouse') {
    if (tab !== 'warehouse' && tab !== 'archive') tab = 'warehouse';
  } else if (currentUser.role === 'purchasing') {
    if (tab !== 'purchasing' && tab !== 'archive') tab = 'purchasing';
  } else if (currentUser.role !== 'admin') {
    if (tab === 'admin') tab = 'archive';
  }

  currentTab = tab;

  // إخفاء كافة الشاشات
  elements.warehouseView.classList.add('hidden');
  elements.purchasingView.classList.add('hidden');
  elements.archiveView.classList.add('hidden');
  elements.adminView.classList.add('hidden');

  // تحديث حالة الأزرار مع الحفاظ الصارم على إخفاء التبويبات غير المصرح بها
  const updateTabButtonState = (btn, isActive, activeColor) => {
    if (!btn) return;
    const isHidden = (currentUser.role === 'warehouse' && (btn === elements.tabPurchasingBtn || btn === elements.tabAdminBtn)) ||
                     (currentUser.role === 'purchasing' && (btn === elements.tabWarehouseBtn || btn === elements.tabAdminBtn)) ||
                     (currentUser.role !== 'admin' && btn === elements.tabAdminBtn);

    if (isHidden) {
      btn.className = 'hidden';
      btn.classList.add('hidden');
      return;
    }

    btn.classList.remove('hidden');
    if (isActive) {
      btn.className = `py-2.5 px-1 rounded-lg transition-all flex items-center justify-center gap-1 ${activeColor} text-white shadow font-bold`;
    } else {
      btn.className = 'py-2.5 px-1 rounded-lg transition-all flex items-center justify-center gap-1 text-slate-300 hover:text-white';
    }
  };

  updateTabButtonState(elements.tabWarehouseBtn, tab === 'warehouse', 'bg-emerald-600');
  updateTabButtonState(elements.tabPurchasingBtn, tab === 'purchasing', 'bg-blue-600');
  updateTabButtonState(elements.tabArchiveBtn, tab === 'archive', 'bg-slate-700');
  updateTabButtonState(elements.tabAdminBtn, tab === 'admin', 'bg-purple-600');

  // تأكيد شبكة شريط التنقل
  if (currentUser.role === 'admin') {
    elements.mainNavBar.className = 'grid grid-cols-4 gap-1 bg-slate-800/90 p-1 rounded-xl text-xs font-bold text-center';
  } else {
    elements.mainNavBar.className = 'grid grid-cols-2 gap-1 bg-slate-800/90 p-1 rounded-xl text-xs font-bold text-center';
  }

  if (tab === 'warehouse') {
    elements.warehouseView.classList.remove('hidden');
  } else if (tab === 'purchasing') {
    elements.purchasingView.classList.remove('hidden');
  } else if (tab === 'archive') {
    elements.archiveView.classList.remove('hidden');
  } else if (tab === 'admin') {
    elements.adminView.classList.remove('hidden');
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
      <span class="text-xl">${escapeHtml(icon)}</span>
      <div class="flex-1">
        <h4 class="font-bold text-xs">${escapeHtml(title)}</h4>
        <p class="text-[11px] text-white/90 mt-0.5">${escapeHtml(message)}</p>
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
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, { body: message, icon: new URL('logo.jpg', document.baseURI).href, badge: new URL('logo.jpg', document.baseURI).href });
          }).catch(() => {});
        } else {
          new window.Notification(title, { body: message, icon: new URL('logo.jpg', document.baseURI).href });
        }
      }
    } catch (nErr) {
      // تجاهل أخطاء الهواتف
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
        if (n.targetRole === 'all' || currentUser.role === n.targetRole || currentUser.role === 'admin') {
          playNotificationSound(n.targetRole === 'warehouse' ? 'alert' : 'chime');
          showToast(n.title, n.body, n.targetRole === 'warehouse' ? '🚚' : '📦', n.targetRole === 'warehouse' ? 'amber' : 'blue');
        }
      }
    }
  }
  hasLoadedInitialNotifs = true;
}

async function fetchItems() {
  if (!currentUser || !sessionToken || isFetchingItems) return;
  isFetchingItems = true;
  const usedToken = sessionToken;
  try {
    const res = await apiFetch('/api/items', { headers: authHeaders() });
    const data = await res.json();
    if (usedToken !== sessionToken) return;
    if (!res.ok || !data.success) throw new Error(data.error || 'sync failed');
    handleIncomingNotifications(data.notifications);
    const nextJson = JSON.stringify(data.items || []);
    if (nextJson !== lastItemsJson) {
      lastItemsJson = nextJson;
      itemsData = data.items || [];
      renderAll();
      if (elements.debtListModal && !elements.debtListModal.classList.contains('hidden')) renderDebtTable();
    }
    const status = document.getElementById('sync-status');
    if (status) status.textContent = 'متصل — البيانات محدثة';
  } catch (err) {
    const status = document.getElementById('sync-status');
    if (status && usedToken === sessionToken) status.textContent = 'تعذر التحديث — تحقق من الاتصال';
  } finally { isFetchingItems = false; }
}

// جلب المستخدمين (للمدير)
async function fetchAdminUsers() {
  if (!currentUser || currentUser.role !== 'admin') return;
  const usedToken = sessionToken;
  try {
    const res = await apiFetch('/api/admin/users', { headers: authHeaders() });
    const data = await res.json();
    if (data.success && usedToken === sessionToken && currentUser?.role === 'admin') {
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
    Mankhul.hasPurchase(i)
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
  const intNum = Math.max(0, Math.round(Number(num) || 0));
  if (intNum <= 0) return 'صفر دينار عراقي';
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

  const billions = Math.floor(intNum / 1000000000);
  const millions = Math.floor((intNum % 1000000000) / 1000000);
  const thousands = Math.floor((intNum % 1000000) / 1000);
  const remainder = intNum % 1000;

  const parts = [];
  if (billions > 0) {
    if (billions === 1) parts.push('مليار');
    else if (billions === 2) parts.push('ملياران');
    else if (billions >= 3 && billions <= 10) parts.push(convertChunk(billions) + ' مليارات');
    else parts.push(convertChunk(billions) + ' مليار');
  }
  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions >= 3 && millions <= 10) parts.push(convertChunk(millions) + ' ملايين');
    else parts.push(convertChunk(millions) + ' مليون');
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
let filterPaymentVal = 'all';
let filterPriorityVal = 'all';
let filterDateFromVal = '';
let filterDateToVal = '';
let debtSupplierFilterVal = 'all';

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
      const matchCreator = item.createdBy && item.createdBy.name && item.createdBy.name.toLowerCase().includes(searchTerm);
      const matchPrice = item.price && String(item.price).includes(searchTerm);
      if (!matchName && !matchNotes && !matchReason && !matchSupplier && !matchBuyer && !matchCreator && !matchPrice) return false;
    }

    // 2. فلتر الحالة
    if (filterStatusVal !== 'all' && item.status !== filterStatusVal) {
      return false;
    }

    // 2.5 فلتر طريقة الدفع (نقد / دين)
    if (filterPaymentVal !== 'all') {
      const pm = item.paymentMethod || 'cash';
      if (pm !== filterPaymentVal) return false;
    }

    // 3. فلتر درجة الأهمية
    if (filterPriorityVal !== 'all' && (item.priority || 'normal') !== filterPriorityVal) {
      return false;
    }

    // 4. النطاق الزمني
    if (filterDateFromVal) {
      const itemDate = (item.createdAt || '').slice(0, 10);
      if (!itemDate || itemDate < filterDateFromVal) return false;
    }
    if (filterDateToVal) {
      const itemDate = (item.createdAt || '').slice(0, 10);
      if (!itemDate || itemDate > filterDateToVal) return false;
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
  const purchasedItems = itemsData.filter(i => Mankhul.hasPurchase(i));
  const totalExpenses = purchasedItems
    .reduce((sum, i) => sum + parseCleanNumber(i.price, 0, true), 0);

  const totalCash = purchasedItems
    .filter(i => (i.paymentMethod || 'cash') === 'cash')
    .reduce((sum, i) => sum + parseCleanNumber(i.price, 0, true), 0);

  const debtItems = itemsData.filter(Mankhul.isDebt);

  const totalDebt = debtItems
    .reduce((sum, i) => sum + parseCleanNumber(i.price, 0, true), 0);

  if (elements.statExpenses) {
    elements.statExpenses.textContent = totalExpenses > 0 ? Number(totalExpenses).toLocaleString('en-US') + ' د.ع' : '0 د.ع';
  }
  if (elements.statCash) {
    elements.statCash.textContent = totalCash > 0 ? Number(totalCash).toLocaleString('en-US') + ' د.ع' : '0 د.ع';
  }
  if (elements.statDebt) {
    elements.statDebt.textContent = totalDebt > 0 ? Number(totalDebt).toLocaleString('en-US') + ' د.ع' : '0 د.ع';
  }
  if (elements.debtCountBadge) {
    if (debtItems.length > 0) {
      elements.debtCountBadge.textContent = debtItems.length;
      elements.debtCountBadge.classList.remove('hidden');
    } else {
      elements.debtCountBadge.classList.add('hidden');
    }
  }
}

// عرض سجل وهستوري المواد المدرجة في النواقص مع إمكانية الحذف الفوري
function renderInsertedHistory() {
  if (!elements.insertedHistoryList) return;

  const insertedItems = [...itemsData].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (elements.insertedHistoryCount) {
    elements.insertedHistoryCount.textContent = insertedItems.length;
  }

  if (insertedItems.length === 0) {
    elements.insertedHistoryList.innerHTML = `
      <div class="text-center py-5 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400">
        <span class="text-xl block mb-1">📝</span>
        <p class="text-[11px] font-semibold">لا توجد مواد مدرجة حالياً في الهستوري</p>
        <p class="text-[10px] text-slate-400 mt-0.5">اكتب النقص من النموذج أعلاه واضغط إرسال ليظهر هنا فوراً</p>
      </div>
    `;
    return;
  }

  elements.insertedHistoryList.innerHTML = insertedItems.map(item => {
    let statusBadge = '';
    if (item.status === 'pending') {
      statusBadge = '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800">بانتظار الشراء</span>';
    } else if (item.status === 'purchased') {
      statusBadge = '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-800">تم الشراء</span>';
    } else if (item.status === 'partial') {
      statusBadge = `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800">شراء جزء (${item.quantityPurchased})</span>`;
    } else if (item.status === 'unavailable') {
      statusBadge = `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-800">${Mankhul.hasPurchase(item) ? 'استلام ناقص' : 'غير متوفر'}</span>`;
    } else if (item.status === 'completed') {
      statusBadge = '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">مكتمل بالمخزن</span>';
    }

    return `
      <div class="bg-slate-50 hover:bg-slate-100/80 p-2.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-2 transition-all">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <h4 class="font-black text-xs text-slate-900 truncate max-w-[150px] sm:max-w-xs">${escapeHtml(item.name)}</h4>
            <span class="font-bold text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
              ${item.quantity} ${escapeHtml(item.unit)}
            </span>
            ${getPriorityBadge(item.priority)}
            ${statusBadge}
          </div>
          <div class="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
            <span>🕒 ${formatTime(item.createdAt)}</span>
            ${item.createdBy ? `<span class="text-slate-600 bg-white px-1.5 py-0.2 rounded border border-slate-100">بواسطة: ${escapeHtml(item.createdBy.name)}</span>` : ''}
            ${item.notes ? `<span class="text-slate-500 truncate max-w-[120px]">📝 ${escapeHtml(item.notes)}</span>` : ''}
          </div>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <button onclick="openEditModal('${item.id}')" class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-white rounded-lg transition-colors" title="تعديل المادة">
            ✏️
          </button>
          ${!Mankhul.hasPurchase(item) && !Mankhul.isDebt(item) ? `<button onclick="deleteItem('${item.id}')" class="p-1.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 font-bold rounded-lg text-[10px] flex items-center gap-1 transition-all active:scale-95 shadow-xs" title="حذف المادة">
            <span>🗑️</span>
            <span>حذف</span>
          </button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// 1. شاشة المخزن
function renderWarehouse() {
  renderInsertedHistory();
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
              الكمية: ${item.quantity} ${escapeHtml(item.unit)}
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
              المطلوب: <span class="font-bold">${item.quantity} ${escapeHtml(item.unit)}</span> |
              المشترى: <span class="font-bold text-emerald-600">${item.quantityPurchased || item.quantity} ${escapeHtml(item.unit)}</span>
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
                الكمية: ${item.quantity} ${escapeHtml(item.unit)}
              </span>
              ${item.price ? `<span class="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">💰 ${formatPrice(item.price)}</span>` : ''}
              ${item.paymentMethod === 'debt' ? `<span class="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-300">⏳ دين</span>` : (item.price > 0 ? `<span class="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">💵 نقد</span>` : '')}
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

        ${(item.status === 'pending' || item.status === 'unavailable') && !Mankhul.hasPurchase(item) ? `
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
          <div class="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 flex-wrap gap-2">
            <span>تم في: ${formatTime(item.purchasedAt || item.createdAt)}</span>
            <div class="flex items-center gap-2">
              ${item.paymentMethod === 'debt' && currentUser?.role !== 'warehouse' ? `
                <button onclick="settleDebtItem('${item.id}')" class="text-amber-800 hover:text-amber-950 font-bold bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 active:scale-95 transition-all shadow-xs" title="تسديد دين المادة">
                  <span>💰 تسديد الدين</span>
                </button>
              ` : ''}
              <button onclick="openItemTimeline('${item.id}')" class="text-indigo-600 hover:underline font-bold text-[11px]">
                تتبع الحركة 🕒
              </button>
              ${!Mankhul.hasPurchase(item) && !item.confirmedBy ? `<button onclick="revertToPending('${item.id}')" class="text-blue-600 hover:underline font-bold text-[11px]">
                تعديل الحالة 🔄
              </button>` : ''}
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
  const isCustomFilterActive = (filterStatusVal !== 'all' || filterPriorityVal !== 'all' || filterPaymentVal !== 'all' || filterDateFromVal || filterDateToVal);
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
      statusLabel = Mankhul.hasPurchase(item) ? 'استلام ناقص / متبقي للمخزن ⚠️' : 'غير متوفر في السوق ❌';
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
              المطلوب: <b>${item.quantity} ${escapeHtml(item.unit)}</b>
              ${item.quantityPurchased ? ` | المشترى: <b>${item.quantityPurchased}</b>` : ''}
              ${item.receivedQuantity ? ` | المستلم: <b>${item.receivedQuantity}</b>` : ''}
              ${item.price ? ` | السعر: <b class="text-purple-700 font-bold">${formatPrice(item.price)}</b>` : ''}
              ${item.paymentMethod === 'debt' ? `<span class="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded font-bold border border-amber-300">⏳ مسجل دين</span>` : (item.price > 0 ? `<span class="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded font-bold border border-emerald-200">💵 مدفوع نقداً</span>` : '')}
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
            ${item.paymentMethod === 'debt' && currentUser?.role !== 'warehouse' ? `
              <button onclick="settleDebtItem('${item.id}')" class="text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-0.5 rounded font-bold text-[10px] flex items-center gap-0.5 shadow-xs transition-all" title="تسديد الدين">
                <span>💰</span> <span>تسديد الدين</span>
              </button>
            ` : ''}
            ${currentUser?.role !== 'purchasing' && (item.status === 'unavailable' || item.status === 'partial' || item.status === 'completed') ? `
              <button onclick="reorderItem('${item.id}')" class="text-emerald-700 hover:underline font-bold">
                طلب مرة أخرى 🔄
              </button>
            ` : ''}
            ${currentUser && (currentUser.role === 'admin' || currentUser.role === 'warehouse') ? `
              <button onclick="openEditModal('${item.id}')" class="text-slate-400 hover:text-emerald-600">
                ✏️
              </button>
            ` : ''}
            ${currentUser && !Mankhul.hasPurchase(item) && !Mankhul.isDebt(item) && (currentUser.role === 'admin' || currentUser.role === 'warehouse') ? `
              <button onclick="deleteItem('${item.id}')" class="text-rose-400 hover:text-rose-600 font-bold" title="حذف المادة">
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
        <button onclick="changeUserPassword('${u.id}')" class="p-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold" title="تغيير كلمة المرور">
          🔑 رمز
        </button>
        ${u.username !== 'admin' ? `
          <button onclick="deleteUser('${u.id}')" class="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-xs" title="حذف">
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
  const password = elements.newUserPassword.value;
  const role = elements.newUserRole.value;

  if (!name || !username || !password) return;

  setButtonLoading(elements.addUserSubmitBtn, true, elements.addUserSubmitBtn ? elements.addUserSubmitBtn.innerHTML : null, 'جاري الإنشاء...');

  try {
    const res = await apiFetch('/api/admin/users', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, username, password, role })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      elements.newUserName.value = '';
      elements.newUserUsername.value = '';
      elements.newUserPassword.value = '';
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

function openChangePasswordModal(id) {
  const user = usersData.find(u => u.id === id);
  const displayName = user ? `${user.name} (${user.username})` : 'الموظف';
  if (elements.changePassUserId) elements.changePassUserId.value = id;
  if (elements.changePassUserInfo) {
    elements.changePassUserInfo.textContent = displayName;
  }
  if (elements.changePassInput) {
    elements.changePassInput.value = '';
  }
  if (elements.changePasswordModal) {
    elements.changePasswordModal.classList.remove('hidden');
    setTimeout(() => {
      if (elements.changePassInput) elements.changePassInput.focus();
    }, 50);
  }
}

function closeChangePasswordModal() {
  if (elements.changePasswordModal) {
    elements.changePasswordModal.classList.add('hidden');
  }
  if (elements.changePassInput) {
    elements.changePassInput.value = '';
  }
}

if (elements.changePassCloseBtn) {
  elements.changePassCloseBtn.addEventListener('click', closeChangePasswordModal);
}
if (elements.changePassCancelBtn) {
  elements.changePassCancelBtn.addEventListener('click', closeChangePasswordModal);
}

if (elements.changePasswordForm) {
  elements.changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = elements.changePassUserId.value;
    const newPass = elements.changePassInput.value;
    if (!id || !newPass) return;

    const user = usersData.find(u => u.id === id);
    const displayName = user ? user.name : 'الموظف';

    setButtonLoading(elements.changePassSubmitBtn, true, elements.changePassSubmitBtn ? elements.changePassSubmitBtn.innerHTML : null, 'جاري الحفظ...');

    try {
      const res = await apiFetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ password: newPass })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.success === undefined)) {
        closeChangePasswordModal();
        showToast('تم التعديل', `تم تغيير رمز الدخول لـ ${displayName} بنجاح`, '🔑', 'purple');
        try { await fetchAdminUsers(); } catch (e) {}
      } else {
        showToast('تعذر التعديل', data.error || 'تعذر تعديل رمز الدخول', '⚠️', 'rose');
      }
    } catch (err) {
      console.error('Change password error:', err);
      showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم لتعديل الرمز', '⚠️', 'rose');
    } finally {
      setButtonLoading(elements.changePassSubmitBtn, false);
    }
  });
}

const changeUserPassword = openChangePasswordModal;

async function deleteUser(id, name) {
  const user = usersData.find(u => u.id === id);
  const displayName = name || (user ? user.name : 'الموظف');
  if (!confirm(`هل أنت متأكد من حذف حساب الموظف (${displayName})؟ لن يتمكن من الدخول للنظام بعد ذلك.`)) return;
  try {
    const res = await apiFetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      showToast('تم الحذف', `تم حذف حساب ${displayName}`, '🗑️', 'slate');
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
    const res = await apiFetch('/api/items', {
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
  editingItemVersion = item.version || 0;
  const allowFinancialEdit = currentUser?.role === 'admin' && Mankhul.hasPurchase(item);
  if (elements.editItemPrice) elements.editItemPrice.disabled = !allowFinancialEdit;
  if (elements.editItemSupplier) elements.editItemSupplier.disabled = currentUser?.role !== 'admin';
  document.querySelectorAll('input[name="edit-item-payment-method"]').forEach(input => { input.disabled = true; });
  if (elements.editItemQuantity) elements.editItemQuantity.disabled = Mankhul.hasPurchase(item);
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

  const paymentRadios = document.querySelectorAll('input[name="edit-item-payment-method"]');
  paymentRadios.forEach(radio => {
    radio.checked = radio.value === (item.paymentMethod || 'cash');
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

    const payload = { name, quantity, unit, notes, priority, version: editingItemVersion };
    if (elements.editItemPrice && !elements.editItemPrice.disabled) {
      const p = parseCleanNumber(elements.editItemPrice.value, -1, true);
      if (p >= 0) payload.price = p;
    }
    if (elements.editItemSupplier && !elements.editItemSupplier.disabled) {
      payload.supplier = elements.editItemSupplier.value.trim();
    }
    const editPaymentRadio = document.querySelector('input[name="edit-item-payment-method"]:checked');
    if (editPaymentRadio && !editPaymentRadio.disabled) {
      payload.paymentMethod = editPaymentRadio.value;
    }

    setButtonLoading(elements.editModalSaveBtn, true, elements.editModalSaveBtn ? elements.editModalSaveBtn.innerHTML : null, 'جاري الحفظ...');

    try {
      const res = await apiFetch(`/api/items/${editingItemId}`, {
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

function openPurchaseModal(id, action) {
  const item = itemsData.find(i => i.id === id);
  if (!item) return;

  currentModalItem = item;
  currentModalAction = action || 'purchased';

  elements.modalItemInfo.innerHTML = `
    <p class="font-bold">${escapeHtml(item.name)}</p>
    <p class="text-slate-500">الكمية المطلوبة: ${item.quantity} ${escapeHtml(item.unit)}</p>
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
    if (elements.modalPaymentFields) elements.modalPaymentFields.classList.remove('hidden');
    elements.modalPurchasedQty.max = Math.max(0.01, Number(item.quantity) - 0.01);
    elements.modalPurchasedQty.value = Math.max(0.01, Math.round(Number(item.quantity) * 50) / 100);
  } else if (currentModalAction === 'unavailable') {
    elements.modalTitle.textContent = 'تسجيل مادة غير متوفرة / لم تجهز';
    elements.modalPartialFields.classList.add('hidden');
    elements.modalReasonFields.classList.remove('hidden');
    if (priceFields) priceFields.classList.add('hidden');
    if (supplierFields) supplierFields.classList.add('hidden');
    if (elements.modalPaymentFields) elements.modalPaymentFields.classList.add('hidden');
    elements.modalMissingReason.value = '';
  } else {
    // شراء كامل مع إمكانية توثيق السعر والمحل فوراً
    elements.modalTitle.textContent = 'تسجيل شراء المادة وتوثيق السعر';
    elements.modalPartialFields.classList.add('hidden');
    elements.modalReasonFields.classList.add('hidden');
    if (priceFields) priceFields.classList.remove('hidden');
    if (supplierFields) supplierFields.classList.remove('hidden');
    if (elements.modalPaymentFields) elements.modalPaymentFields.classList.remove('hidden');
  }

  // ضبط خيار طريقة الدفع (نقد / دين)
  const modalPaymentRadios = document.querySelectorAll('input[name="modal-payment-method"]');
  modalPaymentRadios.forEach(radio => {
    radio.checked = radio.value === (item.paymentMethod || 'cash');
  });

  elements.purchaseModal.classList.remove('hidden');
}

elements.modalConfirmBtn.addEventListener('click', async () => {
  if (!currentModalItem) return;

  const body = { version: currentModalItem.version || 0 };
  if (currentModalAction === 'partial') {
    const qty = parseCleanNumber(elements.modalPurchasedQty.value, 0);
    if (!qty || qty <= 0 || qty >= Number(currentModalItem.quantity)) {
      showToast('تنبيه', 'أدخل كمية موجبة أقل من المطلوب للشراء الجزئي', '⚠️', 'amber');
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
    const paymentRadio = document.querySelector('input[name="modal-payment-method"]:checked');
    body.paymentMethod = paymentRadio ? paymentRadio.value : 'cash';

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
    const res = await apiFetch(`/api/items/${currentModalItem.id}/purchase`, {
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
    const res = await apiFetch(`/api/items/${id}/confirm`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'completed', receivedQuantity: received, inventoryNotes: 'مستلمة ومطابقة', version: item?.version || 0 })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      showToast('تم الجرد', data.item?.status === 'unavailable' ? 'تم حفظ المستلم والمتبقي؛ يمكنك طلب الكمية الناقصة من السجل' : 'تم تأكيد الاستلام ودخول المادة للمخزن', '✅', 'emerald');
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
    <p class="text-slate-500">المطلوب: ${item.quantity} ${escapeHtml(item.unit)} | المشترى: ${item.quantityPurchased || item.quantity} ${escapeHtml(item.unit)}</p>
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
    const res = await apiFetch(`/api/items/${currentModalItem.id}/confirm`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'completed', receivedQuantity: receivedQty, inventoryNotes: notes, version: currentModalItem.version || 0 })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      elements.inventoryModal.classList.add('hidden');
      showToast('تم الجرد', data.item?.status === 'unavailable' ? 'تم حفظ المستلم والمتبقي؛ يمكنك طلب الكمية الناقصة من السجل' : 'تم حفظ جرد المادة في المخزن', '📦', 'emerald');
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
    const res = await apiFetch(`/api/items/${currentModalItem.id}/confirm`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'unavailable', receivedQuantity: parseCleanNumber(elements.invModalReceivedQty.value, 0), inventoryNotes: notes, version: currentModalItem.version || 0 })
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
    const res = await apiFetch('/api/purchases/notify-warehouse', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message: 'تم شراء المواد من السوق وهي جاهزة للجرد في المخزن.' })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      showToast('تم التنبيه 📢', 'تم حفظ الإشعار ليظهر للمخزن عند الاتصال', '🚚', 'blue');
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
    const res = await apiFetch(`/api/items/${id}/purchase`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ status: 'pending', missingReason: '', version: itemsData.find(i => i.id === id)?.version || 0 })
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
    const res = await apiFetch(`/api/items/${id}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ version: itemsData.find(i => i.id === id)?.version || 0 }),
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
    const res = await apiFetch(`/api/items/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ version: itemsData.find(i => i.id === id)?.version || 0 }),
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

function connectSocket() {
  if (typeof io !== 'function' || !sessionToken) return;
  if (socket) socket.disconnect();
  socket = io({ auth: { token: sessionToken }, timeout: 3000 });
  for (const name of ['item:added', 'item:purchased', 'item:confirmed', 'item:updated', 'item:deleted']) {
    socket.on(name, data => {
      if (!currentUser) return;
      if (data.notification) handleIncomingNotifications([data.notification]);
      void fetchItems();
    });
  }
  for (const name of ['notification:delivery', 'notification:debt_settled']) socket.on(name, data => handleIncomingNotifications([data]));
}
function initSocket() {
  if (!window.MANKHUL_API_BASE) {
    const script = document.createElement('script');
    script.src = '/socket.io/socket.io.js';
    script.onload = connectSocket;
    document.head.appendChild(script);
  }
  setInterval(() => {
    if (currentUser && !document.hidden && !socket?.connected) void fetchItems();
  }, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void fetchItems(); });
  window.addEventListener('online', () => { void verifySession(); void fetchItems(); });
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
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    let msg = `*☕ قائمة نقوصات مقهى منخل المطلوبة للشراء*\n📅 التاريخ: ${dateStr}\n\n`;

    pending.forEach((item, index) => {
      let priorityTag = '';
      if (item.priority === 'emergency') priorityTag = ' 🚨 [طارئ - متوقف العمل 🔥]';
      else if (item.priority === 'urgent') priorityTag = ' ⚡ [مهم ومستعجل]';

      msg += `${index + 1}. *${item.name}* - الكمية: (${item.quantity} ${item.unit})${priorityTag}\n`;
      if (item.notes) msg += `   📝 ملاحظة: ${item.notes}\n`;
    });

    msg += `\n📊 *المجموع:* ${pending.length} مواد مطلوبة.\n☕ _مقهى منخل - إدارة المشتريات والمخزن_`;

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
          <p class="text-xs text-slate-500 mt-0.5">الكمية المطلوبة: <b class="text-slate-800">${item.quantity} ${escapeHtml(item.unit)}</b></p>
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
        <p class="text-slate-500">الكمية المطلوبة: ${item.quantity} ${escapeHtml(item.unit)}</p>
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
  } else if (item.status === 'unavailable' && !Mankhul.hasPurchase(item)) {
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
          <p class="text-slate-700">الكمية المشتراة: <b>${item.quantityPurchased || item.quantity} ${escapeHtml(item.unit)}</b></p>
          ${item.price ? `<p class="text-purple-700 font-bold">💰 السعر: ${formatPrice(item.price)}</p>` : ''}
          ${item.supplier ? `<p class="text-blue-800 font-semibold">🏬 المحل / المورد: ${escapeHtml(item.supplier)}</p>` : ''}
        </div>
      </div>
    `;
  }

  // 3. مرحلة الجرد والمطابقة بالمخزن
  let step3 = '';
  if (item.confirmedBy || item.status === 'completed') {
    step3 = `
      <div class="relative flex items-start gap-3">
        <div class="timeline-dot bg-emerald-600 text-white font-bold flex items-center justify-center shadow-sm">3</div>
        <div class="flex-1 bg-emerald-50 p-3 rounded-xl border border-emerald-200 shadow-sm text-xs space-y-1">
          <div class="flex items-center justify-between font-bold text-emerald-900">
            <span>${item.status === 'completed' ? 'تم الجرد ودخول المخزن 📦' : 'استلام ناقص بالمخزن ⚠️'}</span>
            <span class="text-[10px] text-emerald-700 font-normal">${formatTime(item.completedAt || item.purchasedAt)}</span>
          </div>
          <p class="text-slate-600">المستلم: <b>${escapeHtml(item.confirmedBy ? item.confirmedBy.name : 'أمين المخزن')}</b></p>
          <p class="text-slate-700">الكمية المستلمة: <b>${item.receivedQuantity !== undefined ? item.receivedQuantity : (item.quantityPurchased || item.quantity)} ${escapeHtml(item.unit)}</b></p>
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
    const actions = { created: 'إنشاء الطلب', 'direct-purchase': 'شراء مباشر', purchase: 'تسجيل الشراء', confirm: 'جرد المخزن', edit: 'تعديل البيانات', 'settle-debt': 'تسديد الدين' };
    const audit = (item.history || []).map(entry => {
      const details = entry.action === 'settle-debt' ? ' — ' + formatPrice(entry.details?.amount) : '';
      return '<p class="text-xs text-slate-600">' + escapeHtml(actions[entry.action] || entry.action) + ' — ' + escapeHtml(entry.by?.name || '') + escapeHtml(details) + '<br><span dir="ltr" class="text-[10px]">' + escapeHtml(Mankhul.absoluteDate(entry.at)) + '</span></p>';
    }).join('');
    elements.timelineStepsContainer.innerHTML = step1 + step2 + step3 + (audit ? '<div class="bg-slate-50 p-3 rounded-xl space-y-2"><h4 class="text-xs font-bold">سجل العمليات</h4>' + audit + '</div>' : '');
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
    Mankhul.hasPurchase(i) && Number(i.price) > 0
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
        const valLabel = val >= 1000 ? `${Math.round(val / 1000)}k` : `${val}`;
        return `
          <g class="transition-all hover:opacity-80">
            <title>${day}: ${formatPrice(val)}</title>
            <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="3" fill="#059669" />
            <text x="${x + barWidth / 2}" y="108" text-anchor="middle" font-size="8" fill="#64748b" font-weight="bold">${shortDate}</text>
            <text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle" font-size="8" fill="#1e293b" font-weight="bold" class="chart-bar-label">${valLabel}</text>
          </g>
        `;
      }).join('');

      elements.expensesSvgChart.innerHTML = `
        <svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="w-full h-auto overflow-visible">
          <line x1="10" y1="92" x2="${chartWidth - 10}" y2="92" stroke="#e2e8f0" stroke-width="1" class="chart-axis-line" />
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
  const voucherItems = filtered.filter(i => Mankhul.hasPurchase(i));
  const listToUse = voucherItems;

  if (listToUse.length === 0) {
    showToast('تنبيه', 'لا توجد مواد مطابقة في السجل لإصدار سند استلام', '⚠️', 'amber');
    return;
  }

  const dateObj = new Date();
  const dateStr = dateObj.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'numeric', day: 'numeric' });
  const voucherNum = 'MN-' + Date.now().toString(36).toUpperCase();

  if (elements.voucherNumber) elements.voucherNumber.textContent = voucherNum;
  if (elements.voucherDate) elements.voucherDate.textContent = dateStr;
  const voucherStatus = document.getElementById('voucher-status');
  if (voucherStatus) voucherStatus.textContent = listToUse.every(item => item.status === 'completed') ? 'مستلمة بحسب السجل ✓' : 'مشتريات مسجلة — الاستلام غير مكتمل';

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
          <td class="p-2 border border-slate-300 text-center font-bold">${qty} ${escapeHtml(item.unit || 'قطعة')}</td>
          <td class="p-2 border border-slate-300">${escapeHtml(item.supplier || '-')}</td>
          <td class="p-2 border border-slate-300 text-center font-bold text-slate-800">${price > 0 ? formatPrice(price) : 'غير مسجل'}</td>
          <td class="p-2 border border-slate-300">${escapeHtml(item.purchasedBy ? item.purchasedBy.name : (item.createdBy ? item.createdBy.name : ''))}</td>
        </tr>
      `;
    }).join('');
  }

  if (elements.voucherTotalQty) elements.voucherTotalQty.textContent = Mankhul.quantityTotals(listToUse, 'quantityPurchased');
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

function printVoucher() {
  document.body.classList.add('printing-voucher');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-voucher');
  }, 1000);
}

// ==========================================
// إدارة كشف حساب الديون المعلقة والطباعة والتسديد
// ==========================================
function openDebtListModal() {
  const debtItems = itemsData.filter(i => Mankhul.isDebt(i));

  // تعبئة قائمة الموردين الدائنين
  if (elements.debtSupplierFilter) {
    const suppliers = new Set();
    debtItems.forEach(item => {
      const s = (item.supplier || '').trim();
      if (s) suppliers.add(s);
    });

    const currentSelected = elements.debtSupplierFilter.value;
    let optionsHtml = '<option value="all">🔍 كافة الموردين والمحلات (عرض عام)</option>';
    suppliers.forEach(s => {
      optionsHtml += `<option value="${escapeHtml(s)}">🏬 ${escapeHtml(s)}</option>`;
    });
    elements.debtSupplierFilter.innerHTML = optionsHtml;

    if (currentSelected && (currentSelected === 'all' || suppliers.has(currentSelected))) {
      elements.debtSupplierFilter.value = currentSelected;
      debtSupplierFilterVal = currentSelected;
    } else {
      elements.debtSupplierFilter.value = 'all';
      debtSupplierFilterVal = 'all';
    }
  }

  renderDebtTable();

  if (elements.debtListModal) {
    elements.debtListModal.classList.remove('hidden');
  }
}

function renderDebtTable() {
  // تصفية المواد الغير مدفوعة (المسجلة دين وسعرها أكبر من صفر)
  const debtItems = itemsData.filter(i => Mankhul.isDebt(i));

  // فلترة حسب المورد إذا تم اختياره
  const isSpecificSupplier = (debtSupplierFilterVal && debtSupplierFilterVal !== 'all');
  const filteredDebts = isSpecificSupplier
    ? debtItems.filter(i => (i.supplier || '').trim() === debtSupplierFilterVal)
    : debtItems;

  const dateObj = new Date();
  const dateStr = dateObj.toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' });
  if (elements.debtStatementDate) {
    elements.debtStatementDate.textContent = dateStr;
  }

  let totalDebtAmount = 0;

  if (elements.debtItemsTbody) {
    if (filteredDebts.length === 0) {
      elements.debtItemsTbody.innerHTML = `
        <tr>
          <td colspan="8" class="p-6 text-center text-slate-400 font-semibold bg-slate-50">
            <span class="text-2xl block mb-1">🎉</span>
            لا توجد ديون مسجلة معلقة ${isSpecificSupplier ? `للمورد (${escapeHtml(debtSupplierFilterVal)})` : 'حالياً في النظام'}
          </td>
        </tr>
      `;
    } else {
      elements.debtItemsTbody.innerHTML = filteredDebts.map((item, idx) => {
        const qty = item.quantityPurchased || item.quantity;
        const price = parseCleanNumber(item.price, 0, true);
        totalDebtAmount += price;

        return `
          <tr class="border-b border-slate-200 hover:bg-slate-50/70 transition-colors">
            <td class="p-2 border border-slate-300 text-center font-bold text-slate-600">${idx + 1}</td>
            <td class="p-2 border border-slate-300 font-bold text-slate-900">${escapeHtml(item.name)}</td>
            <td class="p-2 border border-slate-300 text-center font-bold text-emerald-800">${qty} ${escapeHtml(item.unit || 'قطعة')}</td>
            <td class="p-2 border border-slate-300 font-bold text-blue-900">${escapeHtml(item.supplier || 'غير محدد')}</td>
            <td class="p-2 border border-slate-300 text-center font-black text-amber-900">${formatPrice(price) || '0 د.ع'}</td>
            <td class="p-2 border border-slate-300 font-semibold text-slate-700">${escapeHtml(item.purchasedBy ? item.purchasedBy.name : (item.createdBy ? item.createdBy.name : '-'))}</td>
            <td dir="ltr" class="p-2 border border-slate-300 text-center text-[10px] text-slate-500 font-mono">${escapeHtml(Mankhul.absoluteDate(item.purchasedAt || item.createdAt))}</td>
            <td class="p-2 border border-slate-300 text-center no-print">
              ${currentUser?.role !== 'warehouse' ? `<button onclick="settleDebtItem('${item.id}')"
                      class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-xs active:scale-95 transition-all inline-flex items-center gap-1" title="تسديد هذا الدين وتحويله لنقد">
                <span>💰</span> <span>تسديد</span>
              </button>` : '—'}
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // تحديث عناوين البطاقات والإجماليات لتوضيح ما يطلبه المورد بدقة
  if (elements.debtModalTotalSumTitle) {
    if (isSpecificSupplier) {
      elements.debtModalTotalSumTitle.innerHTML = `إجمالي ما يطلبه المورد: <span class="text-amber-950 font-black">${escapeHtml(debtSupplierFilterVal)}</span> 💰`;
    } else {
      elements.debtModalTotalSumTitle.textContent = 'إجمالي الديون المعلقة (كافة الموردين) 💰';
    }
  }

  if (elements.debtModalTotalCountTitle) {
    if (isSpecificSupplier) {
      elements.debtModalTotalCountTitle.textContent = `مواد مستحقة للمورد (${debtSupplierFilterVal})`;
    } else {
      elements.debtModalTotalCountTitle.textContent = 'عدد المواد المسجلة دين';
    }
  }

  if (elements.debtStatementBadge) {
    if (isSpecificSupplier) {
      elements.debtStatementBadge.textContent = `كشف حساب مستحقات المورد: ${debtSupplierFilterVal}`;
    } else {
      elements.debtStatementBadge.textContent = 'كشف حساب ديون المشتريات المعلقة';
    }
  }

  if (elements.debtStatementSupplierBox && elements.debtStatementSupplierName) {
    if (isSpecificSupplier) {
      elements.debtStatementSupplierName.textContent = debtSupplierFilterVal;
      elements.debtStatementSupplierBox.classList.remove('hidden');
    } else {
      elements.debtStatementSupplierBox.classList.add('hidden');
    }
  }

  if (elements.debtTableTotalLabel) {
    if (isSpecificSupplier) {
      elements.debtTableTotalLabel.textContent = `إجمالي المبالغ التي يطلبها المورد (${debtSupplierFilterVal})`;
    } else {
      elements.debtTableTotalLabel.textContent = 'مجموع مبالغ الديون الكلي';
    }
  }

  if (elements.debtModalTotalSum) elements.debtModalTotalSum.textContent = formatPrice(totalDebtAmount) || '0 د.ع';
  if (elements.debtModalTotalCount) elements.debtModalTotalCount.textContent = filteredDebts.length;
  if (elements.debtTableTotalAmount) elements.debtTableTotalAmount.textContent = formatPrice(totalDebtAmount) || '0 د.ع';
  if (elements.debtAmountWords) elements.debtAmountWords.textContent = tafqeetIQD(totalDebtAmount);
}

function closeDebtListModal() {
  if (elements.debtListModal) {
    elements.debtListModal.classList.add('hidden');
  }
}

async function settleDebtItem(id, optionalName) {
  const item = itemsData.find(i => i.id === id);
  const displayName = (item && item.name) || optionalName || 'المادة';
  const priceStr = item && item.price ? ` بمبلغ ${formatPrice(item.price)}` : '';

  if (!confirm(`هل تم تسديد دين (${displayName})${priceStr} بالكامل؟\nسيتم تحويل المادة إلى (مدفوع نقداً 💵).`)) {
    return;
  }

  try {
    const res = await apiFetch(`/api/items/${id}/settle-debt`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ version: item?.version || 0 })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.success || data.success === undefined)) {
      showToast('تم التسديد بنجاح 💰', `تم تسديد دين ${displayName} وتحويله لنقد`, '💵', 'emerald');
      try {
        await fetchItems();
        if (elements.debtListModal && !elements.debtListModal.classList.contains('hidden')) {
          renderDebtTable();
        }
      } catch (err) {}
    } else {
      showToast('تعذر التسديد', data.error || 'فشل تحديث حالة الدين في الخادم', '⚠️', 'rose');
    }
  } catch (err) {
    console.error('Settle debt error:', err);
    showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم لتسديد الدين', '⚠️', 'rose');
  }
}

function printDebtStatement() {
  document.body.classList.add('printing-debt');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-debt');
  }, 1000);
}

function exportDebtListToExcel() {
  const debtItems = itemsData.filter(i => Mankhul.isDebt(i));
  const filteredDebts = (debtSupplierFilterVal && debtSupplierFilterVal !== 'all')
    ? debtItems.filter(i => (i.supplier || '').trim() === debtSupplierFilterVal)
    : debtItems;

  if (filteredDebts.length === 0) {
    showToast('لا توجد ديون', 'لا توجد بيانات ديون للتصدير حالياً', 'ℹ️', 'slate');
    return;
  }

  const headers = [
    'ت',
    'اسم المادة',
    'الكمية',
    'الوحدة',
    'المحل / المورد الدائن',
    'مبلغ الدين (د.ع)',
    'المشتري',
    'تاريخ التسجيل',
    'حالة الدفع'
  ];

  const rows = filteredDebts.map((item, idx) => [
    idx + 1,
    Mankhul.csvCell(item.name || ''),
    parseCleanNumber(item.quantityPurchased || item.quantity, 1),
    Mankhul.csvCell(item.unit || 'قطعة'),
    Mankhul.csvCell(item.supplier || 'غير محدد'),
    parseCleanNumber(item.price, 0, true),
    Mankhul.csvCell(item.purchasedBy?.name || item.createdBy?.name || ''),
    Mankhul.csvCell(Mankhul.absoluteDate(item.purchasedAt || item.createdAt)),
    '"مسجل دين معلق"'
  ]);

  const totalDebt = filteredDebts.reduce((sum, i) => sum + parseCleanNumber(i.price, 0, true), 0);
  const summaryRow = [
    '"الإجمالي"',
    `"مجموع المواد: ${filteredDebts.length}"`,
    '""',
    '""',
    '""',
    totalDebt,
    '""',
    '""',
    '""'
  ];

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(',')), summaryRow.join(',')].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const supplierSuffix = debtSupplierFilterVal !== 'all' ? `_${debtSupplierFilterVal}` : '';
  a.download = `كشف_ديون_مشتريات_مقهى_منخل${supplierSuffix}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('تم التصدير بنجاح', 'تم تنزيل كشف الديون كملف CSV مصفى', '📊', 'emerald');
}

if (elements.openDebtListBtn) {
  elements.openDebtListBtn.addEventListener('click', openDebtListModal);
}
if (elements.statDebtBox) {
  elements.statDebtBox.addEventListener('click', openDebtListModal);
}
if (elements.debtModalCloseBtn) {
  elements.debtModalCloseBtn.addEventListener('click', closeDebtListModal);
}
if (elements.debtPrintBtn) {
  elements.debtPrintBtn.addEventListener('click', printDebtStatement);
}
if (elements.debtExportExcelBtn) {
  elements.debtExportExcelBtn.addEventListener('click', exportDebtListToExcel);
}
if (elements.debtSupplierFilter) {
  elements.debtSupplierFilter.addEventListener('change', (e) => {
    debtSupplierFilterVal = e.target.value;
    renderDebtTable();
  });
}

// ==========================================
// إدارة الشراء المباشر من السوق (مادة جديدة لم يذكرها المخزن)
// ==========================================
function openDirectPurchaseModal() {
  if (elements.directItemName) elements.directItemName.value = '';
  if (elements.directItemQuantity) elements.directItemQuantity.value = 1;
  if (elements.directItemPrice) elements.directItemPrice.value = '';
  if (elements.directItemSupplier) elements.directItemSupplier.value = '';
  if (elements.directItemNotes) elements.directItemNotes.value = '';

  const normalPriority = document.querySelector('input[name="direct-item-priority"][value="normal"]');
  if (normalPriority) normalPriority.checked = true;

  const cashPayment = document.querySelector('input[name="direct-payment-method"][value="cash"]');
  if (cashPayment) cashPayment.checked = true;

  if (elements.directPurchaseModal) {
    elements.directPurchaseModal.classList.remove('hidden');
  }
  if (elements.directItemName) {
    setTimeout(() => elements.directItemName.focus(), 80);
  }
}

function closeDirectPurchaseModal() {
  if (elements.directPurchaseModal) {
    elements.directPurchaseModal.classList.add('hidden');
  }
}

if (elements.openDirectPurchaseBtn) {
  elements.openDirectPurchaseBtn.addEventListener('click', openDirectPurchaseModal);
}
if (elements.directPurchaseCloseBtn) {
  elements.directPurchaseCloseBtn.addEventListener('click', closeDirectPurchaseModal);
}
if (elements.directPurchaseCancelBtn) {
  elements.directPurchaseCancelBtn.addEventListener('click', closeDirectPurchaseModal);
}

if (elements.directPurchaseForm) {
  elements.directPurchaseForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = (elements.directItemName ? elements.directItemName.value : '').trim();
    const quantity = parseCleanNumber(elements.directItemQuantity ? elements.directItemQuantity.value : 1, 1);
    const unit = elements.directItemUnit ? elements.directItemUnit.value : 'قطعة';
    const price = parseCleanNumber(elements.directItemPrice ? elements.directItemPrice.value : 0, 0, true);
    const supplier = (elements.directItemSupplier ? elements.directItemSupplier.value : '').trim();
    const notes = (elements.directItemNotes ? elements.directItemNotes.value : '').trim();

    const priorityEl = document.querySelector('input[name="direct-item-priority"]:checked');
    const priority = priorityEl ? priorityEl.value : 'normal';

    const paymentEl = document.querySelector('input[name="direct-payment-method"]:checked');
    const paymentMethod = paymentEl ? paymentEl.value : 'cash';

    if (!name) {
      showToast('تنبيه', 'يرجى كتابة اسم المادة المشتراة', '⚠️', 'amber');
      return;
    }

    setButtonLoading(elements.directPurchaseSubmitBtn, true, elements.directPurchaseSubmitBtn ? elements.directPurchaseSubmitBtn.innerHTML : null, 'جاري حفظ الشراء...');

    try {
      const res = await apiFetch('/api/purchases/direct', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, quantity, unit, price, supplier, paymentMethod, notes, priority })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.success === undefined)) {
        closeDirectPurchaseModal();
        const payText = paymentMethod === 'debt' ? ' (مسجل دين ⏳)' : ' (نقداً 💵)';
        showToast('تم الشراء المباشر بنجاح 🛒', `تم تسجيل شراء ${name}${payText} وإرسالها فوراً للمخزن للجرد والاستلام`, '✨', 'emerald');

        // إضافة المادة لقائمة الاقتراحات السريعة
        if (elements.commonItemsList && ![...elements.commonItemsList.options].some(o => o.value === name)) {
          const opt = document.createElement('option');
          opt.value = name;
          elements.commonItemsList.appendChild(opt);
        }

        try { await fetchItems(); } catch (err) {}
      } else {
        showToast('تعذر الحفظ', data.error || 'فشل حفظ عملية الشراء في الخادم', '⚠️', 'rose');
      }
    } catch (err) {
      console.error('Direct purchase error:', err);
      showToast('خطأ في الاتصال', 'تعذر الاتصال بالخادم لحفظ الشراء', '⚠️', 'rose');
    } finally {
      setButtonLoading(elements.directPurchaseSubmitBtn, false);
    }
  });
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
    filterPaymentVal = 'all';
    filterPriorityVal = 'all';
    filterDateFromVal = '';
    filterDateToVal = '';
    if (elements.filterStatus) elements.filterStatus.value = 'all';
    if (elements.filterPayment) elements.filterPayment.value = 'all';
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

if (elements.filterPayment) {
  elements.filterPayment.addEventListener('change', (e) => {
    filterPaymentVal = e.target.value;
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
    navigator.serviceWorker.register('./sw.js').then(reg => {
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
      Mankhul.csvCell(item.name || ''),
      parseCleanNumber(item.quantity, 1),
      Mankhul.csvCell(item.unit || 'قطعة'),
      `"${priorityMap[item.priority] || 'عادي'}"`,
      Mankhul.csvCell(statusMap[item.status] || item.status),
      parseCleanNumber(item.quantityPurchased, 0),
      parseCleanNumber(item.price, 0, true),
      Mankhul.csvCell(item.supplier || ''),
      parseCleanNumber(item.receivedQuantity, 0),
      Mankhul.csvCell(item.notes || ''),
      Mankhul.csvCell(item.missingReason || ''),
      Mankhul.csvCell(item.inventoryNotes || ''),
      Mankhul.csvCell(Mankhul.absoluteDate(item.createdAt)),
      Mankhul.csvCell(item.purchasedBy?.name || '')
    ]);

    // حساب الإجماليات بدقة تامة
    const totalQty = itemsToExport.reduce((sum, i) => sum + parseCleanNumber(i.quantity, 0), 0);
    const totalPurchasedQty = itemsToExport.reduce((sum, i) => sum + parseCleanNumber(i.quantityPurchased, 0), 0);
    const totalReceivedQty = itemsToExport.reduce((sum, i) => sum + parseCleanNumber(i.receivedQuantity, 0), 0);
    const totalExpenses = itemsToExport
      .filter(i => Mankhul.hasPurchase(i))
      .reduce((sum, i) => sum + parseCleanNumber(i.price, 0, true), 0);

    const summaryRow = [
      '"الإجمالي الكلي"',
      Mankhul.csvCell(Mankhul.quantityTotals(itemsToExport, 'quantity')),
      '""',
      '""',
      `"إجمالي المواد: ${itemsToExport.length}"`,
      Mankhul.csvCell(Mankhul.quantityTotals(itemsToExport, 'quantityPurchased')),
      totalExpenses,
      '""',
      Mankhul.csvCell(Mankhul.quantityTotals(itemsToExport, 'receivedQuantity')),
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
    a.download = `تقرير_نقوصات_مقهى_منخل_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('تم التصدير بنجاح', 'تم تنزيل ملف CSV المصفى متضمناً الموردين والإجماليات', '📊', 'emerald');
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
    if (elements.debtListModal) elements.debtListModal.classList.add('hidden');
    if (elements.directPurchaseModal) elements.directPurchaseModal.classList.add('hidden');
    if (elements.changePasswordModal) elements.changePasswordModal.classList.add('hidden');
  }
});

// إتاحة الدوال العامة على كائن window للأمان التام
window.currentUser = currentUser;
window.openItemTimeline = openItemTimeline;
window.openVoucherModal = openVoucherModal;
window.printVoucher = printVoucher;
window.openDebtListModal = openDebtListModal;
window.closeDebtListModal = closeDebtListModal;
window.settleDebtItem = settleDebtItem;
window.printDebtStatement = printDebtStatement;
window.exportDebtListToExcel = exportDebtListToExcel;
window.openDirectPurchaseModal = openDirectPurchaseModal;
window.closeDirectPurchaseModal = closeDirectPurchaseModal;
window.openPurchaseModal = openPurchaseModal;
window.openEditModal = openEditModal;
window.confirmInventoryFast = confirmInventoryFast;
window.openInventoryModal = openInventoryModal;
window.revertToPending = revertToPending;
window.reorderItem = reorderItem;
window.deleteItem = deleteItem;
window.changeUserPassword = changeUserPassword;
window.deleteUser = deleteUser;

async function verifySession() {
  if (!currentUser || !currentUser.id) return;
  const usedToken = sessionToken;
  try {
    const res = await apiFetch('/api/auth/me', { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (usedToken !== sessionToken) return;
    if (data.success && data.user) {
      currentUser = data.user;
      window.currentUser = currentUser;
      localStorage.setItem('mankhul_user', JSON.stringify(currentUser));
      applyUserRole(true);
    } else if (res.status === 401) {
      clearSession();
    }
  } catch (e) {
    // Keep offline fallback session
  }
}

// بدء التشغيل
applyTheme();
elements.soundIcon.textContent = soundEnabled ? '🔔' : '🔕';
applyUserRole(true);
verifySession().then(() => { initSocket(); void fetchItems(); });

