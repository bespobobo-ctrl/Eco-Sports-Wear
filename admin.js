// ========================================================================
//   ECO SPORTS MENSWEAR - POS & CRM CONTROLLER LOGIC
// ========================================================================

// 1. PRODUCT DATASET (Synced with Storefront)
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

// 2. POS & CRM LOCAL STATE
let state = {
    cart: [],
    selectedProduct: null,
    selectedSize: null,
    activeCategory: "all",
    searchQuery: "",
    salesHistory: []
};

// 3. DOM ELEMENTS
const tilesGrid = document.getElementById("pos-tiles-grid");
const searchInput = document.getElementById("pos-search-input");
const filterBtns = document.querySelectorAll("[data-pos-filter]");

const receiptList = document.getElementById("pos-receipt-list");
const receiptSubtotal = document.getElementById("pos-subtotal");
const receiptDiscountValue = document.getElementById("pos-discount-value");
const receiptFinalTotal = document.getElementById("pos-final-total");
const discountInput = document.getElementById("pos-discount");
const channelSelect = document.getElementById("pos-channel");
const checkoutBtn = document.getElementById("pos-checkout-btn");
const receiptIdLabel = document.getElementById("pos-receipt-id");

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

const crmRevenue = document.getElementById("crm-total-revenue");
const crmSalesCount = document.getElementById("crm-total-sales");
const crmAvgInvoice = document.getElementById("crm-avg-invoice");
const crmItemsCount = document.getElementById("crm-total-items");
const crmTableBody = document.getElementById("crm-history-table-body");
const crmEmptyState = document.getElementById("crm-empty-state");
const clearLogsBtn = document.getElementById("crm-clear-logs");

// 4. UTILITIES
function formatPrice(number) {
    return number.toLocaleString('uz-UZ') + " UZS";
}

function generateReceiptId() {
    return "CHK-" + Math.floor(1000 + Math.random() * 9000);
}

// 5. RENDER PRODUCT TILES
function renderTiles() {
    let filtered = PRODUCTS.filter(p => {
        const matchesCategory = state.activeCategory === "all" || p.category === state.activeCategory;
        const matchesSearch = p.name.toLowerCase().includes(state.searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    tilesGrid.innerHTML = "";

    if (filtered.length === 0) {
        tilesGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">
                <p>Mos kiyimlar topilmadi</p>
            </div>
        `;
        return;
    }

    filtered.forEach(product => {
        const card = document.createElement("div");
        card.className = "tile-card";
        card.innerHTML = `
            <img src="${product.image}" class="tile-img" alt="${product.name}">
            <h4>${product.name}</h4>
            <span class="tile-price">${formatPrice(product.price)}</span>
        `;
        card.addEventListener("click", () => openCalcModal(product.id));
        tilesGrid.appendChild(card);
    });
}

// 6. POS CALCULATOR POPUP
function openCalcModal(productId) {
    const product = PRODUCTS.find(p => p.id === productId);
    if (!product) return;

    state.selectedProduct = product;
    state.selectedSize = product.sizes[0]; // default size

    calcTitle.textContent = product.name;
    calcCat.textContent = product.category.toUpperCase();
    calcStdPrice.textContent = product.price.toLocaleString('uz-UZ');
    calcPriceInput.value = product.price;
    calcQtyInput.value = 1;

    // Render sizes
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

// 7. RECEIPT MANAGEMENT
function updateReceiptUI() {
    const subtotal = state.cart.reduce((total, item) => total + (item.soldPrice * item.qty), 0);
    const discount = parseFloat(discountInput.value) || 0;
    const finalTotal = Math.max(0, subtotal - discount);

    receiptSubtotal.textContent = formatPrice(subtotal);
    receiptDiscountValue.textContent = "-" + formatPrice(discount);
    receiptFinalTotal.textContent = formatPrice(finalTotal);

    // Toggle checkout button
    if (state.cart.length > 0) {
        checkoutBtn.removeAttribute("disabled");
    } else {
        checkoutBtn.setAttribute("disabled", "true");
    }

    // Render items
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

    // Sub-listeners inside receipt
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

// 8. CRM LOGS & SALES ARCHIVES
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

    // Show recent first
    [...history].reverse().forEach((tx, idx) => {
        const row = document.createElement("tr");
        const actualIdx = history.length - 1 - idx;
        
        // Formulate items summary
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

    document.querySelectorAll(".delete-log-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.idx);
            state.salesHistory.splice(idx, 1);
            localStorage.setItem("eco_sports_sales_history", JSON.stringify(state.salesHistory));
            renderHistoryTable();
            updateAnalytics();
        });
    });
}

function completeSale() {
    if (state.cart.length === 0) return;

    const subtotal = state.cart.reduce((total, item) => total + (item.soldPrice * item.qty), 0);
    const discount = parseFloat(discountInput.value) || 0;
    const finalTotal = Math.max(0, subtotal - discount);
    const itemCount = state.cart.reduce((sum, item) => sum + item.qty, 0);

    const now = new Date();
    const dateStr = now.toLocaleDateString('uz-UZ') + " " + now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

    // Item logs formulation
    const itemsList = state.cart.map(item => `${item.product.name} (${item.size}) x${item.qty}`);

    const newTx = {
        id: generateReceiptId(),
        timestamp: dateStr,
        channel: channelSelect.value,
        items: itemsList,
        discount: discount,
        totalPaid: finalTotal,
        itemCount: itemCount
    };

    // Save to State and localStorage
    state.salesHistory.push(newTx);
    localStorage.setItem("eco_sports_sales_history", JSON.stringify(state.salesHistory));

    // Reset checkout forms
    state.cart = [];
    discountInput.value = 0;
    updateReceiptUI();
    
    // Update CRM analytics & history logs
    updateAnalytics();
    renderHistoryTable();

    // Regenerate unique receipt ID
    receiptIdLabel.textContent = "#" + generateReceiptId();
}

// 9. EVENT LISTENERS SETUP
function setupEventListeners() {
    // POS category filters
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

    // Form submit: adding custom values to POS cart
    calcForm.addEventListener("submit", (e) => {
        e.preventDefault();
        
        const qty = parseInt(calcQtyInput.value) || 1;
        const soldPrice = parseFloat(calcPriceInput.value) || state.selectedProduct.price;

        // Check if item exists in POS cart
        const existing = state.cart.find(item => item.product.id === state.selectedProduct.id && item.size === state.selectedSize);

        if (existing) {
            existing.qty += qty;
            existing.soldPrice = soldPrice; // overrides with recent custom price
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

    // Commit Transaction
    checkoutBtn.addEventListener("click", completeSale);

    // Clear history logs DB
    clearLogsBtn.addEventListener("click", () => {
        if (confirm("Rostdan ham barcha savdo tarixlarini o'chirmoqchimisiz? Buni qaytarib bo'lmaydi.")) {
            state.salesHistory = [];
            localStorage.setItem("eco_sports_sales_history", JSON.stringify([]));
            updateAnalytics();
            renderHistoryTable();
        }
    });
}

// 10. INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    // Set random receipt ID
    receiptIdLabel.textContent = "#" + generateReceiptId();

    // Load localStorage Sales history
    const savedLogs = localStorage.getItem("eco_sports_sales_history");
    if (savedLogs) {
        state.salesHistory = JSON.parse(savedLogs);
    } else {
        state.salesHistory = [];
    }

    renderTiles();
    setupEventListeners();
    updateReceiptUI();
    updateAnalytics();
    renderHistoryTable();
});
