-- ============================================================================
--  ECO SPORTS — eco_users (LOGIN/PAROLLAR) ni XAVFSIZLASH
--  Bir martalik: Supabase → SQL Editor → yopishtirib "Run" bosing.
--
--  MUAMMO: eco_users jadvali himoyasiz edi — anon kalit bilan istalgan odam
--  barcha login/parol/PIN ni O'QIY va O'ZGARTIRA olardi (admin'ni egallash).
--
--  YECHIM: RLS yoqiladi → anon eco_users ga TO'G'RIDAN kira olmaydi (na o'qish,
--  na yozish). Login va boshqaruv faqat quyidagi SECURITY DEFINER funksiyalar
--  orqali (parol tekshiriladi). Parollar tashqariga CHIQMAYDI.
-- ============================================================================

-- 1) LOGIN tekshiruvi (username + parol) → faqat o'sha foydalanuvchi ma'lumoti
create or replace function public.verify_login(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public as $$
declare u record;
begin
  select id, name, username, role, pin into u
    from eco_users
   where lower(username) = lower(trim(p_username)) and password = p_password
   limit 1;
  if u.id is null then return null; end if;
  return json_build_object('id', u.id, 'name', u.name, 'username', u.username, 'role', u.role, 'pin', u.pin);
end; $$;

-- 2) SOTUVCHI tezkor PIN (5555) → kassir-optim foydalanuvchisi
create or replace function public.verify_seller_pin(p_pin text)
returns json language plpgsql security definer set search_path = public as $$
declare u record;
begin
  if trim(p_pin) <> '5555' then return null; end if;
  select id, name, username, role, pin into u
    from eco_users where role = 'kassir-optim' order by created_at limit 1;
  if u.id is null then return null; end if;
  return json_build_object('id', u.id, 'name', u.name, 'username', u.username, 'role', u.role, 'pin', u.pin);
end; $$;

-- 3) ADMIN: barcha xodimlarni ko'rish (faqat to'g'ri admin parol bilan)
create or replace function public.admin_list_users(p_admin_password text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from eco_users where role = 'admin' and password = p_admin_password) then
    raise exception 'Ruxsat yo''q';
  end if;
  return (select coalesce(json_agg(t), '[]'::json) from
    (select id, name, username, password, pin, role from eco_users order by created_at) t);
end; $$;

-- 4) ADMIN: xodim qo'shish/tahrirlash (upsert)
create or replace function public.admin_save_user(
  p_admin_password text, p_id text, p_name text, p_username text,
  p_password text, p_pin text, p_role text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from eco_users where role = 'admin' and password = p_admin_password) then
    raise exception 'Ruxsat yo''q';
  end if;
  insert into eco_users (id, name, username, password, pin, role)
  values (p_id, p_name, p_username, p_password, p_pin, p_role)
  on conflict (id) do update set
    name = excluded.name, username = excluded.username,
    password = excluded.password, pin = excluded.pin, role = excluded.role;
  return json_build_object('ok', true);
end; $$;

-- 5) ADMIN: xodimni o'chirish (asosiy admin'ni o'chirib bo'lmaydi)
create or replace function public.admin_delete_user(p_admin_password text, p_id text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from eco_users where role = 'admin' and password = p_admin_password) then
    raise exception 'Ruxsat yo''q';
  end if;
  delete from eco_users where id = p_id and username <> 'admin';
  return json_build_object('ok', true);
end; $$;

-- Anon (kirgan) funksiyalarni CHAQIRA oladi, lekin jadvalga to'g'ridan tegolmaydi
grant execute on function public.verify_login(text, text) to anon, authenticated;
grant execute on function public.verify_seller_pin(text) to anon, authenticated;
grant execute on function public.admin_list_users(text) to anon, authenticated;
grant execute on function public.admin_save_user(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_delete_user(text, text) to anon, authenticated;

-- ⛔ JADVALNI QULFLASH: RLS yoqiladi + anon huquqlari olib tashlanadi.
--    Endi anon eco_users ni O'QIY ham, YOZA ham olmaydi — faqat yuqoridagi
--    funksiyalar orqali (parol bilan).
alter table eco_users enable row level security;
revoke all on table eco_users from anon;
revoke all on table eco_users from authenticated;

-- TEKSHIRISH (Run'dan keyin): quyidagi 0 qator qaytarishi kerak (endi bloklangan):
--   select * from eco_users;   -- anon kalit bilan REST orqali endi ishlamaydi
