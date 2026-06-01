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

// 2. PRODUCT DATASET (4 Suppliers x 4 Categories)
const PRODUCTS = [
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
let state = {
    cart: [],
    selectedProduct: null,
    selectedSize: null,
    activeSupplier: "all",
    activeCategory: "all",
    searchQuery: "",
    salesHistory: []
};

// Initial default configuration parameters
let appConfig = {
    pin: "7777",
    botToken: "8592915921:AAE7L1Rf2bPEzywea_DjF6cYsZAQ9IRcsOE",
    chatId: "648833917"
};

// Default stock allocation of 50 units for each menswear catalog product
const defaultInventory = {};
PRODUCTS.forEach(p => {
    defaultInventory[p.id] = 50;
});

let inventory = defaultInventory;
let expenses = [];

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

    // Map raw structured items array to store complete pricing & sizing
    const itemsData = state.cart.map(item => ({
        name: item.product.name,
        size: item.size,
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

    // Subtract purchased items from stock inventory
    state.cart.forEach(item => {
        const prodId = item.product.id;
        const qty = item.qty;
        if (inventory[prodId] !== undefined) {
            inventory[prodId] = Math.max(0, inventory[prodId] - qty);
        }
    });
    localStorage.setItem("eco_sports_inventory", JSON.stringify(inventory));

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
        row.innerHTML = `
            <span>${item.product.name} (${item.size})</span>
            <span style="text-align: center;">x${item.qty}</span>
            <span style="text-align: right; font-weight: bold;">${formatPrice(item.soldPrice * item.qty)}</span>
        `;
        receiptModalItemsContainer.appendChild(row);
    });

    successReceiptModal.classList.add("open");

    // Reset cashier forms
    state.cart = [];
    discountInput.value = 0;
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

    if (pinVal === appConfig.pin) {
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
                state.salesHistory.splice(idx, 1);
                localStorage.setItem("eco_sports_sales_history", JSON.stringify(state.salesHistory));
                renderHistoryTable();
                updateAnalytics();
            }
        });
    });
}

// 11.5 WAREHOUSE (OMBOR) INVENTORY RENDERER
function renderOmborTable() {
    const tableBody = document.getElementById("ombor-inventory-table-body");
    if (!tableBody) return;
    
    tableBody.innerHTML = "";
    
    const searchVal = document.getElementById("ombor-search-input")?.value.toLowerCase() || "";
    const activeSupplierBtn = document.querySelector("[data-ombor-supplier].active");
    const activeSupplier = activeSupplierBtn ? activeSupplierBtn.dataset.omborSupplier : "all";
    
    const filtered = PRODUCTS.filter(p => {
        const matchesSupplier = activeSupplier === "all" || p.supplier === activeSupplier;
        const matchesSearch = p.name.toLowerCase().includes(searchVal);
        return matchesSupplier && matchesSearch;
    });
    
    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    Mos mahsulotlar topilmadi
                </td>
            </tr>
        `;
        return;
    }
    
    filtered.forEach(p => {
        const qty = inventory[p.id] || 0;
        let statusBadge = "";
        
        if (qty === 0) {
            statusBadge = `<span class="channel-tag" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">Tugadi</span>`;
        } else if (qty <= 10) {
            statusBadge = `<span class="channel-tag" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b;">Kam qoldi</span>`;
        } else {
            statusBadge = `<span class="channel-tag" style="background: rgba(16, 185, 129, 0.1); color: var(--primary);">Etarli</span>`;
        }
        
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>#${p.id}</strong></td>
            <td>${p.supplier}</td>
            <td>${p.name}</td>
            <td><span style="text-transform: uppercase; font-size: 0.75rem; font-weight: 700; color: var(--accent);">${p.category === 'tshirt' ? 'Futbolka' : p.category === 'shorts' ? 'Shortik' : p.category === 'tracksuit' ? 'Sportivka' : 'Triko'}</span></td>
            <td>${formatPrice(p.price)}</td>
            <td><strong>${qty} dona</strong></td>
            <td>${statusBadge}</td>
            <td>
                <div style="display: flex; gap: 0.4rem;">
                    <button class="qty-btn add-stock-btn" data-id="${p.id}" style="background: var(--primary-glow); border-color: rgba(16, 185, 129, 0.2); color: var(--primary); width:30px; height:30px;" title="Qo'shish">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                    <button class="qty-btn sub-stock-btn" data-id="${p.id}" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: #ef4444; width:30px; height:30px;" title="Kamaytirish">
                        <i class="fa-solid fa-minus"></i>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    tableBody.querySelectorAll(".add-stock-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = parseInt(btn.dataset.id);
            const amount = parseInt(prompt("Qancha miqdor qo'shmoqchisiz?", "10")) || 0;
            if (amount > 0) {
                inventory[id] = (inventory[id] || 0) + amount;
                localStorage.setItem("eco_sports_inventory", JSON.stringify(inventory));
                renderOmborTable();
            }
        });
    });
    
    tableBody.querySelectorAll(".sub-stock-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = parseInt(btn.dataset.id);
            const amount = parseInt(prompt("Qancha miqdor ayirmoqchisiz?", "5")) || 0;
            if (amount > 0) {
                inventory[id] = Math.max(0, (inventory[id] || 0) - amount);
                localStorage.setItem("eco_sports_inventory", JSON.stringify(inventory));
                renderOmborTable();
            }
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
    const cogs = Math.round(revenue * 0.6); // 60% standard COGS
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const netProfit = revenue - cogs - totalExpenses;
    
    buxRevenue.textContent = formatPrice(revenue);
    buxCogs.textContent = formatPrice(cogs);
    buxExpenses.textContent = formatPrice(totalExpenses);
    buxProfit.textContent = formatPrice(netProfit);
    
    expenseTableBody.innerHTML = "";
    
    if (expenses.length === 0) {
        expenseEmptyState.style.display = "block";
        return;
    }
    
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
                expenses.splice(idx, 1);
                localStorage.setItem("eco_sports_expenses", JSON.stringify(expenses));
                renderBuxgalteriya();
            }
        });
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
    checkoutBtn.addEventListener("click", openPinModal);

    // Hook Telegram native button clicks
    if (tg) {
        tg.MainButton.onClick(() => {
            openPinModal();
        });
    }

    // PIN modal closing & submissions
    closePinModal.addEventListener("click", closePinModalOverlay);
    pinModal.addEventListener("click", (e) => {
        if (e.target === pinModal) closePinModalOverlay();
    });
    pinForm.addEventListener("submit", handlePinSubmit);

    // POS Success Receipt Modal actions
    const closeSuccessReceipt = () => successReceiptModal.classList.remove("open");
    closeReceiptModal.addEventListener("click", closeSuccessReceipt);
    receiptModalCloseBtn.addEventListener("click", closeSuccessReceipt);
    successReceiptModal.addEventListener("click", (e) => {
        if (e.target === successReceiptModal) closeSuccessReceipt();
    });

    // Print Receipt mock alert
    receiptModalPrintBtn.addEventListener("click", () => {
        alert("Chek printerga yuborilmoqda... (Mock Printer Active)");
    });

    // POS supplier filters
    document.querySelectorAll("[data-pos-supplier]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("[data-pos-supplier]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.activeSupplier = btn.dataset.posSupplier;
            renderTiles();
        });
    });

    // Clear CRM logs database
    clearLogsBtn.addEventListener("click", () => {
        if (confirm("Barcha savdo tarixlarini o'chirmoqchimisiz? Buni qaytarib bo'lmaydi.")) {
            state.salesHistory = [];
            localStorage.setItem("eco_sports_sales_history", JSON.stringify([]));
            updateAnalytics();
            renderHistoryTable();
        }
    });

    // 13. DEPARTMENT TABS ROUTING SYSTEM
    const deptTabs = document.querySelectorAll(".dept-tab-btn");
    const sections = document.querySelectorAll(".dept-section");
    
    deptTabs.forEach(tab => {
        tab.addEventListener("click", () => {
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

    // Ombor Inventory listeners
    const omborSearch = document.getElementById("ombor-search-input");
    if (omborSearch) {
        omborSearch.addEventListener("input", renderOmborTable);
    }
    
    const omborSupplierBtns = document.querySelectorAll("[data-ombor-supplier]");
    omborSupplierBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            omborSupplierBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderOmborTable();
        });
    });

    // Buxgalteriya Expense triggers
    const expenseModal = document.getElementById("bux-expense-modal");
    const addExpenseTrigger = document.getElementById("add-expense-trigger");
    const closeExpenseModal = document.getElementById("close-expense-modal");
    const expenseForm = document.getElementById("bux-expense-form");
    const expenseAmountInput = document.getElementById("expense-amount");
    const expenseDescInput = document.getElementById("expense-desc");
    const expenseCatInput = document.getElementById("expense-cat");
    const clearExpensesBtn = document.getElementById("bux-clear-expenses");
    
    if (addExpenseTrigger && expenseModal) {
        addExpenseTrigger.addEventListener("click", () => {
            expenseAmountInput.value = "";
            expenseDescInput.value = "";
            expenseCatInput.selectedIndex = 0;
            expenseModal.classList.add("open");
        });
    }
    
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
            
            renderBuxgalteriya();
            expenseModal.classList.remove("open");
        });
    }
    
    if (clearExpensesBtn) {
        clearExpensesBtn.addEventListener("click", () => {
            if (confirm("Barcha xarajatlar tarixini o'chirmoqchimisiz? Buni qaytarib bo'lmaydi.")) {
                expenses = [];
                localStorage.setItem("eco_sports_expenses", JSON.stringify([]));
                renderBuxgalteriya();
            }
        });
    }

    // Sozlamalar settings listener
    const settingsForm = document.getElementById("settings-form");
    const settingsPinInput = document.getElementById("settings-pin");
    const settingsTokenInput = document.getElementById("settings-bot-token");
    const settingsChatInput = document.getElementById("settings-chat-id");
    
    if (settingsForm) {
        settingsForm.addEventListener("submit", (e) => {
            e.preventDefault();
            
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
            
            if (tg && tg.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
            
            alert("Tizim sozlamalari muvaffaqiyatli saqlandi!");
        });
    }
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

    setupEventListeners();

    if (isAuthenticated) {
        unlockDashboard();
    }
});
