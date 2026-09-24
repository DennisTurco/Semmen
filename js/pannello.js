/**
 * pannello.js — gestione contenuti (Editor/Admin) e utenti (solo Admin)
 */

(async () => {
  const profile = await SemmenAuth.requireRole(['admin', 'editor']);
  if (!profile) return;

  const sb = SemmenAuth.db();
  const isAdmin = profile.role === 'admin';

  /* ── Modal conferma/avviso (sostituisce confirm()/alert()) ────── */
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

  async function alertDialog(message) {
    await showModal({ title: 'Attenzione', message, showCancel: false });
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
    });
  });

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

  async function loadEventi() {
    const { data: eventi, error } = await sb.from('eventi').select('*').order('data', { ascending: false });
    if (error) { eventoError.textContent = error.message; return; }

    const { data: partecipazioni } = await sb.from('event_partecipazioni').select('evento_id');
    const counts = {};
    (partecipazioni || []).forEach(p => { counts[p.evento_id] = (counts[p.evento_id] || 0) + 1; });

    eventiTbody.innerHTML = (eventi || []).map(ev => `
      <tr>
        <td>${ev.titolo}</td>
        <td>${calcolaStatoEvento(ev.data)}</td>
        <td>${ev.data_testo || ev.data || '—'}</td>
        <td>${counts[ev.id] || 0}</td>
        <td class="row-actions">
          <button type="button" class="btn btn--outline" data-edit="${ev.id}">Modifica</button>
          <button type="button" class="btn btn--ghost" data-delete="${ev.id}">Elimina</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="5">Nessun evento. Aggiungine uno dal modulo qui sopra.</td></tr>`;

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

    const ext  = file.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await SemmenAuth.client
      .storage.from('eventi-immagini')
      .upload(path, file, { upsert: false });

    if (uploadError) {
      eventoUploadStatus.textContent = `Errore upload: ${uploadError.message}`;
      return;
    }

    const { data } = SemmenAuth.client.storage.from('eventi-immagini').getPublicUrl(path);
    eventoImmagineEl.value = data.publicUrl;
    updateEventoPreview();
    eventoUploadStatus.textContent = '✓ Immagine caricata.';
  });

  function editEvento(ev) {
    eventoIdEl.value = ev.id;
    document.getElementById('evento-titolo').value      = ev.titolo || '';
    document.getElementById('evento-data').value          = ev.data || '';
    document.getElementById('evento-data-testo').value    = ev.data_testo || '';
    document.getElementById('evento-durata').value        = ev.durata || '';
    document.getElementById('evento-luogo').value         = ev.luogo || '';
    eventoImmagineEl.value                                 = ev.immagine || '';
    document.getElementById('evento-credito').value       = ev.credito_immagine || '';
    document.getElementById('evento-descrizione').value   = ev.descrizione || '';
    updateEventoPreview();
    eventoUploadStatus.textContent = UPLOAD_STATUS_DEFAULT;
    eventoCancel.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetEventoForm() {
    eventoForm.reset();
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
    if (error) { await alertDialog(error.message); return; }
    loadEventi();
  }

  eventoForm.addEventListener('submit', async e => {
    e.preventDefault();
    eventoError.textContent = '';

    const payload = {
      titolo:           document.getElementById('evento-titolo').value.trim(),
      data:              document.getElementById('evento-data').value || null,
      stato:             calcolaStatoEvento(document.getElementById('evento-data').value || null),
      data_testo:        document.getElementById('evento-data-testo').value.trim() || null,
      durata:            document.getElementById('evento-durata').value.trim() || null,
      luogo:             document.getElementById('evento-luogo').value.trim() || null,
      immagine:          document.getElementById('evento-immagine').value.trim() || null,
      credito_immagine:  document.getElementById('evento-credito').value.trim() || null,
      descrizione:       document.getElementById('evento-descrizione').value.trim() || null,
      updated_at:        new Date().toISOString(),
    };

    const id = eventoIdEl.value;
    const { error } = id
      ? await sb.from('eventi').update(payload).eq('id', id)
      : await sb.from('eventi').insert(payload);

    if (error) { eventoError.textContent = error.message; return; }
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
          <button type="button" class="btn btn--outline" data-edit="${d.id}">Modifica</button>
          <button type="button" class="btn btn--ghost" data-delete="${d.id}">Elimina</button>
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (error) { await alertDialog(error.message); return; }
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
        <td>${(g.descrizione || '').slice(0, 90)}${(g.descrizione || '').length > 90 ? '…' : ''}</td>
        <td class="row-actions">
          <button type="button" class="btn btn--outline" data-edit="${g.id}">Modifica</button>
          <button type="button" class="btn btn--ghost" data-delete="${g.id}">Elimina</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="4">Nessun grado configurato.</td></tr>`;

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
    gradoCancel.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (error) { await alertDialog(error.message); return; }
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
    };

    const id = gradoIdEl.value;
    const { error } = id
      ? await sb.from('gradi').update(payload).eq('id', id)
      : await sb.from('gradi').insert(payload);

    if (error) { gradoError.textContent = error.message; return; }
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

  /* ── UTENTI (solo Admin) ────────────────────────────────────── */
  const utentiTbody = document.getElementById('utenti-tbody');
  const ROLES = ['admin', 'editor', 'compagno', 'utente'];

  async function loadUtenti() {
    if (!isAdmin) return;
    const { data, error } = await sb.from('admin_users').select('*').order('created_at', { ascending: false });
    if (error) { utentiTbody.innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`; return; }

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
        <td>${new Date(u.created_at).toLocaleDateString('it-IT')}</td>
        <td><span class="hidden" id="saved-${u.id}" style="color:var(--gold);font-size:0.75rem;">✓ salvato</span></td>
      </tr>
    `).join('') || `<tr><td colspan="7">Nessun utente registrato.</td></tr>`;

    function flashSaved(userId) {
      const badge = document.getElementById(`saved-${userId}`);
      badge.classList.remove('hidden');
      setTimeout(() => badge.classList.add('hidden'), 2000);
    }

    utentiTbody.querySelectorAll('[data-role-for]').forEach(select => {
      select.addEventListener('change', async () => {
        const userId = select.dataset.roleFor;
        const { error } = await sb.rpc('admin_set_role', { target_user_id: userId, new_role: select.value });
        if (error) { await alertDialog(error.message); return; }
        flashSaved(userId);
      });
    });

    utentiTbody.querySelectorAll('[data-grado-for]').forEach(select => {
      select.addEventListener('change', async () => {
        const userId = select.dataset.gradoFor;
        const { error } = await sb.rpc('admin_set_grado', { target_user_id: userId, new_grado_id: select.value || null });
        if (error) { await alertDialog(error.message); return; }
        flashSaved(userId);
      });
    });
  }

  /* ── Init ───────────────────────────────────────────────────── */
  await loadGradi();
  await loadDirectory();
  loadEventi();
  loadDiscepoli();
  loadGradiTab();
  loadUtenti();
})();
