// ========================================================================
//   TELEGRAM WEBHOOK — Eco Sports SMM Agent (suhbatdosh, mini-app YO'Q)
//   • Shaxsiy chat: tabiiy AI suhbat — analitika, postlar, tavsiyalar,
//     video g'oyalari. O'rganadi (xotira) va egasi bilan muloqot quradi.
//   • Guruh: spam/reklama tozalash, begona botlarni chiqarish, savol-javob.
//
//   Vercel ENV: BOT_TOKEN, SUPABASE_*, ANTHROPIC_API_KEY, TG_WEBHOOK_SECRET
// ========================================================================

const tg = require("./_telegram");
const db = require("./_supabase");
const ai = require("./_ai");

const WEBHOOK_SECRET = process.env.TG_WEBHOOK_SECRET || "";

// --- Guruh qo'riqchisi: spam naqshlari ---
const SPAM_PATTERNS = [
    /https?:\/\//i,
    /t\.me\/(?!eco_sports)/i,
    /\b(kazino|casino|stavka|bet|loto|investitsiya|zarabotok|crypto|bitcoin|forex)\b/i,
    /(@[A-Za-z0-9_]{4,})\s*(kanal|guruh|obuna|reklama)/i
];
const FORBIDDEN_WORDS = ["scam", "spam"];

// --- Guruh savol-javob qoidalari (AI kalit bo'lmasa zaxira) ---
const QA_RULES = [
    { q: /narx|qancha|narxi|pochom/i, a: "💬 Narx va buyurtma bo'yicha administratorimiz bog'lanadi. Mahsulot nomini yozib qoldiring yoki kanalimizni kuzating 📢" },
    { q: /yetkaz|dostavka|pochta/i, a: "🚚 Yetkazib berish butun O'zbekiston bo'ylab. Toshkent — 1 kun, viloyatlar — 2-3 kun." },
    { q: /ish vaqti|qachon ochiq|grafik/i, a: "🕙 Har kuni 09:00–21:00. Savollaringizni shu yerda qoldiring." },
    { q: /salom|assalom|hello/i, a: "Assalomu alaykum! 🙌 Eco Sports jamoasiga xush kelibsiz." }
];

async function logMsg(row) {
    if (!db.isConfigured()) return;
    try { await db.insert("ai_messages", row); } catch (e) { console.warn("log xato:", e.message); }
}

// ===================== KONTEKST (analitika/postlar) =====================
async function gatherContext() {
    const ctx = { accounts: [], upcoming: [], stats: { in: 0, replied: 0, deleted: 0, banned: 0 } };
    if (!db.isConfigured()) return ctx;
    try {
        ctx.accounts = await db.select("ai_social_accounts", "order=id.desc&limit=20");
        ctx.upcoming = await db.select("ai_scheduled_posts", "status=eq.queued&order=publish_at.asc&limit=10");
        const recent = await db.select("ai_messages", "order=id.desc&limit=200");
        for (const m of recent) {
            if (m.action === "deleted") ctx.stats.deleted++;
            else if (m.action === "banned") ctx.stats.banned++;
            else if (m.action === "replied") ctx.stats.replied++;
            if (m.direction === "in") ctx.stats.in++;
        }
    } catch (e) { console.warn("ctx xato:", e.message); }
    return ctx;
}

function contextBlock(ctx) {
    const acc = ctx.accounts.length
        ? ctx.accounts.map(a => `${a.platform}/${a.kind} ${a.handle || a.chat_id || ""}`).join(", ")
        : "hali ulanmagan";
    const up = ctx.upcoming.length
        ? ctx.upcoming.map(p => `• ${(p.publish_at || "vaqt yo'q").slice(0, 16)} — ${(p.text || "").slice(0, 50)}`).join("\n")
        : "navbatda post yo'q";
    return `\n\n[JONLI MA'LUMOT]\nUlangan: ${acc}\nKelgusi postlar (navbat):\n${up}\nFaollik: ${ctx.stats.in} kiruvchi xabar, ${ctx.stats.replied} javob, ${ctx.stats.deleted} spam o'chirilgan, ${ctx.stats.banned} bot chiqarilgan.`;
}

// ===================== XOTIRA (o'rganish) =====================
async function loadMemory(chatId) {
    if (!db.isConfigured()) return [];
    try { return await db.select("ai_agent_memory", `chat_id=eq.${chatId}&order=id.desc&limit=25`); }
    catch (e) { return []; }
}
async function saveMemory(chatId, note) {
    if (!db.isConfigured() || !note) return;
    try { await db.insert("ai_agent_memory", { chat_id: String(chatId), note: note.slice(0, 500) }); }
    catch (e) { console.warn("memory xato:", e.message); }
}

// AI javobidan 🧠 bilan boshlanган xotira qatorlarini ajratib oladi
function extractMemory(text) {
    const lines = (text || "").split("\n");
    const notes = [];
    const kept = [];
    for (const ln of lines) {
        const t = ln.trim();
        if (t.startsWith("🧠")) notes.push(t.replace(/^🧠\s*/, ""));
        else kept.push(ln);
    }
    return { reply: kept.join("\n").trim(), notes };
}

const SMM_PERSONA =
`Sen "Eco Sports" sport kiyim brendining Telegram SMM mutaxassisi-agentisan.
Egasi bilan O'ZBEK tilida samimiy, professional va aniq muloqot qil.
Vazifang:
- Ulangan kanal/guruhlar analitikasi haqida ma'lumot berish
- Joylangan va kelgusi (navbatdagi) postlar haqida xabar berish
- Sotuv postlari va qanday VIDEOLAR qilish bo'yicha aniq, amaliy tavsiyalar berish
- Mahsulotni mijozlarga ko'proq tanitish va ko'rsatish strategiyasini taklif qilish
Uslub: qisqa, foydali, Telegram uchun mos. Markdown ishlatma — oddiy matn + emoji.
Agar egasi eslab qolish kerak bo'lgan ma'lumot bersa (brend, mahsulot, narx, auditoriya, uslub, afzalliklar), javobing eng oxirida ALOHIDA qatorda shunday yoz: 🧠 <eslab qolingan qisqa fakt>. Aks holda 🧠 yozma.`;

async function aiReply(chatId, userText, ctx) {
    if (!ai.isConfigured()) return null;
    const mem = await loadMemory(chatId);
    const history = (await db.select("ai_messages", `chat_id=eq.${chatId}&order=id.desc&limit=12`).catch(() => []))
        .reverse()
        .filter(m => m.text)
        .map(m => ({ role: m.direction === "in" ? "user" : "assistant", content: m.text }));

    let system = SMM_PERSONA + contextBlock(ctx);
    if (mem.length) system += `\n\n[ESLAB QOLINGAN (egasi haqida)]\n` + mem.map(m => "• " + m.note).join("\n");

    // tarix oxiri joriy xabar bilan tugashi kerak
    const messages = history.concat([{ role: "user", content: userText }]);
    // ketma-ket bir xil rol bo'lsa API qabul qiladi, lekin 1-xabar user bo'lsin
    while (messages.length && messages[0].role !== "user") messages.shift();

    const raw = await ai.chat(system, messages, 700);
    if (!raw) return null;
    const { reply, notes } = extractMemory(raw);
    for (const n of notes) await saveMemory(chatId, n);
    return reply || raw;
}

// ===================== SHAXSIY CHAT =====================
function welcomeKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "📊 Analitika", callback_data: "aia:analytics" }, { text: "📅 Kelgusi postlar", callback_data: "aia:upcoming" }],
            [{ text: "💡 Tavsiyalar", callback_data: "aia:tips" }, { text: "🎬 Video g'oyalar", callback_data: "aia:video" }]
        ]
    };
}

async function handlePrivate(msg) {
    const chatId = msg.chat.id;
    const text = (msg.text || "").trim();
    const name = msg.from?.first_name || "rahbar";

    await logMsg({ source: "telegram", chat_id: String(chatId), chat_type: "private", username: msg.from?.username, direction: "in", text });

    if (text === "/start" || text === "/help") {
        await tg.sendMessage(chatId,
            `🤖 Assalomu alaykum, ${name}! Men <b>Eco Sports SMM agentingiz</b>man.\n\nKanal va guruhlaringizni men yurgizaman. Menga oddiy yozing — analitika, postlar, sotuv g'oyalari yoki qanday video qilish haqida maslahat beraman. Vaqt o'tgani sayin sizning uslubingizni o'rganaman 🧠\n\nQuyidan tezkor mavzu tanlang yoki shunchaki savol yozing 👇`,
            { reply_markup: welcomeKeyboard() }
        );
        await logMsg({ source: "telegram", chat_id: String(chatId), chat_type: "private", direction: "out", text: "[start]", action: "replied" });
        return;
    }

    const ctx = await gatherContext();
    let reply = await aiReply(chatId, text, ctx);
    if (!reply) {
        // AI kalit yo'q — qoidaviy zaxira
        reply = "Men sizning SMM agentingizman 🤖 Hozircha AI miya ulanmagan (administrator GEMINI_API_KEY qo'shsa, to'liq suhbat ishlaydi). Tezkor mavzular uchun pastdagi tugmalardan foydalaning 👇";
        await tg.sendMessage(chatId, reply, { reply_markup: welcomeKeyboard() });
    } else {
        await tg.sendMessage(chatId, reply);
    }
    await logMsg({ source: "telegram", chat_id: String(chatId), chat_type: "private", direction: "out", text: reply, action: "replied" });
}

// ===================== CALLBACK (tezkor mavzular) =====================
async function handleCallback(cq) {
    const chatId = cq.message?.chat?.id;
    const data = cq.data || "";
    await tg.answerCallbackQuery(cq.id, "");
    if (!chatId) return;
    const ctx = await gatherContext();

    if (data === "aia:analytics") {
        const s = ctx.stats;
        const txt = `📊 <b>Analitika (so'nggi faollik)</b>\n\n` +
            `📥 Kiruvchi xabarlar: ${s.in}\n💬 Berilgan javoblar: ${s.replied}\n🧹 O'chirilgan spam: ${s.deleted}\n🚫 Chiqarilgan botlar: ${s.banned}\n📢 Ulangan akkauntlar: ${ctx.accounts.length}\n📅 Navbatdagi postlar: ${ctx.upcoming.length}`;
        await tg.sendMessage(chatId, txt);
        return;
    }
    if (data === "aia:upcoming") {
        const txt = ctx.upcoming.length
            ? `📅 <b>Kelgusi postlar</b>\n\n` + ctx.upcoming.map(p => `• <b>${(p.publish_at || "").slice(0, 16)}</b> — ${(p.text || "").slice(0, 70)}`).join("\n")
            : `📅 Hozircha navbatda post yo'q. Yangi post g'oyasini yozsangiz, rejaga qo'shamiz.`;
        await tg.sendMessage(chatId, txt);
        return;
    }
    if (data === "aia:tips" || data === "aia:video") {
        const ask = data === "aia:tips"
            ? "Eco Sports uchun shu hafta sotuvni oshiradigan 3 ta aniq kontent tavsiyasi ber."
            : "Eco Sports sport kiyimini ko'rsatish uchun 3 ta zamonaviy Reels/video g'oyasi ber (qisqa stsenariy bilan).";
        let reply = await aiReply(chatId, ask, ctx);
        if (!reply) {
            reply = data === "aia:tips"
                ? "💡 Tavsiyalar:\n1) Mijoz sharhi (UGC) postlari — ishonch oshiradi\n2) \"Oldin/keyin\" yoki kiyib ko'rish Reels\n3) Cheklangan aksiya storis (taqchillik hissi)"
                : "🎬 Video g'oyalar:\n1) Mahsulotni 360° aylantirib ko'rsatish (kinematik)\n2) Zalda mashqda kiyilgan holatda\n3) \"1 mahsulot — 3 uslub\" tezkor montaj";
        }
        await tg.sendMessage(chatId, reply);
        return;
    }
}

// ===================== GURUH =====================
async function handleGroup(msg) {
    const chatId = msg.chat.id;
    const text = msg.text || msg.caption || "";
    const msgId = msg.message_id;
    const lower = text.toLowerCase();

    const isSpam = SPAM_PATTERNS.some(re => re.test(text)) || FORBIDDEN_WORDS.some(w => lower.includes(w));
    if (isSpam) {
        await tg.deleteMessage(chatId, msgId);
        await logMsg({ source: "telegram", chat_id: String(chatId), chat_type: "group", username: msg.from?.username, direction: "in", text, is_spam: true, action: "deleted" });
        return;
    }
    for (const rule of QA_RULES) {
        if (rule.q.test(text)) {
            await tg.sendMessage(chatId, rule.a, { reply_to_message_id: msgId });
            await logMsg({ source: "telegram", chat_id: String(chatId), chat_type: "group", username: msg.from?.username, direction: "in", text, matched_rule: rule.q.source, action: "replied" });
            return;
        }
    }
}

async function handleNewMembers(msg) {
    const chatId = msg.chat.id;
    for (const m of msg.new_chat_members || []) {
        if (m.is_bot) {
            await tg.banChatMember(chatId, m.id);
            await logMsg({ source: "telegram", chat_id: String(chatId), chat_type: "group", username: m.username, direction: "in", text: "[bot qo'shildi]", is_spam: true, action: "banned" });
        }
    }
}

module.exports = async (req, res) => {
    if (req.method !== "POST") {
        return res.status(200).send("Eco Sports SMM Agent webhook — aktiv.");
    }
    if (WEBHOOK_SECRET) {
        const got = req.headers["x-telegram-bot-api-secret-token"];
        if (got !== WEBHOOK_SECRET) return res.status(401).send("unauthorized");
    }
    try {
        let update = req.body;
        if (typeof update === "string") { try { update = JSON.parse(update); } catch (e) { update = {}; } }

        const msg = update.message || update.edited_message;
        if (update.callback_query) {
            await handleCallback(update.callback_query);
        } else if (msg) {
            if (msg.new_chat_members) await handleNewMembers(msg);
            else if (msg.chat?.type === "private") await handlePrivate(msg);
            else if (msg.chat?.type === "group" || msg.chat?.type === "supergroup") await handleGroup(msg);
        }
    } catch (e) {
        console.error("[webhook] xato:", e);
    }
    return res.status(200).send("ok");
};
