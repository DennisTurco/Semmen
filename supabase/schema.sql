-- ============================================================
-| La Setta del Semmen — schema Supabase
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
  organizzatore_id uuid references semmen.profiles (id) on delete set null,
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
grant select, insert, update, delete on semmen.discepoli to authenticated;

-- Elenco visibile solo a Compagno/Editor/Admin (pagina discepoli.html
-- riservata, non più pubblica).
drop policy if exists discepoli_select_all on semmen.discepoli;
create policy discepoli_select_all on semmen.discepoli
  for select using (semmen.is_compagno_or_above());

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

-- Elenco partecipanti di un evento (nome visualizzato + grado), leggibile
-- da Compagno/Editor/Admin nella pagina di dettaglio evento, senza
-- esporre l'intera tabella profiles (RLS di profiles resta "solo proprio
-- profilo o admin"). SECURITY DEFINER sul modello di directory_utenti().
create or replace function semmen.evento_partecipanti(p_evento_id uuid)
returns table (
  id             uuid,
  user_id        uuid,
  display_name   text,
  grado_nome     text,
  grado_simbolo  text,
  note           text,
  created_at     timestamptz
)
language plpgsql security definer set search_path = semmen, public as $$
begin
  if not semmen.is_compagno_or_above() then
    raise exception 'Permesso negato';
  end if;

  return query
    select
      ep.id,
      ep.user_id,
      coalesce(p.username, p.full_name, p.email),
      g.nome,
      g.simbolo,
      ep.note,
      ep.created_at
    from semmen.event_partecipazioni ep
    left join semmen.profiles p on p.id = ep.user_id
    left join semmen.gradi g on g.id = p.grado_id
    where ep.evento_id = p_evento_id
    order by ep.created_at asc;
end;
$$;

revoke all on function semmen.evento_partecipanti(uuid) from public;
grant execute on function semmen.evento_partecipanti(uuid) to authenticated;

-- Directory utenti leggibile da Compagno+ (non solo Editor/Admin): solo
-- id + nome visualizzato, mai email/ruolo. Usata per risolvere il nome
-- dell'organizzatore evento e per l'assegnazione delle Attività.
create or replace function semmen.utenti_assegnabili()
returns table (id uuid, display_name text)
language plpgsql security definer stable set search_path = semmen, public as $$
begin
  if not semmen.is_compagno_or_above() then
    raise exception 'Permesso negato';
  end if;
  return query
    select p.id, coalesce(p.username, p.full_name, p.email)
    from semmen.profiles p
    order by 2;
end;
$$;

revoke all on function semmen.utenti_assegnabili() from public;
grant execute on function semmen.utenti_assegnabili() to authenticated;

-- ============================================================
-- TABELLA ATTIVITA (bacheca kanban semplificata Compagno+)
-- ============================================================
create table if not exists semmen.attivita (
  id          uuid primary key default gen_random_uuid(),
  titolo      text not null,
  descrizione text,
  stato       text not null default 'da_fare'
                check (stato in ('da_fare', 'in_corso', 'completato')),
  assegnato_a uuid references semmen.profiles (id) on delete set null,
  creato_da   uuid references semmen.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table semmen.attivita enable row level security;
grant select, insert, update, delete on semmen.attivita to authenticated;

drop policy if exists attivita_select on semmen.attivita;
create policy attivita_select on semmen.attivita
  for select using (semmen.is_compagno_or_above());

drop policy if exists attivita_insert on semmen.attivita;
create policy attivita_insert on semmen.attivita
  for insert with check (semmen.is_compagno_or_above() and creato_da = auth.uid());

drop policy if exists attivita_update on semmen.attivita;
create policy attivita_update on semmen.attivita
  for update using (semmen.is_compagno_or_above()) with check (semmen.is_compagno_or_above());

drop policy if exists attivita_delete on semmen.attivita;
create policy attivita_delete on semmen.attivita
  for delete using (creato_da = auth.uid() or semmen.is_editor_or_admin());

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
-- TABELLA WIKI_PAGINE (contenuti dell'Archivio, wiki.html)
-- ============================================================
-- Fonte unica delle pagine dell'Archivio, modificabili da Editor/Admin
-- con l'editor in wiki.html. Il controllo sulle pagine riservate è
-- qui (RLS): il contenuto di una pagina `protetta` non arriva proprio
-- al browser di chi non è almeno Compagno.
create table if not exists semmen.wiki_pagine (
  slug        text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  titolo      text not null,
  gruppo      text not null default 'Varie',   -- sezione della sidebar
  ordine      int  not null default 0,          -- ordine nella sidebar (anche dei gruppi)
  protetta    boolean not null default false,   -- true = solo Compagno+
  badge       text,
  contenuto   text not null default '',         -- Markdown con frontmatter facoltativo
  updated_by  uuid references semmen.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table semmen.wiki_pagine enable row level security;
grant select on semmen.wiki_pagine to anon, authenticated;
grant insert, update, delete on semmen.wiki_pagine to authenticated;

drop policy if exists wiki_pagine_select on semmen.wiki_pagine;
create policy wiki_pagine_select on semmen.wiki_pagine
  for select using (not protetta or semmen.is_compagno_or_above());

drop policy if exists wiki_pagine_write_editor on semmen.wiki_pagine;
create policy wiki_pagine_write_editor on semmen.wiki_pagine
  for all using (semmen.is_editor_or_admin()) with check (semmen.is_editor_or_admin());

-- Autore e data dell'ultima modifica li imposta il database, non il client
create or replace function semmen.wiki_pagine_set_autore()
returns trigger
language plpgsql set search_path = semmen, public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists wiki_pagine_set_autore on semmen.wiki_pagine;
create trigger wiki_pagine_set_autore
  before insert or update on semmen.wiki_pagine
  for each row execute function semmen.wiki_pagine_set_autore();

-- Indice della sidebar: titoli di TUTTE le pagine (anche riservate, che
-- compaiono col lucchetto) ma mai il contenuto.
create or replace function semmen.wiki_indice()
returns table (slug text, titolo text, gruppo text, ordine int, protetta boolean, badge text)
language sql security definer stable set search_path = semmen, public as $$
  select p.slug, p.titolo, p.gruppo, p.ordine, p.protetta, p.badge
  from semmen.wiki_pagine p
  order by p.ordine, p.titolo;
$$;

revoke all on function semmen.wiki_indice() from public;
grant execute on function semmen.wiki_indice() to anon, authenticated;

-- ── Cronologia: la versione precedente viene salvata a ogni modifica
-- del testo e quando una pagina viene eliminata (niente FK sullo slug,
-- così la cronologia di una pagina eliminata resta recuperabile).
create table if not exists semmen.wiki_revisioni (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  titolo      text not null,
  contenuto   text not null,
  autore_id   uuid references semmen.profiles (id) on delete set null,  -- chi aveva scritto quella versione
  salvata_il  timestamptz not null,                                      -- quando era stata scritta
  archiviata_il timestamptz not null default now()
);

create index if not exists wiki_revisioni_slug_idx on semmen.wiki_revisioni (slug, salvata_il desc);

alter table semmen.wiki_revisioni enable row level security;
grant select on semmen.wiki_revisioni to authenticated;

-- Nessuna policy di scrittura: le righe le inserisce solo il trigger
drop policy if exists wiki_revisioni_select_editor on semmen.wiki_revisioni;
create policy wiki_revisioni_select_editor on semmen.wiki_revisioni
  for select using (semmen.is_editor_or_admin());

create or replace function semmen.wiki_pagine_archivia()
returns trigger
language plpgsql security definer set search_path = semmen, public as $$
begin
  if tg_op = 'DELETE'
     or old.contenuto is distinct from new.contenuto
     or old.titolo is distinct from new.titolo then
    insert into semmen.wiki_revisioni (slug, titolo, contenuto, autore_id, salvata_il)
    values (old.slug, old.titolo, old.contenuto, old.updated_by, old.updated_at);
  end if;
  return null;
end;
$$;

drop trigger if exists wiki_pagine_archivia on semmen.wiki_pagine;
create trigger wiki_pagine_archivia
  after update or delete on semmen.wiki_pagine
  for each row execute function semmen.wiki_pagine_archivia();

-- I contenuti iniziali delle pagine sono in migrations/008_wiki_pagine.sql:
-- su un progetto nuovo eseguilo dopo questo file (crea solo ciò che manca).

-- ============================================================
-- TABELLA PRODOTTI (catalogo dello Shop, shop.html)
-- ============================================================
-- Gestita da Editor/Admin dalla tab Prodotti del Pannello. Le
-- richieste di acquisto continuano a passare da EmailJS, non da qui.
create table if not exists semmen.prodotti (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descrizione text,
  prezzo      text,                              -- testo libero: "4€", "TBD"...
  immagine    text,                              -- URL o percorso (img/shop/...)
  icona       text,                              -- emoji mostrata se manca l'immagine
  disponibile boolean not null default true,     -- false = "Non disponibile"
  ordine      int not null default 0,            -- ordine nel catalogo
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table semmen.prodotti enable row level security;
grant select on semmen.prodotti to anon, authenticated;
grant insert, update, delete on semmen.prodotti to authenticated;

drop policy if exists prodotti_select_all on semmen.prodotti;
create policy prodotti_select_all on semmen.prodotti
  for select using (true);

drop policy if exists prodotti_write_editor on semmen.prodotti;
create policy prodotti_write_editor on semmen.prodotti
  for all using (semmen.is_editor_or_admin()) with check (semmen.is_editor_or_admin());

-- ── Bucket pubblico per le immagini dei prodotti ────────────────
insert into storage.buckets (id, name, public)
values ('prodotti-immagini', 'prodotti-immagini', true)
on conflict (id) do nothing;

drop policy if exists "prodotti_immagini_select" on storage.objects;
create policy "prodotti_immagini_select" on storage.objects
  for select using (bucket_id = 'prodotti-immagini');

drop policy if exists "prodotti_immagini_insert" on storage.objects;
create policy "prodotti_immagini_insert" on storage.objects
  for insert with check (bucket_id = 'prodotti-immagini' and semmen.is_editor_or_admin());

drop policy if exists "prodotti_immagini_update" on storage.objects;
create policy "prodotti_immagini_update" on storage.objects
  for update using (bucket_id = 'prodotti-immagini' and semmen.is_editor_or_admin());

drop policy if exists "prodotti_immagini_delete" on storage.objects;
create policy "prodotti_immagini_delete" on storage.objects
  for delete using (bucket_id = 'prodotti-immagini' and semmen.is_editor_or_admin());

-- I prodotti iniziali sono in migrations/009_prodotti_shop.sql.

-- ============================================================
-- INVITI, GALLERIA, SONDAGGI, PUNTI, PRODOTTI RISERVATI (da migrazione 010)
-- ============================================================
-- Sostituisce handle_new_user, la vista admin_users e la policy di
-- lettura dei prodotti definite più sopra.

-- ============================================================
-- 1) INVITI
-- ============================================================
alter table semmen.profiles
  add column if not exists invitato_da uuid references semmen.profiles (id) on delete set null;

-- Alla registrazione: il campo `invitato_da` dei metadati contiene lo
-- username di chi ha mandato il link (vedi registrati.html).
create or replace function semmen.handle_new_user()
returns trigger
language plpgsql security definer set search_path = semmen, public as $$
begin
  insert into semmen.profiles (id, email, full_name, username, role, invitato_da)
  values (
    new.id, new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'username',
    'utente',
    (select p.id from semmen.profiles p
      where lower(p.username) = lower(new.raw_user_meta_data ->> 'invitato_da'))
  );
  return new;
end;
$$;

drop view if exists semmen.admin_users;
create view semmen.admin_users as
  select id, email, username, full_name, role, grado_id, invitato_da, created_at from semmen.profiles;

grant select on semmen.admin_users to authenticated;

-- Correzione manuale dal Pannello (tab Utenti)
create or replace function semmen.admin_set_invitante(target_user_id uuid, invitante_id uuid)
returns void
language plpgsql security definer set search_path = semmen, public as $$
begin
  if not semmen.is_admin() then
    raise exception 'Solo un Admin può modificare chi ha invitato un utente';
  end if;
  if target_user_id = invitante_id then
    raise exception 'Un utente non può essersi invitato da solo';
  end if;
  update semmen.profiles set invitato_da = invitante_id where id = target_user_id;
end;
$$;

revoke all on function semmen.admin_set_invitante(uuid, uuid) from public;
grant execute on function semmen.admin_set_invitante(uuid, uuid) to authenticated;

-- Le persone invitate da chi chiama (pagina Account)
create or replace function semmen.miei_invitati()
returns table (display_name text, membro boolean, created_at timestamptz)
language sql security definer stable set search_path = semmen, public as $$
  select coalesce(p.username, p.full_name, 'Membro'), p.role <> 'utente', p.created_at
  from semmen.profiles p
  where p.invitato_da = auth.uid()
  order by p.created_at desc;
$$;

revoke all on function semmen.miei_invitati() from public;
grant execute on function semmen.miei_invitati() to authenticated;

-- ============================================================
-- 2) GALLERIA FOTO DEGLI EVENTI
-- ============================================================
-- I file stanno nel bucket privato `eventi-foto` con percorso
-- {evento_id}/{user_id}/{nome}.jpg: la seconda cartella dice di chi è
-- il file e serve alle policy di Storage.
create table if not exists semmen.evento_foto (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references semmen.eventi (id) on delete cascade,
  user_id    uuid references semmen.profiles (id) on delete set null default auth.uid(),
  path       text not null unique,
  didascalia text,
  created_at timestamptz not null default now()
);

create index if not exists evento_foto_evento_idx on semmen.evento_foto (evento_id, created_at);

alter table semmen.evento_foto enable row level security;
grant select, insert, delete on semmen.evento_foto to authenticated;

drop policy if exists evento_foto_select on semmen.evento_foto;
create policy evento_foto_select on semmen.evento_foto
  for select using (semmen.is_compagno_or_above());

drop policy if exists evento_foto_insert on semmen.evento_foto;
create policy evento_foto_insert on semmen.evento_foto
  for insert with check (semmen.is_compagno_or_above() and user_id = auth.uid());

drop policy if exists evento_foto_delete on semmen.evento_foto;
create policy evento_foto_delete on semmen.evento_foto
  for delete using (user_id = auth.uid() or semmen.is_editor_or_admin());

insert into storage.buckets (id, name, public)
values ('eventi-foto', 'eventi-foto', false)
on conflict (id) do nothing;

drop policy if exists "eventi_foto_select" on storage.objects;
create policy "eventi_foto_select" on storage.objects
  for select using (bucket_id = 'eventi-foto' and semmen.is_compagno_or_above());

drop policy if exists "eventi_foto_insert" on storage.objects;
create policy "eventi_foto_insert" on storage.objects
  for insert with check (
    bucket_id = 'eventi-foto' and semmen.is_compagno_or_above()
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "eventi_foto_delete" on storage.objects;
create policy "eventi_foto_delete" on storage.objects
  for delete using (
    bucket_id = 'eventi-foto'
    and ((storage.foldername(name))[2] = auth.uid()::text or semmen.is_editor_or_admin())
  );

-- ============================================================
-- 3) SONDAGGI (es. Meme dell'anno)
-- ============================================================
create table if not exists semmen.sondaggi (
  id          uuid primary key default gen_random_uuid(),
  titolo      text not null,
  descrizione text,
  chiude_il   timestamptz not null,
  creato_da   uuid references semmen.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists semmen.sondaggio_opzioni (
  id           uuid primary key default gen_random_uuid(),
  sondaggio_id uuid not null references semmen.sondaggi (id) on delete cascade,
  testo        text not null,
  ordine       int not null default 0
);

-- Un voto per persona per sondaggio (chiave primaria), non modificabile
create table if not exists semmen.sondaggio_voti (
  sondaggio_id uuid not null references semmen.sondaggi (id) on delete cascade,
  opzione_id   uuid not null references semmen.sondaggio_opzioni (id) on delete cascade,
  user_id      uuid not null references semmen.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (sondaggio_id, user_id)
);

alter table semmen.sondaggi enable row level security;
alter table semmen.sondaggio_opzioni enable row level security;
alter table semmen.sondaggio_voti enable row level security;
grant select, insert, update, delete on semmen.sondaggi, semmen.sondaggio_opzioni to authenticated;
grant select on semmen.sondaggio_voti to authenticated;

drop policy if exists sondaggi_select on semmen.sondaggi;
create policy sondaggi_select on semmen.sondaggi
  for select using (semmen.is_compagno_or_above());

drop policy if exists sondaggi_write_editor on semmen.sondaggi;
create policy sondaggi_write_editor on semmen.sondaggi
  for all using (semmen.is_editor_or_admin()) with check (semmen.is_editor_or_admin());

drop policy if exists sondaggio_opzioni_select on semmen.sondaggio_opzioni;
create policy sondaggio_opzioni_select on semmen.sondaggio_opzioni
  for select using (semmen.is_compagno_or_above());

drop policy if exists sondaggio_opzioni_write_editor on semmen.sondaggio_opzioni;
create policy sondaggio_opzioni_write_editor on semmen.sondaggio_opzioni
  for all using (semmen.is_editor_or_admin()) with check (semmen.is_editor_or_admin());

-- Ognuno vede solo il proprio voto (per sapere se ha già votato e cosa);
-- i conteggi passano da sondaggio_risultati()
drop policy if exists sondaggio_voti_select_own on semmen.sondaggio_voti;
create policy sondaggio_voti_select_own on semmen.sondaggio_voti
  for select using (user_id = auth.uid());

-- Il voto passa da qui (nessun grant di insert sulla tabella): controlla
-- grado, sondaggio aperto e che l'opzione appartenga al sondaggio.
create or replace function semmen.vota(p_opzione_id uuid)
returns void
language plpgsql security definer set search_path = semmen, public as $$
declare
  s semmen.sondaggi;
begin
  if not semmen.is_compagno_or_above() then
    raise exception 'Solo i Compagni possono votare';
  end if;

  select so.* into s
  from semmen.sondaggio_opzioni o join semmen.sondaggi so on so.id = o.sondaggio_id
  where o.id = p_opzione_id;

  if s.id is null then raise exception 'Opzione non trovata'; end if;
  if s.chiude_il <= now() then raise exception 'Il sondaggio è chiuso'; end if;

  insert into semmen.sondaggio_voti (sondaggio_id, opzione_id, user_id)
  values (s.id, p_opzione_id, auth.uid());
exception
  when unique_violation then raise exception 'Hai già votato in questo sondaggio';
end;
$$;

revoke all on function semmen.vota(uuid) from public;
grant execute on function semmen.vota(uuid) to authenticated;

-- Numero di votanti sempre; conteggi per opzione solo a sondaggio chiuso
-- (o per Editor/Admin), per non influenzare chi deve ancora votare.
create or replace function semmen.sondaggio_risultati(p_sondaggio_id uuid)
returns jsonb
language plpgsql security definer stable set search_path = semmen, public as $$
declare
  s semmen.sondaggi;
  visibili boolean;
begin
  if not semmen.is_compagno_or_above() then
    raise exception 'Permesso negato';
  end if;

  select * into s from semmen.sondaggi where id = p_sondaggio_id;
  if s.id is null then raise exception 'Sondaggio non trovato'; end if;
  visibili := s.chiude_il <= now() or semmen.is_editor_or_admin();

  return jsonb_build_object(
    'votanti', (select count(*) from semmen.sondaggio_voti where sondaggio_id = s.id),
    'visibili', visibili,
    'risultati', case when visibili then (
      select coalesce(jsonb_agg(jsonb_build_object('opzione_id', o.id, 'voti',
        (select count(*) from semmen.sondaggio_voti v where v.opzione_id = o.id))), '[]'::jsonb)
      from semmen.sondaggio_opzioni o where o.sondaggio_id = s.id
    ) end
  );
end;
$$;

revoke all on function semmen.sondaggio_risultati(uuid) from public;
grant execute on function semmen.sondaggio_risultati(uuid) to authenticated;

-- ============================================================
-- 4) PUNTI E GRADI GUADAGNATI
-- ============================================================
-- punti_minimi null = grado che NON si guadagna coi punti (Fondatore,
-- Grandi Anziani, Sacerdotesse, Adepto, Candidato...): resta manuale.
alter table semmen.gradi add column if not exists punti_minimi int check (punti_minimi is null or punti_minimi >= 0);

-- Valori iniziali della scala, modificabili dal Pannello (tab Gradi).
-- Solo dove non sono già stati impostati.
update semmen.gradi set punti_minimi = v.punti
from (values
  ('Apprendista del Semmen', 30),
  ('Controllore del Semmen', 80),
  ('Custode del Semmen', 200),
  ('Arconte del Semmen', 400)
) as v (nome, punti)
where gradi.nome = v.nome and gradi.punti_minimi is null;

-- Calcolo dei punti di ogni membro (Compagno+). Per cambiare quanto vale
-- un'azione basta modificare i numeri qui sotto e rieseguire la funzione.
--   evento frequentato (adesione a un evento già passato)  10
--   pagina dell'Archivio scritta o modificata             15 (una volta per pagina)
--   attività completata (assegnata a te)                   10
--   persona invitata diventata Compagno+                   20
--   foto caricata in una galleria                           2 (max 5 per evento)
--   voto in un sondaggio                                    5
create or replace function semmen.calcola_punti()
returns table (
  user_id uuid, display_name text, grado_id uuid,
  eventi int, pagine int, attivita int, inviti int, foto int, voti int, punti int
)
language sql security definer stable set search_path = semmen, public as $$
  with membri as (
    select p.id, coalesce(p.username, p.full_name, 'Membro') as display_name, p.grado_id
    from semmen.profiles p
    where p.role in ('admin', 'editor', 'compagno')
  ),
  conteggi as (
    select m.*,
      (select count(*) from semmen.event_partecipazioni ep join semmen.eventi e on e.id = ep.evento_id
        where ep.user_id = m.id and e.data < current_date)::int as eventi,
      (select count(distinct slug) from (
          select slug from semmen.wiki_pagine where updated_by = m.id
          union select slug from semmen.wiki_revisioni where autore_id = m.id
        ) x)::int as pagine,
      (select count(*) from semmen.attivita a
        where a.assegnato_a = m.id and a.stato = 'completato')::int as attivita,
      (select count(*) from semmen.profiles i
        where i.invitato_da = m.id and i.role <> 'utente')::int as inviti,
      (select coalesce(sum(least(n, 5)), 0) from (
          select count(*) as n from semmen.evento_foto f where f.user_id = m.id group by f.evento_id
        ) y)::int as foto,
      (select count(*) from semmen.sondaggio_voti v where v.user_id = m.id)::int as voti
    from membri m
  )
  select id, display_name, grado_id, eventi, pagine, attivita, inviti, foto, voti,
         eventi * 10 + pagine * 15 + attivita * 10 + inviti * 20 + foto * 2 + voti * 5
  from conteggi;
$$;

-- Non chiamabile direttamente: la leggono solo le funzioni qui sotto
revoke all on function semmen.calcola_punti() from public, anon, authenticated;

-- Classifica (pagine Discepoli e Account), visibile ai Compagni+
create or replace function semmen.classifica()
returns table (
  user_id uuid, display_name text, grado_nome text, grado_simbolo text,
  eventi int, pagine int, attivita int, inviti int, foto int, voti int, punti int
)
language plpgsql security definer stable set search_path = semmen, public as $$
begin
  if not semmen.is_compagno_or_above() then
    raise exception 'Permesso negato';
  end if;
  return query
    select c.user_id, c.display_name, g.nome, g.simbolo,
           c.eventi, c.pagine, c.attivita, c.inviti, c.foto, c.voti, c.punti
    from semmen.calcola_punti() c
    left join semmen.gradi g on g.id = c.grado_id
    order by c.punti desc, c.display_name;
end;
$$;

revoke all on function semmen.classifica() from public;
grant execute on function semmen.classifica() to authenticated;

-- Promozioni da proporre all'Admin: il grado guadagnabile più alto
-- raggiunto coi punti, solo se è davvero un passo avanti rispetto al
-- grado attuale. Non propone mai retrocessioni, e non tocca chi ha un
-- grado manuale pari o superiore (es. Menarca, Grande Anziano).
create or replace function semmen.promozioni_proposte()
returns table (
  user_id uuid, display_name text, punti int,
  grado_attuale text, grado_proposto_id uuid, grado_proposto text
)
language plpgsql security definer stable set search_path = semmen, public as $$
begin
  if not semmen.is_admin() then
    raise exception 'Permesso negato';
  end if;
  return query
    select c.user_id, c.display_name, c.punti,
           coalesce(ga.simbolo || ' ', '') || ga.nome,
           gp.id, coalesce(gp.simbolo || ' ', '') || gp.nome
    from semmen.calcola_punti() c
    left join semmen.gradi ga on ga.id = c.grado_id
    cross join lateral (
      select g.* from semmen.gradi g
      where g.punti_minimi is not null and g.punti_minimi <= c.punti
      order by g.punti_minimi desc
      limit 1
    ) gp
    where ga.id is null
       or (ga.punti_minimi is not null and ga.punti_minimi < gp.punti_minimi)
       or (ga.punti_minimi is null and ga.ordine > gp.ordine)
    order by c.punti desc;
end;
$$;

revoke all on function semmen.promozioni_proposte() from public;
grant execute on function semmen.promozioni_proposte() to authenticated;

-- Conferma della promozione: aggiorna il grado del profilo e quello
-- della riga Discepoli collegata, così le due pagine restano allineate.
create or replace function semmen.admin_promuovi(target_user_id uuid, new_grado_id uuid)
returns void
language plpgsql security definer set search_path = semmen, public as $$
begin
  if not semmen.is_admin() then
    raise exception 'Solo un Admin può promuovere un utente';
  end if;
  update semmen.profiles set grado_id = new_grado_id where id = target_user_id;
  update semmen.discepoli set grado_id = new_grado_id where user_id = target_user_id;
end;
$$;

revoke all on function semmen.admin_promuovi(uuid, uuid) from public;
grant execute on function semmen.admin_promuovi(uuid, uuid) to authenticated;

-- ============================================================
-- 5) PRODOTTI RISERVATI ALLA SETTA
-- ============================================================
-- Un prodotto `riservato` resta nel catalogo pubblico come riquadro
-- censurato: nome, descrizione, prezzo e immagine arrivano solo ai
-- Compagni+ (RLS), gli altri ricevono da catalogo_shop() solo la sua
-- posizione.
alter table semmen.prodotti add column if not exists riservato boolean not null default false;

drop policy if exists prodotti_select_all on semmen.prodotti;
create policy prodotti_select_all on semmen.prodotti
  for select using (not riservato or semmen.is_compagno_or_above());

create or replace function semmen.catalogo_shop()
returns table (id uuid, ordine int, riservato boolean)
language sql security definer stable set search_path = semmen, public as $$
  select p.id, p.ordine, p.riservato from semmen.prodotti p order by p.ordine, p.nome;
$$;

revoke all on function semmen.catalogo_shop() from public;
grant execute on function semmen.catalogo_shop() to anon, authenticated;

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
