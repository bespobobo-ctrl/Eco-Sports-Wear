-- ============================================================================
--   ECO SPORTS — AI AGENT BACKEND (Faza 0: poydevor)
--   Supabase SQL editor'da bir marta RUN qiling.
--   Mavjud eco_* jadvallarga TEGMAYDI. Faqat yangi ai_* jadvallar qo'shadi.
-- ============================================================================

-- 1) BOT BUYURTMALARI ---------------------------------------------------------
create table if not exists public.ai_orders (
    id              bigint generated always as identity primary key,
    source          text    not null default 'telegram',   -- telegram | instagram | web
    tg_chat_id      text,                                   -- mijoz Telegram chat id
    tg_username     text,
    customer_name   text,
    customer_phone  text,
    items           jsonb   not null default '[]'::jsonb,   -- [{product_id, name, size, color, qty, price}]
    total           numeric not null default 0,
    status          text    not null default 'new',         -- new | confirmed | paid | shipped | done | canceled
    payment_status  text    not null default 'pending',     -- pending | paid | failed
    payment_ref     text,
    note            text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index if not exists ai_orders_status_idx on public.ai_orders(status);
create index if not exists ai_orders_created_idx on public.ai_orders(created_at desc);

-- 2) XABARLAR / AVTO-JAVOB JURNALI -------------------------------------------
create table if not exists public.ai_messages (
    id          bigint generated always as identity primary key,
    source      text not null default 'telegram',           -- telegram | instagram
    chat_id     text,
    chat_type   text,                                        -- private | group | channel
    username    text,
    direction   text not null default 'in',                  -- in | out
    text        text,
    matched_rule text,                                       -- qaysi qoida ishladi
    is_spam     boolean default false,
    action      text,                                        -- replied | deleted | banned | ignored
    created_at  timestamptz not null default now()
);
create index if not exists ai_messages_chat_idx on public.ai_messages(chat_id);
create index if not exists ai_messages_created_idx on public.ai_messages(created_at desc);

-- 3) POST NAVBATI (REJALASHTIRILGAN POSTLAR) ---------------------------------
create table if not exists public.ai_scheduled_posts (
    id          bigint generated always as identity primary key,
    platform    text not null default 'telegram',            -- telegram | instagram | facebook | tiktok
    target      text,                                        -- @kanal username yoki chat_id
    text        text,
    media_url   text,
    media_type  text,                                        -- photo | video | none
    publish_at  timestamptz,                                 -- qachon chiqarish
    status      text not null default 'queued',              -- queued | published | failed | canceled
    published_at timestamptz,
    error       text,
    created_at  timestamptz not null default now()
);
create index if not exists ai_sched_status_idx on public.ai_scheduled_posts(status, publish_at);

-- 4) SAQLANGAN KONTENT PLANLAR (1M auditoriya) -------------------------------
create table if not exists public.ai_content_plans (
    id          bigint generated always as identity primary key,
    product     text,
    price       text,
    audience    text,
    plan        jsonb not null default '{}'::jsonb,          -- to'liq 30-kunlik plan + qamrov
    created_at  timestamptz not null default now()
);

-- 5) ULANGAN IJTIMOIY AKKAUNTLAR / KANALLAR ----------------------------------
create table if not exists public.ai_social_accounts (
    id          bigint generated always as identity primary key,
    platform    text not null,                               -- telegram | instagram | ...
    kind        text not null default 'account',             -- account | channel | group
    handle      text,                                        -- @username
    chat_id     text,                                        -- raqamli id (guruh/kanal uchun)
    role        text default 'admin',                        -- bot huquqi
    connected   boolean default true,
    meta        jsonb default '{}'::jsonb,
    created_at  timestamptz not null default now()
);

-- 6) AGENT XOTIRASI (o'rganish — egasi haqida eslab qolingan faktlar) ------
create table if not exists public.ai_agent_memory (
    id          bigint generated always as identity primary key,
    chat_id     text,                                        -- egasi Telegram chat id
    note        text not null,                               -- eslab qolingan fakt
    created_at  timestamptz not null default now()
);
create index if not exists ai_agent_memory_chat_idx on public.ai_agent_memory(chat_id);

-- ============================================================================
--   RLS (Row Level Security)
--   Eslatma: bot SERVICE_ROLE kalit bilan yozadi (RLS'ni chetlab o'tadi).
--   CRM panel anon kalit bilan o'qiydi — mavjud eco_* jadvallar bilan bir xil
--   xavfsizlik darajasi. Productionда qattiqlashtirish tavsiya etiladi.
-- ============================================================================
alter table public.ai_orders          enable row level security;
alter table public.ai_messages        enable row level security;
alter table public.ai_scheduled_posts enable row level security;
alter table public.ai_content_plans   enable row level security;
alter table public.ai_social_accounts enable row level security;
alter table public.ai_agent_memory     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ai_orders','ai_messages','ai_scheduled_posts','ai_content_plans','ai_social_accounts','ai_agent_memory']
  loop
    execute format('drop policy if exists %I_anon_all on public.%I;', t, t);
    execute format('create policy %I_anon_all on public.%I for all to anon using (true) with check (true);', t, t);
  end loop;
end $$;

-- updated_at avtomatik yangilanishi
create or replace function public.ai_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists ai_orders_touch on public.ai_orders;
create trigger ai_orders_touch before update on public.ai_orders
  for each row execute function public.ai_touch_updated_at();

-- ============================================================================
--   TAYYOR. Endi Vercel env'larni sozlang (ai-agent/BACKEND.md ga qarang).
-- ============================================================================
