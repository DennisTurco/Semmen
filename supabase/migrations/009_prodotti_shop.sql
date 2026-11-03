-- ============================================================
-- Migrazione 009 — Catalogo dello Shop gestito dal Pannello
-- ============================================================
-- Da eseguire UNA VOLTA nel SQL Editor, DOPO 008_wiki_pagine.sql.
--
-- Sposta i prodotti da shop.html alla tabella semmen.prodotti,
-- modificabile da Editor/Admin nella tab Prodotti del Pannello, con
-- un bucket dedicato per le immagini.
-- ============================================================

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

-- ── Prodotti iniziali (quelli che erano scritti in shop.html) ────
-- Inseriti solo se il catalogo è vuoto: rieseguire il file non
-- duplica nulla e non tocca le modifiche fatte dal Pannello.
insert into semmen.prodotti (nome, descrizione, prezzo, immagine, icona, disponibile, ordine)
select * from (values
  ('Tappo Pene',
   'È un tappo pene. Si può montare sulle bottiglie delle bibite. Permette la fuoriuscita del liquido dalla punta. Articolo stampato con filamenti Semmici allo stato Tofu',
   '4€', 'img/shop/pene-tappo.jpeg', null, true, 10),
  ('T-Shirt del Semmen',
   'Indossa il sigillo della Setta con orgoglio. Cotone sacro al 100% imbevuto di Semmen allo stato Tofu.',
   'TBD', null, '👕', false, 20),
  ('Indulgenza',
   'Indulgenza ufficiale del Sacro Ordine del Semmen prodotta da fratello Giorgio.',
   'TBD', null, '🖨️', false, 30),
  ('Amuleto del Semmen',
   'Non è un semplice portachiavi, è una reliquia protettiva per i fedeli. Allontana gli eretici. Stampata in 3d sicuramente non dalla stampante del fratello Fra. Vengono usati filamenti Semmici allo stato Tofu',
   'TBD', null, '📿', false, 40)
) as v (nome, descrizione, prezzo, immagine, icona, disponibile, ordine)
where not exists (select 1 from semmen.prodotti);
