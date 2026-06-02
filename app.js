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
const BOT_TOKEN = "8592915921:AAE7L1Rf2bPEzywea_DjF6cYsZAQ9IRcsOE";

if (tg) {
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation();
    
    // Set native header and background color to blend perfectly with our dark app theme
    tg.setHeaderColor('#090d16');
    tg.setBackgroundColor('#090d16');
}

// 1.5. SUPABASE CLOUD DATABASE CONFIGURATION
const SUPABASE_URL = "https://ddqoktwkffnufczhdads.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkcW9rdHdrZmZudWZjemhkYWRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyOTUyODgsImV4cCI6MjA5NTg3MTI4OH0.IL-C7px7_lcmwQxgXhbNlrmy0NAYN6RmQKmiUQpgq-Q";
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// 1.7. SUPABASE SYNCHRONIZATION HELPERS

// --- eco_users (Login / Parollar) ---
async function dbSaveUser(user) {
    if (!supabaseClient) return;
    try {
        await supabaseClient.from("eco_users").upsert({
            id: user.id,
            name: user.name,
            username: user.username,
            password: user.password,
            pin: user.pin,
            role: user.role
        });
    } catch (err) {
        console.error("Supabase user save failed:", err);
    }
}

async function dbDeleteUser(userId) {
    if (!supabaseClient) return;
    try {
        await supabaseClient.from("eco_users").delete().eq("id", userId);
    } catch (err) {
        console.error("Supabase user delete failed:", err);
    }
}

// --- eco_config (Tizim Sozlamalari) ---
async function dbSaveConfig(key, value) {
    if (!supabaseClient) return;
    try {
        await supabaseClient.from("eco_config").upsert({ key: key, value: value });
    } catch (err) {
        console.error(`Supabase config save failed for ${key}:`, err);
    }
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

// --- eco_sales + eco_sale_items (Savdo) ---
async function dbSaveSale(tx, cartItems) {
    if (!supabaseClient) return;
    try {
        // 1. Savdo chekini saqlash
        await supabaseClient.from("eco_sales").upsert({
            id: tx.id,
            cashier_id: currentUser ? currentUser.id : null,
            cashier_name: tx.cashier,
            sale_timestamp: tx.timestamp,
            channel: tx.channel,
            discount: tx.discount,
            subtotal: tx.subtotal,
            total_paid: tx.totalPaid,
            item_count: tx.itemCount
        });

        // 2. Sotilgan mahsulotlarni alohida saqlash (sotuvchi bilan bog'langan)
        const saleItems = cartItems.map(item => ({
            sale_id: tx.id,
            cashier_id: currentUser ? currentUser.id : null,
            product_name: typeof item === 'object' ? item.name : item,
            size: typeof item === 'object' ? item.size : '',
            qty: typeof item === 'object' ? item.qty : 1,
            sold_price: typeof item === 'object' ? item.soldPrice : 0
        }));
        await supabaseClient.from("eco_sale_items").insert(saleItems);
    } catch (err) {
        console.error("Supabase sale save failed:", err);
    }
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

// --- eco_expenses (Xarajatlar) ---
async function dbSaveExpense(expense) {
    if (!supabaseClient) return;
    try {
        await supabaseClient.from("eco_expenses").upsert({
            id: expense.id,
            expense_timestamp: expense.timestamp,
            description: expense.description,
            category: expense.category,
            amount: expense.amount
        });
    } catch (err) {
        console.error("Supabase expense save failed:", err);
    }
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

// 2. PRODUCT DATASET (4 Suppliers x 4 Categories)
let PRODUCTS = [
    // Alisher Aka
    { id: 101, supplier: "Alisher Aka", name: "Alisher Aka - Futbolka", price: 260000, category: "tshirt", image: "assets/tshirt.png", sizes: ["S", "M", "L", "XL", "XXL"] },
    { id: 102, supplier: "Alisher Aka", name: "Alisher Aka - Shortik", price: 220000, category: "shorts", image: "assets/shorts.png", sizes: ["M", "L", "XL", "XXL"] },
    { id: 103, supplier: "Alisher Aka", name: "Alisher Aka - Sportivka", price: 720000, category: "tracksuit", image: "assets/tracksuit.png", sizes: ["S", "M", "L", "XL"] },
    { id: 104, supplier: "Alisher Aka", name: "Alisher Aka - Triko", price: 340000, category: "joggers", image: "assets/joggers.png", sizes: ["M", "L", "XL", "XXL", "3XL"] },
    // Nodir aka
    { id: 201, supplier: "Nodir aka", name: "Nodir aka - Futbolka", price: 240000, category: "tshirt", image: "assets/tshirt.png", sizes: ["S", "M", "L", "XL", "XXL"] },
    { id: 202, supplier: "Nodir aka", name: "Nodir aka - Shortik", price: 200000, category: "shorts", image: "assets/shorts.png", sizes: ["M", "L", "XL", "XXL"] },
    { id: 203, supplier: "Nodir aka", name: "Nodir aka - Sportivka", price: 680000, category: "tracksuit", image: "assets/tracksuit.png", sizes: ["S", "M", "L", "XL"] },
    { id: 204, supplier: "Nodir aka", name: "Nodir aka - Triko", price: 320000, category: "joggers", image: "assets/joggers.png", sizes: ["M", "L", "XL", "XXL", "3XL"] },
    // Eco Sports
    { id: 301, supplier: "Eco Sports", name: "Eco Sports - Futbolka", price: 280000, category: "tshirt", image: "assets/tshirt.png", sizes: ["S", "M", "L", "XL", "XXL"] },
    { id: 302, supplier: "Eco Sports", name: "Eco Sports - Shortik", price: 230000, category: "shorts", image: "assets/shorts.png", sizes: ["M", "L", "XL", "XXL"] },
    { id: 303, supplier: "Eco Sports", name: "Eco Sports - Sportivka", price: 750000, category: "tracksuit", image: "assets/tracksuit.png", sizes: ["S", "M", "L", "XL"] },
    { id: 304, supplier: "Eco Sports", name: "Eco Sports - Triko", price: 360000, category: "joggers", image: "assets/joggers.png", sizes: ["M", "L", "XL", "XXL", "3XL"] },
    // Xitoy
    { id: 401, supplier: "Xitoy", name: "Xitoy - Futbolka", price: 180000, category: "tshirt", image: "assets/tshirt.png", sizes: ["S", "M", "L", "XL", "XXL"] },
    { id: 402, supplier: "Xitoy", name: "Xitoy - Shortik", price: 150000, category: "shorts", image: "assets/shorts.png", sizes: ["M", "L", "XL", "XXL"] },
    { id: 403, supplier: "Xitoy", name: "Xitoy - Sportivka", price: 550000, category: "tracksuit", image: "assets/tracksuit.png", sizes: ["S", "M", "L", "XL"] },
    { id: 404, supplier: "Xitoy", name: "Xitoy - Triko", price: 280000, category: "joggers", image: "assets/joggers.png", sizes: ["M", "L", "XL", "XXL", "3XL"] }
];

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
    botToken: "8592915921:AAE7L1Rf2bPEzywea_DjF6cYsZAQ9IRcsOE",
    chatId: "648833917",
    storeName: "ECO SPORTS",
    storeAddress: "Tashkent, Yunusobod",
    storePhone: "+998 90 123 45 67"
};

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
function handleLoginSubmit(e) {
    e.preventDefault();
    const userVal = usernameInput.value.trim();
    const passVal = passwordInput.value;

    const matchedUser = users.find(u => u.username && u.username.toLowerCase().trim() === userVal.toLowerCase() && u.password === passVal);

    if (matchedUser) {
        loginErrorMsg.style.display = "none";
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
        state.selectedSize = "Pachka (Set: S-XXL)";
        if (sizeLabelEl) sizeLabelEl.textContent = "Pachka:";
        calcSizesContainer.innerHTML = "";
        const sbtn = document.createElement("button");
        sbtn.type = "button"; sbtn.className = "size-btn active";
        sbtn.style.width = "auto"; sbtn.style.padding = "0 1.5rem";
        sbtn.textContent = "1 Pachka (Set)";
        calcSizesContainer.appendChild(sbtn);

        if (useColors && colorGroup && colorOptions) {
            colorGroup.style.display = "block";
            const cs = colorStock[product.id];
            colorOptions.innerHTML = "";
            let firstAvail = null;
            Object.keys(cs).forEach(color => {
                const fullPacks = product.sizes.length ? Math.min(...product.sizes.map(s => cs[color][s] || 0)) : 0;
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "size-btn";
                btn.disabled = fullPacks < 1;
                btn.innerHTML = `${color} <small>(${fullPacks} pachka)</small>`;
                if (fullPacks < 1) btn.style.opacity = "0.4";
                else if (!firstAvail) firstAvail = color;
                btn.addEventListener("click", () => {
                    if (fullPacks < 1) return;
                    colorOptions.querySelectorAll(".size-btn").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    state.selectedColor = color;
                });
                colorOptions.appendChild(btn);
            });
            state.selectedColor = firstAvail;
            if (firstAvail) {
                const idx = Object.keys(cs).indexOf(firstAvail);
                const btns = colorOptions.querySelectorAll(".size-btn");
                if (btns[idx]) btns[idx].classList.add("active");
            }
        } else if (colorGroup) {
            colorGroup.style.display = "none";
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
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "size-btn";
                btn.disabled = total < 1;
                btn.innerHTML = `${color} <small>(${total} dona)</small>`;
                if (total < 1) btn.style.opacity = "0.4";
                else if (!firstColor) firstColor = color;
                btn.addEventListener("click", () => {
                    if (total < 1) return;
                    colorOptions.querySelectorAll(".size-btn").forEach(b => b.classList.remove("active"));
                    btn.classList.add("active");
                    state.selectedColor = color;
                    renderCalcDonaSizes(product, color);
                });
                colorOptions.appendChild(btn);
            });
            state.selectedColor = firstColor || Object.keys(cs)[0];
            const fidx = Object.keys(cs).indexOf(state.selectedColor);
            const cbtns = colorOptions.querySelectorAll(".size-btn");
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
        btn.className = "size-btn";
        btn.disabled = avail < 1;
        btn.innerHTML = `${size} <small>(${avail})</small>`;
        if (avail < 1) btn.style.opacity = "0.4";
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

function closeCalculatorModal() {
    calcModal.classList.remove("open");
    state.selectedProduct = null;
    state.selectedSize = null;
    state.selectedColor = null;
}

// 9. VIRTUAL CASH REGISTER RECEIPTS MANAGEMENT
function updateReceiptUI() {
    const subtotal = state.cart.reduce((total, item) => total + (item.soldPrice * item.qty), 0);
    const discount = parseFloat(discountInput.value) || 0;
    const finalTotal = Math.max(0, subtotal - discount);

    receiptSubtotal.textContent = formatPrice(subtotal);
    receiptDiscountValue.textContent = "-" + formatPrice(discount);
    receiptFinalTotal.textContent = formatPrice(finalTotal);

    // Sync checkout button
    if (state.cart.length > 0) {
        checkoutBtn.removeAttribute("disabled");
    } else {
        checkoutBtn.setAttribute("disabled", "true");
    }

    // Sync Telegram Native Button if TMA active
    if (tg) {
        checkoutBtn.style.display = "none"; // Hide standard button, rely on Telegram Main Button
        if (state.cart.length > 0) {
            tg.MainButton.setText(`SOTISHNI YAKUNLASH (${formatPrice(finalTotal)})`);
            tg.MainButton.setParams({
                color: "#10b981",
                text_color: "#ffffff"
            });
            tg.MainButton.show();
        } else {
            tg.MainButton.hide();
        }
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
        
        const isOptim = currentUser && currentUser.role === "kassir-optim";
        const colorTag = item.color ? `${item.color} ` : "";
        const sizeLabel = isOptim ? `${colorTag}pachka` : `${colorTag}(${item.size})`;
        
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
            state.cart[idx].qty++;
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
        itemCount: itemCount,
        cashier: activeCashierLabel.textContent
    };

    // Save transaction to local state and DB
    state.salesHistory.push(newTx);
    localStorage.setItem("eco_sports_sales_history", JSON.stringify(state.salesHistory));
    dbSaveSale(newTx, itemsData);

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
    orderMsg += `💵 <b>Jami tushum:</b> <u>${formatPrice(finalTotal)}</u>\n\n`;
    orderMsg += `🟢 <i>CRM Tizimi muvaffaqiyatli yangilandi.</i>`;

    console.log("%cSale Committed!", "color:#10b981; font-weight:bold;");
    console.log(orderMsg);

    // Send the structured HTML invoice directly to the Admin's Telegram chat
    const targetChatId = appConfig.chatId || tg?.initDataUnsafe?.user?.id || "648833917"; 
    if (targetChatId) {
        try {
            await fetch(`https://api.telegram.org/bot${appConfig.botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: targetChatId,
                    text: orderMsg,
                    parse_mode: "HTML"
                })
            });
            console.log("Structured HTML invoice sent to admin Telegram chat ID: " + targetChatId);
        } catch (err) {
            console.error("Bot API delivery failed:", err);
        }
    }

    // Trigger haptic vibration
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
    }

    // Populate and open Premium Virtual Success Receipt Modal
    const storeName = appConfig.storeName || "ECO SPORTS";
    const storeDesc = `${appConfig.storeAddress || "Tashkent"} | Tel: ${appConfig.storePhone || ""}`;
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
    const storeDesc = `${appConfig.storeAddress || "Tashkent"} | Tel: ${appConfig.storePhone || ""}`;
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
function clearProject() {
    // BARCHA mahsulotlar (demo standart + dinamik) butunlay olib tashlanadi
    PRODUCTS = [];
    localStorage.setItem("eco_sports_products_cleared", "1"); // qayta yuklanganda demo qaytmasin

    state.dynamicProducts = [];
    inventory = {};
    colorStock = {};
    state.kirimHistory = [];
    state.salesHistory = []; // savdo tarixi

    localStorage.setItem("eco_sports_dynamic_products", "[]");
    localStorage.setItem("eco_sports_inventory", "{}");
    localStorage.setItem("eco_sports_color_stock", "{}");
    localStorage.setItem("eco_sports_kirim_history", "[]");
    localStorage.setItem("eco_sports_sales_history", "[]");

    // Supabase'dan ham o'chirish (.then() — aks holda so'rov yuborilmaydi)
    if (typeof supabaseClient !== "undefined" && supabaseClient) {
        try { supabaseClient.from("eco_inventory").delete().not("product_id", "is", null).then(() => {}, () => {}); } catch (e) { console.warn(e); }
        try { supabaseClient.from("eco_kirim_history").delete().not("id", "is", null).then(() => {}, () => {}); } catch (e) { console.warn(e); }
        try { supabaseClient.from("eco_sale_items").delete().not("id", "is", null).then(() => {}, () => {}); } catch (e) { console.warn(e); }
        try { supabaseClient.from("eco_sales").delete().not("id", "is", null).then(() => {}, () => {}); } catch (e) { console.warn(e); }
        if (typeof dbSaveConfig === "function") dbSaveConfig("eco_color_stock", {});
    }

    // Savatni ham tozalash
    state.cart = [];

    // UI'ni yangilash
    if (typeof renderTiles === "function") renderTiles();
    if (typeof renderOmborTable === "function") renderOmborTable();
    if (typeof renderBuxgalteriya === "function") renderBuxgalteriya();
    if (typeof renderHistoryTable === "function") renderHistoryTable();
    if (typeof updateAnalytics === "function") updateAnalytics();
    if (typeof updateReceiptUI === "function") updateReceiptUI();

    alert("✅ Loyiha to'liq tozalandi!\nMahsulotlar, ombor zaxirasi va savdo tarixi o'chirildi.");
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
function calcRealCOGS() {
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

    (state.salesHistory || []).forEach(tx => {
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
function getSupplierPaidTotal(name) {
    return (supplierPayments[name] || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}
function addSupplierPayment(name, amount, note, image) {
    if (!supplierPayments[name]) supplierPayments[name] = [];
    supplierPayments[name].push({ id: "pay-" + Date.now(), amount: Number(amount) || 0, note: note || "", date: new Date().toISOString(), image: image || null });
    saveSupplierPayments();
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
        const qtyDona = inventory[p.id] !== undefined ? inventory[p.id] : 0;
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
    if (state.salesHistory) {
        state.salesHistory.forEach(sale => {
            if (sale.timestamp && sale.timestamp.slice(0, 7) === selectedMonth) {
                const isOptim = sale.channel === "optim";
                (sale.items || []).forEach(item => {
                    const itemSupplier = getSupplierFromProductName(item.name);
                    if (itemSupplier === selectedSupplier) {
                        const prod = supplierProducts.find(sp => sp.name === item.name || item.name.includes(sp.name) || sp.name.includes(item.name));
                        const prodId = prod ? prod.id : null;

                        const qty = item.qty || 1;
                        const soldPrice = item.soldPrice || 0;
                        const totalItemVal = qty * soldPrice;

                        if (isOptim) {
                            const packSizes = prod ? (prod.sizes ? prod.sizes.length : 5) : 5;
                            const packs = qty / packSizes;

                            totalOptimPacks += packs;
                            totalOptimVal += totalItemVal;

                            if (prodId && productMetrics[prodId]) {
                                productMetrics[prodId].optimPacks += packs;
                                productMetrics[prodId].optimVal += totalItemVal;
                                productMetrics[prodId].totalSoldVal += totalItemVal;
                            }
                        } else {
                            totalDonaQty += qty;
                            totalDonaVal += totalItemVal;

                            if (prodId && productMetrics[prodId]) {
                                productMetrics[prodId].donaQty += qty;
                                productMetrics[prodId].donaVal += totalItemVal;
                                productMetrics[prodId].totalSoldVal += totalItemVal;
                            }
                        }
                    }
                });
            }
        });
    }

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
                <td style="font-weight: 800; color: #fff;">
                    ${reportFmtMoney(m.totalSoldVal)}
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

// --- RENDER DYNAMIC COLOR-WISE PACK INPUTS [NEW] ---
function renderDynamicPackInputs() {
    const container = document.getElementById("warehouse-qty-container");
    if (!container) return;

    const checkedColors = Array.from(document.querySelectorAll('input[name="warehouse-color"]:checked')).map(cb => cb.value);
    const checkedSizesCount = document.querySelectorAll('input[name="warehouse-size"]:checked').length;

    if (checkedColors.length === 0) {
        container.innerHTML = `<small style="color: var(--text-muted); font-style: italic; padding: 0.5rem 0; display: block;">💡 Ranglarni va o'lchamlarni tanlang, miqdorni kiritish maydoni ochiladi.</small>`;
        return;
    }

    let html = `<label style="margin-bottom: 0.5rem; display: block; font-weight: 700;">Kirim Miqdori (Pachkada)</label>`;
    html += `<div style="font-size: 0.72rem; color: var(--accent); margin-bottom: 0.8rem; background: rgba(99, 102, 241, 0.05); padding: 0.6rem 0.8rem; border-radius: 8px; border: 1px dashed rgba(99, 102, 241, 0.2); line-height: 1.4;">
                💡 <strong>1 pachkada:</strong> ${checkedSizesCount} dona kiyim bo'ladi (chunki ${checkedSizesCount} ta razmer belgilandi). Dona kiritilmaydi, faqat pachka kiritiladi!
             </div>`;
    html += `<div style="display: flex; flex-direction: column; gap: 0.6rem;">`;

    checkedColors.forEach(color => {
        // Find existing value if any to preserve it when toggling other checkmarks
        const existingInput = document.querySelector(`.color-pack-input[data-color="${color}"]`);
        const val = existingInput ? existingInput.value : "10";

        html += `
            <div style="display: grid; grid-template-columns: 1fr 130px; align-items: center; background: rgba(255,255,255,0.02); padding: 0.5rem 0.8rem; border-radius: 8px; border: 1px solid var(--border-color);">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="color-dot" style="display:inline-block; width:10px; height:10px; border-radius:50%; background-color: ${getColorHex(color)}; border: 1px solid rgba(255,255,255,0.2);"></span>
                    <strong style="color: #fff; font-size: 0.85rem;">${color}</strong>
                </div>
                <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                    <input type="number" class="color-pack-input" data-color="${color}" value="${val}" min="1" required style="width: 70px; padding: 0.3rem 0.5rem; text-align: center; border-radius: 6px; background: var(--bg-dark-input); border: 1px solid var(--border-color); color: var(--primary); font-weight: 800; font-size: 0.85rem;">
                    <span style="font-size: 0.72rem; color: var(--text-muted); font-weight:700;">pachka</span>
                </div>
            </div>
        `;
    });
    html += `</div>`;

    container.innerHTML = html;
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

    // Sync to Supabase
    if (supabaseClient) {
        dbSaveInventory(p.id, p, inventory[p.id]);

        // Also update the status of the Kirim document to TASDIQLANDI
        supabaseClient.from("eco_kirim_history")
            .update({ status: "TASDIQLANDI" })
            .eq("product_id", p.id)
            .then(() => {
                console.log("Supabase: Kirim history status updated to TASDIQLANDI!");
            });
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
    const tokenInput = document.getElementById("settings-bot-token");
    const chatInput = document.getElementById("settings-chat-id");
    
    if (pinInput) pinInput.value = appConfig.pin;
    if (tokenInput) tokenInput.value = appConfig.botToken;
    if (chatInput) chatInput.value = appConfig.chatId || "";
    
    renderCashiersList();
    renderSettingsSuppliersAndCategories();
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
        if (calcQtyInput) {
            let val = parseInt(calcQtyInput.value) || 1;
            calcQtyInput.value = val + 1;
        }
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

    // Complete Sale manually
    safeBind(checkoutBtn, "click", openPinModal);

    // Hook Telegram native button clicks
    if (tg && tg.MainButton) {
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

                // Upsert to eco_kirim_history table for cross-device metadata sync
                supabaseClient.from("eco_kirim_history").upsert({
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
                }).then(() => {
                    console.log("Supabase: Kirim history record synced!");
                });
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
    const settingsTokenInput = document.getElementById("settings-bot-token");
    const settingsChatInput = document.getElementById("settings-chat-id");
    
    if (settingsForm) {
        settingsForm.addEventListener("submit", (e) => {
            e.preventDefault();
            if (!settingsPinInput || !settingsTokenInput || !settingsChatInput) return;
            
            const pinVal = settingsPinInput.value.trim();
            const tokenVal = settingsTokenInput.value.trim();
            const chatVal = settingsChatInput.value.trim();
            
            if (pinVal.length !== 4 || isNaN(pinVal)) {
                alert("Kassa PIN-kodi 4 xonali raqam bo'lishi shart!");
                return;
            }
            
            appConfig.pin = pinVal;
            appConfig.botToken = tokenVal;
            appConfig.chatId = chatVal;
            
            localStorage.setItem("eco_sports_config", JSON.stringify(appConfig));
            dbSaveConfig("app_config", appConfig);
            
            if (tg && tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
            
            alert("Tizim sozlamalari muvaffaqiyatli saqlandi!");
        });
    }

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
            clearModal.classList.remove("open");
            clearProject();
        } else {
            if (clearError) clearError.style.display = "flex";
            if (clearPass) { clearPass.value = ""; clearPass.focus(); }
        }
    });

    // Sozlamalar accordion'lari — sarlavhaga bosib ochish/yopish
    document.querySelectorAll(".settings-acc-head").forEach(head => {
        head.addEventListener("click", (e) => {
            if (e.target.closest(".settings-add-btn")) return; // "Yangi" tugma accordionni ochmasin
            head.parentElement.classList.toggle("open");
        });
    });

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
                    dbSaveUser(users[idx]);
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

    if (isAuthenticated) {
        unlockDashboard();
    }

    // 13.5. LOAD FROM SUPABASE CLOUD IN BACKGROUND (non-blocking)
    if (supabaseClient) {
        syncFromSupabase().then(() => {
            console.log("%c✅ Supabase: Background sync completed!", "color:#10b981; font-weight:bold;");
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
        // --- 1. eco_users (Login / Parollar) ---
        const { data: cloudUsers, error: uErr } = await supabaseClient.from("eco_users").select("*");
        if (!uErr && cloudUsers && cloudUsers.length > 0) {
            users = cloudUsers;
            localStorage.setItem("eco_sports_users", JSON.stringify(users));
            // Re-migrate roles after cloud sync
            users.forEach(u => {
                if (!u.role) {
                    const usernameLower = u.username ? u.username.toLowerCase() : "";
                    if (usernameLower === "admin") u.role = "admin";
                    else if (usernameLower === "optim1") u.role = "kassir-optim";
                    else if (usernameLower === "dona1") u.role = "kassir-dona";
                    else u.role = "kassir-dona";
                }
            });
            console.log("Supabase: Users synced from eco_users!");
        } else if (uErr) {
            console.warn("Supabase: eco_users load error, using local:", uErr);
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
            if (configMap["eco_color_stock"]) {
                colorStock = configMap["eco_color_stock"];
                localStorage.setItem("eco_sports_color_stock", JSON.stringify(colorStock));
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
            const salesWithItems = [];
            for (const sale of cloudSales) {
                const { data: saleItems } = await supabaseClient.from("eco_sale_items").select("*").eq("sale_id", sale.id);
                salesWithItems.push({
                    id: sale.id,
                    timestamp: sale.sale_timestamp,
                    channel: sale.channel,
                    items: (saleItems || []).map(si => ({
                        name: si.product_name,
                        size: si.size,
                        qty: si.qty,
                        soldPrice: parseFloat(si.sold_price)
                    })),
                    discount: parseFloat(sale.discount),
                    subtotal: parseFloat(sale.subtotal),
                    totalPaid: parseFloat(sale.total_paid),
                    itemCount: sale.item_count,
                    cashier: sale.cashier_name
                });
            }
            state.salesHistory = salesWithItems;
            localStorage.setItem("eco_sports_sales_history", JSON.stringify(state.salesHistory));
            console.log("Supabase: Sales synced from eco_sales + eco_sale_items!");
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
