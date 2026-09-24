# Semmen

## Sviluppo locale

1. Copia `.env.local` (già gitignored) e compila i valori (Supabase, EmailJS).

2. Genera `js/config.js` dal template:

   ```sh
   node scripts/build-config.js
   ```

3. Avvia un server statico locale:

   ```sh
   npx serve .
   ```

`js/config.js` è generato e non è tracciato da git — va rilanciato lo script ogni volta che cambi `.env.local` o `js/config.template.js`.

## Ruoli utente

Il `role` (tabella `semmen.profiles`) determina i **permessi**. È diverso dal **Grado** (Adepto, Arconte, ecc.), che è solo narrativo/di visualizzazione e non dà accesso a nulla — lo assegna l'Admin dal Pannello ed è usato solo per la pagina wiki "Gerarchia Interna" e per i Discepoli.

### `utente` (default alla registrazione)

- Può: navigare il sito, modificare il proprio profilo (nome, username, password), presentare la candidatura alla Setta (una volta inviata, passa automaticamente a grado "Candidato", visibile all'Admin).
- Non può: vedere le pagine wiki riservate, candidarsi a partecipare agli eventi, accedere al Pannello.

### `compagno`

- Può: tutto quello che può un `utente`, più: vedere le pagine wiki riservate (storia, meme, gerarchia interna), candidarsi agli eventi (`event_partecipazioni`) e ritirare la propria candidatura.
- Non può: accedere al Pannello, modificare contenuti (eventi, discepoli, gradi) o gestire altri utenti.

### `editor`

- Può: tutto quello che può un `compagno`, più: accedere al Pannello e gestire i **contenuti** — creare/modificare/eliminare Eventi, Discepoli e Gradi; vedere quanti si sono candidati a ogni evento; collegare un Discepolo a un account tramite un elenco minimale di utenti (solo id + nome mostrato, non l'intero profilo).
- Non può: vedere la tab Utenti del Pannello, cambiare ruolo o grado di un utente (bloccato anche lato database, non solo nella UI).

### `admin`

- Può: tutto quello che può un `editor`, più: vedere tutti gli utenti registrati (email, username, data di registrazione) e cambiarne **ruolo** e **grado** dalla tab Utenti del Pannello. È l'unico ruolo che può promuovere altri utenti (incluso a `admin`).
- Il primo Admin va impostato manualmente via SQL Editor (vedi `supabase/schema.sql`); da lì in poi tutti i cambi di ruolo/grado si fanno dal Pannello.
