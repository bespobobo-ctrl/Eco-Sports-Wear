// ========================================================================
//   ECO SPORTS MENSWEAR - SECURE CRM & POS LOGIC
// ========================================================================

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

// 2. PRODUCT DATASET
const PRODUCTS = [
    {
        id: 1,
        name: "Eco-Luxe Breathable T-Shirt",
        price: 260000,
        category: "tshirt",
        image: "assets/tshirt.png",
        sizes: ["S", "M", "L", "XL", "XXL"]
    },
    {
        id: 2,
        name: "Vortex Dry-Fit Tee",
        price: 240000,
        category: "tshirt",
        image: "assets/tshirt.png",
        sizes: ["M", "L", "XL", "XXL"]
    },
    {
        id: 3,
        name: "Pro-Flow Sustainable Shorts",
        price: 220000,
        category: "shorts",
        image: "assets/shorts.png",
        sizes: ["M", "L", "XL", "XXL"]
    },
    {
        id: 4,
        name: "Apex Core Training Shorts",
        price: 190000,
        category: "shorts",
        image: "assets/shorts.png",
        sizes: ["S", "M", "L", "XL"]
    },
    {
        id: 5,
        name: "Hybrid Eco-Performance Tracksuit",
        price: 720000,
        category: "tracksuit",
        image: "assets/tracksuit.png",
        sizes: ["S", "M", "L", "XL"]
    },
    {
        id: 6,
        name: "Thermal Storm Active Set",
        price: 680000,
        category: "tracksuit",
        image: "assets/tracksuit.png",
        sizes: ["M", "L", "XL", "XXL"]
    },
    {
        id: 7,
        name: "Active-Flex Premium Joggers",
        price: 340000,
        category: "joggers",
        image: "assets/joggers.png",
        sizes: ["M", "L", "XL", "XXL", "3XL"]
    },
    {
        id: 8,
        name: "Chill-Out Comfort Sweatpants",
        price: 310000,
        category: "joggers",
        image: "assets/joggers.png",
        sizes: ["M", "L", "XL", "XXL"]
    }
];

// 3. APPLICATION STATE
let state = {
    cart: [],
    selectedProduct: null,
    selectedSize: null,
    activeCategory: "all",
    searchQuery: "",
    salesHistory: []
};

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

// CRM widgets elements
const crmRevenue = document.getElementById("crm-total-revenue");
const crmSalesCount = document.getElementById("crm-total-sales");
const crmAvgInvoice = document.getElementById("crm-avg-invoice");
const crmItemsCount = document.getElementById("crm-total-items");
const crmTableBody = document.getElementById("crm-history-table-body");
const crmEmptyState = document.getElementById("crm-empty-state");
const clearLogsBtn = document.getElementById("crm-clear-logs");

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

    if (userVal === "admin" && passVal === "eco777") {
        loginErrorMsg.style.display = "none";
        sessionStorage.setItem("eco_sports_logged_in", "true");
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

    // Detect active Cashier from Telegram WebApp
    if (tg && tg.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        activeCashierLabel.textContent = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username || "Telegram Admin";
    } else {
        activeCashierLabel.textContent = "Admin";
    }

    // Initialize all renders
    renderTiles();
    updateReceiptUI();
    updateAnalytics();
    renderHistoryTable();
}

function handleLogout() {
    sessionStorage.removeItem("eco_sports_logged_in");
    location.reload();
}

// 7. POS TILES RENDERER
function renderTiles() {
    let filtered = PRODUCTS.filter(p => {
        const matchesCategory = state.activeCategory === "all" || p.category === state.activeCategory;
        const matchesSearch = p.name.toLowerCase().includes(state.searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
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
        card.addEventListener("click", () => openCalcModal(product.id));
        tilesGrid.appendChild(card);
    });
}

// 8. POS CALCULATOR POPUP MODAL
function openCalcModal(productId) {
    const product = PRODUCTS.find(p => p.id === productId);
    if (!product) return;

    state.selectedProduct = product;
    state.selectedSize = product.sizes[0];

    calcTitle.textContent = product.name;
    calcCat.textContent = product.category === 'tshirt' ? 'FUTBOLKA' : product.category === 'shorts' ? 'SHORTIK' : product.category === 'tracksuit' ? 'SPORTIVKA' : 'TRIKO';
    calcStdPrice.textContent = product.price.toLocaleString('uz-UZ');
    calcPriceInput.value = product.price;
    calcQtyInput.value = 1;

    // Render sizing
    calcSizesContainer.innerHTML = "";
    product.sizes.forEach(size => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `size-btn ${size === state.selectedSize ? 'active' : ''}`;
        btn.textContent = size;
        btn.addEventListener("click", () => {
            document.querySelectorAll("#calc-size-options .size-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.selectedSize = size;
        });
        calcSizesContainer.appendChild(btn);
    });

    calcModal.classList.add("open");
}

function closeCalculatorModal() {
    calcModal.classList.remove("open");
    state.selectedProduct = null;
    state.selectedSize = null;
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

    // Render receipt rows
    receiptList.innerHTML = "";
    state.cart.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "receipt-item";
        row.innerHTML = `
            <span class="receipt-item-name">${item.product.name}</span>
            <div class="receipt-item-qty">
                <button class="qty-btn r-qty-minus" data-index="${index}" style="width:18px; height:18px; font-size:0.6rem;"><i class="fa-solid fa-minus"></i></button>
                <span style="font-weight: 700;">${item.qty} (${item.size})</span>
                <button class="qty-btn r-qty-plus" data-index="${index}" style="width:18px; height:18px; font-size:0.6rem;"><i class="fa-solid fa-plus"></i></button>
            </div>
            <span class="receipt-item-price">${formatPrice(item.soldPrice * item.qty)}</span>
            <button class="receipt-remove" data-index="${index}"><i class="fa-solid fa-xmark"></i></button>
        `;
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

    const itemsSummary = state.cart.map(item => `${item.product.name} (${item.size}) x${item.qty}`);

    const newTx = {
        id: orderId,
        timestamp: dateStr,
        channel: channelSelect.value,
        items: itemsSummary,
        discount: discount,
        totalPaid: finalTotal,
        itemCount: itemCount
    };

    // Save transaction to local state and DB
    state.salesHistory.push(newTx);
    localStorage.setItem("eco_sports_sales_history", JSON.stringify(state.salesHistory));

    // Formulate a beautiful invoice message in corporate HTML format
    let orderMsg = `<b>💼 ECO SPORTS - TIZIMDA SOTUV YAKUNLANDI</b>\n`;
    orderMsg += `<b>Chek ID:</b> <code>#${orderId}</code>\n`;
    orderMsg += `<b>Sana:</b> ${dateStr}\n`;
    orderMsg += `<b>Kassir:</b> ${activeCashierLabel.textContent}\n`;
    orderMsg += `<b>Sotuv kanali:</b> ${channelSelect.value === 'telegram' ? 'Mini App' : channelSelect.value === 'phone' ? 'Telefon' : 'Do\'kon (POS)'}\n`;
    orderMsg += `-------------------------------------------\n`;
    orderMsg += `🛍 <b>Mahsulotlar:</b>\n`;

    state.cart.forEach(item => {
        orderMsg += `- <code>${item.product.name}</code> (${item.size}) x${item.qty} ➔ <b>${formatPrice(item.soldPrice * item.qty)}</b>\n`;
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
    const targetChatId = tg?.initDataUnsafe?.user?.id || "648833917"; 
    if (targetChatId) {
        try {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
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

    // Display confirmation
    alert(`Savdo yakunlandi!\nChek ID: #${orderId}\nJami to'lov: ${formatPrice(finalTotal)}`);

    // Reset cashier forms
    state.cart = [];
    discountInput.value = 0;
    updateReceiptUI();
    updateAnalytics();
    renderHistoryTable();

    // Regenerate unique receipt ID
    receiptIdLabel.textContent = "#" + generateReceiptId();
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
        const itemsSummary = tx.items.join(", ");

        row.innerHTML = `
            <td><strong>#${tx.id}</strong></td>
            <td>${tx.timestamp}</td>
            <td><span class="channel-tag tag-${tx.channel}">${tx.channel === 'telegram' ? 'Mini App' : tx.channel === 'phone' ? 'Telefon' : 'Do\'kon'}</span></td>
            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemsSummary}">${itemsSummary}</td>
            <td>${formatPrice(tx.discount)}</td>
            <td style="font-weight: 800; color: var(--primary);">${formatPrice(tx.totalPaid)}</td>
            <td>
                <button class="qty-btn delete-log-btn" data-idx="${actualIdx}" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: #ef4444; width:30px; height:30px;">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        crmTableBody.appendChild(row);
    });

    // Delete single transaction log listener
    document.querySelectorAll(".delete-log-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            if (confirm("Ushbu sotuv logini o'chirmoqchimisiz?")) {
                const idx = parseInt(btn.dataset.idx);
                state.salesHistory.splice(idx, 1);
                localStorage.setItem("eco_sports_sales_history", JSON.stringify(state.salesHistory));
                renderHistoryTable();
                updateAnalytics();
            }
        });
    });
}

// 12. GENERAL CONTROLS SETUP
function setupEventListeners() {
    // Toggle Password Visibility
    togglePwIcon.addEventListener("click", () => {
        if (passwordInput.type === "password") {
            passwordInput.type = "text";
            togglePwIcon.className = "fa-solid fa-eye toggle-pw";
        } else {
            passwordInput.type = "password";
            togglePwIcon.className = "fa-solid fa-eye-slash toggle-pw";
        }
    });

    // Handle authentication form submission
    loginForm.addEventListener("submit", handleLoginSubmit);

    // Logout
    logoutTrigger.addEventListener("click", handleLogout);

    // POS Category filters
    filterBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            filterBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.activeCategory = btn.dataset.posFilter;
            renderTiles();
        });
    });

    // Search events
    searchInput.addEventListener("input", (e) => {
        state.searchQuery = e.target.value;
        renderTiles();
    });

    // Calc Qty controls
    calcQtyMinus.addEventListener("click", () => {
        let val = parseInt(calcQtyInput.value) || 1;
        if (val > 1) calcQtyInput.value = val - 1;
    });

    calcQtyPlus.addEventListener("click", () => {
        let val = parseInt(calcQtyInput.value) || 1;
        calcQtyInput.value = val + 1;
    });

    closeCalcModal.addEventListener("click", closeCalculatorModal);
    calcModal.addEventListener("click", (e) => {
        if (e.target === calcModal) closeCalculatorModal();
    });

    // Calc Form submission (adding custom values to register)
    calcForm.addEventListener("submit", (e) => {
        e.preventDefault();
        
        const qty = parseInt(calcQtyInput.value) || 1;
        const soldPrice = parseFloat(calcPriceInput.value) || state.selectedProduct.price;

        const existing = state.cart.find(item => item.product.id === state.selectedProduct.id && item.size === state.selectedSize);

        if (existing) {
            existing.qty += qty;
            existing.soldPrice = soldPrice;
        } else {
            state.cart.push({
                product: state.selectedProduct,
                size: state.selectedSize,
                qty: qty,
                soldPrice: soldPrice
            });
        }

        updateReceiptUI();
        closeCalculatorModal();
    });

    // Live discount inputs changes
    discountInput.addEventListener("input", updateReceiptUI);

    // Complete Sale manually
    checkoutBtn.addEventListener("click", completeSale);

    // Hook Telegram native button clicks
    if (tg) {
        tg.MainButton.onClick(() => {
            completeSale();
        });
    }

    // Clear CRM logs database
    clearLogsBtn.addEventListener("click", () => {
        if (confirm("Barcha savdo tarixlarini o'chirmoqchimisiz? Buni qaytarib bo'lmaydi.")) {
            state.salesHistory = [];
            localStorage.setItem("eco_sports_sales_history", JSON.stringify([]));
            updateAnalytics();
            renderHistoryTable();
        }
    });
}

// 13. INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    // Check if user is already authenticated
    const isAuthenticated = sessionStorage.getItem("eco_sports_logged_in") === "true";

    // Set random receipt ID
    receiptIdLabel.textContent = "#" + generateReceiptId();

    // Load localStorage Sales history database
    const savedLogs = localStorage.getItem("eco_sports_sales_history");
    if (savedLogs) {
        state.salesHistory = JSON.parse(savedLogs);
    } else {
        state.salesHistory = [];
    }

    setupEventListeners();

    if (isAuthenticated) {
        unlockDashboard();
    }
});
