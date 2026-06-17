/**
 * wiki.js — logica della wiki protetta da password
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
  if (isAuthenticated()) {
    unlockWiki();
  } else {
    overlay.classList.remove('hidden');
  }

  // Enter key sul campo password
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
    unlockWiki();
  } else {
    showError('Codice errato. Accesso negato.');
    pwInput.value = '';
    pwInput.focus();
    // shake animation
    pwInput.classList.add('shake');
    setTimeout(() => pwInput.classList.remove('shake'), 500);
  }
}

function showError(msg) {
  pwError.textContent = msg;
  setTimeout(() => { pwError.textContent = ''; }, 3000);
}

/* ── Wiki unlock ────────────────────────────────────────────── */
async function unlockWiki() {
  wikiMain.classList.remove('hidden');
  await loadManifest();
  handleRoute();
}

/* ── Manifest ───────────────────────────────────────────────── */
let manifest = null;

async function loadManifest() {
  try {
    const res = await fetch('wiki/manifest.json');
    if (!res.ok) throw new Error('Manifest non trovato');
    manifest = await res.json();
    renderSidebar();
  } catch (err) {
    sidebarNav.innerHTML = `<p style="color:var(--crimson-bright);padding:1rem;font-size:0.85rem;">Errore caricamento indice</p>`;
    console.error('[Wiki] Manifest error:', err);
  }
}

function renderSidebar() {
  if (!manifest) return;

  const groups = manifest.groups || [{ label: 'Pagine', pages: manifest.pages || [] }];

  sidebarNav.innerHTML = groups.map(group => `
    <div class="wiki-sidebar__section">
      <div class="wiki-sidebar__label">${group.label}</div>
      ${group.pages.map(page => `
        <a href="#${page.id}"
           class="wiki-sidebar__item"
           data-page="${page.id}">
          ${page.title}
          ${page.badge ? `<span class="wiki-sidebar__item-badge">${page.badge}</span>` : ''}
        </a>
      `).join('')}
    </div>
  `).join('');

  // Click handlers
  sidebarNav.querySelectorAll('.wiki-sidebar__item').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const pageId = a.dataset.page;
      location.hash = pageId;
    });
  });
}

/* ── Routing ────────────────────────────────────────────────── */
function handleRoute() {
  const hash = location.hash.replace('#', '') || 'index';
  loadPage(hash);
}

window.addEventListener('hashchange', () => {
  if (isAuthenticated()) handleRoute();
});

/* ── Carica pagina markdown ─────────────────────────────────── */
async function loadPage(pageId) {
  // Aggiorna sidebar active state
  document.querySelectorAll('.wiki-sidebar__item').forEach(a => {
    a.classList.toggle('active', a.dataset.page === pageId);
  });

  // Mostra loading
  wikiBody.innerHTML = `
    <div class="loading">
      <div class="loading__spinner"></div>
      <span>Decriptazione documento in corso...</span>
    </div>`;

  if (wikiTitle) wikiTitle.textContent = '';
  if (wikiMeta) wikiMeta.innerHTML = '';

  try {
    const res = await fetch(`wiki/${pageId}.md`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    renderPage(pageId, md);
  } catch (err) {
    if (pageId !== 'index') {
      wikiBody.innerHTML = `
        <div class="alert alert--error">
          <strong>Documento non trovato:</strong> <code>${pageId}.md</code><br>
          <small>Verifica che il file esista nella cartella <code>wiki/</code></small>
        </div>`;
    } else {
      wikiBody.innerHTML = `
        <div class="wiki-placeholder">
          <div class="wiki-placeholder__seal seal-container"></div>
          <p>Nessun documento index trovato.<br>
          Crea <code>wiki/index.md</code> per iniziare.</p>
        </div>`;
      // Re-inject seal
      document.querySelectorAll('.seal-container').forEach(el => {
        if (typeof SEAL_SVG !== 'undefined') {
          el.innerHTML = SEAL_SVG;
          const svg = el.querySelector('svg');
          if (svg) svg.style.color = 'var(--gold)';
        }
      });
    }
    console.error('[Wiki] Page load error:', err);
  }
}

/* ── Rendering markdown ─────────────────────────────────────── */
function renderPage(pageId, rawMd) {
  // Estrai metadati frontmatter (--- ... ---)
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

  // Estrai H1 per il titolo
  const h1Match = md.match(/^#\s+(.+)$/m);
  const title = meta.title || (h1Match ? h1Match[1] : pageId);

  if (wikiTitle) wikiTitle.textContent = title;
  document.title = `${title} — Wiki Semmen`;

  // Breadcrumb + meta
  if (wikiMeta) {
    wikiMeta.innerHTML = `
      <div class="wiki-breadcrumb">
        Archivio<span>›</span>${title}
      </div>
      <div class="wiki-meta">
        ${meta.category ? `<span class="wiki-meta__badge"><span class="dot"></span>${meta.category}</span>` : ''}
        ${meta.classification ? `<span>Classif: ${meta.classification}</span>` : ''}
        ${meta.author ? `<span>Redatto da: ${meta.author}</span>` : ''}
      </div>`;
  }

  // Rimuovi H1 dal markdown (già nel titolo)
  if (h1Match) md = md.replace(/^#\s+.+$/m, '').trim();

  // Render con marked.js
  const rendered = marked.parse(md, {
    gfm: true,
    breaks: false,
  });

  wikiBody.innerHTML = rendered;

  // Scroll to top
  wikiBody.scrollTop = 0;
  window.scrollTo(0, 0);
}
