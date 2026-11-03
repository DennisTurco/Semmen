-- ============================================================
-- Migrazione 010 — Inviti, galleria eventi, sondaggi, punti e gradi
-- ============================================================
-- Da eseguire UNA VOLTA nel SQL Editor, DOPO 009_prodotti_shop.sql.
-- Si può rieseguire senza danni.
--
--  1) Inviti: ogni profilo ricorda chi lo ha invitato (link personale
--     registrati.html?invito=username, correggibile dall'Admin).
--  2) Galleria: foto degli eventi caricate dai Compagni+ (bucket privato).
--  3) Sondaggi: creati dagli Editor, votati una volta dai Compagni+,
--     risultati visibili alla chiusura.
--  4) Punti: calcolati dalle azioni (eventi, Archivio, attività, inviti,
--     foto, voti). Quando un membro ha i punti per un grado, il Pannello
--     lo propone all'Admin, che conferma.
-- ============================================================

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
