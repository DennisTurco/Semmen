-- ============================================================
-- Migrazione 006 — Organizzatore evento (storico) + Bacheca Attività
-- ============================================================
-- Da eseguire UNA VOLTA nel SQL Editor, DOPO 005_partecipanti_evento.sql.
-- ============================================================

-- ── 1) Storico organizzatore evento ─────────────────────────────
-- Chi crea l'evento viene registrato automaticamente (vedi js/pannello.js,
-- che imposta organizzatore_id = auth.uid() solo in fase di creazione,
-- mai in modifica, per mantenere lo storico di chi lo ha originato).
alter table semmen.eventi
  add column if not exists organizzatore_id uuid references semmen.profiles (id) on delete set null;

-- ── 2) Directory utenti leggibile da Compagno+ (non solo Editor/Admin) ──
-- Espone solo id + nome visualizzato (mai email/ruolo), sullo stesso
-- modello di semmen.directory_utenti() (che resta riservata a
-- Editor/Admin per il collegamento Discepoli). Usata per risolvere il
-- nome dell'organizzatore evento e per l'assegnazione delle Attività.
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

-- ── 3) TABELLA ATTIVITA (bacheca kanban semplificata) ───────────
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

-- Compagno/Editor/Admin vedono tutta la bacheca (lavoro condiviso)
drop policy if exists attivita_select on semmen.attivita;
create policy attivita_select on semmen.attivita
  for select using (semmen.is_compagno_or_above());

-- Solo Compagno+ può creare attività, e solo a proprio nome (creato_da)
drop policy if exists attivita_insert on semmen.attivita;
create policy attivita_insert on semmen.attivita
  for insert with check (semmen.is_compagno_or_above() and creato_da = auth.uid());

-- Qualsiasi Compagno+ può aggiornare qualunque attività (spostarla di
-- colonna, riassegnarla, modificarne il testo): bacheca collaborativa,
-- non un sistema di permessi granulari per singola attività.
drop policy if exists attivita_update on semmen.attivita;
create policy attivita_update on semmen.attivita
  for update using (semmen.is_compagno_or_above()) with check (semmen.is_compagno_or_above());

-- L'eliminazione resta più ristretta: solo chi l'ha creata, oppure Editor/Admin
drop policy if exists attivita_delete on semmen.attivita;
create policy attivita_delete on semmen.attivita
  for delete using (creato_da = auth.uid() or semmen.is_editor_or_admin());
