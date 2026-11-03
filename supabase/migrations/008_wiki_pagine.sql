-- ============================================================
-- Migrazione 008 — Pagine dell'Archivio su Supabase + editor
-- ============================================================
-- Da eseguire UNA VOLTA nel SQL Editor, DOPO 007_discepoli_solo_compagno.sql.
--
-- Sposta le pagine della wiki da js/wiki.js alla tabella
-- semmen.wiki_pagine, modificabile da Editor/Admin direttamente in
-- wiki.html, con cronologia delle versioni in semmen.wiki_revisioni.
-- Le pagine riservate ora sono protette dal database: prima il loro
-- testo era scritto nel JS e chiunque poteva leggerlo dal sorgente.
-- ============================================================

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

-- ── Contenuti iniziali (le pagine che erano in js/wiki.js) ───────
-- "on conflict do nothing": rieseguire il file non sovrascrive le
-- modifiche fatte dall'editor. La pagina "gerarchia" resta generata
-- dalla tabella gradi, il suo contenuto qui è vuoto. I chr(13) vengono
-- tolti perché su Windows questo file può avere a capo CRLF.
insert into semmen.wiki_pagine (slug, titolo, gruppo, ordine, protetta, badge, contenuto)
select slug, titolo, gruppo, ordine, protetta, badge, replace(contenuto, chr(13), '')
from (values
  ('index', 'Benvenuto nell''Archivio', 'Indice', 10, false, null,
   $wiki$---
title: Archivio della Setta del Semmen
category: Indice
classification: RISERVATO
---

# Archivio della Setta del Semmen

Benvenuto nell'Archivio Ufficiale dell'Ordine Arcano dei Portatori del Meme.

Questo documento è classificato. Se sei qui, sei stato ritenuto degno di accedere
alla conoscenza custodita dalla Setta del Semmen.

---

## Come Navigare l'Archivio

Usa il pannello laterale sinistro per navigare tra le sezioni. I documenti sono organizzati in:

- **La Setta** — storia, gerarchia
- **Glossario** — dizionario, meme, stadi del semmen
- **Guide** — documentazione tecnica per i contributori

---

## Documenti Essenziali

Per i nuovi iniziati, si consiglia di leggere nell'ordine:

1. [Storia della Setta](#storia) — comprendere le origini
2. [Gerarchia Interna](#gerarchia) — conoscere il proprio posto nell'Ordine
3. [Dizionario Interno](#dizionario) — parlare la lingua della Setta
4. [Stadi di estrazione del Semmen](#stadi-del-semmen) — tutti gli stadi di estrazione
5. [Meme](#meme) — tutti i meme interni catalogati

---

> *"La conoscenza del meme è la vera forma di saggezza."*
> — Detto interno della Setta$wiki$),
  ('storia', 'Storia della Setta', 'La Setta', 20, true, null,
   $wiki$---
title: Storia della Setta
category: La Setta
classification: CLASSIFICATO
author: Il Ahckmed, Creatore del Semmen Fondatore
---

# Storia della Setta del Semmen

...

---

## Cronologia Ufficiale

| Anno | Evento |
|------|--------|


---

> *"..."*$wiki$),
  ('gerarchia', 'Gerarchia Interna', 'La Setta', 30, false, 'NUOVO',
   $wiki$$wiki$),
  ('dizionario', 'Dizionario Interno', 'Glossario', 40, false, null,
   $wiki$---
title: Dizionario Interno
category: Glossario
classification: RISERVATO
author: Ahhckmed, Creatore del Semmen
---

# Dizionario Interno della Setta

Glossario dei termini, slang e riferimenti usati nei canali interni.
Aggiornato continuamente dai Custodi del Semmen.

---

## Come Usare Questo Dizionario

Ogni voce segue il formato:

**TERMINE** *(origine)*
Definizione e contesto d'uso.

---

## A

**ARCHIVIO**
Questo sito. Usato in senso reverenziale. "L'ho messo sull'Archivio" significa che
qualcosa è abbastanza importante da essere documentato ufficialmente.

---

## G

**Ahckmed, Creatore del Semmen**
Il leader della Setta. Termine usato sia in modo serio che ironico,
spesso contemporaneamente.

---

## S

**SEMMEN**
Il nome della Setta. L'origine del termine è classificata al livello più alto.
I nuovi membri scoprono la verità al momento dell'iniziazione completa.

*(Nota per i nuovi iniziati: È esattamente quello che sembra)*

---

> *"Una Setta senza vocabolario è solo un gruppo WhatsApp con pretese."*$wiki$),
  ('meme', 'Meme', 'Glossario', 50, true, null,
   $wiki$---
title: Meme
category: Glossario
classification: RISERVATO
author: Ahhckmed, Creatore del Semmen
---

# Meme

Vengono qui raccolti tutti i meme interni e ne viene spiegata la storia.

## Setta Pinderiana

![womwomwom](img/womwomwom.jpeg)

## Messieur Prosciuttong

![Messieur Prosciuttong](img/messieur-prosciuttong.jpeg)

## Il Druido del Prosciutto

![Druido del Prosciutto](img/druido-del-prosciutto.jpeg)

## AHCKHMED

...

## Baia Sburro Pizza

![Baia Sburro Pizza](img/baia-sburro-pizza.jpeg)

## Sto Arrivando Pezzi di Merda

![Sto Arrivando Pezzi di Merda](img/arrivo-pezzi-di-merda.jpeg)

...$wiki$),
  ('stadi-del-semmen', 'Stadi di estrazione del Semmen', 'Glossario', 60, false, null,
   $wiki$---
title: Stadi del Semmen
category: Glossario
classification: RISERVATO
author: Ahhckmed, Creatore del Semmen
---

# Stadi del Semmen

Di seguito vengono elencati gli stadi della via lattea, estrazione del Semmen:

1. **Latte di Bufala** (latte della pizza di Marco) - se estratto entro 24 ore
2. **Latte** - se estratto entro 7 giorni
3. **Yogurt** - dai 7 ai 14 giorni
4. **Stracchino** - dai 14 ai 28 giorni
5. **Tofu** - dai 28 ai 104 giorni
6. **Parmigiano 18 mesi** - dai 104 ai 365 giorni
7. **Parmigiano 24 mesi** - da 1 anno a 1 anno e mezzo
8. **Churpi** - da 1 anno e mezzo a 5 anni
9. **Brodo primordiale** - dai 5 anni e oltre *(stato supremo, voglia di dolce, nirvana)*$wiki$),
  ('come-aggiungere-pagine', 'Come Aggiungere Pagine', 'Guide', 70, false, null,
   $wiki$---
title: Come Aggiungere Pagine alla Wiki
category: Guide
classification: INTERNO
author: Amministrazione Tecnica
---

# Come Aggiungere Pagine alla Wiki

Guida per i Custodi del Meme che vogliono contribuire all'Archivio.

---

## Chi può scrivere

Solo i membri con ruolo **Editor** o **Admin**. Dopo l'accesso, in cima a ogni documento compaiono i pulsanti **Modifica** e **Nuova pagina**.

---

## Creare una pagina

1. Premi **Nuova pagina**.
2. Compila il **Titolo**: l'identificativo (la parte dopo `#` nell'indirizzo) si genera da solo, ma puoi cambiarlo. Dopo il primo salvataggio non è più modificabile.
3. Scegli il **Gruppo** della barra laterale (scrivine uno nuovo per creare una sezione) e l'**Ordine**: i numeri più bassi vengono prima.
4. Spunta **Riservata** se il documento deve essere visibile solo dal grado di Compagno in su.
5. Scrivi il contenuto in Markdown e controlla l'anteprima a destra, poi premi **Salva**.

---

## L'intestazione del documento

Le righe tra i due `---` all'inizio del testo sono facoltative e compaiono sotto il titolo:

```
---
category: Nome Categoria
classification: RISERVATO
author: Il Tuo Nome
---
```

---

## Cronologia

Ogni salvataggio conserva la versione precedente. Dall'editor, in **Cronologia**, puoi caricare una versione passata nel testo e salvarla di nuovo per ripristinarla. Anche una pagina eliminata resta nella cronologia del database.

---

## Markdown Supportato

La wiki supporta il Markdown standard (GFM): titoli, grassetto, corsivo, tabelle, liste, citazioni, codice. Scorciatoie: **Ctrl+B** grassetto, **Ctrl+I** corsivo, **Ctrl+S** salva.

---

> *"Se hai dubbi, chiedi al Ahckmed, Creatore del Semmen."*$wiki$)
) as v (slug, titolo, gruppo, ordine, protetta, badge, contenuto)
on conflict (slug) do nothing;
