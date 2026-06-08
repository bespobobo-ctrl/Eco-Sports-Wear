// ========================================================================
//   XAVFSIZ TOZALASH — Vercel serverless (service_role kalit bilan)
//   RLS anon DELETE'ni bloklaydi; faqat shu funksiya (yashirin service kalit
//   + admin parol) bilan loyihani tozalash mumkin.
//
//   Vercel ENV o'zgaruvchilari (Settings → Environment Variables) talab qilinadi:
//     SUPABASE_URL           = https://ddqoktwkffnufczhdads.supabase.co
//     SUPABASE_SERVICE_ROLE  = (Supabase → Project Settings → API → service_role key)
//     CLEAR_PASSWORD         = 4321   (ixtiyoriy; standart 4321)
//   ⚠️ service_role kalit HECH QACHON frontendga qo'yilmaydi — faqat shu yerda.
// ========================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE;
const CLEAR_PASSWORD = process.env.CLEAR_PASSWORD || "4321";

module.exports = async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Faqat POST" });
    if (!SUPABASE_URL || !SERVICE_KEY) {
        return res.status(500).json({ error: "Server sozlanmagan: SUPABASE_URL / SUPABASE_SERVICE_ROLE env yo'q" });
    }

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const password = body && body.password;
    if (password !== CLEAR_PASSWORD) return res.status(403).json({ error: "Noto'g'ri parol" });

    const headers = {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
    };

    // [jadval, filtr ustuni] — har jadvalda mavjud ustun bo'yicha hammasini o'chirish
    const targets = [
        ["eco_sale_items", "id"],
        ["eco_sales", "id"],
        ["eco_expenses", "id"],
        ["eco_kirim_history", "id"],
        ["eco_inventory", "product_id"]
    ];

    const results = {};
    let allOk = true;
    for (const [table, col] of targets) {
        try {
            const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${col}=not.is.null`, { method: "DELETE", headers });
            results[table] = r.status;
            if (!r.ok) allOk = false;
        } catch (e) {
            results[table] = "err:" + e.message;
            allOk = false;
        }
    }

    // "Tozalandi" belgisi — boshqa qurilmalar (Vercel/Telegram) ham mahalliy tozalanadi
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/eco_config?on_conflict=key`, {
            method: "POST",
            headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify({ key: "eco_project_cleared_at", value: Date.now() })
        });
    } catch (e) { /* belgini yozib bo'lmasa ham asosiy tozalash bo'ldi */ }

    return res.status(200).json({ ok: allOk, results });
};
