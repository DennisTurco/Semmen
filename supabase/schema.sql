-- ============================================================
-- La Setta del Semmen — schema Supabase
-- ============================================================
-- Pensato per essere eseguito su un progetto Supabase CONDIVISO
-- con altri progetti: tutte le tabelle vivono nello schema
-- dedicato `semmen`, isolate dallo schema `public` già in uso.
--
-- Esegui questo file una volta sola nel SQL Editor del progetto
-- Supabase (Project → SQL Editor → New query → incolla → Run).
--
-- IMPORTANTE — passo manuale obbligatorio dopo aver eseguito questo
-- script: vai su Project Settings → Data API → "Exposed schemas" e
-- aggiungi `semmen` all'elenco (di default è esposto solo `public`).
-- Senza questo passaggio le chiamate da js/supabase-client.js
-- (che usano `.schema('semmen')`) falliranno con 406/404.
-- ============================================================

create extension if not exists "pgcrypto";

create schema if not exists semmen;

grant usage on schema semmen to anon, authenticated;

-- ============================================================
-- RUOLI UTENTE
-- ============================================================
-- admin    → gestione utenti/ruoli + gestione contenuti
-- editor   → gestione contenuti (eventi, discepoli), NON utenti
-- compagno → membro registrato (Adepto+), può candidarsi agli eventi
-- utente   → account base, nessun privilegio extra (default alla registrazione)

do $$ begin
  create type semmen.user_role as enum ('admin', 'editor', 'compagno', 'utente');
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- TABELLA PROFILES (estende auth.users con ruolo e dati pubblici)
-- ============================================================
create table if not exists semmen.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       semmen.user_role not null default 'utente',
  created_at timestamptz not null default now()
);

alter table semmen.profiles enable row level security;

-- Funzioni helper (SECURITY DEFINER per evitare ricorsione RLS
-- quando una policy su `profiles` deve leggere `profiles` stessa)
create or replace function semmen.current_role()
returns semmen.user_role
language sql security definer stable set search_path = semmen, public as $$
  select role from semmen.profiles where id = auth.uid();
$$;

create or replace function semmen.is_admin()
returns boolean
language sql security definer stable set search_path = semmen, public as $$
  select coalesce((select role = 'admin' from semmen.profiles where id = auth.uid()), false);
$$;

create or replace function semmen.is_editor_or_admin()
returns boolean
language sql security definer stable set search_path = semmen, public as $$
  select coalesce((select role in ('admin', 'editor') from semmen.profiles where id = auth.uid()), false);
$$;

create or replace function semmen.is_compagno_or_above()
returns boolean
language sql security definer stable set search_path = semmen, public as $$
  select coalesce((select role in ('admin', 'editor', 'compagno') from semmen.profiles where id = auth.uid()), false);
$$;

-- Policy: ognuno vede il proprio profilo; l'admin vede tutti
drop policy if exists profiles_select_own on semmen.profiles;
create policy profiles_select_own on semmen.profiles
  for select using (auth.uid() = id or semmen.is_admin());

-- Un utente può aggiornare solo i propri dati non sensibili (non il ruolo,
-- protetto a livello di colonna con i GRANT più sotto)
drop policy if exists profiles_update_own on semmen.profiles;
create policy profiles_update_own on semmen.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Nessun insert/delete diretto dal client: il profilo nasce dal trigger
-- su auth.users e viene rimosso in cascata quando l'utente viene eliminato.

-- Diritti di colonna: gli utenti autenticati NON possono modificare il
-- proprio ruolo direttamente (solo full_name). Il cambio ruolo passa
-- esclusivamente dalla funzione admin_set_role() più sotto.
grant select, update on semmen.profiles to authenticated;
revoke update on semmen.profiles from authenticated;
grant update (full_name) on semmen.profiles to authenticated;

-- Funzione riservata agli admin per cambiare il ruolo di un utente
create or replace function semmen.admin_set_role(target_user_id uuid, new_role semmen.user_role)
returns void
language plpgsql security definer set search_path = semmen, public as $$
begin
  if not semmen.is_admin() then
    raise exception 'Solo un Admin può modificare i ruoli utente';
  end if;
  update semmen.profiles set role = new_role where id = target_user_id;
end;
$$;

revoke all on function semmen.admin_set_role(uuid, semmen.user_role) from public;
grant execute on function semmen.admin_set_role(uuid, semmen.user_role) to authenticated;

-- Vista comoda per l'admin: elenco utenti con email e ruolo
-- (si appoggia alle policy di profiles, essendo SECURITY INVOKER di default)
create or replace view semmen.admin_users as
  select id, email, full_name, role, created_at from semmen.profiles;

grant select on semmen.admin_users to authenticated;

-- Auto-crea il profilo alla registrazione di un nuovo utente
create or replace function semmen.handle_new_user()
returns trigger
language plpgsql security definer set search_path = semmen, public as $$
begin
  insert into semmen.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'utente');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure semmen.handle_new_user();

-- ============================================================
-- TABELLA EVENTI
-- ============================================================
create table if not exists semmen.eventi (
  id               uuid primary key default gen_random_uuid(),
  titolo           text not null,
  data             date,
  data_testo       text,
  durata           text,
  luogo            text,
  descrizione      text,
  immagine         text,
  credito_immagine text,
  stato            text not null default 'In programma'
                     check (stato in ('In programma', 'Imminente', 'Passato')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table semmen.eventi enable row level security;
grant select, insert, update, delete on semmen.eventi to anon, authenticated;

drop policy if exists eventi_select_all on semmen.eventi;
create policy eventi_select_all on semmen.eventi
  for select using (true);

drop policy if exists eventi_write_editor on semmen.eventi;
create policy eventi_write_editor on semmen.eventi
  for all using (semmen.is_editor_or_admin()) with check (semmen.is_editor_or_admin());

-- ============================================================
-- TABELLA DISCEPOLI (membri della Setta, per grado)
-- ============================================================
create table if not exists semmen.discepoli (
  id         uuid primary key default gen_random_uuid(),
  grado      text not null,
  simbolo    text,
  ordine     int not null default 0,   -- ordine di visualizzazione del grado (0 = più alto)
  nome       text not null,
  nota       text,
  created_at timestamptz not null default now()
);

alter table semmen.discepoli enable row level security;
grant select, insert, update, delete on semmen.discepoli to anon, authenticated;

drop policy if exists discepoli_select_all on semmen.discepoli;
create policy discepoli_select_all on semmen.discepoli
  for select using (true);

drop policy if exists discepoli_write_editor on semmen.discepoli;
create policy discepoli_write_editor on semmen.discepoli
  for all using (semmen.is_editor_or_admin()) with check (semmen.is_editor_or_admin());

-- ============================================================
-- TABELLA PARTECIPAZIONI EVENTI (sostituisce l'invio email)
-- ============================================================
create table if not exists semmen.event_partecipazioni (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references semmen.eventi (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now(),
  unique (evento_id, user_id)
);

alter table semmen.event_partecipazioni enable row level security;
grant select, insert, delete on semmen.event_partecipazioni to authenticated;

-- Un Compagno+ vede le proprie partecipazioni; Editor/Admin le vedono tutte
drop policy if exists partecipazioni_select on semmen.event_partecipazioni;
create policy partecipazioni_select on semmen.event_partecipazioni
  for select using (auth.uid() = user_id or semmen.is_editor_or_admin());

-- Solo Compagno+ (compagno/editor/admin) può candidarsi; utente semplice no
drop policy if exists partecipazioni_insert on semmen.event_partecipazioni;
create policy partecipazioni_insert on semmen.event_partecipazioni
  for insert with check (auth.uid() = user_id and semmen.is_compagno_or_above());

-- Un utente può ritirare la propria candidatura; Editor/Admin possono gestirle tutte
drop policy if exists partecipazioni_delete on semmen.event_partecipazioni;
create policy partecipazioni_delete on semmen.event_partecipazioni
  for delete using (auth.uid() = user_id or semmen.is_editor_or_admin());

-- ============================================================
-- PRIMO ADMIN
-- ============================================================
-- Dopo la registrazione del tuo primo utente dal sito, promuovilo
-- ad Admin eseguendo (sostituisci l'email):
--
--   update semmen.profiles set role = 'admin' where email = 'dennisturco@gmail.com';
--
-- Da quel momento in poi, ogni altro cambio di ruolo va fatto dal
-- Pannello admin (che usa la funzione admin_set_role) e non serve
-- più toccare l'SQL Editor.

-- ============================================================
-- NOTA — Heartbeat
-- ============================================================
-- Non è stata creata una tabella heartbeat: il progetto Supabase
-- condiviso ne ha già una propria per evitare l'auto-pausa. Se in
-- futuro questo sito dovesse girare su un progetto Supabase tutto
-- suo, andrà ricreata (vedi cronologia del progetto per lo schema).
