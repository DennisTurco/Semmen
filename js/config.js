const CONFIG = {
  /* ── SITO ──────────────────────────────────────────────────── */
  site: {
    name:    "La Setta del Semmen",
    tagline: "Ordo Arcanus Memorum",
    year:    "MMXXIV",
    baseUrl: "",
  },

  /* ── WIKI ──────────────────────────────────────────────────── */
  wiki: {
    // Iniettata a build-time dal GitHub Actions (secret: WIKI_PASSWORD).
    // In locale usa il file .env.local oppure sostituisci qui temporaneamente.
    password: "semmensetta2025?",
    accessTitle: "Archivio Riservato",
    accessSubtitle: "Inserisci il Codice di Accesso",
  },

  /* ── EMAIL (EmailJS) ───────────────────────────────────────── */
  email: {
    // Valori iniettati a build-time dal GitHub Actions.
    // Secrets da configurare nel repo: EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID,
    // EMAILJS_TEMPLATE_ID, EMAILJS_RECIPIENT
    //
    // EmailJS usa anche il domain whitelisting come protezione aggiuntiva:
    // aggiungi il dominio GitHub Pages in emailjs.com → Account → Security.
    publicKey:  "__EMAILJS_PUBLIC_KEY__",
    serviceId:  "__EMAILJS_SERVICE_ID__",
    templateId: "__EMAILJS_TEMPLATE_ID__",
    recipient:  "dennisturco@gmail.com",
    subjectPrefix: "[CANDIDATURA SEMMEN]",
  },

  /* ── STATISTICHE HOMEPAGE ─────────────────────────────────── */
  stats: {
    members:  "XIV",
    memes:    "∞",
    heresies: "III",
    years:    "I",
  },

};

Object.freeze(CONFIG);
Object.freeze(CONFIG.site);
Object.freeze(CONFIG.wiki);
Object.freeze(CONFIG.email);
