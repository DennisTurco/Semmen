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
    .select('id, titolo, data, data_fine, data_testo, durata, luogo, descrizione, organizzatore_id')
    .eq('id', eventoId)
    .single();

  if (eventoError || !evento) {
    document.getElementById('evento-titolo').textContent = 'Evento non trovato';
    listEl.innerHTML = `<p class="pw-box__error">${eventoError ? eventoError.message : 'Evento non trovato.'}</p>`;
    return;
  }

  document.getElementById('evento-titolo').textContent = evento.titolo;

  // Stesso formato usato da eventi.js per le funzioni comuni di main.js
  const ev = {
    id: evento.id,
    titolo: evento.titolo,
    data: evento.data,
    dataFine: evento.data_fine,
    dataTesto: evento.data_testo,
    durata: evento.durata,
    luogo: evento.luogo,
    descrizione: evento.descrizione,
  };

  let organizzatoreLabel = null;
  if (evento.organizzatore_id) {
    const { data: utenti } = await db().rpc('utenti_assegnabili');
    const u = (utenti || []).find(x => x.id === evento.organizzatore_id);
    organizzatoreLabel = u ? `Organizzato da ${u.display_name}` : null;
  }

  document.getElementById('evento-meta').textContent = [
    dataEventoTesto(ev),
    durataEvento(ev),
    evento.luogo,
    organizzatoreLabel,
  ].filter(Boolean).join(' · ');

  const condividi = document.getElementById('evento-condividi');
  condividi.classList.remove('hidden');
  condividi.addEventListener('click', () => {
    condividiWhatsApp(`${evento.titolo} — ${dataEventoTesto(ev)}\nAderisci o guarda le foto: ${urlSito(`dettaglio-evento.html#${evento.id}`)}`);
  });

  if (calcolaStatoEvento(evento.data, evento.data_fine) !== 'Passato') {
    const calUrl = googleCalendarUrl(ev);
    const calBtn = document.getElementById('evento-calendar');
    if (calUrl) {
      calBtn.href = calUrl;
      calBtn.classList.remove('hidden');
    }
  }

  loadGalleria();
  await loadPartecipanti();
})();

async function loadPartecipanti() {
  const { data: partecipanti, error } = await db().rpc('evento_partecipanti', { p_evento_id: eventoId });

  if (error) { listEl.innerHTML = `<p class="pw-box__error">${error.message}</p>`; return; }

  if (!partecipanti || partecipanti.length === 0) {
    listEl.innerHTML = `<p class="list-empty">Nessuno ha ancora aderito a questo evento.</p>`;
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
      <div class="list-row">
        <div>
          <p class="list-row__title">${nome}</p>
          <p class="list-row__meta">
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

/* ── Galleria foto ──────────────────────────────────────────────
   Bucket privato `eventi-foto`: le immagini si vedono tramite URL
   firmati a scadenza. Percorso {evento}/{utente}/{uuid}.jpg, richiesto
   dalle policy di Storage per sapere di chi è il file. */
const BUCKET_FOTO = 'eventi-foto';
const LATO_MAX_FOTO = 1600;   // px: le foto dal telefono pesano troppo per il piano gratuito
const galleriaEl = document.getElementById('galleria');
const galleriaStato = document.getElementById('galleria-stato');
const galleriaStatoDefault = galleriaStato.textContent;
let fotoList = [];

async function loadGalleria() {
  const [{ data: foto, error }, { data: utenti }] = await Promise.all([
    db().from('evento_foto').select('id, path, user_id, created_at').eq('evento_id', eventoId).order('created_at'),
    db().rpc('utenti_assegnabili'),
  ]);
  if (error) { galleriaEl.innerHTML = `<p class="pw-box__error">${escapeHtml(error.message)}</p>`; return; }

  if (!foto.length) {
    fotoList = [];
    galleriaEl.innerHTML = `<p class="list-empty">Ancora nessuna foto. Sii il primo a immortalare l'evento.</p>`;
    return;
  }

  const { data: firmati } = await SemmenAuth.client.storage.from(BUCKET_FOTO)
    .createSignedUrls(foto.map(f => f.path), 3600);
  const urlDi = Object.fromEntries((firmati || []).map(x => [x.path, x.signedUrl]));
  const nomeDi = Object.fromEntries((utenti || []).map(u => [u.id, u.display_name]));
  const puoGestireTutte = currentProfile.role === 'admin' || currentProfile.role === 'editor';

  fotoList = foto.map(f => ({ ...f, url: urlDi[f.path], autore: nomeDi[f.user_id] || 'Membro' }));
  galleriaEl.innerHTML = fotoList.map((f, i) => `
    <figure class="galleria__foto">
      <button type="button" class="galleria__apri" data-apri="${i}" aria-label="Apri foto di ${escapeHtml(f.autore)}">
        <img src="${escapeHtml(f.url || '')}" alt="" loading="lazy">
      </button>
      ${(puoGestireTutte || f.user_id === currentProfile.id)
        ? `<button type="button" class="galleria__elimina" data-elimina="${f.id}" aria-label="Elimina foto"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`
        : ''}
    </figure>`).join('');

  galleriaEl.querySelectorAll('[data-apri]').forEach(btn => {
    btn.addEventListener('click', () => apriFoto(fotoList[Number(btn.dataset.apri)]));
  });
  galleriaEl.querySelectorAll('[data-elimina]').forEach(btn => {
    btn.addEventListener('click', () => eliminaFoto(fotoList.find(f => f.id === btn.dataset.elimina)));
  });
}

// Ridimensiona sul dispositivo prima di caricare (JPEG, lato lungo max 1600px)
function ridimensiona(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scala = Math.min(1, LATO_MAX_FOTO / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scala);
      canvas.height = Math.round(img.height * scala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Conversione non riuscita'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('Formato immagine non supportato'));
    img.src = URL.createObjectURL(file);
  });
}

async function caricaFoto(file) {
  const blob = await ridimensiona(file);
  const path = `${eventoId}/${currentProfile.id}/${crypto.randomUUID()}.jpg`;
  const { error: upError } = await SemmenAuth.client.storage.from(BUCKET_FOTO)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (upError) throw upError;

  const { error } = await db().from('evento_foto').insert({ evento_id: eventoId, path, user_id: currentProfile.id });
  if (error) {
    // Niente file orfani nello Storage se la riga non si salva
    await SemmenAuth.client.storage.from(BUCKET_FOTO).remove([path]);
    throw error;
  }
}

document.getElementById('galleria-file').addEventListener('change', async e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;

  let ok = 0;
  const errori = [];
  for (const [i, file] of files.entries()) {
    galleriaStato.textContent = `Caricamento ${i + 1} di ${files.length}...`;
    try { await caricaFoto(file); ok++; }
    catch (err) { errori.push(`${file.name}: ${err.message}`); }
  }
  galleriaStato.textContent = galleriaStatoDefault;

  if (ok) showToast(ok === 1 ? 'Foto aggiunta alla galleria.' : `${ok} foto aggiunte alla galleria.`);
  if (errori.length) showToast(`Non caricate: ${errori.join('; ')}`, 'error');
  loadGalleria();
});

async function eliminaFoto(f) {
  if (!confirm('Eliminare questa foto dalla galleria?')) return;
  const { error: stError } = await SemmenAuth.client.storage.from(BUCKET_FOTO).remove([f.path]);
  if (stError) { showToast(stError.message, 'error'); return; }
  const { error } = await db().from('evento_foto').delete().eq('id', f.id);
  if (error) { showToast(error.message, 'error'); return; }
  showToast('Foto eliminata.');
  loadGalleria();
}

/* ── Foto a tutto schermo ─────────────────────────────────────── */
const fotoModal = document.getElementById('foto-modal');

function apriFoto(f) {
  document.getElementById('foto-modal-img').src = f.url;
  document.getElementById('foto-modal-meta').textContent =
    `Caricata da ${f.autore} · ${formatData(f.created_at.slice(0, 10))}`;
  fotoModal.classList.remove('hidden');
}

function chiudiFoto() { fotoModal.classList.add('hidden'); }

document.getElementById('foto-modal-close').addEventListener('click', chiudiFoto);
fotoModal.addEventListener('click', e => { if (e.target === fotoModal) chiudiFoto(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudiFoto(); });
