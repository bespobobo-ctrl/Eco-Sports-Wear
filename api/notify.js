// ========================================================================
//   TELEGRAM XABAR YUBORISH — Vercel serverless (token YASHIRIN env'da)
//   Frontend bu yerga POST qiladi; token hech qachon brauzerga chiqmaydi.
//
//   Vercel ENV:
//     BOT_TOKEN        = (BotFather'dan, YANGI token — eskisi ochilgan, bekor qiling)
//     DEFAULT_CHAT_ID  = 648833917   (ixtiyoriy; chatId yuborilmasa shu ishlatiladi)
// ========================================================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const DEFAULT_CHAT_ID = process.env.DEFAULT_CHAT_ID || "";

module.exports = async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Faqat POST" });
    if (!BOT_TOKEN) return res.status(500).json({ error: "Server sozlanmagan: BOT_TOKEN env yo'q" });

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const text = body && body.text;
    const chatId = (body && body.chatId) || DEFAULT_CHAT_ID;
    if (!text || !chatId) return res.status(400).json({ error: "text va chatId kerak" });

    try {
        const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML" })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || (data && data.ok === false)) {
            return res.status(502).json({ error: "Telegram rad etdi", detail: data });
        }
        return res.status(200).json({ ok: true });
    } catch (e) {
        return res.status(502).json({ error: e.message });
    }
};
