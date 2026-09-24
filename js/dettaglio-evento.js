/**
 * dettaglio-evento.js — dettaglio di un evento + elenco degli utenti che
 * hanno aderito. Visibile a Compagno/Editor/Admin. L'elenco arriva dalla
 * RPC semmen.evento_partecipanti() (SECURITY DEFINER), perché le policy
 * RLS dirette su event_partecipazioni/profiles limiterebbero un Compagno
 * alle sole proprie righe.
 */

function formatData(iso) {
  if (!iso) return 'Data da definire';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

const db = SemmenAuth.db;
const listEl = document.getElementById('partecipanti-list');

// L'id evento viaggia nel fragment (#id), non nella query string: alcuni
// server statici (es. "serve" con cleanUrls) fanno un redirect che rimuove
// query string ed estensione .html, ma il fragment non viene mai inviato
// al server e sopravvive a qualunque redirect.
const eventoId = location.hash.slice(1);
let currentProfile = null;

(async function init() {
  currentProfile = await SemmenAuth.requireRole(['admin', 'editor', 'compagno']);
  if (!currentProfile) return;

  if (!eventoId) {
    listEl.innerHTML = `<p class="pw-box__error">Nessun evento specificato.</p>`;
    return;
  }

  const { data: evento, error: eventoError } = await db()
    .from('eventi')
    .select('id, titolo, data, data_testo, durata, luogo, organizzatore_id')
    .eq('id', eventoId)
    .single();

  if (eventoError || !evento) {
    document.getElementById('evento-titolo').textContent = 'Evento non trovato';
    listEl.innerHTML = `<p class="pw-box__error">${eventoError ? eventoError.message : 'Evento non trovato.'}</p>`;
    return;
  }

  document.getElementById('evento-titolo').textContent = evento.titolo;

  let organizzatoreLabel = null;
  if (evento.organizzatore_id) {
    const { data: utenti } = await db().rpc('utenti_assegnabili');
    const u = (utenti || []).find(x => x.id === evento.organizzatore_id);
    organizzatoreLabel = u ? `Organizzato da ${u.display_name}` : null;
  }

  document.getElementById('evento-meta').textContent = [
    evento.data_testo || formatData(evento.data),
    evento.durata,
    evento.luogo,
    organizzatoreLabel,
  ].filter(Boolean).join(' · ');

  await loadPartecipanti();
})();

async function loadPartecipanti() {
  const { data: partecipanti, error } = await db().rpc('evento_partecipanti', { p_evento_id: eventoId });

  if (error) { listEl.innerHTML = `<p class="pw-box__error">${error.message}</p>`; return; }

  if (!partecipanti || partecipanti.length === 0) {
    listEl.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;">Nessuno ha ancora aderito a questo evento.</p>`;
    return;
  }

  // Solo Editor/Admin possono rimuovere l'adesione altrui (coerente con la
  // policy RLS di delete su event_partecipazioni); un Compagno può solo
  // rimuovere la propria.
  const puoGestireTutti = currentProfile.role === 'admin' || currentProfile.role === 'editor';

  listEl.innerHTML = partecipanti.map(p => {
    const nome = p.display_name || 'Utente sconosciuto';
    const gradoLabel = p.grado_nome ? `${p.grado_simbolo || ''} ${p.grado_nome}`.trim() : null;
    const puoRimuovere = puoGestireTutti || p.user_id === currentProfile.id;

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;padding:0.75rem 0;border-bottom:1px solid var(--border);">
        <div>
          <p style="font-family:var(--font-ui);color:var(--text-primary);">${nome}</p>
          <p style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono);">
            ${gradoLabel ? gradoLabel + ' · ' : ''}Adesione: ${formatData(p.created_at.slice(0, 10))}
            ${p.note ? ' · ' + p.note : ''}
          </p>
        </div>
        ${puoRimuovere ? `<button type="button" class="btn btn--ghost" style="font-size:0.7rem;padding:0.4rem 0.7rem;" data-rimuovi="${p.id}">Rimuovi</button>` : ''}
      </div>`;
  }).join('');

  listEl.querySelectorAll('[data-rimuovi]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Rimuovere questa adesione?')) return;
      const { error: delError } = await db().from('event_partecipazioni').delete().eq('id', btn.dataset.rimuovi);
      if (delError) { alert(delError.message); return; }
      loadPartecipanti();
    });
  });
}
