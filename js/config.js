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
    password: "__WIKI_PASSWORD__",
    accessTitle: "Archivio Riservato",
    accessSubtitle: "Inserisci il Codice di Accesso",
  },

  /* ── EMAIL (EmailJS) ───────────────────────────────────────── */
  email: {
    publicKey:  "__EMAILJS_PUBLIC_KEY__",
    serviceId:  "__EMAILJS_SERVICE_ID__",
    templateId: "__EMAILJS_TEMPLATE_ID__",
    recipient:  "dennisturco@gmail.com",
    subjectPrefix: "[CANDIDATURA SEMMEN]",

    /* Template dedicato alle richieste di acquisto dello shop.
       Può coincidere con templateId se il template EmailJS usa
       variabili generiche come {{subject}} e {{message}}. */
    shopTemplateId: "__EMAILJS_SHOP_TEMPLATE_ID__",
    shopSubjectPrefix: "[ORDINE SHOP SEMMEN]",
  },

  /* ── DISCEPOLI ────────────────────────────────────────────── */
  discepoli: [
    {
      grado:   "Ahckmed, Creatore del Semmen",
      simbolo: "✦✦✦✦✦",
      membri:  [
        { nome: "Denno", nota: "Fondatore" },
      ],
    },
    {
      grado:   "Grande Anziano",
      simbolo: "✦✦✦✦",
      membri:  [
        // { nome: "Nome" },
      ],
    },
    {
      grado:   "Arconte del Semmen",
      simbolo: "✦✦✦✦",
      membri:  [
        { nome: "Vince" },
      ],
    },
    {
      grado:   "Custode del Semmen",
      simbolo: "✦✦✦",
      membri:  [
        { nome: "Dona" },
        { nome: "Giorgio" }
      ],
    },
    {
      grado:   "Menarca del Semmen",
      simbolo: "✦✦✦",
      membri:  [
        { nome: "Fra" },
      ],
    },
    {
      grado:   "Controllore del Semmen",
      simbolo: "✦✦",
      membri:  [
        { nome: "Filippo" },
      ],
    },
    {
      grado:   "Apprendista del Semmen",
      simbolo: "✦✦",
      membri:  [
        // { nome: "Nome" },
      ],
    },
    {
      grado:   "Sacerdotessa del Semmen",
      simbolo: "✦✦",
      membri:  [
        { nome: "Mariachiara", nota: "Meretrice di Ahckmed" },
        { nome: "Michela", nota: "Meretrice di Vince" },
        { nome: "Tipa di Giorgio", nota: "Meretrice di Giorgio" },
      ],
    },
    {
      grado:   "Adepto del Semmen",
      simbolo: "✦",
      membri:  [
        // { nome: "Fra" },
      ],
    },
    {
      grado:   "Candidato",
      simbolo: "◯",
      membri:  [
        // { nome: "Nome" },
      ],
    },
  ],

  /* ── STATISTICHE HOMEPAGE ─────────────────────────────────── */
  stats: {
    members:  "∞",
    memes:    "∞",
    heresies: "I",
    years:    "V",
  },

};

Object.freeze(CONFIG);
Object.freeze(CONFIG.site);
Object.freeze(CONFIG.wiki);
Object.freeze(CONFIG.email);
