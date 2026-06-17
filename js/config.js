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
  },

  /* ── SHOP ─────────────────────────────────────────────────── */
  shop: {
    title:          "Emporio della Setta",
    subtitle:       "Reliquie Ufficiali dell'Ordine",
    description:    "Il negozio sacro della Setta è in fase di allestimento.<br>Presto potrai acquisire le reliquie ufficiali dell'Ordine.<br>Preparati all'indottrinamento commerciale.",
    badge:          "Prossimamente",
    sectionLabel:   "Catalogo Sacro",
    sectionTitle:   "Le Reliquie",
    sectionSubtitle: "Oggetti di potere supremo per i fedeli dell'Ordine",
    products: [
      // { icon: '👕', name: 'T-Shirt', description: 'Descrizione...', price: '€19.99', available: false },
    ],
  },

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
