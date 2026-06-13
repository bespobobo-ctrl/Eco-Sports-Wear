// ========================================================================
//   POST REJALASHTIRUVCHI — Vercel Cron target (Faza 1.6)
//   Vaqti kelgan postlarni (ai_scheduled_posts) avtomatik chiqaradi.
//   vercel.json'da cron sozlanadi (masalan har 5 daqiqada).
// ========================================================================

const tg = require("./_telegram");
const db = require("./_supabase");

module.exports = async (req, res) => {
    if (!db.isConfigured() || !tg.isConfigured()) {
        return res.status(200).json({ ok: false, reason: "env sozlanmagan (BOT_TOKEN / SUPABASE_SERVICE_ROLE)" });
    }
    try {
        const nowIso = new Date().toISOString();
        // Vaqti kelgan, hali chiqarilmagan postlar
        const due = await db.select("ai_scheduled_posts",
            `status=eq.queued&publish_at=lte.${nowIso}&order=publish_at.asc&limit=10`);

        let published = 0;
        for (const post of due) {
            try {
                if (post.media_url && post.media_type === "photo") {
                    await tg.sendPhoto(post.target, post.media_url, post.text || "");
                } else {
                    await tg.sendMessage(post.target, post.text || "");
                }
                await db.update("ai_scheduled_posts", `id=eq.${post.id}`,
                    { status: "published", published_at: new Date().toISOString() });
                published++;
            } catch (e) {
                await db.update("ai_scheduled_posts", `id=eq.${post.id}`,
                    { status: "failed", error: String(e.message).slice(0, 300) });
            }
        }
        return res.status(200).json({ ok: true, checked: due.length, published });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
    }
};
