/**
 * attivita.js — bacheca Attività (kanban semplificata) per dividersi il
 * lavoro tecnico e non tra Compagno/Editor/Admin. Vede/modifica tutta la
 * bacheca chiunque abbia grado Compagno+; l'eliminazione resta riservata
 * a chi ha creato l'attività o a Editor/Admin (vedi RLS su semmen.attivita).
 */

(async () => {
  const profile = await SemmenAuth.requireRole(['admin', 'editor', 'compagno']);
  if (!profile) return;

  const sb = SemmenAuth.db();

  const STATI = [
    { key: 'da_fare',    label: 'Da Fare' },
    { key: 'in_corso',   label: 'In Corso' },
    { key: 'completato', label: 'Completato' },
  ];

  let directory    = []; // { id, display_name }
  let attivitaList = [];

  const form        = document.getElementById('attivita-form');
  const idEl         = document.getElementById('attivita-id');
  const titoloEl      = document.getElementById('attivita-titolo');
  const descrizioneEl = document.getElementById('attivita-descrizione');
  const assegnatoEl   = document.getElementById('attivita-assegnato');
  const errorEl       = document.getElementById('attivita-error');
  const cancelBtn      = document.getElementById('attivita-cancel-btn');
  const submitBtn      = document.getElementById('attivita-submit-btn');
  const formTitleEl    = document.getElementById('attivita-form-title');

  function formatData(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function nomeUtente(id) {
    if (!id) return null;
    const u = directory.find(x => x.id === id);
    return u ? u.display_name : 'Utente sconosciuto';
  }

  async function loadDirectory() {
    const { data, error } = await sb.rpc('utenti_assegnabili');
    if (error) { console.error('[Attivita] utenti_assegnabili error:', error); return; }
    directory = data || [];
    assegnatoEl.innerHTML = `<option value="">— Nessuno —</option>` +
      directory.map(u => `<option value="${u.id}">${u.display_name}</option>`).join('');
  }

  async function loadAttivita() {
    const { data, error } = await sb.from('attivita').select('*').order('created_at', { ascending: true });
    if (error) { errorEl.textContent = error.message; return; }
    attivitaList = data || [];
    render();
  }

  function render() {
    STATI.forEach(s => {
      const col = document.getElementById(`col-${s.key}`);
      const items = attivitaList.filter(a => a.stato === s.key);
      document.getElementById(`count-${s.key}`).textContent = items.length;

      col.innerHTML = items.map(a => {
        const puoEliminare = a.creato_da === profile.id || profile.role === 'admin' || profile.role === 'editor';
        const assegnatoLabel = nomeUtente(a.assegnato_a);
        const creatoLabel = nomeUtente(a.creato_da);

        return `
        <div class="attivita-card">
          <p class="attivita-card__titolo">${a.titolo}</p>
          ${a.descrizione ? `<p class="attivita-card__desc">${a.descrizione}</p>` : ''}
          <p class="attivita-card__meta">
            ${assegnatoLabel ? `Assegnata a: ${assegnatoLabel}` : 'Non assegnata'}
            ${creatoLabel ? ` · Creata da: ${creatoLabel}` : ''}
            · ${formatData(a.created_at)}
          </p>
          <div class="attivita-card__actions">
            <select data-cambia-stato="${a.id}">
              ${STATI.map(x => `<option value="${x.key}" ${x.key === a.stato ? 'selected' : ''}>${x.label}</option>`).join('')}
            </select>
            <button type="button" class="btn btn--outline" data-edit="${a.id}">Modifica</button>
            ${puoEliminare ? `<button type="button" class="btn btn--ghost" data-delete="${a.id}">Elimina</button>` : ''}
          </div>
        </div>`;
      }).join('') || `<p style="color:var(--text-muted);font-size:0.8rem;">Nessuna attività.</p>`;
    });

    bindCardEvents();
  }

  function bindCardEvents() {
    document.querySelectorAll('[data-cambia-stato]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const { error } = await sb
          .from('attivita')
          .update({ stato: sel.value, updated_at: new Date().toISOString() })
          .eq('id', sel.dataset.cambiaStato);
        if (error) { alert(error.message); return; }
        await loadAttivita();
      });
    });

    document.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => editAttivita(attivitaList.find(a => a.id === btn.dataset.edit)));
    });

    document.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteAttivita(btn.dataset.delete));
    });
  }

  function editAttivita(a) {
    if (!a) return;
    idEl.value = a.id;
    titoloEl.value = a.titolo || '';
    descrizioneEl.value = a.descrizione || '';
    assegnatoEl.value = a.assegnato_a || '';
    formTitleEl.textContent = 'Modifica Attività';
    submitBtn.textContent = 'Salva Modifiche';
    cancelBtn.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    form.reset();
    idEl.value = '';
    formTitleEl.textContent = 'Nuova Attività';
    submitBtn.textContent = 'Crea Attività';
    cancelBtn.classList.add('hidden');
    errorEl.textContent = '';
  }

  cancelBtn.addEventListener('click', resetForm);

  async function deleteAttivita(id) {
    if (!confirm('Eliminare questa attività?')) return;
    const { error } = await sb.from('attivita').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    await loadAttivita();
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errorEl.textContent = '';

    const payload = {
      titolo:      titoloEl.value.trim(),
      descrizione: descrizioneEl.value.trim() || null,
      assegnato_a: assegnatoEl.value || null,
    };

    const id = idEl.value;
    const { error } = id
      ? await sb.from('attivita').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id)
      : await sb.from('attivita').insert({ ...payload, creato_da: profile.id });

    if (error) { errorEl.textContent = error.message; return; }
    resetForm();
    await loadAttivita();
  });

  await loadDirectory();
  await loadAttivita();
})();
