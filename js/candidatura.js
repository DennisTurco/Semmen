/**
 * candidatura.js — form di candidatura alla Setta del Semmen
 */

/* ── State ──────────────────────────────────────────────────── */
let currentStep = 1;
const TOTAL_STEPS = 4;

/* ── Elementi DOM ───────────────────────────────────────────── */
const form        = document.getElementById('candidatura-form');
const steps       = document.querySelectorAll('.form-step');
const stepDots    = document.querySelectorAll('.step-dot');
const stepItems   = document.querySelectorAll('.step-item');
const successScreen = document.getElementById('success-screen');
const submitBtn   = document.getElementById('submit-btn');
const submitText  = document.getElementById('submit-text');
const submitSpinner = document.getElementById('submit-spinner');

/* ── Navigazione step ───────────────────────────────────────── */
function goToStep(n) {
  if (n < 1 || n > TOTAL_STEPS) return;
  if (n > currentStep && !validateStep(currentStep)) return;

  steps.forEach((s, i) => s.classList.toggle('active', i + 1 === n));

  stepItems.forEach((item, i) => {
    item.classList.remove('active', 'done');
    if (i + 1 === n) item.classList.add('active');
    if (i + 1 < n)  item.classList.add('done');
  });

  currentStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-next]').forEach(btn => {
  btn.addEventListener('click', () => goToStep(currentStep + 1));
});

document.querySelectorAll('[data-prev]').forEach(btn => {
  btn.addEventListener('click', () => goToStep(currentStep - 1));
});

/* ── Validazione ────────────────────────────────────────────── */
function validateStep(step) {
  const currentEl = document.querySelector(`.form-step[data-step="${step}"]`);
  const required  = currentEl.querySelectorAll('[required]');
  let valid = true;

  required.forEach(field => {
    clearError(field);
    if (!field.value.trim()) {
      showFieldError(field, 'Campo obbligatorio');
      valid = false;
    } else if (field.type === 'email' && !isValidEmail(field.value)) {
      showFieldError(field, 'Indirizzo email non valido');
      valid = false;
    }
  });

  // Checkbox speciali
  if (step === 3) {
    const cbRegolamento = document.getElementById('accept-regolamento');
    if (!cbRegolamento.checked) {
      showFieldError(cbRegolamento, 'Devi accettare il Regolamento Sacro');
      valid = false;
    }
  }

  if (step === 4) {
    const cbGiuramento = document.getElementById('accept-giuramento');
    if (!cbGiuramento.checked) {
      showFieldError(cbGiuramento, 'Devi pronunciare il Giuramento');
      valid = false;
    }
  }

  return valid;
}

function showFieldError(field, msg) {
  field.style.borderColor = 'var(--crimson-bright)';
  const existing = field.parentElement.querySelector('.field-error');
  if (!existing) {
    const err = document.createElement('p');
    err.className = 'field-error';
    err.style.cssText = 'color:var(--crimson-bright);font-size:0.82rem;margin-top:0.3rem;font-family:var(--font-ui)';
    err.textContent = msg;
    field.parentElement.appendChild(err);
  }
}

function clearError(field) {
  field.style.borderColor = '';
  const err = field.parentElement.querySelector('.field-error');
  if (err) err.remove();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ── Invio form ─────────────────────────────────────────────── */
form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!validateStep(currentStep)) return;

  // Raccogli dati
  const data = collectFormData();

  // Stato loading
  submitBtn.disabled = true;
  submitText.textContent = 'Trasmissione in corso...';
  submitSpinner.classList.remove('hidden');

  // Controlla configurazione EmailJS
  if (!CONFIG.email.publicKey || CONFIG.email.publicKey.startsWith('__')) {
    // Modalità demo: simula invio
    await fakeSend();
    showSuccess(data);
    return;
  }

  // Invio reale con EmailJS
  try {
    emailjs.init(CONFIG.email.publicKey);

    await emailjs.send(CONFIG.email.serviceId, CONFIG.email.templateId, {
      to_email:        CONFIG.email.recipient,
      subject:         `${CONFIG.email.subjectPrefix} ${data.nome} ${data.cognome}`,

      // Dati candidato
      nome:            data.nome,
      cognome:         data.cognome,
      email:           data.email,
      telefono:        data.telefono,
      discord:         data.discord || 'N/D',
      eta:             data.eta,
      sesso:           data.sesso,
      professione:     data.professione,
      provenienza:     data.provenienza,

      // Domande sacre
      find_us:         data.find_us,
      motivazione:     data.motivazione,
      flosscio:        data.flosscio        || 'N/D',
      risposta_giusta: data.risposta_giusta || 'N/D',

      // Timestamp
      data_candidatura: new Date().toLocaleString('it-IT'),
    });

    showSuccess(data);

  } catch (err) {
    console.error('[Candidatura] EmailJS error:', err);
    showSendError(err);
  }
});

/* ── Raccolta dati ──────────────────────────────────────────── */
function collectFormData() {
  const fd = new FormData(form);
  const data = {};
  for (const [key, value] of fd.entries()) {
    data[key] = value;
  }
  return data;
}

/* ── Fake send (demo) ───────────────────────────────────────── */
function fakeSend() {
  return new Promise(resolve => setTimeout(resolve, 2000));
}

/* ── Success ────────────────────────────────────────────────── */
function showSuccess(data) {
  form.parentElement.classList.add('hidden');
  successScreen.classList.add('visible');

  // Genera codice candidato
  const code = generateCandidateCode(data.nome || 'IGNOTO');
  document.getElementById('candidate-code').textContent = code;

  // Re-inject seal
  document.querySelectorAll('.seal-container').forEach(el => {
    if (typeof SEAL_SVG !== 'undefined') {
      el.innerHTML = SEAL_SVG;
      const svg = el.querySelector('svg');
      if (svg) svg.style.color = 'var(--gold)';
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Errore invio ───────────────────────────────────────────── */
function showSendError(err) {
  submitBtn.disabled = false;
  submitText.textContent = 'Pronuncia il Giuramento';
  submitSpinner.classList.add('hidden');

  const alertEl = document.getElementById('send-error');
  alertEl.classList.remove('hidden');
  alertEl.textContent = `Errore di trasmissione: ${err.text || err.message || 'Sconosciuto'}. Riprova o contatta il Ahckmed, Creatore del Semmen.`;
}

/* ── Codice candidato ───────────────────────────────────────── */
function generateCandidateCode(nome) {
  const prefix = 'SMM';
  const num    = String(Math.floor(Math.random() * 9000) + 1000);
  const suffix = nome.replace(/\s+/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
  return `${prefix}-${num}-${suffix}`;
}
