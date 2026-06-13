// ========================================================================
//   AI MIYA — Google Gemini (Generative Language API, raw fetch)
//   BEPUL tarif. Kalit yo'q bo'lsa null qaytaradi (chaqiruvchi qoidaviy
//   zaxiraga o'tadi — tizim qotmaydi).
//
//   Vercel ENV:
//     GEMINI_API_KEY = (aistudio.google.com → Get API key)
//     AI_MODEL       = gemini-2.0-flash  (ixtiyoriy; bepul, tez)
// ========================================================================

const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.AI_MODEL || "gemini-2.5-flash";

// Gemini "user"/"model" rollarini ishlatadi; ketma-ket bir xil rollarni birlashtiramiz
function toContents(messages) {
    const out = [];
    for (const m of messages || []) {
        const role = m.role === "assistant" ? "model" : "user";
        const last = out[out.length - 1];
        if (last && last.role === role) {
            last.parts[0].text += "\n" + m.content;
        } else {
            out.push({ role, parts: [{ text: m.content }] });
        }
    }
    return out;
}

// system: matn; messages: [{role:'user'|'assistant', content:'...'}]
async function chat(system, messages, maxTokens) {
    if (!API_KEY) return null;
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
        const body = {
            contents: toContents(messages),
            generationConfig: {
                maxOutputTokens: maxTokens || 800,
                temperature: 0.8,
                thinkingConfig: { thinkingBudget: 0 }  // chat uchun "o'ylash"ni o'chiramiz — tez+arzon
            }
        };
        if (system) body.system_instruction = { parts: [{ text: system }] };

        const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const data = await r.json().catch(() => null);
        if (!data) return null;
        if (data.error) { console.warn("[ai] gemini error:", data.error.message || data.error); return null; }
        const cand = (data.candidates || [])[0];
        if (!cand) return null;
        const text = (cand.content?.parts || [])
            .map(p => p.text || "")
            .join("")
            .trim();
        return text || null;
    } catch (e) {
        console.warn("[ai] xato:", e.message);
        return null;
    }
}

module.exports = { chat, isConfigured: () => !!API_KEY, MODEL };
