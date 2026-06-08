-- ============================================================================
--  ECO SPORTS — "Loyihani Tozalash" uchun XAVFSIZ bulut funksiyasi
--  Bir martalik: Supabase → SQL Editor → quyidagini yopishtirib "Run" bosing.
--
--  Bu funksiya SECURITY DEFINER bo'lgani uchun RLS'ni chetlab o'tib o'chiradi,
--  LEKIN faqat parol to'g'ri bo'lsa va FAQAT shu jadvallarni. service_role
--  ilovaga (frontendga) HECH QACHON chiqmaydi — anon kalit faqat funksiyani
--  chaqiradi. Vercel ENV kerak emas.
--
--  ⚠️ Parolni o'zgartirmoqchi bo'lsangiz, pastdagi '4321' ni o'zgartiring
--     (ilovadagi "Loyihani Tozalash" paroli bilan bir xil bo'lishi shart).
-- ============================================================================

create or replace function public.admin_clear_project(pass text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Parol tekshiruvi (ilovadagi tozalash paroli bilan bir xil)
  if pass is distinct from '4321' then
    raise exception 'Noto''g''ri parol';
  end if;

  -- Loyiha ma'lumotini bulutdan o'chirish
  delete from eco_sale_items where true;
  delete from eco_sales where true;
  delete from eco_expenses where true;
  delete from eco_kirim_history where true;
  delete from eco_inventory where true;

  -- "Tozalandi" belgisi — boshqa qurilmalar ham keyingi sinxda mahalliy tozalanadi
  insert into eco_config (key, value)
  values ('eco_project_cleared_at', to_jsonb((extract(epoch from now()) * 1000)::bigint))
  on conflict (key) do update set value = excluded.value;

  return json_build_object('ok', true);
end;
$$;

-- Anon (va kirgan) foydalanuvchi funksiyani CHAQIRA oladi (lekin to'g'ridan o'chira olmaydi)
grant execute on function public.admin_clear_project(text) to anon, authenticated;
