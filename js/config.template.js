const CONFIG = {
  /* ── SITO ──────────────────────────────────────────────────── */
  site: {
    name:    "La Setta del Semmen",
    tagline: "Ordo Arcanus Memorum",
    year:    "MMXXIV",
    baseUrl: "",
  },

  /* ── SUPABASE ──────────────────────────────────────────────────
     URL e anon key del progetto Supabase (Project Settings → API).
     L'anon key è pubblica per design: la sicurezza reale è data
     dalle policy RLS definite in supabase/schema.sql, non da questo
     valore. Finché restano ai placeholder, il sito continua a
     funzionare con i dati statici sottostanti (eventi, discepoli)
     come fallback, e login/pannello risultano disabilitati. */
  supabase: {
    url:     "__SUPABASE_URL__",
    anonKey: "__SUPABASE_ANON_KEY__",
  },

  /* ── EMAIL (EmailJS) ───────────────────────────────────────── */
  email: {
    publicKey:  "__EMAILJS_PUBLIC_KEY__",
    serviceId:  "__EMAILJS_SERVICE_ID__",
    templateId: "__EMAILJS_TEMPLATE_ID__",
    recipient:  "dennisturco@gmail.com",
    subjectPrefix: "[CANDIDATURA SEMMEN]",

    /* Template dedicato alle richieste di acquisto dello shop.
       Lascia vuoto ("") per riusare templateId: sul piano gratuito
       di EmailJS (1 solo template) basta che templateId includa i
       campi generici {{subject}} e {{message}} per gestire anche
       queste richieste. */
    shopTemplateId: "",
    shopSubjectPrefix: "[ORDINE SHOP SEMMEN]",

    /* Le richieste di partecipazione agli eventi NON passano più da qui:
       eventi.html usa le candidature Supabase (tabella event_partecipazioni),
       visibili a Editor/Admin dal Pannello. */
  },

  /* ── DISCEPOLI ─────────────────────────────────────────────
     Dati di fallback usati solo se Supabase non è configurato,
     o mentre la tabella `discepoli` è ancora vuota. Una volta
     collegato Supabase, gestisci i membri dal Pannello (Editor/
     Admin) — non serve più modificare questo file. */
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

  /* ── EVENTI ────────────────────────────────────────────────
     Dati di fallback usati solo se Supabase non è configurato,
     o mentre la tabella `eventi` è ancora vuota. Una volta
     collegato Supabase, gestisci gli eventi dal Pannello (Editor/
     Admin) — non serve più modificare questo file.
     stato: "In programma" | "Imminente" | "Passato"
     data: usata per l'ordinamento cronologico (usa il 1° del mese
     se il giorno preciso non è ancora definito).
     dataTesto: etichetta mostrata in pagina (può indicare che la
     data precisa è ancora da definire).
     Aggiungi qui i prossimi eventi della Setta. Quelli passati
     restano in elenco per mantenere lo storico. */
  eventi: [
    {
      titolo:      "Raccolta delle Castagne",
      data:        "2026-10-01",
      dataTesto:   "Ottobre 2026 — data precisa da definire",
      durata:      "In giornata",
      luogo:       "Appennino Emiliano-Romagnolo",
      descrizione: "Pellegrinaggio dei fedeli nell'Appennino per la sacra raccolta delle castagne. Gita di un giorno.",
      immagine:    "img/eventi/raccolta-castagne.jpg",
      creditoImmagine: "Foto: Michal Klajban / Wikimedia Commons (CC BY-SA 4.0)",
      stato:       "In programma",
    },
    {
      titolo:      "Cammino della Via degli Dei",
      data:        "2027-03-01",
      dataTesto:   "Marzo–Aprile 2027 — data precisa da definire",
      durata:      "5-6 giorni",
      luogo:       "Bologna → Firenze",
      descrizione: "Cammino della Via degli Dei da Bologna a Firenze. Si dorme in tenda lungo il percorso.",
      immagine:    "img/eventi/via-degli-dei.jpg",
      creditoImmagine: "Foto: Mongolo1984 / Wikimedia Commons (CC BY-SA 4.0)",
      stato:       "In programma",
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
Object.freeze(CONFIG.supabase);
Object.freeze(CONFIG.email);
