---
title: Come Aggiungere Pagine alla Wiki
category: Guide
classification: INTERNO
author: Amministrazione Tecnica
---

# Come Aggiungere Pagine alla Wiki

Guida per i Custodi del Meme che vogliono contribuire all'Archivio.

---

## Struttura dei File

Ogni pagina della wiki è un file `.md` (Markdown) nella cartella `wiki/`.

```
wiki/
├── manifest.json       ← indice delle pagine
├── index.md            ← pagina principale
├── storia.md           ← esempio
└── tua-nuova-pagina.md ← aggiungi qui
```

---

## Passo 1 — Crea il file Markdown

Crea un nuovo file in `wiki/nome-pagina.md`. Usa kebab-case per il nome
(parole separate da trattini, tutto minuscolo).

Struttura consigliata con frontmatter:

```markdown
---
title: Titolo della Pagina
category: Nome Categoria
classification: RISERVATO
author: Il Tuo Nome
---

# Titolo della Pagina

Contenuto...
```

Il frontmatter (tra i `---`) è opzionale ma consigliato.

---

## Passo 2 — Aggiorna manifest.json

Apri `wiki/manifest.json` e aggiungi la tua pagina al gruppo corretto:

```json
{
  "id": "nome-pagina",
  "title": "Titolo Visibile nella Sidebar",
  "description": "Descrizione breve",
  "badge": "NUOVO"
}
```

Il campo `badge` è opzionale — appare come etichetta nella sidebar.

---

## Markdown Supportato

La wiki supporta il Markdown standard (GFM):

```markdown
# H1 — Titolo pagina
## H2 — Sezione
### H3 — Sottosezione

**grassetto**  *corsivo*  `codice inline`

> Citazione

- Lista puntata
1. Lista numerata

| Colonna 1 | Colonna 2 |
|-----------|-----------|
| cella     | cella     |

![Alt testo](../img/immagine.png)
[Link testo](https://url.com)
```

---

## Aggiungere Immagini

1. Metti l'immagine nella cartella `img/`
2. Riferiscila nel markdown: `![Descrizione](../img/nome.png)`

---

## Aggiungere Gruppi alla Sidebar

Nel `manifest.json`, aggiungi un nuovo gruppo:

```json
{
  "label": "Nome Gruppo",
  "pages": [
    { "id": "pagina1", "title": "Titolo 1" },
    { "id": "pagina2", "title": "Titolo 2" }
  ]
}
```

---

> *Se hai dubbi, chiedi al Gran Maestro. Se il Gran Maestro non risponde, fai di testa tua.*
