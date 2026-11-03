/**
 * wiki.js — Archivio: pagine lette da Supabase (semmen.wiki_pagine) ed
 * editor per Editor/Admin. Le pagine riservate sono protette dalla RLS:
 * il loro contenuto non arriva al browser di chi non è almeno Compagno.
 */

/* ── Elementi DOM ───────────────────────────────────────────── */
const overlay     = document.getElementById('pw-overlay');
const sidebarNav  = document.getElementById('wiki-nav');
const wikiMain    = document.getElementById('wiki-main');
const wikiContent = document.getElementById('wiki-content');
const wikiView    = document.getElementById('wiki-view');
const wikiTitle   = document.getElementById('wiki-page-title');
const wikiMeta    = document.getElementById('wiki-page-meta');
const wikiBody    = document.getElementById('wiki-body');
const wikiToolbar = document.getElementById('wiki-toolbar');

const editor = {
  root:       document.getElementById('wiki-editor'),
  form:       document.getElementById('wiki-editor-form'),
  heading:    document.getElementById('wiki-editor-heading'),
  slug:       document.getElementById('wiki-ed-slug'),
  titolo:     document.getElementById('wiki-ed-titolo'),
  gruppo:     document.getElementById('wiki-ed-gruppo'),
  gruppi:     document.getElementById('wiki-ed-gruppi'),
  ordine:     document.getElementById('wiki-ed-ordine'),
  badge:      document.getElementById('wiki-ed-badge'),
  protetta:   document.getElementById('wiki-ed-protetta'),
  contenuto:  document.getElementById('wiki-ed-contenuto'),
  hint:       document.getElementById('wiki-ed-hint'),
  preview:    document.getElementById('wiki-ed-preview'),
  revisioni:  document.getElementById('wiki-ed-revisioni'),
  revCarica:  document.getElementById('wiki-ed-rev-carica'),
  revWrap:    document.getElementById('wiki-ed-rev-wrap'),
  error:      document.getElementById('wiki-ed-error'),
  salva:      document.getElementById('wiki-ed-salva'),
  annulla:    document.getElementById('wiki-ed-annulla'),
  elimina:    document.getElementById('wiki-ed-elimina'),
};

/* ── Stato ──────────────────────────────────────────────────── */
let indice      = [];     // righe di semmen.wiki_indice() (senza contenuto)
let currentPage = null;   // riga completa della pagina aperta
let profile     = null;
let canEdit     = false;
let editing     = null;   // { isNew, hash } mentre l'editor è aperto
let dirty       = false;

// Pagine il cui testo è generato da altre tabelle invece che scritto a mano
const GENERATED_PAGES = { gerarchia: buildGerarchiaMarkdown };
// "index" è la pagina di default, "gerarchia" dipende dai Gradi
const NON_ELIMINABILI = ['index', 'gerarchia'];

/* ── Auth ───────────────────────────────────────────────────── */
// Una pagina "protetta" richiede login + grado ≥ Compagno (ruoli
// compagno/editor/admin). Qui serve solo per mostrare l'overlay: il
// blocco vero lo fa la policy wiki_pagine_select.
function isAllowed() {
  return !!profile && profile.role !== 'utente';
}

/* ── Inizializzazione ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  wikiMain.classList.remove('hidden');

  if (!SemmenAuth.configured) {
    showUnavailable('Supabase non è ancora configurato per questo sito.');
    return;
  }

  profile = await SemmenAuth.getProfile();
  canEdit = !!profile && (profile.role === 'admin' || profile.role === 'editor');

  if (!(await loadIndice())) {
    showUnavailable('Impossibile caricare l\'indice. Se sei l\'amministratore, esegui supabase/migrations/008_wiki_pagine.sql.');
    return;
  }

  renderSidebar();
  bindEditor();
  handleRoute();
});

function showUnavailable(msg) {
  sidebarNav.innerHTML = '';
  wikiBody.innerHTML = `
    <div class="alert alert--error">
      <strong>Archivio non disponibile.</strong> ${escapeHtml(msg)}
    </div>`;
}

/* ── Indice ─────────────────────────────────────────────────── */
async function loadIndice() {
  const { data, error } = await SemmenAuth.db().rpc('wiki_indice');
  if (error) { console.error('[wiki] indice:', error); return false; }
  indice = data || [];
  return true;
}

function findIndice(slug) {
  return indice.find(p => p.slug === slug);
}

// I gruppi compaiono nell'ordine della loro prima pagina
function groupIndice() {
  const groups = [];
  indice.forEach(p => {
    let g = groups.find(x => x.label === p.gruppo);
    if (!g) groups.push(g = { label: p.gruppo, pages: [] });
    g.pages.push(p);
  });
  return groups;
}

function renderSidebar() {
  const groups = groupIndice();
  sidebarNav.innerHTML = groups.map(group => `
    <div class="wiki-sidebar__section">
      <div class="wiki-sidebar__label">${escapeHtml(group.label)}</div>
      ${group.pages.map(page => `
        <a href="#${page.slug}" class="wiki-sidebar__item" data-page="${page.slug}">
          ${escapeHtml(page.titolo)}
          ${page.badge    ? `<span class="wiki-sidebar__item-badge">${escapeHtml(page.badge)}</span>` : ''}
          ${page.protetta ? `<span class="wiki-sidebar__item-lock">🔒</span>` : ''}
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

  editor.gruppi.innerHTML = groups.map(g => `<option value="${escapeHtml(g.label)}"></option>`).join('');
}

/* ── Routing ────────────────────────────────────────────────── */
async function handleRoute() {
  const hash = location.hash.replace('#', '') || 'index';

  if (editing) {
    if (!confirmDiscard()) {
      history.replaceState(null, '', editing.hash || location.pathname);
      return;
    }
    closeEditor();
  }

  if (findIndice(hash)?.protetta && !isAllowed()) {
    overlay.classList.remove('hidden');
    return;
  }

  overlay.classList.add('hidden');
  loadPage(hash);
}

window.addEventListener('hashchange', handleRoute);

/* ── Carica pagina ──────────────────────────────────────────── */
async function loadPage(pageId) {
  document.querySelectorAll('.wiki-sidebar__item').forEach(a => {
    a.classList.toggle('active', a.dataset.page === pageId);
  });

  const { data, error } = await SemmenAuth.db()
    .from('wiki_pagine')
    .select('*')
    .eq('slug', pageId)
    .maybeSingle();

  currentPage = data || null;
  renderToolbar();

  if (error || !data) {
    if (error) console.error('[wiki] pagina:', error);
    wikiBody.innerHTML = `
      <div class="alert alert--error">
        <strong>Documento non trovato:</strong> <code>${escapeHtml(pageId)}</code>
      </div>`;
    if (wikiTitle) wikiTitle.textContent = '';
    if (wikiMeta)  wikiMeta.innerHTML   = '';
    return;
  }

  // Le pagine generate (es. "gerarchia", dalla tabella `gradi`, fonte
  // unica condivisa con la pagina Discepoli) ripiegano sul testo salvato
  // se la generazione fallisce.
  const generate = GENERATED_PAGES[pageId];
  const md = (generate && await generate()) || data.contenuto;
  renderPage(pageId, md, data.titolo);
}

/* ── Gerarchia dinamica (da Supabase, tabella `gradi`) ───────── */
async function buildGerarchiaMarkdown() {
  if (!SemmenAuth.configured) return null;

  const { data, error } = await SemmenAuth.db()
    .from('gradi')
    .select('*')
    .order('ordine');

  if (error || !data || data.length === 0) return null;

  const sezioni = data.map(g => {
    const righe = [`### ${g.simbolo ? g.simbolo + ' ' : ''}${g.nome}`];
    if (g.descrizione) righe.push('', g.descrizione);
    if (g.privilegi)   righe.push('', `**Privilegi:** ${g.privilegi}`);
    return righe.join('\n');
  });

  return [
    '---',
    'title: Gerarchia Interna',
    'category: La Setta',
    'classification: PUBBLICO',
    'author: Consiglio dei Grandi Maestri',
    '---',
    '',
    '# Gerarchia Interna della Setta',
    '',
    'La Setta del Semmen è governata da una struttura gerarchica rigorosa.',
    '',
    '---',
    '',
    '## I Gradi dell\'Ordine',
    '',
    sezioni.join('\n\n---\n\n'),
  ].join('\n');
}

/* ── Rendering markdown ─────────────────────────────────────── */
function parseDocument(rawMd, fallbackTitle) {
  // Il testo incollato nel SQL Editor può arrivare con a capo Windows
  let md = String(rawMd || '').replace(/\r\n/g, '\n');
  const meta = {};

  const frontmatterMatch = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (frontmatterMatch) {
    frontmatterMatch[1].split('\n').forEach(line => {
      const [k, ...v] = line.split(':');
      if (k) meta[k.trim()] = v.join(':').trim();
    });
    md = frontmatterMatch[2];
  }

  const h1Match = md.match(/^#\s+(.+)$/m);
  const title = meta.title || (h1Match ? h1Match[1] : fallbackTitle);
  if (h1Match) md = md.replace(/^#\s+.+$/m, '').trim();

  return { meta, md, title };
}

// Il Markdown ora lo scrivono gli Editor dal sito: l'HTML prodotto
// passa da DOMPurify prima di finire nella pagina.
function markdownToHtml(md) {
  return DOMPurify.sanitize(marked.parse(md, { gfm: true, breaks: false }));
}

function renderPage(pageId, rawMd, fallbackTitle) {
  const { meta, md, title } = parseDocument(rawMd, fallbackTitle || pageId);

  if (wikiTitle) wikiTitle.textContent = title;
  document.title = `${title} — Wiki Semmen`;

  if (wikiMeta) {
    wikiMeta.innerHTML = `
      <div class="wiki-breadcrumb">Archivio<span>›</span>${escapeHtml(title)}</div>
      <div class="wiki-meta">
        ${meta.category       ? `<span class="wiki-meta__badge"><span class="dot"></span>${escapeHtml(meta.category)}</span>` : ''}
        ${meta.classification ? `<span>Classif: ${escapeHtml(meta.classification)}</span>` : ''}
        ${meta.author         ? `<span>Redatto da: ${escapeHtml(meta.author)}</span>` : ''}
      </div>`;
  }

  wikiBody.innerHTML = markdownToHtml(md);
  wikiBody.scrollTop = 0;
  window.scrollTo(0, 0);
}

/* ── Editor (solo Editor/Admin; la RLS blocca comunque gli altri) ── */
const NEW_PAGE_TEMPLATE = [
  '---',
  'category: ',
  'classification: INTERNO',
  'author: ',
  '---',
  '',
  'Scrivi qui il contenuto in Markdown...',
  '',
].join('\n');

function renderToolbar() {
  wikiToolbar.classList.toggle('hidden', !canEdit);
  document.getElementById('wiki-edit-btn').classList.toggle('hidden', !currentPage);
}

function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function openEditor(page) {
  const isNew = !page;
  editing = { isNew, hash: location.hash };
  dirty = false;

  editor.heading.textContent = isNew ? 'Nuova pagina' : `Modifica: ${page.titolo}`;
  editor.slug.value      = isNew ? '' : page.slug;
  editor.slug.disabled   = !isNew;
  delete editor.slug.dataset.touched;
  editor.titolo.value    = isNew ? '' : page.titolo;
  editor.gruppo.value    = isNew ? (currentPage?.gruppo || '') : page.gruppo;
  editor.ordine.value    = isNew ? Math.max(0, ...indice.map(p => p.ordine)) + 10 : page.ordine;
  editor.badge.value     = isNew ? '' : (page.badge || '');
  editor.protetta.checked = isNew ? false : page.protetta;
  editor.contenuto.value = isNew ? NEW_PAGE_TEMPLATE : page.contenuto;
  editor.error.textContent = '';

  const generated = !isNew && !!GENERATED_PAGES[page.slug];
  editor.contenuto.disabled = generated;
  editor.hint.classList.toggle('hidden', !generated);
  editor.elimina.classList.toggle('hidden', isNew || NON_ELIMINABILI.includes(page.slug));
  editor.revWrap.classList.toggle('hidden', isNew || generated);

  if (generated) editor.preview.innerHTML = wikiBody.innerHTML;
  else updatePreview();
  if (!isNew && !generated) loadRevisioni(page.slug);

  wikiView.classList.add('hidden');
  wikiToolbar.classList.add('hidden');
  wikiContent.classList.add('wiki-content--editing');
  editor.root.classList.remove('hidden');
  (isNew ? editor.titolo : editor.contenuto).focus();
}

function closeEditor() {
  editing = null;
  dirty = false;
  editor.root.classList.add('hidden');
  wikiContent.classList.remove('wiki-content--editing');
  wikiView.classList.remove('hidden');
  renderToolbar();
}

function confirmDiscard() {
  return !dirty || confirm('Ci sono modifiche non salvate. Vuoi scartarle?');
}

let previewTimer = null;
function updatePreview() {
  const { md, title } = parseDocument(editor.contenuto.value, editor.titolo.value);
  editor.preview.innerHTML = `<h1>${escapeHtml(title)}</h1>${markdownToHtml(md)}`;
}

/* Formattazione: avvolge la selezione o aggiunge un prefisso alle righe */
function wrapSelection(before, after, placeholder) {
  const ta = editor.contenuto;
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const text = value.slice(s, e) || placeholder;
  ta.setRangeText(before + text + after, s, e, 'end');
  ta.setSelectionRange(s + before.length, s + before.length + text.length);
  ta.dispatchEvent(new Event('input'));
  ta.focus();
}

function prefixLines(prefix) {
  const ta = editor.contenuto;
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const block = value.slice(lineStart, e);
  ta.setRangeText(block.split('\n').map(l => prefix + l).join('\n'), lineStart, e, 'end');
  ta.dispatchEvent(new Event('input'));
  ta.focus();
}

const FORMATS = {
  bold:   () => wrapSelection('**', '**', 'testo'),
  italic: () => wrapSelection('*', '*', 'testo'),
  h2:     () => prefixLines('## '),
  h3:     () => prefixLines('### '),
  list:   () => prefixLines('- '),
  quote:  () => prefixLines('> '),
  code:   () => wrapSelection('`', '`', 'codice'),
  link:   () => wrapSelection('[', '](https://)', 'testo del link'),
  hr:     () => wrapSelection('\n\n---\n\n', '', ''),
};

async function loadRevisioni(slug) {
  editor.revisioni.innerHTML = '<option value="">Caricamento...</option>';
  const [{ data, error }, { data: utenti }] = await Promise.all([
    SemmenAuth.db()
      .from('wiki_revisioni')
      .select('id, salvata_il, autore_id')
      .eq('slug', slug)
      .order('salvata_il', { ascending: false })
      .limit(30),
    SemmenAuth.db().rpc('utenti_assegnabili'),
  ]);

  if (error) { editor.revisioni.innerHTML = '<option value="">Cronologia non disponibile</option>'; return; }
  if (!data.length) { editor.revisioni.innerHTML = '<option value="">Nessuna versione precedente</option>'; return; }

  const nomi = Object.fromEntries((utenti || []).map(u => [u.id, u.display_name]));
  editor.revisioni.innerHTML = '<option value="">Versioni precedenti...</option>' + data.map(r => {
    const quando = new Date(r.salvata_il).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    const chi = nomi[r.autore_id] ? ` · ${nomi[r.autore_id]}` : '';
    return `<option value="${r.id}">${escapeHtml(quando + chi)}</option>`;
  }).join('');
}

async function caricaRevisione() {
  const id = editor.revisioni.value;
  if (!id) return;
  if (!confirm('Il testo nell\'editor verrà sostituito con questa versione (potrai ancora annullare senza salvare). Continuare?')) return;

  const { data, error } = await SemmenAuth.db()
    .from('wiki_revisioni')
    .select('titolo, contenuto')
    .eq('id', id)
    .single();
  if (error) { editor.error.textContent = error.message; return; }

  editor.titolo.value = data.titolo;
  editor.contenuto.value = data.contenuto;
  dirty = true;
  updatePreview();
  showToast('Versione caricata nell\'editor: premi Salva per ripristinarla.', 'info');
}

async function salva() {
  editor.error.textContent = '';
  const slug = editor.slug.value.trim();
  const row = {
    titolo:    editor.titolo.value.trim(),
    gruppo:    editor.gruppo.value.trim() || 'Varie',
    ordine:    parseInt(editor.ordine.value, 10) || 0,
    badge:     editor.badge.value.trim() || null,
    protetta:  editor.protetta.checked,
    contenuto: editor.contenuto.value,
  };

  if (!row.titolo) { editor.error.textContent = 'Il titolo è obbligatorio.'; return; }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    editor.error.textContent = 'Identificativo non valido: solo lettere minuscole, numeri e trattini.';
    return;
  }
  // Il contenuto delle pagine generate non si tocca da qui
  if (GENERATED_PAGES[slug]) delete row.contenuto;

  editor.salva.disabled = true;
  const query = editing.isNew
    ? SemmenAuth.db().from('wiki_pagine').insert({ slug, ...row })
    : SemmenAuth.db().from('wiki_pagine').update(row).eq('slug', slug);
  const { error } = await query;
  editor.salva.disabled = false;

  if (error) {
    editor.error.textContent = error.code === '23505'
      ? 'Esiste già una pagina con questo identificativo.'
      : error.message;
    return;
  }

  showToast(editing.isNew ? `Pagina "${row.titolo}" creata.` : `Pagina "${row.titolo}" salvata.`);
  await loadIndice();
  renderSidebar();
  closeEditor();
  if (location.hash === `#${slug}`) loadPage(slug);
  else location.hash = slug;
}

async function elimina() {
  const slug = editor.slug.value;
  if (!confirm(`Eliminare la pagina "${editor.titolo.value}"? Resterà recuperabile solo dalla cronologia nel database.`)) return;

  const { error } = await SemmenAuth.db().from('wiki_pagine').delete().eq('slug', slug);
  if (error) { editor.error.textContent = error.message; return; }

  showToast(`Pagina "${editor.titolo.value}" eliminata.`);
  await loadIndice();
  renderSidebar();
  closeEditor();
  location.hash = 'index';
}

function bindEditor() {
  if (!canEdit) return;

  document.getElementById('wiki-edit-btn').addEventListener('click', () => openEditor(currentPage));
  document.getElementById('wiki-new-btn').addEventListener('click', () => openEditor(null));

  editor.form.addEventListener('input', () => { dirty = true; });
  editor.form.addEventListener('submit', e => { e.preventDefault(); salva(); });

  editor.contenuto.addEventListener('input', () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 150);
  });
  editor.titolo.addEventListener('input', () => {
    if (editing?.isNew && !editor.slug.dataset.touched) editor.slug.value = slugify(editor.titolo.value);
  });
  editor.slug.addEventListener('input', () => { editor.slug.dataset.touched = '1'; });

  editor.root.querySelectorAll('[data-format]').forEach(btn => {
    btn.addEventListener('click', () => FORMATS[btn.dataset.format]());
  });

  editor.contenuto.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'b') { e.preventDefault(); FORMATS.bold(); }
    if (key === 'i') { e.preventDefault(); FORMATS.italic(); }
  });
  document.addEventListener('keydown', e => {
    if (editing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      salva();
    }
  });

  editor.revCarica.addEventListener('click', caricaRevisione);
  editor.elimina.addEventListener('click', elimina);
  editor.annulla.addEventListener('click', () => {
    if (confirmDiscard()) closeEditor();
  });

  window.addEventListener('beforeunload', e => {
    if (editing && dirty) e.preventDefault();
  });
}
