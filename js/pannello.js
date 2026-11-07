/**
 * pannello.js — gestione contenuti (Editor/Admin) e utenti (solo Admin)
 */

(async () => {
  const profile = await SemmenAuth.requireRole(['admin', 'editor']);
  if (!profile) return;

  const sb = SemmenAuth.db();
  const isAdmin = profile.role === 'admin';

  /* ── Modal di conferma (sostituisce confirm()); esiti ed errori
     delle azioni passano dai toast, vedi showToast in main.js ───── */
  function showModal({ title, message, showCancel }) {
    return new Promise(resolve => {
      const overlay  = document.getElementById('confirm-modal');
      const cancelBtn = document.getElementById('confirm-modal-cancel');
      const okBtn     = document.getElementById('confirm-modal-ok');

      document.getElementById('confirm-modal-title').textContent = title;
      document.getElementById('confirm-modal-message').textContent = message;
      cancelBtn.style.display = showCancel ? '' : 'none';
      overlay.classList.remove('hidden');

      function cleanup(result) {
        overlay.classList.add('hidden');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onOverlay);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onOverlay(e) { if (e.target === overlay) cleanup(false); }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onOverlay);
    });
  }

  function confirmDialog(message) {
    return showModal({ title: 'Conferma', message, showCancel: true });
  }

  // I moduli "Nuovo …" sono chiusi di base: Modifica li apre e li porta in vista
  function apriModulo(form) {
    const box = form.closest('details');
    box.open = true;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── Tabs ───────────────────────────────────────────────────── */
  const tabBtns   = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  if (isAdmin) document.getElementById('tab-btn-utenti').classList.remove('hidden');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      history.replaceState(null, '', `#${btn.dataset.tab}`);
    });
  });

  // pannello.html#prodotti apre direttamente quella tab (es. link dallo Shop)
  const tabIniziale = document.querySelector(`.tab-btn[data-tab="${location.hash.slice(1)}"]:not(.hidden)`);
  if (tabIniziale) tabIniziale.click();

  /* ── Upload immagini (bucket pubblici di Supabase Storage) ──── */
  async function uploadImmagine(bucket, file) {
    const ext  = file.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await SemmenAuth.client.storage.from(bucket).upload(path, file, { upsert: false });
    if (error) return { error };
    const { data } = SemmenAuth.client.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl };
  }

  /* ── GRADI (caricati una volta, usati da Discepoli e Utenti) ─── */
  let gradiList = [];
  let directory = []; // { id, display_name } — utenti collegabili a un discepolo

  async function loadGradi() {
    const { data, error } = await sb.from('gradi').select('id, nome, simbolo, ordine').order('ordine');
    if (error) { console.error('[Pannello] gradi error:', error); return; }
    gradiList = data || [];

    const selEl = document.getElementById('discepolo-grado');
    selEl.innerHTML = gradiList.map(g => `<option value="${g.id}">${g.simbolo ? g.simbolo + ' ' : ''}${g.nome}</option>`).join('');
  }

  async function loadDirectory() {
    const { data, error } = await sb.rpc('directory_utenti');
    if (error) { console.error('[Pannello] directory_utenti error:', error); return; }
    directory = data || [];

    const selEl = document.getElementById('discepolo-utente');
    selEl.innerHTML = `<option value="">— Nessuno (nome libero) —</option>` +
      directory.map(u => `<option value="${u.id}">${u.display_name}</option>`).join('');
  }

  function gradoLabel(id) {
    const g = gradiList.find(x => x.id === id);
    return g ? `${g.simbolo ? g.simbolo + ' ' : ''}${g.nome}` : '—';
  }

  /* ── EVENTI ─────────────────────────────────────────────────── */
  const eventoForm   = document.getElementById('evento-form');
  const eventoIdEl   = document.getElementById('evento-id');
  const eventoError  = document.getElementById('evento-error');
  const eventoCancel = document.getElementById('evento-cancel-btn');
  const eventiTbody  = document.getElementById('eventi-tbody');

  function organizzatoreLabel(id) {
    if (!id) return '—';
    const u = directory.find(x => x.id === id);
    return u ? u.display_name : '—';
  }

  async function loadEventi() {
    const { data: eventi, error } = await sb.from('eventi').select('*').order('data', { ascending: true });
    if (error) { eventoError.textContent = error.message; return; }

    const { data: partecipazioni } = await sb.from('event_partecipazioni').select('evento_id');
    const counts = {};
    (partecipazioni || []).forEach(p => { counts[p.evento_id] = (counts[p.evento_id] || 0) + 1; });

    eventiTbody.innerHTML = (eventi || []).map(ev => `
      <tr>
        <td>${ev.titolo}</td>
        <td>${calcolaStatoEvento(ev.data, ev.data_fine)}</td>
        <td>${ev.data ? escapeHtml(dataEventoTesto({ data: ev.data, dataFine: ev.data_fine, oraInizio: ev.ora_inizio, oraFine: ev.ora_fine, dataTesto: ev.data_testo })) : '—'}</td>
        <td>${organizzatoreLabel(ev.organizzatore_id)}</td>
        <td><a href="dettaglio-evento.html#${ev.id}">${counts[ev.id] || 0}</a></td>
        <td class="row-actions">
          <button type="button" class="btn btn--outline" data-edit="${ev.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i>Modifica</button>
          <button type="button" class="btn btn--ghost" data-delete="${ev.id}"><i class="fa-solid fa-trash" aria-hidden="true"></i>Elimina</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="6">Nessun evento. Aggiungine uno dal modulo qui sopra.</td></tr>`;

    eventiTbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => editEvento(eventi.find(e => e.id === btn.dataset.edit)));
    });
    eventiTbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteEvento(btn.dataset.delete));
    });
  }

  const eventoImmagineEl   = document.getElementById('evento-immagine');
  const eventoImmagineFile = document.getElementById('evento-immagine-file');
  const eventoUploadStatus = document.getElementById('evento-upload-status');
  const eventoImmaginePreview = document.getElementById('evento-immagine-preview');
  const UPLOAD_STATUS_DEFAULT = eventoUploadStatus.textContent;

  function updateEventoPreview() {
    const url = eventoImmagineEl.value.trim();
    if (url) {
      eventoImmaginePreview.src = url;
      eventoImmaginePreview.classList.remove('hidden');
    } else {
      eventoImmaginePreview.classList.add('hidden');
    }
  }

  eventoImmagineEl.addEventListener('input', updateEventoPreview);

  eventoImmagineFile.addEventListener('change', async () => {
    const file = eventoImmagineFile.files[0];
    if (!file) return;

    eventoUploadStatus.textContent = 'Caricamento in corso...';

    const { url, error: uploadError } = await uploadImmagine('eventi-immagini', file);

    if (uploadError) {
      eventoUploadStatus.textContent = `Errore upload: ${uploadError.message}`;
      showToast(`Caricamento immagine non riuscito: ${uploadError.message}`, 'error');
      return;
    }

    eventoImmagineEl.value = url;
    updateEventoPreview();
    eventoUploadStatus.textContent = '✓ Immagine caricata.';
  });

  function editEvento(ev) {
    eventoIdEl.value = ev.id;
    document.getElementById('evento-titolo').value      = ev.titolo || '';
    document.getElementById('evento-data').value          = ev.data || '';
    document.getElementById('evento-data-testo').value    = ev.data_testo || '';
    eventoDataFineEl.value                                 = ev.data_fine || '';
    eventoOraInizioEl.value                                = hhmm(ev.ora_inizio) || '';
    eventoOraFineEl.value                                  = hhmm(ev.ora_fine) || '';
    aggiornaDurataHint();
    document.getElementById('evento-luogo').value         = ev.luogo || '';
    eventoImmagineEl.value                                 = ev.immagine || '';
    document.getElementById('evento-credito').value       = ev.credito_immagine || '';
    document.getElementById('evento-descrizione').value   = ev.descrizione || '';
    updateEventoPreview();
    eventoUploadStatus.textContent = UPLOAD_STATUS_DEFAULT;
    eventoCancel.classList.remove('hidden');
    apriModulo(eventoForm);
  }

  const eventoDataEl     = document.getElementById('evento-data');
  const eventoDataFineEl = document.getElementById('evento-data-fine');
  const eventoOraInizioEl = document.getElementById('evento-ora-inizio');
  const eventoOraFineEl   = document.getElementById('evento-ora-fine');
  const eventoDurataHint = document.getElementById('evento-durata-hint');
  const DURATA_HINT_DEFAULT = eventoDurataHint.textContent;

  function eventoDalModulo() {
    return {
      data: eventoDataEl.value,
      dataFine: eventoDataFineEl.value,
      oraInizio: eventoOraInizioEl.value,
      oraFine: eventoOraFineEl.value,
    };
  }

  // La fine non può precedere l'inizio; l'hint mostra la durata calcolata
  function aggiornaDurataHint() {
    eventoDataFineEl.min = eventoDataEl.value || '';
    const ev = eventoDalModulo();
    const haIntervallo = ev.data && (giorniEvento(ev) || (ev.oraInizio && ev.oraFine));
    eventoDurataHint.textContent = haIntervallo
      ? `${dataEventoTesto(ev)} · ${durataEvento(ev)}.`
      : DURATA_HINT_DEFAULT;
  }
  [eventoDataEl, eventoDataFineEl, eventoOraInizioEl, eventoOraFineEl]
    .forEach(el => el.addEventListener('change', aggiornaDurataHint));

  function resetEventoForm() {
    eventoForm.reset();
    aggiornaDurataHint();
    eventoIdEl.value = '';
    eventoCancel.classList.add('hidden');
    eventoError.textContent = '';
    eventoUploadStatus.textContent = UPLOAD_STATUS_DEFAULT;
    eventoImmaginePreview.classList.add('hidden');
  }

  eventoCancel.addEventListener('click', resetEventoForm);

  async function deleteEvento(id) {
    if (!(await confirmDialog('Eliminare questo evento? L\'azione è irreversibile.'))) return;
    const { error } = await sb.from('eventi').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Evento eliminato.');
    loadEventi();
  }

  eventoForm.addEventListener('submit', async e => {
    e.preventDefault();
    eventoError.textContent = '';

    const dataInizio = eventoDataEl.value || null;
    let dataFine = eventoDataFineEl.value || null;
    if (dataFine && !dataInizio) { eventoError.textContent = 'Inserisci anche la data di inizio.'; return; }
    if (dataFine && dataFine < dataInizio) { eventoError.textContent = 'La data di fine non può precedere quella di inizio.'; return; }
    if (dataFine === dataInizio) dataFine = null;
    const oraInizio = eventoOraInizioEl.value || null;
    const oraFine   = eventoOraFineEl.value || null;
    if (oraInizio && !dataInizio) { eventoError.textContent = 'Inserisci anche la data di inizio.'; return; }
    if (oraFine && !oraInizio) { eventoError.textContent = 'Inserisci anche l\'ora di inizio.'; return; }
    if (dataFine && oraInizio && oraFine && `${dataFine}T${oraFine}` <= `${dataInizio}T${oraInizio}`) {
      eventoError.textContent = 'La fine non può precedere l\'inizio.'; return;
    }

    const payload = {
      titolo:           document.getElementById('evento-titolo').value.trim(),
      data:              dataInizio,
      data_fine:         dataFine,
      ora_inizio:        oraInizio,
      ora_fine:          oraFine,
      stato:             calcolaStatoEvento(dataInizio, dataFine),
      data_testo:        document.getElementById('evento-data-testo').value.trim() || null,
      // La durata ora deriva da date e orari: il vecchio testo libero si
      // azzera appena c'è un intervallo, altrimenti resta com'era
      ...(dataFine || oraInizio ? { durata: null } : {}),
      luogo:             document.getElementById('evento-luogo').value.trim() || null,
      immagine:          document.getElementById('evento-immagine').value.trim() || null,
      credito_immagine:  document.getElementById('evento-credito').value.trim() || null,
      descrizione:       document.getElementById('evento-descrizione').value.trim() || null,
      updated_at:        new Date().toISOString(),
    };

    const id = eventoIdEl.value;
    const { error } = id
      ? await sb.from('eventi').update(payload).eq('id', id)
      : await sb.from('eventi').insert({ ...payload, organizzatore_id: profile.id });

    if (error) { eventoError.textContent = error.message; return; }
    showToast(id ? `Evento "${payload.titolo}" aggiornato.` : `Evento "${payload.titolo}" creato.`);
    resetEventoForm();
    loadEventi();
  });

  /* ── DISCEPOLI ──────────────────────────────────────────────── */
  const discepoloForm     = document.getElementById('discepolo-form');
  const discepoloIdEl     = document.getElementById('discepolo-id');
  const discepoloError    = document.getElementById('discepolo-error');
  const discepoloCancel   = document.getElementById('discepolo-cancel-btn');
  const discepoliTbody    = document.getElementById('discepoli-tbody');
  const discepoloGradoEl  = document.getElementById('discepolo-grado');
  const discepoloUtenteEl = document.getElementById('discepolo-utente');
  const discepoloNomeEl   = document.getElementById('discepolo-nome');

  // Se colleghi un utente, il campo "nome" (fallback) non serve più: lo disabilitiamo.
  discepoloUtenteEl.addEventListener('change', () => {
    const collegato = !!discepoloUtenteEl.value;
    discepoloNomeEl.required = !collegato;
    discepoloNomeEl.disabled = collegato;
    if (collegato) discepoloNomeEl.value = '';
  });

  async function loadDiscepoli() {
    const { data, error } = await sb
      .from('discepoli')
      .select('id, nome, nota, grado_id, user_id, gradi(nome, simbolo, ordine), profiles(username, full_name)')
      .order('nome');
    if (error) { discepoloError.textContent = error.message; return; }

    const rows = (data || []).sort((a, b) => (a.gradi?.ordine ?? 99) - (b.gradi?.ordine ?? 99));

    discepoliTbody.innerHTML = rows.map(d => {
      const nomeVisualizzato = d.profiles ? (d.profiles.username || d.profiles.full_name) : d.nome;
      const utenteLabel = d.profiles ? (d.profiles.username || d.profiles.full_name || 'Account collegato') : '—';
      return `
      <tr>
        <td>${nomeVisualizzato}</td>
        <td>${d.gradi ? (d.gradi.simbolo ? d.gradi.simbolo + ' ' : '') + d.gradi.nome : '—'}</td>
        <td>${utenteLabel}</td>
        <td>${d.nota || ''}</td>
        <td class="row-actions">
          <button type="button" class="btn btn--outline" data-edit="${d.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i>Modifica</button>
          <button type="button" class="btn btn--ghost" data-delete="${d.id}"><i class="fa-solid fa-trash" aria-hidden="true"></i>Elimina</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="5">Nessun discepolo registrato. Aggiungine uno dal modulo qui sopra.</td></tr>`;

    discepoliTbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => editDiscepolo(rows.find(d => d.id === btn.dataset.edit)));
    });
    discepoliTbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteDiscepolo(btn.dataset.delete));
    });
  }

  function editDiscepolo(d) {
    discepoloIdEl.value = d.id;
    discepoloNomeEl.value    = d.nome || '';
    discepoloGradoEl.value   = d.grado_id || '';
    discepoloUtenteEl.value  = d.user_id || '';
    document.getElementById('discepolo-nota').value = d.nota || '';
    discepoloUtenteEl.dispatchEvent(new Event('change'));
    discepoloCancel.classList.remove('hidden');
    apriModulo(discepoloForm);
  }

  function resetDiscepoloForm() {
    discepoloForm.reset();
    discepoloIdEl.value = '';
    discepoloNomeEl.disabled = false;
    discepoloNomeEl.required = true;
    discepoloCancel.classList.add('hidden');
    discepoloError.textContent = '';
  }

  discepoloCancel.addEventListener('click', resetDiscepoloForm);

  async function deleteDiscepolo(id) {
    if (!(await confirmDialog('Eliminare questo discepolo?'))) return;
    const { error } = await sb.from('discepoli').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Discepolo eliminato.');
    loadDiscepoli();
  }

  discepoloForm.addEventListener('submit', async e => {
    e.preventDefault();
    discepoloError.textContent = '';

    const userId = discepoloUtenteEl.value || null;
    const utenteScelto = directory.find(u => u.id === userId);

    const payload = {
      grado_id: discepoloGradoEl.value,
      user_id:  userId,
      // Se collegato a un account, il nome mostrato verrà comunque letto
      // dal profilo (vedi loadDiscepoli/discepoli.html): qui salviamo
      // comunque un fallback sensato nel caso l'account venga scollegato.
      nome:     userId ? (utenteScelto ? utenteScelto.display_name : 'Membro') : discepoloNomeEl.value.trim(),
      nota:     document.getElementById('discepolo-nota').value.trim() || null,
    };

    if (!payload.grado_id) { discepoloError.textContent = 'Seleziona un grado.'; return; }

    const id = discepoloIdEl.value;
    const { error } = id
      ? await sb.from('discepoli').update(payload).eq('id', id)
      : await sb.from('discepoli').insert(payload);

    if (error) { discepoloError.textContent = error.message; return; }
    showToast(id ? `Discepolo "${payload.nome}" aggiornato.` : `Discepolo "${payload.nome}" aggiunto.`);
    resetDiscepoloForm();
    loadDiscepoli();
  });

  /* ── GRADI ──────────────────────────────────────────────────── */
  const gradoForm    = document.getElementById('grado-form');
  const gradoIdEl    = document.getElementById('grado-id');
  const gradoError   = document.getElementById('grado-error');
  const gradoCancel  = document.getElementById('grado-cancel-btn');
  const gradiTbody   = document.getElementById('gradi-tbody');

  async function loadGradiTab() {
    const { data, error } = await sb.from('gradi').select('*').order('ordine');
    if (error) { gradoError.textContent = error.message; return; }

    gradiTbody.innerHTML = (data || []).map(g => `
      <tr>
        <td>${g.ordine}</td>
        <td>${g.simbolo ? g.simbolo + ' ' : ''}${g.nome}</td>
        <td>${g.punti_minimi ?? '—'}</td>
        <td>${(g.descrizione || '').slice(0, 90)}${(g.descrizione || '').length > 90 ? '…' : ''}</td>
        <td class="row-actions">
          <button type="button" class="btn btn--outline" data-edit="${g.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i>Modifica</button>
          <button type="button" class="btn btn--ghost" data-delete="${g.id}"><i class="fa-solid fa-trash" aria-hidden="true"></i>Elimina</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="5">Nessun grado configurato.</td></tr>`;

    gradiTbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => editGrado(data.find(g => g.id === btn.dataset.edit)));
    });
    gradiTbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteGrado(btn.dataset.delete));
    });
  }

  function editGrado(g) {
    gradoIdEl.value = g.id;
    document.getElementById('grado-nome').value        = g.nome || '';
    document.getElementById('grado-simbolo').value      = g.simbolo || '';
    document.getElementById('grado-ordine').value       = g.ordine ?? 0;
    document.getElementById('grado-descrizione').value  = g.descrizione || '';
    document.getElementById('grado-privilegi').value    = g.privilegi || '';
    document.getElementById('grado-punti').value        = g.punti_minimi ?? '';
    gradoCancel.classList.remove('hidden');
    apriModulo(gradoForm);
  }

  function resetGradoForm() {
    gradoForm.reset();
    gradoIdEl.value = '';
    gradoCancel.classList.add('hidden');
    gradoError.textContent = '';
  }

  gradoCancel.addEventListener('click', resetGradoForm);

  async function deleteGrado(id) {
    if (!(await confirmDialog('Eliminare questo grado? Fallisce se è ancora usato da discepoli o utenti.'))) return;
    const { error } = await sb.from('gradi').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Grado eliminato.');
    await refreshGradiOvunque();
  }

  gradoForm.addEventListener('submit', async e => {
    e.preventDefault();
    gradoError.textContent = '';

    const payload = {
      nome:        document.getElementById('grado-nome').value.trim(),
      simbolo:     document.getElementById('grado-simbolo').value.trim() || null,
      ordine:      Number(document.getElementById('grado-ordine').value) || 0,
      descrizione: document.getElementById('grado-descrizione').value.trim() || null,
      privilegi:   document.getElementById('grado-privilegi').value.trim() || null,
      // Vuoto = grado che non si guadagna coi punti
      punti_minimi: document.getElementById('grado-punti').value === '' ? null : Number(document.getElementById('grado-punti').value),
    };

    const id = gradoIdEl.value;
    const { error } = id
      ? await sb.from('gradi').update(payload).eq('id', id)
      : await sb.from('gradi').insert(payload);

    if (error) { gradoError.textContent = error.message; return; }
    showToast(id ? `Grado "${payload.nome}" aggiornato.` : `Grado "${payload.nome}" creato.`);
    resetGradoForm();
    await refreshGradiOvunque();
  });

  // Dopo aver aggiunto/modificato/eliminato un grado, aggiorna anche le
  // select che lo usano altrove nel Pannello (Discepoli, Utenti).
  async function refreshGradiOvunque() {
    await loadGradi();
    await loadGradiTab();
    if (isAdmin) loadUtenti();
  }

  /* ── PRODOTTI (catalogo dello Shop) ─────────────────────────── */
  const prodottoForm     = document.getElementById('prodotto-form');
  const prodottoFormTitle = document.getElementById('prodotto-form-title');
  const prodottoIdEl     = document.getElementById('prodotto-id');
  const prodottoError    = document.getElementById('prodotto-error');
  const prodottoCancel   = document.getElementById('prodotto-cancel-btn');
  const prodottiTbody    = document.getElementById('prodotti-tbody');
  const prodottoImmagineEl   = document.getElementById('prodotto-immagine');
  const prodottoImmagineFile = document.getElementById('prodotto-immagine-file');
  const prodottoUploadStatus = document.getElementById('prodotto-upload-status');
  const prodottoImmaginePreview = document.getElementById('prodotto-immagine-preview');
  const PRODOTTO_UPLOAD_DEFAULT = prodottoUploadStatus.textContent;
  let prodottiList = [];

  async function loadProdotti() {
    const { data, error } = await sb.from('prodotti').select('*').order('ordine').order('nome');
    if (error) { prodottoError.textContent = error.message; return; }
    prodottiList = data || [];

    prodottiTbody.innerHTML = prodottiList.map(p => `
      <tr>
        <td>${p.ordine}</td>
        <td>${p.immagine ? '' : escapeHtml(p.icona || '🛍️') + ' '}${escapeHtml(p.nome)}</td>
        <td>${escapeHtml(p.prezzo || '—')}</td>
        <td>
          <label class="form-checkbox" title="Rende il prodotto acquistabile o lo segna come non disponibile">
            <input type="checkbox" data-disponibile="${p.id}" ${p.disponibile ? 'checked' : ''}>
          </label>
        </td>
        <td>${p.riservato ? '<i class="fa-solid fa-lock" aria-hidden="true"></i> Sì' : '—'}</td>
        <td class="row-actions">
          <button type="button" class="btn btn--outline" data-edit="${p.id}"><i class="fa-solid fa-pen" aria-hidden="true"></i>Modifica</button>
          <button type="button" class="btn btn--ghost" data-delete="${p.id}"><i class="fa-solid fa-trash" aria-hidden="true"></i>Elimina</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="6">Nessun prodotto. Aggiungine uno dal modulo qui sopra.</td></tr>`;

    prodottiTbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => editProdotto(prodottiList.find(p => p.id === btn.dataset.edit)));
    });
    prodottiTbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteProdotto(btn.dataset.delete));
    });
    // Disponibilità modificabile direttamente dalla tabella, senza aprire il modulo
    prodottiTbody.querySelectorAll('[data-disponibile]').forEach(box => {
      box.addEventListener('change', async () => {
        const p = prodottiList.find(x => x.id === box.dataset.disponibile);
        const { error } = await sb.from('prodotti')
          .update({ disponibile: box.checked, updated_at: new Date().toISOString() })
          .eq('id', p.id);
        if (error) { showToast(error.message, 'error'); loadProdotti(); return; }
        p.disponibile = box.checked;
        showToast(`"${p.nome}" ${box.checked ? 'ora è disponibile' : 'segnato come non disponibile'}.`);
      });
    });
  }

  function updateProdottoPreview() {
    const url = prodottoImmagineEl.value.trim();
    prodottoImmaginePreview.classList.toggle('hidden', !url);
    if (url) prodottoImmaginePreview.src = url;
  }

  prodottoImmagineEl.addEventListener('input', updateProdottoPreview);

  prodottoImmagineFile.addEventListener('change', async () => {
    const file = prodottoImmagineFile.files[0];
    if (!file) return;

    prodottoUploadStatus.textContent = 'Caricamento in corso...';
    const { url, error } = await uploadImmagine('prodotti-immagini', file);
    if (error) {
      prodottoUploadStatus.textContent = `Errore upload: ${error.message}`;
      showToast(`Caricamento immagine non riuscito: ${error.message}`, 'error');
      return;
    }

    prodottoImmagineEl.value = url;
    updateProdottoPreview();
    prodottoUploadStatus.textContent = '✓ Immagine caricata.';
  });

  function editProdotto(p) {
    prodottoIdEl.value = p.id;
    prodottoFormTitle.textContent = `Modifica: ${p.nome}`;
    document.getElementById('prodotto-nome').value        = p.nome || '';
    document.getElementById('prodotto-prezzo').value      = p.prezzo || '';
    document.getElementById('prodotto-ordine').value      = p.ordine ?? 0;
    document.getElementById('prodotto-icona').value       = p.icona || '';
    document.getElementById('prodotto-disponibile').checked = p.disponibile;
    document.getElementById('prodotto-riservato').checked   = !!p.riservato;
    document.getElementById('prodotto-descrizione').value = p.descrizione || '';
    prodottoImmagineEl.value = p.immagine || '';
    updateProdottoPreview();
    prodottoUploadStatus.textContent = PRODOTTO_UPLOAD_DEFAULT;
    prodottoCancel.classList.remove('hidden');
    apriModulo(prodottoForm);
  }

  function resetProdottoForm() {
    prodottoForm.reset();
    prodottoIdEl.value = '';
    prodottoFormTitle.textContent = 'Nuovo Prodotto';
    // Un nuovo prodotto va in fondo al catalogo
    document.getElementById('prodotto-ordine').value = Math.max(0, ...prodottiList.map(p => p.ordine)) + 10;
    prodottoCancel.classList.add('hidden');
    prodottoError.textContent = '';
    prodottoUploadStatus.textContent = PRODOTTO_UPLOAD_DEFAULT;
    prodottoImmaginePreview.classList.add('hidden');
  }

  prodottoCancel.addEventListener('click', resetProdottoForm);

  async function deleteProdotto(id) {
    const p = prodottiList.find(x => x.id === id);
    if (!(await confirmDialog(`Eliminare "${p.nome}" dal catalogo? L'azione è irreversibile.`))) return;
    const { error } = await sb.from('prodotti').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(`"${p.nome}" eliminato dal catalogo.`);
    await loadProdotti();
    if (!prodottoIdEl.value) resetProdottoForm();
  }

  prodottoForm.addEventListener('submit', async e => {
    e.preventDefault();
    prodottoError.textContent = '';

    const payload = {
      nome:        document.getElementById('prodotto-nome').value.trim(),
      prezzo:      document.getElementById('prodotto-prezzo').value.trim() || null,
      ordine:      Number(document.getElementById('prodotto-ordine').value) || 0,
      immagine:    prodottoImmagineEl.value.trim() || null,
      icona:       document.getElementById('prodotto-icona').value.trim() || null,
      disponibile: document.getElementById('prodotto-disponibile').checked,
      riservato:   document.getElementById('prodotto-riservato').checked,
      descrizione: document.getElementById('prodotto-descrizione').value.trim() || null,
      updated_at:  new Date().toISOString(),
    };

    const id = prodottoIdEl.value;
    const { error } = id
      ? await sb.from('prodotti').update(payload).eq('id', id)
      : await sb.from('prodotti').insert(payload);

    if (error) { prodottoError.textContent = error.message; return; }
    showToast(id ? `Prodotto "${payload.nome}" aggiornato.` : `Prodotto "${payload.nome}" aggiunto al catalogo.`);
    await loadProdotti();
    resetProdottoForm();
  });

  /* ── UTENTI (solo Admin) ────────────────────────────────────── */
  const utentiTbody = document.getElementById('utenti-tbody');
  const ROLES = ['admin', 'editor', 'compagno', 'utente'];

  const promozioniBox  = document.getElementById('promozioni-box');
  const promozioniList = document.getElementById('promozioni-list');

  async function loadPromozioni() {
    const { data, error } = await sb.rpc('promozioni_proposte');
    if (error) { console.error('[Pannello] promozioni_proposte:', error); promozioniBox.classList.add('hidden'); return; }

    promozioniBox.classList.toggle('hidden', !data.length);
    promozioniList.innerHTML = data.map(pr => `
      <div class="list-row">
        <div>
          <p class="list-row__title">${escapeHtml(pr.display_name)} · ${pr.punti} punti</p>
          <p class="list-row__meta">${escapeHtml(pr.grado_attuale || 'Nessun grado')} → <strong>${escapeHtml(pr.grado_proposto)}</strong></p>
        </div>
        <button type="button" class="btn btn--primary" data-promuovi="${pr.user_id}">
          <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>Promuovi
        </button>
      </div>`).join('');

    promozioniList.querySelectorAll('[data-promuovi]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pr = data.find(x => x.user_id === btn.dataset.promuovi);
        if (!(await confirmDialog(`Promuovere ${pr.display_name} a ${pr.grado_proposto}?`))) return;
        const { error: promError } = await sb.rpc('admin_promuovi', { target_user_id: pr.user_id, new_grado_id: pr.grado_proposto_id });
        if (promError) { showToast(promError.message, 'error'); return; }
        showToast(`${pr.display_name} ora è ${pr.grado_proposto}.`);
        loadUtenti();
        loadDiscepoli();
      });
    });
  }

  async function loadUtenti() {
    if (!isAdmin) return;
    const [{ data, error }, { data: classifica }] = await Promise.all([
      sb.from('admin_users').select('*').order('created_at', { ascending: false }),
      sb.rpc('classifica'),
    ]);
    if (error) { utentiTbody.innerHTML = `<tr><td colspan="8">${error.message}</td></tr>`; return; }
    const puntiDi = Object.fromEntries((classifica || []).map(c => [c.user_id, c.punti]));
    loadPromozioni();

    utentiTbody.innerHTML = (data || []).map(u => `
      <tr>
        <td>${u.full_name || '—'}</td>
        <td>${u.username || '—'}</td>
        <td>${u.email}</td>
        <td>
          <select class="form-select" data-role-for="${u.id}" ${u.id === profile.id ? 'disabled title="Non puoi modificare il tuo stesso ruolo"' : ''}>
            ${ROLES.map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${SemmenAuth.ROLE_LABELS[r]}</option>`).join('')}
          </select>
        </td>
        <td>
          <select class="form-select" data-grado-for="${u.id}">
            <option value="">— Nessuno —</option>
            ${gradiList.map(g => `<option value="${g.id}" ${g.id === u.grado_id ? 'selected' : ''}>${g.simbolo ? g.simbolo + ' ' : ''}${g.nome}</option>`).join('')}
          </select>
        </td>
        <td>${puntiDi[u.id] ?? '—'}</td>
        <td>
          <select class="form-select" data-invitante-for="${u.id}">
            <option value="">— Nessuno —</option>
            ${directory.filter(d => d.id !== u.id).map(d => `<option value="${d.id}" ${d.id === u.invitato_da ? 'selected' : ''}>${escapeHtml(d.display_name)}</option>`).join('')}
          </select>
        </td>
        <td>${new Date(u.created_at).toLocaleDateString('it-IT')}</td>
      </tr>
    `).join('') || `<tr><td colspan="8">Nessun utente registrato.</td></tr>`;

    const nomeUtente = id => {
      const u = data.find(x => x.id === id);
      return u ? (u.username || u.full_name || u.email) : 'utente';
    };

    utentiTbody.querySelectorAll('[data-role-for]').forEach(select => {
      select.addEventListener('change', async () => {
        const userId = select.dataset.roleFor;
        const { error } = await sb.rpc('admin_set_role', { target_user_id: userId, new_role: select.value });
        // In caso di errore si ricarica la tabella, così la select torna al valore reale
        if (error) { showToast(error.message, 'error'); loadUtenti(); return; }
        showToast(`Ruolo di ${nomeUtente(userId)}: ${SemmenAuth.ROLE_LABELS[select.value]}.`);
      });
    });

    utentiTbody.querySelectorAll('[data-grado-for]').forEach(select => {
      select.addEventListener('change', async () => {
        const userId = select.dataset.gradoFor;
        const { error } = await sb.rpc('admin_set_grado', { target_user_id: userId, new_grado_id: select.value || null });
        if (error) { showToast(error.message, 'error'); loadUtenti(); return; }
        showToast(`Grado di ${nomeUtente(userId)}: ${select.value ? gradoLabel(select.value) : 'nessuno'}.`);
        loadPromozioni();
      });
    });

    utentiTbody.querySelectorAll('[data-invitante-for]').forEach(select => {
      select.addEventListener('change', async () => {
        const userId = select.dataset.invitanteFor;
        const { error } = await sb.rpc('admin_set_invitante', { target_user_id: userId, invitante_id: select.value || null });
        if (error) { showToast(error.message, 'error'); loadUtenti(); return; }
        showToast(select.value
          ? `${nomeUtente(userId)} risulta invitato da ${nomeUtente(select.value)}.`
          : `Rimosso l'invitante di ${nomeUtente(userId)}.`);
      });
    });
  }

  /* ── Init ───────────────────────────────────────────────────── */
  await loadGradi();
  await loadDirectory();
  loadEventi();
  loadDiscepoli();
  loadGradiTab();
  loadProdotti().then(resetProdottoForm);
  loadUtenti();
})();
