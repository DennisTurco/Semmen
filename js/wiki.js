/**
 * wiki.js — logica della wiki con protezione per-pagina
 * Contenuti incorporati direttamente (no fetch) per compatibilità file://
 */

/* ── Elementi DOM ───────────────────────────────────────────── */
const overlay     = document.getElementById('pw-overlay');
const pwInput     = document.getElementById('pw-input');
const pwBtn       = document.getElementById('pw-submit');
const pwError     = document.getElementById('pw-error');
const sidebarNav  = document.getElementById('wiki-nav');
const wikiMain    = document.getElementById('wiki-main');
const wikiTitle   = document.getElementById('wiki-page-title');
const wikiMeta    = document.getElementById('wiki-page-meta');
const wikiBody    = document.getElementById('wiki-body');

const SESSION_KEY = 'semmen_wiki_auth';
let pendingPage   = null;

/* ── Manifest ───────────────────────────────────────────────── */
const WIKI_MANIFEST = {
  groups: [
    {
      label: "Indice",
      pages: [
        { id: "index", title: "Benvenuto nell'Archivio" }
      ]
    },
    {
      label: "La Setta",
      pages: [
        { id: "storia",    title: "Storia della Setta",  protected: true },
        { id: "gerarchia", title: "Gerarchia Interna",    protected: true, badge: "NUOVO" }
      ]
    },
    {
      label: "Glossario",
      pages: [
        { id: "dizionario",       title: "Dizionario Interno" },
        { id: "meme",             title: "Meme", protected: true},
        { id: "stadi-del-semmen", title: "Stadi di estrazione del Semmen" }
      ]
    },
    {
      label: "Guide",
      pages: [
        { id: "come-aggiungere-pagine", title: "Come Aggiungere Pagine" }
      ]
    }
  ]
};

/* ── Contenuti pagine (aggiorna qui quando modifichi i .md) ─── */
const WIKI_PAGES = {

"index": `---
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
> — Detto interno della Setta`,

"storia": `---
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

> *"..."*`,

"gerarchia": `---
title: Gerarchia Interna
category: La Setta
classification: RISERVATO
author: Consiglio dei Grandi Maestri
---

# Gerarchia Interna della Setta

La Setta del Semmen è governata da una struttura gerarchica rigorosa,
ispirata alle grandi confraternite della storia e a un episodio di anime mai finito.

---

## I Gradi dell'Ordine

### ✦✦✦✦✦ Ahckmed, Creatore del Semmen

*Grado I — Massimo. Uno solo per generazione.*

Colui che ha fondato la Setta.

**Privilegi:** può nominare e destituire senza preavviso, ha sempre ragione anche quando ha torto, può condividere meme di qualsiasi qualità.

---

### ✦✦✦✦ Grande Anziano

*Grado II — Massimo 3.*

Membri fondatori o di lunghissima data. Custodiscono la memoria storica
e intervengono nelle dispute teologiche più gravi.

**Privilegi:** possono richiamare all'ordine chiunque.

---

### ✦✦✦ Arconte del Semmen

*Grado III — Nominato dal gruppo.*

Responsabile della qualità dei contenuti condivisi nei canali ufficiali.
Ha il potere di ammonire i membri.

**Privilegi:** Ha l'onore di custodire il sacro sapere. Deve prendere parte ai convivi del Semmen. E memare il più possibile.

---

### ✦✦✦ Menarca del Semmen

*Grado III — Nominato dal gruppo. Ruolo parallelo al Custode.*

Colui che è almeno a livello Chiurpy. Dopo un grande periodo di astinenza cerca di arrivare allo stadio supremo, **Brodo Primordiale**.

**Privilegi:** È supportato nel suo intento da tutti i membri. Gli si perdona quasi tutto, a patto che Ahckmed intervenga.

---

### ✦✦ Controllore del Semmen

*Grado IV — Nominato dal gruppo.*

È un umile controllore.

**Privilegi:** Ha l'onore di attestare gli stadi altrui del Semmen.

---

### ✦✦ Apprendista del Semmen

*Grado IV — Nominato dal gruppo.*

È un semplice apprendista, ancora in fase di formazione.

**Privilegi:** È già tanto che è nel gruppo. Può prendere parte ai convivi del Semmen.

---

### ✦ Sacerdotessa del Semmen

*Grado V — Meretrice del membro del Semmen*

Questa carica viene assegnata automaticamente alle levatrici dei membri del Semmen.
Ad esse va il messimo rispetto e la massima devozione, sono responsabili dell'estrazione del Semmen di noi membri.

---

### ✦ Adepto del Semmen

*Grado V — Membro standard.*

Membro regolare della Setta, superato il rito di iniziazione.

---

### ◯ Candidato

*Grado provvisorio.*

Colui che ha presentato candidatura e attende il verdetto.
Accesso limitato. Nessun diritto di voto. Nessuna colpa se rifiutato.

---

## Promozione di Grado

La promozione avviene per:

- **Merito** — contributo eccezionale alla cultura della Setta
- **Anzianità** — sopravvivenza prolungata senza venire scomunicato
- **Pagamento delle indulgenze** — è possibile pagare per aumentare il proprio grado all'interno dell'ordine, un po come succede per i pay to win.
- **Capriccio del Ahckmed**
- **Attraverso richiesta esplicita** — possibile presentare richiesta che verrà poi messa a votazione da tutto l'ordine.

---

## Destituzione

La destituzione avviene per:

- Violazione del Regolamento Sacro
- Attraverso richiesta di uno o più membri

---

> *"Il grado non fa il membro. Ma aiuta."*`,

"dizionario": `---
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

> *"Una Setta senza vocabolario è solo un gruppo WhatsApp con pretese."*`,

"meme": `---
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

...`,

"stadi-del-semmen": `---
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
9. **Brodo primordiale** - dai 5 anni e oltre *(stato supremo, voglia di dolce, nirvana)*`,

"come-aggiungere-pagine": `---
title: Come Aggiungere Pagine alla Wiki
category: Guide
classification: INTERNO
author: Amministrazione Tecnica
---

# Come Aggiungere Pagine alla Wiki

Guida per i Custodi del Meme che vogliono contribuire all'Archivio.

---

## Struttura dei File

Ogni pagina della wiki corrisponde a una voce nell'oggetto \`WIKI_PAGES\` in \`js/wiki.js\`.

---

## Passo 1 — Aggiungi il contenuto

Apri \`js/wiki.js\` e aggiungi una nuova chiave all'oggetto \`WIKI_PAGES\`:

\`\`\`js
"nome-pagina": \`---
title: Titolo della Pagina
category: Nome Categoria
classification: RISERVATO
author: Il Tuo Nome
---

# Titolo della Pagina

Contenuto in markdown...
\`,
\`\`\`

---

## Passo 2 — Aggiungi al manifest

Sempre in \`js/wiki.js\`, aggiungi la pagina al gruppo corretto in \`WIKI_MANIFEST\`:

\`\`\`js
{ id: "nome-pagina", title: "Titolo Visibile nella Sidebar" }
\`\`\`

Aggiungi \`protected: true\` per richiedere la password.

---

## Markdown Supportato

La wiki supporta il Markdown standard (GFM): titoli, grassetto, corsivo, tabelle, liste, citazioni, codice.

---

> *"Se hai dubbi, chiedi al Ahckmed, Creatore del Semmen."*`

};

/* ── Auth ───────────────────────────────────────────────────── */
function isAuthenticated() {
  return sessionStorage.getItem(SESSION_KEY) === 'ok';
}

function authenticate(password) {
  if (password === CONFIG.wiki.password) {
    sessionStorage.setItem(SESSION_KEY, 'ok');
    return true;
  }
  return false;
}

/* ── Inizializzazione ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  wikiMain.classList.remove('hidden');
  manifest = WIKI_MANIFEST;
  renderSidebar();
  handleRoute();

  pwInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  pwBtn.addEventListener('click', handleLogin);
});

function handleLogin() {
  const val = pwInput.value.trim();
  if (!val) {
    showError('Il Codice non può essere vuoto.');
    return;
  }
  if (authenticate(val)) {
    overlay.classList.add('hidden');
    pwInput.value = '';
    if (pendingPage) {
      loadPage(pendingPage);
      pendingPage = null;
    }
  } else {
    showError('Codice errato. Accesso negato.');
    pwInput.value = '';
    pwInput.focus();
    pwInput.classList.add('shake');
    setTimeout(() => pwInput.classList.remove('shake'), 500);
  }
}

function showError(msg) {
  pwError.textContent = msg;
  setTimeout(() => { pwError.textContent = ''; }, 3000);
}

/* ── Manifest ───────────────────────────────────────────────── */
let manifest = null;

function isProtectedPage(pageId) {
  for (const group of (manifest.groups || [])) {
    for (const page of (group.pages || [])) {
      if (page.id === pageId) return !!page.protected;
    }
  }
  return false;
}

function renderSidebar() {
  const groups = manifest.groups || [];
  sidebarNav.innerHTML = groups.map(group => `
    <div class="wiki-sidebar__section">
      <div class="wiki-sidebar__label">${group.label}</div>
      ${group.pages.map(page => `
        <a href="#${page.id}" class="wiki-sidebar__item" data-page="${page.id}">
          ${page.title}
          ${page.badge    ? `<span class="wiki-sidebar__item-badge">${page.badge}</span>` : ''}
          ${page.protected ? `<span class="wiki-sidebar__item-lock">🔒</span>` : ''}
        </a>
      `).join('')}
    </div>
  `).join('');

  sidebarNav.querySelectorAll('.wiki-sidebar__item').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      location.hash = a.dataset.page;
    });
  });
}

/* ── Routing ────────────────────────────────────────────────── */
function handleRoute() {
  const hash = location.hash.replace('#', '') || 'index';

  if (isProtectedPage(hash) && !isAuthenticated()) {
    pendingPage = hash;
    overlay.classList.remove('hidden');
    setTimeout(() => pwInput.focus(), 50);
    return;
  }

  loadPage(hash);
}

window.addEventListener('hashchange', handleRoute);

/* ── Carica pagina ──────────────────────────────────────────── */
function loadPage(pageId) {
  document.querySelectorAll('.wiki-sidebar__item').forEach(a => {
    a.classList.toggle('active', a.dataset.page === pageId);
  });

  const raw = WIKI_PAGES[pageId];

  if (!raw) {
    wikiBody.innerHTML = `
      <div class="alert alert--error">
        <strong>Documento non trovato:</strong> <code>${pageId}</code>
      </div>`;
    if (wikiTitle) wikiTitle.textContent = '';
    if (wikiMeta)  wikiMeta.innerHTML   = '';
    return;
  }

  renderPage(pageId, raw);
}

/* ── Rendering markdown ─────────────────────────────────────── */
function renderPage(pageId, rawMd) {
  let md = rawMd;
  let meta = {};

  const frontmatterMatch = rawMd.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (frontmatterMatch) {
    frontmatterMatch[1].split('\n').forEach(line => {
      const [k, ...v] = line.split(':');
      if (k) meta[k.trim()] = v.join(':').trim();
    });
    md = frontmatterMatch[2];
  }

  const h1Match = md.match(/^#\s+(.+)$/m);
  const title = meta.title || (h1Match ? h1Match[1] : pageId);

  if (wikiTitle) wikiTitle.textContent = title;
  document.title = `${title} — Wiki Semmen`;

  if (wikiMeta) {
    wikiMeta.innerHTML = `
      <div class="wiki-breadcrumb">Archivio<span>›</span>${title}</div>
      <div class="wiki-meta">
        ${meta.category       ? `<span class="wiki-meta__badge"><span class="dot"></span>${meta.category}</span>` : ''}
        ${meta.classification ? `<span>Classif: ${meta.classification}</span>` : ''}
        ${meta.author         ? `<span>Redatto da: ${meta.author}</span>` : ''}
      </div>`;
  }

  if (h1Match) md = md.replace(/^#\s+.+$/m, '').trim();

  wikiBody.innerHTML = marked.parse(md, { gfm: true, breaks: false });
  wikiBody.scrollTop = 0;
  window.scrollTo(0, 0);
}
