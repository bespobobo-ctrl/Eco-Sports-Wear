// ========================================================================
//   SUPABASE SERVER YORDAMCHISI (Vercel serverless)
//   PostgREST orqali — qo'shimcha npm kutubxonasi kerak emas.
//   Yozish uchun SERVICE_ROLE kalit ishlatiladi (RLS'ni chetlab o'tadi).
//
//   Vercel ENV:
//     SUPABASE_URL           = https://ddqoktwkffnufczhdads.supabase.co
//     SUPABASE_SERVICE_ROLE  = (Supabase → Settings → API → service_role key)
// ========================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || "https://ddqoktwkffnufczhdads.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY || "";

function headers(extra) {
    return Object.assign({
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json"
    }, extra || {});
}

function base(table) {
    return `${SUPABASE_URL}/rest/v1/${table}`;
}

// INSERT — qatorlar massivi yoki bitta obyekt
async function insert(table, rows) {
    const r = await fetch(base(table), {
        method: "POST",
        headers: headers({ "Prefer": "return=representation" }),
        body: JSON.stringify(Array.isArray(rows) ? rows : [rows])
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`supabase insert ${table}: ${r.status} ${JSON.stringify(data)}`);
    return data;
}

// SELECT — query: PostgREST filtr satri, masalan "status=eq.new&order=created_at.desc&limit=20"
async function select(table, query) {
    const url = base(table) + (query ? `?${query}` : "");
    const r = await fetch(url, { headers: headers() });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`supabase select ${table}: ${r.status} ${JSON.stringify(data)}`);
    return data || [];
}

// UPDATE — match: "id=eq.5", patch: obyekt
async function update(table, match, patch) {
    const r = await fetch(`${base(table)}?${match}`, {
        method: "PATCH",
        headers: headers({ "Prefer": "return=representation" }),
        body: JSON.stringify(patch)
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`supabase update ${table}: ${r.status} ${JSON.stringify(data)}`);
    return data;
}

function isConfigured() { return !!SERVICE_KEY; }

module.exports = { insert, select, update, isConfigured, SUPABASE_URL };
