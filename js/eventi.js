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
const grid = document.getElementById('eventi-grid');
let eventi          = [];
let eventiFromDb     = false;
let currentProfile   = null;
let mieParteciazioni = new Set();

/* ── Caricamento dati ───────────────────────────────────────── */
async function loadEventi() {
  if (SemmenAuth.configured) {
    const { data, error } = await db().from('eventi').select('*').order('data', { ascending: false });
    if (!error && data && data.length > 0) {
      eventiFromDb = true;
      return data.map(ev => ({
        id: ev.id,
        titolo: ev.titolo,
        data: ev.data,
        dataTesto: ev.data_testo,
        durata: ev.durata,
        luogo: ev.luogo,
        descrizione: ev.descrizione,
        immagine: ev.immagine,
        creditoImmagine: ev.credito_immagine,
        stato: calcolaStatoEvento(ev.data),
      }));
    }
  }
  eventiFromDb = false;
  return (CONFIG.eventi || []).map((ev, i) => ({ id: `local-${i}`, ...ev, stato: calcolaStatoEvento(ev.data) }));
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

/* ── Render griglia eventi ──────────────────────────────────── */
function pulsanteStato(ev) {
  if (ev.stato === 'Passato') {
    return { label: 'Evento Concluso', disabled: true };
  }
  if (!eventiFromDb) {
    return { label: 'Iscrizioni non disponibili', disabled: true };
  }
  if (!currentProfile) {
    return { label: 'Accedi per Partecipare', disabled: false, action: 'login' };
  }
  if (currentProfile.role === 'utente') {
    return { label: 'Serve il grado di Compagno', disabled: false, action: 'serve-grado' };
  }
  if (mieParteciazioni.has(ev.id)) {
    return { label: 'Già Candidato ✓ — Ritira', disabled: false, action: 'ritira' };
  }
  return { label: 'Richiedi Partecipazione', disabled: false, action: 'candidati' };
}

function render() {
  if (eventi.length === 0) {
    grid.innerHTML = `<div class="eventi-empty">
      Nessun evento in calendario.<br>Aggiungili dal <a href="pannello.html">Pannello</a>.
    </div>`;
    return;
  }

  grid.innerHTML = eventi.map(ev => {
    const btn = pulsanteStato(ev);
    return `
    <div class="feature-card evento-card" data-reveal style="cursor:default;">
      ${ev.immagine
        ? `<img class="evento-card__image" src="${ev.immagine}" alt="${ev.titolo}">`
        : `<div class="evento-card__image evento-card__image--placeholder">🕯️</div>`}
      ${ev.creditoImmagine ? `<p class="evento-card__credito">${ev.creditoImmagine}</p>` : ''}
      <span class="evento-status ${statoClass(ev.stato)}"><span class="dot"></span>${ev.stato || 'In programma'}</span>
      <h3 class="feature-card__title">${ev.titolo}</h3>
      <div class="evento-card__meta">
        <span>📅 ${ev.dataTesto || formatData(ev.data)}</span>
        ${ev.durata ? `<span>⏱ ${ev.durata}</span>` : ''}
        ${ev.luogo ? `<span>📍 ${ev.luogo}</span>` : ''}
      </div>
      <p class="evento-card__desc">${ev.descrizione || ''}</p>
      <button
        type="button"
        class="btn btn--primary partecipa-btn"
        style="width:100%;margin-top:1.25rem;"
        data-evento-id="${ev.id}"
        data-action="${btn.action || ''}"
        ${btn.disabled ? 'disabled' : ''}
      >${btn.label}</button>
      ${eventiFromDb && currentProfile && currentProfile.role !== 'utente'
        ? `<a href="dettaglio-evento.html#${ev.id}" class="btn btn--outline" style="width:100%;margin-top:0.5rem;">Vedi Partecipanti</a>`
        : ''}
    </div>`;
  }).join('');

  grid.querySelectorAll('.partecipa-btn').forEach(el => {
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
  partecipaEventoNome.textContent = `${evento.titolo} — ${evento.dataTesto || formatData(evento.data)}`;
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
  render();
});

/* ── Init ───────────────────────────────────────────────────── */
(async function init() {
  if (SemmenAuth.configured) currentProfile = await SemmenAuth.getProfile();
  eventi = await loadEventi();
  mieParteciazioni = await loadMiePartecipazioni();
  render();
})();
