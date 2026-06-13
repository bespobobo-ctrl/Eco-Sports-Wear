# AI Agent moduli

Eco Sports CRM uchun alohida, izolyatsiya qilingan **AI Agent** bo'limi.
Asosiy `app.js` / `style.css` bilan kod aralashmaydi.

## Fayllar
- `ai-agent.css` — barcha stillar `.aia-` prefiksi bilan
- `ai-agent.js` — IIFE modul, global o'zgaruvchilarni ifloslantirmaydi

## Ulanishi (index.html)
1. `<head>` ichida: `<link rel="stylesheet" href="ai-agent/ai-agent.css">`
2. Navbar tab: `<button class="dept-tab-btn" data-dept="ai-agent">`
3. Section mount: `<div class="dept-section" id="ai-agent-section"><div id="ai-agent-root"></div></div>`
4. `</body>` oldidan: `<script src="ai-agent/ai-agent.js"></script>`

Tab almashish `app.js`dagi generik `{dept}-section` mantig'i bilan ishlaydi —
`app.js`ga hech qanday o'zgartirish kerak emas.

## Funksiyalar
- **Boshqaruv** — statistika, tezkor amallar, tizim holati
- **Ijtimoiy tarmoqlar** — Instagram/Telegram/Facebook/TikTok ko'p-akkaunt boshqaruvi + tez post
- **Direct avto-javob** — 24/7 javob, ohang, kalit-so'z qoidalari, jonli simulyator
- **Kontent plan $1M** — bitta rasm/ma'lumotdan 30 kunlik 4-bosqichli sotuv strategiyasi + funnel + daromad yo'l xaritasi
- **AI Studiya** — post/Reels/karusel + kaption + hashtag + eng yaxshi vaqt
- **Rejalashtiruvchi** — analitika asosida eng yaxshi vaqtlar + post navbati
- **API kalitlar** — ko'p-kalitli **fallback/rotatsiya** (bittasi ishlamasa keyingisiga o'tadi, tizim qotmaydi)

## Ma'lumot saqlash
Hozircha `localStorage` (`eco_ai_agent_v1`). Haqiqiy avto-post/AI generatsiya uchun
API kalitlar ulangach, generator funksiyalariga real `fetch` hooklari qo'shiladi
(`buildPlan`, `buildMedia`, `autoReplyFor`, `KeyPool.pick`).
