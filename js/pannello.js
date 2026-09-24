/**
 * pannello.js — gestione contenuti (Editor/Admin) e utenti (solo Admin)
 */

(async () => {
  const profile = await SemmenAuth.requireRole(['admin', 'editor']);
  if (!profile) return;

  const sb = SemmenAuth.db();
  const isAdmin = profile.role === 'admin';

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
        <td>${ev.stato}</td>
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

  function editEvento(ev) {
    eventoIdEl.value = ev.id;
    document.getElementById('evento-titolo').value      = ev.titolo || '';
    document.getElementById('evento-stato').value        = ev.stato || 'In programma';
    document.getElementById('evento-data').value          = ev.data || '';
    document.getElementById('evento-data-testo').value    = ev.data_testo || '';
    document.getElementById('evento-durata').value        = ev.durata || '';
    document.getElementById('evento-luogo').value         = ev.luogo || '';
    document.getElementById('evento-immagine').value      = ev.immagine || '';
    document.getElementById('evento-credito').value       = ev.credito_immagine || '';
    document.getElementById('evento-descrizione').value   = ev.descrizione || '';
    eventoCancel.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetEventoForm() {
    eventoForm.reset();
    eventoIdEl.value = '';
    eventoCancel.classList.add('hidden');
    eventoError.textContent = '';
  }

  eventoCancel.addEventListener('click', resetEventoForm);

  async function deleteEvento(id) {
    if (!confirm('Eliminare questo evento? L\'azione è irreversibile.')) return;
    const { error } = await sb.from('eventi').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    loadEventi();
  }

  eventoForm.addEventListener('submit', async e => {
    e.preventDefault();
    eventoError.textContent = '';

    const payload = {
      titolo:           document.getElementById('evento-titolo').value.trim(),
      stato:             document.getElementById('evento-stato').value,
      data:              document.getElementById('evento-data').value || null,
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
  const discepoloForm   = document.getElementById('discepolo-form');
  const discepoloIdEl   = document.getElementById('discepolo-id');
  const discepoloError  = document.getElementById('discepolo-error');
  const discepoloCancel = document.getElementById('discepolo-cancel-btn');
  const discepoliTbody  = document.getElementById('discepoli-tbody');

  async function loadDiscepoli() {
    const { data, error } = await sb.from('discepoli').select('*').order('ordine').order('nome');
    if (error) { discepoloError.textContent = error.message; return; }

    discepoliTbody.innerHTML = (data || []).map(d => `
      <tr>
        <td>${d.nome}</td>
        <td>${d.grado}</td>
        <td>${d.ordine}</td>
        <td>${d.nota || ''}</td>
        <td class="row-actions">
          <button type="button" class="btn btn--outline" data-edit="${d.id}">Modifica</button>
          <button type="button" class="btn btn--ghost" data-delete="${d.id}">Elimina</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="5">Nessun discepolo registrato. Aggiungine uno dal modulo qui sopra.</td></tr>`;

    discepoliTbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => editDiscepolo(data.find(d => d.id === btn.dataset.edit)));
    });
    discepoliTbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteDiscepolo(btn.dataset.delete));
    });
  }

  function editDiscepolo(d) {
    discepoloIdEl.value = d.id;
    document.getElementById('discepolo-nome').value    = d.nome || '';
    document.getElementById('discepolo-grado').value   = d.grado || '';
    document.getElementById('discepolo-simbolo').value = d.simbolo || '';
    document.getElementById('discepolo-ordine').value  = d.ordine ?? 0;
    document.getElementById('discepolo-nota').value    = d.nota || '';
    discepoloCancel.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetDiscepoloForm() {
    discepoloForm.reset();
    discepoloIdEl.value = '';
    discepoloCancel.classList.add('hidden');
    discepoloError.textContent = '';
  }

  discepoloCancel.addEventListener('click', resetDiscepoloForm);

  async function deleteDiscepolo(id) {
    if (!confirm('Eliminare questo discepolo?')) return;
    const { error } = await sb.from('discepoli').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    loadDiscepoli();
  }

  discepoloForm.addEventListener('submit', async e => {
    e.preventDefault();
    discepoloError.textContent = '';

    const payload = {
      nome:    document.getElementById('discepolo-nome').value.trim(),
      grado:   document.getElementById('discepolo-grado').value.trim(),
      simbolo: document.getElementById('discepolo-simbolo').value.trim() || null,
      ordine:  Number(document.getElementById('discepolo-ordine').value) || 0,
      nota:    document.getElementById('discepolo-nota').value.trim() || null,
    };

    const id = discepoloIdEl.value;
    const { error } = id
      ? await sb.from('discepoli').update(payload).eq('id', id)
      : await sb.from('discepoli').insert(payload);

    if (error) { discepoloError.textContent = error.message; return; }
    resetDiscepoloForm();
    loadDiscepoli();
  });

  /* ── UTENTI (solo Admin) ────────────────────────────────────── */
  const utentiTbody = document.getElementById('utenti-tbody');
  const ROLES = ['admin', 'editor', 'compagno', 'utente'];

  async function loadUtenti() {
    if (!isAdmin) return;
    const { data, error } = await sb.from('admin_users').select('*').order('created_at', { ascending: false });
    if (error) { utentiTbody.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`; return; }

    utentiTbody.innerHTML = (data || []).map(u => `
      <tr>
        <td>${u.full_name || '—'}</td>
        <td>${u.email}</td>
        <td>
          <select class="form-select" data-role-for="${u.id}" ${u.id === profile.id ? 'disabled title="Non puoi modificare il tuo stesso ruolo"' : ''}>
            ${ROLES.map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${SemmenAuth.ROLE_LABELS[r]}</option>`).join('')}
          </select>
        </td>
        <td>${new Date(u.created_at).toLocaleDateString('it-IT')}</td>
        <td><span class="hidden" id="role-saved-${u.id}" style="color:var(--gold);font-size:0.75rem;">✓ salvato</span></td>
      </tr>
    `).join('') || `<tr><td colspan="5">Nessun utente registrato.</td></tr>`;

    utentiTbody.querySelectorAll('[data-role-for]').forEach(select => {
      select.addEventListener('change', async () => {
        const userId = select.dataset.roleFor;
        const { error } = await sb.rpc('admin_set_role', { target_user_id: userId, new_role: select.value });
        if (error) { alert(error.message); return; }
        const badge = document.getElementById(`role-saved-${userId}`);
        badge.classList.remove('hidden');
        setTimeout(() => badge.classList.add('hidden'), 2000);
      });
    });
  }

  /* ── Init ───────────────────────────────────────────────────── */
  loadEventi();
  loadDiscepoli();
  loadUtenti();
})();
