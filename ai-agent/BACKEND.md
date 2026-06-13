# AI Agent — Backend (Faza 0 poydevor)

Telegram avtomatik sotuv + guruh qo'riqchisi + kanal avto-post uchun server qatlami.
Statik frontend ustiga **Vercel serverless** (`api/`) + **Supabase** qo'shilgan.

## Fayllar
| Fayl | Vazifa |
|---|---|
| `supabase_ai_agent.sql` | Yangi `ai_*` jadvallar (Supabase'da bir marta RUN) |
| `api/_supabase.js` | Supabase server yordamchisi (REST, kutubxonasiz) |
| `api/_telegram.js` | Telegram API yordamchisi (sendMessage, deleteMessage, ban...) |
| `api/telegram-webhook.js` | Asosiy webhook: /start, guruh spam tozalash, anti-bot, savol-javob |
| `api/scheduler.js` | Vaqti kelgan postlarni avtomatik chiqaradi (Vercel Cron) |
| `.env.local` | Maxfiy tokenlar (git'ga TUSHMAYDI) |

## Kerakli ENV (Vercel → Settings → Environment Variables)
```
BOT_TOKEN              = (BotFather token)
SUPABASE_URL           = https://ddqoktwkffnufczhdads.supabase.co
SUPABASE_SERVICE_ROLE  = (Supabase → Settings → API → service_role secret)
WEBAPP_URL             = https://eco-sports-wear.vercel.app
TG_WEBHOOK_SECRET      = (tasodifiy maxfiy satr)
```

## Ishga tushirish bosqichlari (manual — bir marta)
1. **Supabase:** SQL editor'da `supabase_ai_agent.sql` ni RUN qiling.
2. **service_role kalit:** Supabase → Settings → API → `service_role` ni nusxalab, Vercel env va `.env.local` ga qo'ying.
3. **Vercel env:** yuqoridagi 5 env'ni qo'shing (`vercel env add ...` yoki dashboard).
4. **Deploy:** `npx vercel --prod`.
5. **Webhook o'rnatish (bir marta):**
   ```
   https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://eco-sports-wear.vercel.app/api/telegram-webhook&secret_token=<TG_WEBHOOK_SECRET>
   ```
6. **Bot sozlamasi (BotFather):** guruh tozalash + savol-javob uchun
   `/mybots → bot → Bot Settings → Group Privacy → Turn OFF`.
7. **Botni admin qiling:** kanalga (Post messages), guruhga (Delete messages + Ban users).

## Hozir tayyor (Faza 0/1.5)
- ✅ /start → katalog tugmasi (WebApp)
- ✅ Guruh: havola/reklama/taqiqlangan so'z → avtomatik o'chirish
- ✅ Begona bot guruhga qo'shilsa → avtomatik chiqarish
- ✅ Guruh savollariga qoida bo'yicha javob
- ✅ Hamma xabar/amal `ai_messages` ga log qilinadi

## Keyingi (Faza 1+)
- Katalog Supabase `eco_inventory` dan → savat → buyurtma (`ai_orders`)
- Payme/Click avtomatik to'lov
- AI (Claude/OpenAI) bilan aqlli javob + kaption/rasm
- Instagram (post + Direct), Meta review'dan keyin
