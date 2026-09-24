-- ============================================================
-- Migrazione 004 — Storage immagini eventi + controllo username live
-- ============================================================
-- Da eseguire UNA VOLTA nel SQL Editor, DOPO 003_candidarsi.sql.
-- ============================================================

-- ── STORAGE: bucket pubblico per le immagini di copertina eventi ──
insert into storage.buckets (id, name, public)
values ('eventi-immagini', 'eventi-immagini', true)
on conflict (id) do nothing;

-- Lettura pubblica (le immagini sono contenuto pubblico, come gli eventi)
drop policy if exists "eventi_immagini_select" on storage.objects;
create policy "eventi_immagini_select" on storage.objects
  for select using (bucket_id = 'eventi-immagini');

-- Solo Editor/Admin possono caricare, sostituire o eliminare immagini
drop policy if exists "eventi_immagini_insert" on storage.objects;
create policy "eventi_immagini_insert" on storage.objects
  for insert with check (bucket_id = 'eventi-immagini' and semmen.is_editor_or_admin());

drop policy if exists "eventi_immagini_update" on storage.objects;
create policy "eventi_immagini_update" on storage.objects
  for update using (bucket_id = 'eventi-immagini' and semmen.is_editor_or_admin());

drop policy if exists "eventi_immagini_delete" on storage.objects;
create policy "eventi_immagini_delete" on storage.objects
  for delete using (bucket_id = 'eventi-immagini' and semmen.is_editor_or_admin());

-- ── Controllo disponibilità username (usato in tempo reale nel form
--    di registrazione, prima ancora di creare l'account) ──
create or replace function semmen.username_disponibile(check_username text)
returns boolean
language sql security definer stable set search_path = semmen, public as $$
  select not exists (
    select 1 from semmen.profiles where lower(username) = lower(check_username)
  );
$$;

revoke all on function semmen.username_disponibile(text) from public;
grant execute on function semmen.username_disponibile(text) to anon, authenticated;
