/**
 * supabase-client.js — client Supabase condiviso + helper auth/ruoli
 *
 * Espone `window.SemmenAuth` a tutte le pagine. Se CONFIG.supabase
 * non è configurato (placeholder), le funzioni degradano in modo
 * innocuo: `configured` è false e le pagine che dipendono da
 * Supabase (login, pannello, account, RSVP eventi) lo segnalano.
 */

const SemmenAuth = (function () {
  const cfg = (typeof CONFIG !== 'undefined' && CONFIG.supabase) || {};
  const configured = !!(cfg.url && cfg.anonKey &&
    !cfg.url.startsWith('__') && !cfg.anonKey.startsWith('__'));

  const client = (configured && window.supabase)
    ? window.supabase.createClient(cfg.url, cfg.anonKey)
    : null;

  // Tutte le tabelle/funzioni del sito vivono nello schema `semmen`
  // (progetto Supabase condiviso con altri progetti, non "public").
  // Ricorda di aggiungere "semmen" in Project Settings → Data API →
  // Exposed schemas, altrimenti queste chiamate falliscono.
  const db = () => client.schema('semmen');

  let cachedProfile = null;
  let cachedUserId  = null;

  /* ── Sessione ─────────────────────────────────────────────── */
  async function getSession() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session || null;
  }

  async function getProfile(forceRefresh) {
    if (!client) return null;
    const session = await getSession();
    if (!session) { cachedProfile = null; cachedUserId = null; return null; }

    if (!forceRefresh && cachedProfile && cachedUserId === session.user.id) {
      return cachedProfile;
    }

    const { data, error } = await db()
      .from('profiles')
      .select('id, email, full_name, role, created_at')
      .eq('id', session.user.id)
      .single();

    if (error) { console.error('[SemmenAuth] getProfile error:', error); return null; }
    cachedProfile = data;
    cachedUserId  = session.user.id;
    return data;
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    cachedProfile = null;
    cachedUserId  = null;
    location.href = 'index.html';
  }

  /**
   * Protegge una pagina: reindirizza a login.html se non autenticato,
   * mostra un messaggio di accesso negato se il ruolo non è tra quelli
   * ammessi. Da chiamare in cima alle pagine riservate (pannello,
   * account...).
   *
   * @param {string[]} roles - ruoli ammessi, es. ['admin'], ['admin','editor']
   * @returns {Promise<object|null>} il profilo se l'accesso è consentito, altrimenti null
   */
  async function requireRole(roles) {
    if (!configured) {
      renderAccessMessage('Supabase non è ancora configurato per questo sito.');
      return null;
    }

    // Prima si controlla la sessione: solo l'assenza di sessione giustifica
    // un redirect al login. Se la sessione c'è ma il profilo non si carica
    // (es. schema "semmen" non ancora esposto nell'API, o riga mancante),
    // NON si rimanda al login — altrimenti login.html rimanda indietro
    // qui appena vede una sessione valida, creando un loop infinito.
    const session = await getSession();
    if (!session) {
      location.href = `login.html?redirect=${encodeURIComponent(location.pathname.split('/').pop())}`;
      return null;
    }

    const profile = await getProfile();
    if (!profile) {
      renderAccessMessage(
        'Sei autenticato, ma non è stato possibile caricare il tuo profilo. ' +
        'Controlla che lo schema "semmen" sia tra gli Exposed schemas di Supabase ' +
        '(Project Settings → Data API) e che esista una riga per il tuo utente ' +
        'nella tabella semmen.profiles, poi ricarica la pagina.',
        true
      );
      return null;
    }
    if (roles && roles.length && !roles.includes(profile.role)) {
      renderAccessMessage('Non hai i permessi per accedere a questa pagina.');
      return null;
    }
    return profile;
  }

  function renderAccessMessage(msg, showLogout) {
    const main = document.getElementById('page-main') || document.querySelector('.container');
    if (!main) { alert(msg); return; }
    main.innerHTML = `
      <div class="page-header">
        <p class="page-header__label">Accesso Negato</p>
        <h1 class="page-header__title">Non Autorizzato</h1>
        <p class="page-header__subtitle">${msg}</p>
      </div>
      <div style="text-align:center;margin-top:2rem;display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">
        <a href="index.html" class="btn btn--outline">Torna al Sanctuarium</a>
        ${showLogout ? `<button type="button" class="btn btn--ghost" id="access-logout-btn">Esci e riprova</button>` : ''}
      </div>`;
    if (showLogout) {
      const btn = document.getElementById('access-logout-btn');
      if (btn) btn.addEventListener('click', signOut);
    }
  }

  /* ── Navbar dinamica (Accedi / Account / Pannello / Esci) ───── */
  const ROLE_LABELS = {
    admin: 'Admin', editor: 'Editor', compagno: 'Compagno', utente: 'Utente',
  };

  async function initNavbar() {
    const slot = document.getElementById('navbar-auth');
    if (!slot) return;

    if (!configured) {
      slot.innerHTML = '';
      return;
    }

    const profile = await getProfile();

    if (!profile) {
      slot.innerHTML = `<a href="login.html" class="navbar__auth-link">Accedi</a>`;
      return;
    }

    // Un solo elemento in navbar (menu a tendina) invece di tre voci
    // separate, per non affollare la barra.
    const canPannello = profile.role === 'admin' || profile.role === 'editor';
    slot.innerHTML = `
      <div class="navbar__account" id="navbar-account">
        <button type="button" class="navbar__auth-link navbar__account-trigger" id="navbar-account-trigger" aria-expanded="false">
          ${ROLE_LABELS[profile.role] || profile.role}
          <span class="navbar__account-caret">▾</span>
        </button>
        <div class="navbar__account-menu">
          ${canPannello ? `<a href="pannello.html">Pannello</a>` : ''}
          <a href="account.html">Account</a>
          <button type="button" id="navbar-logout">Esci</button>
        </div>
      </div>
    `;

    const wrapper = document.getElementById('navbar-account');
    const trigger = document.getElementById('navbar-account-trigger');

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = wrapper.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', e => {
      if (!wrapper.contains(e.target)) {
        wrapper.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    const logoutBtn = document.getElementById('navbar-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', signOut);
  }

  document.addEventListener('DOMContentLoaded', initNavbar);

  return {
    configured, client, db, ROLE_LABELS,
    getSession, getProfile, signOut, requireRole, initNavbar,
  };
})();
