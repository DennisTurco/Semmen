# Semmen

## Sviluppo locale

1. Copia `.env.local` (già gitignored) e compila i valori (Supabase, EmailJS, password wiki).

2. Genera `js/config.js` dal template:

   ```sh
   node scripts/build-config.js
   ```

3. Avvia un server statico locale:

   ```sh
   npx serve .
   ```

`js/config.js` è generato e non è tracciato da git — va rilanciato lo script ogni volta che cambi `.env.local` o `js/config.template.js`.
