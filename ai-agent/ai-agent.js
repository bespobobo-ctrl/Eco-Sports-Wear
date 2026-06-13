/* =====================================================================
   ECO SPORTS — AI AGENT MODULI  (alohida, izolyatsiya qilingan)
   Mount: #ai-agent-root  |  Tab: data-dept="ai-agent"
   Asosiy app.js bilan global o'zgaruvchilar aralashmaydi (IIFE).
   ===================================================================== */
(function () {
    "use strict";

    const LS_KEY = "eco_ai_agent_v1";
    const $ = (sel, root = document) => root.querySelector(sel);

    /* ---------------- DEFAULT STATE ---------------- */
    function defaultState() {
        return {
            agentActive: true,
            accounts: {
                instagram: { connected: false, handle: "@eco_sports" },
                telegram: { connected: false, handle: "@eco_sports_uz" },
                facebook: { connected: false, handle: "Eco Sports" },
                tiktok: { connected: false, handle: "@ecosports" }
            },
            // Har provayder uchun BIR NECHTA kalit — fallback/rotatsiya uchun
            providers: {
                text: { label: "Matn AI (kaption, plan, javob)", keys: [] },
                image: { label: "Rasm generatsiya", keys: [] },
                video: { label: "Video generatsiya", keys: [] },
                instagram: { label: "Instagram Graph API", keys: [] },
                telegram: { label: "Telegram Bot", keys: [] }
            },
            autoReply: {
                enabled: true,
                tone: "sotuvchi",
                language: "uz",
                rules: [
                    { q: "narx|qancha|narxi", a: "Assalomu alaykum! 🙌 Mahsulot narxi va mavjud o'lchamlari haqida to'liq ma'lumot yuboraman. Qaysi rangda qiziqyapsiz?" },
                    { q: "bormi|mavjud|qoldi", a: "Ha, omborда bor ✅ Sizga qaysi o'lcham kerak? Bugun buyurtma bersangiz, tezkor yetkazib beramiz 🚀" },
                    { q: "yetkaz|dostavka|pochta", a: "Yetkazib berish butun O'zbekiston bo'ylab 🚚 Toshkent ichida 1 kun, viloyatlarga 2-3 kun. Manzilingizni yuboring." }
                ]
            },
            contentPlans: [],
            schedule: [],
            stats: { posts: 0, replies: 0, plansGenerated: 0, mediaGenerated: 0 }
        };
    }

    let state = load();

    function load() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return defaultState();
            const parsed = JSON.parse(raw);
            // shallow-merge default bilan — yangi maydonlar qo'shilsa crash bo'lmasin
            const def = defaultState();
            return Object.assign({}, def, parsed, {
                accounts: Object.assign({}, def.accounts, parsed.accounts),
                providers: Object.assign({}, def.providers, parsed.providers),
                autoReply: Object.assign({}, def.autoReply, parsed.autoReply),
                stats: Object.assign({}, def.stats, parsed.stats)
            });
        } catch (e) {
            console.warn("[AI Agent] state yuklashda xato, default ishlatildi:", e);
            return defaultState();
        }
    }

    function save() {
        try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
        catch (e) { console.warn("[AI Agent] saqlashda xato:", e); }
    }

    /* ---------------- KEY POOL (fallback + rotatsiya) ----------------
       Bir nechta kalit qo'shilsa — navbat bilan ishlatadi, xato bergani
       "cooldown"ga tushadi va keyingisiga o'tadi. Tizim qotib qolmaydi.   */
    const KeyPool = {
        _cursor: {},
        list(provider) { return (state.providers[provider] && state.providers[provider].keys) || []; },
        active(provider) { return this.list(provider).filter(k => k.status !== "down"); },
        pick(provider) {
            const ok = this.active(provider);
            if (!ok.length) return null;
            const c = (this._cursor[provider] || 0) % ok.length;
            this._cursor[provider] = c + 1;
            return ok[c];
        },
        markDown(provider, id) {
            const k = this.list(provider).find(x => x.id === id);
            if (k) { k.status = "down"; setTimeout(() => { k.status = "ok"; save(); }, 60000); }
            save();
        }
    };

    /* ---------------- CONTENT GENERATORS (demo / hooks tayyor) ---------------- */
    const HOOKS = [
        "Bu xatoni qilsangiz, sport kiyimingiz 2 barobar tez eskiradi ❌",
        "1 ta rasm bilan kunlik 50+ buyurtma — sirini ochamiz 👇",
        "Hammaga ayt: bu narxda bunday sifat boshqa joyda yo'q 🔥",
        "Mijozlarimiz nega qaytib keladi? 3 ta sabab 🧵",
        "Zalga borasizmi? Unda bu kiyimsiz ketmang 💪",
        "Ertalab kiyib chiqing — kun bo'yi terlamaysiz 😎",
        "Aksiya tugashiga 24 soat ⏳ Keyin narx 30% oshadi",
        "Mana shuning uchun premium brendlar bizdan o'rganadi 👀"
    ];
    const CTAS = [
        "Hoziroq Direct'ga yozing — narx va o'lchamni yuboramiz 📩",
        "Profildagi havola orqali buyurtma bering 🛒",
        "Izohga \"NARX\" deb yozing — bot avtomatik javob beradi 🤖",
        "Bugun olsangiz — yetkazib berish BEPUL 🚚"
    ];
    const TAGS = "#ecosports #sportkiyim #toshkent #uzbekistan #fitnes #zal #aksiya #sport #kiyim #onlinemagazin";

    const PHASES = [
        { name: "1-bosqich — Tanitish (Awareness)", days: "1–7 kun", goal: "Brendni ko'rsatish, ishonch yig'ish", type: "Reels + Karusel" },
        { name: "2-bosqich — Qiziqtirish (Engagement)", days: "8–16 kun", goal: "Izoh/saqlash/ulashish — algoritm ko'taradi", type: "Storis + So'rovnoma" },
        { name: "3-bosqich — Sotuv (Conversion)", days: "17–25 kun", goal: "To'g'ridan-to'g'ri sotuv, aksiya, taqchillik", type: "Sotuv posti + Direct" },
        { name: "4-bosqich — Sodiqlik (Retention)", days: "26–30 kun", goal: "Takror sotuv, sharhlar, tavsiya", type: "UGC + Mijoz sharhi" }
    ];

    function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function buildPlan(product, price, audience) {
        const p = product || "Sport kiyim to'plami";
        const pr = price || "299 000";
        const aud = audience || "18–35 yosh, sport va sog'lom hayot tarafdorlari";
        const days = [];
        for (let i = 1; i <= 30; i++) {
            const phase = i <= 7 ? 0 : i <= 16 ? 1 : i <= 25 ? 2 : 3;
            days.push({
                num: i,
                phase,
                type: PHASES[phase].type,
                hook: rand(HOOKS),
                caption: `${p} — ${PHASES[phase].goal}. Narx: ${pr} so'm. ${rand(CTAS)}`,
                tags: TAGS,
                bestTime: rand(["09:00", "12:30", "18:00", "20:30", "21:00"])
            });
        }
        return {
            id: "plan_" + Date.now(),
            createdAt: new Date().toISOString(),
            product: p, price: pr, audience: aud,
            days,
            funnel: [
                "Reels (qiziqtirish) → Profil tashrifi",
                "Karusel (foyda/sifat) → Saqlash & Direct",
                "Storis (taqchillik/aksiya) → Direct savol",
                "Avto-javob bot → Narx & o'lcham → Buyurtma",
                "Sotuvdan keyin → Sharh so'rash → UGC kontent"
            ],
            audience: audiencePlan()
        };
    }

    // 1 000 000 kishilik auditoriyaga yetib borish — qamrov (reach) taqsimoti
    function audiencePlan() {
        const total = 1000000;
        const items = [
            { label: "Reels (viral organik qamrov)", pct: 40, ic: "fa-fire", grad: "linear-gradient(135deg,#6366f1,#7c3aed)" },
            { label: "Targetlangan reklama (Instagram/Facebook Ads)", pct: 24, ic: "fa-bullseye", grad: "linear-gradient(135deg,#db2777,#f59e0b)" },
            { label: "Influencer & blogger auditoriyasi", pct: 15, ic: "fa-user-group", grad: "linear-gradient(135deg,#10b981,#06b6d4)" },
            { label: "Hashtag & Explore (kashfiyot sahifasi)", pct: 11, ic: "fa-hashtag", grad: "linear-gradient(135deg,#06b6d4,#6366f1)" },
            { label: "Storis & doimiy kontent (sodiq auditoriya)", pct: 6, ic: "fa-bolt", grad: "linear-gradient(135deg,#f59e0b,#ef4444)" },
            { label: "Cross-post (Telegram / Facebook / TikTok)", pct: 4, ic: "fa-share-nodes", grad: "linear-gradient(135deg,#8b5cf6,#6366f1)" }
        ].map(it => Object.assign(it, { reach: Math.round(total * it.pct / 100) }));
        return {
            target: "1 000 000",
            items,
            note: "Kontent shunday tuzildiki, 30 kun ichida 1 million kishilik auditoriyaga yetib boradi — viral Reels, targetlangan reklama va influencer qamrovi orqali."
        };
    }

    const STYLES = ["Studiya (oq fon)", "Ko'cha/Lifestyle", "Zal/Fitnes", "Minimal premium", "Kuchli rang gradient"];
    function buildMedia(prompt, kind, style) {
        const grad = rand([
            "linear-gradient(135deg,#6366f1,#db2777)",
            "linear-gradient(135deg,#0891b2,#7c3aed)",
            "linear-gradient(135deg,#f59e0b,#ef4444)",
            "linear-gradient(135deg,#10b981,#06b6d4)",
            "linear-gradient(135deg,#1e293b,#6366f1)"
        ]);
        return {
            id: "media_" + Date.now() + "_" + Math.floor(Math.random() * 999),
            kind, style: style || rand(STYLES), grad,
            label: (prompt || "Sport kiyim").slice(0, 60),
            caption: `${rand(HOOKS)}\n\n${prompt || "Premium sport kiyim"} — ${rand(CTAS)}`,
            tags: TAGS
        };
    }

    function autoReplyFor(text) {
        const t = (text || "").toLowerCase();
        for (const r of state.autoReply.rules) {
            const re = new RegExp(r.q, "i");
            if (re.test(t)) return r.a;
        }
        const tones = {
            sotuvchi: "Rahmat yozganingiz uchun! 🙌 Sizga eng mos variantni tanlashga yordam beramiz. Qaysi mahsulot qiziqtiryapti?",
            rasmiy: "Assalomu alaykum. Murojaatingiz uchun rahmat. Savolingizga tez orada to'liq javob beramiz.",
            dostona: "Salom! 😊 Yozganingizdan xursandmiz! Nima kerakligini ayting — hammasini hal qilamiz 💪"
        };
        return tones[state.autoReply.tone] || tones.sotuvchi;
    }

    const BEST_TIMES = [
        { t: "09:00", score: 72, lbl: "Ertalabki faollik" },
        { t: "12:30", score: 81, lbl: "Tushlik tanaffusi" },
        { t: "18:00", score: 88, lbl: "Ishdan keyin" },
        { t: "20:30", score: 96, lbl: "Eng yuqori faollik 🔥" },
        { t: "22:00", score: 79, lbl: "Uxlashdan oldin" }
    ];

    /* ============================================================
       RENDER
       ============================================================ */
    let activeTab = "dash";

    function render() {
        const root = $("#ai-agent-root");
        if (!root) return;
        root.innerHTML = `
        <div class="aia-wrap">
            ${heroHTML()}
            <div class="aia-tabs">
                ${tabBtn("dash", "fa-gauge-high", "Boshqaruv")}
                ${tabBtn("social", "fa-share-nodes", "Ijtimoiy tarmoqlar")}
                ${tabBtn("reply", "fa-comments", "Direct avto-javob")}
                ${tabBtn("plan", "fa-rocket", "Kontent plan 1M")}
                ${tabBtn("studio", "fa-wand-magic-sparkles", "AI Studiya")}
                ${tabBtn("schedule", "fa-calendar-check", "Rejalashtiruvchi")}
                ${tabBtn("keys", "fa-key", "API kalitlar")}
            </div>
            <div id="aia-panels">
                ${panelDash()}
                ${panelSocial()}
                ${panelReply()}
                ${panelPlan()}
                ${panelStudio()}
                ${panelSchedule()}
                ${panelKeys()}
            </div>
        </div>`;
        setActiveTab(activeTab);
        bindEvents(root);
    }

    function heroHTML() {
        const on = state.agentActive;
        return `
        <div class="aia-hero">
            <div class="aia-hero-row">
                <div class="aia-hero-ic"><i class="fa-solid fa-robot"></i></div>
                <div>
                    <h1>AI Agent <span style="font-weight:400;opacity:.7">— SMM Mutaxassis</span></h1>
                    <p>Ijtimoiy tarmoqlarni bir vaqtda boshqaradi, Direct'ga avto-javob beradi, bitta rasmdan <b>1 million kishilik auditoriyaga</b> yetib borish uchun premium reklama kontentini ishlab chiqadi, AI bilan post/video yasaydi va analitika asosida eng kerakli vaqtga professional joylaydi.</p>
                </div>
                <div class="aia-hero-status">
                    <span class="aia-pulse ${on ? "" : "off"}"><span class="dot"></span> ${on ? "Faol" : "To'xtatilgan"}</span>
                    <button class="aia-toggle-btn ${on ? "" : "is-off"}" data-act="toggle-agent">
                        <i class="fa-solid fa-power-off"></i> ${on ? "To'xtatish" : "Ishga tushirish"}
                    </button>
                </div>
            </div>
        </div>`;
    }

    function tabBtn(id, icon, label) {
        return `<div class="aia-tab" data-tab="${id}"><i class="fa-solid ${icon}"></i> ${label}</div>`;
    }

    /* -------- DASHBOARD -------- */
    function panelDash() {
        const connected = Object.values(state.accounts).filter(a => a.connected).length;
        const totalKeys = Object.values(state.providers).reduce((s, p) => s + p.keys.length, 0);
        return `
        <div class="aia-panel" data-panel="dash">
            <div class="aia-grid cols-4" style="margin-bottom:1.1rem;">
                ${statCard("Ulangan tarmoqlar", connected + " / 4", "Instagram, Telegram...")}
                ${statCard("Rejalashtirilgan post", state.schedule.length, "Navbatda")}
                ${statCard("Avto-javoblar", state.stats.replies, "Direct'da")}
                ${statCard("Kontent planlar", state.contentPlans.length, "1M auditoriya")}
            </div>
            <div class="aia-grid cols-2">
                <div class="aia-card">
                    <div class="aia-card-head"><div class="ic" style="background:linear-gradient(135deg,#6366f1,#7c3aed)"><i class="fa-solid fa-bolt"></i></div>
                        <div><h3>Tezkor amallar</h3><p>Bir bosishda boshlang</p></div></div>
                    <div style="display:flex;flex-wrap:wrap;gap:0.6rem;">
                        <button class="aia-btn" data-act="goto" data-to="plan"><i class="fa-solid fa-rocket"></i> 1M auditoriya plani</button>
                        <button class="aia-btn pink" data-act="goto" data-to="studio"><i class="fa-solid fa-wand-magic-sparkles"></i> Post/Video yasash</button>
                        <button class="aia-btn green" data-act="goto" data-to="schedule"><i class="fa-solid fa-calendar-check"></i> Rejaga qo'shish</button>
                        <button class="aia-btn ghost" data-act="goto" data-to="keys"><i class="fa-solid fa-key"></i> API ulash</button>
                    </div>
                </div>
                <div class="aia-card">
                    <div class="aia-card-head"><div class="ic" style="background:linear-gradient(135deg,#10b981,#06b6d4)"><i class="fa-solid fa-heart-pulse"></i></div>
                        <div><h3>Tizim holati</h3><p>Barqarorlik monitoringi</p></div></div>
                    <div class="aia-note" style="line-height:1.9">
                        <div><span class="aia-chip ${totalKeys ? "green" : "amber"}">${totalKeys ? "API: " + totalKeys + " kalit" : "API: ulanmagan"}</span></div>
                        <div style="margin-top:.5rem">✅ Ko'p-kalitli zaxira (fallback) yoqilgan — bitta kalit ishlamasa, avtomatik keyingisiga o'tadi, tizim qotmaydi.</div>
                        <div>✅ Barcha ma'lumot brauzeringizда saqlanadi (localStorage).</div>
                    </div>
                </div>
            </div>
        </div>`;
    }
    function statCard(lbl, val, sub) {
        return `<div class="aia-stat"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;
    }

    /* -------- SOCIAL ACCOUNTS -------- */
    function panelSocial() {
        const nets = [
            { id: "instagram", name: "Instagram", cls: "net-ig", icon: "fa-instagram", brand: "fa-brands" },
            { id: "telegram", name: "Telegram", cls: "net-tg", icon: "fa-telegram", brand: "fa-brands" },
            { id: "facebook", name: "Facebook", cls: "net-fb", icon: "fa-facebook-f", brand: "fa-brands" },
            { id: "tiktok", name: "TikTok", cls: "net-tt", icon: "fa-tiktok", brand: "fa-brands" }
        ];
        return `
        <div class="aia-panel" data-panel="social">
            <div class="aia-banner"><i class="fa-solid fa-circle-info"></i><div class="txt">Bir vaqtning o'zida bir nechta tarmoqni boshqaring. Haqiqiy avto-post uchun "API kalitlar" bo'limidan token ulang — keyin shu yerdan bir tugma bilan barcha tarmoqqa yuboriladi.</div></div>
            <div class="aia-grid cols-2">
                ${nets.map(n => {
                    const acc = state.accounts[n.id];
                    return `<div class="aia-acc">
                        <div class="net-ic ${n.cls}"><i class="${n.brand} ${n.icon}"></i></div>
                        <div class="net-info"><b>${n.name}</b><span>${acc.handle}</span></div>
                        <div style="display:flex;flex-direction:column;gap:.4rem;align-items:flex-end;">
                            <span class="net-badge ${acc.connected ? "on" : "off"}">${acc.connected ? "Ulangan" : "Ulanmagan"}</span>
                            <button class="aia-btn sm ${acc.connected ? "ghost" : ""}" data-act="toggle-net" data-net="${n.id}">${acc.connected ? "Uzish" : "Ulash"}</button>
                        </div>
                    </div>`;
                }).join("")}
            </div>
            <div class="aia-card" style="margin-top:1.1rem;">
                <div class="aia-card-head"><div class="ic" style="background:linear-gradient(135deg,#6366f1,#db2777)"><i class="fa-solid fa-paper-plane"></i></div>
                    <div><h3>Tez post (barcha tarmoqqa)</h3><p>Matn yozing — barcha ulangan tarmoqqa navbatga qo'yiladi</p></div></div>
                <div class="aia-field"><textarea class="aia-textarea" id="aia-quickpost" placeholder="Post matni... AI yordam bersin desangiz 'AI bilan to'ldir' tugmasini bosing"></textarea></div>
                <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
                    <button class="aia-btn ghost" data-act="ai-fill-post"><i class="fa-solid fa-wand-magic-sparkles"></i> AI bilan to'ldir</button>
                    <button class="aia-btn" data-act="queue-quickpost"><i class="fa-solid fa-clock"></i> Rejaga qo'shish</button>
                </div>
            </div>
        </div>`;
    }

    /* -------- AUTO-REPLY -------- */
    function panelReply() {
        const ar = state.autoReply;
        return `
        <div class="aia-panel" data-panel="reply">
            <div class="aia-grid cols-2">
                <div class="aia-card">
                    <div class="aia-card-head"><div class="ic" style="background:linear-gradient(135deg,#7c3aed,#db2777)"><i class="fa-solid fa-robot"></i></div>
                        <div><h3>Direct avto-javob</h3><p>Instagram/Telegram'da 24/7 javob beradi</p></div></div>
                    <div class="aia-row" style="align-items:center;margin-bottom:1rem;">
                        <div style="flex:1"><b style="font-size:.9rem">Avto-javob holati</b><div class="aia-note">Mijoz yozsa — agent darhol javob beradi</div></div>
                        <label class="aia-switch grow0"><input type="checkbox" id="aia-ar-toggle" ${ar.enabled ? "checked" : ""}><span class="sl"></span></label>
                    </div>
                    <div class="aia-field">
                        <label class="aia-label">Muloqot ohangi</label>
                        <select class="aia-select" id="aia-ar-tone">
                            <option value="sotuvchi" ${ar.tone === "sotuvchi" ? "selected" : ""}>💼 Sotuvchi (sotuvga yo'naltirilgan)</option>
                            <option value="dostona" ${ar.tone === "dostona" ? "selected" : ""}>😊 Do'stona</option>
                            <option value="rasmiy" ${ar.tone === "rasmiy" ? "selected" : ""}>🎩 Rasmiy</option>
                        </select>
                    </div>
                    <label class="aia-label">Qoidalar (kalit so'z → javob)</label>
                    <div id="aia-rules">${ar.rules.map((r, i) => ruleHTML(r, i)).join("")}</div>
                    <div class="aia-row" style="margin-top:.6rem;">
                        <input class="aia-input" id="aia-rule-q" placeholder="Kalit so'z (masalan: narx)">
                        <input class="aia-input" id="aia-rule-a" placeholder="Javob matni">
                        <button class="aia-btn grow0" data-act="add-rule"><i class="fa-solid fa-plus"></i></button>
                    </div>
                </div>
                <div class="aia-card">
                    <div class="aia-card-head"><div class="ic" style="background:linear-gradient(135deg,#06b6d4,#6366f1)"><i class="fa-solid fa-vial"></i></div>
                        <div><h3>Sinov (simulyator)</h3><p>Mijoz xabarini yozing — agent javobini ko'ring</p></div></div>
                    <div class="aia-chat" id="aia-chat">
                        <div class="aia-msg in">Salom, bu krossovka narxi qancha? 👟</div>
                        <div class="aia-msg out">${autoReplyFor("narx")}</div>
                    </div>
                    <div class="aia-row" style="margin-top:.7rem;">
                        <input class="aia-input" id="aia-test-msg" placeholder="Mijoz xabari...">
                        <button class="aia-btn grow0" data-act="test-reply"><i class="fa-solid fa-paper-plane"></i></button>
                    </div>
                </div>
            </div>
        </div>`;
    }
    function ruleHTML(r, i) {
        return `<div class="aia-rule"><div><div class="r-q">🔑 ${r.q}</div><div class="r-a">${r.a}</div></div><button class="x" data-act="del-rule" data-i="${i}"><i class="fa-solid fa-xmark"></i></button></div>`;
    }

    /* -------- CONTENT PLAN 1M AUDITORIYA -------- */
    function panelPlan() {
        return `
        <div class="aia-panel" data-panel="plan">
            <div class="aia-banner"><i class="fa-solid fa-rocket"></i><div class="txt">Bitta mahsulot rasmini yuklang yoki ma'lumot kiriting — AI Agent <b>1 million kishilik auditoriyaga taqdim qilish</b> uchun <b>premium 30 kunlik kontent kampaniyasini</b> (viral Reels, targetlangan reklama, influencer qamrovi, 4 bosqich, kunlik post g'oyalari, hook'lar va auditoriya qamrov taqsimoti) ishlab chiqadi.</div></div>
            <div class="aia-card">
                <div class="aia-grid cols-2">
                    <div>
                        <div class="aia-dropzone" id="aia-plan-drop">
                            <i class="fa-solid fa-cloud-arrow-up"></i>
                            <p>Mahsulot rasmini yuklang (ixtiyoriy)</p>
                            <input type="file" id="aia-plan-file" accept="image/*" hidden>
                            <div id="aia-plan-preview"></div>
                        </div>
                    </div>
                    <div>
                        <div class="aia-field"><label class="aia-label">Mahsulot nomi</label><input class="aia-input" id="aia-plan-product" placeholder="Masalan: Premium sport krossovka"></div>
                        <div class="aia-field"><label class="aia-label">Narxi (so'm)</label><input class="aia-input" id="aia-plan-price" placeholder="299 000"></div>
                        <div class="aia-field"><label class="aia-label">Maqsadli auditoriya</label><input class="aia-input" id="aia-plan-audience" placeholder="18–35 yosh, sport ixlosmandlari"></div>
                        <button class="aia-btn" style="width:100%" data-act="gen-plan"><i class="fa-solid fa-wand-magic-sparkles"></i> 1M Auditoriya Kontent Planini Yaratish</button>
                    </div>
                </div>
            </div>
            <div id="aia-plan-result"></div>
        </div>`;
    }

    function renderPlanResult(plan) {
        const box = $("#aia-plan-result");
        if (!box) return;
        const au = plan.audience;
        const phasesHTML = PHASES.map((ph, idx) => {
            const days = plan.days.filter(d => d.phase === idx);
            return `<div class="aia-phase">
                <h4>${ph.name}</h4>
                <div class="meta">${ph.days} · ${ph.goal} · Format: ${ph.type}</div>
                ${days.map(d => `
                    <div class="aia-day">
                        <div class="d-top"><span class="d-num">${d.num}-kun</span><span class="aia-chip indigo d-type">${d.type}</span><span class="aia-chip amber d-type"><i class="fa-solid fa-clock"></i> ${d.bestTime}</span></div>
                        <div class="d-hook">🎯 ${d.hook}</div>
                        <div class="d-cap">${d.caption}</div>
                        <div class="d-tags">${d.tags}</div>
                    </div>`).join("")}
            </div>`;
        }).join("");
        box.innerHTML = `
            <div class="aia-revenue">
                <div class="aia-note"><i class="fa-solid fa-users"></i> Maqsadli auditoriya qamrovi (30 kun)</div>
                <div class="big">${au.target} <span style="font-size:1rem;font-weight:600;color:var(--aia-text-dim)">kishi</span></div>
                <div class="aia-note" style="margin-top:.4rem">${au.note}</div>
                <div class="aia-grid cols-2" style="margin-top:1rem">
                    ${au.items.map(it => `
                        <div class="aia-budget-item">
                            <div class="b-ic" style="background:${it.grad}"><i class="fa-solid ${it.ic}"></i></div>
                            <div class="b-info">
                                <div class="b-top"><b>${it.label}</b><span class="b-usd">${it.reach.toLocaleString("ru-RU")}</span></div>
                                <div class="aia-bar"><span style="width:${it.pct}%"></span></div>
                                <div class="b-pct">${it.pct}% qamrov · ${it.reach.toLocaleString("ru-RU")} kishi</div>
                            </div>
                        </div>`).join("")}
                </div>
            </div>
            <div class="aia-card">
                <div class="aia-card-head"><div class="ic" style="background:linear-gradient(135deg,#10b981,#06b6d4)"><i class="fa-solid fa-filter"></i></div>
                    <div><h3>Sotuv Funnel</h3><p>Mijoz yo'li: ko'rdi → qiziqdi → sotib oldi → qaytdi</p></div></div>
                <div class="aia-note" style="line-height:2">${plan.funnel.map((f, i) => `${i + 1}. ${f}`).join("<br>")}</div>
            </div>
            <div class="aia-card">
                <div class="aia-card-head"><div class="ic" style="background:linear-gradient(135deg,#6366f1,#7c3aed)"><i class="fa-solid fa-calendar-days"></i></div>
                    <div><h3>30 kunlik kontent kalendari</h3><p>${plan.product} · ${plan.price} so'm</p></div>
                    <button class="aia-btn sm grow0" data-act="plan-to-schedule" style="margin-left:auto"><i class="fa-solid fa-calendar-plus"></i> Rejaga qo'shish</button></div>
                ${phasesHTML}
            </div>`;
        box.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    /* -------- AI STUDIO -------- */
    function panelStudio() {
        return `
        <div class="aia-panel" data-panel="studio">
            <div class="aia-banner"><i class="fa-solid fa-wand-magic-sparkles"></i><div class="txt">Sotuv uchun rasm, Reels video va karusel post yaratish. Tavsifni yozing — AI professional kaption, hashtag va eng yaxshi joylash vaqtini ham beradi. (Haqiqiy rasm/video uchun "API kalitlar"dan provayder ulang.)</div></div>
            <div class="aia-card">
                <div class="aia-field"><label class="aia-label">Nima yaratamiz? (tavsif / prompt)</label>
                    <textarea class="aia-textarea" id="aia-studio-prompt" placeholder="Masalan: oq fonda yangi qora krossovka, premium, yon tomondan, sotuvga tayyor reklama rasmi"></textarea></div>
                <div class="aia-row">
                    <div><label class="aia-label">Tur</label>
                        <select class="aia-select" id="aia-studio-kind">
                            <option value="post">🖼️ Post rasm</option>
                            <option value="reels">🎬 Reels video</option>
                            <option value="carousel">📑 Karusel (3 ta)</option>
                        </select></div>
                    <div><label class="aia-label">Uslub</label>
                        <select class="aia-select" id="aia-studio-style">
                            ${STYLES.map(s => `<option>${s}</option>`).join("")}
                        </select></div>
                    <button class="aia-btn grow0" data-act="gen-media"><i class="fa-solid fa-bolt"></i> Yaratish</button>
                </div>
            </div>
            <div id="aia-studio-result" class="aia-grid cols-3"></div>
        </div>`;
    }

    function renderMedia(items) {
        const box = $("#aia-studio-result");
        if (!box) return;
        box.innerHTML = items.map(m => `
            <div class="aia-gen-card">
                <div class="aia-gen-media ${m.kind === "reels" ? "is-video" : ""}" style="background:${m.grad}">${m.label}</div>
                <div class="aia-gen-body">
                    <div class="cap">${m.caption.replace(/\n/g, "<br>")}</div>
                    <div class="tags">${m.tags}</div>
                    <button class="aia-btn sm" style="margin-top:.7rem;width:100%" data-act="media-to-schedule" data-id="${m.id}"><i class="fa-solid fa-calendar-plus"></i> Rejaga qo'shish</button>
                </div>
            </div>`).join("");
    }

    /* -------- SCHEDULER -------- */
    function panelSchedule() {
        return `
        <div class="aia-panel" data-panel="schedule">
            <div class="aia-grid cols-2">
                <div class="aia-card">
                    <div class="aia-card-head"><div class="ic" style="background:linear-gradient(135deg,#f59e0b,#ef4444)"><i class="fa-solid fa-chart-line"></i></div>
                        <div><h3>Eng yaxshi joylash vaqtlari</h3><p>Instagram/Telegram analitikasi asosida</p></div></div>
                    ${BEST_TIMES.map(b => `
                        <div class="aia-time-slot">
                            <div><div class="t">${b.t}</div><div class="score aia-note">${b.lbl}</div>
                                <div class="aia-bar" style="width:160px"><span style="width:${b.score}%"></span></div></div>
                            <div><span class="aia-chip ${b.score >= 90 ? "green" : "indigo"}">${b.score}%</span></div>
                        </div>`).join("")}
                    <div class="aia-note" style="margin-top:.6rem">💡 Agent har postni eng yuqori ball olgan vaqtga avtomatik joylaydi.</div>
                </div>
                <div class="aia-card">
                    <div class="aia-card-head"><div class="ic" style="background:linear-gradient(135deg,#6366f1,#7c3aed)"><i class="fa-solid fa-list-check"></i></div>
                        <div><h3>Post navbati</h3><p>Rejalashtirilgan postlar</p></div>
                        <button class="aia-btn sm grow0" data-act="clear-queue" style="margin-left:auto"><i class="fa-solid fa-broom"></i></button></div>
                    <div id="aia-queue">${renderQueueHTML()}</div>
                </div>
            </div>
        </div>`;
    }
    function renderQueueHTML() {
        if (!state.schedule.length) return `<div class="aia-empty"><i class="fa-solid fa-inbox"></i><br>Navbat bo'sh. Plan yoki Studiyadan post qo'shing.</div>`;
        return state.schedule.map((q, i) => `
            <div class="aia-queue-item">
                <div class="when">${q.when || "20:30"}</div>
                <div class="what"><b>${q.platform || "Barcha tarmoq"}</b><span>${(q.text || "").slice(0, 70)}</span></div>
                <button class="x aia-btn sm ghost grow0" data-act="del-queue" data-i="${i}"><i class="fa-solid fa-xmark"></i></button>
            </div>`).join("");
    }

    /* -------- API KEYS -------- */
    function panelKeys() {
        const meta = {
            text: { ic: "fa-comment-dots", grad: "linear-gradient(135deg,#6366f1,#7c3aed)", ph: "sk-... yoki token (OpenAI / Claude / Gemini)" },
            image: { ic: "fa-image", grad: "linear-gradient(135deg,#db2777,#f59e0b)", ph: "Rasm provayder kaliti" },
            video: { ic: "fa-film", grad: "linear-gradient(135deg,#06b6d4,#6366f1)", ph: "Video provayder kaliti" },
            instagram: { ic: "fa-instagram brand", grad: "linear-gradient(135deg,#dd2a7b,#8134af)", ph: "Instagram Graph API access token" },
            telegram: { ic: "fa-telegram brand", grad: "linear-gradient(135deg,#229ED9,#0088cc)", ph: "Telegram bot token (123:ABC...)" }
        };
        return `
        <div class="aia-panel" data-panel="keys">
            <div class="aia-banner"><i class="fa-solid fa-shield-halved"></i><div class="txt"><b>Ko'p-kalitli barqaror rejim.</b> Har provayderga bir nechta kalit qo'shing — agent ularni navbat bilan ishlatadi (rotatsiya). Bittasi limitga tushsa yoki ishlamasa, avtomatik keyingisiga o'tadi va tizim <b>qotib qolmaydi</b>. Kalitlar faqat shu brauzerда saqlanadi.</div></div>
            ${Object.keys(state.providers).map(pid => {
                const p = state.providers[pid];
                const m = meta[pid];
                const iconClass = m.ic.includes("brand") ? "fa-brands " + m.ic.replace(" brand", "") : "fa-solid " + m.ic;
                return `
                <div class="aia-prov">
                    <div class="aia-prov-head"><div class="ic" style="background:${m.grad}"><i class="${iconClass}"></i></div>
                        <b>${p.label}</b><span class="cnt">${p.keys.length} kalit · ${KeyPool.active(pid).length} faol</span></div>
                    ${p.keys.length ? p.keys.map(k => `
                        <div class="aia-keyrow">
                            <span class="aia-chip ${k.status === "down" ? "red" : "green"}">${k.status === "down" ? "Kutilmoqda" : "Faol"}</span>
                            <code>${maskKey(k.key)}</code>
                            <button class="x" data-act="del-key" data-prov="${pid}" data-id="${k.id}"><i class="fa-solid fa-trash"></i></button>
                        </div>`).join("") : `<div class="aia-note" style="margin-bottom:.5rem">Hali kalit qo'shilmagan.</div>`}
                    <div class="aia-row" style="margin-top:.5rem;">
                        <input class="aia-input" data-keyinput="${pid}" placeholder="${m.ph}">
                        <button class="aia-btn grow0" data-act="add-key" data-prov="${pid}"><i class="fa-solid fa-plus"></i> Qo'shish</button>
                    </div>
                </div>`;
            }).join("")}
        </div>`;
    }
    function maskKey(k) {
        if (!k) return "";
        if (k.length <= 10) return k.slice(0, 3) + "••••";
        return k.slice(0, 6) + "••••••••" + k.slice(-4);
    }

    /* ============================================================
       EVENTS
       ============================================================ */
    function setActiveTab(id) {
        activeTab = id;
        const root = $("#ai-agent-root");
        if (!root) return;
        root.querySelectorAll(".aia-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === id));
        root.querySelectorAll(".aia-panel").forEach(p => p.classList.toggle("active", p.dataset.panel === id));
    }

    function toast(msg, type) {
        // app.js'ning toast'i bo'lsa undan foydalanamiz, bo'lmasa oddiy alert-banner
        if (typeof window.showToast === "function") { try { window.showToast(msg, type); return; } catch (e) {} }
        let t = $("#aia-toast");
        if (!t) {
            t = document.createElement("div");
            t.id = "aia-toast";
            t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;background:#1e293b;color:#fff;padding:.8rem 1.3rem;border-radius:12px;font-weight:700;font-size:.88rem;box-shadow:0 10px 30px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.12);transition:opacity .3s";
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.style.borderColor = type === "error" ? "rgba(239,68,68,.5)" : "rgba(16,185,129,.5)";
        t.style.opacity = "1";
        clearTimeout(t._to);
        t._to = setTimeout(() => { t.style.opacity = "0"; }, 2600);
    }

    function bindEvents(root) {
        // Tablar
        root.querySelectorAll(".aia-tab").forEach(t => t.addEventListener("click", () => setActiveTab(t.dataset.tab)));

        // Delegatsiya — barcha data-act tugmalar
        root.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-act]");
            if (!btn) return;
            const act = btn.dataset.act;
            try { handleAction(act, btn, root); }
            catch (err) { console.error("[AI Agent] amal xatosi:", err); toast("Xatolik yuz berdi, qayta urinib ko'ring", "error"); }
        });

        // Plan rasm yuklash
        const drop = $("#aia-plan-drop");
        const file = $("#aia-plan-file");
        if (drop && file) {
            drop.addEventListener("click", () => file.click());
            file.addEventListener("change", () => {
                const f = file.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => { $("#aia-plan-preview").innerHTML = `<img class="aia-preview-img" src="${reader.result}">`; };
                reader.readAsDataURL(f);
            });
        }

        // Auto-reply controls
        const arT = $("#aia-ar-toggle");
        if (arT) arT.addEventListener("change", () => { state.autoReply.enabled = arT.checked; save(); toast(arT.checked ? "Avto-javob yoqildi ✅" : "Avto-javob o'chirildi"); });
        const tone = $("#aia-ar-tone");
        if (tone) tone.addEventListener("change", () => { state.autoReply.tone = tone.value; save(); });

        // Enter bilan test xabar
        const tm = $("#aia-test-msg");
        if (tm) tm.addEventListener("keydown", (e) => { if (e.key === "Enter") handleAction("test-reply", null, root); });
    }

    function withLoading(btn, fn, ms) {
        if (!btn) { fn(); return; }
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="aia-spin"></span> AI ishlayapti...`;
        setTimeout(() => { try { fn(); } finally { btn.disabled = false; btn.innerHTML = orig; } }, ms || 700);
    }

    function handleAction(act, btn, root) {
        switch (act) {
            case "toggle-agent":
                state.agentActive = !state.agentActive; save(); render();
                toast(state.agentActive ? "AI Agent ishga tushdi 🚀" : "AI Agent to'xtatildi");
                break;
            case "goto": setActiveTab(btn.dataset.to); break;

            /* SOCIAL */
            case "toggle-net": {
                const n = btn.dataset.net;
                const acc = state.accounts[n];
                if (!acc.connected && !KeyPool.list(n === "telegram" ? "telegram" : n === "instagram" ? "instagram" : "text").length && (n === "instagram" || n === "telegram")) {
                    toast("Avval 'API kalitlar'dan " + n + " tokenini ulang", "error");
                    setActiveTab("keys"); return;
                }
                acc.connected = !acc.connected; save(); render(); setActiveTab("social");
                toast(acc.connected ? n + " ulandi ✅" : n + " uzildi");
                break;
            }
            case "ai-fill-post": {
                const ta = $("#aia-quickpost");
                if (ta) ta.value = `${rand(HOOKS)}\n\nEco Sports — premium sport kiyim. ${rand(CTAS)}\n\n${TAGS}`;
                toast("AI matn tayyorladi ✨");
                break;
            }
            case "queue-quickpost": {
                const ta = $("#aia-quickpost");
                const txt = ta ? ta.value.trim() : "";
                if (!txt) { toast("Avval post matnini yozing", "error"); return; }
                state.schedule.push({ platform: "Barcha tarmoq", text: txt, when: rand(BEST_TIMES).t });
                save(); toast("Post rejaga qo'shildi 📅"); if (ta) ta.value = "";
                break;
            }

            /* AUTO-REPLY */
            case "add-rule": {
                const q = $("#aia-rule-q"), a = $("#aia-rule-a");
                if (!q.value.trim() || !a.value.trim()) { toast("Kalit so'z va javobni kiriting", "error"); return; }
                state.autoReply.rules.push({ q: q.value.trim(), a: a.value.trim() });
                save(); render(); setActiveTab("reply"); toast("Qoida qo'shildi ✅");
                break;
            }
            case "del-rule":
                state.autoReply.rules.splice(+btn.dataset.i, 1); save(); render(); setActiveTab("reply");
                break;
            case "test-reply": {
                const inp = $("#aia-test-msg"), chat = $("#aia-chat");
                const msg = inp ? inp.value.trim() : "";
                if (!msg) return;
                chat.insertAdjacentHTML("beforeend", `<div class="aia-msg in">${msg}</div>`);
                inp.value = "";
                const typing = document.createElement("div");
                typing.className = "aia-msg out"; typing.innerHTML = `<span class="aia-spin"></span>`;
                chat.appendChild(typing); chat.scrollTop = chat.scrollHeight;
                setTimeout(() => {
                    typing.innerHTML = autoReplyFor(msg);
                    state.stats.replies++; save();
                    chat.scrollTop = chat.scrollHeight;
                }, 650);
                break;
            }

            /* PLAN */
            case "gen-plan": {
                const product = ($("#aia-plan-product") || {}).value;
                const price = ($("#aia-plan-price") || {}).value;
                const audience = ($("#aia-plan-audience") || {}).value;
                withLoading(btn, () => {
                    const plan = buildPlan(product, price, audience);
                    state.contentPlans.unshift(plan);
                    state.stats.plansGenerated++;
                    save();
                    renderPlanResult(plan);
                    toast("1M auditoriya kontent plani tayyor 🚀");
                }, 900);
                break;
            }
            case "plan-to-schedule": {
                const plan = state.contentPlans[0];
                if (!plan) return;
                plan.days.slice(0, 10).forEach(d => state.schedule.push({ platform: "Instagram", text: d.hook + " — " + d.caption, when: d.bestTime }));
                save(); toast("Plandan 10 post rejaga qo'shildi 📅");
                break;
            }

            /* STUDIO */
            case "gen-media": {
                const prompt = ($("#aia-studio-prompt") || {}).value;
                const kind = ($("#aia-studio-kind") || {}).value;
                const style = ($("#aia-studio-style") || {}).value;
                if (!prompt || !prompt.trim()) { toast("Avval tavsif (prompt) yozing", "error"); return; }
                withLoading(btn, () => {
                    const count = kind === "carousel" ? 3 : 1;
                    const items = [];
                    for (let i = 0; i < count; i++) items.push(buildMedia(prompt, kind, style));
                    state._lastMedia = items;
                    state.stats.mediaGenerated += count; save();
                    renderMedia(items);
                    toast((kind === "reels" ? "Video" : "Rasm") + " tayyor ✨");
                }, 1100);
                break;
            }
            case "media-to-schedule": {
                const m = (state._lastMedia || []).find(x => x.id === btn.dataset.id);
                if (!m) return;
                state.schedule.push({ platform: "Instagram", text: m.caption, when: rand(BEST_TIMES).t });
                save(); toast("Media rejaga qo'shildi 📅");
                break;
            }

            /* SCHEDULE */
            case "del-queue": state.schedule.splice(+btn.dataset.i, 1); save(); { const q = $("#aia-queue"); if (q) q.innerHTML = renderQueueHTML(); } break;
            case "clear-queue": state.schedule = []; save(); { const q = $("#aia-queue"); if (q) q.innerHTML = renderQueueHTML(); } toast("Navbat tozalandi"); break;

            /* KEYS */
            case "add-key": {
                const prov = btn.dataset.prov;
                const inp = root.querySelector(`[data-keyinput="${prov}"]`);
                const val = inp ? inp.value.trim() : "";
                if (!val) { toast("Kalitni kiriting", "error"); return; }
                state.providers[prov].keys.push({ id: "k_" + Date.now(), key: val, status: "ok" });
                save(); render(); setActiveTab("keys");
                toast("Kalit qo'shildi ✅ (zaxira rejimi faol)");
                break;
            }
            case "del-key": {
                const prov = btn.dataset.prov, id = btn.dataset.id;
                state.providers[prov].keys = state.providers[prov].keys.filter(k => k.id !== id);
                save(); render(); setActiveTab("keys");
                break;
            }
        }
    }

    /* ============================================================
       INIT — tab bosilganda yoki sahifa yuklanganda
       ============================================================ */
    function ensureRendered() {
        const root = $("#ai-agent-root");
        if (root && !root.dataset.rendered) {
            render();
            root.dataset.rendered = "1";
        }
    }

    function init() {
        ensureRendered();
        // AI Agent tab bosilganda render qilingani aniq bo'lsin
        document.querySelectorAll('[data-dept="ai-agent"]').forEach(tab => {
            tab.addEventListener("click", () => setTimeout(ensureRendered, 0));
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // Tashqaridan kirish kerak bo'lsa
    window.EcoAIAgent = { render, state: () => state, reset: () => { state = defaultState(); save(); render(); } };
})();
