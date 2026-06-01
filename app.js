// ========================================================================
//   ECO SPORTS MENSWEAR - APP LOGIC & STATE MANAGEMENT
// ========================================================================

// 1. PRODUCT DATABASE
const PRODUCTS = [
    {
        id: 1,
        name: "Eco-Luxe Breathable T-Shirt",
        price: 260000,
        category: "tshirt",
        image: "assets/tshirt.png",
        description: "Organik paxta va qayta ishlangan poliesterdan tayyorlangan premium darajadagi sport futbolkasi. Terlatmaydi, tez quriydi va juda yumshoq. Kun davomida qulaylik va yuqori harakat erkinligini kafolatlaydi.",
        material: "75% Organik Paxta, 25% Recycled Polyester",
        fit: "Slim Athletic Fit",
        sizes: ["S", "M", "L", "XL", "XXL"]
    },
    {
        id: 2,
        name: "Vortex Dry-Fit Tee",
        price: 240000,
        category: "tshirt",
        image: "assets/tshirt.png",
        description: "Intensiv mashg'ulotlar uchun maxsus havo o'tkazuvchi mikro-teshikli eko-futbolka. Namlikni tez tortish xususiyatiga ega. Anti-bakterial matodan tayyorlangan.",
        material: "90% Recycled Nylon, 10% Spandex",
        fit: "Semi-Fitted",
        sizes: ["M", "L", "XL", "XXL"]
    },
    {
        id: 3,
        name: "Pro-Flow Sustainable Shorts",
        price: 220000,
        category: "shorts",
        image: "assets/shorts.png",
        description: "Ultra yengil va suv qaytaruvchi eko-mesh materialdan tayyorlangan qulay sport shortigi. Yon tomonlarida yashirin fermuarli cho'ntaklar va tunda ko'rinadigan reflektor tasmalari mavjud.",
        material: "88% Recycled Polyester, 12% Elastane",
        fit: "Standard Active Fit",
        sizes: ["M", "L", "XL", "XXL"]
    },
    {
        id: 4,
        name: "Apex Core Training Shorts",
        price: 190000,
        category: "shorts",
        image: "assets/shorts.png",
        description: "Erkin va elastik belbog'li klassik sport shortigi. Har qanday yo'nalishdagi mashg'ulotlar hamda yugurish uchun maxsus tayyorlangan mato.",
        material: "100% Recycled Polyester",
        fit: "Relaxed Fit",
        sizes: ["S", "M", "L", "XL"]
    },
    {
        id: 5,
        name: "Hybrid Eco-Performance Tracksuit",
        price: 720000,
        category: "tracksuit",
        image: "assets/tracksuit.png",
        description: "Shamolga chidamli premium to'liq fermuarli nimcha (kofta) va mos keluvchi toraytirilgan sport shimidan iborat to'plam. Ekologik toza va yuqori darajada issiqlikni saqlovchi mato kombinatsiyasi.",
        material: "90% Recycled Polyester, 10% Lycra",
        fit: "Tailored Athletic Fit",
        sizes: ["S", "M", "L", "XL"]
    },
    {
        id: 6,
        name: "Thermal Storm Active Set",
        price: 680000,
        category: "tracksuit",
        image: "assets/tracksuit.png",
        description: "Salqin ob-havoda mashq qilish va sayr qilish uchun mo'ljallangan yengil va qalin bo'lmagan, ammo issiqlikni saqlovchi premium sportivka to'plami. Yuqori elastiklikka ega.",
        material: "95% Recycled Nylon, 5% Spandex",
        fit: "Athletic Fit",
        sizes: ["M", "L", "XL", "XXL"]
    },
    {
        id: 7,
        name: "Active-Flex Premium Joggers",
        price: 340000,
        category: "joggers",
        image: "assets/joggers.png",
        description: "Ekologik toza bambuk tolasidan tikilgan hashamatli triko (jogger shim). Keng yumshoq belbog'i, chuqur cho'ntaklari va zamonaviy ko'rinishga ega bo'lgan elastik manjetlari mavjud.",
        material: "95% Organic Bamboo Fiber, 5% Spandex",
        fit: "Tapered Active Fit",
        sizes: ["M", "L", "XL", "XXL", "3XL"]
    },
    {
        id: 8,
        name: "Chill-Out Comfort Sweatpants",
        price: 310000,
        category: "joggers",
        image: "assets/joggers.png",
        description: "Uyda dam olish yoki ko'chada sayr qilish uchun ideal bo'lgan erkin va yumshoq triko. Juda qulay, chidamli va matosi uzoq vaqt o'z holatini saqlab qoladi.",
        material: "80% Organic Cotton, 20% Recycled Polyester",
        fit: "Regular Relaxed Fit",
        sizes: ["M", "L", "XL", "XXL"]
    }
];

// 1.5 TELEGRAM WEBAPP LAYER INITIALIZATION
const tg = window.Telegram?.WebApp;
const BOT_TOKEN = "8592915921:AAE7L1Rf2bPEzywea_DjF6cYsZAQ9IRcsOE";

if (tg) {
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation();
}

// 2. APP STATE
let state = {
    cart: [],
    selectedProduct: null,
    selectedSize: null,
    activeCategory: "all",
    searchQuery: ""
};

// 3. DOM ELEMENTS
const productsGrid = document.getElementById("products-grid");
const filterBtns = document.querySelectorAll(".filter-btn");
const navLinks = document.querySelectorAll(".nav-link");
const searchInput = document.getElementById("search-input");

const cartSidebar = document.getElementById("cart-sidebar");
const cartToggle = document.getElementById("cart-toggle");
const closeCart = document.getElementById("close-cart");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const cartItemsContainer = document.getElementById("cart-items");
const cartBadgeCount = document.getElementById("cart-badge-count");
const cartTotalCount = document.getElementById("cart-total-count");
const cartSubtotal = document.getElementById("cart-subtotal");
const checkoutBtn = document.getElementById("checkout-btn");

const productDetailModal = document.getElementById("product-detail-modal");
const closeDetailModal = document.getElementById("close-detail-modal");
const detailImg = document.getElementById("detail-img");
const detailCategory = document.getElementById("detail-category");
const detailTitle = document.getElementById("detail-title");
const detailPrice = document.getElementById("detail-price");
const detailDesc = document.getElementById("detail-desc");
const detailMaterial = document.getElementById("detail-material");
const detailFit = document.getElementById("detail-fit");
const sizeOptions = document.getElementById("size-options");
const detailAddToCart = document.getElementById("detail-add-to-cart");

const checkoutModal = document.getElementById("checkout-modal");
const closeCheckoutModal = document.getElementById("close-checkout-modal");
const checkoutForm = document.getElementById("checkout-form");
const checkoutSummaryItems = document.getElementById("checkout-summary-items");
const checkoutTotalPrice = document.getElementById("checkout-total-price");

const successModal = document.getElementById("success-modal");
const closeSuccessBtn = document.getElementById("close-success-btn");
const successUserName = document.getElementById("success-user-name");
const successUserPhone = document.getElementById("success-user-phone");
const successOrderId = document.getElementById("success-order-id");

// 4. FORMAT PRICE UTILITY
function formatPrice(number) {
    return number.toLocaleString('uz-UZ') + " UZS";
}

// 5. RENDER PRODUCTS
function renderProducts() {
    let filtered = PRODUCTS.filter(p => {
        const matchesCategory = state.activeCategory === "all" || p.category === state.activeCategory;
        const matchesSearch = p.name.toLowerCase().includes(state.searchQuery.toLowerCase()) || 
                             p.description.toLowerCase().includes(state.searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    productsGrid.innerHTML = "";

    if (filtered.length === 0) {
        productsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-secondary);">
                <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 1rem; color: var(--text-muted);"></i>
                <p>Kechirasiz, mos mahsulotlar topilmadi.</p>
            </div>
        `;
        return;
    }

    filtered.forEach(product => {
        const card = document.createElement("div");
        card.className = "product-card";
        card.innerHTML = `
            <div class="product-img-wrapper">
                <span class="product-tag">${product.category === 'tshirt' ? 'futbolka' : product.category === 'shorts' ? 'shortik' : product.category === 'tracksuit' ? 'sportivka' : 'triko'}</span>
                <img src="${product.image}" alt="${product.name}" class="product-img" loading="lazy">
                <div class="product-details-overlay">
                    <a href="#" class="overlay-link" data-id="${product.id}">
                        <i class="fa-solid fa-eye"></i> Batafsil ko'rish
                    </a>
                </div>
            </div>
            <div class="product-info">
                <h3 class="product-title">${product.name}</h3>
                <div class="product-meta">
                    <span class="product-price">${formatPrice(product.price)}</span>
                    <button class="add-cart-fast" data-id="${product.id}" aria-label="Tez savatchaga qo'shish">
                        <i class="fa-solid fa-cart-plus"></i>
                    </button>
                </div>
            </div>
        `;
        productsGrid.appendChild(card);
    });

    // Add listeners to overlay and fast add buttons
    document.querySelectorAll(".overlay-link").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const id = parseInt(btn.dataset.id);
            openProductDetail(id);
        });
    });

    document.querySelectorAll(".add-cart-fast").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            openProductDetail(id); // Opens detailed modal so user can choose size (crucial for sports sizing!)
        });
    });
}

// 6. CATEGORY FILTER EVENTS
function setupFilters() {
    // Top Filter controls
    filterBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            filterBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.activeCategory = btn.dataset.filter;
            
            // Sync with navbar if exists
            navLinks.forEach(link => {
                if (link.dataset.cat === state.activeCategory) {
                    link.classList.add("active");
                } else {
                    link.classList.remove("active");
                }
            });

            renderProducts();
        });
    });

    // Header Navbar link events
    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove("active"));
            link.classList.add("active");
            state.activeCategory = link.dataset.cat;
            
            // Sync with filter buttons
            filterBtns.forEach(b => {
                if (b.dataset.filter === state.activeCategory) {
                    b.classList.add("active");
                } else {
                    b.classList.remove("active");
                }
            });

            // Smooth scroll to catalog
            document.getElementById("catalog").scrollIntoView({ behavior: 'smooth' });
            renderProducts();
        });
    });

    // Footer links events
    document.querySelectorAll(".footer-cat-link").forEach(link => {
        link.addEventListener("click", (e) => {
            state.activeCategory = link.dataset.cat;
            // Sync UI
            filterBtns.forEach(b => {
                if (b.dataset.filter === state.activeCategory) b.classList.add("active");
                else b.classList.remove("active");
            });
            navLinks.forEach(l => {
                if (l.dataset.cat === state.activeCategory) l.classList.add("active");
                else l.classList.remove("active");
            });
            renderProducts();
        });
    });

    // Search events
    searchInput.addEventListener("input", (e) => {
        state.searchQuery = e.target.value;
        renderProducts();
    });
}

// 7. PRODUCT DETAIL MODAL
function openProductDetail(id) {
    const product = PRODUCTS.find(p => p.id === id);
    if (!product) return;

    state.selectedProduct = product;
    state.selectedSize = product.sizes[0]; // default to first size

    // Populating modal fields
    detailImg.src = product.image;
    detailImg.alt = product.name;
    detailCategory.textContent = product.category === 'tshirt' ? 'PREMIUM FUTBOLKA' : product.category === 'shorts' ? 'PREMIUM SHORTIK' : product.category === 'tracksuit' ? 'PREMIUM SPORTIVKA TO\'PLAMI' : 'PREMIUM SPORTIV JOGGER';
    detailTitle.textContent = product.name;
    detailPrice.textContent = formatPrice(product.price);
    detailDesc.textContent = product.description;
    detailMaterial.textContent = product.material;
    detailFit.textContent = product.fit;

    // Render sizes
    sizeOptions.innerHTML = "";
    product.sizes.forEach(size => {
        const btn = document.createElement("button");
        btn.className = `size-btn ${size === state.selectedSize ? 'active' : ''}`;
        btn.textContent = size;
        btn.addEventListener("click", () => {
            document.querySelectorAll(".size-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.selectedSize = size;
        });
        sizeOptions.appendChild(btn);
    });

    productDetailModal.classList.add("open");
}

function closeProductDetailModal() {
    productDetailModal.classList.remove("open");
    state.selectedProduct = null;
    state.selectedSize = null;
}

// 8. CART OPERATIONS
function updateCartUI() {
    // Total count calculation
    const totalCount = state.cart.reduce((total, item) => total + item.qty, 0);
    cartBadgeCount.textContent = totalCount;
    cartTotalCount.textContent = totalCount;

    // Subtotal calculation
    const subtotal = state.cart.reduce((total, item) => total + (item.product.price * item.qty), 0);
    cartSubtotal.textContent = formatPrice(subtotal);

    // Enable/Disable Checkout Button
    if (state.cart.length > 0) {
        checkoutBtn.removeAttribute("disabled");
    } else {
        checkoutBtn.setAttribute("disabled", "true");
    }

    // Telegram native button control
    if (tg) {
        checkoutBtn.style.display = "none";
        updateTelegramMainButton();
    }

    // Render Cart Items
    cartItemsContainer.innerHTML = "";
    if (state.cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="empty-cart-state">
                <i class="fa-solid fa-basket-shopping"></i>
                <p>Sizning savatchangiz bo'sh</p>
                <button class="btn btn-secondary" id="cart-start-shopping" style="padding: 0.6rem 1.2rem; font-size: 0.85rem; border-radius: 8px;">Katalogga o'tish</button>
            </div>
        `;
        
        document.getElementById("cart-start-shopping").addEventListener("click", () => {
            cartSidebar.classList.remove("open");
            sidebarOverlay.classList.remove("active");
            document.getElementById("catalog").scrollIntoView({ behavior: 'smooth' });
        });
        return;
    }

    state.cart.forEach((item, index) => {
        const itemRow = document.createElement("div");
        itemRow.className = "cart-item";
        itemRow.innerHTML = `
            <img src="${item.product.image}" alt="${item.product.name}" class="cart-item-img">
            <div class="cart-item-info">
                <h4>${item.product.name}</h4>
                <span class="cart-item-size">O'lcham: ${item.size}</span>
                <div class="cart-item-price">${formatPrice(item.product.price)}</div>
                <div class="cart-item-qty">
                    <button class="qty-btn qty-minus" data-index="${index}"><i class="fa-solid fa-minus"></i></button>
                    <span class="qty-num">${item.qty}</span>
                    <button class="qty-btn qty-plus" data-index="${index}"><i class="fa-solid fa-plus"></i></button>
                </div>
            </div>
            <button class="remove-item-btn" data-index="${index}" aria-label="O'chirish">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        cartItemsContainer.appendChild(itemRow);
    });

    // Add Cart control listeners
    document.querySelectorAll(".qty-minus").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.index);
            if (state.cart[idx].qty > 1) {
                state.cart[idx].qty--;
            } else {
                state.cart.splice(idx, 1);
            }
            updateCartUI();
        });
    });

    document.querySelectorAll(".qty-plus").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.index);
            state.cart[idx].qty++;
            updateCartUI();
        });
    });

    document.querySelectorAll(".remove-item-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.index);
            state.cart.splice(idx, 1);
            updateCartUI();
        });
    });
}

function addToCart(product, size) {
    // Find matching item in cart
    const existing = state.cart.find(item => item.product.id === product.id && item.size === size);

    if (existing) {
        existing.qty++;
    } else {
        state.cart.push({
            product: product,
            size: size,
            qty: 1
        });
    }

    updateCartUI();
    
    // Smooth open sidebar to show adding feedback
    cartSidebar.classList.add("open");
    sidebarOverlay.classList.add("active");
}

// 8.5 TELEGRAM NATIVE MAIN BUTTON CONTROLLER
function updateTelegramMainButton() {
    if (!tg) return;

    const totalCount = state.cart.reduce((total, item) => total + item.qty, 0);
    const subtotal = state.cart.reduce((total, item) => total + (item.product.price * item.qty), 0);

    if (totalCount > 0) {
        if (checkoutModal.classList.contains("open")) {
            tg.MainButton.setText(`BUYURTMANI TASDIQLASH (${formatPrice(subtotal)})`);
        } else if (cartSidebar.classList.contains("open")) {
            tg.MainButton.setText(`RASMIYLASHTIRISHGA O'TISH (${formatPrice(subtotal)})`);
        } else {
            tg.MainButton.setText(`SAVATCHANI KO'RISH (${totalCount})`);
        }
        tg.MainButton.setParams({
            color: "#10b981",
            text_color: "#ffffff"
        });
        tg.MainButton.show();
    } else {
        tg.MainButton.hide();
    }
}

// 9. CHECKOUT PROCEDURES
function openCheckout() {
    if (state.cart.length === 0) return;

    cartSidebar.classList.remove("open");
    sidebarOverlay.classList.remove("active");

    // Populate checkout items summary box
    checkoutSummaryItems.innerHTML = "";
    let totalSum = 0;
    
    state.cart.forEach(item => {
        const totalItemPrice = item.product.price * item.qty;
        totalSum += totalItemPrice;
        
        const row = document.createElement("div");
        row.className = "summary-item-row";
        row.innerHTML = `
            <span>${item.product.name} (${item.size}) x${item.qty}</span>
            <strong>${formatPrice(totalItemPrice)}</strong>
        `;
        checkoutSummaryItems.appendChild(row);
    });

    checkoutTotalPrice.textContent = formatPrice(totalSum);

    // Autofill user details from Telegram WebApp
    if (tg && tg.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        const nameInput = document.getElementById("customer-name");
        if (nameInput && !nameInput.value) {
            nameInput.value = `${user.first_name || ""} ${user.last_name || ""}`.trim();
        }
    }

    checkoutModal.classList.add("open");
    
    if (tg) {
        updateTelegramMainButton();
    }
}

async function handleCheckoutSubmit(e) {
    e.preventDefault();

    const name = document.getElementById("customer-name").value;
    const phone = document.getElementById("customer-phone").value;
    const address = document.getElementById("customer-address").value;
    const payment = document.getElementById("payment-method").value;

    const orderId = "ECO-" + Math.floor(10000 + Math.random() * 90000);

    // Formulate a message structured for Telegram Bot API (HTML format)
    let orderMsg = `<b>🟢 YANGI BUYURTMA: #${orderId}</b>\n\n`;
    orderMsg += `👤 <b>Mijoz:</b> ${name}\n`;
    orderMsg += `📞 <b>Telefon:</b> ${phone}\n`;
    orderMsg += `📍 <b>Manzil:</b> ${address}\n`;
    orderMsg += `💳 <b>To'lov:</b> ${payment === 'cash' ? "Qabul qilganda naqd/karta" : "CLICK/Payme (Oldindan to'lov)"}\n\n`;
    orderMsg += `🛍 <b>Mahsulotlar:</b>\n`;
    
    let totalSum = 0;
    state.cart.forEach(item => {
        const itemSum = item.product.price * item.qty;
        totalSum += itemSum;
        orderMsg += `- <code>${item.product.name}</code> (${item.size}) x${item.qty} ➔ <b>${formatPrice(itemSum)}</b>\n`;
    });
    orderMsg += `\n💵 <b>Jami summa:</b> <u>${formatPrice(totalSum)}</u>`;

    console.log("%cTelegram Order Sent! Message Body:", "color: #10b981; font-weight: bold;");
    console.log(orderMsg);

    // Dispatch message to Telegram Bot API
    const targetChatId = tg?.initDataUnsafe?.user?.id || "648833917"; // fallback to user id, or direct chat
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
            console.log("Bot message delivered successfully to chatId: " + targetChatId);
        } catch (err) {
            console.error("Bot API delivery failed:", err);
        }
    }

    // Trigger phone haptic feedback
    if (tg && tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
    }

    // Hide checkout modal
    checkoutModal.classList.remove("open");

    // Populate and show success modal
    successUserName.textContent = name;
    successUserPhone.textContent = phone;
    successOrderId.textContent = `#${orderId}`;
    successModal.classList.add("open");

    // Reset Form and State
    checkoutForm.reset();
    state.cart = [];
    updateCartUI();
}

// 10. SETUP EVENT LISTENERS
function setupEventListeners() {
    // Cart open toggles
    cartToggle.addEventListener("click", () => {
        cartSidebar.classList.add("open");
        sidebarOverlay.classList.add("active");
    });

    closeCart.addEventListener("click", () => {
        cartSidebar.classList.remove("open");
        sidebarOverlay.classList.remove("active");
        if (tg) updateTelegramMainButton();
    });

    sidebarOverlay.addEventListener("click", () => {
        cartSidebar.classList.remove("open");
        sidebarOverlay.classList.remove("active");
        if (tg) updateTelegramMainButton();
    });

    // Detail Modal close
    closeDetailModal.addEventListener("click", closeProductDetailModal);
    productDetailModal.addEventListener("click", (e) => {
        if (e.target === productDetailModal) closeProductDetailModal();
    });

    // Detail Modal Add to Cart
    detailAddToCart.addEventListener("click", () => {
        if (state.selectedProduct && state.selectedSize) {
            addToCart(state.selectedProduct, state.selectedSize);
            closeProductDetailModal();
        }
    });

    // Checkout toggles
    checkoutBtn.addEventListener("click", openCheckout);
    closeCheckoutModal.addEventListener("click", () => {
        checkoutModal.classList.remove("open");
        if (tg) updateTelegramMainButton();
    });
    checkoutModal.addEventListener("click", (e) => {
        if (e.target === checkoutModal) {
            checkoutModal.classList.remove("open");
            if (tg) updateTelegramMainButton();
        }
    });

    // Hook Telegram native button clicks
    if (tg) {
        tg.MainButton.onClick(() => {
            const totalCount = state.cart.reduce((total, item) => total + item.qty, 0);
            if (totalCount === 0) return;

            if (checkoutModal.classList.contains("open")) {
                checkoutForm.requestSubmit();
            } else if (cartSidebar.classList.contains("open")) {
                openCheckout();
            } else {
                cartSidebar.classList.add("open");
                sidebarOverlay.classList.add("active");
                updateTelegramMainButton();
            }
        });
    }

    // Form submission
    checkoutForm.addEventListener("submit", handleCheckoutSubmit);

    // Success Close
    closeSuccessBtn.addEventListener("click", () => successModal.classList.remove("open"));
    successModal.addEventListener("click", (e) => {
        if (e.target === successModal) successModal.classList.remove("open");
    });

    // Premium Micro-effects on headers
    window.addEventListener("scroll", () => {
        const header = document.querySelector(".main-header");
        if (window.scrollY > 50) {
            header.style.padding = "0.2rem 0";
            header.style.background = "rgba(9, 13, 22, 0.95)";
            header.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.5)";
        } else {
            header.style.padding = "0";
            header.style.background = "rgba(9, 13, 22, 0.85)";
            header.style.boxShadow = "none";
        }
    });
}

// 11. INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    renderProducts();
    setupFilters();
    setupEventListeners();
    updateCartUI();
});
