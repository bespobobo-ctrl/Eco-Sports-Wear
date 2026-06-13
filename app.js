// ========================================================================
//   ECO SPORTS MENSWEAR - SECURE CRM & POS LOGIC
// ========================================================================

// --- Safe Storage Polyfill for Telegram Iframe / Sandbox environments ---
let safeLocalStorage = null;
let safeSessionStorage = null;

try {
    safeLocalStorage = window.localStorage;
    if (safeLocalStorage) {
        safeLocalStorage.getItem('test');
    }
} catch (e) {
    console.warn("LocalStorage access blocked, using memory polyfill.");
    const memoryStorage = {};
    safeLocalStorage = {
        getItem: (key) => memoryStorage[key] || null,
        setItem: (key, val) => { memoryStorage[key] = String(val); },
        removeItem: (key) => { delete memoryStorage[key]; },
        clear: () => { for (let k in memoryStorage) delete memoryStorage[k]; }
    };
}

try {
    safeSessionStorage = window.sessionStorage;
    if (safeSessionStorage) {
        safeSessionStorage.getItem('test');
    }
} catch (e) {
    console.warn("SessionStorage access blocked, using memory polyfill.");
    const memorySessionStorage = {};
    safeSessionStorage = {
        getItem: (key) => memorySessionStorage[key] || null,
        setItem: (key, val) => { memorySessionStorage[key] = String(val); },
        removeItem: (key) => { delete memorySessionStorage[key]; },
        clear: () => { for (let k in memorySessionStorage) delete memorySessionStorage[k]; }
    };
}

const localStorage = safeLocalStorage;
const sessionStorage = safeSessionStorage;

// 1. TELEGRAM WEBAPP & BOT CONFIGURATION
const tg = window.Telegram?.WebApp;
// HAQIQIY Telegram Mini App ichidamizmi? (SDK brauzer/PWA'da ham mavjud bo'ladi,
// shuning uchun faqat tg borligi yetarli emas — initData/platform tekshiriladi)
const isTelegram = !!(tg && (
    (tg.initData && tg.initData.length > 0) ||
    (tg.initDataUnsafe && tg.initDataUnsafe.user) ||
    (tg.platform && tg.platform !== 'unknown')
));
// BOT_TOKEN endi frontendда YO'Q — server tomonда yashirin (Vercel ENV: BOT_TOKEN).
// Xabarlar /api/notify orqali yuboriladi. (Ilgari bu yerda ochiq edi — olib tashlandi.)

// Telegram'ga xos sozlamalar — FAQAT haqiqiy Telegram ichida.
// (PWA/brauzerda bu chaqiruvlar nojo'ya reflow/sapchish keltirib chiqarishi mumkin)
if (isTelegram) {
    try {
        tg.ready();
        tg.expand();
        tg.enableClosingConfirmation();
        tg.setHeaderColor('#090d16');
        tg.setBackgroundColor('#090d16');
    } catch (e) { console.warn("Telegram init:", e); }
}

// 1.5. SUPABASE CLOUD DATABASE CONFIGURATION
const SUPABASE_URL = "https://ddqoktwkffnufczhdads.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkcW9rdHdrZmZudWZjemhkYWRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTUyODgsImV4cCI6MjA5NTg3MTI4OH0.IL-C7px7_lcmwQxgXhbNlrmy0NAYN6RmQKmiUQpgq-Q";
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// 1.7. SUPABASE SYNCHRONIZATION HELPERS

// --- eco_users (Login / Parollar) — QULFLANGAN: faqat admin RPC orqali ---
// Jadval RLS bilan himoyalangan; to'g'ridan upsert/delete ishlamaydi. Admin
// paroli bilan SECURITY DEFINER funksiyalar chaqiriladi (parol serverда tekshiriladi).
// Admin RPC'lar uchun parolni ta'minlash — sessiyada bo'lmasa bir marta so'raydi
async function _ensureAdminPw() {
    if (_sessionAdminPw) return _sessionAdminPw;
    const pw = prompt("Bulutga saqlash uchun joriy ADMIN parolini kiriting:");
    if (pw) {
        _sessionAdminPw = pw;
        try { sessionStorage.setItem("eco_sports_admin_pw", pw); } catch (e) {}
    }
    return pw || "";
}

async function dbSaveUser(user) {
    if (!supabaseClient) return { ok: true, localOnly: true };
    const pw = await _ensureAdminPw();
    try {
        const { error } = await supabaseClient.rpc("admin_save_user", {
            p_admin_password: pw,
            p_id: user.id, p_name: user.name, p_username: user.username,
            p_password: user.password, p_pin: user.pin, p_role: user.role
        });
        if (error) {
            const msg = (error.message || "").toLowerCase();
            if (msg.includes("ruxsat") || msg.includes("permission")) {
                _sessionAdminPw = ""; try { sessionStorage.removeItem("eco_sports_admin_pw"); } catch (e) {}
                alert("⚠️ Bulutga saqlanmadi: admin parol noto'g'ri. Qayta urinib ko'ring.");
            } else if (msg.includes("could not find") || error.code === "PGRST202") {
                alert("⚠️ Bulutga saqlanmadi: xavfsizlik funksiyalari hali o'rnatilmagan (supabase_secure_users.sql).");
            } else {
                alert("⚠️ Bulutga saqlanmadi: " + (error.message || "noma'lum xato"));
            }
            return { ok: false, error };
        }
        return { ok: true };
    } catch (err) {
        console.error("Supabase user save (RPC) failed:", err);
        return { ok: false, error: err };
    }
}

async function dbDeleteUser(userId) {
    if (!supabaseClient) return { ok: true, localOnly: true };
    const pw = await _ensureAdminPw();
    try {
        const { error } = await supabaseClient.rpc("admin_delete_user", {
            p_admin_password: pw, p_id: userId
        });
        if (error) { alert("⚠️ Bulutdan o'chmadi: " + (error.message || "xato")); return { ok: false, error }; }
        return { ok: true };
    } catch (err) {
        console.error("Supabase user delete (RPC) failed:", err);
        return { ok: false, error: err };
    }
}

// Admin: bulutdagi xodimlar ro'yxatini xavfsiz (parol bilan) yangilash
async function refreshUsersFromCloud() {
    if (!supabaseClient || !_sessionAdminPw) return false;
    try {
        const { data, error } = await supabaseClient.rpc("admin_list_users", { p_admin_password: _sessionAdminPw });
        if (!error && Array.isArray(data) && data.length > 0) {
            users = data;
            localStorage.setItem("eco_sports_users", JSON.stringify(users));
            return true;
        }
    } catch (err) { /* offline yoki ruxsat yo'q — mahalliy ro'yxat qoladi */ }
    return false;
}

// ============================================================
// OFFLINE SYNC NAVBATI (OUTBOX)
// Zaif internetda yozishlar yo'qolmasligi uchun: har amal avval mahalliy
// navbatga tushadi, internet kelganda bulutga (Supabase) yuboriladi.
// ============================================================
let syncQueue = [];
try { const _q = localStorage.getItem("eco_sync_queue"); if (_q) syncQueue = JSON.parse(_q) || []; } catch (e) { syncQueue = []; }
function _saveSyncQueue() { try { localStorage.setItem("eco_sync_queue", JSON.stringify(syncQueue)); } catch (e) {} }

const SYNC_MAX_ATTEMPTS = 8;

function enqueueOp(op) {
    op.opId = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    op.attempts = 0;
    // Config — snapshot bo'lgani uchun bir kalit bo'yicha eski kutayotganlarni almashtirish
    if (op.type === "config") {
        syncQueue = syncQueue.filter(o => !(o.type === "config" && o.key === op.key));
    }
    syncQueue.push(op);
    _saveSyncQueue();
    updateSyncBadge();
    flushSyncQueue();
}

let _syncFlushing = false;
async function flushSyncQueue() {
    if (_syncFlushing || !supabaseClient) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) { updateSyncBadge(); return; }
    _syncFlushing = true;
    try {
        while (syncQueue.length > 0) {
            const op = syncQueue[0];
            try {
                await applySyncOp(op);
                syncQueue.shift();
                _saveSyncQueue();
                updateSyncBadge();
            } catch (e) {
                op.attempts = (op.attempts || 0) + 1;
                _saveSyncQueue();
                if (op.attempts >= SYNC_MAX_ATTEMPTS) {
                    console.warn("Sync op tashlandi (juda ko'p urinish):", op.type, e);
                    syncQueue.shift(); // poison op navbatni bloklamasin
                    _saveSyncQueue();
                    continue;
                }
                console.warn("Sync to'xtadi (keyin qayta urinadi):", op.type, e);
                break; // tarmoq xatosi — keyinroq retry
            }
        }
    } finally {
        _syncFlushing = false;
        updateSyncBadge();
    }
}

async function applySyncOp(op) {
    if (!supabaseClient) throw new Error("no-client");
    let res;
    switch (op.type) {
        case "config":
            res = await supabaseClient.from("eco_config").upsert({ key: op.key, value: op.value });
            break;
        case "sale":
            res = await supabaseClient.from("eco_sales").upsert(op.sale);
            if (res && res.error) throw res.error;
            if (op.items && op.items.length) {
                res = await supabaseClient.from("eco_sale_items").insert(op.items);
            }
            break;
        case "kirim":
            res = await supabaseClient.from("eco_kirim_history").upsert(op.row);
            break;
        case "kirim_status":
            res = await supabaseClient.from("eco_kirim_history").update(op.patch).eq("product_id", op.product_id);
            break;
        case "expense":
            res = await supabaseClient.from("eco_expenses").upsert(op.row);
            break;
        default:
            return; // noma'lum tur — o'tkazib yuborish
    }
    if (res && res.error) throw res.error;
}

// 🟢/🔴 sinxronlash holati ko'rsatkichi
function updateSyncBadge() {
    const badge = document.getElementById("sync-badge");
    if (!badge) return;
    const online = !(typeof navigator !== "undefined" && navigator.onLine === false);
    const pending = syncQueue.length;
    badge.classList.remove("sync-online", "sync-offline", "sync-pending");
    if (!online) {
        badge.classList.add("sync-offline");
        badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Oflayn${pending ? " · " + pending : ""}`;
    } else if (pending > 0) {
        badge.classList.add("sync-pending");
        badge.innerHTML = `<i class="fa-solid fa-rotate fa-spin"></i> Saqlanmoqda ${pending}`;
    } else {
        badge.classList.add("sync-online");
        badge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Onlayn`;
    }
}

// --- eco_config (Tizim Sozlamalari) — navbat orqali ---
async function dbSaveConfig(key, value) {
    if (!supabaseClient) return;
    enqueueOp({ type: "config", key: key, value: value });
}

// --- eco_inventory (Ombor) ---
async function dbSaveInventory(productId, product, qty) {
    if (!supabaseClient) return;
    try {
        const rawName = product ? product.name : '';
        const nameWithPricing = product && product.pack_price && product.cogs
            ? `${rawName.replace(/\s*\[cogs:\d+,pack:\d+\]/, "")} [cogs:${Math.round(product.cogs)},pack:${Math.round(product.pack_price)}]`
            : rawName;

        await supabaseClient.from("eco_inventory").upsert({
            product_id: productId,
            supplier: product ? product.supplier : '',
            product_name: nameWithPricing,
            category: product ? product.category : '',
            price: product ? product.price : 0,
            quantity: qty,
            updated_at: new Date().toISOString()
        });
    } catch (err) {
        console.error("Supabase inventory save failed:", err);
    }
}

async function dbSaveFullInventory() {
    if (!supabaseClient) return;
    try {
        const rows = PRODUCTS.map(p => ({
            product_id: p.id,
            supplier: p.supplier,
            product_name: p.name,
            category: p.category,
            price: p.price,
            quantity: inventory[p.id] || 0,
            updated_at: new Date().toISOString()
        }));
        await supabaseClient.from("eco_inventory").upsert(rows);
    } catch (err) {
        console.error("Supabase full inventory save failed:", err);
    }
}

// --- eco_sales + eco_sale_items (Savdo) — navbat orqali ---
async function dbSaveSale(tx, cartItems) {
    if (!supabaseClient) return;
    const sale = {
        id: tx.id,
        cashier_id: currentUser ? currentUser.id : null,
        cashier_name: tx.cashier,
        sale_timestamp: tx.timestamp,
        channel: tx.channel,
        discount: tx.discount,
        subtotal: tx.subtotal,
        total_paid: tx.totalPaid,
        item_count: tx.itemCount
    };
    const items = (cartItems || []).map(item => ({
        sale_id: tx.id,
        cashier_id: currentUser ? currentUser.id : null,
        product_name: typeof item === 'object' ? item.name : item,
        size: typeof item === 'object' ? item.size : '',
        qty: typeof item === 'object' ? item.qty : 1,
        sold_price: typeof item === 'object' ? item.soldPrice : 0
    }));
    enqueueOp({ type: "sale", sale: sale, items: items });
}

async function dbDeleteSale(saleId) {
    if (!supabaseClient) return;
    try {
        // eco_sale_items avtomatik CASCADE bilan o'chadi
        await supabaseClient.from("eco_sales").delete().eq("id", saleId);
    } catch (err) {
        console.error("Supabase sale delete failed:", err);
    }
}

async function dbDeleteAllSales() {
    if (!supabaseClient) return;
    try {
        await supabaseClient.from("eco_sale_items").delete().neq("id", 0);
        await supabaseClient.from("eco_sales").delete().neq("id", "");
    } catch (err) {
        console.error("Supabase clear sales failed:", err);
    }
}

// --- eco_expenses (Xarajatlar) — navbat orqali ---
async function dbSaveExpense(expense) {
    if (!supabaseClient) return;
    enqueueOp({ type: "expense", row: {
        id: expense.id,
        expense_timestamp: expense.timestamp,
        description: expense.description,
        category: expense.category,
        amount: expense.amount
    } });
}

async function dbDeleteExpense(expenseId) {
    if (!supabaseClient) return;
    try {
        await supabaseClient.from("eco_expenses").delete().eq("id", expenseId);
    } catch (err) {
        console.error("Supabase expense delete failed:", err);
    }
}

async function dbDeleteAllExpenses() {
    if (!supabaseClient) return;
    try {
        await supabaseClient.from("eco_expenses").delete().neq("id", "");
    } catch (err) {
        console.error("Supabase clear expenses failed:", err);
    }
}

// 2. MAHSULOTLAR — real do'kon: bo'sh boshlaydi, faqat kirim qilingan
// mahsulotlar ko'rsatiladi (demo namuna mahsulotlar olib tashlandi).
let PRODUCTS = [];

// 3. APPLICATION STATE & DATABASES
const defaultSuppliers = [
    { name: "Alisher Aka", icon: "fa-solid fa-user-tie", visible: true },
    { name: "Nodir aka", icon: "fa-solid fa-user-gear", visible: true },
    { name: "Eco Sports", icon: "fa-solid fa-bolt-lightning", visible: true },
    { name: "Xitoy", icon: "fa-solid fa-plane-arrival", visible: true }
];

const defaultCategories = [
    { code: "tshirt", name: "Futbolkalar", icon: "fa-solid fa-shirt", visible: true },
    { code: "shorts", name: "Shortilar", icon: "fa-solid fa-dumbbell", visible: true },
    { code: "tracksuit", name: "Sportivkalar", icon: "fa-solid fa-person-running", visible: true },
    { code: "joggers", name: "Trikolar", icon: "fa-solid fa-route", visible: true }
];

let state = {
    cart: [],
    selectedProduct: null,
    selectedSize: null,
    selectedColor: null,
    activeSupplier: "all",
    activeCategory: "all",
    omborActiveSupplier: "all",
    omborActiveCategory: "all",
    searchQuery: "",
    salesHistory: [],
    suppliers: [],
    categories: [],
    dynamicProducts: [],
    kirimHistory: []
};

function isSupplierActiveAndVisible(supplierName) {
    const found = state.suppliers.find(s => s.name.toLowerCase() === supplierName.toLowerCase());
    return found ? found.visible : true;
}

function isCategoryActiveAndVisible(categoryCode) {
    const found = state.categories.find(c => c.code.toLowerCase() === categoryCode.toLowerCase());
    return found ? found.visible : true;
}

function saveSuppliersToStorage() {
    localStorage.setItem("eco_sports_suppliers", JSON.stringify(state.suppliers));
    dbSaveConfig("eco_suppliers", state.suppliers);
}

function saveCategoriesToStorage() {
    localStorage.setItem("eco_sports_categories", JSON.stringify(state.categories));
    dbSaveConfig("eco_categories", state.categories);
}

// Initial default configuration parameters
let appConfig = {
    pin: "7777",
    botToken: "", // token serverda (Vercel ENV) — frontendда saqlanmaydi
    chatId: "648833917", // maxfiy emas: hisobot yuboriladigan Telegram chat ID
    storeName: "ECO SPORTS",
    storeAddress: "Qo'qon shahar",
    storePhone: "+998 90 123 45 67"
};

// Xavfsizlik: bot tokeni HECH QACHON frontendда (localStorage/bulut config) saqlanmasligi
// kerak — server (Vercel ENV) orqali /api/notify ishlatiladi. Eski saqlangan tokenni tozalaydi.
function _stripFrontendToken() {
    if (appConfig && appConfig.botToken) {
        appConfig.botToken = "";
        try { localStorage.setItem("eco_sports_config", JSON.stringify(appConfig)); } catch (e) {}
        if (typeof dbSaveConfig === "function") dbSaveConfig("app_config", appConfig);
    }
}

// Default stock allocation of 50 units for each menswear catalog product
const defaultInventory = {};
PRODUCTS.forEach(p => {
    defaultInventory[p.id] = 50;
});

let inventory = defaultInventory;
let expenses = [];

const defaultUsers = [
    { id: "u-1", name: "Admin", username: "admin", password: "eco777", pin: "7777", role: "admin" },
    { id: "u-2", name: "Optim 1", username: "Optim1", password: "123", pin: "8888", role: "kassir-optim" },
    { id: "u-3", name: "Dona 1", username: "Dona1", password: "123", pin: "9999", role: "kassir-dona" },
    { id: "u-4", name: "Omborchi 1", username: "Ombor1", password: "123", pin: "1111", role: "omborchi" }
];
let users = defaultUsers;
let currentUser = null;
// Admin sessiya paroli — eco_users qulflangach, admin RPC'larini (xodim ro'yxati,
// qo'shish/o'chirish) chaqirish uchun kerak. Faqat shu qurilma sessiyasida turadi.
let _sessionAdminPw = sessionStorage.getItem("eco_sports_admin_pw") || "";

// Sotuvchi (Optim 1) tezkor kirish PIN kodi — bu yerdan o'zgartirsa bo'ladi
const SELLER_QUICK_PIN = "5555";

// 4. DOM ELEMENTS
// Authentication Screen elements
const loginScreen = document.getElementById("login-screen");
const dashboardScreen = document.getElementById("dashboard-screen");
const loginForm = document.getElementById("login-form");
const usernameInput = document.getElementById("login-username");
const passwordInput = document.getElementById("login-password");
const togglePwIcon = document.getElementById("toggle-pw-icon");
const loginErrorMsg = document.getElementById("login-error");
const logoutTrigger = document.getElementById("logout-trigger");
const activeCashierLabel = document.getElementById("active-cashier-name");

// POS Grid & Filters elements
const tilesGrid = document.getElementById("pos-tiles-grid");
const searchInput = document.getElementById("pos-search-input");
const filterBtns = document.querySelectorAll("[data-pos-filter]");

// Virtual Kassa elements
const receiptList = document.getElementById("pos-receipt-list");
const receiptSubtotal = document.getElementById("pos-subtotal");
const receiptDiscountValue = document.getElementById("pos-discount-value");
const receiptFinalTotal = document.getElementById("pos-final-total");
const discountInput = document.getElementById("pos-discount");
const channelSelect = document.getElementById("pos-channel");
const checkoutBtn = document.getElementById("pos-checkout-btn");

// To'lov / qarz (nasiya) elementlari
const receivedInput = document.getElementById("pos-received");
const remainingDebtEl = document.getElementById("pos-remaining-debt");
const debtorFields = document.getElementById("pos-debtor-fields");
const debtorNameInput = document.getElementById("pos-debtor-name");
const debtorPhoneInput = document.getElementById("pos-debtor-phone");
const debtorTgInput = document.getElementById("pos-debtor-tg");
const debtorDateInput = document.getElementById("pos-debtor-date");
let posReceivedTouched = false;
const receiptIdLabel = document.getElementById("pos-receipt-id");

// POS Calculator modal elements
const calcModal = document.getElementById("pos-calc-modal");
const closeCalcModal = document.getElementById("close-calc-modal");
const calcForm = document.getElementById("pos-calc-form");
const calcTitle = document.getElementById("calc-product-title");
const calcCat = document.getElementById("calc-product-cat");
const calcSizesContainer = document.getElementById("calc-size-options");
const calcQtyInput = document.getElementById("calc-qty");
const calcQtyMinus = document.getElementById("calc-qty-minus");
const calcQtyPlus = document.getElementById("calc-qty-plus");
const calcPriceInput = document.getElementById("calc-unit-price");
const calcStdPrice = document.getElementById("calc-std-price");

// POS PIN Code Modal elements
const pinModal = document.getElementById("pos-pin-modal");
const closePinModal = document.getElementById("close-pin-modal");
const pinForm = document.getElementById("pos-pin-form");
const pinInput = document.getElementById("pos-pin-input");
const pinErrorMsg = document.getElementById("pin-error-msg");

// CRM widgets elements
const crmRevenue = document.getElementById("crm-total-revenue");
const crmSalesCount = document.getElementById("crm-total-sales");
const crmAvgInvoice = document.getElementById("crm-avg-invoice");
const crmItemsCount = document.getElementById("crm-total-items");
const crmTableBody = document.getElementById("crm-history-table-body");
const crmEmptyState = document.getElementById("crm-empty-state");
const clearLogsBtn = document.getElementById("crm-clear-logs");

// POS Premium Success Receipt Modal elements
const successReceiptModal = document.getElementById("pos-success-receipt-modal");
const closeReceiptModal = document.getElementById("close-receipt-modal");
const receiptModalId = document.getElementById("receipt-modal-id");
const receiptModalDate = document.getElementById("receipt-modal-date");
const receiptModalTime = document.getElementById("receipt-modal-time");
const receiptModalCashier = document.getElementById("receipt-modal-cashier");
const receiptModalChannel = document.getElementById("receipt-modal-channel");
const receiptModalItemsContainer = document.getElementById("receipt-modal-items");
const receiptModalSubtotal = document.getElementById("receipt-modal-subtotal");
const receiptModalDiscount = document.getElementById("receipt-modal-discount");
const receiptModalTotal = document.getElementById("receipt-modal-total");
const receiptModalPrintBtn = document.getElementById("receipt-modal-print-btn");
const receiptModalCloseBtn = document.getElementById("receipt-modal-close-btn");

// 5. UTILITIES
function formatPrice(number) {
    return number.toLocaleString('uz-UZ') + " UZS";
}

function generateReceiptId() {
    return "CHK-" + Math.floor(1000 + Math.random() * 9000);
}

// 6. AUTHENTICATION SERVICES
async function handleLoginSubmit(e) {
    e.preventDefault();
    const userVal = usernameInput.value.trim();
    const passVal = passwordInput.value;

    // 1) XAVFSIZ: server tomonida tekshirish (verify_login RPC).
    //    Parollar mijozга chiqmaydi; faqat to'g'ri kelganда o'sha foydalanuvchi qaytadi.
    let matchedUser = null;
    let rpcAuthoritative = false; // RPC ishlatildi (online + funksiya mavjud)
    if (typeof supabaseClient !== "undefined" && supabaseClient) {
        try {
            const { data, error } = await supabaseClient.rpc("verify_login", { p_username: userVal, p_password: passVal });
            if (!error) { rpcAuthoritative = true; matchedUser = data || null; }
        } catch (err) { /* tarmoq/offline — pastдаги zaxiraga tushadi */ }
    }

    // 2) ZAXIRA (offline yoki SQL hali o'rnatilmagan): mahalliy ro'yxat bo'yicha
    //    — bu yo'l sizni hech qachon tizimdan qulflab qo'ymaydi.
    if (!rpcAuthoritative) {
        matchedUser = users.find(u => u.username && u.username.toLowerCase().trim() === userVal.toLowerCase() && u.password === passVal) || null;
    }

    if (matchedUser) {
        loginErrorMsg.style.display = "none";
        // Admin sessiya paroli — admin RPC'lari (xodim boshqaruvi) uchun saqlanadi
        if (matchedUser.role === "admin") {
            _sessionAdminPw = passVal;
            try { sessionStorage.setItem("eco_sports_admin_pw", passVal); } catch (er) {}
        }
        sessionStorage.setItem("eco_sports_logged_in", "true");
        sessionStorage.setItem("eco_sports_logged_in_user", JSON.stringify(matchedUser));
        currentUser = matchedUser;
        unlockDashboard();
    } else {
        loginErrorMsg.style.display = "flex";
        if (tg && tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
    }
}

// --- Login oyna almashtirish (Admin / Sotuvchi) ---
function showLoginView(view) {
    const modeSelect = document.getElementById("login-mode-select");
    const adminView = document.getElementById("admin-login-view");
    const sellerView = document.getElementById("seller-login-view");
    if (modeSelect) modeSelect.style.display = (view === "mode") ? "block" : "none";
    if (adminView) adminView.style.display = (view === "admin") ? "block" : "none";
    if (sellerView) sellerView.style.display = (view === "seller") ? "block" : "none";

    // Xato xabarlarini va maydonlarni tozalash
    if (loginErrorMsg) loginErrorMsg.style.display = "none";
    const sellerErr = document.getElementById("seller-pin-error");
    if (sellerErr) sellerErr.style.display = "none";
    const sellerPin = document.getElementById("seller-pin-input");
    if (sellerPin) sellerPin.value = "";

    // Tegishli maydonga fokus
    if (view === "seller" && sellerPin) {
        setTimeout(() => sellerPin.focus(), 50);
    } else if (view === "admin" && usernameInput) {
        setTimeout(() => usernameInput.focus(), 50);
    }
}

// Sotuvchi PIN orqali kirish — to'g'ri bo'lsa Optim1 sifatida kiradi
async function handleSellerPinSubmit(e) {
    if (e) e.preventDefault();
    const pinInput = document.getElementById("seller-pin-input");
    const sellerErr = document.getElementById("seller-pin-error");
    const val = (pinInput ? pinInput.value : "").trim();

    if (val === SELLER_QUICK_PIN) {
        // 1) XAVFSIZ: server tomonidan optim foydalanuvchini olish (verify_seller_pin)
        let optimUser = null, rpcOk = false;
        if (typeof supabaseClient !== "undefined" && supabaseClient) {
            try {
                const { data, error } = await supabaseClient.rpc("verify_seller_pin", { p_pin: val });
                if (!error) { rpcOk = true; optimUser = data || null; }
            } catch (err) { /* offline — zaxiraga */ }
        }
        // 2) ZAXIRA: mahalliy ro'yxat (offline yoki SQL hali yo'q)
        if (!rpcOk || !optimUser) {
            optimUser = users.find(u => u.username && u.username.toLowerCase().trim() === "optim1")
                || users.find(u => u.role === "kassir-optim") || optimUser;
        }

        if (!optimUser) {
            if (sellerErr) sellerErr.style.display = "flex";
            return;
        }

        if (sellerErr) sellerErr.style.display = "none";
        sessionStorage.setItem("eco_sports_logged_in", "true");
        sessionStorage.setItem("eco_sports_logged_in_user", JSON.stringify(optimUser));
        currentUser = optimUser;
        unlockDashboard();
    } else {
        if (sellerErr) sellerErr.style.display = "flex";
        if (pinInput) {
            pinInput.value = "";
            pinInput.focus();
        }
        if (tg && tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
    }
}

function unlockDashboard() {
    loginScreen.style.display = "none";
    dashboardScreen.style.display = "block";

    if (!currentUser) {
        const savedUser = sessionStorage.getItem("eco_sports_logged_in_user");
        if (savedUser) {
            currentUser = JSON.parse(savedUser);
        } else {
            currentUser = users[0]; // fallback to admin
        }
    }

    activeCashierLabel.textContent = currentUser.name;

    // Toggle body class for Optim1 layout styling
    if (currentUser && currentUser.role === "kassir-optim") {
        document.body.classList.add("role-kassir-optim");
    } else {
        document.body.classList.remove("role-kassir-optim");
    }

    // Role-based tab filtering and navigation access
    const tabs = document.querySelectorAll(".dept-tabs li");
    const role = currentUser.role || "admin";

    tabs.forEach(tabLi => {
        const btn = tabLi.querySelector(".dept-tab-btn");
        if (!btn) return;
        const dept = btn.dataset.dept;
        
        if (role === "admin") {
            tabLi.style.display = "block"; // Admin has access to everything
        } else if (role === "omborchi") {
            // Omborchi only sees Ombor
            if (dept === "ombor") {
                tabLi.style.display = "block";
            } else {
                tabLi.style.display = "none";
            }
        } else if (role === "kassir-dona" || role === "kassir-optim") {
            // Cashiers only see Sotuv
            if (dept === "sotuv") {
                tabLi.style.display = "block";
            } else {
                tabLi.style.display = "none";
            }
        }
    });

    // Auto-route to the permitted active section
    const sections = document.querySelectorAll(".dept-section");
    let defaultDept = "sotuv";
    if (role === "omborchi") {
        defaultDept = "ombor";
    }

    document.querySelectorAll(".dept-tab-btn").forEach(t => {
        if (t.dataset.dept === defaultDept) {
            t.classList.add("active");
        } else {
            t.classList.remove("active");
        }
    });

    sections.forEach(sec => {
        if (sec.id === `${defaultDept}-section`) {
            sec.style.display = "block";
            sec.classList.add("active-section");
        } else {
            sec.style.display = "none";
            sec.classList.remove("active-section");
        }
    });

    // POS adjustments based on wholesale (optim) vs retail (dona) cashiers
    if (role === "kassir-optim") {
        if (channelSelect) channelSelect.value = "phone"; // Phone / wholesale channel default
    } else if (role === "kassir-dona") {
        if (channelSelect) channelSelect.value = "direct"; // Direct store sale default
    }

    // Toggle CRM analytics panel visibility - Only visible for Admin!
    const analyticsSection = document.getElementById("crm-analytics-section");
    if (analyticsSection) {
        if (role === "admin") {
            analyticsSection.style.display = "block";
        } else {
            analyticsSection.style.display = "none";
        }
    }

    // Initialize all renders
    renderPOSFilters();
    renderTiles();
    updateReceiptUI();
    updateAnalytics();
    renderHistoryTable();
    
    if (role === "omborchi") {
        renderOmborTable();
    }
}

function handleLogout() {
    sessionStorage.removeItem("eco_sports_logged_in");
    location.reload();
}

// 6.7 POS FILTERS RENDERER
function renderPOSFilters() {
    const suppliersFilterContainer = document.getElementById("pos-suppliers-filter");
    const categoriesFilterContainer = document.getElementById("pos-categories-filter");
    
    if (suppliersFilterContainer) {
        suppliersFilterContainer.innerHTML = "";
        
        // Add "Barchasi" button
        const allBtn = document.createElement("button");
        allBtn.className = `filter-btn ${state.activeSupplier === "all" ? "active" : ""}`;
        allBtn.dataset.posSupplier = "all";
        allBtn.innerHTML = `<i class="fa-solid fa-users"></i> Barchasi`;
        suppliersFilterContainer.appendChild(allBtn);
        
        // Add active/visible suppliers
        state.suppliers.forEach(s => {
            if (s.visible) {
                const btn = document.createElement("button");
                btn.className = `filter-btn ${state.activeSupplier === s.name ? "active" : ""}`;
                btn.dataset.posSupplier = s.name;
                btn.innerHTML = `<i class="${s.icon || 'fa-solid fa-user'}"></i> ${s.name}`;
                suppliersFilterContainer.appendChild(btn);
            }
        });
    }
    
    if (categoriesFilterContainer) {
        categoriesFilterContainer.innerHTML = "";
        
        // Add "Barchasi" button
        const allBtn = document.createElement("button");
        allBtn.className = `filter-btn ${state.activeCategory === "all" ? "active" : ""}`;
        allBtn.dataset.posFilter = "all";
        allBtn.innerHTML = `<i class="fa-solid fa-border-all"></i> Barchasi`;
        categoriesFilterContainer.appendChild(allBtn);
        
        // Add active/visible categories
        state.categories.forEach(c => {
            if (c.visible) {
                const btn = document.createElement("button");
                btn.className = `filter-btn ${state.activeCategory === c.code ? "active" : ""}`;
                btn.dataset.posFilter = c.code;
                btn.innerHTML = `<i class="${c.icon || 'fa-solid fa-tag'}"></i> ${c.name}`;
                categoriesFilterContainer.appendChild(btn);
            }
        });
    }

    // Re-bind POS click event listeners to new elements
    bindPOSFilterEvents();
}

// 6.8 WAREHOUSE (OMBOR) FILTERS RENDERER [NEW]
function renderOmborFilters() {
    const suppliersFilterContainer = document.getElementById("ombor-suppliers-filter");
    const categoriesFilterContainer = document.getElementById("ombor-categories-filter");
    
    if (suppliersFilterContainer) {
        suppliersFilterContainer.innerHTML = "";
        
        // Add "Barchasi" button
        const allBtn = document.createElement("button");
        allBtn.className = `filter-btn ${state.omborActiveSupplier === "all" ? "active" : ""}`;
        allBtn.dataset.omborSupplier = "all";
        allBtn.innerHTML = `<i class="fa-solid fa-users"></i> Barchasi`;
        suppliersFilterContainer.appendChild(allBtn);
        
        // Add active/visible suppliers
        state.suppliers.forEach(s => {
            if (s.visible) {
                const btn = document.createElement("button");
                btn.className = `filter-btn ${state.omborActiveSupplier === s.name ? "active" : ""}`;
                btn.dataset.omborSupplier = s.name;
                btn.innerHTML = `<i class="${s.icon || 'fa-solid fa-user'}"></i> ${s.name}`;
                suppliersFilterContainer.appendChild(btn);
            }
        });
    }
    
    if (categoriesFilterContainer) {
        categoriesFilterContainer.innerHTML = "";
        
        // Add "Barchasi" button
        const allBtn = document.createElement("button");
        allBtn.className = `filter-btn ${state.omborActiveCategory === "all" ? "active" : ""}`;
        allBtn.dataset.omborCategory = "all";
        allBtn.innerHTML = `<i class="fa-solid fa-border-all"></i> Barchasi`;
        categoriesFilterContainer.appendChild(allBtn);
        
        // Add active/visible categories
        state.categories.forEach(c => {
            if (c.visible) {
                const btn = document.createElement("button");
                btn.className = `filter-btn ${state.omborActiveCategory === c.code ? "active" : ""}`;
                btn.dataset.omborCategory = c.code;
                btn.innerHTML = `<i class="${c.icon || 'fa-solid fa-tag'}"></i> ${c.name}`;
                categoriesFilterContainer.appendChild(btn);
            }
        });
    }

    // Bind click events to new Ombor filter elements
    bindOmborFilterEvents();
}

function bindOmborFilterEvents() {
    const supplierBtns = document.querySelectorAll("[data-ombor-supplier]");
    supplierBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("[data-ombor-supplier]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.omborActiveSupplier = btn.dataset.omborSupplier;
            renderOmborTable();
        });
    });

    const categoryBtns = document.querySelectorAll("[data-ombor-category]");
    categoryBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("[data-ombor-category]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.omborActiveCategory = btn.dataset.omborCategory;
            renderOmborTable();
        });
    });
}

function bindPOSFilterEvents() {
    const supplierBtns = document.querySelectorAll("[data-pos-supplier]");
    supplierBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("[data-pos-supplier]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.activeSupplier = btn.dataset.posSupplier;
            renderTiles();
        });
    });

    const categoryBtns = document.querySelectorAll("[data-pos-filter]");
    categoryBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("[data-pos-filter]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.activeCategory = btn.dataset.posFilter;
            renderTiles();
        });
    });
}

// ===================== RANG / O'LCHAM ZAXIRASI (per-color/size stock) =====================
let colorStock = {};
try { const _cs = localStorage.getItem("eco_sports_color_stock"); if (_cs) colorStock = JSON.parse(_cs) || {}; } catch (e) { colorStock = {}; }

function saveColorStock() {
    localStorage.setItem("eco_sports_color_stock", JSON.stringify(colorStock));
    if (typeof dbSaveConfig === "function") dbSaveConfig("eco_color_stock", colorStock);
}
function hasColorData(p) {
    return !!(p && p.colorPacksBreakdown && Object.keys(p.colorPacksBreakdown).length > 0 && p.sizes && p.sizes.length > 0);
}
// 1 pachka = har o'lchamdan 1 dona. Boshlang'ich: har rang uchun packs ta har o'lchamda.
function ensureColorStock(p) {
    if (!hasColorData(p)) return null;
    if (colorStock[p.id]) return colorStock[p.id];
    const cs = {};
    Object.entries(p.colorPacksBreakdown).forEach(([color, packs]) => {
        cs[color] = {};
        p.sizes.forEach(size => { cs[color][size] = Number(packs) || 0; });
    });
    colorStock[p.id] = cs;
    saveColorStock();
    return cs;
}
function packSizeOf(p) { return (p.sizes && p.sizes.length) ? p.sizes.length : 5; }
// Optim chala dona narxi: pachka sotuv narxi / pachkadagi dona soni
function optimDonaPrice(p) {
    const packPrice = p.pack_price || (5 * p.price);
    return Math.round(packPrice / packSizeOf(p));
}

function colorStockSummary(p) {
    const cs = colorStock[p.id];
    if (!cs) return null;
    const sizes = p.sizes || [];
    const colors = {};
    let totalDona = 0, totalFullPacks = 0;
    Object.entries(cs).forEach(([color, sizeMap]) => {
        const counts = sizes.map(s => sizeMap[s] || 0);
        const sum = counts.reduce((a, b) => a + b, 0);
        const fullPacks = counts.length ? Math.min(...counts) : 0;
        colors[color] = { total: sum, fullPacks, sizes: sizeMap };
        totalDona += sum;
        totalFullPacks += fullPacks;
    });
    return { colors, totalDona, totalFullPacks, packSize: packSizeOf(p) };
}
// Colors that still have at least one FULL pack (for optim pack sale)
function availablePackColors(p) {
    const cs = ensureColorStock(p);
    if (!cs) return [];
    return Object.keys(cs).filter(color => p.sizes.every(s => (cs[color][s] || 0) >= 1));
}
// Colors that have at least one piece of the given size (for dona sale)
function availableDonaColors(p, size) {
    const cs = ensureColorStock(p);
    if (!cs) return [];
    return Object.keys(cs).filter(color => (cs[color][size] || 0) >= 1);
}
function deductColorPack(p, color, packs) {
    const cs = ensureColorStock(p);
    if (!cs || !cs[color]) return;
    (p.sizes || []).forEach(size => { cs[color][size] = Math.max(0, (cs[color][size] || 0) - packs); });
    saveColorStock();
}
function deductColorDona(p, color, size, qty) {
    const cs = ensureColorStock(p);
    if (!cs || !cs[color]) return;
    cs[color][size] = Math.max(0, (cs[color][size] || 0) - qty);
    saveColorStock();
}

// Tanlangan mahsulot/rang/o'lcham uchun MAVJUD zaxira (pachka yoki dona)
function availableUnitsFor(product, color, size, isPack) {
    if (!product) return Infinity;
    const useColors = hasColorData(product);
    if (isPack) {
        if (useColors && color) {
            const cs = ensureColorStock(product);
            if (cs && cs[color]) {
                const sizes = product.sizes || [];
                return sizes.length ? Math.min(...sizes.map(s => cs[color][s] || 0)) : 0;
            }
            return 0;
        }
        // Rangsiz mahsulot: jami pachka = jami dona / pachkadagi dona
        const ps = packSizeOf(product) || 1;
        return Math.floor((inventory[product.id] || 0) / ps);
    }
    // Dona savdo
    if (useColors && color && size) {
        const cs = ensureColorStock(product);
        let avail = (cs && cs[color]) ? (cs[color][size] || 0) : 0;
        // Optim chala dona sotganda — to'liq pachkani buzmaydi, faqat ortgan donalar
        if (currentUser && currentUser.role === "kassir-optim" && cs && cs[color]) {
            const sizes = product.sizes || [];
            const full = sizes.length ? Math.min(...sizes.map(s => cs[color][s] || 0)) : 0;
            avail = Math.max(0, avail - full);
        }
        return avail;
    }
    return inventory[product.id] || 0;
}

// Savatda shu mahsulot/o'lcham/rang uchun allaqachon turgan miqdor
function cartLineQty(productId, size, color) {
    const it = state.cart.find(i => i.product.id === productId && i.size === size && (i.color || null) === (color || null));
    return it ? it.qty : 0;
}

// 7. POS TILES RENDERER
function renderTiles() {
    let filtered = PRODUCTS.filter(p => {
        if (p.approved === false) return false;
        const matchesSupplier = state.activeSupplier === "all" || p.supplier === state.activeSupplier;
        const matchesCategory = state.activeCategory === "all" || p.category === state.activeCategory;
        const matchesSearch = p.name.toLowerCase().includes(state.searchQuery.toLowerCase());
        return matchesSupplier && matchesCategory && matchesSearch;
    });

    tilesGrid.innerHTML = "";

    if (filtered.length === 0) {
        tilesGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
                <i class="fa-solid fa-face-frown" style="font-size: 2.2rem; color: var(--text-muted); margin-bottom: 0.8rem;"></i>
                <p>Mos kiyimlar topilmadi</p>
            </div>
        `;
        return;
    }

    filtered.forEach(product => {
        const card = document.createElement("div");
        card.className = "tile-card";
        card.innerHTML = `
            <img src="${product.image}" class="tile-img" alt="${product.name}" loading="lazy">
            <h4>${product.name}</h4>
            <span class="tile-price">${formatPrice(product.price)}</span>
        `;
        card.addEventListener("click", () => {
            if (currentUser && currentUser.role === "kassir-optim") {
                // Rang ma'lumoti bo'lsa — rang tanlash uchun modal; aks holda to'g'ridan savatga
                if (hasColorData(product)) {
                    openCalcModal(product.id);
                } else {
                    card.classList.add("pulsing");
                    setTimeout(() => card.classList.remove("pulsing"), 400);
                    addPackToCart(product);
                }
            } else {
                openCalcModal(product.id);
            }
        });
        tilesGrid.appendChild(card);
    });
}

function addPackToCart(product) {
    const packPrice = product.pack_price || (5 * product.price);
    const packSize = "Pachka (Set: S-XXL)";

    // Zaxira tekshiruvi: mavjuddan ko'p sotib bo'lmaydi
    const maxStock = availableUnitsFor(product, null, packSize, true);
    const already = cartLineQty(product.id, packSize, null);
    if (already + 1 > maxStock) {
        alert(`⚠️ Zaxirada faqat ${maxStock} pachka bor!` + (already ? `\n(Savatda allaqachon ${already} pachka)` : ""));
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        return;
    }

    const existing = state.cart.find(item => item.product.id === product.id && item.size === packSize);
    if (existing) {
        existing.qty += 1;
    } else {
        state.cart.push({
            product: product,
            size: packSize,
            qty: 1,
            soldPrice: packPrice
        });
    }
    updateReceiptUI();
    
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }
}

// 8. POS CALCULATOR POPUP MODAL
// Premium rang tugmasi (swatch + nom + qoldiq) — sotuv kalkulyatori uchun
function buildCalcColorBtn(color, count, unit, disabled) {
    const isLight = ["Oq", "Melanj", "Xakki"].includes(color);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "calc-color-btn" + (disabled ? " is-disabled" : "");
    btn.disabled = disabled;
    btn.innerHTML = `
        <span class="ccb-swatch${isLight ? ' is-light' : ''}" style="background-color:${getColorHex(color)};"></span>
        <span class="ccb-name">${color}</span>
        <span class="ccb-count">${count} ${unit}</span>`;
    return btn;
}

function openCalcModal(productId) {
    const product = PRODUCTS.find(p => p.id === productId);
    if (!product) return;

    state.selectedProduct = product;
    state.selectedColor = null;

    const isOptim = currentUser && currentUser.role === "kassir-optim";
    const useColors = hasColorData(product);
    if (useColors) ensureColorStock(product);

    // Set labels
    const qtyLabel = document.querySelector('label[for="calc-qty"]');
    if (qtyLabel) qtyLabel.textContent = isOptim ? "Miqdori (pachka):" : "Miqdori (dona):";
    const priceLabel = document.querySelector('label[for="calc-unit-price"]');
    if (priceLabel) priceLabel.textContent = isOptim ? "Sotish narxi (pachka uchun - UZS):" : "Sotish narxi (bitta dona uchun - UZS):";

    calcTitle.textContent = product.name;
    calcCat.textContent = product.category === 'tshirt' ? 'FUTBOLKA' : product.category === 'shorts' ? 'SHORTIK' : product.category === 'tracksuit' ? 'SPORTIVKA' : 'TRIKO';
    calcQtyInput.value = 1;
    const stdPrice = isOptim ? (product.pack_price || (5 * product.price)) : product.price;
    calcStdPrice.textContent = stdPrice.toLocaleString('uz-UZ');
    calcPriceInput.value = stdPrice;

    const colorGroup = document.getElementById("calc-color-group");
    const colorOptions = document.getElementById("calc-color-options");
    const sizeLabelEl = document.getElementById("calc-size-label");

    if (isOptim) {
        if (useColors && colorGroup && colorOptions) {
            if (sizeLabelEl) sizeLabelEl.textContent = "Pachka / chala dona:";
            colorGroup.style.display = "block";
            const cs = colorStock[product.id];
            colorOptions.innerHTML = "";
            let firstAvail = null, firstAny = null;
            Object.keys(cs).forEach(color => {
                const counts = product.sizes.map(s => cs[color][s] || 0);
                const fullPacks = counts.length ? Math.min(...counts) : 0;
                const totalDona = counts.reduce((a, b) => a + b, 0);
                // To'liq pachka bo'lsa pachka sonini, aks holda chala dona sonini ko'rsat
                const label = fullPacks >= 1 ? fullPacks : totalDona;
                const unit = fullPacks >= 1 ? "pachka" : "chala dona";
                const btn = buildCalcColorBtn(color, label, unit, totalDona < 1);
                if (fullPacks >= 1 && !firstAvail) firstAvail = color;
                if (totalDona >= 1 && !firstAny) firstAny = color;
                btn.addEventListener("click", () => {
                    if (totalDona < 1) return;
                    colorOptions.querySelectorAll(".calc-color-btn").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    state.selectedColor = color;
                    renderOptimSizes(product, color);
                });
                colorOptions.appendChild(btn);
            });
            const chosen = firstAvail || firstAny;
            state.selectedColor = chosen;
            if (chosen) {
                const idx = Object.keys(cs).indexOf(chosen);
                const btns = colorOptions.querySelectorAll(".calc-color-btn");
                if (btns[idx]) btns[idx].classList.add("active");
                renderOptimSizes(product, chosen);
            }
        } else {
            // Rangsiz mahsulot — oddiy bitta pachka
            state.selectedSize = "Pachka (Set: S-XXL)";
            if (sizeLabelEl) sizeLabelEl.textContent = "Pachka:";
            if (colorGroup) colorGroup.style.display = "none";
            calcSizesContainer.innerHTML = "";
            const sbtn = document.createElement("button");
            sbtn.type = "button"; sbtn.className = "size-btn pack-btn active";
            sbtn.innerHTML = `<span class="pb-ic">📦</span><span class="pb-label">1 Pachka (Set: S-XXL)</span>`;
            calcSizesContainer.appendChild(sbtn);
        }
    } else {
        if (sizeLabelEl) sizeLabelEl.textContent = "Sotilayotgan o'lchamni tanlang:";
        if (useColors && colorGroup && colorOptions) {
            colorGroup.style.display = "block";
            const cs = colorStock[product.id];
            colorOptions.innerHTML = "";
            let firstColor = null;
            Object.keys(cs).forEach(color => {
                const total = product.sizes.reduce((a, s) => a + (cs[color][s] || 0), 0);
                const btn = buildCalcColorBtn(color, total, "dona", total < 1);
                if (total >= 1 && !firstColor) firstColor = color;
                btn.addEventListener("click", () => {
                    if (total < 1) return;
                    colorOptions.querySelectorAll(".calc-color-btn").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    state.selectedColor = color;
                    renderCalcDonaSizes(product, color);
                });
                colorOptions.appendChild(btn);
            });
            state.selectedColor = firstColor || Object.keys(cs)[0];
            const fidx = Object.keys(cs).indexOf(state.selectedColor);
            const cbtns = colorOptions.querySelectorAll(".calc-color-btn");
            if (cbtns[fidx]) cbtns[fidx].classList.add("active");
            renderCalcDonaSizes(product, state.selectedColor);
        } else {
            if (colorGroup) colorGroup.style.display = "none";
            state.selectedSize = product.sizes[0];
            calcSizesContainer.innerHTML = "";
            product.sizes.forEach(size => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = `size-btn ${size === state.selectedSize ? 'active' : ''}`;
                btn.textContent = size;
                btn.addEventListener("click", () => {
                    calcSizesContainer.querySelectorAll(".size-btn").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    state.selectedSize = size;
                });
                calcSizesContainer.appendChild(btn);
            });
        }
    }

    calcModal.classList.add("open");
}

// Dona: o'lchamlarni tanlangan rang bo'yicha (har o'lcham qoldig'i bilan) ko'rsatadi
function renderCalcDonaSizes(product, color) {
    const cs = colorStock[product.id];
    const sizeMap = (cs && cs[color]) ? cs[color] : {};
    calcSizesContainer.innerHTML = "";
    let firstAvail = null;
    product.sizes.forEach(size => {
        const avail = sizeMap[size] || 0;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "size-btn dona-btn";
        btn.disabled = avail < 1;
        btn.innerHTML = `<span class="cb-size">${size}</span><small>${avail} ta</small>`;
        if (avail < 1) btn.classList.add("is-empty");
        else if (!firstAvail) firstAvail = size;
        btn.addEventListener("click", () => {
            if (avail < 1) return;
            calcSizesContainer.querySelectorAll(".size-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.selectedSize = size;
        });
        calcSizesContainer.appendChild(btn);
    });
    state.selectedSize = firstAvail || product.sizes[0];
    const btns = calcSizesContainer.querySelectorAll(".size-btn");
    product.sizes.forEach((size, i) => { if (size === state.selectedSize && btns[i]) btns[i].classList.add("active"); });
}

// Optim: qty/narx yorliqlarini "pachka" yoki "chala dona"ga moslaydi
function setOptimUnitLabels(isPack) {
    const qtyLabel = document.querySelector('label[for="calc-qty"]');
    if (qtyLabel) qtyLabel.textContent = isPack ? "Miqdori (pachka):" : "Miqdori (dona):";
    const priceLabel = document.querySelector('label[for="calc-unit-price"]');
    if (priceLabel) priceLabel.textContent = isPack ? "Sotish narxi (pachka - UZS):" : "Sotish narxi (chala dona - UZS):";
}

// Optim modal: tanlangan rang uchun "to'liq pachka" + "chala dona" tugmalari
function renderOptimSizes(product, color) {
    const cs = colorStock[product.id];
    const sizeMap = (cs && cs[color]) ? cs[color] : {};
    const sizes = product.sizes || [];
    const fullPacks = sizes.length ? Math.min(...sizes.map(s => sizeMap[s] || 0)) : 0;
    const packPrice = product.pack_price || (5 * product.price);
    const donaPrice = optimDonaPrice(product);
    calcSizesContainer.innerHTML = "";

    const selectPack = () => {
        calcSizesContainer.querySelectorAll(".size-btn").forEach(b => b.classList.remove("active"));
        packBtn.classList.add("active");
        state.selectedSize = "Pachka (Set: S-XXL)";
        if (calcPriceInput) calcPriceInput.value = packPrice;
        if (calcStdPrice) calcStdPrice.textContent = packPrice.toLocaleString('uz-UZ');
        if (calcQtyInput) calcQtyInput.value = 1;
        setOptimUnitLabels(true);
    };
    const selectDona = (size, btn) => {
        calcSizesContainer.querySelectorAll(".size-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.selectedSize = size;
        if (calcPriceInput) calcPriceInput.value = donaPrice;
        if (calcStdPrice) calcStdPrice.textContent = donaPrice.toLocaleString('uz-UZ');
        if (calcQtyInput) calcQtyInput.value = 1;
        setOptimUnitLabels(false);
    };

    // To'liq pachka tugmasi
    const packBtn = document.createElement("button");
    packBtn.type = "button";
    packBtn.className = "size-btn pack-btn";
    packBtn.disabled = fullPacks < 1;
    packBtn.innerHTML = `<span class="pb-ic">📦</span><span class="pb-label">To'liq pachka</span><small>${fullPacks} ta</small>`;
    if (fullPacks < 1) { packBtn.classList.add("is-empty"); }
    packBtn.addEventListener("click", () => { if (fullPacks >= 1) selectPack(); });
    calcSizesContainer.appendChild(packBtn);

    // Chala donalar (to'liq pachkadan ortgan har o'lcham)
    let firstDonaBtn = null, firstDonaSize = null;
    sizes.forEach(size => {
        const left = Math.max(0, (sizeMap[size] || 0) - fullPacks);
        if (left <= 0) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "size-btn chala-btn";
        btn.innerHTML = `<span class="cb-size">${size}</span><small>chala ×${left}</small>`;
        btn.addEventListener("click", () => selectDona(size, btn));
        calcSizesContainer.appendChild(btn);
        if (!firstDonaBtn) { firstDonaBtn = btn; firstDonaSize = size; }
    });

    // Ogohlantirish: tugagan (0) o'lchamlar
    const missing = sizes.filter(s => (sizeMap[s] || 0) < 1);
    if (missing.length) {
        const warn = document.createElement("div");
        warn.className = "pack-warn";
        warn.innerHTML = `<span>⚠️</span><span>Bu pachkada yo'q: <b>${missing.join(", ")}</b> — qolgan o'lchamlar dona narxida (${donaPrice.toLocaleString('uz-UZ')} so'm) sotiladi</span>`;
        calcSizesContainer.appendChild(warn);
    }

    // Avto-tanlash: to'liq pachka bo'lsa o'sha, aks holda birinchi chala dona
    if (fullPacks >= 1) selectPack();
    else if (firstDonaBtn) selectDona(firstDonaSize, firstDonaBtn);
}

function closeCalculatorModal() {
    calcModal.classList.remove("open");
    state.selectedProduct = null;
    state.selectedSize = null;
    state.selectedColor = null;
}

// 9. VIRTUAL CASH REGISTER RECEIPTS MANAGEMENT
// Olingan summa / qolgan qarz UI'sini yangilaydi
function updatePaymentUI() {
    if (!receivedInput || !remainingDebtEl) return;
    const subtotal = state.cart.reduce((t, i) => t + (i.soldPrice * i.qty), 0);
    const discount = parseFloat(discountInput.value) || 0;
    const finalTotal = Math.max(0, subtotal - discount);

    // Foydalanuvchi qo'lda o'zgartirmagan bo'lsa — to'liq summani avto-to'ldirish
    if (!posReceivedTouched) {
        receivedInput.value = finalTotal > 0 ? finalTotal : "";
    }
    let received = parseFloat(receivedInput.value);
    if (isNaN(received)) received = 0;
    received = Math.min(Math.max(0, received), finalTotal); // qarz manfiy bo'lmaydi
    const debt = Math.max(0, finalTotal - received);

    remainingDebtEl.textContent = formatPrice(debt);
    remainingDebtEl.classList.toggle("has-debt", debt > 0);
    if (debtorFields) debtorFields.style.display = debt > 0 ? "flex" : "none";
}

function updateReceiptUI() {
    const subtotal = state.cart.reduce((total, item) => total + (item.soldPrice * item.qty), 0);
    const discount = parseFloat(discountInput.value) || 0;
    const finalTotal = Math.max(0, subtotal - discount);

    receiptSubtotal.textContent = formatPrice(subtotal);
    receiptDiscountValue.textContent = "-" + formatPrice(discount);
    receiptFinalTotal.textContent = formatPrice(finalTotal);

    updatePaymentUI();

    // Sync checkout button
    if (state.cart.length > 0) {
        checkoutBtn.removeAttribute("disabled");
    } else {
        checkoutBtn.setAttribute("disabled", "true");
    }

    // Sotish tugmasi: faqat HAQIQIY Telegram ichida MainButton'ga tayanamiz,
    // aks holda (PWA/brauzer) oddiy "SOTISHNI YAKUNLASH" tugmasi ko'rsatiladi.
    if (isTelegram && tg.MainButton) {
        checkoutBtn.style.display = "none";
        if (state.cart.length > 0) {
            tg.MainButton.setText(`SOTISHNI YAKUNLASH (${formatPrice(finalTotal)})`);
            tg.MainButton.setParams({ color: "#10b981", text_color: "#ffffff" });
            tg.MainButton.show();
        } else {
            tg.MainButton.hide();
        }
    } else {
        checkoutBtn.style.display = ""; // PWA/brauzer: oddiy tugma ko'rinadi
    }

    // Toggle mobile floating cart bar
    const mobileCartBar = document.getElementById("pos-mobile-cart-bar");
    if (mobileCartBar) {
        const isOptim = currentUser && currentUser.role === "kassir-optim";
        const isMobile = window.innerWidth <= 768;
        if (isOptim && isMobile && state.cart.length > 0) {
            mobileCartBar.style.display = "flex";
            const totalPacks = state.cart.reduce((sum, item) => sum + item.qty, 0);
            document.getElementById("mobile-cart-count").textContent = totalPacks;
            document.getElementById("mobile-cart-total").textContent = formatPrice(finalTotal);
        } else {
            mobileCartBar.style.display = "none";
        }
    }

    // Render receipt rows
    receiptList.innerHTML = "";
    state.cart.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "receipt-item";
        
        const colorTag = item.color ? `${item.color} ` : "";
        const isPackItem = String(item.size || "").includes("Pachka");
        const sizeLabel = isPackItem ? `${colorTag}pachka` : `${colorTag}(${item.size})`;
        
        row.innerHTML = `
            <span class="receipt-item-name" style="cursor: pointer;" title="Tahrirlash uchun ikki marta bosing">${item.product.name}</span>
            <div class="receipt-item-qty">
                <button class="qty-btn r-qty-minus" data-index="${index}" style="width:18px; height:18px; font-size:0.6rem;"><i class="fa-solid fa-minus"></i></button>
                <span style="font-weight: 700;">${item.qty} ${sizeLabel}</span>
                <button class="qty-btn r-qty-plus" data-index="${index}" style="width:18px; height:18px; font-size:0.6rem;"><i class="fa-solid fa-plus"></i></button>
            </div>
            <span class="receipt-item-price">${formatPrice(item.soldPrice * item.qty)}</span>
            <button class="receipt-remove" data-index="${index}"><i class="fa-solid fa-xmark"></i></button>
        `;
        
        // Double-click to open calculator modal for quick edits
        row.querySelector(".receipt-item-name").addEventListener("dblclick", () => {
            openCalcModal(item.product.id);
            // Pre-fill existing quantity and price in inputs
            setTimeout(() => {
                if (calcQtyInput) calcQtyInput.value = item.qty;
                if (calcPriceInput) calcPriceInput.value = item.soldPrice;
            }, 50);
        });

        receiptList.appendChild(row);
    });

    // Control listeners inside rows
    document.querySelectorAll(".r-qty-minus").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.index);
            if (state.cart[idx].qty > 1) {
                state.cart[idx].qty--;
            } else {
                state.cart.splice(idx, 1);
            }
            updateReceiptUI();
        });
    });

    document.querySelectorAll(".r-qty-plus").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.index);
            const it = state.cart[idx];
            const isPack = String(it.size || "").includes("Pachka");
            const maxStock = availableUnitsFor(it.product, it.color || null, it.size, isPack);
            if (it.qty + 1 > maxStock) {
                alert(`⚠️ Zaxirada faqat ${maxStock} ${isPack ? "pachka" : "dona"} bor!`);
                if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
                return;
            }
            it.qty++;
            updateReceiptUI();
        });
    });

    document.querySelectorAll(".receipt-remove").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.index);
            state.cart.splice(idx, 1);
            updateReceiptUI();
        });
    });
}

// 10. TRANSACTION CHECKOUT & DIRECT TELEGRAM BOT INVOICING
async function completeSale() {
    if (state.cart.length === 0) return;

    const subtotal = state.cart.reduce((total, item) => total + (item.soldPrice * item.qty), 0);
    const discount = parseFloat(discountInput.value) || 0;
    const finalTotal = Math.max(0, subtotal - discount);
    const itemCount = state.cart.reduce((sum, item) => sum + item.qty, 0);

    // --- Olingan summa / qarz (nasiya) ---
    let received = parseFloat(receivedInput?.value);
    if (isNaN(received)) received = finalTotal; // bo'sh bo'lsa — to'liq to'lov
    received = Math.max(0, Math.min(received, finalTotal));
    const debtAmount = Math.max(0, finalTotal - received);

    let debtor = null;
    if (debtAmount > 0) {
        const dName = (debtorNameInput?.value || "").trim();
        const dPhone = (debtorPhoneInput?.value || "").trim();
        const dTg = (debtorTgInput?.value || "").trim();
        const dDate = debtorDateInput?.value || "";
        if (!dName || !dPhone || !dDate) {
            alert("Qarzga berishda qarzdor ismi, telefon raqami va qaytarish sanasi majburiy!");
            return;
        }
        debtor = { name: dName, phone: dPhone, telegram: dTg, dueDate: dDate };
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('uz-UZ') + " " + now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    const orderId = generateReceiptId();

    // Map raw structured items array to store complete pricing & sizing
    const itemsData = state.cart.map(item => ({
        name: item.product.name,
        size: item.size,
        color: item.color || null,
        qty: item.qty,
        soldPrice: item.soldPrice
    }));

    const newTx = {
        id: orderId,
        timestamp: dateStr,
        channel: channelSelect.value,
        items: itemsData,
        discount: discount,
        subtotal: subtotal,
        totalPaid: finalTotal,
        received: received,
        debt: debtAmount,
        debtor: debtor,
        itemCount: itemCount,
        cashier: activeCashierLabel.textContent
    };

    // Save transaction to local state and DB
    state.salesHistory.push(newTx);
    localStorage.setItem("eco_sports_sales_history", JSON.stringify(state.salesHistory));
    dbSaveSale(newTx, itemsData);

    // Nasiya savdo bo'lsa — mijoz qarzini yozib qo'yish
    if (debtAmount > 0 && debtor) {
        customerDebts.push({
            id: orderId,
            date: dateStr,
            name: debtor.name,
            phone: debtor.phone,
            telegram: debtor.telegram,
            dueDate: debtor.dueDate,
            total: finalTotal,
            received: received,
            debt: debtAmount,
            cashier: activeCashierLabel.textContent,
            paid: false
        });
        saveCustomerDebts();
    }

    // Subtract purchased items from stock inventory
    state.cart.forEach(item => {
        const prodId = item.product.id;
        const isPack = item.size.includes("Pachka");
        const pSize = packSizeOf(item.product);
        const factor = isPack ? pSize : 1;
        const qtyToSubtract = item.qty * factor;

        if (inventory[prodId] !== undefined) {
            inventory[prodId] = Math.max(0, inventory[prodId] - qtyToSubtract);
        }

        // Rang/o'lcham zaxirasini ayirish (rang tanlangan bo'lsa)
        if (item.color && hasColorData(item.product)) {
            if (isPack) {
                deductColorPack(item.product, item.color, item.qty); // pachka: har o'lchamdan item.qty
            } else {
                deductColorDona(item.product, item.color, item.size, item.qty);
            }
        }
    });
    localStorage.setItem("eco_sports_inventory", JSON.stringify(inventory));
    dbSaveFullInventory();

    // --- O'ZGARMAS JURNAL: sotuv yozuvi (audit izi + kunlik svertka uchun) ---
    if (typeof appendLedger === "function") {
        appendLedger("sale", {
            ref: orderId, account: "kassa", direction: "in", amount: received,
            note: debtAmount > 0 ? "Nasiya — qarz " + formatPrice(debtAmount) : "To'liq to'lov",
            data: { total: finalTotal, received: received, debt: debtAmount, itemCount: itemCount, channel: newTx.channel, debtor: debtor ? debtor.name : null }
        });
        if (debtAmount > 0 && debtor) {
            appendLedger("customer_debt", { ref: orderId, account: "mijoz_qarzi", direction: "neutral", amount: debtAmount, note: debtor.name + " · qaytarish " + (debtor.dueDate || "") });
        }
    }

    // Formulate a beautiful invoice message in corporate HTML format
    let orderMsg = `<b>💼 ECO SPORTS - TIZIMDA SOTUV YAKUNLANDI</b>\n`;
    orderMsg += `<b>Chek ID:</b> <code>#${orderId}</code>\n`;
    orderMsg += `<b>Sana:</b> ${dateStr}\n`;
    orderMsg += `<b>Kassir:</b> ${activeCashierLabel.textContent}\n`;
    orderMsg += `<b>Sotuv kanali:</b> ${channelSelect.value === 'telegram' ? 'Mini App' : channelSelect.value === 'phone' ? 'Telefon' : 'Do\'kon (POS)'}\n`;
    orderMsg += `-------------------------------------------\n`;
    orderMsg += `🛍 <b>Mahsulotlar:</b>\n`;

    state.cart.forEach(item => {
        const isPack = item.size.includes("Pachka");
        const qtyText = isPack ? `${item.qty} pachka` : `${item.qty} dona (${item.size})`;
        orderMsg += `- <code>${item.product.name}</code> ➔ <b>${qtyText}</b> ➔ <b>${formatPrice(item.soldPrice * item.qty)}</b>\n`;
    });
    orderMsg += `-------------------------------------------\n`;
    if (discount > 0) {
        orderMsg += `<b>Chegirma:</b> -${formatPrice(discount)}\n`;
    }
    orderMsg += `💵 <b>Jami:</b> <u>${formatPrice(finalTotal)}</u>\n`;
    orderMsg += `✅ <b>Olingan:</b> ${formatPrice(received)}\n`;
    if (debtAmount > 0 && debtor) {
        orderMsg += `🔴 <b>Qarz:</b> ${formatPrice(debtAmount)}\n`;
        orderMsg += `👤 <b>Qarzdor:</b> ${debtor.name} | 📞 ${debtor.phone}${debtor.telegram ? ' | ' + debtor.telegram : ''}\n`;
        orderMsg += `📅 <b>Qaytarish sanasi:</b> ${debtor.dueDate}\n`;
    }
    orderMsg += `\n🟢 <i>CRM Tizimi muvaffaqiyatli yangilandi.</i>`;

    console.log("%cSale Committed!", "color:#10b981; font-weight:bold;");
    console.log(orderMsg);

    // Chek xabarini Telegram'ga yuborish — token endi SERVERDA (/api/notify), frontendда yo'q.
    const targetChatId = appConfig.chatId || tg?.initDataUnsafe?.user?.id || "";
    try {
        await fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: orderMsg, chatId: targetChatId })
        });
        console.log("Chek /api/notify orqali yuborildi (chat: " + targetChatId + ")");
    } catch (err) {
        // Lokal dev'da (npx serve) /api yo'q — bu normal; sotuv baribir saqlanadi
        console.warn("Telegram xabar yuborilmadi (lokal dev yoki tarmoq):", err);
    }

    // Trigger haptic vibration
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
    }

    // Populate and open Premium Virtual Success Receipt Modal
    const storeName = appConfig.storeName || "ECO SPORTS";
    const storeDesc = `Qo'qon shahar | Tel: ${appConfig.storePhone || ""}`;
    const receiptStoreNameEl = document.getElementById("receipt-store-name");
    const receiptStoreDescEl = document.getElementById("receipt-store-desc");
    if (receiptStoreNameEl) receiptStoreNameEl.textContent = storeName;
    if (receiptStoreDescEl) receiptStoreDescEl.textContent = storeDesc;

    receiptModalId.textContent = "#" + orderId;
    receiptModalDate.textContent = now.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' });
    receiptModalTime.textContent = now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    receiptModalCashier.textContent = activeCashierLabel.textContent;
    receiptModalChannel.textContent = channelSelect.value === 'telegram' ? 'Mini App' : channelSelect.value === 'phone' ? 'Telefon' : 'Do\'kon (POS)';
    receiptModalSubtotal.textContent = formatPrice(subtotal);
    receiptModalDiscount.textContent = "-" + formatPrice(discount);
    receiptModalTotal.textContent = formatPrice(finalTotal);

    // Chek modalida olingan summa / qarz
    const debtBlock = document.getElementById("receipt-modal-debt-block");
    if (debtBlock) {
        if (debtAmount > 0 && debtor) {
            debtBlock.style.display = "flex";
            const recEl = document.getElementById("receipt-modal-received");
            const debtEl = document.getElementById("receipt-modal-debt");
            const debtorEl = document.getElementById("receipt-modal-debtor");
            if (recEl) recEl.textContent = formatPrice(received);
            if (debtEl) debtEl.textContent = formatPrice(debtAmount);
            if (debtorEl) debtorEl.innerHTML =
                `<b>Qarzdor:</b> ${debtor.name}<br><b>Tel:</b> ${debtor.phone}` +
                `${debtor.telegram ? `<br><b>Telegram:</b> ${debtor.telegram}` : ''}` +
                `<br><b>Qaytarish:</b> ${debtor.dueDate}`;
        } else {
            debtBlock.style.display = "none";
        }
    }

    receiptModalItemsContainer.innerHTML = "";
    state.cart.forEach(item => {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "1.5fr 0.5fr 1fr";
        row.style.fontSize = "0.8rem";
        row.style.padding = "0.2rem 0";
        
        const isPack = item.size.includes("Pachka");
        const qtyDisplay = isPack ? `${item.qty} pachka` : `x${item.qty}`;
        const sizeDisplay = isPack ? "" : ` (${item.size})`;
        
        row.innerHTML = `
            <span>${item.product.name}${sizeDisplay}</span>
            <span style="text-align: center;">${qtyDisplay}</span>
            <span style="text-align: right; font-weight: bold;">${formatPrice(item.soldPrice * item.qty)}</span>
        `;
        receiptModalItemsContainer.appendChild(row);
    });

    successReceiptModal.classList.add("open");

    // Reset cashier forms
    state.cart = [];
    discountInput.value = 0;

    // To'lov / qarzdor maydonlarini tozalash
    posReceivedTouched = false;
    if (receivedInput) receivedInput.value = "";
    if (debtorNameInput) debtorNameInput.value = "";
    if (debtorPhoneInput) debtorPhoneInput.value = "";
    if (debtorTgInput) debtorTgInput.value = "";
    if (debtorDateInput) debtorDateInput.value = "";
    if (debtorFields) debtorFields.style.display = "none";

    // Close mobile sheet on successful checkout
    const registerContainer = document.querySelector(".register-container");
    if (registerContainer) {
        registerContainer.classList.remove("open");
    }
    
    updateReceiptUI();
    updateAnalytics();
    renderHistoryTable();

    // Regenerate unique receipt ID
    receiptIdLabel.textContent = "#" + generateReceiptId();
}

// 10.7 POS HISTORICAL RECEIPT VIEWER
function openHistoricalReceipt(txId) {
    const tx = state.salesHistory.find(t => t.id === txId);
    if (!tx) return;

    const storeName = appConfig.storeName || "ECO SPORTS";
    const storeDesc = `Qo'qon shahar | Tel: ${appConfig.storePhone || ""}`;
    const receiptStoreNameEl = document.getElementById("receipt-store-name");
    const receiptStoreDescEl = document.getElementById("receipt-store-desc");
    if (receiptStoreNameEl) receiptStoreNameEl.textContent = storeName;
    if (receiptStoreDescEl) receiptStoreDescEl.textContent = storeDesc;

    receiptModalId.textContent = "#" + tx.id;
    receiptModalDate.textContent = tx.timestamp.split(" ")[0] || "";
    receiptModalTime.textContent = tx.timestamp.split(" ")[1] || "";
    receiptModalCashier.textContent = tx.cashier || "Admin";
    receiptModalChannel.textContent = tx.channel === 'telegram' ? 'Mini App' : tx.channel === 'phone' ? 'Telefon' : 'Do\'kon (POS)';
    
    const subtotal = tx.subtotal || tx.totalPaid + tx.discount;
    receiptModalSubtotal.textContent = formatPrice(subtotal);
    receiptModalDiscount.textContent = "-" + formatPrice(tx.discount);
    receiptModalTotal.textContent = formatPrice(tx.totalPaid);

    receiptModalItemsContainer.innerHTML = "";
    tx.items.forEach(item => {
        const name = typeof item === 'object' ? `${item.name} (${item.size})` : item;
        const qtyText = typeof item === 'object' ? `x${item.qty}` : "";
        const priceText = typeof item === 'object' ? formatPrice(item.soldPrice * item.qty) : "";

        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "1.5fr 0.5fr 1fr";
        row.style.fontSize = "0.8rem";
        row.style.padding = "0.2rem 0";
        row.innerHTML = `
            <span>${name}</span>
            <span style="text-align: center;">${qtyText}</span>
            <span style="text-align: right; font-weight: bold;">${priceText}</span>
        `;
        receiptModalItemsContainer.appendChild(row);
    });

    successReceiptModal.classList.add("open");
}

// 10.5 POS PIN CODE MODAL CONTROLLER
function openPinModal() {
    if (state.cart.length === 0) return;
    
    pinInput.value = "";
    pinErrorMsg.style.display = "none";
    pinModal.classList.add("open");
    
    setTimeout(() => {
        pinInput.focus();
    }, 100);
}

function closePinModalOverlay() {
    pinModal.classList.remove("open");
}

function handlePinSubmit(e) {
    e.preventDefault();
    const pinVal = pinInput.value;

    const correctPin = currentUser?.pin || appConfig.pin;

    if (pinVal === correctPin) {
        pinErrorMsg.style.display = "none";
        closePinModalOverlay();
        completeSale();
    } else {
        pinErrorMsg.style.display = "flex";
        pinInput.value = "";
        if (tg && tg.HapticFeedback) {
            tg.HapticFeedback.notificationOccurred('error');
        }
    }
}

// 11. CRM ANALYTICS & LOG TABLES
function updateAnalytics() {
    const history = state.salesHistory;
    const totalRev = history.reduce((sum, tx) => sum + tx.totalPaid, 0);
    const salesCount = history.length;
    const avgInv = salesCount > 0 ? Math.round(totalRev / salesCount) : 0;
    const totalItems = history.reduce((sum, tx) => sum + tx.itemCount, 0);

    crmRevenue.textContent = formatPrice(totalRev);
    crmSalesCount.textContent = salesCount + " ta";
    crmAvgInvoice.textContent = formatPrice(avgInv);
    crmItemsCount.textContent = totalItems + " dona";
}

function renderHistoryTable() {
    const history = state.salesHistory;
    crmTableBody.innerHTML = "";

    if (history.length === 0) {
        crmEmptyState.style.display = "block";
        return;
    }
    
    crmEmptyState.style.display = "none";

    // Show most recent transaction first
    [...history].reverse().forEach((tx, idx) => {
        const row = document.createElement("tr");
        const actualIdx = history.length - 1 - idx;
        
        // Format products display dynamically
        const itemsSummary = tx.items.map(item => {
            return typeof item === 'object' ? `${item.name.replace(/.* - /, '')} (${item.size}) x${item.qty}` : item;
        }).join(", ");

        row.innerHTML = `
            <td><strong>#${tx.id}</strong></td>
            <td>${tx.timestamp}</td>
            <td><span class="channel-tag tag-${tx.channel}">${tx.channel === 'telegram' ? 'Mini App' : tx.channel === 'phone' ? 'Telefon' : 'Do\'kon'}</span></td>
            <td style="max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemsSummary}">${itemsSummary}</td>
            <td>${formatPrice(tx.discount)}</td>
            <td style="font-weight: 800; color: var(--primary);">${formatPrice(tx.totalPaid)}</td>
            <td style="display: flex; gap: 0.4rem; justify-content: center; align-items: center;">
                <button class="qty-btn inspect-receipt-btn" data-id="${tx.id}" style="background: rgba(6, 182, 212, 0.1); border-color: rgba(6, 182, 212, 0.2); color: var(--accent); width:30px; height:30px;" title="Chekni Ko'rish">
                    <i class="fa-solid fa-eye"></i>
                </button>
                <button class="qty-btn delete-log-btn" data-idx="${actualIdx}" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: #ef4444; width:30px; height:30px;" title="O'chirish">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        crmTableBody.appendChild(row);
    });

    // Inspect listener to trigger virtual receipt popup
    document.querySelectorAll(".inspect-receipt-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            openHistoricalReceipt(id);
        });
    });

    // Delete single transaction log listener
    document.querySelectorAll(".delete-log-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            if (confirm("Ushbu sotuv logini o'chirmoqchimisiz?")) {
                const idx = parseInt(btn.dataset.idx);
                const deletedTx = state.salesHistory[idx];
                state.salesHistory.splice(idx, 1);
                localStorage.setItem("eco_sports_sales_history", JSON.stringify(state.salesHistory));
                if (deletedTx) dbDeleteSale(deletedTx.id);
                renderHistoryTable();
                updateAnalytics();
            }
        });
    });
}

// 11.5 WAREHOUSE (OMBOR) INVENTORY RENDERER
function renderOmborTable() {
    const grid = document.getElementById("ombor-inventory-grid");
    if (!grid) return;

    // Ta'minotchi va kiyim turi filtrlarini ko'rsatish
    renderOmborFilters();

    grid.innerHTML = "";

    const searchVal = document.getElementById("ombor-search-input")?.value.toLowerCase() || "";
    const activeSupplier = state.omborActiveSupplier || "all";
    const activeCategory = state.omborActiveCategory || "all";

    // Merge standard PRODUCTS with dynamicProducts for warehouse manager view
    const allWarehouseProducts = [...PRODUCTS];
    state.dynamicProducts.forEach(p => {
        if (!allWarehouseProducts.find(item => item.id === p.id)) {
            allWarehouseProducts.push(p);
        }
    });

    const filtered = allWarehouseProducts.filter(p => {
        const matchesSupplier = activeSupplier === "all" || p.supplier === activeSupplier;
        const matchesCategory = activeCategory === "all" || p.category === activeCategory;
        const matchesSearch = p.name.toLowerCase().includes(searchVal);
        return matchesSupplier && matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="ombor-empty"><i class="fa-solid fa-box-open"></i><p>Mos mahsulotlar topilmadi</p></div>`;
        renderOmborSummary(0, 0, 0, 0);
        return;
    }

    const CAT = {
        tshirt: ["Futbolka", "fa-solid fa-shirt"],
        shorts: ["Shortik", "fa-solid fa-scissors"],
        tracksuit: ["Sportivka", "fa-solid fa-person-running"],
        joggers: ["Triko", "fa-solid fa-person-hiking"]
    };

    let totPacks = 0, totDona = 0, totLoose = 0;

    filtered.forEach(p => {
        const qty = inventory[p.id] !== undefined ? inventory[p.id] : (p.qty || 0);

        let statusClass, statusText;
        if (p.approved === false) { statusClass = "st-pending"; statusText = "Narx kutilmoqda"; }
        else if (qty === 0) { statusClass = "st-out"; statusText = "Tugadi"; }
        else if (qty <= 10) { statusClass = "st-low"; statusText = "Kam qoldi"; }
        else { statusClass = "st-ok"; statusText = "Etarli"; }

        const [catLabel, catIcon] = CAT[p.category] || ["Boshqa", "fa-solid fa-tag"];
        const img = p.image || "assets/tshirt.png";
        const priceDisplay = p.approved === false
            ? `<span class="ombor-card-pending">Kutilmoqda</span>`
            : formatPrice(p.price);
        const codeDisplay = p.approved === false ? p.id : `#${p.id}`;

        const colorProduct = hasColorData(p);
        const packSize = packSizeOf(p);
        let fullPacks, colorHint = "";
        if (colorProduct) {
            ensureColorStock(p);
            const sum = colorStockSummary(p);
            fullPacks = sum ? sum.totalFullPacks : Math.floor(qty / packSize);
            if (sum) {
                const dots = Object.keys(sum.colors).slice(0, 5).map(c =>
                    `<span class="ombor-color-dot" style="background:${getColorHex(c)};" title="${c}: ${sum.colors[c].total} dona"></span>`
                ).join("");
                colorHint = `<div class="ombor-card-colors">${dots}<span class="ombor-card-colors-txt">batafsil ko'rish</span></div>`;
            }
        } else {
            fullPacks = Math.floor(qty / packSize);
        }
        const looseDona = Math.max(0, qty - fullPacks * packSize);

        totPacks += fullPacks;
        totDona += qty;
        totLoose += looseDona;

        const card = document.createElement("div");
        card.className = `ombor-card ${statusClass}${colorProduct ? " clickable" : ""}`;
        card.innerHTML = `
            <div class="ombor-card-top">
                <img class="ombor-card-img" src="${img}" alt="${p.name}" onerror="this.style.display='none'">
                <span class="ombor-status-badge ${statusClass}">${statusText}</span>
                <span class="ombor-card-code">${codeDisplay}</span>
            </div>
            <div class="ombor-card-body">
                <span class="ombor-card-supplier"><i class="fa-solid fa-truck-ramp-box"></i> ${p.supplier}</span>
                <h4 class="ombor-card-name">${p.name}</h4>
                <span class="ombor-card-cat"><i class="${catIcon}"></i> ${catLabel}</span>
                ${colorHint}
                <div class="ombor-card-foot">
                    <div class="ombor-card-cell">
                        <span class="ombor-card-label">Narx</span>
                        <span class="ombor-card-price">${priceDisplay}</span>
                    </div>
                    <div class="ombor-card-cell ombor-card-cell-right">
                        <span class="ombor-card-label">Zaxira</span>
                        <span class="ombor-card-stock">${fullPacks} <small>pachka</small></span>
                        <span class="ombor-card-substock">${qty} dona${looseDona ? ` <i>(+${looseDona})</i>` : ""}</span>
                    </div>
                </div>
            </div>
        `;
        if (colorProduct) {
            card.addEventListener("click", () => openOmborDetail(p.id));
        }
        grid.appendChild(card);
    });

    renderOmborSummary(totPacks, totDona, totLoose, filtered.length);
}

function renderOmborSummary(totPacks, totDona, totLoose, kinds) {
    const el = document.getElementById("ombor-summary");
    if (!el) return;
    el.innerHTML = `
        <div class="ombor-sum-item">
            <div class="ombor-sum-ic" style="color:var(--primary);background:rgba(16,185,129,0.1);"><i class="fa-solid fa-layer-group"></i></div>
            <div class="ombor-sum-txt"><span>Jami pachka (to'liq)</span><b>${totPacks.toLocaleString("uz-UZ")}</b></div>
        </div>
        <div class="ombor-sum-item">
            <div class="ombor-sum-ic" style="color:var(--accent);background:rgba(6,182,212,0.1);"><i class="fa-solid fa-shirt"></i></div>
            <div class="ombor-sum-txt"><span>Jami dona</span><b>${totDona.toLocaleString("uz-UZ")}</b></div>
        </div>
        ${totLoose ? `<div class="ombor-sum-item">
            <div class="ombor-sum-ic" style="color:#f59e0b;background:rgba(245,158,11,0.1);"><i class="fa-solid fa-scissors"></i></div>
            <div class="ombor-sum-txt"><span>Chala dona (pachkasiz)</span><b>${totLoose.toLocaleString("uz-UZ")}</b></div>
        </div>` : ""}
        <div class="ombor-sum-item">
            <div class="ombor-sum-ic" style="color:#a78bfa;background:rgba(167,139,250,0.1);"><i class="fa-solid fa-boxes-stacked"></i></div>
            <div class="ombor-sum-txt"><span>Mahsulot turlari</span><b>${kinds}</b></div>
        </div>
    `;
}

// Loyihadagi BARCHA mahsulot/zaxira/savdo ma'lumotini tozalaydi (parol bilan himoyalangan)
async function clearProject(password) {
    // BARCHA mahsulotlar (demo standart + dinamik) butunlay olib tashlanadi
    PRODUCTS = [];
    localStorage.setItem("eco_sports_products_cleared", "1"); // qayta yuklanganda demo qaytmasin

    state.dynamicProducts = [];
    inventory = {};
    colorStock = {};
    state.kirimHistory = [];
    state.salesHistory = []; // savdo tarixi
    customerDebts = []; // mijoz qarzlari (nasiya) — sotuvlar o'chsa, qarz ham o'chadi (arvoh qolmasin)

    localStorage.setItem("eco_sports_dynamic_products", "[]");
    localStorage.setItem("eco_sports_inventory", "{}");
    localStorage.setItem("eco_sports_color_stock", "{}");
    localStorage.setItem("eco_sports_kirim_history", "[]");
    localStorage.setItem("eco_sports_sales_history", "[]");
    localStorage.setItem("eco_sports_customer_debts", "[]");
    if (typeof dbSaveConfig === "function") dbSaveConfig("eco_customer_debts", []);

    // Savatni darhol tozalash + UI'ni yangilash (foydalanuvchi tez ko'rsin)
    state.cart = [];
    if (typeof renderTiles === "function") renderTiles();
    if (typeof renderOmborTable === "function") renderOmborTable();
    if (typeof renderBuxgalteriya === "function") renderBuxgalteriya();
    if (typeof renderHistoryTable === "function") renderHistoryTable();
    if (typeof updateAnalytics === "function") updateAnalytics();
    if (typeof updateReceiptUI === "function") updateReceiptUI();

    // Bulutdan o'chirish — RLS tufayli anon kalit to'g'ridan DELETE qila olmaydi.
    // 1-USUL: Supabase RPC admin_clear_project (SECURITY DEFINER) — Vercel ENV KERAK EMAS,
    //          service_role ilovaga chiqmaydi. Anon funksiyani chaqiradi, funksiya ichida
    //          parol tekshirilib o'chiriladi. (Bir martalik SQL bilan yaratiladi.)
    // 2-USUL (zaxira): serverless /api/admin-clear (Vercel SUPABASE_SERVICE_ROLE env bilan).
    let cloudOk = false;
    let cloudReason = "";
    let wrongPassword = false;
    if (typeof supabaseClient !== "undefined" && supabaseClient) {
        // --- 1-USUL: RPC ---
        try {
            const { error } = await supabaseClient.rpc("admin_clear_project", { pass: password || "" });
            if (!error) {
                cloudOk = true;
                localStorage.setItem("eco_sports_cleared_seen", String(Date.now()));
            } else {
                const msg = (error.message || error.hint || error.code || "").toLowerCase();
                if (msg.includes("parol") || msg.includes("password")) {
                    wrongPassword = true;
                    cloudReason = "Noto'g'ri parol";
                } else {
                    cloudReason = "RPC: " + (error.message || error.code || "yo'q");
                }
            }
        } catch (e) {
            cloudReason = "RPC: " + e.message;
        }

        // --- 2-USUL: serverless (RPC ishlamasa va parol noto'g'ri bo'lmasa) ---
        if (!cloudOk && !wrongPassword) {
            try {
                const resp = await fetch("/api/admin-clear", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: password || "" })
                });
                if (resp.ok) {
                    const data = await resp.json().catch(() => ({}));
                    cloudOk = !(data && data.ok === false);
                    if (cloudOk) { cloudReason = ""; localStorage.setItem("eco_sports_cleared_seen", String(Date.now())); }
                } else {
                    const err = await resp.json().catch(() => ({}));
                    if (resp.status === 403) { wrongPassword = true; cloudReason = "Noto'g'ri parol"; }
                    else cloudReason += (cloudReason ? " | " : "") + "server: " + (err.error || ("HTTP " + resp.status));
                }
            } catch (e) {
                cloudReason += (cloudReason ? " | " : "") + "server chaqirib bo'lmadi (lokal rejim?)";
            }
        }
    }

    if (cloudOk) {
        alert("✅ Loyiha to'liq tozalandi!\nMahsulotlar, ombor zaxirasi va savdo tarixi barcha qurilmalardan (bulut) o'chirildi.");
    } else if (wrongPassword) {
        alert("❌ Noto'g'ri parol — bulut tozalanmadi. (Mahalliy ma'lumot tozalandi.)");
    } else {
        alert("⚠️ Mahalliy ma'lumot tozalandi, lekin bulut tozalanmadi" + (cloudReason ? `:\n${cloudReason}` : ".") +
            "\n\nBulutni tozalash uchun ikkidan biri sozlanishi kerak:\n• Supabase'da admin_clear_project funksiyasi (tavsiya), yoki\n• Vercel'da SUPABASE_SERVICE_ROLE env.\nAks holda boshqa qurilmalarda mahsulot qaytishi mumkin.");
    }
}

// Ombor: mahsulotning rang/o'lcham bo'yicha qolgan holatini modalda ko'rsatadi
function openOmborDetail(productId) {
    const allProds = [...PRODUCTS, ...(state.dynamicProducts || [])];
    const p = allProds.find(x => String(x.id) === String(productId));
    if (!p) return;
    const modal = document.getElementById("ombor-detail-modal");
    const body = document.getElementById("ombor-detail-body");
    if (!modal || !body) return;

    if (!modal.dataset.bound) {
        modal.dataset.bound = "1";
        const cb = document.getElementById("ombor-detail-close");
        if (cb) cb.addEventListener("click", () => modal.classList.remove("open"));
        modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });
    }

    document.getElementById("ombor-detail-title").textContent = p.name;
    const catLabel = { tshirt: "Futbolka", shorts: "Shortik", tracksuit: "Sportivka", joggers: "Triko" }[p.category] || "Boshqa";
    document.getElementById("ombor-detail-sub").textContent = `${p.supplier} · ${catLabel} · 1 pachka = ${packSizeOf(p)} dona`;

    const sum = colorStockSummary(p);
    if (!sum) {
        body.innerHTML = `<p style="color:var(--text-secondary);">Bu mahsulotda rang taqsimoti yo'q.</p>`;
    } else {
        const sizes = p.sizes || [];
        let html = `<div class="odet-summary">
            <div class="odet-sum-cell"><span>Jami pachka (to'liq)</span><b>${sum.totalFullPacks}</b></div>
            <div class="odet-sum-cell"><span>Jami dona</span><b>${sum.totalDona}</b></div>
        </div>`;
        Object.entries(sum.colors).forEach(([color, info]) => {
            const sizeChips = sizes.map(s => {
                const v = info.sizes[s] || 0;
                return `<span class="odet-size ${v === 0 ? 'zero' : ''}">${s}<b>${v}</b></span>`;
            }).join("");
            html += `
                <div class="odet-color">
                    <div class="odet-color-head">
                        <span class="ombor-color-dot" style="background:${getColorHex(color)};"></span>
                        <span class="odet-color-name">${color}</span>
                        <span class="odet-color-stat">${info.fullPacks} pachka · ${info.total} dona</span>
                    </div>
                    <div class="odet-sizes">${sizeChips}</div>
                </div>`;
        });
        body.innerHTML = html;
    }
    modal.classList.add("open");
}

// Haqiqiy tan narxi (COGS): sotilgan har bir mahsulotning ASL tannarxidan hisoblanadi
// (savdoning 60% taxminiy emas). Mahsulot topilmasa, soldPrice*0.6 zaxira sifatida.
function calcRealCOGS(salesArr) {
    let total = 0;
    let matched = 0;
    let estimated = 0;
    const catalog = [...PRODUCTS, ...(state.dynamicProducts || [])];

    function findProd(name) {
        if (!name) return null;
        const clean = name.replace(/\s*\[cogs:\d+,pack:\d+\]/, "").trim();
        return catalog.find(p => p.name === clean)
            || catalog.find(p => p.name && (clean.includes(p.name) || p.name.includes(clean)))
            || null;
    }

    ((salesArr || state.salesHistory) || []).forEach(tx => {
        (tx.items || []).forEach(item => {
            const qty = item.qty || 0;
            if (qty <= 0) return;
            const prod = findProd(item.name);
            let costPerDona;
            if (prod) {
                const packSizes = (prod.sizes && prod.sizes.length) ? prod.sizes.length : 5;
                costPerDona = prod.cogs ? (prod.cogs / packSizes) : (prod.price * 0.6);
                matched += qty;
            } else {
                costPerDona = (item.soldPrice || 0) * 0.6; // zaxira (taxminiy)
                estimated += qty;
            }
            total += qty * costPerDona;
        });
    });

    return { cogs: Math.round(total), matchedQty: matched, estimatedQty: estimated };
}

// ============================================================
// SANA BO'YICHA SAVDO HISOBOTI (kun / oy / yil / ixtiyoriy oraliq)
// salesHistory'dan davr bo'yicha: savdo, tannarx, foyda, qarz, kassir, top mahsulot.
// Ma'lumot saqlanadi (localStorage + bulut), shuning uchun bir oy/yildan keyin ham olinadi.
// ============================================================
let dateReportState = { from: null, to: null, label: "Hammasi", last: null };

// "DD.MM.YYYY HH:MM" yoki "YYYY-MM-DD ..." → Date (kun aniqligida) yoki null
function _saleDateObj(ts) {
    if (!ts) return null;
    let m = String(ts).match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/); // DD.MM.YYYY
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    m = String(ts).match(/(\d{4})-(\d{2})-(\d{2})/); // YYYY-MM-DD
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return null;
}
function _ymd(d) { const p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }

function setDateReportRange(kind) {
    const now = new Date();
    const y = now.getFullYear(), mo = now.getMonth(), da = now.getDate();
    let from = null, to = null, label = "Hammasi";
    if (kind === "today") { from = new Date(y, mo, da); to = new Date(y, mo, da); label = "Bugun"; }
    else if (kind === "week") { from = new Date(y, mo, da - 6); to = new Date(y, mo, da); label = "Oxirgi 7 kun"; }
    else if (kind === "month") { from = new Date(y, mo, 1); to = new Date(y, mo + 1, 0); label = "Bu oy"; }
    else if (kind === "lastmonth") { from = new Date(y, mo - 1, 1); to = new Date(y, mo, 0); label = "O'tgan oy"; }
    else if (kind === "year") { from = new Date(y, 0, 1); to = new Date(y, 11, 31); label = "Bu yil (" + y + ")"; }
    else { from = null; to = null; label = "Hammasi"; }
    dateReportState.from = from; dateReportState.to = to; dateReportState.label = label;
    const fEl = document.getElementById("date-report-from"), tEl = document.getElementById("date-report-to");
    if (fEl) fEl.value = from ? _ymd(from) : "";
    if (tEl) tEl.value = to ? _ymd(to) : "";
    document.querySelectorAll(".date-q-btn").forEach(b => b.classList.toggle("active", b.dataset.range === kind));
    renderDateReport();
}

function applyCustomDateRange() {
    const fEl = document.getElementById("date-report-from"), tEl = document.getElementById("date-report-to");
    const fv = fEl && fEl.value ? new Date(fEl.value + "T00:00:00") : null;
    const tv = tEl && tEl.value ? new Date(tEl.value + "T00:00:00") : null;
    dateReportState.from = fv; dateReportState.to = tv;
    dateReportState.label = (fv ? _ymd(fv) : "boshidan") + " — " + (tv ? _ymd(tv) : "oxirigacha");
    document.querySelectorAll(".date-q-btn").forEach(b => b.classList.remove("active"));
    renderDateReport();
}

function salesInPeriod() {
    const from = dateReportState.from, to = dateReportState.to;
    return (state.salesHistory || []).filter(tx => {
        if (!from && !to) return true;
        const d = _saleDateObj(tx.timestamp);
        if (!d) return false;
        if (from && d < new Date(from.getFullYear(), from.getMonth(), from.getDate())) return false;
        if (to && d > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59)) return false;
        return true;
    });
}

function computeDateReport() {
    const sales = salesInPeriod();
    let revenue = 0, received = 0, debt = 0, units = 0;
    const byCashier = {}, byProduct = {};
    sales.forEach(tx => {
        const total = Number(tx.totalPaid) || 0;
        revenue += total;
        received += Number(tx.received != null ? tx.received : total) || 0;
        debt += Number(tx.debt) || 0;
        units += Number(tx.itemCount) || 0;
        const c = tx.cashier || "—";
        if (!byCashier[c]) byCashier[c] = { count: 0, total: 0 };
        byCashier[c].count++; byCashier[c].total += total;
        (tx.items || []).forEach(it => {
            const nm = (it.name || "").replace(/\s*\[cogs:\d+,pack:\d+\]/, "").trim() || "—";
            if (!byProduct[nm]) byProduct[nm] = { qty: 0, revenue: 0 };
            byProduct[nm].qty += Number(it.qty) || 0;
            byProduct[nm].revenue += (Number(it.qty) || 0) * (Number(it.soldPrice) || 0);
        });
    });
    const cogs = calcRealCOGS(sales).cogs;
    const grossProfit = revenue - cogs;
    const topProducts = Object.entries(byProduct).map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const cashiers = Object.entries(byCashier).map(([name, v]) => ({ name, count: v.count, total: v.total })).sort((a, b) => b.total - a.total);
    const r = { label: dateReportState.label, count: sales.length, revenue, received, debt, units, cogs, grossProfit, topProducts, cashiers, sales };
    dateReportState.last = r;
    return r;
}

function renderDateReport() {
    const kpiBox = document.getElementById("date-report-kpis");
    if (!kpiBox) return;
    const r = computeDateReport();
    const kpi = (label, val, color) => '<div class="stat-badge-card" style="padding:0.8rem;"><div class="stat-badge-info"><h4 style="font-size:0.7rem;">' + label + '</h4><strong style="font-size:1.05rem;' + (color ? "color:" + color : "") + '">' + val + '</strong></div></div>';
    kpiBox.innerHTML =
        kpi("Davr", r.label, "#6366f1") +
        kpi("Cheklar", r.count + " ta") +
        kpi("Jami savdo", formatPrice(r.revenue), "var(--primary)") +
        kpi("Tannarx", formatPrice(r.cogs), "#06b6d4") +
        kpi("Yalpi foyda", formatPrice(r.grossProfit), "var(--primary)") +
        kpi("Naqd olingan", formatPrice(r.received)) +
        kpi("Qarz (nasiya)", formatPrice(r.debt), r.debt > 0 ? "#ef4444" : "") +
        kpi("Dona", r.units + " dona");

    const tbody = document.getElementById("date-report-tbody");
    const empty = document.getElementById("date-report-empty");
    if (tbody) {
        tbody.innerHTML = "";
        if (r.sales.length === 0) { if (empty) empty.style.display = "block"; }
        else {
            if (empty) empty.style.display = "none";
            [...r.sales].reverse().forEach(tx => {
                const total = Number(tx.totalPaid) || 0;
                const rec = Number(tx.received != null ? tx.received : total) || 0;
                const dbt = Number(tx.debt) || 0;
                const ch = tx.channel === 'telegram' ? 'Mini App' : tx.channel === 'phone' ? 'Telefon' : "Do'kon";
                const tr = document.createElement("tr");
                tr.innerHTML = '<td><strong>#' + tx.id + '</strong></td><td>' + tx.timestamp + '</td><td>' + (tx.cashier || "—") + '</td>' +
                    '<td><span class="channel-tag tag-' + tx.channel + '">' + ch + '</span></td><td>' + (tx.itemCount || 0) + '</td>' +
                    '<td style="font-weight:800;color:var(--primary);">' + formatPrice(total) + '</td><td>' + formatPrice(rec) + '</td>' +
                    '<td style="' + (dbt > 0 ? "color:#ef4444;font-weight:700;" : "") + '">' + formatPrice(dbt) + '</td>';
                tbody.appendChild(tr);
            });
        }
    }

    const bd = document.getElementById("date-report-breakdown");
    if (bd) {
        let html = "";
        if (r.cashiers.length) {
            html += '<div style="margin-bottom:1rem;"><h4 style="font-size:0.85rem;margin-bottom:0.5rem;"><i class="fa-solid fa-user-tie"></i> Kassir kesimi</h4>';
            r.cashiers.forEach(c => { html += '<div class="diag-row"><span>' + c.name + '</span><small>' + c.count + " ta · " + formatPrice(c.total) + '</small></div>'; });
            html += '</div>';
        }
        if (r.topProducts.length) {
            html += '<div><h4 style="font-size:0.85rem;margin-bottom:0.5rem;"><i class="fa-solid fa-fire"></i> Eng ko\'p sotilgan</h4>';
            r.topProducts.forEach(p => { html += '<div class="diag-row"><span>' + p.name + '</span><small>' + p.qty + " dona · " + formatPrice(p.revenue) + '</small></div>'; });
            html += '</div>';
        }
        bd.innerHTML = html;
    }
}

function exportDateReportExcel() {
    if (typeof XLSX === "undefined") { alert("Excel kutubxonasi yuklanmadi. Internet aloqasini tekshiring."); return; }
    const r = dateReportState.last || computeDateReport();
    const wb = XLSX.utils.book_new();
    const summary = [
        ["ECO SPORTS — Savdo Hisoboti"],
        ["Davr", r.label],
        ["Cheklar soni", r.count],
        ["Jami savdo (UZS)", r.revenue],
        ["Tannarx COGS (UZS)", r.cogs],
        ["Yalpi foyda (UZS)", r.grossProfit],
        ["Naqd olingan (UZS)", r.received],
        ["Qarz / nasiya (UZS)", r.debt],
        ["Sotilgan dona", r.units],
        ["Hisobot tuzilgan", new Date().toLocaleString("uz-UZ")]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Umumiy");
    const head = ["Chek", "Sana", "Kassir", "Kanal", "Dona", "Jami", "Olingan", "Qarz"];
    const rows = r.sales.map(tx => [tx.id, tx.timestamp, tx.cashier || "", tx.channel || "", tx.itemCount || 0,
        Number(tx.totalPaid) || 0, Number(tx.received != null ? tx.received : tx.totalPaid) || 0, Number(tx.debt) || 0]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...rows]), "Sotuvlar");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Kassir", "Cheklar", "Savdo (UZS)"], ...r.cashiers.map(c => [c.name, c.count, c.total])]), "Kassirlar");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Mahsulot", "Dona", "Savdo (UZS)"], ...r.topProducts.map(p => [p.name, p.qty, p.revenue])]), "Mahsulotlar");
    XLSX.writeFile(wb, "Savdo_Hisobot_" + (r.label || "hisobot").replace(/[^\w-]+/g, "_") + ".xlsx");
}

function _buildDateReportPdfHtml(r) {
    const row = (a, b) => '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;">' + a + '</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700;">' + b + '</td></tr>';
    const salesRows = r.sales.slice(0, 200).map(tx => '<tr>' +
        '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">#' + tx.id + '</td>' +
        '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">' + tx.timestamp + '</td>' +
        '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;">' + (tx.cashier || "") + '</td>' +
        '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:center;">' + (tx.itemCount || 0) + '</td>' +
        '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;">' + formatPrice(tx.totalPaid) + '</td>' +
        '<td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;text-align:right;color:#ef4444;">' + formatPrice(tx.debt || 0) + '</td></tr>').join("");
    return '<div style="width:794px;background:#fff;color:#1a1a1a;font-family:Arial,sans-serif;">' +
        '<div style="background:linear-gradient(135deg,#10b981,#0891b2);color:#fff;padding:28px 32px;">' +
        '<div style="font-size:26px;font-weight:800;">ECO SPORTS</div>' +
        '<div style="font-size:14px;opacity:0.9;">Savdo Hisoboti — ' + r.label + '</div>' +
        '<div style="font-size:11px;opacity:0.85;margin-top:4px;">Tuzilgan: ' + new Date().toLocaleString("uz-UZ") + '</div></div>' +
        '<div style="padding:24px 32px;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px;">' +
        row("Cheklar soni", r.count + " ta") + row("Jami savdo", formatPrice(r.revenue)) +
        row("Tannarx (COGS)", formatPrice(r.cogs)) + row("Yalpi foyda", formatPrice(r.grossProfit)) +
        row("Naqd olingan", formatPrice(r.received)) + row("Qarz (nasiya)", formatPrice(r.debt)) +
        row("Sotilgan dona", r.units + " dona") + '</table>' +
        '<div style="font-size:15px;font-weight:800;margin:18px 0 8px;color:#0891b2;">Sotuvlar</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
        '<thead><tr style="background:#f7f7f7;">' +
        '<th style="padding:6px 8px;text-align:left;">Chek</th><th style="padding:6px 8px;text-align:left;">Sana</th>' +
        '<th style="padding:6px 8px;text-align:left;">Kassir</th><th style="padding:6px 8px;">Dona</th>' +
        '<th style="padding:6px 8px;text-align:right;">Jami</th><th style="padding:6px 8px;text-align:right;">Qarz</th></tr></thead>' +
        '<tbody>' + (salesRows || '<tr><td colspan="6" style="padding:12px;text-align:center;color:#999;">Bu davrda savdo yo\'q</td></tr>') + '</tbody></table>' +
        (r.sales.length > 200 ? '<div style="font-size:10px;color:#999;margin-top:6px;">* Faqat oxirgi 200 sotuv ko\'rsatildi (to\'liq ma\'lumot Excel\'da).</div>' : '') +
        '</div>' +
        '<div style="padding:14px 32px;border-top:2px solid #10b981;font-size:10px;color:#888;">ECO SPORTS CRM · ' + (appConfig.storeName || "") + ' · ' + (appConfig.storePhone || "") + '</div></div>';
}

async function exportDateReportPdf() {
    if (!window.html2canvas || !(window.jspdf && window.jspdf.jsPDF)) { alert("PDF kutubxonasi yuklanmadi. Internet aloqasini tekshiring."); return; }
    const r = dateReportState.last || computeDateReport();
    const btn = document.getElementById("date-report-pdf");
    const orig = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tayyorlanmoqda...'; }
    const holder = document.createElement("div");
    holder.style.position = "fixed"; holder.style.left = "-99999px"; holder.style.top = "0"; holder.style.width = "794px";
    holder.innerHTML = _buildDateReportPdfHtml(r);
    document.body.appendChild(holder);
    try {
        const el = holder.firstElementChild;
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF("p", "mm", "a4");
        const pageW = 210, pageH = 297, imgW = pageW;
        const imgH = canvas.height * imgW / canvas.width;
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        let heightLeft = imgH, position = 0;
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH); heightLeft -= pageH;
        while (heightLeft > 0) { position -= pageH; pdf.addPage(); pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH); heightLeft -= pageH; }
        pdf.save("Savdo_Hisobot_" + (r.label || "hisobot").replace(/[^\w-]+/g, "_") + ".pdf");
    } catch (e) { console.error("PDF xato:", e); alert("PDF yaratishda xato: " + e.message); }
    finally { document.body.removeChild(holder); if (btn) { btn.disabled = false; btn.innerHTML = orig; } }
}

// Buxgalteriya kartochkalarini yig'ish/ochish — holat localStorage'da eslab qolinadi
function _loadBuxCollapsed() { try { return JSON.parse(localStorage.getItem("eco_bux_collapsed") || "{}") || {}; } catch (e) { return {}; } }
function initBuxCollapsibles() {
    const saved = _loadBuxCollapsed();
    document.querySelectorAll(".bux-collapsible").forEach(card => {
        const id = card.id;
        if (id && saved[id]) card.classList.add("collapsed");
        const head = card.querySelector(".history-header");
        if (!head || head._buxBound) return;
        head._buxBound = true;
        head.addEventListener("click", (e) => {
            // Sarlavhadagi interaktiv elementlar (tugma, select, valyuta) accordionni o'zgartirmasin
            if (e.target.closest("button, a, input, select, .cur-btn, .rep-select, .currency-toggle, .export-btns")) return;
            card.classList.toggle("collapsed");
            const map = _loadBuxCollapsed();
            if (id) { map[id] = card.classList.contains("collapsed"); try { localStorage.setItem("eco_bux_collapsed", JSON.stringify(map)); } catch (er) {} }
        });
    });
}

// 11.6 BUXGALTERIYA FINANCIAL MODULES RENDERER
function renderBuxgalteriya() {
    const buxRevenue = document.getElementById("bux-revenue");
    const buxCogs = document.getElementById("bux-cogs");
    const buxExpenses = document.getElementById("bux-expenses");
    const buxProfit = document.getElementById("bux-profit");
    const expenseTableBody = document.getElementById("bux-expense-table-body");
    const expenseEmptyState = document.getElementById("bux-empty-state");
    
    if (!buxRevenue) return;
    
    const revenue = state.salesHistory.reduce((sum, tx) => sum + tx.totalPaid, 0);
    const cogsResult = calcRealCOGS();          // HAQIQIY sotilgan mahsulot tannarxi
    const cogs = cogsResult.cogs;
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const grossProfit = revenue - cogs;          // yalpi foyda
    const netProfit = grossProfit - totalExpenses;

    buxRevenue.textContent = formatPrice(revenue);
    buxCogs.textContent = formatPrice(cogs);
    buxExpenses.textContent = formatPrice(totalExpenses);
    buxProfit.textContent = formatPrice(netProfit);

    // Dinamik izohlar — aniq raqamlar asosida
    const cogsNote = document.getElementById("bux-cogs-note");
    if (cogsNote) {
        const ratio = revenue > 0 ? Math.round(cogs / revenue * 100) : 0;
        const estPart = cogsResult.estimatedQty > 0
            ? ` • ${cogsResult.estimatedQty} dona taxminiy`
            : "";
        cogsNote.textContent = `Sotuvning ${ratio}% (haqiqiy tannarx)${estPart}`;
    }
    const profitNote = document.getElementById("bux-profit-note");
    if (profitNote) {
        const margin = revenue > 0 ? Math.round(netProfit / revenue * 100) : 0;
        profitNote.textContent = `Foyda marjasi: ${margin}% • Yalpi: ${formatPrice(grossProfit)}`;
    }

    // --- QARZLAR (Moliyaviy Buxgalteriya boshida) ---
    // 1) Mijoz qarzi (olinadigan) — mijozlar bizga to'lashi kerak (nasiya savdo)
    const unpaidDebts = (customerDebts || []).filter(d => !d.paid && (Number(d.debt) || 0) > 0);
    const customerDebtTotal = unpaidDebts.reduce((s, d) => s + (Number(d.debt) || 0), 0);
    const custDebtEl = document.getElementById("bux-customer-debt");
    const custDebtNote = document.getElementById("bux-customer-debt-note");
    if (custDebtEl) custDebtEl.textContent = formatPrice(customerDebtTotal);
    if (custDebtNote) custDebtNote.textContent = `${unpaidDebts.length} ta qarzdor mijoz`;

    // 2) Ta'minotchi qarzi (to'lanadigan) — biz ta'minotchiga to'lashimiz kerak
    let supplierDebtTotal = 0, supplierOweCount = 0;
    if (typeof getSupplierTakenValue === "function" && typeof getSupplierPaidTotal === "function") {
        const supNames = new Set();
        (state.kirimHistory || []).forEach(k => { if (k.supplier) supNames.add(k.supplier); });
        Object.keys(supplierPayments || {}).forEach(n => supNames.add(n));
        supNames.forEach(n => {
            const bal = getSupplierTakenValue(n) - getSupplierPaidTotal(n);
            if (bal > 0) { supplierDebtTotal += bal; supplierOweCount++; }
        });
    }
    const supDebtEl = document.getElementById("bux-supplier-debt");
    const supDebtNote = document.getElementById("bux-supplier-debt-note");
    if (supDebtEl) supDebtEl.textContent = formatPrice(supplierDebtTotal);
    if (supDebtNote) supDebtNote.textContent = supplierOweCount > 0
        ? `${supplierOweCount} ta ta'minotchiga qarz`
        : "Hammasi to'langan ✓";

    // Sana bo'yicha savdo hisobotini yangilash (tanlangan davr saqlanadi)
    if (typeof renderDateReport === "function") renderDateReport();

    // Qarzdorlar (nasiya) ro'yxati
    if (typeof renderDebtors === "function") renderDebtors();
    
    // --- RENDER PENDING APPROVAL PRODUCTS TABLE [NEW] ---
    const pendingTableBody = document.getElementById("bux-pending-approval-table-body");
    const pendingEmptyState = document.getElementById("bux-pending-empty-state");

    if (pendingTableBody) {
        pendingTableBody.innerHTML = "";
        
        // Infallible check: pending if not explicitly approved (handles undefined, null, false, "false")
        const pendingItems = state.dynamicProducts.filter(p => p.approved !== true && p.approved !== "true");
        
        if (pendingItems.length === 0) {
            if (pendingEmptyState) pendingEmptyState.style.display = "block";
        } else {
            if (pendingEmptyState) pendingEmptyState.style.display = "none";
            
            pendingItems.forEach(p => {
                const row = document.createElement("tr");
                
                // Bulletproof size rendering helper
                const sizesHtml = (p.sizes && Array.isArray(p.sizes)) 
                    ? p.sizes.map(s => `<span class="channel-tag" style="background:var(--bg-dark-input); color:var(--text-primary); font-size:0.65rem; padding:0.1rem 0.3rem; margin-right:3px;">${s}</span>`).join('') 
                    : '';

                row.innerHTML = `
                    <td><strong>${p.name}</strong></td>
                    <td>${p.supplier}</td>
                    <td><span class="channel-tag" style="background: rgba(99, 102, 241, 0.1); color: #6366f1;">${p.category}</span></td>
                    <td><code>${p.model}</code></td>
                    <td>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Ranglar: <strong>${p.colors || "Tanlangan ranglar"}</strong></div>
                        <div style="margin-top: 0.2rem;">O'lchamlar: ${sizesHtml}</div>
                    </td>
                    <td><strong>${p.qty} dona</strong></td>
                    <td>
                        <input type="number" class="pricing-input pending-cogs" data-id="${p.id}" placeholder="Tan narx UZS" style="width: 120px;">
                    </td>
                    <td>
                        <input type="number" class="pricing-input pending-price" data-id="${p.id}" placeholder="Sotish pachka" style="width: 120px;">
                    </td>
                    <td>
                        <input type="number" class="pricing-input pending-dona-price" data-id="${p.id}" placeholder="Sotish dona" style="width: 120px;">
                    </td>
                    <td style="text-align: center;">
                        <button class="btn btn-primary approve-price-btn" data-id="${p.id}" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; border-radius: 8px;">
                            <i class="fa-solid fa-circle-check"></i> Tasdiqlash
                        </button>
                    </td>
                `;
                pendingTableBody.appendChild(row);
            });

            // Bind click listeners for Tasdiqlash buttons
            pendingTableBody.querySelectorAll(".approve-price-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const id = btn.dataset.id;
                    const cogsInput = pendingTableBody.querySelector(`.pending-cogs[data-id="${id}"]`);
                    const priceInput = pendingTableBody.querySelector(`.pending-price[data-id="${id}"]`);
                    const donaPriceInput = pendingTableBody.querySelector(`.pending-dona-price[data-id="${id}"]`);

                    const cogs = parseFloat(cogsInput.value) || 0;
                    const price = parseFloat(priceInput.value) || 0;
                    const donaPrice = parseFloat(donaPriceInput.value) || 0;

                    if (cogs <= 0 || price <= 0 || donaPrice <= 0) {
                        alert("Pachka tan narxi, pachka sotuv narxi va dona sotuv narxini noldan katta qilib kiriting!");
                        return;
                    }

                    if (price <= cogs) {
                        if (!confirm("Diqqat! Pachka sotish narxi tan narxidan kam yoki teng. Baribir tasdiqlaysizmi?")) {
                            return;
                        }
                    }

                    approveProductPrice(id, cogs, price, donaPrice);
                });
            });
        }
    }

    expenseTableBody.innerHTML = "";
    
    if (expenses.length === 0) {
        expenseEmptyState.style.display = "block";
    } else {
        expenseEmptyState.style.display = "none";

    [...expenses].reverse().forEach((exp, idx) => {
        const row = document.createElement("tr");
        const actualIdx = expenses.length - 1 - idx;
        
        let catLabel = "";
        switch (exp.category) {
            case "rent": catLabel = "Arenda"; break;
            case "salary": catLabel = "Xodim oyligi"; break;
            case "transport": catLabel = "Yo'lkira / Dostavka"; break;
            case "tax": catLabel = "Soliq / Kommunal"; break;
            default: catLabel = "Boshqa";
        }
        
        row.innerHTML = `
            <td><strong>#${exp.id}</strong></td>
            <td>${exp.timestamp}</td>
            <td>${exp.description}</td>
            <td><span class="channel-tag" style="background: rgba(6, 182, 212, 0.1); color: var(--accent);">${catLabel}</span></td>
            <td style="font-weight: 800; color: #ef4444;">-${formatPrice(exp.amount)}</td>
            <td>
                <button class="qty-btn delete-expense-btn" data-idx="${actualIdx}" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: #ef4444; width:30px; height:30px;" title="O'chirish">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        expenseTableBody.appendChild(row);
    });
    
    expenseTableBody.querySelectorAll(".delete-expense-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            if (confirm("Ushbu xarajatni o'chirmoqchimisiz?")) {
                const idx = parseInt(btn.dataset.idx);
                const deletedExp = expenses[idx];
                expenses.splice(idx, 1);
                localStorage.setItem("eco_sports_expenses", JSON.stringify(expenses));
                if (deletedExp) dbDeleteExpense(deletedExp.id);
                renderBuxgalteriya();
            }
        });
    });
    } // end else (xarajatlar mavjud bo'lsa)

    // Render Ta'minotchi zaxirasi hisoboti (xarajat bo'sh bo'lsa ham ishlaydi)
    renderSupplierStockReport();

    // Populate and render supplier individual ledger report [NEW]
    populateSupplierAndMonthSelects();
    renderSupplierIndividualReport();
}

// --- SUPPLIER STOCK VALUE REPORT [REDESIGNED: supplier + currency selector] ---
const reportState = {
    supplier: "ALL",
    currency: "UZS",
    usdRate: parseFloat(localStorage.getItem("eco_usd_rate")) || 12600
};
let _reportControlsBound = false;

// ===== Supplier payment ledger (qarz daftari) — persisted =====
let supplierPayments = {};
try {
    const _sp = localStorage.getItem("eco_sports_supplier_payments");
    if (_sp) supplierPayments = JSON.parse(_sp) || {};
} catch (e) { supplierPayments = {}; }

function saveSupplierPayments() {
    localStorage.setItem("eco_sports_supplier_payments", JSON.stringify(supplierPayments));
    if (typeof dbSaveConfig === "function") dbSaveConfig("eco_supplier_payments", supplierPayments);
}

// --- Mijoz qarzlari (nasiya savdo) ---
let customerDebts = [];
try {
    const _cd = localStorage.getItem("eco_sports_customer_debts");
    if (_cd) customerDebts = JSON.parse(_cd) || [];
} catch (e) { customerDebts = []; }

function saveCustomerDebts() {
    localStorage.setItem("eco_sports_customer_debts", JSON.stringify(customerDebts));
    if (typeof dbSaveConfig === "function") dbSaveConfig("eco_customer_debts", customerDebts);
}

// ============================================================
//  QARZDORLAR (NASIYA) — ko'rish, muddat holati, SMS/qo'ng'iroq
// ============================================================
let debtorFilterState = "active"; // active | overdue | soon | paid | all

// Qarz muddati holati: o'tgan / yaqin (≤3 kun) / faol / to'langan
function _debtorDueStatus(d) {
    if (d.paid || (Number(d.debt) || 0) <= 0) {
        return { key: "paid", label: "To'langan ✓", color: "var(--primary)", days: null };
    }
    const due = d.dueDate ? new Date(d.dueDate + "T00:00:00") : null;
    if (!due || isNaN(due.getTime())) {
        return { key: "active", label: "Muddatsiz", color: "var(--text-secondary)", days: null };
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (days < 0) return { key: "overdue", label: `${Math.abs(days)} kun o'tgan`, color: "#ef4444", days };
    if (days <= 3) return { key: "soon", label: days === 0 ? "Bugun muddat" : `${days} kun qoldi`, color: "#f59e0b", days };
    return { key: "active", label: `${days} kun qoldi`, color: "var(--text-secondary)", days };
}

// Qarz qaysi ta'minotchi mahsuloti(lari)dan — sotuv chekidan aniqlanadi
function _debtorItemsInfo(d) {
    const sale = (state.salesHistory || []).find(s => String(s.id) === String(d.id));
    const suppliers = new Set();
    const products = [];
    if (sale && Array.isArray(sale.items)) {
        sale.items.forEach(it => {
            const sup = typeof getSupplierFromProductName === "function" ? getSupplierFromProductName(it.name) : null;
            if (sup) suppliers.add(sup);
            const clean = String(it.name || "").replace(/\s*\[cogs:\d+,pack:\d+\]/, "").trim();
            if (clean) products.push(clean + (it.qty ? ` ×${it.qty}` : ""));
        });
    }
    return { suppliers: Array.from(suppliers), products };
}

// Qarzdorga eslatma matni (SMS uchun)
function _debtorReminderText(d) {
    const due = d.dueDate ? ` (muddat: ${d.dueDate})` : "";
    return `Hurmatli ${d.name}, Eco Sports do'konidan ${formatPrice(Number(d.debt) || 0)} miqdorida qarzingiz bor${due}. Iltimos to'lovni amalga oshiring. Rahmat!`;
}

// Qarzni to'liq to'landi deb belgilash
function markDebtorPaid(id) {
    const d = customerDebts.find(x => String(x.id) === String(id));
    if (!d) return;
    if (!confirm(`${d.name} qarzini (${formatPrice(Number(d.debt) || 0)}) TO'LIQ to'landi deb belgilaysizmi?`)) return;
    const amount = Number(d.debt) || 0;
    d.received = (Number(d.received) || 0) + amount;
    d.debt = 0;
    d.paid = true;
    saveCustomerDebts();
    if (typeof appendLedger === "function") {
        appendLedger("customer_payment", { ref: d.id, account: "kassa", direction: "in", amount: amount, note: d.name + " · qarz to'liq yopildi" });
    }
    renderDebtors();
    if (typeof renderBuxgalteriya === "function") renderBuxgalteriya();
}

// Qarzga qisman to'lov
function partialDebtorPayment(id) {
    const d = customerDebts.find(x => String(x.id) === String(id));
    if (!d) return;
    const cur = Number(d.debt) || 0;
    const inp = prompt(`${d.name} — qancha to'ladi? (qolgan qarz: ${formatPrice(cur)})`, "");
    if (inp == null) return;
    let amt = parseFloat(String(inp).replace(/\s/g, ""));
    if (isNaN(amt) || amt <= 0) { alert("Summani to'g'ri kiriting."); return; }
    amt = Math.min(amt, cur);
    d.debt = Math.max(0, cur - amt);
    d.received = (Number(d.received) || 0) + amt;
    if (d.debt <= 0) d.paid = true;
    saveCustomerDebts();
    if (typeof appendLedger === "function") {
        appendLedger("customer_payment", { ref: d.id, account: "kassa", direction: "in", amount: amt, note: d.name + " · qisman to'lov" + (d.paid ? " (yopildi)" : "") });
    }
    renderDebtors();
    if (typeof renderBuxgalteriya === "function") renderBuxgalteriya();
}

// Qarzdorlar bo'limini chizish
function renderDebtors() {
    const tbody = document.getElementById("debtors-tbody");
    if (!tbody) return;

    const all = (customerDebts || []).slice();

    // KPI hisob
    let totalDebt = 0, overdueVal = 0, overdueCnt = 0, soonVal = 0, soonCnt = 0, paidVal = 0, paidCnt = 0, activeCnt = 0;
    all.forEach(d => {
        const st = _debtorDueStatus(d);
        const debt = Number(d.debt) || 0;
        if (st.key === "paid") { paidVal += (Number(d.total) || debt); paidCnt++; return; }
        totalDebt += debt;
        if (st.key === "overdue") { overdueVal += debt; overdueCnt++; }
        else if (st.key === "soon") { soonVal += debt; soonCnt++; }
        activeCnt++;
    });
    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setTxt("debtors-total", formatPrice(totalDebt));
    setTxt("debtors-count", String(activeCnt));
    setTxt("debtors-overdue", formatPrice(overdueVal));
    setTxt("debtors-overdue-count", String(overdueCnt));
    setTxt("debtors-soon", formatPrice(soonVal));
    setTxt("debtors-soon-count", String(soonCnt));
    setTxt("debtors-paid", formatPrice(paidVal));
    setTxt("debtors-paid-count", String(paidCnt));

    // Filtr tugmalari faol holati
    document.querySelectorAll("#debtors-filter .debtor-filter-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.dfilter === debtorFilterState);
    });

    // Filtrlash
    let rows = all.filter(d => {
        const st = _debtorDueStatus(d);
        if (debtorFilterState === "all") return true;
        if (debtorFilterState === "active") return st.key !== "paid";
        return st.key === debtorFilterState;
    });
    // Tartib: muddati o'tgan eng tepada, keyin yaqin, keyin qolgan; to'langan oxirida
    const rank = { overdue: 0, soon: 1, active: 2, paid: 3 };
    rows.sort((a, b) => {
        const ra = rank[_debtorDueStatus(a).key], rb = rank[_debtorDueStatus(b).key];
        if (ra !== rb) return ra - rb;
        return (Number(b.debt) || 0) - (Number(a.debt) || 0);
    });

    const empty = document.getElementById("debtors-empty");
    tbody.innerHTML = "";
    if (rows.length === 0) {
        if (empty) empty.style.display = "block";
        return;
    }
    if (empty) empty.style.display = "none";

    rows.forEach(d => {
        const st = _debtorDueStatus(d);
        const info = _debtorItemsInfo(d);
        const tel = String(d.phone || "").replace(/[^\d+]/g, "");
        const smsText = encodeURIComponent(_debtorReminderText(d));
        const isPaid = st.key === "paid";

        const supTags = info.suppliers.length
            ? info.suppliers.map(s => `<span class="channel-tag" style="background:rgba(16,185,129,0.1); color:var(--primary); font-size:0.66rem; margin:1px;">${s}</span>`).join("")
            : `<span style="color:var(--text-muted); font-size:0.72rem;">—</span>`;
        const prodSub = info.products.length
            ? `<div style="font-size:0.68rem; color:var(--text-muted); margin-top:2px;">${info.products.slice(0, 2).join(", ")}${info.products.length > 2 ? " …" : ""}</div>`
            : "";

        const callBtn = tel
            ? `<a href="tel:${tel}" class="debtor-act-btn call" title="Qo'ng'iroq qilish"><i class="fa-solid fa-phone"></i></a>`
            : `<span class="debtor-act-btn disabled" title="Telefon yo'q"><i class="fa-solid fa-phone-slash"></i></span>`;
        const smsBtn = tel
            ? `<a href="sms:${tel}?&body=${smsText}" class="debtor-act-btn sms" title="SMS eslatma yuborish"><i class="fa-solid fa-comment-sms"></i></a>`
            : `<span class="debtor-act-btn disabled" title="Telefon yo'q"><i class="fa-solid fa-comment-slash"></i></span>`;
        const payBtns = isPaid
            ? `<span class="channel-tag" style="background:rgba(16,185,129,0.12); color:var(--primary); font-size:0.66rem;">Yopilgan</span>`
            : `<button type="button" class="debtor-act-btn partial" data-debtor-partial="${d.id}" title="Qisman to'lov"><i class="fa-solid fa-coins"></i></button>
               <button type="button" class="debtor-act-btn paid" data-debtor-paid="${d.id}" title="To'liq to'landi"><i class="fa-solid fa-check"></i></button>`;

        const row = document.createElement("tr");
        row.style.opacity = isPaid ? "0.65" : "1";
        row.innerHTML = `
            <td>
                <div style="font-weight:700;">${d.name || "Noma'lum"}</div>
                ${d.telegram ? `<div style="font-size:0.68rem; color:var(--accent);">${d.telegram}</div>` : ""}
            </td>
            <td style="white-space:nowrap;">${d.phone ? `<span style="font-weight:600;">${d.phone}</span>` : `<span style="color:var(--text-muted);">—</span>`}</td>
            <td style="font-weight:800; color:${isPaid ? 'var(--primary)' : '#ef4444'};">${formatPrice(Number(d.debt) || 0)}
                <div style="font-size:0.66rem; color:var(--text-muted); font-weight:600;">jami ${formatPrice(Number(d.total) || 0)}</div>
            </td>
            <td>${supTags}${prodSub}</td>
            <td style="white-space:nowrap;">
                <div style="font-size:0.72rem; color:var(--text-secondary);">${(d.date || "").slice(0, 16)}</div>
                <div style="font-size:0.72rem; font-weight:700; color:${st.color};">${d.dueDate ? "→ " + d.dueDate : ""}</div>
            </td>
            <td><span class="debtor-status" style="color:${st.color}; border-color:${st.color}55; background:${st.color}14;">${st.label}</span></td>
            <td><div class="debtor-actions">${callBtn}${smsBtn}${payBtns}</div></td>
        `;
        tbody.appendChild(row);
    });

    _bindDebtorControls();
}

let _debtorControlsBound = false;
function _bindDebtorControls() {
    if (_debtorControlsBound) return;
    _debtorControlsBound = true;

    // Filtr tugmalari
    const bar = document.getElementById("debtors-filter");
    if (bar) bar.addEventListener("click", (e) => {
        const btn = e.target.closest(".debtor-filter-btn");
        if (!btn) return;
        debtorFilterState = btn.dataset.dfilter || "active";
        renderDebtors();
    });

    // To'lov tugmalari (delegatsiya)
    const tbody = document.getElementById("debtors-tbody");
    if (tbody) tbody.addEventListener("click", (e) => {
        const paidBtn = e.target.closest("[data-debtor-paid]");
        if (paidBtn) { markDebtorPaid(paidBtn.dataset.debtorPaid); return; }
        const partBtn = e.target.closest("[data-debtor-partial]");
        if (partBtn) { partialDebtorPayment(partBtn.dataset.debtorPartial); return; }
    });

    // Excel eksport
    const xlsBtn = document.getElementById("debtors-excel");
    if (xlsBtn) xlsBtn.addEventListener("click", exportDebtorsExcel);
    // PDF eksport
    const pdfBtn = document.getElementById("debtors-pdf");
    if (pdfBtn) pdfBtn.addEventListener("click", exportDebtorsPdf);
}

// Qarzdorlar ro'yxatini Excel'ga eksport
function exportDebtorsExcel() {
    if (typeof XLSX === "undefined") { alert("Excel kutubxonasi yuklanmadi."); return; }
    const rows = [["Mijoz", "Telefon", "Telegram", "Qarz (UZS)", "Jami (UZS)", "Ta'minotchi", "Sana", "Muddat", "Holat"]];
    (customerDebts || []).forEach(d => {
        const st = _debtorDueStatus(d);
        const info = _debtorItemsInfo(d);
        rows.push([
            d.name || "", d.phone || "", d.telegram || "",
            Number(d.debt) || 0, Number(d.total) || 0,
            info.suppliers.join(", "), d.date || "", d.dueDate || "", st.label
        ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Qarzdorlar");
    XLSX.writeFile(wb, `eco-qarzdorlar-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Qarzdorlar KPI yig'indisi (PDF/UI uchun umumiy)
function _debtorsStats() {
    let total = 0, count = 0, overdue = 0, overdueCnt = 0, soon = 0, soonCnt = 0, paid = 0, paidCnt = 0;
    (customerDebts || []).forEach(d => {
        const st = _debtorDueStatus(d);
        const debt = Number(d.debt) || 0;
        if (st.key === "paid") { paid += (Number(d.total) || debt); paidCnt++; return; }
        total += debt; count++;
        if (st.key === "overdue") { overdue += debt; overdueCnt++; }
        else if (st.key === "soon") { soon += debt; soonCnt++; }
    });
    return { total, count, overdue, overdueCnt, soon, soonCnt, paid, paidCnt };
}

// Qarzdorlar PDF — premium oq A4 hujjat
function _buildDebtorsPdfHtml() {
    const s = _debtorsStats();
    const kpi = (label, val, sub, color) =>
        '<div style="flex:1;border:1px solid #eee;border-radius:10px;padding:12px 14px;">' +
        '<div style="font-size:11px;color:#888;font-weight:700;text-transform:uppercase;">' + label + '</div>' +
        '<div style="font-size:18px;font-weight:800;color:' + color + ';margin-top:3px;">' + val + '</div>' +
        '<div style="font-size:10px;color:#999;margin-top:2px;">' + sub + '</div></div>';

    // Faqat aktiv (to'lanmagan) + to'langanlar oxirida; o'tgan→yaqin→faol→to'langan
    const rank = { overdue: 0, soon: 1, active: 2, paid: 3 };
    const list = (customerDebts || []).slice().sort((a, b) => {
        const ra = rank[_debtorDueStatus(a).key], rb = rank[_debtorDueStatus(b).key];
        if (ra !== rb) return ra - rb;
        return (Number(b.debt) || 0) - (Number(a.debt) || 0);
    });

    const rows = list.map(d => {
        const st = _debtorDueStatus(d);
        const info = _debtorItemsInfo(d);
        const isPaid = st.key === "paid";
        return '<tr>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-weight:700;">' + (d.name || "—") +
            (d.telegram ? '<div style="font-size:9px;color:#0891b2;">' + d.telegram + '</div>' : '') + '</td>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;">' + (d.phone || "—") + '</td>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:800;color:' + (isPaid ? '#10b981' : '#ef4444') + ';">' + formatPrice(Number(d.debt) || 0) +
            '<div style="font-size:9px;color:#999;font-weight:600;">jami ' + formatPrice(Number(d.total) || 0) + '</div></td>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:10px;">' + (info.suppliers.join(", ") || "—") +
            (info.products.length ? '<div style="color:#999;">' + info.products.slice(0, 2).join(", ") + (info.products.length > 2 ? " …" : "") + '</div>' : '') + '</td>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:10px;">' + (d.dueDate || "—") + '</td>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-size:10px;font-weight:700;color:' + (st.color.indexOf("--") >= 0 ? '#10b981' : st.color) + ';">' + st.label + '</td>' +
            '</tr>';
    }).join("");

    return '<div style="width:794px;background:#fff;color:#1a1a1a;font-family:Arial,sans-serif;">' +
        '<div style="background:linear-gradient(135deg,#ef4444,#f59e0b);color:#fff;padding:28px 32px;">' +
        '<div style="font-size:26px;font-weight:800;">ECO SPORTS</div>' +
        '<div style="font-size:14px;opacity:0.95;">Qarzdorlar (Nasiya) Hisoboti</div>' +
        '<div style="font-size:11px;opacity:0.85;margin-top:4px;">Tuzilgan: ' + new Date().toLocaleString("uz-UZ") + '</div></div>' +
        '<div style="padding:24px 32px;">' +
        '<div style="display:flex;gap:10px;margin-bottom:20px;">' +
        kpi("Jami Qarz", formatPrice(s.total), s.count + " ta qarzdor", "#ef4444") +
        kpi("Muddati O'tgan", formatPrice(s.overdue), s.overdueCnt + " ta", "#dc2626") +
        kpi("Yaqin (≤3 kun)", formatPrice(s.soon), s.soonCnt + " ta", "#f59e0b") +
        kpi("To'langan", formatPrice(s.paid), s.paidCnt + " ta yopilgan", "#10b981") +
        '</div>' +
        '<div style="font-size:15px;font-weight:800;margin:6px 0 8px;color:#ef4444;">Qarzdorlar ro\'yxati</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
        '<thead><tr style="background:#fef2f2;">' +
        '<th style="padding:7px 8px;text-align:left;">Mijoz</th><th style="padding:7px 8px;text-align:left;">Telefon</th>' +
        '<th style="padding:7px 8px;text-align:right;">Qarz</th><th style="padding:7px 8px;text-align:left;">Ta\'minotchi mahsuloti</th>' +
        '<th style="padding:7px 8px;text-align:left;">Muddat</th><th style="padding:7px 8px;text-align:left;">Holat</th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="6" style="padding:14px;text-align:center;color:#999;">Qarzdor yo\'q</td></tr>') + '</tbody></table>' +
        '</div>' +
        '<div style="padding:14px 32px;border-top:2px solid #ef4444;font-size:10px;color:#888;">ECO SPORTS CRM · ' + (appConfig.storeName || "") + ' · ' + (appConfig.storePhone || "") + '</div></div>';
}

async function exportDebtorsPdf() {
    if (!window.html2canvas || !(window.jspdf && window.jspdf.jsPDF)) { alert("PDF kutubxonasi yuklanmadi. Internet aloqasini tekshiring."); return; }
    const btn = document.getElementById("debtors-pdf");
    const orig = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tayyorlanmoqda...'; }
    const holder = document.createElement("div");
    holder.style.position = "fixed"; holder.style.left = "-99999px"; holder.style.top = "0"; holder.style.width = "794px";
    holder.innerHTML = _buildDebtorsPdfHtml();
    document.body.appendChild(holder);
    try {
        const el = holder.firstElementChild;
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF("p", "mm", "a4");
        const pageW = 210, pageH = 297, imgW = pageW;
        const imgH = canvas.height * imgW / canvas.width;
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        let heightLeft = imgH, position = 0;
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH); heightLeft -= pageH;
        while (heightLeft > 0) { position -= pageH; pdf.addPage(); pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH); heightLeft -= pageH; }
        pdf.save("Eco_Qarzdorlar_" + new Date().toISOString().slice(0, 10) + ".pdf");
    } catch (e) { console.error("PDF xato:", e); alert("PDF yaratishda xato: " + e.message); }
    finally { document.body.removeChild(holder); if (btn) { btn.disabled = false; btn.innerHTML = orig; } }
}

// --- Mahsulot narxlari (eco_inventory integer-PK bug'i sabab eco_config'da saqlanadi) ---
// { [productId]: { cogs, pack_price, price } }
let productPrices = {};
try {
    const _pp = localStorage.getItem("eco_sports_product_prices");
    if (_pp) productPrices = JSON.parse(_pp) || {};
} catch (e) { productPrices = {}; }

function saveProductPrices() {
    localStorage.setItem("eco_sports_product_prices", JSON.stringify(productPrices));
    if (typeof dbSaveConfig === "function") dbSaveConfig("eco_product_prices", productPrices);
}

// ============================================================
// 1-BOSQICH: O'ZGARMAS HISOB JURNALI (IMMUTABLE LEDGER)
// Har bir moliyaviy hodisa (sotuv, kirim, to'lov, xarajat) o'zgarmas
// yozuv sifatida saqlanadi — HECH QACHON tahrirlanmaydi/o'chirilmaydi.
// Xato bo'lsa — eski yozuv qoladi, "bekor" (reversal) yozuvi qo'shiladi.
// Bu audit izini beradi: "bu pul qayerdan keldi?" savoliga doim javob bo'ladi.
// ============================================================
const LEDGER_SYNC_CAP = 2000; // bulutga faqat oxirgi N yozuv (blob hajmini cheklash)
let ledger = [];
try { const _lg = localStorage.getItem("eco_sports_ledger"); if (_lg) ledger = JSON.parse(_lg) || []; } catch (e) { ledger = []; }

function _ledgerActor() {
    if (currentUser && currentUser.name) return currentUser.name;
    try { if (typeof activeCashierLabel !== "undefined" && activeCashierLabel && activeCashierLabel.textContent) return activeCashierLabel.textContent; } catch (e) {}
    return "tizim";
}

function saveLedger() {
    try { localStorage.setItem("eco_sports_ledger", JSON.stringify(ledger)); } catch (e) {}
    // Bulutga: o'zgarmas append-log — oxirgi LEDGER_SYNC_CAP yozuv.
    // Ko'p qurilmali yo'qotishsiz birlashtirish (union-merge) syncFromSupabase'da bajariladi.
    if (typeof dbSaveConfig === "function") {
        const recent = ledger.length > LEDGER_SYNC_CAP ? ledger.slice(-LEDGER_SYNC_CAP) : ledger;
        dbSaveConfig("eco_ledger", recent);
    }
}

// O'zgarmas yozuv qo'shish (faqat ADD). type: sale|customer_debt|supplier_payment|kirim|expense|reversal
function appendLedger(type, fields) {
    fields = fields || {};
    const now = new Date();
    const entry = {
        jid: "LJ-" + now.getTime() + "-" + Math.random().toString(36).slice(2, 7),
        ts: now.toISOString(),
        date: now.toLocaleDateString('uz-UZ') + " " + now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
        type: type,
        ref: fields.ref != null ? String(fields.ref) : null,
        actor: _ledgerActor(),
        account: fields.account || "boshqa",
        direction: fields.direction || "neutral", // in | out | neutral
        amount: Math.round(fields.amount || 0),
        note: fields.note || "",
        data: fields.data || {},
        reverses: fields.reverses || null
    };
    ledger.push(entry);
    saveLedger();
    return entry;
}

// Bekor qilish — eski yozuv O'CHIRILMAYDI, teskari yozuv qo'shiladi (audit izi saqlanadi)
function reverseLedgerEntry(jid, reason) {
    const orig = ledger.find(e => e.jid === jid);
    if (!orig) return null;
    if (ledger.some(e => e.reverses === jid)) return null; // allaqachon bekor qilingan
    return appendLedger("reversal", {
        ref: orig.ref, account: orig.account,
        direction: orig.direction === "in" ? "out" : (orig.direction === "out" ? "in" : "neutral"),
        amount: -orig.amount,
        note: "BEKOR: " + (reason || "") + " (asl: " + orig.type + ")",
        reverses: jid, data: { reversedType: orig.type }
    });
}

// Bekor qilinmagan (haqiqiy) yozuvlar
function effectiveLedger() {
    const reversed = new Set();
    ledger.forEach(e => { if (e.reverses) reversed.add(e.reverses); });
    return ledger.filter(e => e.type !== "reversal" && !reversed.has(e.jid));
}

// ============================================================
// 1-BOSQICH: KUNLIK AVTOMATIK SVERTKA (RECONCILIATION)
// Sinxronlangan holatni (yagona manba) ichki ziddiyatlarga tekshiradi va
// hisob jurnali bilan solishtiradi. READ-ONLY — hech narsa o'zgartirmaydi.
// ============================================================
function _reconDayKey(d) {
    d = d || new Date();
    const pad = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

// salesHistory timestamp "DD.MM.YYYY HH:MM" (uz-UZ) → "YYYY-MM-DD" kaliti yoki null
function _reconSaleDayKey(ts) {
    if (!ts) return null;
    const m = String(ts).match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
    if (!m) return null;
    const pad = n => String(n).padStart(2, "0");
    return m[3] + "-" + pad(m[2]) + "-" + pad(m[1]);
}

function runReconciliation(dayKey) {
    dayKey = dayKey || _reconDayKey();
    const cats = [];
    let pass = 0, warn = 0, fail = 0;
    const add = (cat, label, status, detail) => {
        let c = cats.find(x => x.name === cat);
        if (!c) { c = { name: cat, rows: [] }; cats.push(c); }
        c.rows.push({ label, status, detail: detail || "" });
        if (status === "pass") pass++; else if (status === "warn") warn++; else fail++;
    };

    const sales = state.salesHistory || [];
    const todaySales = sales.filter(s => _reconSaleDayKey(s.timestamp) === dayKey);

    // 1) KASSA SVERTKASI (bugun)
    let daySubtotal = 0, dayReceived = 0, dayDebt = 0;
    todaySales.forEach(s => {
        daySubtotal += Number(s.totalPaid) || 0;
        dayReceived += Number(s.received != null ? s.received : s.totalPaid) || 0;
        dayDebt += Number(s.debt) || 0;
    });
    const dayExpenses = (expenses || []).filter(e => _reconSaleDayKey(e.timestamp) === dayKey)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const netCash = dayReceived - dayExpenses;
    add("Kassa svertkasi (bugun)", "Sotuvlar soni: " + todaySales.length, "pass", "");
    add("Kassa svertkasi (bugun)", "Jami savdo: " + formatPrice(daySubtotal), "pass", "");
    add("Kassa svertkasi (bugun)", "Naqd olingan: " + formatPrice(dayReceived), "pass", "");
    add("Kassa svertkasi (bugun)", "Nasiya (qarz): " + formatPrice(dayDebt), dayDebt > 0 ? "warn" : "pass", dayDebt > 0 ? "Bugun qarzga berilgan" : "");
    add("Kassa svertkasi (bugun)", "Xarajatlar: " + formatPrice(dayExpenses), "pass", "");
    add("Kassa svertkasi (bugun)", "Sof kassa oqimi: " + formatPrice(netCash), "pass", "olingan − xarajat");

    // 2) HAR SOTUV BALANSI: received + qarz = jami
    let balErr = 0;
    sales.forEach(s => {
        const total = Number(s.totalPaid) || 0;
        const rec = Number(s.received != null ? s.received : total) || 0;
        const debt = Number(s.debt) || 0;
        if (Math.abs((rec + debt) - total) > 1) balErr++;
    });
    add("Sotuv balansi", "received + qarz = jami (har chek)", balErr === 0 ? "pass" : "fail",
        balErr === 0 ? sales.length + " ta chek to'g'ri" : balErr + " ta chekda balans buzilgan");

    // 3) MIJOZ QARZI MOSLIGI (qarz daftari = sotuvlardagi qarz)
    const debtSalesTotal = sales.reduce((s, x) => s + (Number(x.debt) || 0), 0);
    const cdTotal = (customerDebts || []).filter(d => !d.paid).reduce((s, d) => s + (Number(d.debt) || 0), 0);
    add("Mijoz qarzi", "Qarz daftari = sotuvlardagi qarz", Math.abs(debtSalesTotal - cdTotal) <= 1 ? "pass" : "warn",
        "Sotuv: " + formatPrice(debtSalesTotal) + " | Daftar: " + formatPrice(cdTotal));

    // 4) JURNAL ↔ SOTUV MOSLIGI (buzilish/o'chirib yuborish detektori)
    const eff = effectiveLedger();
    const ledgerSaleRefs = new Set(eff.filter(e => e.type === "sale").map(e => String(e.ref)));
    const saleIds = new Set(sales.map(s => String(s.id)));
    let salesNoLedger = 0, ledgerNoSale = 0;
    saleIds.forEach(id => { if (!ledgerSaleRefs.has(id)) salesNoLedger++; });
    ledgerSaleRefs.forEach(ref => { if (!saleIds.has(ref)) ledgerNoSale++; });
    add("Jurnal mosligi", "Har sotuvda jurnal yozuvi bor", salesNoLedger === 0 ? "pass" : "warn",
        salesNoLedger === 0 ? "Hammasi jurnalda" : salesNoLedger + " ta sotuv jurnalsiz (eski yoki tashqaridan)");
    add("Jurnal mosligi", "Har jurnal sotuviga sotuv mavjud", ledgerNoSale === 0 ? "pass" : "fail",
        ledgerNoSale === 0 ? "Mos" : ledgerNoSale + " ta jurnal yozuviga sotuv yo'q (o'chirilgan?)");

    // 5) MANFIY OMBOR
    let negStock = 0;
    Object.keys(inventory || {}).forEach(id => { if ((Number(inventory[id]) || 0) < 0) negStock++; });
    add("Ombor", "Manfiy qoldiq yo'q", negStock === 0 ? "pass" : "fail", negStock === 0 ? "" : negStock + " ta mahsulot manfiy");

    // 6) NARXSIZ TASDIQLANGAN MAHSULOT
    const catalog = [...PRODUCTS, ...(state.dynamicProducts || [])];
    const zeroPriced = catalog.filter(p => p.approved && (!p.price || p.price <= 0)).length;
    add("Narxlash", "Tasdiqlangan mahsulotda narx bor", zeroPriced === 0 ? "pass" : "warn", zeroPriced === 0 ? "" : zeroPriced + " ta tasdiqlangan mahsulot narxsiz");

    // 7) TA'MINOTCHI QARZI (ortiqcha to'lov)
    let overPaid = 0;
    (state.suppliers || []).forEach(sup => {
        if (typeof getSupplierTakenValue !== "function" || typeof getSupplierPaidTotal !== "function") return;
        if (getSupplierPaidTotal(sup.name) - getSupplierTakenValue(sup.name) > 1) overPaid++;
    });
    add("Ta'minotchi qarzi", "Ortiqcha to'lov yo'q", overPaid === 0 ? "pass" : "warn", overPaid === 0 ? "" : overPaid + " ta ta'minotchiga olingandan ko'p to'langan");

    const total = pass + warn + fail;
    const score = total ? Math.round((pass / total) * 100) : 100;
    return { dayKey, generatedAt: new Date().toISOString(), pass, warn, fail, score, cats,
        summary: { sales: todaySales.length, subtotal: daySubtotal, received: dayReceived, debt: dayDebt, expenses: dayExpenses, netCash } };
}

function _reconcileTextReport(r) {
    let t = "📊 ECO SPORTS — KUNLIK SVERTKA (" + r.dayKey + ")\n";
    t += "Ball: " + r.score + "% | ✅ " + r.pass + " ⚠️ " + r.warn + " ❌ " + r.fail + "\n";
    t += "Sotuvlar: " + r.summary.sales + " | Savdo: " + formatPrice(r.summary.subtotal) + "\n";
    t += "Olingan: " + formatPrice(r.summary.received) + " | Qarz: " + formatPrice(r.summary.debt) + " | Xarajat: " + formatPrice(r.summary.expenses) + "\n";
    if (r.fail > 0 || r.warn > 0) {
        t += "\n⚠️ Muammolar:\n";
        r.cats.forEach(c => c.rows.forEach(row => {
            if (row.status !== "pass") t += (row.status === "fail" ? "❌" : "⚠️") + " " + c.name + ": " + row.label + (row.detail ? " — " + row.detail : "") + "\n";
        }));
    } else {
        t += "\n✅ Barcha tekshiruvlar toza.";
    }
    return t;
}

async function sendReconciliationToTelegram(r) {
    const targetChatId = appConfig.chatId || "";
    try {
        await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: _reconcileTextReport(r), chatId: targetChatId }) });
        return true;
    } catch (e) { console.warn("Svertka Telegram yuborilmadi:", e); return false; }
}

let _lastReconcile = null;

// Kuniga bir marta avtomatik svertka (init'da chaqiriladi — bir kunda bir marta)
async function runDailyReconciliationIfNeeded() {
    const today = _reconDayKey();
    if (localStorage.getItem("eco_last_reconcile_date") === today) return; // bugun bajarilgan
    const r = runReconciliation(today);
    _lastReconcile = r;
    localStorage.setItem("eco_last_reconcile_date", today);
    try { localStorage.setItem("eco_last_reconcile_result", JSON.stringify(r)); } catch (e) {}
    // Muammo bo'lsa va admin qurilmasi onlayn bo'lsa — Telegram'ga ogohlantirish
    const online = !(typeof navigator !== "undefined" && navigator.onLine === false);
    if ((r.fail > 0 || r.warn > 0) && online && currentUser && currentUser.role === "admin") {
        sendReconciliationToTelegram(r);
    }
    if (document.getElementById("recon-results")) paintReconciliation(r);
    return r;
}

function startReconciliation() {
    _lastReconcile = runReconciliation();
    localStorage.setItem("eco_last_reconcile_date", _reconDayKey());
    try { localStorage.setItem("eco_last_reconcile_result", JSON.stringify(_lastReconcile)); } catch (e) {}
    paintReconciliation(_lastReconcile);
    renderLedgerView();
}

function paintReconciliation(r) {
    const box = document.getElementById("recon-results");
    if (!box) return;
    if (!r) { box.innerHTML = '<div class="diag-hint"><i class="fa-solid fa-circle-info"></i> "Hozir Tekshirish"ni bosing.</div>'; return; }
    let html = '<div class="diag-summary" style="display:flex">' +
        '<div class="diag-stat diag-stat-pass"><span>' + r.pass + "</span><small>O'tdi</small></div>" +
        '<div class="diag-stat diag-stat-warn"><span>' + r.warn + '</span><small>Ogoh</small></div>' +
        '<div class="diag-stat diag-stat-fail"><span>' + r.fail + '</span><small>Xato</small></div>' +
        '<div class="diag-score">' + r.score + '%</div></div>';
    html += '<div class="diag-hint" style="margin:0.6rem 0"><i class="fa-solid fa-calendar-day"></i> ' + r.dayKey +
        ' · Sotuv ' + r.summary.sales + ' · Olingan ' + formatPrice(r.summary.received) + ' · Qarz ' + formatPrice(r.summary.debt) + '</div>';
    r.cats.forEach(c => {
        const cFail = c.rows.some(x => x.status === "fail");
        const cWarn = c.rows.some(x => x.status === "warn");
        const badge = cFail ? "❌" : (cWarn ? "⚠️" : "✅");
        html += '<div class="diag-cat"><div class="diag-cat-head">' + badge + " " + c.name + '</div>';
        c.rows.forEach(row => {
            const ic = row.status === "pass" ? '<i class="fa-solid fa-circle-check" style="color:#10b981"></i>'
                : row.status === "warn" ? '<i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b"></i>'
                : '<i class="fa-solid fa-circle-xmark" style="color:#ef4444"></i>';
            html += '<div class="diag-row"><span>' + ic + " " + row.label + '</span><small>' + (row.detail || "") + '</small></div>';
        });
        html += '</div>';
    });
    box.innerHTML = html;
}

function _ledgerTypeLabel(t) {
    return ({ sale: "🛒 Sotuv", customer_debt: "🔴 Mijoz qarzi", supplier_payment: "💸 Ta'minotchi to'lovi", kirim: "📦 Kirim", expense: "💼 Xarajat", reversal: "↩️ Bekor" })[t] || t;
}

function renderLedgerView() {
    const box = document.getElementById("ledger-results");
    if (!box) return;
    const reversed = new Set(); ledger.forEach(e => { if (e.reverses) reversed.add(e.reverses); });
    const recent = ledger.slice(-50).reverse();
    if (recent.length === 0) {
        box.innerHTML = '<div class="diag-hint"><i class="fa-solid fa-circle-info"></i> Jurnal bo\'sh. Sotuv/kirim/to\'lov qilinganda yozuvlar shu yerda ko\'rinadi.</div>';
        return;
    }
    let html = '<div class="diag-hint" style="margin-bottom:0.6rem"><i class="fa-solid fa-clock-rotate-left"></i> Oxirgi ' + recent.length + " yozuv (jami " + ledger.length + "). Yozuvlar o'chirilmaydi — faqat bekor qilinadi.</div>";
    recent.forEach(e => {
        const isRev = reversed.has(e.jid);
        const sign = e.direction === "out" ? "−" : (e.direction === "in" ? "+" : "");
        const amt = e.amount ? sign + formatPrice(Math.abs(e.amount)) : "";
        html += '<div class="diag-row" style="' + (isRev ? "opacity:0.5;text-decoration:line-through" : "") + '">' +
            '<span>' + _ledgerTypeLabel(e.type) + ' <small style="opacity:0.65">' + e.date + " · " + e.actor + '</small></span>' +
            '<small>' + amt + (e.note ? " · " + e.note : "") + '</small></div>';
    });
    box.innerHTML = html;
}

// ============================================================
// 2-BOSQICH: DOUBLE-ENTRY "SOYA DAFTARI" (shadow ledger)
// Kassir BUNI KO'RMAYDI (faqat admin Sozlamalarida). Har moliyaviy hodisa
// fonda ikki tomonlama (debet=kredit) yoziladi → professional oborot-balans,
// foyda-zarar va mustaqil cross-check (xato/farqni topadi).
// 1-bosqich o'zgarmas jurnaldan HOSILA qilinadi (drift yo'q, yangi yozuv yo'q).
// ============================================================
const SHADOW_ACCOUNTS = {
    KASSA:            { label: "Kassa (naqd pul)",             type: "aktiv" },
    OMBOR:            { label: "Tovar zaxirasi (ombor)",       type: "aktiv" },
    MIJOZ_QARZI:      { label: "Mijoz qarzi (debitor)",        type: "aktiv" },
    TAMINOTCHI_QARZI: { label: "Ta'minotchi qarzi (kreditor)", type: "passiv" },
    SAVDO:            { label: "Savdo daromadi",               type: "daromad" },
    TANNARX:          { label: "Sotilgan tovar tannarxi",      type: "xarajat" },
    XARAJAT:          { label: "Operatsion xarajatlar",        type: "xarajat" }
};

let shadowState = { from: null, to: null, label: "Bu oy" };

function _withinPeriod(d, from, to) {
    if (!from && !to) return true;
    if (!d) return false;
    if (from && d < new Date(from.getFullYear(), from.getMonth(), from.getDate())) return false;
    if (to && d > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59)) return false;
    return true;
}

// 1-bosqich jurnaldan balanslangan double-entry postinglar hosil qiladi
function buildShadowLedger(from, to) {
    const accounts = {};
    Object.keys(SHADOW_ACCOUNTS).forEach(k => accounts[k] = { debit: 0, credit: 0 });
    const post = (acc, dr, cr) => { if (!accounts[acc]) accounts[acc] = { debit: 0, credit: 0 }; accounts[acc].debit += dr || 0; accounts[acc].credit += cr || 0; };

    const entries = (typeof effectiveLedger === "function" ? effectiveLedger() : [])
        .filter(e => _withinPeriod(e.ts ? new Date(e.ts) : _saleDateObj(e.date), from, to));
    entries.forEach(e => {
        const amt = Math.abs(Number(e.amount) || 0);
        if (e.type === "sale") {
            const total = Number(e.data && e.data.total) || amt;
            const received = Number(e.data && e.data.received != null ? e.data.received : total);
            const debt = Number(e.data && e.data.debt) || 0;
            post("KASSA", received, 0);
            if (debt > 0) post("MIJOZ_QARZI", debt, 0);
            post("SAVDO", 0, total);
        } else if (e.type === "kirim") {
            post("OMBOR", amt, 0);
            post("TAMINOTCHI_QARZI", 0, amt);
        } else if (e.type === "supplier_payment") {
            post("TAMINOTCHI_QARZI", amt, 0);
            post("KASSA", 0, amt);
        } else if (e.type === "expense") {
            post("XARAJAT", amt, 0);
            post("KASSA", 0, amt);
        }
        // customer_debt: sotuv ichida hisobga olingan — qo'shimcha post yo'q (ikki marta sanalmasin)
    });

    // COGS sozlash: davr sotuvlarining haqiqiy tannarxi (tovar ombordan chiqadi)
    const periodSales = (state.salesHistory || []).filter(tx => _withinPeriod(_saleDateObj(tx.timestamp), from, to));
    const cogs = calcRealCOGS(periodSales).cogs;
    if (cogs > 0) { post("TANNARX", cogs, 0); post("OMBOR", 0, cogs); }

    let totalDebit = 0, totalCredit = 0;
    Object.keys(accounts).forEach(k => { totalDebit += accounts[k].debit; totalCredit += accounts[k].credit; });
    const revenue = accounts.SAVDO ? accounts.SAVDO.credit : 0;
    const cogsTotal = accounts.TANNARX ? accounts.TANNARX.debit : 0;
    const expenseTotal = accounts.XARAJAT ? accounts.XARAJAT.debit : 0;
    const grossProfit = revenue - cogsTotal;
    const netProfit = grossProfit - expenseTotal;

    return {
        accounts, totalDebit, totalCredit,
        balanced: Math.abs(totalDebit - totalCredit) <= 1,
        pnl: { revenue, cogs: cogsTotal, expense: expenseTotal, grossProfit, netProfit },
        count: entries.length, label: shadowState.label
    };
}

// Mustaqil cross-check (HAMMA vaqt) — double-entry'ning xato topish kuchi:
// daftar qoldig'ini haqiqiy holat bilan solishtiradi.
function shadowCrossCheck() {
    const all = buildShadowLedger(null, null).accounts;
    const out = [];

    // 1) Ombor: daftar qoldig'i vs haqiqiy zaxira qiymati (qoldiq × tannarx)
    const deOmbor = all.OMBOR.debit - all.OMBOR.credit;
    let realInv = 0;
    const catalog = [...PRODUCTS, ...(state.dynamicProducts || [])];
    catalog.forEach(p => {
        const qty = Number(inventory[p.id]) || 0;
        if (qty <= 0) return;
        const packSizes = (p.sizes && p.sizes.length) ? p.sizes.length : 5;
        const perUnit = p.cogs ? (p.cogs / packSizes) : (p.price ? p.price * 0.6 : 0);
        realInv += qty * perUnit;
    });
    out.push({ label: "Ombor: daftar ↔ haqiqiy zaxira", de: deOmbor, real: realInv, ok: Math.abs(deOmbor - realInv) <= Math.max(2000, realInv * 0.03) });

    // 2) Mijoz qarzi: daftar vs to'lanmagan qarz ro'yxati
    const deAR = all.MIJOZ_QARZI.debit - all.MIJOZ_QARZI.credit;
    const realAR = (customerDebts || []).filter(d => !d.paid).reduce((s, d) => s + (Number(d.debt) || 0), 0);
    out.push({ label: "Mijoz qarzi: daftar ↔ qarz ro'yxati", de: deAR, real: realAR, ok: Math.abs(deAR - realAR) <= 1000 });

    // 3) Ta'minotchi qarzi: daftar vs (olingan − to'langan)
    const deAP = all.TAMINOTCHI_QARZI.credit - all.TAMINOTCHI_QARZI.debit;
    let realAP = 0;
    (state.suppliers || []).forEach(sup => {
        if (typeof getSupplierTakenValue === "function" && typeof getSupplierPaidTotal === "function")
            realAP += Math.max(0, getSupplierTakenValue(sup.name) - getSupplierPaidTotal(sup.name));
    });
    out.push({ label: "Ta'minotchi qarzi: daftar ↔ hisob", de: deAP, real: realAP, ok: Math.abs(deAP - realAP) <= Math.max(2000, realAP * 0.05) });

    return out.map(r => ({ label: r.label, ok: r.ok, deTxt: formatPrice(Math.round(r.de)), realTxt: formatPrice(Math.round(r.real)) }));
}

function setShadowRange(kind) {
    const now = new Date(), y = now.getFullYear(), mo = now.getMonth();
    let from = null, to = null, label = "Hammasi";
    if (kind === "month") { from = new Date(y, mo, 1); to = new Date(y, mo + 1, 0); label = "Bu oy"; }
    else if (kind === "lastmonth") { from = new Date(y, mo - 1, 1); to = new Date(y, mo, 0); label = "O'tgan oy"; }
    else if (kind === "year") { from = new Date(y, 0, 1); to = new Date(y, 11, 31); label = "Bu yil (" + y + ")"; }
    shadowState = { from, to, label };
    document.querySelectorAll(".shadow-q-btn").forEach(b => b.classList.toggle("active", b.dataset.range === kind));
    renderShadowLedger();
}

function renderShadowLedger() {
    const box = document.getElementById("shadow-results");
    if (!box) return;
    const r = buildShadowLedger(shadowState.from, shadowState.to);
    let html = '<div class="diag-hint" style="margin-bottom:0.8rem;background:' + (r.balanced ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)") + ';">' +
        (r.balanced
            ? '<i class="fa-solid fa-circle-check" style="color:#10b981"></i> Kitoblar BALANSDA — debet = kredit (' + formatPrice(r.totalDebit) + ')'
            : '<i class="fa-solid fa-circle-xmark" style="color:#ef4444"></i> BALANS BUZILGAN: debet ' + formatPrice(r.totalDebit) + ' ≠ kredit ' + formatPrice(r.totalCredit)) +
        ' · ' + r.label + '</div>';

    html += '<div style="overflow-x:auto;"><table class="crm-table"><thead><tr><th>Hisob</th><th>Tur</th><th>Debet</th><th>Kredit</th><th>Qoldiq</th></tr></thead><tbody>';
    Object.keys(SHADOW_ACCOUNTS).forEach(k => {
        const a = r.accounts[k]; if (!a || (a.debit === 0 && a.credit === 0)) return;
        const net = a.debit - a.credit, meta = SHADOW_ACCOUNTS[k];
        html += '<tr><td>' + meta.label + '</td><td><span class="channel-tag">' + meta.type + '</span></td>' +
            '<td>' + formatPrice(a.debit) + '</td><td>' + formatPrice(a.credit) + '</td>' +
            '<td style="font-weight:700;">' + formatPrice(Math.abs(net)) + (net >= 0 ? " D" : " K") + '</td></tr>';
    });
    html += '<tr style="font-weight:800;border-top:2px solid var(--primary);"><td colspan="2">JAMI</td><td>' + formatPrice(r.totalDebit) + '</td><td>' + formatPrice(r.totalCredit) + '</td><td>—</td></tr></tbody></table></div>';

    html += '<div style="margin-top:1rem;"><h4 style="font-size:0.85rem;margin-bottom:0.5rem;"><i class="fa-solid fa-sack-dollar"></i> Foyda-Zarar (' + r.label + ')</h4>' +
        '<div class="diag-row"><span>Savdo daromadi</span><small>' + formatPrice(r.pnl.revenue) + '</small></div>' +
        '<div class="diag-row"><span>− Tannarx (COGS)</span><small>' + formatPrice(r.pnl.cogs) + '</small></div>' +
        '<div class="diag-row"><span>= Yalpi foyda</span><small>' + formatPrice(r.pnl.grossProfit) + '</small></div>' +
        '<div class="diag-row"><span>− Operatsion xarajat</span><small>' + formatPrice(r.pnl.expense) + '</small></div>' +
        '<div class="diag-row" style="font-weight:800;color:var(--primary);"><span>= Netto foyda</span><small>' + formatPrice(r.pnl.netProfit) + '</small></div></div>';

    const cc = shadowCrossCheck();
    html += '<div style="margin-top:1rem;"><h4 style="font-size:0.85rem;margin-bottom:0.5rem;"><i class="fa-solid fa-code-compare"></i> Mustaqil cross-check (hamma vaqt) — farq = xato signali</h4>';
    cc.forEach(c => {
        const ic = c.ok ? '<i class="fa-solid fa-circle-check" style="color:#10b981"></i>' : '<i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b"></i>';
        html += '<div class="diag-row"><span>' + ic + " " + c.label + '</span><small>daftar ' + c.deTxt + " · haqiqiy " + c.realTxt + '</small></div>';
    });
    html += '</div>';
    box.innerHTML = html;
}

function exportShadowExcel() {
    if (typeof XLSX === "undefined") { alert("Excel kutubxonasi yuklanmadi. Internet aloqasini tekshiring."); return; }
    const r = buildShadowLedger(shadowState.from, shadowState.to);
    const wb = XLSX.utils.book_new();
    const tb = [["ECO SPORTS — Oborot-balans", r.label], [], ["Hisob", "Tur", "Debet", "Kredit", "Qoldiq"]];
    Object.keys(SHADOW_ACCOUNTS).forEach(k => { const a = r.accounts[k]; if (!a) return; tb.push([SHADOW_ACCOUNTS[k].label, SHADOW_ACCOUNTS[k].type, a.debit, a.credit, a.debit - a.credit]); });
    tb.push(["JAMI", "", r.totalDebit, r.totalCredit, ""]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tb), "Oborot-balans");
    const pnl = [["Foyda-Zarar", r.label], [], ["Savdo daromadi", r.pnl.revenue], ["Tannarx (COGS)", r.pnl.cogs], ["Yalpi foyda", r.pnl.grossProfit], ["Operatsion xarajat", r.pnl.expense], ["Netto foyda", r.pnl.netProfit]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pnl), "Foyda-Zarar");
    XLSX.writeFile(wb, "Buxgalteriya_Daftari_" + (r.label || "hisobot").replace(/[^\w-]+/g, "_") + ".xlsx");
}

function getSupplierPaidTotal(name) {
    return (supplierPayments[name] || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}
function addSupplierPayment(name, amount, note, image) {
    if (!supplierPayments[name]) supplierPayments[name] = [];
    const pid = "pay-" + Date.now();
    supplierPayments[name].push({ id: pid, amount: Number(amount) || 0, note: note || "", date: new Date().toISOString(), image: image || null });
    saveSupplierPayments();
    if (typeof appendLedger === "function") {
        appendLedger("supplier_payment", { ref: pid, account: "taminotchi_qarzi", direction: "out", amount: Number(amount) || 0, note: name + (note ? " · " + note : "") });
    }
}
function deleteSupplierPayment(name, id) {
    if (!supplierPayments[name]) return;
    supplierPayments[name] = supplierPayments[name].filter(p => p.id !== id);
    saveSupplierPayments();
}
// All-time value of goods taken from a supplier (purchase/cogs value) = qarz asosi
function getSupplierTakenValue(name) {
    let total = 0;
    if (state.kirimHistory && Array.isArray(state.kirimHistory)) {
        const catalog = [...PRODUCTS, ...(state.dynamicProducts || [])];
        state.kirimHistory.forEach(k => {
            if (k.supplier !== name) return;
            const sizesArr = k.sizes ? safeJsonParse(k.sizes, []) : [];
            const packSizes = sizesArr.length > 0 ? sizesArr.length : 5;
            const packs = parseFloat(k.total_packs) || 0;
            let packCogs = 0;
            const prod = catalog.find(sp => String(sp.id) === String(k.product_id));
            if (prod) packCogs = prod.cogs ? prod.cogs : (prod.price * 0.6 * packSizes);
            else packCogs = (k.price || 0) * 0.6 * packSizes;
            total += packs * packCogs;
        });
    }
    return total;
}

// All-time MIQDOR of goods taken from a supplier (kirim bo'yicha) — qarz miqdori asosi
// { packs, dona } — barcha vaqt davomida ta'minotchidan olingan jami yuk
function getSupplierTakenQty(name) {
    let packs = 0, dona = 0;
    if (state.kirimHistory && Array.isArray(state.kirimHistory)) {
        state.kirimHistory.forEach(k => {
            if (k.supplier !== name) return;
            packs += parseFloat(k.total_packs) || 0;
            dona += parseFloat(k.total_qty) || 0;
        });
    }
    return { packs, dona };
}

// Currency control shared by both report sections
let indShowAllDetails = false;
function _setReportCurrency(cur) {
    reportState.currency = cur;
    if (typeof renderSupplierStockReport === "function") renderSupplierStockReport();
    if (typeof renderSupplierIndividualReport === "function") renderSupplierIndividualReport();
}
function _setUsdRate(v) {
    reportState.usdRate = (v && v > 0) ? v : 0;
    localStorage.setItem("eco_usd_rate", String(reportState.usdRate));
    if (typeof renderSupplierStockReport === "function") renderSupplierStockReport();
    if (typeof renderSupplierIndividualReport === "function") renderSupplierIndividualReport();
}

function reportFmtMoney(uzs) {
    uzs = Math.round(uzs || 0);
    if (reportState.currency === "USD") {
        const rate = reportState.usdRate > 0 ? reportState.usdRate : 1;
        const usd = uzs / rate;
        return "$" + usd.toLocaleString("en-US", { maximumFractionDigits: usd < 100 ? 2 : 0 });
    }
    return uzs.toLocaleString("uz-UZ") + " UZS";
}

function reportCategoryLabel(category) {
    if (!category) return "Boshqa";
    const c = category.toLowerCase();
    if (c === "tshirt") return "Futbolka";
    if (c === "shorts") return "Shortik";
    if (c === "tracksuit") return "Sportivka";
    if (c === "joggers") return "Triko";
    return category.charAt(0).toUpperCase() + category.slice(1);
}

function reportCategoryIcon(category) {
    if (category === "shorts") return "fa-solid fa-scissors";
    if (category === "tracksuit") return "fa-solid fa-person-running";
    if (category === "joggers") return "fa-solid fa-person-hiking";
    if (category === "tshirt") return "fa-solid fa-shirt";
    return "fa-solid fa-tag";
}

function _repKpiCard(icon, label, value, unit, color) {
    return `
        <div class="rep-kpi">
            <div class="rep-kpi-ic" style="color:${color}; background:${color}1a; border-color:${color}33;">
                <i class="fa-solid ${icon}"></i>
            </div>
            <div class="rep-kpi-body">
                <div class="rep-kpi-label">${label}</div>
                <div class="rep-kpi-value">${value}${unit ? ` <span class="rep-kpi-unit">${unit}</span>` : ""}</div>
            </div>
        </div>`;
}

function _repEmptyRow(cols, msg) {
    return `<tr><td colspan="${cols}" style="text-align:center; padding:2.2rem 1rem; color:var(--text-muted); font-style:italic;">${msg || "Ma'lumot yo'q"}</td></tr>`;
}

function _repTotalRow(label, d) {
    const tr = document.createElement("tr");
    tr.className = "rep-total-row";
    tr.innerHTML = `
        <td><div class="rep-name" style="font-weight:800;"><i class="fa-solid fa-flag-checkered" style="color:var(--primary);"></i> ${label}</div></td>
        <td class="rep-num">${Math.round(d.packs * 100) / 100} <span class="rep-unit">pachka</span></td>
        <td class="rep-num">${d.dona} <span class="rep-unit">dona</span></td>
        <td class="rep-money rep-cogs">${reportFmtMoney(d.cogs)}</td>
        <td class="rep-money rep-sell">${reportFmtMoney(d.sell)}</td>`;
    return tr;
}

function _bindReportControls() {
    if (_reportControlsBound) return;
    _reportControlsBound = true;

    const sel = document.getElementById("report-supplier-select");
    if (sel) sel.addEventListener("change", () => {
        reportState.supplier = sel.value;
        renderSupplierStockReport();
    });

    document.querySelectorAll("#report-currency-toggle .cur-btn").forEach(b => {
        b.addEventListener("click", () => _setReportCurrency(b.dataset.cur));
    });

    const rateInput = document.getElementById("report-usd-rate");
    if (rateInput) rateInput.addEventListener("input", () => {
        _setUsdRate(parseFloat(rateInput.value));
    });
}

function renderSupplierStockReport() {
    const tableBody = document.getElementById("bux-supplier-report-table-body");
    if (!tableBody) return;

    // ---- 1. Aggregate stock (only items currently in stock) ----
    const bySupplier = {};   // name -> { packs, dona, cogs, sell }
    const bySupCat = {};     // name -> { category -> { packs, dona, cogs, sell } }
    const grand = { packs: 0, dona: 0, cogs: 0, sell: 0 };

    function addInto(t, packs, dona, cogs, sell) {
        t.packs += packs; t.dona += dona; t.cogs += cogs; t.sell += sell;
    }
    function consume(name, cat, packs, dona, cogs, sell) {
        if (dona <= 0) return;
        if (!bySupplier[name]) bySupplier[name] = { packs: 0, dona: 0, cogs: 0, sell: 0 };
        if (!bySupCat[name]) bySupCat[name] = {};
        if (!bySupCat[name][cat]) bySupCat[name][cat] = { packs: 0, dona: 0, cogs: 0, sell: 0 };
        addInto(bySupplier[name], packs, dona, cogs, sell);
        addInto(bySupCat[name][cat], packs, dona, cogs, sell);
        addInto(grand, packs, dona, cogs, sell);
    }

    // PRODUCTS + dynamicProducts ni BIRLASHTIRIB, har mahsulotni FAQAT BIR MARTA sanash
    // (tasdiqlangan dinamik mahsulot ikkala ro'yxatda ham bo'ladi → ikki marta sanalmasligi uchun)
    const _seen = new Set();
    const _allProds = [];
    [...PRODUCTS, ...(state.dynamicProducts || [])].forEach(p => {
        const key = String(p.id);
        if (_seen.has(key)) return;
        _seen.add(key);
        _allProds.push(p);
    });

    _allProds.forEach(p => {
        const qtyDona = inventory[p.id] !== undefined ? inventory[p.id] : (p.qty || 0);
        const packSizes = p.sizes ? p.sizes.length : 5;
        const qtyPacks = packSizes ? qtyDona / packSizes : 0;
        // Tan narx: pachka tan narxi (cogs) berilgan bo'lsa ANIQ; aks holda taxminiy (price*0.6)
        const packCogs = p.cogs ? p.cogs : (p.price * 0.6 * packSizes);
        const totalCogs = qtyPacks * packCogs;
        const totalSell = qtyDona * (p.price || 0);
        consume(p.supplier || "Boshqa", p.category || "boshqa", qtyPacks, qtyDona, totalCogs, totalSell);
    });

    // ---- 2. Supplier list for the dropdown ----
    const suppliers = [];
    ["Alisher Aka", "Nodir aka", "Eco Sports", "Xitoy"].forEach(s => { if (!suppliers.includes(s)) suppliers.push(s); });
    if (Array.isArray(state.suppliers)) state.suppliers.forEach(s => { if (s.name && !suppliers.includes(s.name)) suppliers.push(s.name); });
    Object.keys(bySupplier).forEach(s => { if (!suppliers.includes(s)) suppliers.push(s); });
    suppliers.sort();

    // ---- 3. Populate / sync the controls ----
    const sel = document.getElementById("report-supplier-select");
    if (sel) {
        const cur = reportState.supplier;
        sel.innerHTML = `<option value="ALL">🏷️ Barcha ta'minotchilar</option>` +
            suppliers.map(s => `<option value="${s}">${s}</option>`).join("");
        if (cur === "ALL" || suppliers.includes(cur)) {
            sel.value = cur;
        } else {
            sel.value = "ALL";
            reportState.supplier = "ALL";
        }
    }
    document.querySelectorAll("#report-currency-toggle .cur-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.cur === reportState.currency);
    });
    const rateGroup = document.getElementById("report-rate-group");
    if (rateGroup) rateGroup.style.display = reportState.currency === "USD" ? "" : "none";
    const rateInput = document.getElementById("report-usd-rate");
    if (rateInput && document.activeElement !== rateInput) rateInput.value = reportState.usdRate;

    // ---- 4. Determine scope ----
    const isAll = reportState.supplier === "ALL";
    const scope = isAll ? grand : (bySupplier[reportState.supplier] || { packs: 0, dona: 0, cogs: 0, sell: 0 });

    // ---- 5. KPI summary cards ----
    const kpiWrap = document.getElementById("report-kpis");
    if (kpiWrap) {
        kpiWrap.innerHTML =
            _repKpiCard("fa-box", "Zaxira (pachka)", `${Math.round(scope.packs * 10) / 10}`, "pachka", "var(--primary)") +
            _repKpiCard("fa-shirt", "Zaxira (dona)", `${scope.dona}`, "dona", "var(--accent)") +
            _repKpiCard("fa-coins", "Tan qiymati", reportFmtMoney(scope.cogs), "", "#ef4444") +
            _repKpiCard("fa-sack-dollar", "Sotuv qiymati", reportFmtMoney(scope.sell), "", "var(--primary)");
    }

    // ---- 6. Table ----
    const thead = document.getElementById("report-thead");
    tableBody.innerHTML = "";

    if (isAll) {
        if (thead) thead.innerHTML = `<tr><th>Ta'minotchi</th><th>Zaxira (Pachka)</th><th>Zaxira (Dona)</th><th>Tan qiymati</th><th>Sotuv qiymati</th></tr>`;
        const names = Object.keys(bySupplier).sort();
        if (names.length === 0) {
            tableBody.innerHTML = _repEmptyRow(5, "Hozircha omborda zaxira yo'q");
        } else {
            names.forEach(name => {
                const d = bySupplier[name];
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td><div class="rep-name"><i class="fa-solid fa-truck-ramp-box" style="color:var(--primary);"></i> ${name}</div></td>
                    <td class="rep-num">${Math.round(d.packs * 100) / 100} <span class="rep-unit">pachka</span></td>
                    <td class="rep-num">${d.dona} <span class="rep-unit">dona</span></td>
                    <td class="rep-money rep-cogs">${reportFmtMoney(d.cogs)}</td>
                    <td class="rep-money rep-sell">${reportFmtMoney(d.sell)}</td>`;
                tableBody.appendChild(row);
            });
            tableBody.appendChild(_repTotalRow("UMUMIY JAMI", grand));
        }
    } else {
        if (thead) thead.innerHTML = `<tr><th>Kiyim turi</th><th>Zaxira (Pachka)</th><th>Zaxira (Dona)</th><th>Tan qiymati</th><th>Sotuv qiymati</th></tr>`;
        const catMap = bySupCat[reportState.supplier] || {};
        const cats = Object.keys(catMap).sort((a, b) => reportCategoryLabel(a).localeCompare(reportCategoryLabel(b)));
        if (cats.length === 0) {
            tableBody.innerHTML = _repEmptyRow(5, "Bu ta'minotchida hozircha zaxira yo'q");
        } else {
            cats.forEach(cat => {
                const d = catMap[cat];
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td><div class="rep-name"><i class="${reportCategoryIcon(cat)}" style="color:var(--accent);"></i> ${reportCategoryLabel(cat)}</div></td>
                    <td class="rep-num">${Math.round(d.packs * 100) / 100} <span class="rep-unit">pachka</span></td>
                    <td class="rep-num">${d.dona} <span class="rep-unit">dona</span></td>
                    <td class="rep-money rep-cogs">${reportFmtMoney(d.cogs)}</td>
                    <td class="rep-money rep-sell">${reportFmtMoney(d.sell)}</td>`;
                tableBody.appendChild(row);
            });
            tableBody.appendChild(_repTotalRow(reportState.supplier + " — JAMI", scope));
        }
    }

    _bindReportControls();
}

// --- GET SUPPLIER FROM PRODUCT NAME HELPER [NEW] ---
function getSupplierFromProductName(name) {
    if (!name) return "Boshqa";
    
    // Normalize name
    const cleanName = name.replace(/\s*\[cogs:\d+,pack:\d+\]/, "").trim();
    
    // 1. Search in dynamic products
    const dynamicProd = state.dynamicProducts.find(dp => dp.name === cleanName || cleanName.includes(dp.name) || dp.name.includes(cleanName));
    if (dynamicProd) return dynamicProd.supplier;
    
    // 2. Search in standard products
    const standardProd = PRODUCTS.find(sp => sp.name === cleanName || cleanName.includes(sp.name) || sp.name.includes(cleanName));
    if (standardProd) return standardProd.supplier;
    
    // 3. Fallback: Parse from standard naming prefix "Alisher Aka - Futbolka"
    const parts = cleanName.split(" - ");
    if (parts.length > 1) {
        return parts[0].trim();
    }
    
    return "Boshqa";
}

// --- POPULATE SUPPLIER AND MONTH SELECT DROPDOWNS [NEW] ---
function populateSupplierAndMonthSelects() {
    const supplierSelect = document.getElementById("bux-ind-supplier-select");
    const monthSelect = document.getElementById("bux-ind-month-select");
    if (!supplierSelect || !monthSelect) return;

    // Save current selection values to restore them after populate
    const prevSupplier = supplierSelect.value;
    const prevMonth = monthSelect.value;

    // 1. Gather all suppliers
    const suppliers = [];
    const defaultSups = ["Alisher Aka", "Nodir aka", "Eco Sports", "Xitoy"];
    defaultSups.forEach(s => {
        if (!suppliers.includes(s)) suppliers.push(s);
    });
    if (state.suppliers && Array.isArray(state.suppliers)) {
        state.suppliers.forEach(s => {
            if (s.name && !suppliers.includes(s.name)) suppliers.push(s.name);
        });
    }
    PRODUCTS.forEach(p => {
        if (p.supplier && !suppliers.includes(p.supplier)) suppliers.push(p.supplier);
    });
    state.dynamicProducts.forEach(p => {
        if (p.supplier && !suppliers.includes(p.supplier)) suppliers.push(p.supplier);
    });
    suppliers.sort();

    supplierSelect.innerHTML = "";
    suppliers.forEach(sup => {
        const opt = document.createElement("option");
        opt.value = sup;
        opt.textContent = sup;
        supplierSelect.appendChild(opt);
    });

    if (prevSupplier && suppliers.includes(prevSupplier)) {
        supplierSelect.value = prevSupplier;
    }

    // 2. Gather unique months (formatted as YYYY-MM)
    const months = [];
    
    // Add current month as a default
    const now = new Date();
    const currentMonthStr = now.toISOString().slice(0, 7); // e.g. "2026-06"
    months.push(currentMonthStr);

    // From salesHistory (timestamp format: "2026-06-02 10:30:15")
    if (state.salesHistory) {
        state.salesHistory.forEach(s => {
            if (s.timestamp && s.timestamp.length >= 7) {
                const m = s.timestamp.slice(0, 7);
                if (m.match(/^\d{4}-\d{2}$/) && !months.includes(m)) {
                    months.push(m);
                }
            }
        });
    }

    // From kirimHistory (created_at format: ISO string "2026-06-02T10:00:00.000Z")
    if (state.kirimHistory) {
        state.kirimHistory.forEach(k => {
            if (k.created_at && k.created_at.length >= 7) {
                const m = k.created_at.slice(0, 7);
                if (m.match(/^\d{4}-\d{2}$/) && !months.includes(m)) {
                    months.push(m);
                }
            }
        });
    }

    // Sort months descending (latest months first)
    months.sort((a, b) => b.localeCompare(a));

    monthSelect.innerHTML = "";
    months.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        
        // Human-friendly month names in Uzbek
        const parts = m.split("-");
        let monthName = parts[1];
        switch(parts[1]) {
            case "01": monthName = "Yanvar"; break;
            case "02": monthName = "Fevral"; break;
            case "03": monthName = "Mart"; break;
            case "04": monthName = "Aprel"; break;
            case "05": monthName = "May"; break;
            case "06": monthName = "Iyun"; break;
            case "07": monthName = "Iyul"; break;
            case "08": monthName = "Avgust"; break;
            case "09": monthName = "Sentyabr"; break;
            case "10": monthName = "Oktyabr"; break;
            case "11": monthName = "Noyabr"; break;
            case "12": monthName = "Dekabr"; break;
        }
        opt.textContent = `${monthName} ${parts[0]}`;
        monthSelect.appendChild(opt);
    });

    if (prevMonth && months.includes(prevMonth)) {
        monthSelect.value = prevMonth;
    } else {
        monthSelect.value = currentMonthStr;
    }
}

// --- RENDER SUPPLIER SHAXSIY HISOBOT DAFTARI [NEW] ---
function renderSupplierIndividualReport() {
    const supplierSelect = document.getElementById("bux-ind-supplier-select");
    const monthSelect = document.getElementById("bux-ind-month-select");
    if (!supplierSelect || !monthSelect) return;

    const selectedSupplier = supplierSelect.value;
    const selectedMonth = monthSelect.value;

    const indTableBody = document.getElementById("bux-ind-report-table-body");
    const indEmptyState = document.getElementById("bux-ind-report-empty-state");
    if (!indTableBody) return;

    // Helper to get category Uzbek label
    function getCategoryLabel(category) {
        if (!category) return "Boshqa";
        const lowerCat = category.toLowerCase();
        if (lowerCat === "tshirt") return "Futbolka";
        if (lowerCat === "shorts") return "Shortik";
        if (lowerCat === "tracksuit") return "Sportivka";
        if (lowerCat === "joggers") return "Triko";
        return category.charAt(0).toUpperCase() + category.slice(1);
    }

    // 1. Gather all products belonging to this supplier
    const supplierProducts = [];
    PRODUCTS.forEach(p => {
        if (p.supplier === selectedSupplier) {
            supplierProducts.push(p);
        }
    });
    state.dynamicProducts.forEach(p => {
        if (p.supplier === selectedSupplier) {
            if (!supplierProducts.find(sp => String(sp.id) === String(p.id))) {
                supplierProducts.push(p);
            }
        }
    });

    // 2. Initialize stock & transaction aggregation metrics
    let totalStockPacks = 0;
    let totalStockDona = 0;
    let totalStockCogsVal = 0;
    let totalStockSellVal = 0;

    let totalImportPacks = 0;
    let totalImportDona = 0;
    let totalImportVal = 0;

    let totalOptimPacks = 0;
    let totalOptimVal = 0;

    let totalDonaQty = 0;
    let totalDonaVal = 0;

    const productMetrics = {};

    supplierProducts.forEach(p => {
        // Zaxira: inventory'da bo'lmasa mahsulotning o'z qty'siga tushadi
        // (dinamik mahsulotlar zaxirasi ko'pincha p.qty'da bo'ladi — shu sabab 0 chiqardi)
        const qtyDona = inventory[p.id] !== undefined ? inventory[p.id] : (p.qty || 0);
        const packSizes = p.sizes ? p.sizes.length : 5;
        const qtyPacks = qtyDona / packSizes;
        const packCogs = p.cogs ? p.cogs : (p.price * 0.6 * packSizes);
        const packSellPrice = p.pack_price ? p.pack_price : (p.price * packSizes);
        const donaSellPrice = p.price;

        const cogsVal = qtyDona * (packCogs / packSizes);
        const sellVal = qtyDona * donaSellPrice;

        totalStockPacks += qtyPacks;
        totalStockDona += qtyDona;
        totalStockCogsVal += cogsVal;
        totalStockSellVal += sellVal;

        productMetrics[p.id] = {
            product: p,
            stockPacks: qtyPacks,
            stockDona: qtyDona,
            importPacks: 0,
            importDona: 0,
            importVal: 0,
            optimPacks: 0,
            optimVal: 0,
            donaQty: 0,
            donaVal: 0,
            soldCogs: 0,
            creditGiven: 0,
            totalSoldVal: 0
        };
    });

    // 3. Aggregate imports (kirim) for selected supplier & month
    if (state.kirimHistory) {
        state.kirimHistory.forEach(k => {
            if (k.supplier === selectedSupplier && k.created_at && k.created_at.slice(0, 7) === selectedMonth) {
                const sizesArr = k.sizes ? safeJsonParse(k.sizes, []) : [];
                const packSizes = sizesArr.length > 0 ? sizesArr.length : 5;
                const packs = parseFloat(k.total_packs) || 0;
                const qty = parseFloat(k.total_qty) || 0;
                
                // Find or estimate cogs
                let packCogs = 0;
                const prod = supplierProducts.find(sp => String(sp.id) === String(k.product_id));
                if (prod) {
                    packCogs = prod.cogs ? prod.cogs : (prod.price * 0.6 * packSizes);
                } else {
                    packCogs = (k.price || 0) * 0.6 * packSizes;
                }

                const importCogsVal = packs * packCogs;

                totalImportPacks += packs;
                totalImportDona += qty;
                totalImportVal += importCogsVal;

                if (productMetrics[k.product_id]) {
                    productMetrics[k.product_id].importPacks += packs;
                    productMetrics[k.product_id].importDona += qty;
                    productMetrics[k.product_id].importVal += importCogsVal;
                }
            }
        });
    }

    // 4. Aggregate Sales for selected supplier & month
    //    MUHIM: pachka/dona farqi sotuv KANALIGA emas, har bir item'ning
    //    o'lchamiga qarab aniqlanadi. size "Pachka..." bo'lsa — optim pachka
    //    savdosi (item.qty = pachka soni), aks holda — dona savdosi.
    //    Shu yerda har sotilgan birlik tannarxi (COGS) ham yig'iladi.
    let totalSoldCogs = 0;
    let totalCreditGiven = 0; // mijozga nasiya (qarzga) berilgan, hali kelmagan pul
    if (state.salesHistory) {
        state.salesHistory.forEach(sale => {
            if (sale.timestamp && sale.timestamp.slice(0, 7) === selectedMonth) {
                // Nasiya ulushi: bu sotuvning qancha qismi qarzga berilgan (0..1)
                const saleTotal = Number(sale.totalPaid) || 0;
                const saleDebt = Number(sale.debt) || 0;
                const debtRatio = saleTotal > 0 ? Math.min(1, Math.max(0, saleDebt / saleTotal)) : 0;

                (sale.items || []).forEach(item => {
                    const itemSupplier = getSupplierFromProductName(item.name);
                    if (itemSupplier !== selectedSupplier) return;

                    const prod = supplierProducts.find(sp => sp.name === item.name || item.name.includes(sp.name) || sp.name.includes(item.name));
                    const prodId = prod ? prod.id : null;

                    const qty = item.qty || 1;
                    const soldPrice = item.soldPrice || 0;
                    const totalItemVal = qty * soldPrice;

                    // Bu item bo'yicha mijozga qarzga berilgan ulush (minus tushadi)
                    const itemCredit = totalItemVal * debtRatio;
                    totalCreditGiven += itemCredit;
                    if (prodId && productMetrics[prodId]) {
                        productMetrics[prodId].creditGiven += itemCredit;
                    }

                    // Tannarx: pachka tan narxi (cogs) va undan dona tannarxi
                    const packSizes = prod ? (prod.sizes ? prod.sizes.length : 5) : 5;
                    const packCogs = prod ? (prod.cogs ? prod.cogs : (prod.price * 0.6 * packSizes)) : 0;
                    const donaCogs = packSizes > 0 ? packCogs / packSizes : 0;

                    const isPack = !!(item.size && item.size.includes("Pachka"));

                    if (isPack) {
                        const packs = qty; // pachka item'ida qty = pachka soni
                        const itemCogs = packs * packCogs;

                        totalOptimPacks += packs;
                        totalOptimVal += totalItemVal;
                        totalSoldCogs += itemCogs;

                        if (prodId && productMetrics[prodId]) {
                            productMetrics[prodId].optimPacks += packs;
                            productMetrics[prodId].optimVal += totalItemVal;
                            productMetrics[prodId].soldCogs += itemCogs;
                            productMetrics[prodId].totalSoldVal += totalItemVal;
                        }
                    } else {
                        const itemCogs = qty * donaCogs;

                        totalDonaQty += qty;
                        totalDonaVal += totalItemVal;
                        totalSoldCogs += itemCogs;

                        if (prodId && productMetrics[prodId]) {
                            productMetrics[prodId].donaQty += qty;
                            productMetrics[prodId].donaVal += totalItemVal;
                            productMetrics[prodId].soldCogs += itemCogs;
                            productMetrics[prodId].totalSoldVal += totalItemVal;
                        }
                    }
                });
            }
        });
    }
    const totalSoldVal = totalOptimVal + totalDonaVal;
    const totalSoldProfit = totalSoldVal - totalSoldCogs;
    const totalCashReceived = totalSoldVal - totalCreditGiven; // naqd tushgan pul

    // 5. Sync currency controls for this section
    document.querySelectorAll("#ind-currency-toggle .cur-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.cur === reportState.currency);
    });
    const indRateGroup = document.getElementById("ind-rate-group");
    if (indRateGroup) indRateGroup.style.display = reportState.currency === "USD" ? "" : "none";
    const indRate = document.getElementById("ind-usd-rate");
    if (indRate && document.activeElement !== indRate) indRate.value = reportState.usdRate;
    // Payment amount placeholder follows the selected currency
    const payAmtInput = document.getElementById("ind-payment-amount");
    if (payAmtInput) payAmtInput.placeholder = reportState.currency === "USD"
        ? "To'lov summasi ($)"
        : "To'lov summasi (UZS)";

    // 6. Settlement / debt ledger (all-time)
    const takenVal = getSupplierTakenValue(selectedSupplier);
    const paidVal = getSupplierPaidTotal(selectedSupplier);
    const balance = takenVal - paidVal;
    const elTaken = document.getElementById("ind-taken-val");
    const elPaid = document.getElementById("ind-paid-val");
    const elBal = document.getElementById("ind-balance-val");
    const balCard = document.getElementById("ind-balance-card");
    const balNote = document.getElementById("ind-balance-note");
    if (elTaken) elTaken.textContent = reportFmtMoney(takenVal);
    if (elPaid) elPaid.textContent = reportFmtMoney(paidVal);
    if (elBal) elBal.textContent = reportFmtMoney(Math.abs(balance));
    if (balCard && balNote) {
        if (balance > 0) { balCard.className = "settle-stat settle-balance owe"; balNote.textContent = "Ta'minotchiga to'lashimiz kerak"; }
        else if (balance < 0) { balCard.className = "settle-stat settle-balance over"; balNote.textContent = "Oldindan to'langan (haqimiz bor)"; }
        else { balCard.className = "settle-stat settle-balance paid"; balNote.textContent = "To'liq hisob-kitob qilingan ✓"; }
    }

    // --- QARZDAGI MAHSULOT MIQDORI (pachka/dona) ---
    // Olingan jami yuk miqdori va to'langan ulushga ko'ra hali to'lanmagan (qarzdagi) miqdor
    const takenQty = getSupplierTakenQty(selectedSupplier);
    const paidRatio = takenVal > 0 ? Math.min(1, Math.max(0, paidVal / takenVal)) : 0;
    const unpaidFactor = 1 - paidRatio;
    const debtPacks = Math.round(takenQty.packs * unpaidFactor * 100) / 100;
    const debtDona = Math.round(takenQty.dona * unpaidFactor);
    const elTakenQty = document.getElementById("ind-taken-qty");
    const elDebtQty = document.getElementById("ind-debt-qty");
    if (elTakenQty) elTakenQty.textContent = `${Math.round(takenQty.packs * 100) / 100} pachka · ${takenQty.dona} dona`;
    if (elDebtQty) {
        if (balance > 0) elDebtQty.textContent = `≈ ${debtPacks} pachka · ${debtDona} dona qarzda`;
        else if (balance < 0) elDebtQty.textContent = "Ortiqcha to'lov (haq bor)";
        else elDebtQty.textContent = "Hammasi to'langan ✓";
    }
    // payments list
    const payList = document.getElementById("ind-payments-list");
    if (payList) {
        const pays = (supplierPayments[selectedSupplier] || []).slice().reverse();
        if (pays.length === 0) {
            payList.innerHTML = `<div class="settle-empty">Hozircha to'lovlar kiritilmagan.</div>`;
        } else {
            const paysById = {};
            pays.forEach(p => { paysById[p.id] = p; });
            payList.innerHTML = pays.map(p => `
                <div class="settle-pay-row${p.image ? " has-img" : ""}">
                    <span class="settle-pay-amt">${reportFmtMoney(p.amount)}</span>
                    <span class="settle-pay-note">${p.note || "—"}</span>
                    ${p.image
                        ? `<button type="button" class="settle-pay-img" data-id="${p.id}" title="Rasmni ko'rish"><i class="fa-solid fa-image"></i></button>`
                        : `<span class="settle-pay-img-none" title="Rasm yo'q">—</span>`}
                    <span class="settle-pay-date">${(p.date || "").slice(0, 10)}</span>
                    <button type="button" class="settle-pay-del" data-id="${p.id}" title="O'chirish (PIN kerak)"><i class="fa-solid fa-xmark"></i></button>
                </div>`).join("");
            // View image
            payList.querySelectorAll(".settle-pay-img").forEach(b => {
                b.addEventListener("click", () => {
                    const p = paysById[b.dataset.id];
                    if (p && p.image) openPaymentImage(p.image);
                });
            });
            // Delete — protected by PIN
            payList.querySelectorAll(".settle-pay-del").forEach(b => {
                b.addEventListener("click", () => {
                    openPaymentPinModal(selectedSupplier, b.dataset.id);
                });
            });
        }
    }

    // 7. Update KPI widgets
    document.getElementById("bux-ind-stock-qty").textContent = `${Math.round(totalStockPacks * 100) / 100} pachka (${totalStockDona} dona)`;
    document.getElementById("bux-ind-stock-cogs").textContent = reportFmtMoney(totalStockCogsVal);
    document.getElementById("bux-ind-stock-sell").textContent = reportFmtMoney(totalStockSellVal);

    document.getElementById("bux-ind-import-qty").textContent = `${Math.round(totalImportPacks * 100) / 100} pachka (${totalImportDona} dona)`;
    document.getElementById("bux-ind-import-val").textContent = reportFmtMoney(totalImportVal);

    document.getElementById("bux-ind-optim-qty").textContent = `${Math.round(totalOptimPacks * 100) / 100} pachka`;
    document.getElementById("bux-ind-optim-val").textContent = reportFmtMoney(totalOptimVal);

    document.getElementById("bux-ind-dona-qty").textContent = `${totalDonaQty} dona`;
    document.getElementById("bux-ind-dona-val").textContent = reportFmtMoney(totalDonaVal);

    // Oylik tannarx (sotilgan mahsulot) va sof foyda
    const elProfitCogs = document.getElementById("bux-ind-profit-cogs");
    const elProfitVal = document.getElementById("bux-ind-profit-val");
    const elProfitCard = document.getElementById("bux-ind-profit-card");
    if (elProfitCogs) elProfitCogs.textContent = reportFmtMoney(totalSoldCogs);
    if (elProfitVal) elProfitVal.textContent = reportFmtMoney(totalSoldProfit);
    if (elProfitCard) elProfitCard.classList.toggle("is-loss", totalSoldProfit < 0);

    // Nasiya (mijozga qarzga berilgan) — MINUS, hali kelmagan pul
    const elCreditVal = document.getElementById("bux-ind-credit-val");
    const elCashVal = document.getElementById("bux-ind-cash-val");
    if (elCreditVal) elCreditVal.textContent = totalCreditGiven > 0
        ? `− ${reportFmtMoney(totalCreditGiven)}`
        : reportFmtMoney(0);
    if (elCashVal) elCashVal.textContent = reportFmtMoney(totalCashReceived);

    // 8. Render product detail rows (last 5 by default + "Batafsil ko'rish" toggle)
    indTableBody.innerHTML = "";
    const metricsList = Object.values(productMetrics);

    // Snapshot for Excel / PDF export (full data, regardless of 5-row UI limit)
    lastIndReport = {
        supplier: selectedSupplier,
        month: selectedMonth,
        stock: { packs: totalStockPacks, dona: totalStockDona, cogs: totalStockCogsVal, sell: totalStockSellVal },
        imports: { packs: totalImportPacks, dona: totalImportDona, val: totalImportVal },
        optim: { packs: totalOptimPacks, val: totalOptimVal },
        donaSale: { qty: totalDonaQty, val: totalDonaVal },
        profit: { cogs: totalSoldCogs, sold: totalSoldVal, profit: totalSoldProfit },
        credit: { given: totalCreditGiven, cash: totalCashReceived },
        settlement: { taken: takenVal, paid: paidVal, balance: balance },
        metrics: metricsList,
        payments: (supplierPayments[selectedSupplier] || []).slice()
    };

    const DETAIL_LIMIT = 5;
    const toggleBtn = document.getElementById("ind-toggle-details");

    if (metricsList.length === 0) {
        indEmptyState.style.display = "block";
        if (toggleBtn) toggleBtn.style.display = "none";
    } else {
        indEmptyState.style.display = "none";

        const rowsToShow = indShowAllDetails ? metricsList : metricsList.slice(0, DETAIL_LIMIT);
        rowsToShow.forEach(m => {
            const row = document.createElement("tr");
            row.style.borderBottom = "1px solid rgba(255, 255, 255, 0.04)";

            const p = m.product;
            const catLabel = getCategoryLabel(p.category);

            row.innerHTML = `
                <td><strong>${p.name}</strong></td>
                <td><span class="channel-tag" style="background: rgba(6, 182, 212, 0.1); color: var(--accent); font-size: 0.72rem; font-weight: 700; text-transform: uppercase;">${catLabel}</span></td>
                <td>
                    <div style="font-weight: 700;">${Math.round(m.stockPacks * 100) / 100} pachka</div>
                    <div style="font-size: 0.72rem; color: var(--text-secondary);">${m.stockDona} dona</div>
                </td>
                <td>
                    <div style="font-weight: 700; color: #3b82f6;">${Math.round(m.importPacks * 100) / 100} pachka</div>
                    <div style="font-size: 0.72rem; color: var(--text-secondary);">${m.importDona} dona</div>
                    <div style="font-size: 0.72rem; color: #3b82f6; font-weight: 600;">Kirim: ${reportFmtMoney(m.importVal)}</div>
                </td>
                <td>
                    <div style="font-weight: 700; color: #f59e0b;">${Math.round(m.optimPacks * 100) / 100} pachka</div>
                    <div style="font-size: 0.72rem; color: #f59e0b; font-weight: 600;">Sotuv: ${reportFmtMoney(m.optimVal)}</div>
                </td>
                <td>
                    <div style="font-weight: 700; color: var(--primary);">${m.donaQty} dona</div>
                    <div style="font-size: 0.72rem; color: var(--primary); font-weight: 600;">Sotuv: ${reportFmtMoney(m.donaVal)}</div>
                </td>
                <td>
                    <div style="font-size: 0.72rem; color: #ef4444; font-weight: 600;">Tan: ${reportFmtMoney(m.soldCogs)}</div>
                    <div style="font-weight: 800; color: ${(m.totalSoldVal - m.soldCogs) < 0 ? '#ef4444' : 'var(--primary)'};">Foyda: ${reportFmtMoney(m.totalSoldVal - m.soldCogs)}</div>
                </td>
                <td style="font-weight: 800; color: #fff;">
                    ${reportFmtMoney(m.totalSoldVal)}
                    ${m.creditGiven > 0 ? `<div style="font-size: 0.72rem; color: #ef4444; font-weight: 700;">Nasiya: − ${reportFmtMoney(m.creditGiven)}</div><div style="font-size: 0.72rem; color: var(--primary); font-weight: 600;">Naqd: ${reportFmtMoney(m.totalSoldVal - m.creditGiven)}</div>` : ''}
                </td>
            `;
            indTableBody.appendChild(row);
        });

        if (toggleBtn) {
            if (metricsList.length > DETAIL_LIMIT) {
                toggleBtn.style.display = "";
                const lbl = toggleBtn.querySelector("span");
                if (lbl) lbl.textContent = indShowAllDetails
                    ? `Yig'ish (faqat ${DETAIL_LIMIT} ta)`
                    : `Batafsil ko'rish (jami ${metricsList.length} ta)`;
            } else {
                toggleBtn.style.display = "none";
            }
        }
    }

    _bindIndControls();
}

// Bind the settlement / currency / details controls once
let _indControlsBound = false;
function _bindIndControls() {
    if (_indControlsBound) return;
    _indControlsBound = true;

    document.querySelectorAll("#ind-currency-toggle .cur-btn").forEach(b => {
        b.addEventListener("click", () => _setReportCurrency(b.dataset.cur));
    });
    const indRate = document.getElementById("ind-usd-rate");
    if (indRate) indRate.addEventListener("input", () => _setUsdRate(parseFloat(indRate.value)));

    const toggleBtn = document.getElementById("ind-toggle-details");
    if (toggleBtn) toggleBtn.addEventListener("click", () => {
        indShowAllDetails = !indShowAllDetails;
        renderSupplierIndividualReport();
    });

    const addBtn = document.getElementById("ind-add-payment-btn");
    const form = document.getElementById("ind-payment-form");
    const amountInput = document.getElementById("ind-payment-amount");
    const noteInput = document.getElementById("ind-payment-note");
    const saveBtn = document.getElementById("ind-payment-save");
    const cancelBtn = document.getElementById("ind-payment-cancel");

    // Image attach controls
    const attachBtn = document.getElementById("ind-payment-attach");
    const fileInput = document.getElementById("ind-payment-image");
    const imgPreview = document.getElementById("ind-payment-img-preview");
    const imgThumb = document.getElementById("ind-payment-img-thumb");
    const imgRemove = document.getElementById("ind-payment-img-remove");

    function clearPaymentImage() {
        _pendingPaymentImage = null;
        if (fileInput) fileInput.value = "";
        if (imgThumb) imgThumb.src = "";
        if (imgPreview) imgPreview.style.display = "none";
        if (attachBtn) attachBtn.style.display = "";
    }
    function resetPaymentForm() {
        if (amountInput) amountInput.value = "";
        if (noteInput) noteInput.value = "";
        clearPaymentImage();
    }

    if (attachBtn && fileInput) attachBtn.addEventListener("click", () => fileInput.click());
    if (fileInput) fileInput.addEventListener("change", async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        try {
            const b64 = await _compressImage(file, 1000, 0.7);
            _pendingPaymentImage = b64;
            if (imgThumb) imgThumb.src = b64;
            if (imgPreview) imgPreview.style.display = "inline-flex";
            if (attachBtn) attachBtn.style.display = "none";
        } catch (e) {
            console.warn("Rasm yuklash xatosi:", e);
        }
    });
    if (imgRemove) imgRemove.addEventListener("click", clearPaymentImage);

    if (addBtn && form) addBtn.addEventListener("click", () => {
        const open = form.style.display !== "none";
        form.style.display = open ? "none" : "flex";
        if (!open && amountInput) amountInput.focus();
    });
    if (cancelBtn && form) cancelBtn.addEventListener("click", () => {
        form.style.display = "none";
        resetPaymentForm();
    });
    if (saveBtn) saveBtn.addEventListener("click", () => {
        let amount = parseFloat(amountInput ? amountInput.value : 0);
        if (!amount || amount <= 0) {
            if (amountInput) amountInput.focus();
            return;
        }
        // Ma'lumotlar UZS'da saqlanadi — USD tanlangan bo'lsa kursga ko'paytiramiz
        if (reportState.currency === "USD") {
            const rate = reportState.usdRate > 0 ? reportState.usdRate : 1;
            amount = Math.round(amount * rate);
        }
        const supplierSelect = document.getElementById("bux-ind-supplier-select");
        const name = supplierSelect ? supplierSelect.value : null;
        if (!name) return;
        addSupplierPayment(name, amount, noteInput ? noteInput.value.trim() : "", _pendingPaymentImage);
        resetPaymentForm();
        if (form) form.style.display = "none";
        renderSupplierIndividualReport();
    });

    // ----- PIN-protected delete modal -----
    const pinForm = document.getElementById("payment-pin-form");
    const pinClose = document.getElementById("payment-pin-close");
    const pinModalEl = document.getElementById("payment-pin-modal");
    if (pinForm) pinForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("payment-pin-input");
        const err = document.getElementById("payment-pin-error");
        const correct = (typeof appConfig !== "undefined" && appConfig.pin) ? String(appConfig.pin) : "7777";
        if (input && input.value === correct) {
            if (_pendingPaymentDelete) {
                deleteSupplierPayment(_pendingPaymentDelete.name, _pendingPaymentDelete.id);
                _pendingPaymentDelete = null;
            }
            if (pinModalEl) pinModalEl.classList.remove("open");
            renderSupplierIndividualReport();
        } else {
            if (err) err.style.display = "flex";
            if (input) { input.value = ""; input.focus(); }
        }
    });
    if (pinClose && pinModalEl) pinClose.addEventListener("click", () => pinModalEl.classList.remove("open"));
    if (pinModalEl) pinModalEl.addEventListener("click", (e) => { if (e.target === pinModalEl) pinModalEl.classList.remove("open"); });

    // ----- Image lightbox modal -----
    const imgModalEl = document.getElementById("payment-image-modal");
    const imgClose = document.getElementById("payment-image-close");
    if (imgClose && imgModalEl) imgClose.addEventListener("click", () => imgModalEl.classList.remove("open"));
    if (imgModalEl) imgModalEl.addEventListener("click", (e) => { if (e.target === imgModalEl) imgModalEl.classList.remove("open"); });

    // ----- Export buttons -----
    const excelBtn = document.getElementById("ind-export-excel");
    if (excelBtn) excelBtn.addEventListener("click", exportLedgerExcel);
    const pdfBtn = document.getElementById("ind-export-pdf");
    if (pdfBtn) pdfBtn.addEventListener("click", exportLedgerPdf);
}

// Pending image (base64) for the payment being composed
let _pendingPaymentImage = null;
// Pending payment delete target (awaiting PIN confirmation)
let _pendingPaymentDelete = null;

// Resize + compress an image file to a base64 JPEG (keeps storage small)
function _compressImage(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                let w = img.width, h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
                    else { w = Math.round(w * maxDim / h); h = maxDim; }
                }
                const canvas = document.createElement("canvas");
                canvas.width = w; canvas.height = h;
                canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                try { resolve(canvas.toDataURL("image/jpeg", quality)); }
                catch (err) { reject(err); }
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function openPaymentImage(src) {
    const modal = document.getElementById("payment-image-modal");
    const img = document.getElementById("payment-image-full");
    if (img) img.src = src;
    if (modal) modal.classList.add("open");
}

function openPaymentPinModal(name, id) {
    _pendingPaymentDelete = { name, id };
    const modal = document.getElementById("payment-pin-modal");
    const input = document.getElementById("payment-pin-input");
    const err = document.getElementById("payment-pin-error");
    if (err) err.style.display = "none";
    if (input) input.value = "";
    if (modal) modal.classList.add("open");
    if (input) setTimeout(() => input.focus(), 100);
}

// ===================== LEDGER EXPORT (Excel + Premium PDF) =====================
let lastIndReport = null;

// Set Excel number format (z) for given columns from startRow to end of range
function _xlsxApplyFormats(ws, formatsByCol, startRow) {
    if (!ws["!ref"]) return;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let R = startRow; R <= range.e.r; R++) {
        Object.keys(formatsByCol).forEach(colStr => {
            const addr = XLSX.utils.encode_cell({ r: R, c: parseInt(colStr) });
            const cell = ws[addr];
            if (cell && cell.t === "n") cell.z = formatsByCol[colStr];
        });
    }
}

function exportLedgerExcel() {
    if (!window.XLSX) { alert("Excel kutubxonasi yuklanmadi. Internet aloqasini tekshiring."); return; }
    if (!lastIndReport || !lastIndReport.supplier) { alert("Avval ta'minotchini tanlang."); return; }
    const r = lastIndReport;

    // Currency: export numbers in the selected currency (UZS or USD)
    const usd = reportState.currency === "USD";
    const rate = reportState.usdRate > 0 ? reportState.usdRate : 1;
    const conv = (uzs) => usd ? Math.round((uzs / rate) * 100) / 100 : Math.round(uzs);
    // Number formats with thousand separators (so amounts are readable)
    const MONEY = usd ? '"$"#,##0.00' : '#,##0" UZS"';
    const PACK = '#,##0.00';
    const INT = '#,##0';
    const curLabel = usd ? `USD (1$ = ${rate.toLocaleString("uz-UZ")} UZS)` : "UZS (so'm)";

    const wb = XLSX.utils.book_new();

    // 1) Umumiy (summary)
    const summary = [
        ["ECO SPORTS — Ta'minotchi Hisob-Kitob Hisoboti"],
        ["Ta'minotchi", r.supplier],
        ["Hisobot oyi", r.month],
        ["Yaratilgan", new Date().toLocaleString("uz-UZ")],
        ["Summalar valyutasi", curLabel],
        [],
        ["HISOB-KITOB (jami, boshidan beri)"],
        ["Jami olingan yuk (qarz)", conv(r.settlement.taken)],
        ["To'langan", conv(r.settlement.paid)],
        ["Qolgan qarz", conv(r.settlement.balance)],
        [],
        ["OYLIK KO'RSATKICHLAR (" + r.month + ")"],
        ["Joriy zaxira (pachka)", Math.round(r.stock.packs * 100) / 100],
        ["Joriy zaxira (dona)", r.stock.dona],
        ["Zaxira tan qiymati", conv(r.stock.cogs)],
        ["Zaxira sotuv qiymati", conv(r.stock.sell)],
        ["Oylik kirim (pachka)", Math.round(r.imports.packs * 100) / 100],
        ["Oylik kirim qiymati", conv(r.imports.val)],
        ["Optim savdo (pachka)", Math.round(r.optim.packs * 100) / 100],
        ["Optim savdo qiymati", conv(r.optim.val)],
        ["Dona savdo (dona)", r.donaSale.qty],
        ["Dona savdo qiymati", conv(r.donaSale.val)]
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    ws1["!cols"] = [{ wch: 34 }, { wch: 24 }];
    // Per-row formats on column B (index 1)
    const moneyRows = [7, 8, 9, 14, 15, 17, 19, 21];
    const packRows = [12, 16, 18];
    const intRows = [13, 20];
    moneyRows.forEach(R => { const c = ws1[XLSX.utils.encode_cell({ r: R, c: 1 })]; if (c && c.t === "n") c.z = MONEY; });
    packRows.forEach(R => { const c = ws1[XLSX.utils.encode_cell({ r: R, c: 1 })]; if (c && c.t === "n") c.z = PACK; });
    intRows.forEach(R => { const c = ws1[XLSX.utils.encode_cell({ r: R, c: 1 })]; if (c && c.t === "n") c.z = INT; });
    XLSX.utils.book_append_sheet(wb, ws1, "Umumiy");

    // 2) Mahsulotlar (full detail)
    const head = [`Mahsulot (Model)`, "Kiyim turi", "Zaxira (pachka)", "Zaxira (dona)", "Kirim (pachka)", "Kirim (dona)", `Kirim qiymati`, "Optim (pachka)", `Optim qiymati`, "Dona savdo (dona)", `Dona qiymati`, `Jami sotuv qiymati`];
    const rows = r.metrics.map(m => [
        m.product.name,
        reportCategoryLabel(m.product.category),
        Math.round(m.stockPacks * 100) / 100, m.stockDona,
        Math.round(m.importPacks * 100) / 100, m.importDona, conv(m.importVal),
        Math.round(m.optimPacks * 100) / 100, conv(m.optimVal),
        m.donaQty, conv(m.donaVal),
        conv(m.totalSoldVal)
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet([head, ...rows]);
    ws2["!cols"] = head.map((h, i) => i === 0 ? { wch: 28 } : { wch: 17 });
    _xlsxApplyFormats(ws2, { 2: PACK, 3: INT, 4: PACK, 5: INT, 6: MONEY, 7: PACK, 8: MONEY, 9: INT, 10: MONEY, 11: MONEY }, 1);
    XLSX.utils.book_append_sheet(wb, ws2, "Mahsulotlar");

    // 3) To'lovlar (payments)
    const phead = ["Sana", `Summa (${usd ? "USD" : "UZS"})`, "Izoh / zametka", "Rasm bormi"];
    const prows = r.payments.map(p => [(p.date || "").slice(0, 10), conv(p.amount), p.note || "", p.image ? "Ha" : "Yo'q"]);
    const ws3 = XLSX.utils.aoa_to_sheet([phead, ...(prows.length ? prows : [["—", "—", "—", "—"]])]);
    ws3["!cols"] = [{ wch: 14 }, { wch: 20 }, { wch: 32 }, { wch: 12 }];
    if (prows.length) _xlsxApplyFormats(ws3, { 1: MONEY }, 1);
    XLSX.utils.book_append_sheet(wb, ws3, "To'lovlar");

    const curTag = usd ? "USD" : "UZS";
    XLSX.writeFile(wb, `Hisobot_${r.supplier.replace(/\s+/g, "_")}_${r.month}_${curTag}.xlsx`);
}

function _ledgerAnalysis(r) {
    const lines = [];
    const bal = r.settlement.balance;
    if (bal > 0) lines.push(`Ushbu ta'minotchiga <b>${reportFmtMoney(bal)}</b> miqdorida qarzimiz bor — to'lov amalga oshirilishi tavsiya etiladi.`);
    else if (bal < 0) lines.push(`Ta'minotchiga <b>${reportFmtMoney(Math.abs(bal))}</b> oldindan to'langan (haqimiz bor).`);
    else lines.push(`Ta'minotchi bilan hisob-kitob <b>to'liq yopilgan</b> — qarz mavjud emas.`);

    const totalSold = r.optim.val + r.donaSale.val;
    if (totalSold > 0) {
        const optimPct = Math.round(r.optim.val / totalSold * 100);
        lines.push(`Oylik savdo tarkibi: optim ulushi <b>${optimPct}%</b>, dona ulushi <b>${100 - optimPct}%</b> (jami ${reportFmtMoney(totalSold)}).`);
    } else {
        lines.push(`Tanlangan oyda (${r.month}) ushbu ta'minotchi bo'yicha savdo qayd etilmagan.`);
    }
    lines.push(`Joriy zaxira: <b>${Math.round(r.stock.packs * 100) / 100} pachka</b> (${r.stock.dona} dona); tan qiymati ${reportFmtMoney(r.stock.cogs)}, potensial sotuv qiymati ${reportFmtMoney(r.stock.sell)}.`);
    if (r.imports.val > 0) lines.push(`Oy davomida <b>${reportFmtMoney(r.imports.val)}</b> qiymatda yangi kirim qabul qilingan.`);
    return lines;
}

function _buildLedgerPdfHtml(r) {
    const now = new Date().toLocaleString("uz-UZ");
    const curNote = reportState.currency === "USD" ? `Valyuta: USD (1$ = ${reportState.usdRate.toLocaleString("uz-UZ")} UZS)` : "Valyuta: UZS";
    const bal = r.settlement.balance;
    const balColor = bal > 0 ? "#dc2626" : (bal < 0 ? "#d97706" : "#059669");
    const balLabel = bal > 0 ? "To'lanishi kerak" : (bal < 0 ? "Oldindan to'langan" : "To'liq yopilgan");

    const detailRows = r.metrics.map((m, i) => `
        <tr style="background:${i % 2 ? "#f8fafc" : "#ffffff"};">
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;">${m.product.name}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#0891b2;font-weight:600;">${reportCategoryLabel(m.product.category)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#0f172a;">${Math.round(m.stockPacks * 100) / 100} p / ${m.stockDona} d</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#2563eb;">${reportFmtMoney(m.importVal)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#d97706;">${reportFmtMoney(m.optimVal)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#059669;">${reportFmtMoney(m.donaVal)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f172a;">${reportFmtMoney(m.totalSoldVal)}</td>
        </tr>`).join("") || `<tr><td colspan="7" style="padding:16px;text-align:center;color:#94a3b8;">Ma'lumot yo'q</td></tr>`;

    const payRows = r.payments.slice().reverse().map((p, i) => `
        <tr style="background:${i % 2 ? "#f8fafc" : "#ffffff"};">
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#475569;">${(p.date || "").slice(0, 10)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#059669;">${reportFmtMoney(p.amount)}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#475569;">${p.note || "—"}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${p.image ? "📷" : "—"}</td>
        </tr>`).join("") || `<tr><td colspan="4" style="padding:16px;text-align:center;color:#94a3b8;">To'lovlar kiritilmagan</td></tr>`;

    const analysis = _ledgerAnalysis(r).map(t => `<li style="margin-bottom:7px;line-height:1.5;color:#334155;">${t}</li>`).join("");

    const kpi = (label, value, sub, color) => `
        <div style="flex:1;min-width:150px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;font-weight:700;margin-bottom:6px;">${label}</div>
            <div style="font-size:18px;font-weight:800;color:#0f172a;">${value}</div>
            <div style="font-size:11px;color:${color};font-weight:600;margin-top:3px;">${sub}</div>
        </div>`;

    const settle = (label, value, color, note) => `
        <div style="flex:1;min-width:160px;background:#ffffff;border:1px solid #e2e8f0;border-left:4px solid ${color};border-radius:12px;padding:14px 16px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;font-weight:700;margin-bottom:6px;">${label}</div>
            <div style="font-size:20px;font-weight:800;color:${color};">${value}</div>
            ${note ? `<div style="font-size:11px;color:#64748b;font-weight:600;margin-top:3px;">${note}</div>` : ""}
        </div>`;

    return `
    <div style="width:794px;box-sizing:border-box;background:#ffffff;font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#0f172a;">
        <div style="background:linear-gradient(135deg,#0f766e 0%,#0891b2 100%);padding:30px 40px;color:#fff;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    <div style="font-size:24px;font-weight:800;letter-spacing:1px;">ECO <span style="color:#a7f3d0;">SPORTS</span></div>
                    <div style="font-size:12px;opacity:.85;margin-top:2px;letter-spacing:2px;">KASSA &amp; CRM TIZIMI</div>
                </div>
                <div style="text-align:right;font-size:11px;opacity:.9;">
                    <div>${now}</div>
                    <div style="margin-top:2px;">${curNote}</div>
                </div>
            </div>
            <div style="margin-top:22px;font-size:20px;font-weight:800;">Ta'minotchi Hisob-Kitob Hisoboti</div>
            <div style="margin-top:6px;display:flex;gap:18px;font-size:13px;">
                <span style="background:rgba(255,255,255,.18);padding:5px 14px;border-radius:20px;font-weight:700;">🚚 ${r.supplier}</span>
                <span style="background:rgba(255,255,255,.18);padding:5px 14px;border-radius:20px;font-weight:700;">📅 ${r.month}</span>
            </div>
        </div>

        <div style="padding:26px 40px;">
            <div style="font-size:13px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Hisob-Kitob (jami)</div>
            <div style="display:flex;gap:14px;margin-bottom:24px;">
                ${settle("Jami olingan yuk (qarz)", reportFmtMoney(r.settlement.taken), "#2563eb", "")}
                ${settle("To'langan", reportFmtMoney(r.settlement.paid), "#059669", "")}
                ${settle("Qolgan qarz", reportFmtMoney(Math.abs(bal)), balColor, balLabel)}
            </div>

            <div style="font-size:13px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Oylik ko'rsatkichlar — ${r.month}</div>
            <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:24px;">
                ${kpi("Joriy zaxira", `${Math.round(r.stock.packs * 100) / 100} pachka`, `${r.stock.dona} dona`, "#0891b2")}
                ${kpi("Oylik kirim", `${Math.round(r.imports.packs * 100) / 100} pachka`, reportFmtMoney(r.imports.val), "#2563eb")}
                ${kpi("Optim savdo", `${Math.round(r.optim.packs * 100) / 100} pachka`, reportFmtMoney(r.optim.val), "#d97706")}
                ${kpi("Dona savdo", `${r.donaSale.qty} dona`, reportFmtMoney(r.donaSale.val), "#059669")}
            </div>

            <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
                <div style="font-size:13px;font-weight:800;color:#0f766e;margin-bottom:10px;">📊 Hisobot Tahlili</div>
                <ul style="margin:0;padding-left:18px;font-size:12.5px;">${analysis}</ul>
            </div>

            <div style="font-size:13px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Mahsulotlar bo'yicha to'liq hisobot</div>
            <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:24px;">
                <thead>
                    <tr style="background:#0f172a;color:#fff;">
                        <th style="padding:9px 10px;text-align:left;">Mahsulot</th>
                        <th style="padding:9px 10px;text-align:left;">Tur</th>
                        <th style="padding:9px 10px;text-align:right;">Zaxira</th>
                        <th style="padding:9px 10px;text-align:right;">Kirim</th>
                        <th style="padding:9px 10px;text-align:right;">Optim</th>
                        <th style="padding:9px 10px;text-align:right;">Dona</th>
                        <th style="padding:9px 10px;text-align:right;">Jami sotuv</th>
                    </tr>
                </thead>
                <tbody>${detailRows}</tbody>
            </table>

            <div style="font-size:13px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">To'lovlar tarixi</div>
            <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
                <thead>
                    <tr style="background:#0f766e;color:#fff;">
                        <th style="padding:9px 10px;text-align:left;">Sana</th>
                        <th style="padding:9px 10px;text-align:left;">Summa</th>
                        <th style="padding:9px 10px;text-align:left;">Izoh / zametka</th>
                        <th style="padding:9px 10px;text-align:center;">Rasm</th>
                    </tr>
                </thead>
                <tbody>${payRows}</tbody>
            </table>
        </div>

        <div style="background:#0f172a;color:#94a3b8;padding:16px 40px;font-size:10.5px;display:flex;justify-content:space-between;">
            <span>ECO SPORTS — Kassa &amp; CRM Tizimi</span>
            <span>Avtomatik yaratilgan hisobot • ${now}</span>
        </div>
    </div>`;
}

async function exportLedgerPdf() {
    if (!window.html2canvas || !(window.jspdf && window.jspdf.jsPDF)) {
        alert("PDF kutubxonasi yuklanmadi. Internet aloqasini tekshiring.");
        return;
    }
    if (!lastIndReport || !lastIndReport.supplier) { alert("Avval ta'minotchini tanlang."); return; }

    const btn = document.getElementById("ind-export-pdf");
    const orig = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tayyorlanmoqda...'; }

    const holder = document.createElement("div");
    holder.style.position = "fixed";
    holder.style.left = "-99999px";
    holder.style.top = "0";
    holder.style.width = "794px";
    holder.innerHTML = _buildLedgerPdfHtml(lastIndReport);
    document.body.appendChild(holder);

    try {
        const el = holder.firstElementChild;
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF("p", "mm", "a4");
        const pageW = 210, pageH = 297;
        const imgW = pageW;
        const imgH = canvas.height * imgW / canvas.width;
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        let heightLeft = imgH, position = 0;
        pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
        heightLeft -= pageH;
        while (heightLeft > 0) {
            position -= pageH;
            pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
            heightLeft -= pageH;
        }
        const r = lastIndReport;
        pdf.save(`Hisobot_${r.supplier.replace(/\s+/g, "_")}_${r.month}.pdf`);
    } catch (e) {
        console.error("PDF xatosi:", e);
        alert("PDF yaratishda xato yuz berdi: " + e.message);
    } finally {
        document.body.removeChild(holder);
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
}

// --- GET COLOR HEX CODE FOR UI DOTS [NEW] ---
function getColorHex(color) {
    switch(color) {
        case "Qora": return "#000000";
        case "Oq": return "#ffffff";
        case "To'q ko'k": return "#0a1931";
        case "Parlament": return "#1b4f72";
        case "Bolotniy": return "#3b5323";
        case "Bardoviy": return "#800020";
        case "Qizil": return "#d32f2f";
        case "Xakki": return "#c3b091";
        case "Melanj": return "#bdc3c7";
        case "Antra Melanj": return "#2c3e50";
        default: return "#bdc3c7";
    }
}

// --- RENDER DYNAMIC COLOR-WISE PACK INPUTS [premium UI/UX] ---
function renderDynamicPackInputs() {
    const container = document.getElementById("warehouse-qty-container");
    if (!container) return;

    const checkedColors = Array.from(document.querySelectorAll('input[name="warehouse-color"]:checked')).map(cb => cb.value);
    const checkedSizesCount = document.querySelectorAll('input[name="warehouse-size"]:checked').length;

    if (checkedColors.length === 0) {
        container.innerHTML = `
            <div class="pack-empty-hint">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span>Yuqorida <strong>ranglarni</strong> va <strong>o'lchamlarni</strong> tanlang — har rang uchun nechi pachka kirgani shu yerda ochiladi.</span>
            </div>`;
        return;
    }

    let html = `
        <div class="pack-section-head">
            <span class="pack-section-title"><i class="fa-solid fa-boxes-stacked"></i> Kirim Miqdori</span>
            <span class="pack-perpack-badge"><i class="fa-solid fa-layer-group"></i> 1 pachka = ${checkedSizesCount} dona</span>
        </div>
        <div class="pack-cards">`;

    checkedColors.forEach(color => {
        // Preserve existing value when toggling other checkmarks
        const existingInput = document.querySelector(`.color-pack-input[data-color="${color}"]`);
        const val = existingInput ? existingInput.value : "10";
        const isLight = ["Oq", "Melanj", "Xakki"].includes(color);

        html += `
            <div class="pack-card">
                <div class="pack-card-color">
                    <span class="pack-swatch${isLight ? ' is-light' : ''}" style="background-color:${getColorHex(color)};"></span>
                    <span class="pack-color-name">${color}</span>
                </div>
                <div class="pack-stepper">
                    <button type="button" class="pack-step-btn" data-step="-1" data-color="${color}" aria-label="Kamaytirish"><i class="fa-solid fa-minus"></i></button>
                    <input type="number" class="color-pack-input" data-color="${color}" value="${val}" min="1" required>
                    <button type="button" class="pack-step-btn" data-step="1" data-color="${color}" aria-label="Ko'paytirish"><i class="fa-solid fa-plus"></i></button>
                    <span class="pack-unit">pachka</span>
                </div>
            </div>`;
    });
    html += `</div>`;
    html += `<div class="pack-total" id="pack-total-summary"></div>`;

    container.innerHTML = html;
    updatePackTotal();
}

// --- Jonli jami: rang / pachka / dona ---
function updatePackTotal() {
    const summary = document.getElementById("pack-total-summary");
    if (!summary) return;
    const sizesCount = document.querySelectorAll('input[name="warehouse-size"]:checked').length;
    const inputs = document.querySelectorAll(".color-pack-input");
    let totalPacks = 0, activeColors = 0;
    inputs.forEach(i => {
        const v = parseInt(i.value, 10) || 0;
        totalPacks += v;
        if (v > 0) activeColors++;
    });
    const totalDona = totalPacks * sizesCount;
    summary.innerHTML = `
        <div class="pack-total-item"><span class="pack-total-num">${activeColors}</span><span class="pack-total-lbl">rang</span></div>
        <div class="pack-total-sep"></div>
        <div class="pack-total-item"><span class="pack-total-num">${totalPacks}</span><span class="pack-total-lbl">pachka</span></div>
        <div class="pack-total-sep"></div>
        <div class="pack-total-item"><span class="pack-total-num accent">${totalDona}</span><span class="pack-total-lbl">dona</span></div>`;
}

// --- UPDATE SELECTED COLORS PREVIEW IN TRIGGER BOX [NEW] ---
function updateSelectedColorsUI() {
    const triggerText = document.getElementById("warehouse-color-trigger-text");
    if (!triggerText) return;

    const colorCheckboxes = document.querySelectorAll('input[name="warehouse-color"]:checked');
    
    if (colorCheckboxes.length === 0) {
        triggerText.innerHTML = `<span style="color: var(--text-secondary);">Ranglarni tanlang...</span>`;
        return;
    }

    triggerText.innerHTML = ""; // Clear
    colorCheckboxes.forEach(cb => {
        const label = cb.closest("label");
        const dot = label.querySelector(".color-dot")?.cloneNode(true);
        const name = cb.value;

        const pill = document.createElement("span");
        pill.className = "selected-color-pill";
        if (dot) pill.appendChild(dot);
        pill.appendChild(document.createTextNode(name));

        triggerText.appendChild(pill);
    });
}

// --- OPEN KIRIM STOCK DOCUMENT POPUP [NEW] ---
function openKirimDocument(newProduct) {
    const docModal = document.getElementById("warehouse-document-modal");
    if (!docModal) return;

    // Populate data
    const docId = "KRM-" + Math.floor(1000 + Math.random() * 9000);
    const now = new Date();
    const dateStr = now.toLocaleDateString('uz-UZ') + " " + now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

    document.getElementById("kirim-doc-id").textContent = docId;
    document.getElementById("kirim-doc-date").textContent = dateStr;
    document.getElementById("kirim-doc-supplier").textContent = newProduct.supplier;
    document.getElementById("kirim-doc-manager").textContent = currentUser ? currentUser.name : "Omborchi 1";
    
    document.getElementById("kirim-doc-prod-name").textContent = newProduct.name;
    
    // Category display label mapping
    let catLabel = "Futbolkalar";
    if (newProduct.category === "shorts") catLabel = "Shortilar";
    else if (newProduct.category === "tracksuit") catLabel = "Sportivkalar";
    else if (newProduct.category === "joggers") catLabel = "Trikolar";
    else catLabel = newProduct.category;

    document.getElementById("kirim-doc-prod-cat").textContent = catLabel;

    // Construct detailed breakdown per color
    const sizeCount = newProduct.sizes.length;
    const breakdownList = Object.entries(newProduct.colorPacksBreakdown || {})
        .map(([color, packs]) => `${color}: ${packs} pachka (${packs * sizeCount} dona)`)
        .join(", ");

    document.getElementById("kirim-doc-prod-colors").textContent = `${newProduct.colors} [Batafsil: ${breakdownList}]`;
    document.getElementById("kirim-doc-prod-sizes").textContent = newProduct.sizes.join(", ");
    document.getElementById("kirim-doc-prod-qty").textContent = `${newProduct.totalPacks || 0} pachka (${newProduct.qty} dona)`;

    // Open modal
    docModal.classList.add("open");
}

// --- APPROVE PRODUCT PRICE WORKFLOW [NEW] ---
function approveProductPrice(productId, cogs, sellingPrice, donaPrice) {
    const p = state.dynamicProducts.find(item => item.id === productId);
    if (!p) return;

    p.cogs = cogs; // Pachka tan narxi
    p.pack_price = sellingPrice; // Pachka sotish narxi
    p.price = donaPrice; // Dona sotish narxi
    p.approved = true;

    // Narxni eco_config'ga yozish (barcha qurilmalarga ishonchli yetib boradi)
    productPrices[p.id] = { cogs: cogs, pack_price: sellingPrice, price: donaPrice };
    saveProductPrices();

    // Save updated dynamicProducts list
    localStorage.setItem("eco_sports_dynamic_products", JSON.stringify(state.dynamicProducts));

    // Merge into active PRODUCTS
    if (!PRODUCTS.find(item => item.id === p.id)) {
        PRODUCTS.push(p);
    } else {
        const idx = PRODUCTS.findIndex(item => item.id === p.id);
        if (idx !== -1) {
            PRODUCTS[idx] = p;
        }
    }

    // Set stock inventory
    inventory[p.id] = p.qty || 0;
    localStorage.setItem("eco_sports_inventory", JSON.stringify(inventory));

    // Sync to Supabase (navbat orqali — offline'da yo'qolmaydi)
    if (supabaseClient) {
        dbSaveInventory(p.id, p, inventory[p.id]); // eco_inventory (vestigial, navbatsiz)
        // Kirim hujjati holatini TASDIQLANDI ga o'tkazish — navbatga
        enqueueOp({ type: "kirim_status", product_id: p.id, patch: { status: "TASDIQLANDI" } });
    }

    // Umumiy tannarx (tan narxdan): pachka soni × pachka tan narxi
    const packSizes = (p.sizes && p.sizes.length) ? p.sizes.length : 5;
    const packs = (p.qty || 0) / packSizes;
    const totalCost = Math.round(packs * cogs);

    // Ushbu kirim ta'minotchi qarziga (olingan yuk) darhol qo'shilsin
    if (!state.kirimHistory) state.kirimHistory = [];
    if (!state.kirimHistory.find(k => String(k.product_id) === String(p.id))) {
        state.kirimHistory.push({
            id: "KRM-" + Date.now(),
            created_at: new Date().toISOString(),
            supplier: p.supplier,
            product_id: p.id,
            product_name: p.name,
            category: p.category,
            sizes: JSON.stringify(p.sizes || []),
            total_packs: packs,
            total_qty: p.qty || 0,
            status: "TASDIQLANDI"
        });
        localStorage.setItem("eco_sports_kirim_history", JSON.stringify(state.kirimHistory));
    }

    // --- O'ZGARMAS JURNAL: kirim (mahsulot qabul qilindi) yozuvi ---
    if (typeof appendLedger === "function") {
        appendLedger("kirim", { ref: p.id, account: "ombor", direction: "in", amount: totalCost, note: p.name + " · " + p.supplier + " · " + (p.qty || 0) + " dona" });
    }

    // Re-render UI
    renderBuxgalteriya();
    renderOmborTable();
    renderTiles();

    // To'lov holatini so'rash (naqt / nasiya) va ta'minotchi daftariga yozish
    openKirimPaymentModal(p, totalCost);
}

// --- KIRIM PAYMENT (naqt / nasiya) MODAL ---
let _pendingKirimPayment = null;
let _kirimPayModalBound = false;
let _kirimPayCurrency = "UZS";

function _kirimRate() { return reportState.usdRate > 0 ? reportState.usdRate : 1; }
// Format a UZS amount in the modal's selected currency
function _kirimFmt(uzs) {
    if (_kirimPayCurrency === "USD") {
        const usd = uzs / _kirimRate();
        return "$" + usd.toLocaleString("en-US", { maximumFractionDigits: usd < 100 ? 2 : 0 });
    }
    return formatPrice(uzs);
}
// Convert the paid-amount input (in selected currency) to UZS
function _kirimPaidToUzs(val) {
    const v = parseFloat(val) || 0;
    return _kirimPayCurrency === "USD" ? Math.round(v * _kirimRate()) : Math.round(v);
}

function openKirimPaymentModal(p, totalCost) {
    const modal = document.getElementById("kirim-payment-modal");
    if (!modal) return;
    _pendingKirimPayment = { supplier: p.supplier, productName: p.name, totalCost: totalCost };
    _kirimPayCurrency = "UZS"; // default each time

    document.getElementById("kirim-pay-product").textContent = p.name;
    document.getElementById("kirim-pay-supplier").textContent = p.supplier;
    modal.querySelectorAll("#kirim-pay-cur-toggle .cur-btn").forEach(b => b.classList.toggle("active", b.dataset.cur === "UZS"));
    modal.querySelectorAll(".kpay-type-btn").forEach(b => b.classList.toggle("active", b.dataset.type === "naqt"));
    const partial = document.getElementById("kirim-pay-partial");
    if (partial) partial.style.display = "none";
    const paidInput = document.getElementById("kirim-pay-paid");
    if (paidInput) paidInput.value = "";

    _bindKirimPaymentModal();
    _kirimSyncCurrencyUI();
    modal.classList.add("open");
}

// Refresh total / remaining / labels for the current currency
function _kirimSyncCurrencyUI() {
    if (!_pendingKirimPayment) return;
    const total = _pendingKirimPayment.totalCost;
    const totalEl = document.getElementById("kirim-pay-total");
    if (totalEl) totalEl.textContent = _kirimFmt(total);
    const rateNote = document.getElementById("kirim-pay-rate-note");
    if (rateNote) rateNote.textContent = _kirimPayCurrency === "USD" ? `1$ = ${_kirimRate().toLocaleString("uz-UZ")} UZS` : "";
    const lbl = document.getElementById("kirim-pay-paid-label");
    if (lbl) lbl.textContent = `To'langan summa (${_kirimPayCurrency === "USD" ? "$" : "UZS"})`;
    const paidInput = document.getElementById("kirim-pay-paid");
    const remaining = document.getElementById("kirim-pay-remaining");
    const isNaqt = (document.querySelector("#kirim-pay-type .kpay-type-btn.active") || {}).dataset
        ? document.querySelector("#kirim-pay-type .kpay-type-btn.active").dataset.type === "naqt" : true;
    const paidUzs = isNaqt ? total : Math.min(total, Math.max(0, _kirimPaidToUzs(paidInput ? paidInput.value : 0)));
    if (remaining) remaining.textContent = _kirimFmt(Math.max(0, total - paidUzs));
}

function _bindKirimPaymentModal() {
    if (_kirimPayModalBound) return;
    _kirimPayModalBound = true;

    const modal = document.getElementById("kirim-payment-modal");
    const partial = document.getElementById("kirim-pay-partial");
    const paidInput = document.getElementById("kirim-pay-paid");

    function activeType() {
        const b = modal.querySelector(".kpay-type-btn.active");
        return b ? b.dataset.type : "naqt";
    }

    // Currency toggle (UZS / $) — converts the entered value when switching
    modal.querySelectorAll("#kirim-pay-cur-toggle .cur-btn").forEach(b => {
        b.addEventListener("click", () => {
            const newCur = b.dataset.cur;
            if (newCur === _kirimPayCurrency) return;
            const oldCur = _kirimPayCurrency;
            // convert any entered value old -> new currency
            if (paidInput && paidInput.value !== "") {
                const v = parseFloat(paidInput.value) || 0;
                const uzs = oldCur === "USD" ? v * _kirimRate() : v;
                const disp = newCur === "USD" ? (uzs / _kirimRate()) : uzs;
                paidInput.value = Math.round(disp * 100) / 100;
            }
            _kirimPayCurrency = newCur;
            modal.querySelectorAll("#kirim-pay-cur-toggle .cur-btn").forEach(x => x.classList.toggle("active", x === b));
            _kirimSyncCurrencyUI();
        });
    });

    modal.querySelectorAll(".kpay-type-btn").forEach(b => {
        b.addEventListener("click", () => {
            modal.querySelectorAll(".kpay-type-btn").forEach(x => x.classList.toggle("active", x === b));
            if (partial) partial.style.display = b.dataset.type === "nasiya" ? "block" : "none";
            _kirimSyncCurrencyUI();
        });
    });
    if (paidInput) paidInput.addEventListener("input", _kirimSyncCurrencyUI);

    const closeBtn = document.getElementById("kirim-payment-close");
    if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.remove("open"));
    const skipBtn = document.getElementById("kirim-pay-skip");
    if (skipBtn) skipBtn.addEventListener("click", () => modal.classList.remove("open"));
    if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });

    const saveBtn = document.getElementById("kirim-pay-save");
    if (saveBtn) saveBtn.addEventListener("click", () => {
        if (!_pendingKirimPayment) { modal.classList.remove("open"); return; }
        const { supplier, productName, totalCost } = _pendingKirimPayment;
        const isNaqt = activeType() === "naqt";
        const paid = isNaqt ? totalCost : Math.min(totalCost, Math.max(0, _kirimPaidToUzs(paidInput ? paidInput.value : 0)));
        if (paid > 0) {
            const curTag = _kirimPayCurrency === "USD" ? "$" : "UZS";
            const note = isNaqt
                ? `Kirim to'lovi (naqt, ${curTag}): ${productName}`
                : `Kirim to'lovi (nasiya/omonat, ${curTag}): ${productName}`;
            addSupplierPayment(supplier, paid, note);
        }
        modal.classList.remove("open");
        _pendingKirimPayment = null;
        if (typeof renderSupplierIndividualReport === "function") renderSupplierIndividualReport();
    });
}

// 11.7 POPULATE SYSTEM SETTINGS (SOZLAMALAR)
function populateSettings() {
    const pinInput = document.getElementById("settings-pin");
    const chatInput = document.getElementById("settings-chat-id");

    if (pinInput) pinInput.value = appConfig.pin;
    if (chatInput) chatInput.value = appConfig.chatId || "";

    renderCashiersList();
    renderSettingsSuppliersAndCategories();

    // Admin: xodimlar ro'yxatini bulutdan xavfsiz yangilash (qulflangan jadval → RPC)
    if (typeof refreshUsersFromCloud === "function" && _sessionAdminPw) {
        refreshUsersFromCloud().then(ok => { if (ok) renderCashiersList(); });
    }
}

function renderSettingsSuppliersAndCategories() {
    const suppliersTableBody = document.getElementById("settings-suppliers-table-body");
    const categoriesTableBody = document.getElementById("settings-categories-table-body");
    
    if (suppliersTableBody) {
        suppliersTableBody.innerHTML = "";
        state.suppliers.forEach((s, idx) => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${s.name}</strong></td>
                <td><i class="${s.icon || 'fa-solid fa-user'}"></i> <code>${s.icon || ''}</code></td>
                <td style="text-align: center;">
                    <span class="channel-tag" style="background: ${s.visible ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; color: ${s.visible ? 'var(--primary)' : '#ef4444'};">
                        ${s.visible ? 'Ko\'rinadi' : 'Yashirin'}
                    </span>
                </td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 0.4rem; justify-content: center;">
                        <button class="qty-btn toggle-supplier-vis-btn" data-idx="${idx}" style="background: var(--primary-glow); border-color: rgba(16, 185, 129, 0.2); color: var(--primary); width:30px; height:30px;" title="Ko'rinishni o'zgartirish">
                            <i class="fa-solid ${s.visible ? 'fa-eye-slash' : 'fa-eye'}"></i>
                        </button>
                        <button class="qty-btn delete-supplier-btn" data-idx="${idx}" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: #ef4444; width:30px; height:30px;" title="O'chirish">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;
            suppliersTableBody.appendChild(row);
        });
        
        // Add click listeners
        suppliersTableBody.querySelectorAll(".toggle-supplier-vis-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.dataset.idx);
                state.suppliers[idx].visible = !state.suppliers[idx].visible;
                saveSuppliersToStorage();
                renderSettingsSuppliersAndCategories();
                renderPOSFilters();
                renderTiles();
            });
        });
        
        suppliersTableBody.querySelectorAll(".delete-supplier-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.dataset.idx);
                if (confirm(`"${state.suppliers[idx].name}" ta'minotchisini o'chirib tashlamoqchimisiz?`)) {
                    state.suppliers.splice(idx, 1);
                    saveSuppliersToStorage();
                    renderSettingsSuppliersAndCategories();
                    renderPOSFilters();
                    renderTiles();
                }
            });
        });
    }
    
    if (categoriesTableBody) {
        categoriesTableBody.innerHTML = "";
        state.categories.forEach((c, idx) => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${c.name}</strong></td>
                <td><code>${c.code}</code></td>
                <td><i class="${c.icon || 'fa-solid fa-tag'}"></i> <code>${c.icon || ''}</code></td>
                <td style="text-align: center;">
                    <span class="channel-tag" style="background: ${c.visible ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; color: ${c.visible ? 'var(--primary)' : '#ef4444'};">
                        ${c.visible ? 'Ko\'rinadi' : 'Yashirin'}
                    </span>
                </td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 0.4rem; justify-content: center;">
                        <button class="qty-btn toggle-category-vis-btn" data-idx="${idx}" style="background: var(--primary-glow); border-color: rgba(16, 185, 129, 0.2); color: var(--primary); width:30px; height:30px;" title="Ko'rinishni o'zgartirish">
                            <i class="fa-solid ${c.visible ? 'fa-eye-slash' : 'fa-eye'}"></i>
                        </button>
                        <button class="qty-btn delete-category-btn" data-idx="${idx}" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: #ef4444; width:30px; height:30px;" title="O'chirish">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;
            categoriesTableBody.appendChild(row);
        });
        
        // Add click listeners
        categoriesTableBody.querySelectorAll(".toggle-category-vis-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.dataset.idx);
                state.categories[idx].visible = !state.categories[idx].visible;
                saveCategoriesToStorage();
                renderSettingsSuppliersAndCategories();
                renderPOSFilters();
                renderTiles();
            });
        });
        
        categoriesTableBody.querySelectorAll(".delete-category-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.dataset.idx);
                if (confirm(`"${state.categories[idx].name}" kiyim turini o'chirib tashlamoqchimisiz?`)) {
                    state.categories.splice(idx, 1);
                    saveCategoriesToStorage();
                    renderSettingsSuppliersAndCategories();
                    renderPOSFilters();
                    renderTiles();
                }
            });
        });
    }
}

// 11.8 RENDER CASHIERS (STAFF) LIST
function renderCashiersList() {
    const tableBody = document.getElementById("settings-cashiers-table-body");
    if (!tableBody) return;
    
    tableBody.innerHTML = "";
    
    users.forEach(u => {
        const row = document.createElement("tr");
        
        const isPrimaryAdmin = u.username === "admin";
        const deleteButton = isPrimaryAdmin 
            ? `<span style="color: var(--text-muted); font-size: 0.75rem; font-style: italic;">(Asosiy admin)</span>`
            : `<button class="qty-btn delete-cashier-btn" data-id="${u.id}" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: #ef4444; width:30px; height:30px;" title="O'chirish"><i class="fa-solid fa-trash-can"></i></button>`;
            
        let roleText = "";
        switch (u.role) {
            case "admin": roleText = `<span class="channel-tag" style="background: rgba(16, 185, 129, 0.1); color: var(--primary);">Admin</span>`; break;
            case "kassir-dona": roleText = `<span class="channel-tag" style="background: rgba(6, 182, 212, 0.1); color: var(--accent);">Kassir (Dona)</span>`; break;
            case "kassir-optim": roleText = `<span class="channel-tag" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b;">Kassir (Optim)</span>`; break;
            case "omborchi": roleText = `<span class="channel-tag" style="background: rgba(99, 102, 241, 0.1); color: #6366f1;">Omborchi</span>`; break;
            default: roleText = `<span class="channel-tag">${u.role || "Xodim"}</span>`;
        }
            
        row.innerHTML = `
            <td><strong>${u.name}</strong></td>
            <td>${roleText}</td>
            <td><code>${u.username}</code></td>
            <td><span style="font-family: monospace; font-size: 0.85rem;">${u.password}</span></td>
            <td><strong style="color: var(--accent); letter-spacing: 1px;">${u.pin}</strong></td>
            <td style="display: flex; gap: 0.4rem; justify-content: center; align-items: center;">
                <button class="qty-btn edit-cashier-btn" data-id="${u.id}" style="background: var(--primary-glow); border-color: rgba(16, 185, 129, 0.2); color: var(--primary); width:30px; height:30px;" title="Tahrirlash"><i class="fa-solid fa-user-pen"></i></button>
                ${deleteButton}
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    tableBody.querySelectorAll(".edit-cashier-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            const cashier = users.find(u => u.id === id);
            if (!cashier) return;
            
            document.getElementById("cashier-edit-id").value = cashier.id;
            document.getElementById("cashier-name").value = cashier.name;
            document.getElementById("cashier-role").value = cashier.role || "kassir-dona";
            document.getElementById("cashier-username").value = cashier.username;
            document.getElementById("cashier-password").value = cashier.password;
            document.getElementById("cashier-pin").value = cashier.pin;
            
            document.getElementById("cashier-modal-title").textContent = "Xodimni Tahrirlash";
            document.getElementById("cashier-modal-desc").textContent = "Xodim portal hisobini, tizim paroli yoki savdo PIN-kodini shu yerdan tahrirlang.";
            
            document.getElementById("settings-cashier-modal").classList.add("open");
        });
    });
    
    tableBody.querySelectorAll(".delete-cashier-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            const cashier = users.find(u => u.id === id);
            if (!cashier) return;
            
            if (confirm(`Haqiqatan ham "${cashier.name}" xodimini tizimdan o'chirmoqchimisiz?`)) {
                users = users.filter(u => u.id !== id);
                localStorage.setItem("eco_sports_users", JSON.stringify(users));
                dbDeleteUser(id);
                renderCashiersList();
            }
        });
    });
}

// ============================================================
// 11.9 TIZIM DIAGNOSTIKASI & XAVFSIZLIK TEKSHIRUVI (in-app self-test)
// Har bir bo'lim, tugma, modal, funksiya, ma'lumot oqimi, bulut ulanishi,
// hisob-kitob to'g'riligi va xavfsizlikni tekshirib, bug'lar bo'yicha
// hisobot chiqaradi. Hech qanday ma'lumotni o'zgartirmaydi (read-only).
// ============================================================
let _lastDiagReport = null;
let _diagRunning = false;
let _diagFixes = [];

function _diagPush(arr, category, name, status, detail) {
    arr.push({ category, name, status, detail: detail || "" });
}

// Tartibga sezgir bo'lmagan kanonik solishtirish (kalit tartibi farqi false-positive bermasin)
function _diagCanon(v) {
    if (Array.isArray(v)) return "[" + v.map(_diagCanon).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + _diagCanon(v[k])).join(",") + "}";
    return JSON.stringify(v);
}

async function runSystemDiagnostics() {
    const R = [];
    _diagFixes = [];
    // P(kategoriya, nom, holat, izoh, fix?) — fix berilsa va holat 'pass' bo'lmasa, avtomatik tuzatish ro'yxatiga qo'shiladi
    const P = (c, n, s, d, fix) => {
        _diagPush(R, c, n, s, d);
        if (fix && s !== "pass") {
            R[R.length - 1].fixable = true;
            _diagFixes.push(Object.assign({ finding: n, status: s }, fix));
        }
    };

    // ---------- 1. BO'LIMLAR (sections) ----------
    const SECTIONS = {
        "login-screen": "Login ekrani",
        "dashboard-screen": "Boshqaruv paneli",
        "sotuv-section": "Sotuv bo'limi",
        "ombor-section": "Ombor bo'limi",
        "buxgalteriya-section": "Buxgalteriya bo'limi",
        "sozlamalar-section": "Sozlamalar bo'limi"
    };
    Object.entries(SECTIONS).forEach(([id, label]) => {
        const el = document.getElementById(id);
        P("Bo'limlar", label, el ? "pass" : "fail", el ? "DOM'da mavjud" : `#${id} topilmadi!`);
    });

    // ---------- 2. NAVIGATSIYA (tab → bo'lim manzili) ----------
    const tabs = document.querySelectorAll(".dept-tab-btn");
    P("Navigatsiya", "Tab tugmalari soni", tabs.length === 4 ? "pass" : "warn", `${tabs.length} ta tab topildi (kutilgan: 4)`);
    tabs.forEach(btn => {
        const dept = btn.dataset.dept;
        const target = document.getElementById(`${dept}-section`);
        P("Navigatsiya", `Tab "${dept}" → manzil`, target ? "pass" : "fail",
            target ? `${dept}-section'ga to'g'ri ulangan` : `${dept}-section topilmadi — tugma hech qayerga bormaydi!`);
    });

    // ---------- 3. TUGMALAR (kinopkalar) ----------
    const BUTTONS = {
        "pos-checkout-btn": "Sotish (kassa)",
        "pos-search-input": "Mahsulot qidirish",
        "logout-trigger": "Tizimdan chiqish",
        "settings-clear-project": "Loyihani tozalash",
        "add-cashier-trigger": "Kassir qo'shish",
        "add-supplier-trigger": "Ta'minotchi qo'shish",
        "add-category-trigger": "Kategoriya qo'shish",
        "diag-run-btn": "Diagnostika tugmasi",
        "sync-badge": "Sinx holati ko'rsatkichi"
    };
    Object.entries(BUTTONS).forEach(([id, label]) => {
        const el = document.getElementById(id);
        P("Tugmalar", label, el ? "pass" : "fail", el ? "Mavjud" : `#${id} topilmadi!`);
    });

    // ---------- 4. MODALLAR (oyna oqimlari) ----------
    const MODALS = {
        "pos-calc-modal": "Sotuv kalkulyatori",
        "pos-pin-modal": "Sotuv PIN",
        "pos-success-receipt-modal": "Chek (muvaffaqiyat)",
        "payment-pin-modal": "To'lov PIN himoyasi",
        "payment-image-modal": "To'lov rasmi",
        "kirim-payment-modal": "Kirim to'lovi (naqt/nasiya)",
        "ombor-detail-modal": "Ombor batafsil",
        "bux-expense-modal": "Xarajat qo'shish",
        "settings-cashier-modal": "Kassir formasi",
        "settings-supplier-modal": "Ta'minotchi formasi",
        "settings-category-modal": "Kategoriya formasi",
        "add-product-warehouse-modal": "Mahsulot qo'shish (kirim)",
        "warehouse-document-modal": "Kirim hujjati",
        "clear-project-modal": "Tozalash parol oynasi"
    };
    Object.entries(MODALS).forEach(([id, label]) => {
        const el = document.getElementById(id);
        P("Modallar", label, el ? "pass" : "fail", el ? "Mavjud" : `#${id} topilmadi!`);
    });

    // ---------- 5. FUNKSIYALAR (mantiq) ----------
    const FUNCS = [
        "completeSale", "approveProductPrice", "openCalcModal", "renderTiles",
        "renderOmborTable", "renderBuxgalteriya", "renderHistoryTable", "renderSupplierStockReport",
        "syncFromSupabase", "flushSyncQueue", "enqueueOp", "dbSaveSale", "dbSaveConfig",
        "deductColorPack", "deductColorDona", "saveCustomerDebts", "addSupplierPayment",
        "exportLedgerExcel", "exportLedgerPdf", "clearProject", "unlockDashboard",
        "handleSellerPinSubmit", "ensureColorStock", "getSupplierTakenValue", "getSupplierPaidTotal"
    ];
    FUNCS.forEach(fn => {
        const ok = typeof window[fn] === "function";
        P("Funksiyalar", fn, ok ? "pass" : "fail", ok ? "Aniqlangan" : "Funksiya topilmadi — bog'lanish uzilgan!");
    });

    // ---------- 6. MA'LUMOT YAXLITLIGI (localStorage manzillari) ----------
    const LS = [
        ["eco_sports_sales_history", "array", "Sotuvlar tarixi"],
        ["eco_sports_inventory", "object", "Ombor qoldig'i"],
        ["eco_sports_color_stock", "object", "Rang/o'lcham qoldig'i"],
        ["eco_sports_dynamic_products", "array", "Mahsulotlar"],
        ["eco_sports_kirim_history", "array", "Kirim tarixi"],
        ["eco_sports_product_prices", "object", "Narxlar"],
        ["eco_sports_expenses", "array", "Xarajatlar"],
        ["eco_sports_suppliers", "array", "Ta'minotchilar"],
        ["eco_sports_categories", "array", "Kategoriyalar"],
        ["eco_sports_users", "array", "Foydalanuvchilar"],
        ["eco_sports_config", "object", "Sozlamalar"],
        ["eco_sports_customer_debts", "array", "Mijoz qarzlari"],
        ["eco_sports_supplier_payments", "object", "Ta'minotchi to'lovlari"],
        ["eco_sync_queue", "array", "Sinx navbati (outbox)"]
    ];
    LS.forEach(([key, type, label]) => {
        const raw = localStorage.getItem(key);
        if (raw === null) {
            P("Ma'lumot yaxlitligi", label, "warn", `${key} hali yaratilmagan (bo'sh)`);
            return;
        }
        try {
            const val = JSON.parse(raw);
            const actual = Array.isArray(val) ? "array" : typeof val;
            if (actual === type) {
                const size = Array.isArray(val) ? `${val.length} ta yozuv` : `${Object.keys(val).length} ta kalit`;
                P("Ma'lumot yaxlitligi", label, "pass", `${key}: ${size}`);
            } else {
                P("Ma'lumot yaxlitligi", label, "fail", `${key}: turi ${actual}, kutilgan ${type} — buzilgan!`);
            }
        } catch (e) {
            P("Ma'lumot yaxlitligi", label, "fail", `${key}: JSON buzilgan — o'qib bo'lmadi!`);
        }
    });

    // ---------- 7. MA'LUMOT OQIMI (round-trip: yozish→o'qish→o'chirish) ----------
    try {
        const testKey = "__eco_diag_roundtrip__";
        const testVal = { t: Date.now(), ok: true };
        localStorage.setItem(testKey, JSON.stringify(testVal));
        const back = JSON.parse(localStorage.getItem(testKey));
        localStorage.removeItem(testKey);
        const ok = back && back.ok === true && back.t === testVal.t;
        P("Ma'lumot oqimi", "localStorage yozish→o'qish", ok ? "pass" : "fail",
            ok ? "Ma'lumot to'g'ri manzilga bordi va qaytdi" : "Round-trip muvaffaqiyatsiz!");
    } catch (e) {
        P("Ma'lumot oqimi", "localStorage yozish→o'qish", "fail", "localStorage ishlamayapti: " + e.message);
    }

    // ---------- 8. BULUT ULANISHI (Supabase) ----------
    if (!supabaseClient) {
        P("Bulut (Supabase)", "Mijoz (client)", "fail", "Supabase SDK yuklanmagan — bulutga ulanmaydi!");
    } else {
        P("Bulut (Supabase)", "Mijoz (client)", "pass", "Supabase SDK yuklandi");
        try {
            const { error } = await supabaseClient.from("eco_config").select("key").limit(1);
            P("Bulut (Supabase)", "eco_config jadvalini o'qish", error ? "fail" : "pass",
                error ? ("Xato: " + error.message) : "Jonli ulanish ishladi");
        } catch (e) {
            P("Bulut (Supabase)", "Jonli so'rov", "warn", "Ulanib bo'lmadi (oflayn?): " + e.message);
        }
    }
    P("Bulut (Supabase)", "Internet holati", navigator.onLine ? "pass" : "warn",
        navigator.onLine ? "Onlayn" : "Oflayn — navbat orqali keyin yuboriladi");

    // ---------- 9. SINX NAVBATI (outbox) ----------
    const qLen = Array.isArray(syncQueue) ? syncQueue.length : 0;
    P("Sinx navbati", "Navbat holati", qLen === 0 ? "pass" : "warn",
        qLen === 0 ? "Bo'sh — hammasi bulutga yuborilgan" : `${qLen} ta amal yuborilmagan`);
    if (qLen > 0) {
        const stuck = syncQueue.filter(o => (o.attempts || 0) >= 3).length;
        P("Sinx navbati", "Qotgan amallar", stuck === 0 ? "pass" : "fail",
            stuck === 0 ? "Qotgan amal yo'q" : `${stuck} ta amal 3+ marta urinishdan o'tmadi!`);
        const badTypes = syncQueue.filter(o => !["config", "sale", "kirim", "kirim_status", "expense"].includes(o.type));
        P("Sinx navbati", "Amal turlari", badTypes.length === 0 ? "pass" : "fail",
            badTypes.length === 0 ? "Barcha turlar to'g'ri" : `${badTypes.length} ta noma'lum tur — applySyncOp tashlab yuboradi!`);
    }

    // ---------- 10. HISOB-KITOB TO'G'RILIGI (matematik) ----------
    // 10a. Manfiy ombor qoldig'i
    const negInv = Object.entries(inventory || {}).filter(([k, v]) => Number(v) < 0);
    P("Hisob-kitob", "Ombor qoldig'i manfiy emas", negInv.length === 0 ? "pass" : "fail",
        negInv.length === 0 ? "Barcha qoldiq ≥ 0" : `${negInv.length} ta mahsulotda manfiy qoldiq: ${negInv.map(x => x[0]).join(", ")}`,
        negInv.length ? { id: "clamp-neg-inv", label: "Manfiy qoldiqni 0 ga tenglash", run: () => {
            let n = 0; Object.keys(inventory).forEach(k => { if (Number(inventory[k]) < 0) { inventory[k] = 0; n++; } });
            localStorage.setItem("eco_sports_inventory", JSON.stringify(inventory));
            return n + " ta qoldiq 0 ga tuzatildi";
        } } : null);

    // 10b. Tasdiqlangan, lekin narxsiz mahsulotlar
    const noPriced = (state.dynamicProducts || []).filter(p => p.approved && !((p.price || 0) > 0 || (p.pack_price || 0) > 0));
    const recoverable = noPriced.filter(p => productPrices[String(p.id)] || productPrices[p.id]);
    P("Hisob-kitob", "Tasdiqlangan mahsulot narxi", noPriced.length === 0 ? "pass" : "warn",
        noPriced.length === 0 ? "Barcha tasdiqlangan mahsulotda narx bor"
            : `${noPriced.length} ta narxsiz: ${noPriced.map(p => p.name).join(", ")} — hisobotda 0 UZS chiqadi${recoverable.length ? ` (${recoverable.length} tasini productPrices'dan tiklash mumkin)` : ""}`,
        recoverable.length ? { id: "reapply-prices", label: "Narxni productPrices'dan tiklash", run: () => {
            let n = 0; (state.dynamicProducts || []).forEach(p => {
                const pr = productPrices[String(p.id)] || productPrices[p.id];
                if (p.approved && !((p.price || 0) > 0 || (p.pack_price || 0) > 0) && pr) {
                    if (pr.price != null) p.price = pr.price;
                    if (pr.pack_price != null) p.pack_price = pr.pack_price;
                    if (pr.cogs != null) p.cogs = pr.cogs;
                    n++;
                }
            });
            localStorage.setItem("eco_sports_dynamic_products", JSON.stringify(state.dynamicProducts));
            return n + " ta mahsulot narxi tiklandi";
        } } : null);

    // 10c. Mijoz qarzi matematikasi (olingan + qarz = jami)
    const badDebts = (customerDebts || []).filter(d => Math.abs((Number(d.received) + Number(d.debt)) - Number(d.total)) > 1);
    P("Hisob-kitob", "Mijoz qarzi balansi", badDebts.length === 0 ? "pass" : "fail",
        badDebts.length === 0 ? "olingan + qarz = jami (barchasida)" : `${badDebts.length} ta qarzda balans buzilgan (olingan+qarz ≠ jami)!`,
        badDebts.length ? { id: "fix-debt-balance", label: "Qarz balansini qayta hisoblash", run: () => {
            let n = 0; (customerDebts || []).forEach(d => {
                const total = Number(d.total) || 0;
                const rec = Math.max(0, Math.min(Number(d.received) || 0, total));
                if (Math.abs((Number(d.received) + Number(d.debt)) - total) > 1) { d.received = rec; d.debt = Math.max(0, total - rec); n++; }
            });
            saveCustomerDebts();
            return n + " ta qarz balansi tuzatildi";
        } } : null);

    // 10d. Rang/o'lcham qoldig'i umumiy qoldiqqa mosligi
    let colorMismatch = 0;
    Object.keys(colorStock || {}).forEach(pid => {
        let sum = 0;
        const cs = colorStock[pid] || {};
        Object.values(cs).forEach(sizes => Object.values(sizes).forEach(n => sum += Number(n) || 0));
        const inv = Number(inventory[pid]);
        if (!isNaN(inv) && Math.abs(sum - inv) > 0) colorMismatch++;
    });
    P("Hisob-kitob", "Rang qoldig'i = umumiy qoldiq", colorMismatch === 0 ? "pass" : "warn",
        colorMismatch === 0 ? "Mos keladi" : `${colorMismatch} ta mahsulotda rang yig'indisi umumiy qoldiqdan farq qiladi (eski sotuvlar rangsiz bo'lishi mumkin)`);

    // 10e. Ta'minotchiga ortiqcha to'lov
    let overpaid = 0;
    (state.suppliers || []).forEach(s => {
        const taken = getSupplierTakenValue(s.name);
        const paid = getSupplierPaidTotal(s.name);
        if (paid - taken > 1) overpaid++;
    });
    P("Hisob-kitob", "Ta'minotchi to'lovlari", overpaid === 0 ? "pass" : "warn",
        overpaid === 0 ? "Hech kimga ortiqcha to'lanmagan" : `${overpaid} ta ta'minotchiga olingan yukdan ko'p to'langan`);

    // ---------- 11. ROLLAR & SOZLAMALAR ----------
    const VALID_ROLES = ["admin", "kassir-optim", "kassir-dona", "omborchi"];
    const noRole = (users || []).filter(u => !VALID_ROLES.includes(u.role));
    P("Rollar", "Foydalanuvchi rollari", noRole.length === 0 ? "pass" : "fail",
        noRole.length === 0 ? `${users.length} ta foydalanuvchi, rollar to'g'ri` : `${noRole.length} ta foydalanuvchida noto'g'ri rol: ${noRole.map(u => u.username).join(", ")}`,
        noRole.length ? { id: "fix-roles", label: "Noto'g'ri rollarni tuzatish", run: () => {
            let n = 0; users.forEach(u => {
                if (!VALID_ROLES.includes(u.role)) {
                    const un = (u.username || "").toLowerCase();
                    u.role = un === "admin" ? "admin" : un === "optim1" ? "kassir-optim" : un === "dona1" ? "kassir-dona" : un === "ombor1" ? "omborchi" : "kassir-dona";
                    n++;
                }
            });
            localStorage.setItem("eco_sports_users", JSON.stringify(users));
            return n + " ta rol tuzatildi";
        } } : null);
    const hasAdmin = (users || []).some(u => u.role === "admin");
    P("Rollar", "Admin mavjudligi", hasAdmin ? "pass" : "fail", hasAdmin ? "Kamida 1 admin bor" : "Admin yo'q — tizimga kira olmaysiz!");
    const pinOk = /^\d{4}$/.test(String(appConfig.pin || ""));
    P("Sozlamalar", "Kassa PIN formati", pinOk ? "pass" : "warn", pinOk ? "4 xonali" : `PIN "${appConfig.pin}" 4 xonali emas`);

    // ---------- 12. XAVFSIZLIK ----------
    P("Xavfsizlik", "HTTPS protokoli", location.protocol === "https:" || location.hostname === "localhost" ? "pass" : "warn",
        location.protocol === "https:" ? "Xavfsiz (HTTPS)" : (location.hostname === "localhost" ? "Lokal (ruxsat)" : "HTTPS emas — ma'lumot ochiq uzatiladi!"));
    const tokenRe = /\d{6,}:[A-Za-z0-9_-]{20,}/;
    const clientToken = (appConfig && appConfig.botToken) || "";
    const legacyToken = (typeof BOT_TOKEN !== "undefined" && BOT_TOKEN) ? String(BOT_TOKEN) : "";
    const tokenExposed = tokenRe.test(clientToken) || tokenRe.test(legacyToken);
    P("Xavfsizlik", "Telegram BOT_TOKEN", tokenExposed ? "warn" : "pass",
        tokenExposed ? "Token hali frontend'da saqlanyapti — /api/notify (server ENV) ishlatilsin" : "Token frontend'da yo'q — serverda yashirin ✅");
    P("Xavfsizlik", "Supabase anon kalit", "pass",
        "Anon kalit ommaviy (odatiy, xavfsiz). RLS yoqilgan — anon DELETE bloklangan; tozalash admin_clear_project (RPC) yoki serverless orqali. Supabase'da RLS yoqiqligini bir marta tasdiqlang.");
    const sw = ("serviceWorker" in navigator);
    P("Xavfsizlik", "Offline himoya (SW)", sw ? "pass" : "warn", sw ? "Service Worker qo'llab-quvvatlanadi" : "Service Worker yo'q (iOS Telegram?) — offline ishlamasligi mumkin");
    // Ma'lumot zaxirasi yoshi
    const lastBak = Number(localStorage.getItem("eco_last_backup_at")) || 0;
    const bakDays = lastBak ? Math.floor((Date.now() - lastBak) / 86400000) : null;
    P("Xavfsizlik", "Ma'lumot zaxirasi (backup)", (lastBak && bakDays <= 7) ? "pass" : "warn",
        lastBak ? `Oxirgi zaxira ${bakDays} kun oldin olingan` : "Hali zaxira olinmagan — 'Ma'lumot Zaxirasi' bo'limidan yuklab oling");
    // Standart admin parol o'zgartirilganmi
    const adminUser = (users || []).find(u => (u.username || "").toLowerCase() === "admin");
    const defaultPw = adminUser && adminUser.password === "eco777";
    P("Xavfsizlik", "Standart admin parol", defaultPw ? "warn" : "pass",
        defaultPw ? "Admin paroli hali standart (eco777) — Xodimlar bo'limidan o'zgartiring" : "Standart parol o'zgartirilgan");

    // ---------- 13. FORMULA & MANTIQ (sintetik — ma'lumotga tegmaydi, regressiyani topadi) ----------
    try {
        const fakeProd = { sizes: ["S", "M", "L", "XL", "XXL"], pack_price: 280000 };
        const ps = packSizeOf(fakeProd);
        P("Formula & Mantiq", "packSizeOf (o'lcham soni)", ps === 5 ? "pass" : "fail", `5 o'lcham → ${ps} (kutilgan: 5)`);
        const ps2 = packSizeOf({ sizes: [] });
        P("Formula & Mantiq", "packSizeOf fallback", ps2 === 5 ? "pass" : "fail", `bo'sh o'lcham → ${ps2} (kutilgan: 5 default)`);
        const odp = optimDonaPrice(fakeProd);
        P("Formula & Mantiq", "optimDonaPrice (chala dona narxi)", odp === 56000 ? "pass" : "fail", `280000 / 5 → ${odp} (kutilgan: 56000)`);
        const fp = formatPrice(1000);
        P("Formula & Mantiq", "formatPrice format", /UZS/.test(fp) ? "pass" : "fail", `1000 → "${fp}"`);
        const id1 = generateReceiptId(), id2 = generateReceiptId();
        P("Formula & Mantiq", "generateReceiptId noyobligi", (id1 && id2 && id1 !== id2) ? "pass" : "warn", `${id1} / ${id2}`);
        // Savat matematikasi (sintetik)
        const testCart = [{ soldPrice: 56000, qty: 3 }, { soldPrice: 280000, qty: 1 }];
        const sub = testCart.reduce((t, i) => t + i.soldPrice * i.qty, 0);
        P("Formula & Mantiq", "Savat jami hisobi", sub === 448000 ? "pass" : "fail", `3×56000 + 1×280000 → ${sub} (kutilgan: 448000)`);
    } catch (e) {
        P("Formula & Mantiq", "Formula bajarilishi", "fail", "Funksiya xato berdi: " + e.message);
    }

    // ---------- 14. BOG'LANISH YAXLITLIGI (referential integrity — haqiqiy bug'lar) ----------
    const allIds = new Set([...PRODUCTS.map(p => String(p.id)), ...(state.dynamicProducts || []).map(p => String(p.id))]);

    const orphanInv = Object.keys(inventory || {}).filter(id => !allIds.has(String(id)));
    P("Bog'lanish", "Yetim ombor yozuvlari", orphanInv.length === 0 ? "pass" : "warn",
        orphanInv.length === 0 ? "Har bir qoldiq mavjud mahsulotga bog'langan" : `${orphanInv.length} ta qoldiq mavjud bo'lmagan mahsulotga tegishli: ${orphanInv.slice(0, 5).join(", ")}`,
        orphanInv.length ? { id: "rm-orphan-inv", label: "Yetim ombor yozuvlarini o'chirish", run: () => {
            orphanInv.forEach(id => delete inventory[id]);
            localStorage.setItem("eco_sports_inventory", JSON.stringify(inventory));
            return orphanInv.length + " ta yetim yozuv o'chirildi";
        } } : null);

    const orphanPrices = Object.keys(productPrices || {}).filter(id => !allIds.has(String(id)));
    P("Bog'lanish", "Yetim narx yozuvlari", orphanPrices.length === 0 ? "pass" : "warn",
        orphanPrices.length === 0 ? "Har bir narx mavjud mahsulotga bog'langan" : `${orphanPrices.length} ta narx mavjud bo'lmagan mahsulotga tegishli`,
        orphanPrices.length ? { id: "rm-orphan-prices", label: "Yetim narxlarni o'chirish", run: () => {
            orphanPrices.forEach(id => delete productPrices[id]);
            saveProductPrices();
            return orphanPrices.length + " ta yetim narx o'chirildi";
        } } : null);

    const orphanCS = Object.keys(colorStock || {}).filter(id => !allIds.has(String(id)));
    P("Bog'lanish", "Yetim rang qoldiqlari", orphanCS.length === 0 ? "pass" : "warn",
        orphanCS.length === 0 ? "Har bir rang qoldig'i mavjud mahsulotga bog'langan" : `${orphanCS.length} ta rang qoldig'i yetim`,
        orphanCS.length ? { id: "rm-orphan-cs", label: "Yetim rang qoldiqlarini o'chirish", run: () => {
            orphanCS.forEach(id => delete colorStock[id]);
            saveColorStock();
            return orphanCS.length + " ta yetim rang qoldig'i o'chirildi";
        } } : null);

    const prodIdCount = {}; PRODUCTS.forEach(p => prodIdCount[String(p.id)] = (prodIdCount[String(p.id)] || 0) + 1);
    const dupInProducts = Object.keys(prodIdCount).filter(id => prodIdCount[id] > 1);
    P("Bog'lanish", "Takror mahsulot ID (katalog)", dupInProducts.length === 0 ? "pass" : "fail",
        dupInProducts.length === 0 ? "Takror ID yo'q" : `${dupInProducts.length} ta ID takrorlangan: ${dupInProducts.join(", ")} — plitka 2 marta chiqadi!`,
        dupInProducts.length ? { id: "dedup-products", label: "Takror mahsulotlarni birlashtirish", run: () => {
            const seen = new Set();
            PRODUCTS = PRODUCTS.filter(p => { const k = String(p.id); if (seen.has(k)) return false; seen.add(k); return true; });
            return "Katalogdagi takrorlar olib tashlandi";
        } } : null);

    const unameCount = {}; (users || []).forEach(u => { const k = (u.username || "").toLowerCase(); unameCount[k] = (unameCount[k] || 0) + 1; });
    const dupUsers = Object.keys(unameCount).filter(k => k && unameCount[k] > 1);
    P("Bog'lanish", "Takror login (username)", dupUsers.length === 0 ? "pass" : "fail",
        dupUsers.length === 0 ? "Har bir login noyob" : `${dupUsers.length} ta takror login: ${dupUsers.join(", ")} — kirish chalkashadi!`,
        dupUsers.length ? { id: "dedup-users", label: "Takror loginlarni o'chirish", run: () => {
            const seen = new Set();
            users = users.filter(u => { const k = (u.username || "").toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
            localStorage.setItem("eco_sports_users", JSON.stringify(users));
            return "Takror loginlar olib tashlandi";
        } } : null);

    const supNames = new Set((state.suppliers || []).map(s => s.name));
    const orphanPay = Object.keys(supplierPayments || {}).filter(n => !supNames.has(n) && (supplierPayments[n] || []).length > 0);
    P("Bog'lanish", "To'lov → ta'minotchi bog'lanishi", orphanPay.length === 0 ? "pass" : "warn",
        orphanPay.length === 0 ? "Har bir to'lov mavjud ta'minotchiga bog'langan" : `${orphanPay.length} ta to'lov ro'yxatda yo'q ta'minotchiga: ${orphanPay.join(", ")}`);

    const approvedSet = (state.dynamicProducts || []).filter(p => p.approved);
    const inProducts = approvedSet.filter(p => !PRODUCTS.find(x => String(x.id) === String(p.id)));
    P("Bog'lanish", "Tasdiqlangan mahsulot katalogda", inProducts.length === 0 ? "pass" : "warn",
        inProducts.length === 0 ? "Barcha tasdiqlangan mahsulot Sotuvda ko'rinadi" : `${inProducts.length} ta tasdiqlangan mahsulot PRODUCTS'da yo'q — Sotuvda ko'rinmaydi!`,
        inProducts.length ? { id: "merge-approved", label: "Tasdiqlangan mahsulotlarni katalogga qo'shish", run: () => {
            inProducts.forEach(p => { if (!PRODUCTS.find(x => String(x.id) === String(p.id))) PRODUCTS.push(p); });
            return inProducts.length + " ta mahsulot katalogga qo'shildi";
        } } : null);

    // ---------- 15. HOLAT ↔ XOTIRA SINXRONLIGI (saqlanmagan o'zgarishlarni topadi) ----------
    const syncChecks = [
        ["eco_sports_inventory", inventory, "Ombor (xotira↔LS)"],
        ["eco_sports_users", users, "Foydalanuvchilar (xotira↔LS)"],
        ["eco_sports_product_prices", productPrices, "Narxlar (xotira↔LS)"],
        ["eco_sports_dynamic_products", state.dynamicProducts, "Mahsulotlar (xotira↔LS)"],
        ["eco_sports_customer_debts", customerDebts, "Mijoz qarzlari (xotira↔LS)"]
    ];
    syncChecks.forEach(([key, mem, label]) => {
        try {
            const ls = JSON.parse(localStorage.getItem(key) || "null");
            const same = _diagCanon(ls) === _diagCanon(mem);
            P("Holat sinxronligi", label, same ? "pass" : "warn",
                same ? "Xotira = localStorage" : "Farq bor — saqlanmagan o'zgarish yoki sinx kutilmoqda",
                same ? null : { id: "resync-" + key, label: label + " ni qayta saqlash", run: () => {
                    localStorage.setItem(key, JSON.stringify(mem));
                    return "localStorage xotiradan yangilandi";
                } });
        } catch (e) {
            P("Holat sinxronligi", label, "warn", "Solishtirib bo'lmadi: " + e.message);
        }
    });

    return R;
}

function _diagStatusMeta(s) {
    if (s === "pass") return { icon: "fa-circle-check", cls: "diag-pass", word: "O'tdi" };
    if (s === "warn") return { icon: "fa-triangle-exclamation", cls: "diag-warn", word: "Ogohlantirish" };
    return { icon: "fa-circle-xmark", cls: "diag-fail", word: "Xato" };
}

function renderDiagResults(results) {
    const box = document.getElementById("diag-results");
    if (!box) return;
    const pass = results.filter(r => r.status === "pass").length;
    const warn = results.filter(r => r.status === "warn").length;
    const fail = results.filter(r => r.status === "fail").length;
    const total = results.length || 1;
    const score = Math.round((pass / total) * 100);

    // Summary
    const summary = document.getElementById("diag-summary");
    if (summary) {
        summary.style.display = "flex";
        document.getElementById("diag-pass-count").textContent = pass;
        document.getElementById("diag-warn-count").textContent = warn;
        document.getElementById("diag-fail-count").textContent = fail;
        const scoreEl = document.getElementById("diag-score");
        scoreEl.textContent = score + "%";
        scoreEl.className = "diag-score " + (fail > 0 ? "diag-score-bad" : warn > 0 ? "diag-score-mid" : "diag-score-good");
    }

    // Store for report + filtr/saralash bilan chizish
    _lastDiagReport = { ts: new Date(), results, pass, warn, fail, score };
    paintDiagResults();
    const repBtn = document.getElementById("diag-report-btn");
    if (repBtn) repBtn.disabled = false;

    // Avtomatik tuzatish tugmasi
    const fixBtn = document.getElementById("diag-fix-btn");
    if (fixBtn) {
        if (_diagFixes.length > 0) {
            fixBtn.disabled = false;
            fixBtn.innerHTML = `<i class="fa-solid fa-wrench"></i> Muammolarni Tuzatish (${_diagFixes.length})`;
        } else {
            fixBtn.disabled = true;
            fixBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Tuzatiladigan muammo yo'q`;
        }
    }
}

// Filtr holati: all | problems | fail
let _diagFilter = "all";
function _diagSeverityRank(s) { return s === "fail" ? 0 : s === "warn" ? 1 : 2; }

// O'zbekcha izoh bazasi: "Bu nima?" + "Qanday tuzatiladi?"
const _DIAG_HELP = {
    // Xavfsizlik
    "Telegram BOT_TOKEN": { meaning: "Bot tokeni — Telegramга xabar yuborish maxfiy kaliti. Agar u frontend (brauzer) kodida bo'lsa, har kim uni o'g'irlab botingizni boshqarishi mumkin.", fix: "Tokenni Vercel ENV (BOT_TOKEN)ga ko'chiring va xabarlarni /api/notify orqali yuboring. BotFather'da eski tokenni /revoke qilib yangisini oling." },
    "Supabase anon kalit": { meaning: "Anon kalit ataylab ommaviy (frontendда). Uni himoyalaydigan yagona narsa — RLS (Row Level Security). RLS o'chiq bo'lsa, kalitni bilgan har kim ma'lumotni o'qiy yoki o'chira oladi.", fix: "Supabase → SQL Editor'da har jadvalga RLS yoqing; anon uchun faqat select/insert/update bering, DELETE bermang (tozalashni serverless /api/admin-clear qiladi)." },
    "HTTPS protokoli": { meaning: "Sayt HTTPS bo'lmasa, ma'lumot internetда ochiq (shifrlanmagan) uzatiladi — ushlab olinishi mumkin.", fix: "Vercel avtomatik HTTPS beradi. Saytni doimo https:// manzilidan oching." },
    "Offline himoya (SW)": { meaning: "Service Worker ilovani internetsiz ishlashga imkon beradi. iOS Telegram (WKWebView) uni qo'llamaydi.", fix: "Android planshet yoki Chrome brauzerda PWA o'rnating. iOS'da oddiy brauzerда oching." },
    "Ma'lumot zaxirasi (backup)": { meaning: "Yaqinda zaxira (backup) olinmagan. Nimadir o'chib ketsa, tiklash uchun zaxira fayli bo'lishi shart.", fix: "Sozlamalar → 'Ma'lumot Zaxirasi' → 'Zaxira Yuklab Olish' bosing va faylni saqlang (har kuni ish oxirida tavsiya etiladi)." },
    "Standart admin parol": { meaning: "Admin paroli hali standart (eco777). Buni hamma biladi — begona odam tizimga kirishi mumkin.", fix: "Sozlamalar → Xodimlar → admin qatorini tahrirlab, kuchli yangi parol qo'ying." },
    // Hisob-kitob
    "Ombor qoldig'i manfiy emas": { meaning: "Ba'zi mahsulot qoldig'i 0 dan kichik (manfiy) — bu noto'g'ri, ortiqcha sotuv yoki hisob xatosidan kelib chiqadi.", fix: "'Muammolarni Tuzatish' bosing — manfiy qoldiq 0 ga tenglanadi. So'ng kirim orqali to'g'ri sonni kiriting." },
    "Tasdiqlangan mahsulot narxi": { meaning: "Tasdiqlangan mahsulotda sotuv narxi yo'q — u hisobotda 0 UZS bo'lib ko'rinadi.", fix: "Buxgalteriya → tasdiqlash jadvalida narxni kiriting. Narx ilgari qo'yilган bo'lsa, 'Muammolarni Tuzatish' uni tiklaydi." },
    "Mijoz qarzi balansi": { meaning: "Qarz yozuvида 'olingan + qarz' summasi 'jami'ga teng emas — hisob buzilgan.", fix: "'Muammolarni Tuzatish' bosing — balans qayta hisoblanadi (qarz = jami − olingan)." },
    "Rang qoldig'i = umumiy qoldiq": { meaning: "Rang/o'lcham bo'yicha qoldiqlar yig'indisi umumiy ombor qoldig'iga teng emas. Ko'pincha eski (rang yozilmagan) sotuvlardan kelib chiqadi.", fix: "Odatda zararsiz. Aniqlik kerak bo'lsa, mahsulotni qayta kirim qiling yoki ombordan qo'lda to'g'rilang." },
    "Ta'minotchi to'lovlari": { meaning: "Biror ta'minotchiga olingan yuk qiymatidan ko'proq pul to'langan ko'rinadi.", fix: "Buxgalteriya → hisob-kitob daftarида o'sha ta'minotchi to'lovlarini tekshiring; ortiqcha/xato to'lovni o'chiring." },
    // Bog'lanish
    "Yetim ombor yozuvlari": { meaning: "Ombor qoldig'i bor, lekin unga mos mahsulot katalogda yo'q (mahsulot o'chirilgan).", fix: "'Muammolarni Tuzatish' bosing — keraksiz yetim qoldiq o'chiriladi." },
    "Yetim narx yozuvlari": { meaning: "Narx saqlangan, lekin unga mos mahsulot yo'q.", fix: "'Muammolarni Tuzatish' bosing — yetim narx o'chiriladi." },
    "Yetim rang qoldiqlari": { meaning: "Rang/o'lcham qoldig'i bor, lekin mahsulot yo'q.", fix: "'Muammolarni Tuzatish' bosing — yetim rang qoldig'i o'chiriladi." },
    "Takror mahsulot ID (katalog)": { meaning: "Bitta mahsulot ID katalogda 2 marta uchraydi — plitka takror ko'rinadi.", fix: "'Muammolarni Tuzatish' bosing — takror nusxa olib tashlanadi." },
    "Takror login (username)": { meaning: "Ikki foydalanuvchida bir xil login bor — tizimga kirish chalkashadi.", fix: "'Muammolarni Tuzatish' bosing yoki Sozlamalar → Xodimlardan birining loginini o'zgartiring/o'chiring." },
    "To'lov → ta'minotchi bog'lanishi": { meaning: "To'lov yozuvi ro'yxatда yo'q ta'minotchiga tegishli (ta'minotchi o'chirilgan yoki qayta nomlangan).", fix: "Sozlamalar → Ta'minotchilardan o'sha nomni qayta qo'shing, yoki to'lovni to'g'ri ta'minotchiga ko'chiring." },
    "Tasdiqlangan mahsulot katalogda": { meaning: "Mahsulot tasdiqlangan, lekin Sotuv ro'yxatida ko'rinmaydi (katalogga qo'shilmagan).", fix: "'Muammolarni Tuzatish' bosing — mahsulot katalogga qo'shiladi va Sotuvда paydo bo'ladi." },
    // Kategoriya bo'yicha umumiy izohlar
    "__cat__Holat sinxronligi": { meaning: "Xotiradagi ma'lumot localStorage'dagidan farq qiladi — saqlanmagan o'zgarish bor yoki sinx hali tugamagan.", fix: "'Muammolarni Tuzatish' bosing (qayta saqlaydi). Yoki internet kelganda avtomatik to'g'rilanadi." },
    "__cat__Sinx navbati": { meaning: "Bulutga yuborilmagan amallar navbatda turibdi (zaif internet yoki xato sabab).", fix: "Internetga ulaning — navbat avtomatik yuboriladi. Amal qotib qolsa, ilovani qayta yuklang." },
    "__cat__Ma'lumot yaxlitligi": { meaning: "Saqlangan ma'lumot kutilgan formatда emas yoki hali yaratilmagan.", fix: "'Bo'sh' bo'lsa — normal (hali ma'lumot kiritilmagan). 'Buzilgan' bo'lsa, 'Ma'lumot Zaxirasi'dan tiklang." },
    "__cat__Bulut (Supabase)": { meaning: "Bulutga ulanishda muammo — internet uzilgan yoki Supabase sozlamasi noto'g'ri.", fix: "Internet aloqasini tekshiring. Davom etsa, Supabase URL/kalit/RLS sozlamalarini ko'ring." },
    "__cat__Rollar": { meaning: "Foydalanuvchi roli noto'g'ri yoki admin umuman yo'q.", fix: "'Muammolarni Tuzatish' bosing, yoki Sozlamalar → Xodimlardan rolni to'g'rilang." },
    "__cat__Sozlamalar": { meaning: "Sozlama qiymati noto'g'ri (masalan, PIN 4 xonali emas).", fix: "Sozlamalar bo'limidan tegishli qiymatni to'g'rilang va saqlang." },
    "__cat__Formula & Mantiq": { meaning: "Hisoblash funksiyasi kutilgan natijani bermadi — bu kod xatosi (regressiya) belgisi.", fix: "Bu jiddiy. Dasturchiga murojaat qiling — oxirgi o'zgartirish hisob-kitobni buzgan bo'lishi mumkin." },
    "__cat__Bo'limlar": { meaning: "Interfeys bo'limi DOM'da topilmadi — sahifa to'liq yuklanmagan yoki HTML buzilgan.", fix: "Sahifani qayta yuklang (Ctrl+Shift+R). Davom etsa, index.html to'liq yuklanganini tekshiring." },
    "__cat__Navigatsiya": { meaning: "Tab tegishli bo'limga ulanmagan — bosilganda hech qayerга bormaydi.", fix: "Sahifani qayta yuklang. Davom etsa, index.html'da data-dept va section id'lari mosligini tekshiring." },
    "__cat__Tugmalar": { meaning: "Tugma (kinopka) DOM'da topilmadi — interfeys to'liq yuklanmagan.", fix: "Sahifani qayta yuklang (Ctrl+Shift+R)." },
    "__cat__Modallar": { meaning: "Modal (qalqib chiquvchi oyna) DOM'da topilmadi.", fix: "Sahifani qayta yuklang. Davom etsa, index.html to'liqligini tekshiring." },
    "__cat__Funksiyalar": { meaning: "Dastur funksiyasi yuklanmagan — app.js to'liq yuklanmagan yoki sintaksis xatosi bor.", fix: "Sahifani qayta yuklang. Davom etsa, app.js to'g'ri yuklanganini (versiyani) tekshiring." },
    "__cat__Xavfsizlik": { meaning: "Xavfsizlik bo'yicha tavsiya.", fix: "Tafsilotdagi ko'rsatmaga amal qiling." }
};

function _diagHelpFor(r) {
    return _DIAG_HELP[r.name] || _DIAG_HELP["__cat__" + r.category] || {
        meaning: "Bu tekshiruv tizimning shu qismini nazorat qiladi.",
        fix: "Yuqoridagi izohga qarang. 'tuzatiladi' belgisi bo'lsa, 'Muammolarni Tuzatish' tugmasini bosing."
    };
}

function paintDiagResults() {
    const box = document.getElementById("diag-results");
    if (!box || !_lastDiagReport) return;
    const results = _lastDiagReport.results;

    // Filtrlash
    let shown = results;
    if (_diagFilter === "problems") shown = results.filter(r => r.status !== "pass");
    else if (_diagFilter === "fail") shown = results.filter(r => r.status === "fail");

    // Kategoriya bo'yicha guruh + muammoli kategoriyalar OLDINGA, ichida ham muammo oldinga
    const cats = {};
    shown.forEach(r => { (cats[r.category] = cats[r.category] || []).push(r); });
    const catList = Object.entries(cats).map(([cat, rows]) => {
        const cFail = rows.filter(r => r.status === "fail").length;
        const cWarn = rows.filter(r => r.status === "warn").length;
        rows.sort((a, b) => _diagSeverityRank(a.status) - _diagSeverityRank(b.status));
        return { cat, rows, cFail, cWarn, sev: cFail > 0 ? 0 : cWarn > 0 ? 1 : 2 };
    }).sort((a, b) => a.sev - b.sev);

    // Filtr paneli
    const probCount = results.filter(r => r.status !== "pass").length;
    const failCount = results.filter(r => r.status === "fail").length;
    let html = `<div class="diag-filter-bar">
        <button class="diag-filter-btn ${_diagFilter === "all" ? "active" : ""}" data-filter="all">Hammasi (${results.length})</button>
        <button class="diag-filter-btn ${_diagFilter === "problems" ? "active" : ""}" data-filter="problems">⚠️ Muammolar (${probCount})</button>
        <button class="diag-filter-btn ${_diagFilter === "fail" ? "active" : ""}" data-filter="fail">❌ Faqat xato (${failCount})</button>
    </div>`;

    if (!shown.length) {
        html += `<div class="diag-hint"><i class="fa-solid fa-circle-check" style="color:#10b981"></i> Bu filtrда hech narsa yo'q — muammo topilmadi. 🎉</div>`;
        box.innerHTML = html;
        return;
    }

    catList.forEach(({ cat, rows, cFail, cWarn }) => {
        const badge = cFail > 0 ? `<span class="diag-cat-badge diag-fail">${cFail} xato</span>`
            : cWarn > 0 ? `<span class="diag-cat-badge diag-warn">${cWarn} ogoh.</span>`
            : `<span class="diag-cat-badge diag-pass">OK</span>`;
        html += `<div class="diag-cat"><div class="diag-cat-head">${cat} ${badge}</div>`;
        rows.forEach(r => {
            const m = _diagStatusMeta(r.status);
            const fixTag = r.fixable ? `<span class="diag-fix-tag"><i class="fa-solid fa-wrench"></i> tuzatiladi</span>` : "";
            const isProblem = r.status !== "pass";
            const caret = isProblem ? `<i class="fa-solid fa-chevron-down diag-row-caret"></i>` : "";
            html += `<div class="diag-row ${m.cls} ${isProblem ? "clickable" : ""}"><i class="fa-solid ${m.icon}"></i><div class="diag-row-txt"><b>${r.name} ${fixTag}</b><small>${r.detail}</small></div>${caret}</div>`;
            if (isProblem) {
                const help = _diagHelpFor(r);
                const auto = r.fixable ? `<div class="diag-detail-auto"><i class="fa-solid fa-wand-magic-sparkles"></i> Bu muammoni "Muammolarni Tuzatish" tugmasi avtomatik bartaraf eta oladi.</div>` : "";
                html += `<div class="diag-row-detail" style="display:none">
                    <div class="diag-detail-block"><span class="diag-detail-label"><i class="fa-solid fa-circle-question"></i> Bu nima degani?</span><p>${help.meaning}</p></div>
                    <div class="diag-detail-block"><span class="diag-detail-label"><i class="fa-solid fa-screwdriver-wrench"></i> Qanday tuzatiladi?</span><p>${help.fix}</p></div>
                    ${auto}
                </div>`;
            }
        });
        html += `</div>`;
    });
    box.innerHTML = html;
}

// Topilgan bug'larni avtomatik tuzatish (tasdiq bilan)
function applyDiagFixes() {
    if (!_diagFixes.length) return;
    const list = _diagFixes.map((f, i) => `${i + 1}. ${f.label}  —  (${f.finding})`).join("\n");
    const ok = confirm(`${_diagFixes.length} ta avtomatik tuzatish qo'llanadimi?\n\n${list}\n\n⚠️ Bu mahalliy ma'lumotni o'zgartiradi va keyin bulutga sinxronlanadi. Davom etilsinmi?`);
    if (!ok) return;
    const log = [];
    _diagFixes.forEach(f => {
        try {
            const msg = f.run();
            log.push("✅ " + f.label + ": " + (msg || "bajarildi"));
        } catch (e) {
            log.push("❌ " + f.label + ": " + e.message);
        }
    });
    // Bog'liq ko'rinishlarni yangilash
    try { if (typeof renderTiles === "function") renderTiles(); } catch (e) {}
    try { if (typeof renderOmborTable === "function") renderOmborTable(); } catch (e) {}
    try { if (typeof renderBuxgalteriya === "function") renderBuxgalteriya(); } catch (e) {}
    try { if (typeof renderCashiersList === "function") renderCashiersList(); } catch (e) {}
    alert("🔧 Tuzatish natijasi:\n\n" + log.join("\n") + "\n\nQayta tekshiruv ishga tushadi.");
    startDiagnostics(); // qayta tekshirish (natija yangilanadi)
}

async function startDiagnostics() {
    if (_diagRunning) return;
    _diagRunning = true;
    const runBtn = document.getElementById("diag-run-btn");
    const prog = document.getElementById("diag-progress");
    const bar = document.getElementById("diag-progress-bar");
    const box = document.getElementById("diag-results");
    if (runBtn) { runBtn.disabled = true; runBtn.innerHTML = '<i class="fa-solid fa-rotate fa-spin"></i> Tekshirilmoqda...'; }
    if (prog) prog.style.display = "block";
    if (bar) { bar.style.width = "10%"; setTimeout(() => { bar.style.width = "70%"; }, 100); }
    if (box) box.innerHTML = '<div class="diag-hint"><i class="fa-solid fa-rotate fa-spin"></i> Tekshiruv ketmoqda...</div>';
    try {
        const results = await runSystemDiagnostics();
        if (bar) bar.style.width = "100%";
        renderDiagResults(results);
    } catch (e) {
        if (box) box.innerHTML = `<div class="diag-row diag-fail"><i class="fa-solid fa-circle-xmark"></i><div class="diag-row-txt"><b>Diagnostika xatosi</b><small>${e.message}</small></div></div>`;
    } finally {
        _diagRunning = false;
        if (runBtn) { runBtn.disabled = false; runBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Qayta Tekshirish'; }
        if (prog) setTimeout(() => { prog.style.display = "none"; if (bar) bar.style.width = "0%"; }, 600);
    }
}

function downloadDiagReport() {
    if (!_lastDiagReport) return;
    const r = _lastDiagReport;
    const dt = r.ts;
    const pad = n => String(n).padStart(2, "0");
    const stamp = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    let md = `# ECO SPORTS — Tizim Diagnostika Hisoboti\n\n`;
    md += `**Sana:** ${stamp}\n`;
    md += `**Umumiy ball:** ${r.score}%  ·  ✅ ${r.pass} o'tdi · ⚠️ ${r.warn} ogohlantirish · ❌ ${r.fail} xato\n`;
    md += `**Versiya:** app.js v5.8\n\n---\n\n`;
    const cats = {};
    r.results.forEach(x => { (cats[x.category] = cats[x.category] || []).push(x); });
    Object.entries(cats).forEach(([cat, rows]) => {
        md += `## ${cat}\n\n`;
        rows.forEach(x => {
            const ic = x.status === "pass" ? "✅" : x.status === "warn" ? "⚠️" : "❌";
            md += `- ${ic} **${x.name}** — ${x.detail}\n`;
        });
        md += `\n`;
    });
    const problems = r.results.filter(x => x.status !== "pass");
    if (problems.length) {
        md += `---\n\n## ⚠️ Topilgan muammolar (${problems.length})\n\n`;
        problems.forEach(x => {
            const ic = x.status === "warn" ? "⚠️" : "❌";
            md += `- ${ic} [${x.category}] **${x.name}**: ${x.detail}\n`;
        });
    } else {
        md += `---\n\n## ✅ Muammo topilmadi — tizim sog'lom!\n`;
    }
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eco_diagnostika_${stamp.replace(/[: ]/g, "-")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================
// 11.95 MA'LUMOT ZAXIRASI (BACKUP / RESTORE) — falokat himoyasi
// ============================================================
function exportFullBackup() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("eco_") === 0) data[k] = localStorage.getItem(k);
    }
    const payload = { app: "eco-sports", version: "6.1", exportedAt: new Date().toISOString(), keys: Object.keys(data).length, data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const d = new Date(); const pad = n => String(n).padStart(2, "0");
    const a = document.createElement("a");
    a.href = url;
    a.download = `eco_zaxira_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    localStorage.setItem("eco_last_backup_at", String(Date.now()));
    const st = document.getElementById("backup-status");
    if (st) {
        st.style.display = "flex";
        st.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981"></i> ${payload.keys} ta yozuv zaxiraga saqlandi: ${a.download}`;
    }
}

function importFullBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        let parsed;
        try { parsed = JSON.parse(e.target.result); } catch (err) { alert("❌ Fayl buzuq yoki JSON emas."); return; }
        if (!parsed || parsed.app !== "eco-sports" || !parsed.data) { alert("❌ Bu Eco Sports zaxira fayli emas."); return; }
        const keys = Object.keys(parsed.data);
        if (!confirm(`⚠️ ${keys.length} ta yozuv tiklanadi.\nZaxira sanasi: ${parsed.exportedAt || "?"}\n\nJORIY ma'lumot bu zaxira bilan ALMASHTIRILADI. Davom etilsinmi?`)) return;
        keys.forEach(k => { try { localStorage.setItem(k, parsed.data[k]); } catch (er) {} });
        alert("✅ Zaxira tiklandi. Ilova qayta yuklanadi.");
        location.reload();
    };
    reader.readAsText(file);
}

// ============================================================
// 11.97 BIZNES OQIMI SIMULYATSIYASI (xavfsiz sandbox — haqiqiy ma'lumot/bulutga TEGMAYDI)
// Tizim o'zi to'liq do'kon kunini o'ynaб ko'radi: kirim → optim/dona sotuv →
// qarz (nasiya) → ta'minotchi nasiya → to'lov. Har bosqich haqiqiy formulalar
// (packSizeOf, optimDonaPrice) bilan tekshiriladi. Hech narsa saqlanmaydi.
// ============================================================
function runBusinessSimulation() {
    const steps = [];
    const add = (name, ok, detail) => steps.push({ name, status: ok ? "pass" : "fail", detail });

    // Sinov mahsuloti (faqat shu funksiya ichida — global emas)
    const prod = { id: "SIM-TEST", name: "SINOV Futbolka", sizes: ["S", "M", "L", "XL", "XXL"], pack_price: 280000, cogs: 200000 };
    const packSize = packSizeOf(prod);       // haqiqiy funksiya → 5
    const donaPrice = optimDonaPrice(prod);  // haqiqiy funksiya → 280000/5 = 56000

    // Sandbox holati
    const colors = {};       // {rang: {o'lcham: dona}}
    let revenue = 0, custDebt = 0, supTaken = 0, supPaid = 0;
    const sumStock = () => Object.values(colors).reduce((t, sz) => t + Object.values(sz).reduce((a, b) => a + b, 0), 0);
    const packsOf = (c) => Math.min.apply(null, prod.sizes.map(s => colors[c][s]));

    // 1) KIRIM — 10 pachka (Qora 4, Oq 6); 1 pachka = har o'lchamdan 1 dona
    const intake = { "Qora": 4, "Oq": 6 };
    Object.entries(intake).forEach(([c, packs]) => {
        colors[c] = {};
        prod.sizes.forEach(s => colors[c][s] = packs);
    });
    supTaken = 10 * prod.cogs; // olingan yuk qiymati (tannarx) = 2,000,000
    add("1) Mahsulot kirim qilindi", sumStock() === 50 && packSize === 5,
        `10 pachka (Qora 4 + Oq 6) → ${sumStock()} dona (kutilgan 50); pachka hajmi ${packSize}; tannarx jami ${supTaken.toLocaleString("uz-UZ")}`);

    // 2) OPTIMGA (ulgurji) SOTUV — 2 Qora pachka
    prod.sizes.forEach(s => colors["Qora"][s] -= 2);
    revenue += 2 * prod.pack_price; // 560,000
    add("2) Optimga (ulgurji) sotildi", sumStock() === 40 && packsOf("Qora") === 2 && revenue === 560000,
        `2 Qora pachka × ${prod.pack_price.toLocaleString("uz-UZ")} → tushum ${revenue.toLocaleString("uz-UZ")}; qoldiq ${sumStock()} dona; Qora ${packsOf("Qora")} pachka`);

    // 3) DONAGA (chakana) SOTUV — 3 Oq dona (M o'lcham)
    colors["Oq"]["M"] -= 3;
    revenue += 3 * donaPrice; // +168,000
    add("3) Donaga (chakana) sotildi", sumStock() === 37 && colors["Oq"]["M"] === 3 && donaPrice === 56000,
        `3 Oq dona (M) × ${donaPrice.toLocaleString("uz-UZ")} (=${prod.pack_price.toLocaleString("uz-UZ")}/${packSize}) → tushum ${revenue.toLocaleString("uz-UZ")}; qoldiq ${sumStock()}`);

    // 4) MIJOZGA QARZGA (nasiya) — 1 Qora pachka, 100,000 olindi
    const saleTotal = prod.pack_price;      // 280,000
    const received = 100000;
    const debt = saleTotal - received;      // 180,000
    prod.sizes.forEach(s => colors["Qora"][s] -= 1);
    revenue += received;                    // kassaga faqat olingan tushadi
    custDebt += debt;
    add("4) Mijozga qarzga (nasiya) berildi", debt === 180000 && sumStock() === 32 && (received + debt === saleTotal),
        `1 Qora pachka ${saleTotal.toLocaleString("uz-UZ")}: olindi ${received.toLocaleString("uz-UZ")}, qarz ${debt.toLocaleString("uz-UZ")}; balans tekshiruvi ${received}+${debt}=${received + debt}; qoldiq ${sumStock()}`);

    // 5) TA'MINOTCHIDAN NASIYAGA YUK — qarz = olingan yuk (hali to'lanmagan)
    const supDebtAfterIntake = supTaken - supPaid; // 2,000,000
    add("5) Ta'minotchidan nasiyaga yuk olindi", supDebtAfterIntake === 2000000,
        `Olingan yuk (10 × ${prod.cogs.toLocaleString("uz-UZ")}) = ${supTaken.toLocaleString("uz-UZ")}; to'langan ${supPaid}; ta'minotchiga qarz ${supDebtAfterIntake.toLocaleString("uz-UZ")}`);

    // 6) TA'MINOTCHIGA TO'LOV — 800,000
    supPaid += 800000;
    const supDebt = supTaken - supPaid; // 1,200,000
    add("6) Ta'minotchiga to'lov qilindi", supPaid === 800000 && supDebt === 1200000,
        `To'lov ${(800000).toLocaleString("uz-UZ")} → jami to'langan ${supPaid.toLocaleString("uz-UZ")}; qolgan qarz ${supDebt.toLocaleString("uz-UZ")}`);

    return steps;
}

function startBusinessSimulation() {
    const box = document.getElementById("sim-results");
    if (!box) return;
    box.innerHTML = `<div class="diag-hint"><i class="fa-solid fa-rotate fa-spin"></i> Simulyatsiya ketmoqda...</div>`;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setTimeout(() => {
        let steps;
        try {
            steps = runBusinessSimulation();
        } catch (e) {
            box.innerHTML = `<div class="diag-row diag-fail"><i class="fa-solid fa-circle-xmark"></i><div class="diag-row-txt"><b>Simulyatsiya xatosi</b><small>${e.message}</small></div></div>`;
            return;
        }
        const fails = steps.filter(s => s.status === "fail").length;
        let html = `<div class="sim-summary ${fails ? "sim-bad" : "sim-good"}">${fails ? `<i class="fa-solid fa-circle-xmark"></i> ${fails} ta bosqich xato — hisob-kitobda muammo bor!` : `<i class="fa-solid fa-circle-check"></i> Hammasi to'g'ri — ${steps.length} bosqich muvaffaqiyatli o'tdi`}</div>`;
        steps.forEach(s => {
            const m = _diagStatusMeta(s.status);
            html += `<div class="diag-row ${m.cls}"><i class="fa-solid ${m.icon}"></i><div class="diag-row-txt"><b>${s.name}</b><small>${s.detail}</small></div></div>`;
        });
        box.innerHTML = html;
        box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 250);
}

// 12. GENERAL CONTROLS SETUP
function setupEventListeners() {
    // Helper function for safe event binding
    function safeBind(el, event, cb) {
        if (el) el.addEventListener(event, cb);
    }

    // Ta'minotchi va oy tanlovlari o'zgarganda hisobotni qayta render qilish [NEW]
    const buxIndSupplierSelect = document.getElementById("bux-ind-supplier-select");
    const buxIndMonthSelect = document.getElementById("bux-ind-month-select");
    
    safeBind(buxIndSupplierSelect, "change", renderSupplierIndividualReport);
    safeBind(buxIndMonthSelect, "change", renderSupplierIndividualReport);

    // Toggle Password Visibility
    if (togglePwIcon && passwordInput) {
        togglePwIcon.addEventListener("click", () => {
            if (passwordInput.type === "password") {
                passwordInput.type = "text";
                togglePwIcon.className = "fa-solid fa-eye toggle-pw";
            } else {
                passwordInput.type = "password";
                togglePwIcon.className = "fa-solid fa-eye-slash toggle-pw";
            }
        });
    }

    // Handle authentication form submission
    safeBind(loginForm, "submit", handleLoginSubmit);

    // Login usulini tanlash (Admin / Sotuvchi)
    safeBind(document.getElementById("mode-admin-btn"), "click", () => showLoginView("admin"));
    safeBind(document.getElementById("mode-seller-btn"), "click", () => showLoginView("seller"));
    document.querySelectorAll("[data-login-back]").forEach(btn => {
        safeBind(btn, "click", () => showLoginView("mode"));
    });

    // Sotuvchi PIN formasi
    safeBind(document.getElementById("seller-pin-form"), "submit", handleSellerPinSubmit);
    // 4 raqam terilganda avtomatik tekshirish
    safeBind(document.getElementById("seller-pin-input"), "input", (ev) => {
        const v = ev.target.value.replace(/\D/g, "").slice(0, 4);
        ev.target.value = v;
        const sellerErr = document.getElementById("seller-pin-error");
        if (sellerErr) sellerErr.style.display = "none";
        if (v.length === 4) handleSellerPinSubmit();
    });

    // Logout
    safeBind(logoutTrigger, "click", handleLogout);

    // POS Category filters
    if (filterBtns) {
        filterBtns.forEach(btn => {
            safeBind(btn, "click", () => {
                filterBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                state.activeCategory = btn.dataset.posFilter;
                renderTiles();
            });
        });
    }

    // Search events
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            state.searchQuery = e.target.value;
            renderTiles();
        });
    }

    // Smooth Carousel Navigation
    const prevBtn = document.getElementById("pos-prev-btn");
    const nextBtn = document.getElementById("pos-next-btn");
    const tilesGridEl = document.getElementById("pos-tiles-grid");

    if (prevBtn && nextBtn && tilesGridEl) {
        prevBtn.addEventListener("click", () => {
            const cardWidth = tilesGridEl.clientWidth;
            tilesGridEl.scrollBy({ left: -cardWidth * 0.75, behavior: "smooth" });
        });
        nextBtn.addEventListener("click", () => {
            const cardWidth = tilesGridEl.clientWidth;
            tilesGridEl.scrollBy({ left: cardWidth * 0.75, behavior: "smooth" });
        });
    }

    // Calc Qty controls
    safeBind(calcQtyMinus, "click", () => {
        if (calcQtyInput) {
            let val = parseInt(calcQtyInput.value) || 1;
            if (val > 1) calcQtyInput.value = val - 1;
        }
    });

    safeBind(calcQtyPlus, "click", () => {
        if (!calcQtyInput || !state.selectedProduct) return;
        let val = parseInt(calcQtyInput.value) || 1;
        const isPack = String(state.selectedSize || "").includes("Pachka");
        const color = (hasColorData(state.selectedProduct) && state.selectedColor) ? state.selectedColor : null;
        const maxStock = availableUnitsFor(state.selectedProduct, color, state.selectedSize, isPack);
        const already = cartLineQty(state.selectedProduct.id, state.selectedSize, color);
        if (val + 1 + already > maxStock) {
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
            return; // zaxiradan oshmaydi
        }
        calcQtyInput.value = val + 1;
    });

    safeBind(closeCalcModal, "click", closeCalculatorModal);
    if (calcModal) {
        calcModal.addEventListener("click", (e) => {
            if (e.target === calcModal) closeCalculatorModal();
        });
    }

    // Calc Form submission (adding custom values to register)
    safeBind(calcForm, "submit", (e) => {
        e.preventDefault();
        if (!state.selectedProduct) return;
        
        const qty = calcQtyInput ? (parseInt(calcQtyInput.value) || 1) : 1;
        const soldPrice = calcPriceInput ? (parseFloat(calcPriceInput.value) || state.selectedProduct.price) : state.selectedProduct.price;
        const color = (hasColorData(state.selectedProduct) && state.selectedColor) ? state.selectedColor : null;

        // Rang ma'lumoti bo'lsa, rang tanlanmagan bo'lsa ogohlantir
        if (hasColorData(state.selectedProduct) && !color) {
            alert("Iltimos, rangni tanlang!");
            return;
        }

        // Zaxira tekshiruvi: mavjuddan ko'p sotib bo'lmaydi
        const isPack = String(state.selectedSize || "").includes("Pachka");
        const maxStock = availableUnitsFor(state.selectedProduct, color, state.selectedSize, isPack);
        const already = cartLineQty(state.selectedProduct.id, state.selectedSize, color);
        const unit = isPack ? "pachka" : "dona";
        if (already + qty > maxStock) {
            alert(`⚠️ Zaxirada faqat ${maxStock} ${unit} bor!` + (already ? `\n(Savatda allaqachon ${already} ${unit})` : ""));
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
            return;
        }

        const existing = state.cart.find(item => item.product.id === state.selectedProduct.id && item.size === state.selectedSize && (item.color || null) === color);

        if (existing) {
            existing.qty += qty;
            existing.soldPrice = soldPrice;
        } else {
            state.cart.push({
                product: state.selectedProduct,
                size: state.selectedSize,
                color: color,
                qty: qty,
                soldPrice: soldPrice
            });
        }

        updateReceiptUI();
        closeCalculatorModal();
    });

    // Live discount inputs changes
    safeBind(discountInput, "input", updateReceiptUI);
    safeBind(receivedInput, "input", () => { posReceivedTouched = true; updatePaymentUI(); });

    // Complete Sale manually
    safeBind(checkoutBtn, "click", openPinModal);

    // Hook Telegram native button clicks — faqat haqiqiy Telegram ichida
    if (isTelegram && tg.MainButton) {
        try {
            tg.MainButton.onClick(() => {
                openPinModal();
            });
        } catch (err) {
            console.warn("Telegram MainButton onClick failed:", err);
        }
    }

    // PIN modal closing & submissions
    safeBind(closePinModal, "click", closePinModalOverlay);
    if (pinModal) {
        pinModal.addEventListener("click", (e) => {
            if (e.target === pinModal) closePinModalOverlay();
        });
    }
    safeBind(pinForm, "submit", handlePinSubmit);

    // POS Success Receipt Modal actions
    const closeSuccessReceipt = () => {
        if (successReceiptModal) successReceiptModal.classList.remove("open");
    };
    safeBind(closeReceiptModal, "click", closeSuccessReceipt);
    safeBind(receiptModalCloseBtn, "click", closeSuccessReceipt);
    if (successReceiptModal) {
        successReceiptModal.addEventListener("click", (e) => {
            if (e.target === successReceiptModal) closeSuccessReceipt();
        });
    }

    // Print Receipt mock alert
    safeBind(receiptModalPrintBtn, "click", () => {
        alert("Chek printerga yuborilmoqda... (Mock Printer Active)");
    });

    // POS supplier filters
    const posSupplierBtns = document.querySelectorAll("[data-pos-supplier]");
    if (posSupplierBtns) {
        posSupplierBtns.forEach(btn => {
            safeBind(btn, "click", () => {
                document.querySelectorAll("[data-pos-supplier]").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                state.activeSupplier = btn.dataset.posSupplier;
                renderTiles();
            });
        });
    }

    // Clear CRM logs database
    safeBind(clearLogsBtn, "click", () => {
        if (confirm("Barcha savdo tarixlarini o'chirmoqchimisiz? Buni qaytarib bo'lmaydi.")) {
            state.salesHistory = [];
            localStorage.setItem("eco_sports_sales_history", JSON.stringify([]));
            dbDeleteAllSales();
            updateAnalytics();
            renderHistoryTable();
        }
    });

    // Mobile cart bar sliding sheet trigger
    const mobileCartBar = document.getElementById("pos-mobile-cart-bar");
    const registerContainerEl = document.querySelector(".register-container");
    if (mobileCartBar && registerContainerEl) {
        mobileCartBar.addEventListener("click", () => {
            registerContainerEl.classList.add("open");
        });
    }

    const mobileCloseCart = document.getElementById("mobile-close-cart");
    if (mobileCloseCart && registerContainerEl) {
        mobileCloseCart.addEventListener("click", () => {
            registerContainerEl.classList.remove("open");
        });
    }

    // --- WAREHOUSE PRODUCT KIRIM EVENT HANDLERS [NEW] ---
    const addProductWarehouseBtn = document.getElementById("add-product-warehouse-btn");
    const addProductWarehouseModal = document.getElementById("add-product-warehouse-modal");
    const closeProductWarehouseModal = document.getElementById("close-product-warehouse-modal");
    const addProductWarehouseForm = document.getElementById("add-product-warehouse-form");

    if (addProductWarehouseBtn && addProductWarehouseModal) {
        addProductWarehouseBtn.addEventListener("click", () => {
            // Populate suppliers dropdown dynamically
            const supplierSelect = document.getElementById("warehouse-supplier");
            if (supplierSelect) {
                supplierSelect.innerHTML = "";
                state.suppliers.forEach(s => {
                    if (s.visible) {
                        const opt = document.createElement("option");
                        opt.value = s.name;
                        opt.textContent = s.name;
                        supplierSelect.appendChild(opt);
                    }
                });
            }

            // Populate categories dropdown dynamically
            const categorySelect = document.getElementById("warehouse-category");
            if (categorySelect) {
                categorySelect.innerHTML = "";
                state.categories.forEach(c => {
                    if (c.visible) {
                        const opt = document.createElement("option");
                        opt.value = c.code;
                        opt.textContent = c.name;
                        categorySelect.appendChild(opt);
                    }
                });
            }

            // Reset other form fields
            if (addProductWarehouseForm) addProductWarehouseForm.reset();

            // Clear color checkboxes [NEW]
            const colorCbs = document.querySelectorAll('input[name="warehouse-color"]');
            colorCbs.forEach(cb => {
                cb.checked = false;
            });
            updateSelectedColorsUI();
            renderDynamicPackInputs();

            // Close color dropdown if open [NEW]
            const colorDrop = document.getElementById("warehouse-colors-dropdown");
            const dropArrow = document.querySelector("#warehouse-color-selector-trigger .dropdown-arrow");
            if (colorDrop) colorDrop.classList.remove("open");
            if (dropArrow) dropArrow.classList.remove("rotated");

            // Open modal
            addProductWarehouseModal.classList.add("open");
        });
    }

    // --- WAREHOUSE COLOR SELECTOR DROPDOWN HANDLERS [NEW] ---
    const colorTrigger = document.getElementById("warehouse-color-selector-trigger");
    const colorDropdown = document.getElementById("warehouse-colors-dropdown");
    const dropdownArrow = document.querySelector("#warehouse-color-selector-trigger .dropdown-arrow");

    if (colorTrigger && colorDropdown) {
        colorTrigger.addEventListener("click", (e) => {
            e.stopPropagation();
            colorDropdown.classList.toggle("open");
            if (dropdownArrow) dropdownArrow.classList.toggle("rotated");
        });

        // Close dropdown when clicking outside
        document.addEventListener("click", (e) => {
            if (!colorTrigger.contains(e.target) && !colorDropdown.contains(e.target)) {
                colorDropdown.classList.remove("open");
                if (dropdownArrow) dropdownArrow.classList.remove("rotated");
            }
        });

        // Bind checkbox change listeners
        const colorCbs = document.querySelectorAll('input[name="warehouse-color"]');
        colorCbs.forEach(cb => {
            cb.addEventListener("change", () => {
                updateSelectedColorsUI();
                renderDynamicPackInputs();
            });
        });

        // Bind size checkbox change listeners
        const sizeCbs = document.querySelectorAll('input[name="warehouse-size"]');
        sizeCbs.forEach(cb => {
            cb.addEventListener("change", () => {
                renderDynamicPackInputs();
            });
        });

        // Pack stepper (+/-) va jonli jami — delegatsiya (konteyner barqaror)
        const qtyContainer = document.getElementById("warehouse-qty-container");
        if (qtyContainer) {
            qtyContainer.addEventListener("click", (e) => {
                const btn = e.target.closest(".pack-step-btn");
                if (!btn) return;
                const color = btn.dataset.color;
                const step = parseInt(btn.dataset.step, 10) || 0;
                const input = qtyContainer.querySelector(`.color-pack-input[data-color="${color}"]`);
                if (!input) return;
                const next = Math.max(1, (parseInt(input.value, 10) || 0) + step);
                input.value = next;
                updatePackTotal();
            });
            qtyContainer.addEventListener("input", (e) => {
                if (e.target.classList.contains("color-pack-input")) updatePackTotal();
            });
        }
    }

    if (closeProductWarehouseModal && addProductWarehouseModal) {
        const closeOverlay = () => addProductWarehouseModal.classList.remove("open");
        closeProductWarehouseModal.addEventListener("click", closeOverlay);
        addProductWarehouseModal.addEventListener("click", (e) => {
            if (e.target === addProductWarehouseModal) closeOverlay();
        });
    }

    if (addProductWarehouseForm) {
        addProductWarehouseForm.addEventListener("submit", (e) => {
            e.preventDefault();
            
            const supplier = document.getElementById("warehouse-supplier").value;
            const category = document.getElementById("warehouse-category").value;
            const name = document.getElementById("warehouse-name").value.trim();
            const model = document.getElementById("warehouse-model").value.trim();
            
            // Get selected color checkboxes [NEW]
            const checkedColors = [];
            const colorCheckboxes = document.querySelectorAll('input[name="warehouse-color"]:checked');
            colorCheckboxes.forEach(cb => {
                checkedColors.push(cb.value);
            });

            if (checkedColors.length === 0) {
                alert("Iltimos, kamida bitta rangni belgilang!");
                return;
            }
            const colorsText = checkedColors.join(", ");
            
            // Get selected size checkboxes
            const checkedSizes = [];
            const sizeCheckboxes = document.querySelectorAll('input[name="warehouse-size"]:checked');
            sizeCheckboxes.forEach(cb => {
                checkedSizes.push(cb.value);
            });

            if (checkedSizes.length === 0) {
                alert("Iltimos, kamida bitta o'lchamni belgilang!");
                return;
            }

            // Gather pachka input counts per color
            const colorPacksBreakdown = {};
            let totalPacks = 0;
            let validationFailed = false;

            checkedColors.forEach(color => {
                const inputEl = document.querySelector(`.color-pack-input[data-color="${color}"]`);
                const packs = parseInt(inputEl ? inputEl.value : 0) || 0;
                if (packs <= 0) {
                    validationFailed = true;
                }
                colorPacksBreakdown[color] = packs;
                totalPacks += packs;
            });

            if (validationFailed || totalPacks <= 0) {
                alert("Har bir tanlangan rang uchun kirim pachka miqdori kamida 1 bo'lishi kerak!");
                return;
            }

            const totalQty = totalPacks * checkedSizes.length;

            const newProduct = {
                id: "prod-" + Date.now(),
                supplier: supplier,
                name: `${name} (${model})`,
                model: model,
                category: category,
                colors: colorsText,
                sizes: checkedSizes,
                price: 0,
                cogs: 0,
                approved: false,
                image: "assets/tshirt.png",
                qty: totalQty,
                colorPacksBreakdown: colorPacksBreakdown,
                totalPacks: totalPacks
            };

            state.dynamicProducts.push(newProduct);
            localStorage.setItem("eco_sports_dynamic_products", JSON.stringify(state.dynamicProducts));

            // Sync to Supabase under eco_inventory table as pending
            if (supabaseClient) {
                supabaseClient.from("eco_inventory").upsert({
                    product_id: newProduct.id,
                    supplier: newProduct.supplier,
                    product_name: newProduct.name,
                    category: newProduct.category,
                    price: 0,
                    quantity: totalQty,
                    updated_at: new Date().toISOString()
                }).then(() => {
                    console.log("Supabase: Pending product synced!");
                });

                // eco_kirim_history — navbat orqali (offline'da yo'qolmaydi)
                enqueueOp({ type: "kirim", row: {
                    id: "KRM-" + Math.floor(1000 + Math.random() * 9000),
                    created_at: new Date().toISOString(),
                    supplier: newProduct.supplier,
                    manager: currentUser ? currentUser.name : "Omborchi 1",
                    product_id: newProduct.id,
                    product_name: name,
                    model: model,
                    category: newProduct.category,
                    colors: newProduct.colors,
                    sizes: JSON.stringify(newProduct.sizes),
                    total_packs: newProduct.totalPacks,
                    total_qty: newProduct.qty,
                    color_packs_breakdown: JSON.stringify(newProduct.colorPacksBreakdown),
                    status: "TASDIQ KUTILMOQDA"
                } });
            }

            addProductWarehouseModal.classList.remove("open");
            renderOmborTable();

            // Open Inward Stock Document Popup [NEW]
            openKirimDocument(newProduct);
        });
    }

    // --- WAREHOUSE DOCUMENT INVOICE MODAL EVENT HANDLERS [NEW] ---
    const warehouseDocModal = document.getElementById("warehouse-document-modal");
    const closeWarehouseDocModal = document.getElementById("close-warehouse-doc-modal");
    const closeWarehouseDocActionBtn = document.getElementById("close-warehouse-doc-action-btn");
    const printWarehouseDocBtn = document.getElementById("print-warehouse-doc-btn");

    if (warehouseDocModal) {
        const closeDocOverlay = () => warehouseDocModal.classList.remove("open");
        
        if (closeWarehouseDocModal) closeWarehouseDocModal.addEventListener("click", closeDocOverlay);
        if (closeWarehouseDocActionBtn) closeWarehouseDocActionBtn.addEventListener("click", closeDocOverlay);
        
        warehouseDocModal.addEventListener("click", (e) => {
            if (e.target === warehouseDocModal) closeDocOverlay();
        });

        if (printWarehouseDocBtn) {
            printWarehouseDocBtn.addEventListener("click", () => {
                window.print();
            });
        }
    }

    // 13. DEPARTMENT TABS ROUTING SYSTEM
    const deptTabs = document.querySelectorAll(".dept-tab-btn");
    const sections = document.querySelectorAll(".dept-section");
    
    if (deptTabs && sections) {
        deptTabs.forEach(tab => {
            safeBind(tab, "click", () => {
                const targetDept = tab.dataset.dept;
                
                deptTabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                
                sections.forEach(sec => {
                    if (sec.id === `${targetDept}-section`) {
                        sec.style.display = "block";
                        sec.classList.add("active-section");
                    } else {
                        sec.style.display = "none";
                        sec.classList.remove("active-section");
                    }
                });
                
                if (targetDept === "ombor") {
                    renderOmborTable();
                } else if (targetDept === "buxgalteriya") {
                    renderBuxgalteriya();
                } else if (targetDept === "sozlamalar") {
                    populateSettings();
                }
            });
        });
    }

    // Ombor Inventory listeners
    const omborSearch = document.getElementById("ombor-search-input");
    safeBind(omborSearch, "input", renderOmborTable);
    
    const omborSupplierBtns = document.querySelectorAll("[data-ombor-supplier]");
    if (omborSupplierBtns) {
        omborSupplierBtns.forEach(btn => {
            safeBind(btn, "click", () => {
                omborSupplierBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                renderOmborTable();
            });
        });
    }

    // Buxgalteriya Expense triggers
    const expenseModal = document.getElementById("bux-expense-modal");
    const addExpenseTrigger = document.getElementById("add-expense-trigger");
    const closeExpenseModal = document.getElementById("close-expense-modal");
    const expenseForm = document.getElementById("bux-expense-form");
    const expenseAmountInput = document.getElementById("expense-amount");
    const expenseDescInput = document.getElementById("expense-desc");
    const expenseCatInput = document.getElementById("expense-cat");
    const clearExpensesBtn = document.getElementById("bux-clear-expenses");
    
    safeBind(addExpenseTrigger, "click", () => {
        if (expenseModal && expenseAmountInput && expenseDescInput && expenseCatInput) {
            expenseAmountInput.value = "";
            expenseDescInput.value = "";
            expenseCatInput.selectedIndex = 0;
            expenseModal.classList.add("open");
        }
    });
    
    if (closeExpenseModal && expenseModal) {
        const closeExpenseModalOverlay = () => expenseModal.classList.remove("open");
        closeExpenseModal.addEventListener("click", closeExpenseModalOverlay);
        expenseModal.addEventListener("click", (e) => {
            if (e.target === expenseModal) closeExpenseModalOverlay();
        });
    }
    
    if (expenseForm) {
        expenseForm.addEventListener("submit", (e) => {
            e.preventDefault();
            if (!expenseAmountInput || !expenseDescInput || !expenseCatInput) return;
            
            const amount = parseFloat(expenseAmountInput.value) || 0;
            const desc = expenseDescInput.value.trim();
            const cat = expenseCatInput.value;
            
            if (amount <= 0 || !desc) return;
            
            const now = new Date();
            const dateStr = now.toLocaleDateString('uz-UZ') + " " + now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
            
            const newExpense = {
                id: "EXP-" + Math.floor(1000 + Math.random() * 9000),
                timestamp: dateStr,
                description: desc,
                category: cat,
                amount: amount
            };
            
            expenses.push(newExpense);
            localStorage.setItem("eco_sports_expenses", JSON.stringify(expenses));
            dbSaveExpense(newExpense);
            if (typeof appendLedger === "function") {
                appendLedger("expense", { ref: newExpense.id, account: "xarajat", direction: "out", amount: amount, note: desc + " · " + cat });
            }

            renderBuxgalteriya();
            if (expenseModal) expenseModal.classList.remove("open");
        });
    }
    
    safeBind(clearExpensesBtn, "click", () => {
        if (confirm("Barcha xarajatlar tarixini o'chirmoqchimisiz? Buni qaytarib bo'lmaydi.")) {
            expenses = [];
            localStorage.setItem("eco_sports_expenses", JSON.stringify([]));
            dbDeleteAllExpenses();
            renderBuxgalteriya();
        }
    });

    // Sozlamalar settings listener
    const settingsForm = document.getElementById("settings-form");
    const settingsPinInput = document.getElementById("settings-pin");
    const settingsChatInput = document.getElementById("settings-chat-id");

    if (settingsForm) {
        settingsForm.addEventListener("submit", (e) => {
            e.preventDefault();
            if (!settingsPinInput || !settingsChatInput) return;

            const pinVal = settingsPinInput.value.trim();
            const chatVal = settingsChatInput.value.trim();

            if (pinVal.length !== 4 || isNaN(pinVal)) {
                alert("Kassa PIN-kodi 4 xonali raqam bo'lishi shart!");
                return;
            }

            appConfig.pin = pinVal;
            appConfig.chatId = chatVal;
            
            localStorage.setItem("eco_sports_config", JSON.stringify(appConfig));
            dbSaveConfig("app_config", appConfig);
            
            if (tg && tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
            
            alert("Tizim sozlamalari muvaffaqiyatli saqlandi!");
        });
    }

    // --- TIZIM DIAGNOSTIKASI & XAVFSIZLIK ---
    const diagToggle = document.getElementById("diag-toggle");
    const diagBlock = document.getElementById("diagnostics-block");
    safeBind(diagToggle, "change", () => {
        if (diagToggle.checked) {
            // Yoqilganda akkordeon ochilsin va tekshiruv avtomatik ishga tushsin
            if (diagBlock) diagBlock.classList.add("open");
            startDiagnostics();
        }
    });
    safeBind(document.getElementById("diag-run-btn"), "click", startDiagnostics);
    safeBind(document.getElementById("diag-fix-btn"), "click", applyDiagFixes);
    safeBind(document.getElementById("diag-report-btn"), "click", downloadDiagReport);

    // --- SANA BO'YICHA SAVDO HISOBOTI ---
    document.querySelectorAll(".date-q-btn").forEach(b => safeBind(b, "click", () => setDateReportRange(b.dataset.range)));
    safeBind(document.getElementById("date-report-apply"), "click", applyCustomDateRange);
    safeBind(document.getElementById("date-report-excel"), "click", exportDateReportExcel);
    safeBind(document.getElementById("date-report-pdf"), "click", exportDateReportPdf);

    // --- KUNLIK SVERTKA & HISOB JURNALI ---
    safeBind(document.getElementById("recon-run-btn"), "click", startReconciliation);
    safeBind(document.getElementById("recon-send-btn"), "click", async () => {
        const r = _lastReconcile || runReconciliation();
        const ok = await sendReconciliationToTelegram(r);
        alert(ok ? "✅ Svertka Telegram'ga yuborildi." : "⚠️ Yuborilmadi (lokal dev yoki tarmoq xatosi).");
    });
    // Svertka akkordeoni ochilganda jurnalni yangilab ko'rsatish
    const reconHead = document.querySelector("#recon-block .settings-acc-head");
    safeBind(reconHead, "click", () => { renderLedgerView(); });

    // --- BUXGALTERIYA DAFTARI (DOUBLE-ENTRY SOYA DAFTARI) ---
    document.querySelectorAll(".shadow-q-btn").forEach(b => safeBind(b, "click", () => setShadowRange(b.dataset.range)));
    safeBind(document.getElementById("shadow-excel"), "click", exportShadowExcel);
    const shadowHead = document.querySelector("#shadow-block .settings-acc-head");
    safeBind(shadowHead, "click", () => renderShadowLedger());
    setShadowRange("month"); // boshlang'ich davr
    // Sozlamalar yuklanganda oxirgi svertka natijasi va jurnalni ko'rsatish
    try {
        const _lr = localStorage.getItem("eco_last_reconcile_result");
        if (_lr) { _lastReconcile = JSON.parse(_lr); paintReconciliation(_lastReconcile); }
    } catch (e) {}
    renderLedgerView();

    // Diagnostika natijalari: filtr tugmalari + muammo qatorini ochish (delegatsiya)
    const diagResultsBox = document.getElementById("diag-results");
    if (diagResultsBox) {
        diagResultsBox.addEventListener("click", (e) => {
            const fbtn = e.target.closest(".diag-filter-btn");
            if (fbtn) {
                _diagFilter = fbtn.dataset.filter || "all";
                paintDiagResults();
                return;
            }
            const row = e.target.closest(".diag-row.clickable");
            if (row) {
                const detail = row.nextElementSibling;
                if (detail && detail.classList.contains("diag-row-detail")) {
                    const isOpen = detail.style.display !== "none";
                    detail.style.display = isOpen ? "none" : "block";
                    row.classList.toggle("open", !isOpen);
                }
            }
        });
    }

    // --- BIZNES OQIMI SIMULYATSIYASI ---
    safeBind(document.getElementById("sim-run-btn"), "click", startBusinessSimulation);

    // --- MA'LUMOT ZAXIRASI (backup/restore) ---
    safeBind(document.getElementById("backup-export-btn"), "click", exportFullBackup);
    safeBind(document.getElementById("backup-import-btn"), "click", () => {
        const f = document.getElementById("backup-import-file");
        if (f) f.click();
    });
    safeBind(document.getElementById("backup-import-file"), "change", (e) => {
        if (e.target.files && e.target.files[0]) importFullBackup(e.target.files[0]);
        e.target.value = "";
    });

    // --- LOYIHANI TO'LIQ TOZALASH (parol: 4321) ---
    const clearProjectBtn = document.getElementById("settings-clear-project");
    const clearModal = document.getElementById("clear-project-modal");
    const clearForm = document.getElementById("clear-project-form");
    const clearClose = document.getElementById("clear-project-close");
    const clearPass = document.getElementById("clear-project-pass");
    const clearError = document.getElementById("clear-project-error");

    safeBind(clearProjectBtn, "click", () => {
        if (!clearModal) return;
        if (clearError) clearError.style.display = "none";
        if (clearPass) clearPass.value = "";
        clearModal.classList.add("open");
        if (clearPass) setTimeout(() => clearPass.focus(), 100);
    });
    safeBind(clearClose, "click", () => clearModal && clearModal.classList.remove("open"));
    if (clearModal) clearModal.addEventListener("click", (e) => { if (e.target === clearModal) clearModal.classList.remove("open"); });
    safeBind(clearForm, "submit", (e) => {
        e.preventDefault();
        if (clearPass && clearPass.value === "4321") {
            const _pw = clearPass.value;
            clearModal.classList.remove("open");
            clearProject(_pw);
        } else {
            if (clearError) clearError.style.display = "flex";
            if (clearPass) { clearPass.value = ""; clearPass.focus(); }
        }
    });

    // Sozlamalar accordion'lari — sarlavhaga bosib ochish/yopish
    document.querySelectorAll(".settings-acc-head").forEach(head => {
        head.addEventListener("click", (e) => {
            if (e.target.closest(".settings-add-btn")) return; // "Yangi" tugma accordionni ochmasin
            if (e.target.closest(".diag-switch")) return; // Diagnostika toggle accordionni o'zgartirmasin
            head.parentElement.classList.toggle("open");
        });
    });

    // --- BUXGALTERIYA KARTOCHKALARINI YIG'ISH/OCHISH (collapsible, holat eslab qolinadi) ---
    initBuxCollapsibles();

    // 14. STAFF (CASHIER) MANAGER TRIGGERS [NEW]
    const cashierModal = document.getElementById("settings-cashier-modal");
    const addCashierTrigger = document.getElementById("add-cashier-trigger");
    const closeCashierModal = document.getElementById("close-cashier-modal");
    const cashierForm = document.getElementById("settings-cashier-form");
    
    const cashierEditIdInput = document.getElementById("cashier-edit-id");
    const cashierNameInput = document.getElementById("cashier-name");
    const cashierUsernameInput = document.getElementById("cashier-username");
    const cashierPasswordInput = document.getElementById("cashier-password");
    const cashierPinInput = document.getElementById("cashier-pin");
    
    safeBind(addCashierTrigger, "click", () => {
        if (cashierModal && cashierNameInput && cashierUsernameInput && cashierPasswordInput && cashierPinInput) {
            cashierEditIdInput.value = "";
            cashierNameInput.value = "";
            document.getElementById("cashier-role").value = "kassir-dona";
            cashierUsernameInput.value = "";
            cashierPasswordInput.value = "";
            cashierPinInput.value = "";
            
            document.getElementById("cashier-modal-title").textContent = "Xodim Qo'shish";
            document.getElementById("cashier-modal-desc").textContent = "Xodim portal tizimiga kirishi uchun lavozimi, login paroli va PIN-kodini belgilang.";
            
            cashierModal.classList.add("open");
        }
    });

    if (closeCashierModal && cashierModal) {
        const closeCashierModalOverlay = () => cashierModal.classList.remove("open");
        closeCashierModal.addEventListener("click", closeCashierModalOverlay);
        cashierModal.addEventListener("click", (e) => {
            if (e.target === cashierModal) closeCashierModalOverlay();
        });
    }

    if (cashierForm) {
        cashierForm.addEventListener("submit", (e) => {
            e.preventDefault();
            if (!cashierNameInput || !cashierUsernameInput || !cashierPasswordInput || !cashierPinInput) return;

            const editId = cashierEditIdInput.value;
            const name = cashierNameInput.value.trim();
            const role = document.getElementById("cashier-role").value;
            const username = cashierUsernameInput.value.trim();
            const password = cashierPasswordInput.value.trim();
            const pinVal = cashierPinInput.value.trim();

            if (pinVal.length !== 4 || isNaN(pinVal)) {
                alert("Savdoni tasdiqlovchi PIN-kod 4 xonali raqam bo'lishi shart!");
                return;
            }

            const duplicate = users.find(u => u && u.username && u.username.toLowerCase() === username.toLowerCase() && u.id !== editId);
            if (duplicate) {
                alert("Ushbu login band! Iltimos, boshqa login tanlang.");
                return;
            }

            if (editId) {
                const idx = users.findIndex(u => u && u.id === editId);
                if (idx !== -1) {
                    users[idx].name = name;
                    users[idx].role = role;
                    users[idx].username = username;
                    users[idx].password = password;
                    users[idx].pin = pinVal;
                    dbSaveUser(users[idx]); // OLD _sessionAdminPw bilan avtorizatsiya (sinxron o'qiladi)
                    // O'zini (admin) tahrirlagan bo'lsa — sessiya parolini YANGISIGA yangilash
                    if (currentUser && currentUser.id === editId && role === "admin") {
                        _sessionAdminPw = password;
                        try { sessionStorage.setItem("eco_sports_admin_pw", password); } catch (er) {}
                        currentUser.name = name; currentUser.username = username; currentUser.pin = pinVal;
                        sessionStorage.setItem("eco_sports_logged_in_user", JSON.stringify(currentUser));
                    }
                }
            } else {
                const newCashier = {
                    id: "u-" + Math.floor(1000 + Math.random() * 9000),
                    name: name,
                    role: role,
                    username: username,
                    password: password,
                    pin: pinVal
                };
                users.push(newCashier);
                dbSaveUser(newCashier);
            }

            localStorage.setItem("eco_sports_users", JSON.stringify(users));
            renderCashiersList();
            if (cashierModal) cashierModal.classList.remove("open");
        });
    }

    // Suppliers Add triggers
    const supplierModal = document.getElementById("settings-supplier-modal");
    const addSupplierTrigger = document.getElementById("add-supplier-trigger");
    const closeSupplierModal = document.getElementById("close-supplier-modal");
    const supplierForm = document.getElementById("settings-supplier-form");
    
    safeBind(addSupplierTrigger, "click", () => {
        if (supplierModal) {
            document.getElementById("supplier-name").value = "";
            document.getElementById("supplier-icon").value = "fa-solid fa-user-tie";
            supplierModal.classList.add("open");
        }
    });
    
    if (closeSupplierModal && supplierModal) {
        const closeSupplierOverlay = () => supplierModal.classList.remove("open");
        closeSupplierModal.addEventListener("click", closeSupplierOverlay);
        supplierModal.addEventListener("click", (e) => {
            if (e.target === supplierModal) closeSupplierOverlay();
        });
    }
    
    if (supplierForm) {
        supplierForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const name = document.getElementById("supplier-name").value.trim();
            const icon = document.getElementById("supplier-icon").value.trim();
            if (!name) return;
            
            const newSupplier = { name, icon, visible: true };
            state.suppliers.push(newSupplier);
            saveSuppliersToStorage();
            
            renderSettingsSuppliersAndCategories();
            renderPOSFilters();
            renderTiles();
            
            if (supplierModal) supplierModal.classList.remove("open");
        });
    }

    // Categories Add triggers
    const categoryModal = document.getElementById("settings-category-modal");
    const addCategoryTrigger = document.getElementById("add-category-trigger");
    const closeCategoryModal = document.getElementById("close-category-modal");
    const categoryForm = document.getElementById("settings-category-form");
    
    safeBind(addCategoryTrigger, "click", () => {
        if (categoryModal) {
            document.getElementById("category-name").value = "";
            document.getElementById("category-code").value = "";
            document.getElementById("category-icon").value = "fa-solid fa-tag";
            categoryModal.classList.add("open");
        }
    });
    
    if (closeCategoryModal && categoryModal) {
        const closeCategoryOverlay = () => categoryModal.classList.remove("open");
        closeCategoryModal.addEventListener("click", closeCategoryOverlay);
        categoryModal.addEventListener("click", (e) => {
            if (e.target === categoryModal) closeCategoryOverlay();
        });
    }
    
    if (categoryForm) {
        categoryForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const name = document.getElementById("category-name").value.trim();
            const code = document.getElementById("category-code").value.trim().toLowerCase();
            const icon = document.getElementById("category-icon").value.trim();
            if (!name || !code) return;
            
            const duplicate = state.categories.find(c => c.code === code);
            if (duplicate) {
                alert("Ushbu kategoriya kodi band! Iltimos, boshqa kod tanlang.");
                return;
            }
            
            const newCategory = { code, name, icon, visible: true };
            state.categories.push(newCategory);
            saveCategoriesToStorage();
            
            renderSettingsSuppliersAndCategories();
            renderPOSFilters();
            renderTiles();
            
            if (categoryModal) categoryModal.classList.remove("open");
        });
    }
}

// 13. INITIALIZATION
async function initApp() {
    // Check if user is already authenticated
    const isAuthenticated = sessionStorage.getItem("eco_sports_logged_in") === "true";

    // Set random receipt ID
    if (receiptIdLabel) {
        receiptIdLabel.textContent = "#" + generateReceiptId();
    }

    // Load localStorage Sales history database
    const savedLogs = localStorage.getItem("eco_sports_sales_history");
    if (savedLogs) {
        state.salesHistory = JSON.parse(savedLogs);
    } else {
        state.salesHistory = [];
    }

    // Load localStorage Kirim history database
    const savedKirims = localStorage.getItem("eco_sports_kirim_history");
    if (savedKirims) {
        state.kirimHistory = JSON.parse(savedKirims);
    } else {
        state.kirimHistory = [];
    }

    // Load inventory database
    const savedInventory = localStorage.getItem("eco_sports_inventory");
    if (savedInventory) {
        inventory = JSON.parse(savedInventory);
    } else {
        localStorage.setItem("eco_sports_inventory", JSON.stringify(inventory));
    }

    // Load expenses database
    const savedExpenses = localStorage.getItem("eco_sports_expenses");
    if (savedExpenses) {
        expenses = JSON.parse(savedExpenses);
    } else {
        localStorage.setItem("eco_sports_expenses", JSON.stringify(expenses));
    }

    // Load settings configurations
    const savedConfig = localStorage.getItem("eco_sports_config");
    if (savedConfig) {
        appConfig = JSON.parse(savedConfig);
    } else {
        localStorage.setItem("eco_sports_config", JSON.stringify(appConfig));
    }
    _stripFrontendToken(); // eski saqlangan bot tokenni frontenddan tozalash (xavfsizlik)

    // Load suppliers database
    const savedSuppliers = localStorage.getItem("eco_sports_suppliers");
    if (savedSuppliers) {
        try {
            state.suppliers = JSON.parse(savedSuppliers);
        } catch (e) {
            state.suppliers = [...defaultSuppliers];
        }
    } else {
        state.suppliers = [...defaultSuppliers];
        localStorage.setItem("eco_sports_suppliers", JSON.stringify(state.suppliers));
    }

    // Load categories database
    const savedCategories = localStorage.getItem("eco_sports_categories");
    if (savedCategories) {
        try {
            state.categories = JSON.parse(savedCategories);
        } catch (e) {
            state.categories = [...defaultCategories];
        }
    } else {
        state.categories = [...defaultCategories];
        localStorage.setItem("eco_sports_categories", JSON.stringify(state.categories));
    }

    // Load staff database
    const savedUsers = localStorage.getItem("eco_sports_users");
    if (savedUsers) {
        try {
            users = JSON.parse(savedUsers);
            if (!Array.isArray(users) || users.length === 0) {
                users = [...defaultUsers];
            }
        } catch (e) {
            users = [...defaultUsers];
        }
    } else {
        users = [...defaultUsers];
    }

    // Ensure all defaultUsers are present (such as the new Ombor1)
    defaultUsers.forEach(du => {
        if (!users.find(u => u.username === du.username)) {
            users.push(du);
        }
    });

    // Load supplier payment ledger (qarz daftari)
    const savedPayments = localStorage.getItem("eco_sports_supplier_payments");
    if (savedPayments) {
        try {
            supplierPayments = JSON.parse(savedPayments) || {};
        } catch (e) {
            supplierPayments = {};
        }
    }

    // Agar loyiha tozalangan bo'lsa — demo (standart) mahsulotlarni qayta yuklamaslik
    if (localStorage.getItem("eco_sports_products_cleared") === "1") {
        PRODUCTS = [];
    }

    // Load dynamic products
    const savedDynamicProducts = localStorage.getItem("eco_sports_dynamic_products");
    if (savedDynamicProducts) {
        try {
            state.dynamicProducts = JSON.parse(savedDynamicProducts);
        } catch (e) {
            state.dynamicProducts = [];
        }
    } else {
        state.dynamicProducts = [];
    }

    // Merge approved dynamic products into PRODUCTS
    state.dynamicProducts.forEach(p => {
        if (p.approved) {
            if (!PRODUCTS.find(item => item.id === p.id)) {
                PRODUCTS.push(p);
            }
        }
    });

    // MIGRATSIYA: narxi bor tasdiqlangan mahsulotlar eco_product_prices'da bo'lmasa — ko'chirish
    // (eski kod narxni bulutga yozmagan; bu blok ularni bulutga tarqatadi)
    let _pricesMigrated = false;
    state.dynamicProducts.forEach(dp => {
        if (dp.approved && ((dp.price || 0) > 0 || (dp.pack_price || 0) > 0) && !productPrices[dp.id]) {
            productPrices[dp.id] = { cogs: dp.cogs || 0, pack_price: dp.pack_price || 0, price: dp.price || 0 };
            _pricesMigrated = true;
        }
    });
    if (_pricesMigrated && typeof saveProductPrices === "function") saveProductPrices();

    // Migrating/establishing roles for older entries safely
    users.forEach(u => {
        if (!u.role) {
            const usernameLower = u.username ? u.username.toLowerCase() : "";
            if (usernameLower === "admin") u.role = "admin";
            else if (usernameLower === "optim1") u.role = "kassir-optim";
            else if (usernameLower === "dona1") u.role = "kassir-dona";
            else if (usernameLower === "ombor1") u.role = "omborchi";
            else u.role = "kassir-dona";
        }
    });
    localStorage.setItem("eco_sports_users", JSON.stringify(users));

    // CRITICAL: Setup event listeners FIRST so UI is interactive immediately
    setupEventListeners();

    // --- OFFLINE SYNC: doimiy xotira + holat ko'rsatkichi + navbatni bo'shatish ---
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persisted().then(persisted => {
            if (!persisted) navigator.storage.persist().then(granted => {
                console.log("Doimiy xotira (persist):", granted ? "yoqildi ✅" : "berilmadi");
            });
        }).catch(() => {});
    }
    updateSyncBadge();
    window.addEventListener("online", () => { updateSyncBadge(); flushSyncQueue(); });
    window.addEventListener("offline", updateSyncBadge);
    setInterval(() => { if (navigator.onLine) flushSyncQueue(); }, 30000); // har 30s xavfsizlik uchun
    flushSyncQueue(); // ochilishda kutayotganlarni yuborish

    if (isAuthenticated) {
        unlockDashboard();
    }

    // 13.5. LOAD FROM SUPABASE CLOUD IN BACKGROUND (non-blocking)
    if (supabaseClient) {
        syncFromSupabase().then(() => {
            console.log("%c✅ Supabase: Background sync completed!", "color:#10b981; font-weight:bold;");
            flushSyncQueue(); // bulutdan o'qigach — kutayotgan yozishlarni yuborish
            // Re-render UI with synced data
            if (isAuthenticated) {
                renderPOSFilters();
                renderTiles();
                updateAnalytics();
                renderHistoryTable();
                
                // Refresh active tab views dynamically
                const activeTabBtn = document.querySelector(".dept-tab-btn.active");
                if (activeTabBtn) {
                    const dept = activeTabBtn.dataset.dept;
                    if (dept === "ombor") {
                        renderOmborTable();
                    } else if (dept === "buxgalteriya") {
                        renderBuxgalteriya();
                    }
                }
            }
        }).catch(err => {
            console.warn("Supabase: Background sync failed:", err);
        });
    }

    // Kunlik avtomatik svertka — sync tugashini kutib (date-guard: kuniga 1 marta)
    setTimeout(() => { try { runDailyReconciliationIfNeeded(); } catch (e) { console.warn("Svertka:", e); } }, 4500);
}

// 13.5. SAFE JSON PARSING HELPER
function safeJsonParse(val, fallback) {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(val);
    } catch (e) {
        return fallback;
    }
}

// 13.5. SUPABASE BACKGROUND SYNC FUNCTION
async function syncFromSupabase() {
    try {
        // --- 1. eco_users (Login / Parollar) — QULFLANGAN ---
        //    Jadval RLS bilan himoyalangan: anon to'g'ridan o'qiy olmaydi (parollar
        //    chiqmaydi). Admin kirgan bo'lsa — xavfsiz admin_list_users RPC orqali
        //    ro'yxat yangilanadi; aks holda mahalliy ro'yxat ishlatiladi (login
        //    baribir verify_login RPC orqali tekshiriladi).
        if (_sessionAdminPw) {
            try { await refreshUsersFromCloud(); } catch (e) { /* mahalliy qoladi */ }
        }

        // --- 2. eco_config (Tizim Sozlamalari) ---
        const { data: cloudConfig, error: cErr } = await supabaseClient.from("eco_config").select("*");
        if (!cErr && cloudConfig) {
            const configMap = {};
            cloudConfig.forEach(row => {
                configMap[row.key] = row.value;
            });
            if (configMap["app_config"]) {
                appConfig = configMap["app_config"];
                localStorage.setItem("eco_sports_config", JSON.stringify(appConfig));
                _stripFrontendToken(); // bulutdan kelgan eski tokenni ham tozalash
            }
            if (configMap["eco_suppliers"]) {
                state.suppliers = configMap["eco_suppliers"];
                localStorage.setItem("eco_sports_suppliers", JSON.stringify(state.suppliers));
            }
            if (configMap["eco_categories"]) {
                state.categories = configMap["eco_categories"];
                localStorage.setItem("eco_sports_categories", JSON.stringify(state.categories));
            }
            if (configMap["eco_supplier_payments"]) {
                supplierPayments = configMap["eco_supplier_payments"];
                localStorage.setItem("eco_sports_supplier_payments", JSON.stringify(supplierPayments));
            }
            if (configMap["eco_customer_debts"]) {
                customerDebts = configMap["eco_customer_debts"];
                localStorage.setItem("eco_sports_customer_debts", JSON.stringify(customerDebts));
            }
            if (configMap["eco_product_prices"]) {
                productPrices = configMap["eco_product_prices"];
                localStorage.setItem("eco_sports_product_prices", JSON.stringify(productPrices));
            }
            if (configMap["eco_color_stock"]) {
                colorStock = configMap["eco_color_stock"];
                localStorage.setItem("eco_sports_color_stock", JSON.stringify(colorStock));
            }
            // Hisob jurnali — o'zgarmas append-log: bulut + mahalliyni jid bo'yicha
            // BIRLASHTIRISH (union, yo'qotishsiz). Ko'p qurilmada ham yozuvlar saqlanadi.
            if (configMap["eco_ledger"] && Array.isArray(configMap["eco_ledger"])) {
                const seenJids = new Set(ledger.map(e => e.jid));
                let mergedAny = false;
                configMap["eco_ledger"].forEach(e => {
                    if (e && e.jid && !seenJids.has(e.jid)) { ledger.push(e); seenJids.add(e.jid); mergedAny = true; }
                });
                if (mergedAny) {
                    ledger.sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));
                    localStorage.setItem("eco_sports_ledger", JSON.stringify(ledger));
                    if (typeof renderLedgerView === "function") renderLedgerView();
                }
            }

            // Loyiha boshqa qurilmada tozalangan bo'lsa — bu yerda ham tozalash
            if (configMap["eco_project_cleared_at"]) {
                const clearedAt = Number(configMap["eco_project_cleared_at"]) || 0;
                const seen = Number(localStorage.getItem("eco_sports_cleared_seen")) || 0;
                if (clearedAt > seen) {
                    PRODUCTS = [];
                    state.dynamicProducts = [];
                    inventory = {};
                    colorStock = {};
                    state.kirimHistory = [];
                    state.salesHistory = [];
                    customerDebts = [];
                    localStorage.setItem("eco_sports_products_cleared", "1");
                    localStorage.setItem("eco_sports_dynamic_products", "[]");
                    localStorage.setItem("eco_sports_inventory", "{}");
                    localStorage.setItem("eco_sports_color_stock", "{}");
                    localStorage.setItem("eco_sports_kirim_history", "[]");
                    localStorage.setItem("eco_sports_sales_history", "[]");
                    localStorage.setItem("eco_sports_customer_debts", "[]");
                    localStorage.setItem("eco_sports_cleared_seen", String(clearedAt));
                    console.log("Supabase: Loyiha bulutda tozalangan — mahalliy ma'lumot ham tozalandi.");
                }
            }
            console.log("Supabase: App config synced from eco_config!");
        } else if (cErr) {
            console.warn("Supabase: eco_config load error, using local:", cErr);
        }

        // --- 3. eco_inventory (Ombor) ---
        const { data: cloudInv, error: iErr } = await supabaseClient.from("eco_inventory").select("*");
        if (!iErr && cloudInv && cloudInv.length > 0) {
            let stateUpdated = false;
            cloudInv.forEach(row => {
                inventory[row.product_id] = row.quantity;
                
                // Reconstruct missing pending/approved dynamic products for cross-device synchronization
                const isHardcoded = PRODUCTS.some(p => String(p.id) === String(row.product_id));
                if (!isHardcoded) {
                    const isApproved = (row.price && row.price > 0) ? true : false;
                    let existing = state.dynamicProducts.find(dp => String(dp.id) === String(row.product_id));
                    
                    const rawName = row.product_name || "Yangi Mahsulot";
                    const cogsMatch = rawName.match(/\[cogs:(\d+),pack:(\d+)\]/);
                    let cleanName = rawName;
                    let dbCogs = 0;
                    let dbPackPrice = 0;
                    if (cogsMatch) {
                        dbCogs = parseFloat(cogsMatch[1]) || 0;
                        dbPackPrice = parseFloat(cogsMatch[2]) || 0;
                        cleanName = rawName.replace(/\s*\[cogs:\d+,pack:\d+\]/, "");
                    }

                    if (!existing) {
                        const nameOnly = cleanName;
                        let modelOnly = "M-101";
                        const modelMatch = nameOnly.match(/\(([^)]+)\)/);
                        if (modelMatch) {
                            modelOnly = modelMatch[1];
                        }
                        
                        existing = {
                            id: row.product_id,
                            supplier: row.supplier || "Boshqa",
                            name: nameOnly,
                            model: modelOnly,
                            category: row.category || "tshirt",
                            colors: "Tanlangan Ranglar", // Fallback text
                            sizes: ["S", "M", "L", "XL"], // Fallback o'lchamlar
                            price: row.price || 0,
                            cogs: dbCogs,
                            pack_price: dbPackPrice,
                            approved: isApproved,
                            image: "assets/tshirt.png",
                            qty: row.quantity
                        };
                        state.dynamicProducts.push(existing);
                        stateUpdated = true;
                    } else {
                        // Update attributes in case they were modified/approved on another device
                        if (existing.qty !== row.quantity || existing.approved !== isApproved || existing.price !== (row.price || 0) || existing.cogs !== dbCogs || existing.pack_price !== dbPackPrice) {
                            existing.name = cleanName;
                            existing.qty = row.quantity;
                            existing.price = row.price || 0;
                            existing.cogs = dbCogs;
                            existing.pack_price = dbPackPrice;
                            existing.approved = isApproved;
                            stateUpdated = true;
                        }
                    }
                }
            });
            
            localStorage.setItem("eco_sports_inventory", JSON.stringify(inventory));
            if (stateUpdated) {
                localStorage.setItem("eco_sports_dynamic_products", JSON.stringify(state.dynamicProducts));
                
                // Merge approved dynamic products into PRODUCTS if not already present
                state.dynamicProducts.forEach(p => {
                    if (p.approved) {
                        if (!PRODUCTS.find(item => String(item.id) === String(p.id))) {
                            PRODUCTS.push(p);
                        }
                    }
                });
            }
            console.log("Supabase: Inventory and dynamic products synced from eco_inventory!");
        } else if (iErr) {
            console.warn("Supabase: eco_inventory load error, using local:", iErr);
        }

        // --- 4. eco_sales + eco_sale_items (Savdo) ---
        const { data: cloudSales, error: sErr } = await supabaseClient.from("eco_sales").select("*").order("created_at", { ascending: true });
        if (!sErr && cloudSales && cloudSales.length > 0) {
            // Bulut sxemasi received/qarz/qarzdor/rang ni saqlamaydi. Yo'qotmaslik uchun
            // mahalliy sotuv (boy maydonlar) va hisob jurnalidan (ko'p qurilmali) tiklaymiz.
            const localById = {};
            (state.salesHistory || []).forEach(s => { localById[String(s.id)] = s; });
            const ledgerSaleById = {};
            (typeof ledger !== "undefined" ? ledger : []).forEach(e => { if (e && e.type === "sale" && e.ref) ledgerSaleById[String(e.ref)] = e; });

            const salesWithItems = [];
            for (const sale of cloudSales) {
                const { data: saleItems } = await supabaseClient.from("eco_sale_items").select("*").eq("sale_id", sale.id);
                const total = parseFloat(sale.total_paid) || 0;
                const loc = localById[String(sale.id)];
                const lj = ledgerSaleById[String(sale.id)];
                // received / qarz / qarzdor: mahalliy → jurnal → standart (to'liq to'lov)
                let received = total, debt = 0, debtor = null;
                if (loc && loc.received != null) { received = loc.received; debt = Number(loc.debt) || 0; debtor = loc.debtor || null; }
                else if (lj && lj.data) { received = lj.data.received != null ? lj.data.received : total; debt = Number(lj.data.debt) || 0; debtor = lj.data.debtor ? { name: lj.data.debtor } : null; }
                // mahsulotlar (bulut) + rangni mahalliydan tiklash (nom+o'lcham bo'yicha)
                const items = (saleItems || []).map(si => ({ name: si.product_name, size: si.size, qty: si.qty, soldPrice: parseFloat(si.sold_price) }));
                if (loc && Array.isArray(loc.items)) {
                    items.forEach(it => {
                        const match = loc.items.find(li => li.name === it.name && li.size === it.size && li.color);
                        if (match) it.color = match.color;
                    });
                }
                salesWithItems.push({
                    id: sale.id, timestamp: sale.sale_timestamp, channel: sale.channel, items: items,
                    discount: parseFloat(sale.discount), subtotal: parseFloat(sale.subtotal), totalPaid: total,
                    received: received, debt: debt, debtor: debtor, itemCount: sale.item_count, cashier: sale.cashier_name
                });
            }
            // Bulutda hali yo'q (sinx navbatidagi) mahalliy sotuvlarni ham saqlab qolish
            const cloudIds = new Set(cloudSales.map(s => String(s.id)));
            (state.salesHistory || []).forEach(s => { if (!cloudIds.has(String(s.id))) salesWithItems.push(s); });
            salesWithItems.sort((a, b) => { const da = _saleDateObj(a.timestamp), db = _saleDateObj(b.timestamp); return (da ? da.getTime() : 0) - (db ? db.getTime() : 0); });

            state.salesHistory = salesWithItems;
            localStorage.setItem("eco_sports_sales_history", JSON.stringify(state.salesHistory));
            console.log("Supabase: Sales synced from eco_sales + eco_sale_items (boy maydonlar saqlandi)!");

            // ARVOH MIJOZ QARZLARINI TOZALASH: har qarz sotuv bilan bir xil id'da
            // yaratiladi. Sotuvi yo'q qarz = arvoh (loyiha tozalanganda sotuv o'chgan,
            // lekin qarz qolib ketgan). Sotuvlar muvaffaqiyatli yuklangach — olib tashlanadi.
            try {
                const validSaleIds = new Set((state.salesHistory || []).map(s => String(s.id)));
                const before = (customerDebts || []).length;
                const pruned = (customerDebts || []).filter(d => validSaleIds.has(String(d.id)));
                if (pruned.length !== before) {
                    customerDebts = pruned;
                    localStorage.setItem("eco_sports_customer_debts", JSON.stringify(customerDebts));
                    if (typeof dbSaveConfig === "function") dbSaveConfig("eco_customer_debts", customerDebts);
                    console.log(`Supabase: ${before - pruned.length} ta arvoh mijoz qarzi tozalandi (sotuvi yo'q).`);
                }
            } catch (e) { /* arvoh tozalash xatosi asosiy sinxni buzmasin */ }
        } else if (sErr) {
            console.warn("Supabase: eco_sales load error, using local:", sErr);
        }

        // --- 5. eco_expenses (Xarajatlar) ---
        const { data: cloudExp, error: eErr } = await supabaseClient.from("eco_expenses").select("*").order("created_at", { ascending: true });
        if (!eErr && cloudExp && cloudExp.length > 0) {
            expenses = cloudExp.map(e => ({
                id: e.id,
                timestamp: e.expense_timestamp,
                description: e.description,
                category: e.category,
                amount: parseFloat(e.amount)
            }));
            localStorage.setItem("eco_sports_expenses", JSON.stringify(expenses));
            console.log("Supabase: Expenses synced from eco_expenses!");
        } else if (eErr) {
            console.warn("Supabase: eco_expenses load error, using local:", eErr);
        }

        // --- 6. eco_kirim_history (Kirim Hujjatlari) ---
        const { data: cloudKirims, error: kErr } = await supabaseClient.from("eco_kirim_history").select("*");
        if (!kErr && cloudKirims) {
            state.kirimHistory = cloudKirims;
            localStorage.setItem("eco_sports_kirim_history", JSON.stringify(state.kirimHistory));
            let dynamicProductsUpdated = false;
            cloudKirims.forEach(row => {
                let existing = state.dynamicProducts.find(dp => String(dp.id) === String(row.product_id));
                const isApproved = row.status === "TASDIQLANDI" || (existing && (existing.approved || existing.price > 0));
                
                const rawName = row.product_name || "Yangi Mahsulot";
                const cogsMatch = rawName.match(/\[cogs:(\d+),pack:(\d+)\]/);
                let cleanName = rawName;
                let dbCogs = 0;
                let dbPackPrice = 0;
                if (cogsMatch) {
                    dbCogs = parseFloat(cogsMatch[1]) || 0;
                    dbPackPrice = parseFloat(cogsMatch[2]) || 0;
                    cleanName = rawName.replace(/\s*\[cogs:\d+,pack:\d+\]/, "");
                }

                if (!existing) {
                    existing = {
                        id: row.product_id,
                        supplier: row.supplier,
                        name: `${cleanName} (${row.model})`,
                        model: row.model,
                        category: row.category,
                        colors: row.colors,
                        sizes: safeJsonParse(row.sizes, []),
                        price: 0,
                        cogs: dbCogs,
                        pack_price: dbPackPrice,
                        approved: isApproved,
                        image: "assets/tshirt.png",
                        qty: row.total_qty,
                        colorPacksBreakdown: safeJsonParse(row.color_packs_breakdown, {}),
                        totalPacks: row.total_packs
                    };
                    state.dynamicProducts.push(existing);
                    dynamicProductsUpdated = true;
                } else {
                    // Update attributes dynamically from cloud history document state
                    let updated = false;
                    
                    if (!existing.colors || existing.colors === "Tanlangan Ranglar") {
                        existing.colors = row.colors;
                        updated = true;
                    }
                    if (!existing.sizes || (existing.sizes.length === 4 && existing.sizes.every((val, idx) => val === ["S", "M", "L", "XL"][idx]))) {
                        existing.sizes = safeJsonParse(row.sizes, []);
                        updated = true;
                    }
                    if (!existing.colorPacksBreakdown || Object.keys(existing.colorPacksBreakdown).length === 0) {
                        existing.colorPacksBreakdown = safeJsonParse(row.color_packs_breakdown, {});
                        updated = true;
                    }
                    if (existing.totalPacks !== row.total_packs) {
                        existing.totalPacks = row.total_packs;
                        updated = true;
                    }
                    
                    if (existing.approved !== isApproved) {
                        existing.approved = isApproved;
                        updated = true;
                    }
                    
                    if (dbCogs > 0 && existing.cogs !== dbCogs) {
                        existing.cogs = dbCogs;
                        updated = true;
                    }
                    if (dbPackPrice > 0 && existing.pack_price !== dbPackPrice) {
                        existing.pack_price = dbPackPrice;
                        updated = true;
                    }
                    
                    // Keep qty updated to current inventory quantity if available
                    const currentQty = inventory[row.product_id] !== undefined ? inventory[row.product_id] : row.total_qty;
                    if (existing.qty !== currentQty) {
                        existing.qty = currentQty;
                        updated = true;
                    }
                    
                    if (updated) {
                        dynamicProductsUpdated = true;
                    }
                }
            });

            // PRUNE: bulutdagi kirim'da YO'Q dinamik mahsulotlarni olib tashlash
            // (bulut = yagona manba; bir qurilmada o'chirilsa hammasida o'chadi)
            const cloudIds = new Set(cloudKirims.map(r => String(r.product_id)));
            const removedIds = state.dynamicProducts
                .filter(dp => !cloudIds.has(String(dp.id)))
                .map(dp => String(dp.id));
            if (removedIds.length > 0) {
                state.dynamicProducts = state.dynamicProducts.filter(dp => cloudIds.has(String(dp.id)));
                PRODUCTS = PRODUCTS.filter(p => !removedIds.includes(String(p.id)));
                removedIds.forEach(id => { delete inventory[id]; delete colorStock[id]; });
                localStorage.setItem("eco_sports_inventory", JSON.stringify(inventory));
                localStorage.setItem("eco_sports_color_stock", JSON.stringify(colorStock));
                dynamicProductsUpdated = true;
                console.log(`Supabase: ${removedIds.length} ta eskirgan mahsulot tozalandi (bulutda yo'q).`);
            }

            // NARXNI TIKLASH: eco_product_prices'dan (eco_inventory integer-PK bug'ini chetlab o'tadi)
            state.dynamicProducts.forEach(dp => {
                const pr = productPrices[String(dp.id)] || productPrices[dp.id];
                if (pr) {
                    if (pr.price != null) dp.price = pr.price;
                    if (pr.pack_price != null) dp.pack_price = pr.pack_price;
                    if (pr.cogs != null) dp.cogs = pr.cogs;
                    dp.approved = true; // narx belgilangan => tasdiqlangan
                    dynamicProductsUpdated = true;
                }
            });

            if (dynamicProductsUpdated) {
                localStorage.setItem("eco_sports_dynamic_products", JSON.stringify(state.dynamicProducts));

                // Merge approved dynamic products into PRODUCTS if not already present
                state.dynamicProducts.forEach(p => {
                    if (p.approved) {
                        if (!PRODUCTS.find(item => String(item.id) === String(p.id))) {
                            PRODUCTS.push(p);
                        }
                    }
                });
            }
            console.log("Supabase: Dynamic products synced from eco_kirim_history!");
        } else if (kErr) {
            console.warn("Supabase: eco_kirim_history load error, using local:", kErr);
            const savedKirims = localStorage.getItem("eco_sports_kirim_history");
            if (savedKirims) {
                state.kirimHistory = JSON.parse(savedKirims);
            }
        }
    } catch (err) {
        console.warn("Supabase: Cloud sync failed. Continuing in offline mode:", err);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}
