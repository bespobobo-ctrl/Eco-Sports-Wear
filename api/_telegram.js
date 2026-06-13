// ========================================================================
//   TELEGRAM API SERVER YORDAMCHISI (Vercel serverless)
//   Token YASHIRIN env'da — hech qachon frontendga chiqmaydi.
//
//   Vercel ENV:
//     BOT_TOKEN = (BotFather'dan)
// ========================================================================

const BOT_TOKEN = process.env.BOT_TOKEN || "";

async function call(method, payload) {
    if (!BOT_TOKEN) throw new Error("BOT_TOKEN env yo'q");
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
    });
    const data = await r.json().catch(() => ({}));
    if (!data.ok) {
        // Telegram xatosi — log qilamiz, lekin botni qulatmaymiz
        console.warn(`[telegram] ${method} rad etdi:`, data.description || data);
    }
    return data;
}

const sendMessage = (chat_id, text, extra) =>
    call("sendMessage", Object.assign({ chat_id, text, parse_mode: "HTML", disable_web_page_preview: true }, extra || {}));

const sendPhoto = (chat_id, photo, caption, extra) =>
    call("sendPhoto", Object.assign({ chat_id, photo, caption, parse_mode: "HTML" }, extra || {}));

const deleteMessage = (chat_id, message_id) =>
    call("deleteMessage", { chat_id, message_id });

const banChatMember = (chat_id, user_id) =>
    call("banChatMember", { chat_id, user_id });

const restrictChatMember = (chat_id, user_id, permissions) =>
    call("restrictChatMember", { chat_id, user_id, permissions });

const answerCallbackQuery = (callback_query_id, text) =>
    call("answerCallbackQuery", { callback_query_id, text });

const isConfigured = () => !!BOT_TOKEN;

module.exports = {
    call, sendMessage, sendPhoto, deleteMessage,
    banChatMember, restrictChatMember, answerCallbackQuery, isConfigured
};
