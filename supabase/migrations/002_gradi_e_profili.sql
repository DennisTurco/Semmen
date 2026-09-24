-- ============================================================
-- Migrazione 002 — Gradi, username, grado utenti, discepoli dinamici
-- ============================================================
-- Da eseguire UNA VOLTA nel SQL Editor, DOPO aver già eseguito
-- supabase/schema.sql. È idempotente (if not exists / on conflict).
--
-- Cosa introduce:
--  - profiles.username        → nome utente pubblico, autogestito
--  - profiles.grado_id        → grado narrativo (Adepto, Arconte...),
--                                assegnato solo dall'Admin
--  - tabella semmen.gradi     → fonte unica per la pagina wiki
--                                "Gerarchia Interna" e per raggruppare
--                                i Discepoli
--  - discepoli.grado_id       → FK verso semmen.gradi (sostituisce le
--                                vecchie colonne testuali grado/simbolo)
--  - discepoli.user_id        → FK opzionale (nullable) verso
--                                auth.users: se valorizzata, il nome
--                                mostrato viene letto dinamicamente dal
--                                profilo (username/full_name) invece
--                                della colonna statica `nome`
-- ============================================================

-- ── USERNAME sui profili ──────────────────────────────────────
alter table semmen.profiles add column if not exists username text;

do $$ begin
  alter table semmen.profiles add constraint profiles_username_unique unique (username);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table semmen.profiles add constraint profiles_username_format
    check (username is null or username ~ '^[a-zA-Z0-9_.]{3,24}$');
exception
  when duplicate_object then null;
end $$;

-- Gli utenti possono aggiornare anche il proprio username (oltre a full_name)
grant update (full_name, username) on semmen.profiles to authenticated;

-- ============================================================
-- TABELLA GRADI (fonte unica per wiki#gerarchia e Discepoli)
-- ============================================================
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

-- Seed dei gradi storici della Setta (idempotente: non duplica se già presenti)
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

-- ── GRADO narrativo dell'utente (separato dal `role` di sistema) ──
alter table semmen.profiles add column if not exists grado_id uuid references semmen.gradi (id);

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

-- La vista admin_users include ora anche username e grado_id.
-- DROP + CREATE (non CREATE OR REPLACE): la vista precedente aveva le
-- colonne in un ordine diverso e Postgres non permette di riordinarle
-- con REPLACE, solo di aggiungerne in coda.
drop view if exists semmen.admin_users;
create view semmen.admin_users as
  select id, email, username, full_name, role, grado_id, created_at from semmen.profiles;

grant select on semmen.admin_users to authenticated;

-- Aggiorna il trigger di registrazione per salvare anche lo username
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
-- RISTRUTTURA DISCEPOLI: da grado/simbolo testuali a FK su `gradi`,
-- + FK opzionale verso l'utente registrato (nome dinamico)
-- ============================================================
alter table semmen.discepoli add column if not exists grado_id uuid references semmen.gradi (id);
-- Riferimento a semmen.profiles (non auth.users): serve perché Supabase
-- possa fare il join automatico (`discepoli(...).select('profiles(...)')`)
-- solo tra tabelle esposte nello stesso schema.
alter table semmen.discepoli add column if not exists user_id  uuid references semmen.profiles (id) on delete set null;

-- Backfill: associa ogni riga discepoli esistente al grado con lo stesso nome
update semmen.discepoli d
set grado_id = g.id
from semmen.gradi g
where d.grado_id is null and d.grado = g.nome;

-- Le righe rimaste senza corrispondenza esatta finiscono in "Candidato"
-- (grado provvisorio), così restano visibili invece di sparire.
update semmen.discepoli d
set grado_id = (select id from semmen.gradi where nome = 'Candidato')
where d.grado_id is null;

alter table semmen.discepoli alter column grado_id set not null;

-- Le vecchie colonne testuali non servono più: grado/simbolo/ordine
-- arrivano ora da semmen.gradi tramite grado_id.
alter table semmen.discepoli drop column if exists grado;
alter table semmen.discepoli drop column if exists simbolo;
alter table semmen.discepoli drop column if exists ordine;
