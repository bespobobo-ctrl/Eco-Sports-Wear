// ========================================================================
//   TELEGRAM BOT SERVERLESS FUNCTION - VERCEL BACKEND API
// ========================================================================

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const WEBAPP_URL = process.env.WEBAPP_URL || "https://eco-sports-wear.vercel.app";

module.exports = async (req, res) => {
    // Check if it is a POST request from Telegram Webhook
    if (req.method === 'POST') {
        try {
            const update = req.body;

            // Handle incoming message
            if (update && update.message) {
                const chatId = update.message.chat.id;
                const messageText = update.message.text;
                const firstName = update.message.from?.first_name || "Admin";

                // Check for /start command
                if (messageText === '/start') {
                    const replyText = `<b>💼 Eco Sports Kassa & CRM Tizimiga xush kelibsiz!</b>\n\nHurmatli <b>${firstName}</b>, kassa terminalini ochish, sotuvlarni hisoblash va do'kon statistikasini kuzatish uchun quyidagi yashil tugmani bosing:`;

                    // Send response back to the Telegram chat with Inline WebApp Button
                    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: replyText,
                            parse_mode: "HTML",
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text: "🛍 Kassa & CRM ni Ochish",
                                            web_app: { url: WEBAPP_URL }
                                        }
                                    ]
                                ]
                            }
                        })
                    });
                }
            }

            // Always respond to Telegram with 200 OK to acknowledge receipt
            return res.status(200).send('Update processed successfully');
        } catch (error) {
            console.error('Error handling Telegram webhook:', error);
            return res.status(500).send('Internal server error');
        }
    } else {
        // If someone opens the API link in a normal browser
        return res.status(200).send(`
            <div style="font-family: sans-serif; text-align: center; padding: 3rem; background: #090d16; color: #f8fafc; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                <h1 style="color: #10b981;">Eco Sports Bot API</h1>
                <p style="color: #94a3b8;">Serverless status: Active and running 24/7</p>
                <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); color: #10b981; font-weight: bold;">
                    Webhook URL: https://eco-sports-wear.vercel.app/api/bot
                </div>
            </div>
        `);
    }
};
