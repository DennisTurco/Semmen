/**
 * eventi.js — elenco eventi della Setta + candidatura partecipazione
 * Dati e iscrizioni via Supabase (schema `semmen`). Se Supabase non è
 * configurato, o la tabella `eventi` è vuota, si usa CONFIG.eventi
 * come fallback statico (in tal caso le iscrizioni restano disabilitate).
 */

/* ── Utilità stato/data ─────────────────────────────────────── */
function statoClass(stato) {
  switch (stato) {
    case 'Imminente':     return 'evento-status--imminente';
    case 'In programma':  return 'evento-status--in-programma';
    case 'Passato':       return 'evento-status--passato';
    default:              return '';
  }
}

function formatData(iso) {
  if (!iso) return 'Data da definire';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

const db = SemmenAuth.db;

/* ── Stato pagina ───────────────────────────────────────────── */
const grid         = document.getElementById('eventi-grid');
const gridPassati  = document.getElementById('eventi-passati-grid');
const sezPassati   = document.getElementById('eventi-passati-sezione');
let eventi          = [];
let eventiFromDb     = false;
let currentProfile   = null;
let mieParteciazioni = new Set();
let iscrittiPerEvento = new Map();   // evento_id → [{ user_id, display_name, grado_simbolo }]

const MAX_ISCRITTI_VISIBILI = 8;

/* ── Caricamento dati ───────────────────────────────────────── */
async function loadEventi() {
  if (SemmenAuth.configured) {
    const { data, error } = await db().from('eventi').select('*').order('data', { ascending: true });
    if (!error && data && data.length > 0) {
      eventiFromDb = true;
      return data.map(ev => ({
        id: ev.id,
        titolo: ev.titolo,
        data: ev.data,
        dataFine: ev.data_fine,
        oraInizio: ev.ora_inizio,
        oraFine: ev.ora_fine,
        dataTesto: ev.data_testo,
        durata: ev.durata,
        luogo: ev.luogo,
        descrizione: ev.descrizione,
        immagine: ev.immagine,
        creditoImmagine: ev.credito_immagine,
        stato: calcolaStatoEvento(ev.data, ev.data_fine),
      }));
    }
  }
  eventiFromDb = false;
  return (CONFIG.eventi || [])
    .map((ev, i) => ({ id: `local-${i}`, ...ev, stato: calcolaStatoEvento(ev.data, ev.dataFine) }))
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
}

async function loadMiePartecipazioni() {
  if (!SemmenAuth.configured || !currentProfile) return new Set();
  const { data, error } = await db()
    .from('event_partecipazioni')
    .select('evento_id')
    .eq('user_id', currentProfile.id);
  if (error) { console.error('[Eventi] partecipazioni error:', error); return new Set(); }
  return new Set((data || []).map(p => p.evento_id));
}

/* Gli iscritti si leggono dalla RPC evento_partecipanti() (SECURITY
   DEFINER, solo Compagno+): un Utente semplice o un visitatore non li
   vede, coerente con la pagina di dettaglio. Una chiamata per evento,
   in parallelo: gli eventi sono pochi. */
function puoVedereIscritti() {
  return eventiFromDb && currentProfile && currentProfile.role !== 'utente';
}

async function loadIscritti(ids) {
  const risultati = await Promise.all(ids.map(async id => {
    const { data, error } = await db().rpc('evento_partecipanti', { p_evento_id: id });
    if (error) { console.error('[Eventi] iscritti error:', error); return [id, null]; }
    return [id, data || []];
  }));
  risultati.forEach(([id, lista]) => { if (lista) iscrittiPerEvento.set(id, lista); });
}

function bloccoIscritti(ev) {
  if (!puoVedereIscritti()) return '';
  return `<div data-iscritti="${ev.id}">${contenutoIscritti(ev)}</div>`;
}

// Aggiorna solo il riquadro iscritti, senza ridisegnare le card (che
// rifarebbero l'animazione di comparsa)
function aggiornaIscritti() {
  document.querySelectorAll('[data-iscritti]').forEach(el => {
    const ev = eventi.find(e => e.id === el.dataset.iscritti);
    if (ev) el.innerHTML = contenutoIscritti(ev);
  });
}

function contenutoIscritti(ev) {
  const lista = iscrittiPerEvento.get(ev.id);
  if (!lista) return '';

  const passato = ev.stato === 'Passato';
  if (lista.length === 0) {
    return `<div class="evento-card__iscritti">
      <p class="evento-card__iscritti-titolo">${passato ? 'Nessun partecipante' : 'Nessun iscritto — sii il primo'}</p>
    </div>`;
  }

  const visibili = lista.slice(0, MAX_ISCRITTI_VISIBILI);
  const altri = lista.length - visibili.length;
  const chips = visibili.map(p => {
    const io = p.user_id === currentProfile.id;
    const nome = io ? 'Tu' : (p.display_name || 'Membro');
    return `<span class="iscritto-chip${io ? ' iscritto-chip--io' : ''}">${p.grado_simbolo ? `<span aria-hidden="true">${escapeHtml(p.grado_simbolo)}</span>` : ''}${escapeHtml(nome)}</span>`;
  }).join('');

  return `<div class="evento-card__iscritti">
    <p class="evento-card__iscritti-titolo">👥 <strong>${lista.length}</strong> ${passato
      ? (lista.length === 1 ? 'partecipante' : 'partecipanti')
      : (lista.length === 1 ? 'iscritto' : 'iscritti')}</p>
    <div class="evento-card__iscritti-lista">
      ${chips}
      ${altri > 0 ? `<a href="dettaglio-evento.html#${ev.id}" class="iscritto-chip iscritto-chip--altri">+${altri} altri</a>` : ''}
    </div>
  </div>`;
}

/* ── Render griglia eventi ──────────────────────────────────── */
function pulsanteStato(ev) {
  if (ev.stato === 'Passato') {
    return { label: 'Evento Concluso', disabled: true };
  }
  if (!eventiFromDb) {
    return { label: 'Iscrizioni non disponibili', disabled: true };
  }
  if (!currentProfile) {
    return { label: '<i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i>Accedi e candidati', disabled: false, action: 'login' };
  }
  if (currentProfile.role === 'utente') {
    return { label: 'Serve il grado di Compagno', disabled: false, action: 'serve-grado' };
  }
  if (mieParteciazioni.has(ev.id)) {
    return { label: '<i class="fa-solid fa-check" aria-hidden="true"></i>Sei candidato · Ritira', disabled: false, action: 'ritira' };
  }
  return { label: '<i class="fa-solid fa-hand-point-up" aria-hidden="true"></i>Candidati ora', disabled: false, action: 'candidati' };
}

// Chi non è ancora candidato vede un pulsante grande e luminoso;
// chi lo è già un pulsante discreto, per non invogliare a ritirarsi
function classePulsante(action) {
  if (action === 'candidati' || action === 'login') return 'btn--primary partecipa-btn--cta';
  if (action === 'ritira')    return 'btn--ghost btn--sm partecipa-btn--fatto';
  return 'btn--primary btn--sm';
}

function cardEvento(ev) {
  const btn = pulsanteStato(ev);
  const passato = ev.stato === 'Passato';
  const calUrl = passato ? null : googleCalendarUrl(ev);
  return `
    <div class="feature-card evento-card${passato ? ' evento-card--passato' : ''}${btn.action === 'candidati' || btn.action === 'login' ? ' evento-card--aperto' : ''}" data-reveal style="cursor:default;">
      ${ev.immagine
        ? `<img class="evento-card__image" src="${ev.immagine}" alt="${ev.titolo}">`
        : `<div class="evento-card__image evento-card__image--placeholder">🕯️</div>`}
      ${ev.creditoImmagine ? `<p class="evento-card__credito">${ev.creditoImmagine}</p>` : ''}
      <span class="evento-status ${statoClass(ev.stato)}"><span class="dot"></span>${ev.stato || 'In programma'}</span>
      <h3 class="feature-card__title">${ev.titolo}</h3>
      <div class="evento-card__meta">
        <span>📅 ${escapeHtml(dataEventoTesto(ev))}</span>
        ${durataEvento(ev) ? `<span>⏱ ${escapeHtml(durataEvento(ev))}</span>` : ''}
        ${ev.luogo ? `<span>📍 ${ev.luogo}</span>` : ''}
      </div>
      <p class="evento-card__desc">${ev.descrizione || ''}</p>
      ${bloccoIscritti(ev)}
      <div class="evento-card__azioni">
        <button
          type="button"
          class="btn partecipa-btn ${classePulsante(btn.action)}"
          data-evento-id="${ev.id}"
          data-action="${btn.action || ''}"
          ${btn.disabled ? 'disabled' : ''}
        >${btn.label}</button>
        ${calUrl
          ? `<a href="${escapeHtml(calUrl)}" target="_blank" rel="noopener" class="btn btn--outline btn--sm" title="Salva in Google Calendar">
              <i class="fa-regular fa-calendar-plus" aria-hidden="true"></i>Calendar
            </a>`
          : ''}
        ${puoVedereIscritti()
          ? `<a href="dettaglio-evento.html#${ev.id}" class="btn btn--ghost btn--sm">${passato ? 'Partecipanti e Foto' : 'Partecipanti'}</a>`
          : ''}
      </div>
    </div>`;
}

function render() {
  const futuri  = eventi.filter(ev => ev.stato !== 'Passato');
  // Passati: dal più recente al più vecchio
  const passati = eventi.filter(ev => ev.stato === 'Passato').reverse();

  grid.innerHTML = futuri.length
    ? futuri.map(cardEvento).join('')
    : `<div class="eventi-empty">
        Nessun evento in programma.${eventi.length === 0 ? '<br>Aggiungili dal <a href="pannello.html">Pannello</a>.' : ''}
      </div>`;

  gridPassati.innerHTML = passati.map(cardEvento).join('');
  sezPassati.classList.toggle('hidden', passati.length === 0);

  document.querySelectorAll('.partecipa-btn').forEach(el => {
    el.addEventListener('click', () => handleAzione(el.dataset.eventoId, el.dataset.action));
  });
}

/* ── Azioni pulsante ────────────────────────────────────────── */
function handleAzione(eventoId, action) {
  const ev = eventi.find(e => e.id === eventoId);
  if (!ev) return;

  if (action === 'login') {
    location.href = 'login.html?redirect=eventi.html';
    return;
  }
  if (action === 'serve-grado') {
    alert('Per partecipare agli eventi devi essere registrato almeno come Compagno della Setta.\nCandidati alla Setta per ottenere il grado.');
    return;
  }
  if (action === 'ritira') {
    ritiraPartecipazione(ev);
    return;
  }
  if (action === 'candidati') {
    openPartecipaModal(ev);
  }
}

async function ritiraPartecipazione(ev) {
  if (!confirm(`Ritirare la candidatura per "${ev.titolo}"?`)) return;
  const { error } = await db()
    .from('event_partecipazioni')
    .delete()
    .eq('evento_id', ev.id)
    .eq('user_id', currentProfile.id);
  if (error) { alert(error.message); return; }
  mieParteciazioni.delete(ev.id);
  await loadIscritti([ev.id]);
  render();
}

/* ── Modal candidatura ──────────────────────────────────────── */
const partecipaModal         = document.getElementById('partecipa-modal');
const partecipaForm          = document.getElementById('partecipa-form');
const partecipaEventoNome    = document.getElementById('partecipa-evento-nome');
const partecipaUtente        = document.getElementById('partecipa-utente');
const partecipaSubmitBtn     = document.getElementById('partecipa-submit-btn');
const partecipaSubmitText    = document.getElementById('partecipa-submit-text');
const partecipaSubmitSpinner = document.getElementById('partecipa-submit-spinner');
const partecipaError         = document.getElementById('partecipa-error');
const partecipaSuccess       = document.getElementById('partecipa-success');

let selectedEvento = null;

function openPartecipaModal(evento) {
  selectedEvento = evento;
  partecipaEventoNome.textContent = `${evento.titolo} — ${dataEventoTesto(evento)}`;
  partecipaUtente.textContent = currentProfile.full_name || currentProfile.email;
  partecipaForm.reset();
  partecipaForm.classList.remove('hidden');
  partecipaSuccess.classList.add('hidden');
  partecipaError.textContent = '';
  partecipaSubmitBtn.disabled = false;
  partecipaSubmitText.textContent = 'Conferma Candidatura';
  partecipaSubmitSpinner.classList.add('hidden');
  partecipaModal.classList.remove('hidden');
}

function closePartecipaModal() {
  partecipaModal.classList.add('hidden');
  selectedEvento = null;
}

document.getElementById('partecipa-modal-close').addEventListener('click', closePartecipaModal);
partecipaModal.addEventListener('click', e => {
  if (e.target === partecipaModal) closePartecipaModal();
});

partecipaForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!selectedEvento || !currentProfile) return;

  partecipaSubmitBtn.disabled = true;
  partecipaSubmitText.textContent = 'Trasmissione in corso...';
  partecipaSubmitSpinner.classList.remove('hidden');
  partecipaError.textContent = '';

  const note = document.getElementById('partecipa-note').value.trim() || null;

  const { error } = await db().from('event_partecipazioni').insert({
    evento_id: selectedEvento.id,
    user_id:   currentProfile.id,
    note,
  });

  if (error) {
    partecipaSubmitBtn.disabled = false;
    partecipaSubmitText.textContent = 'Conferma Candidatura';
    partecipaSubmitSpinner.classList.add('hidden');
    partecipaError.textContent = error.message;
    return;
  }

  mieParteciazioni.add(selectedEvento.id);
  partecipaForm.classList.add('hidden');
  partecipaSuccess.classList.remove('hidden');
  await loadIscritti([selectedEvento.id]);
  render();
});

/* ── Init ───────────────────────────────────────────────────────
   Il profilo e l'elenco eventi sono indipendenti: partivano in serie
   (3 round-trip a Supabase uno dopo l'altro), rendendo il caricamento
   percepito molto più lento del necessario. Ora profilo ed eventi
   partono in parallelo, e le "mie partecipazioni" (che dipendono dal
   profilo) partono non appena il profilo risolve, senza aspettare che
   gli eventi siano già arrivati. */
(async function init() {
  const profilePromise = SemmenAuth.configured ? SemmenAuth.getProfile() : Promise.resolve(null);
  const eventiPromise  = loadEventi();

  currentProfile = await profilePromise;
  const partecipazioniPromise = loadMiePartecipazioni();

  [eventi, mieParteciazioni] = await Promise.all([eventiPromise, partecipazioniPromise]);
  render();

  // Gli iscritti arrivano dopo: la pagina è già visibile, poi le card
  // si aggiornano con i nomi.
  if (puoVedereIscritti()) {
    await loadIscritti(eventi.map(ev => ev.id));
    aggiornaIscritti();
  }
})();
