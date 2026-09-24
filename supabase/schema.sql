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
--
-- Questo file rappresenta lo stato FINALE dello schema (va bene per
-- un progetto Supabase mai inizializzato). Se lo hai già eseguito in
-- passato e devi solo applicare gli aggiornamenti successivi, usa
-- invece i file in supabase/migrations/ (in ordine numerico).
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
  username   text unique check (username is null or username ~ '^[a-zA-Z0-9_.]{3,24}$'),
  full_name  text,
  role       semmen.user_role not null default 'utente',
  grado_id   uuid,   -- FK verso semmen.gradi, aggiunta dopo (la tabella gradi è definita più sotto)
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
grant update (full_name, username) on semmen.profiles to authenticated;

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

-- ============================================================
-- TABELLA GRADI (fonte unica per wiki#gerarchia e Discepoli)
-- ============================================================
-- "Grado" è il rango narrativo dell'Ordine (Adepto, Arconte, ecc.),
-- distinto dal `role` di sistema (admin/editor/compagno/utente).
create table if not exists semmen.gradi (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  simbolo     text,
  ordine      int not null default 0,   -- 0 = grado più alto
  descrizione text,
  privilegi   text,
  created_at  timestamptz not null default now()
);

alter table semmen.gradi enable row level security;
grant select, insert, update, delete on semmen.gradi to anon, authenticated;

drop policy if exists gradi_select_all on semmen.gradi;
create policy gradi_select_all on semmen.gradi
  for select using (true);

drop policy if exists gradi_write_editor on semmen.gradi;
create policy gradi_write_editor on semmen.gradi
  for all using (semmen.is_editor_or_admin()) with check (semmen.is_editor_or_admin());

insert into semmen.gradi (nome, simbolo, ordine, descrizione, privilegi) values
  ('Ahckmed, Creatore del Semmen', '✦✦✦✦✦', 0,
   'Colui che ha fondato la Setta. Grado I — Massimo. Uno solo per generazione.',
   'Può nominare e destituire senza preavviso, ha sempre ragione anche quando ha torto, può condividere meme di qualsiasi qualità.'),
  ('Grande Anziano', '✦✦✦✦', 1,
   'Membri fondatori o di lunghissima data. Custodiscono la memoria storica e intervengono nelle dispute teologiche più gravi. Grado II — Massimo 3.',
   'Possono richiamare all''ordine chiunque.'),
  ('Arconte del Semmen', '✦✦✦', 2,
   'Responsabile della qualità dei contenuti condivisi nei canali ufficiali. Ha il potere di ammonire i membri. Grado III — Nominato dal gruppo.',
   'Ha l''onore di custodire il sacro sapere. Deve prendere parte ai convivi del Semmen. E memare il più possibile.'),
  ('Custode del Semmen', '✦✦✦', 2,
   'Custode della memoria e dei segreti minori dell''Ordine. Grado III — Nominato dal gruppo.',
   'Veglia sugli archivi minori e assiste gli Arconti nei loro doveri.'),
  ('Menarca del Semmen', '✦✦✦', 2,
   'Colui che è almeno a livello Chiurpy. Dopo un grande periodo di astinenza cerca di arrivare allo stadio supremo, Brodo Primordiale. Grado III — Ruolo parallelo al Custode.',
   'È supportato nel suo intento da tutti i membri. Gli si perdona quasi tutto, a patto che Ahckmed intervenga.'),
  ('Controllore del Semmen', '✦✦', 3,
   'È un umile controllore. Grado IV — Nominato dal gruppo.',
   'Ha l''onore di attestare gli stadi altrui del Semmen.'),
  ('Apprendista del Semmen', '✦✦', 3,
   'È un semplice apprendista, ancora in fase di formazione. Grado IV — Nominato dal gruppo.',
   'È già tanto che è nel gruppo. Può prendere parte ai convivi del Semmen.'),
  ('Sacerdotessa del Semmen', '✦', 4,
   'Questa carica viene assegnata automaticamente alle levatrici dei membri del Semmen. Grado V — Meretrice del membro del Semmen. Ad esse va il massimo rispetto e la massima devozione, sono responsabili dell''estrazione del Semmen dei membri.',
   null),
  ('Adepto del Semmen', '✦', 5,
   'Colui che si è candidato alla Setta ed è stato accettato dai Grandi Maestri, ma non ha ancora svolto il Rito di Iniziazione Completo. È a tutti gli effetti un membro della Setta, ma non gode ancora di tutti i privilegi riservati agli iniziati. Grado V.',
   'Accesso ai canali riservati della Setta. Può candidarsi a partecipare agli eventi della Setta. Diritto di voto limitato.'),
  ('Candidato', '◯', 6,
   'Colui che ha presentato candidatura e attende il verdetto. Grado provvisorio. Se accettato, diventa Adepto del Semmen in attesa del Rito di Iniziazione Completo.',
   'Accesso limitato. Nessun diritto di voto. Nessuna colpa se rifiutato.')
on conflict (nome) do nothing;

-- Ora che semmen.gradi esiste, completa la FK su profiles.grado_id
do $$ begin
  alter table semmen.profiles
    add constraint profiles_grado_id_fkey foreign key (grado_id) references semmen.gradi (id);
exception
  when duplicate_object then null;
end $$;

-- Funzione riservata agli admin per assegnare il grado a un utente
create or replace function semmen.admin_set_grado(target_user_id uuid, new_grado_id uuid)
returns void
language plpgsql security definer set search_path = semmen, public as $$
begin
  if not semmen.is_admin() then
    raise exception 'Solo un Admin può modificare il grado di un utente';
  end if;
  update semmen.profiles set grado_id = new_grado_id where id = target_user_id;
end;
$$;

revoke all on function semmen.admin_set_grado(uuid, uuid) from public;
grant execute on function semmen.admin_set_grado(uuid, uuid) to authenticated;

-- Auto-servizio: chi completa il form di candidatura (candidatura.html)
-- imposta da sé il proprio grado a "Candidato". Non è un varco per
-- auto-promuoversi ad altro: agisce solo sulla propria riga (auth.uid())
-- e solo verso il grado fisso "Candidato".
create or replace function semmen.candidarsi()
returns void
language plpgsql security definer set search_path = semmen, public as $$
declare
  candidato_id uuid;
begin
  select id into candidato_id from semmen.gradi where nome = 'Candidato';
  if candidato_id is null then
    raise exception 'Grado "Candidato" non trovato';
  end if;

  update semmen.profiles
  set grado_id = candidato_id
  where id = auth.uid() and role = 'utente';
end;
$$;

revoke all on function semmen.candidarsi() from public;
grant execute on function semmen.candidarsi() to authenticated;

-- Vista comoda per l'admin: elenco utenti con email, ruolo e grado
-- (si appoggia alle policy di profiles, essendo SECURITY INVOKER di default)
drop view if exists semmen.admin_users;
create view semmen.admin_users as
  select id, email, username, full_name, role, grado_id, created_at from semmen.profiles;

grant select on semmen.admin_users to authenticated;

-- Auto-crea il profilo alla registrazione di un nuovo utente
create or replace function semmen.handle_new_user()
returns trigger
language plpgsql security definer set search_path = semmen, public as $$
begin
  insert into semmen.profiles (id, email, full_name, username, role)
  values (
    new.id, new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'username',
    'utente'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure semmen.handle_new_user();

-- Elenco minimale degli utenti (id + nome da mostrare), leggibile da
-- Editor e Admin per poter collegare un Discepolo a un account reale
-- senza dover esporre l'intera tabella profiles (che resta admin-only).
create or replace function semmen.directory_utenti()
returns table (id uuid, display_name text)
language plpgsql security definer set search_path = semmen, public as $$
begin
  if not semmen.is_editor_or_admin() then
    raise exception 'Permesso negato';
  end if;
  return query
    select p.id, coalesce(p.username, p.full_name, p.email)
    from semmen.profiles p
    order by 2;
end;
$$;

revoke all on function semmen.directory_utenti() from public;
grant execute on function semmen.directory_utenti() to authenticated;

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
-- TABELLA DISCEPOLI (roster pubblico dei membri, per grado)
-- ============================================================
-- `user_id` è nullable: non tutti i discepoli hanno (ancora) un
-- account registrato. Quando è valorizzato, il nome da mostrare va
-- letto dinamicamente dal profilo collegato (username/full_name)
-- invece della colonna statica `nome`, che resta come fallback.
create table if not exists semmen.discepoli (
  id         uuid primary key default gen_random_uuid(),
  grado_id   uuid not null references semmen.gradi (id),
  user_id    uuid references semmen.profiles (id) on delete set null,
  nome       text not null,   -- fallback quando user_id è null
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
-- STORAGE: bucket pubblico per le immagini di copertina eventi
-- ============================================================
insert into storage.buckets (id, name, public)
values ('eventi-immagini', 'eventi-immagini', true)
on conflict (id) do nothing;

drop policy if exists "eventi_immagini_select" on storage.objects;
create policy "eventi_immagini_select" on storage.objects
  for select using (bucket_id = 'eventi-immagini');

drop policy if exists "eventi_immagini_insert" on storage.objects;
create policy "eventi_immagini_insert" on storage.objects
  for insert with check (bucket_id = 'eventi-immagini' and semmen.is_editor_or_admin());

drop policy if exists "eventi_immagini_update" on storage.objects;
create policy "eventi_immagini_update" on storage.objects
  for update using (bucket_id = 'eventi-immagini' and semmen.is_editor_or_admin());

drop policy if exists "eventi_immagini_delete" on storage.objects;
create policy "eventi_immagini_delete" on storage.objects
  for delete using (bucket_id = 'eventi-immagini' and semmen.is_editor_or_admin());

-- ============================================================
-- Controllo disponibilità username (usato in tempo reale nel form
-- di registrazione, prima ancora di creare l'account)
-- ============================================================
create or replace function semmen.username_disponibile(check_username text)
returns boolean
language sql security definer stable set search_path = semmen, public as $$
  select not exists (
    select 1 from semmen.profiles where lower(username) = lower(check_username)
  );
$$;

revoke all on function semmen.username_disponibile(text) from public;
grant execute on function semmen.username_disponibile(text) to anon, authenticated;

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
