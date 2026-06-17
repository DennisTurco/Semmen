/**
 * inject-env.js — sostituisce i placeholder di config.js con i valori di .env.local
 * Uso: node inject-env.js
 *
 * ATTENZIONE: modifica config.js sul filesystem locale.
 * Non committare config.js dopo aver eseguito questo script.
 * Esegui `git checkout js/config.js` per ripristinare i placeholder.
 */

const fs   = require('fs');
const path = require('path');

const envPath    = path.join(__dirname, '.env.local');
const configPath = path.join(__dirname, 'js', 'config.js');

if (!fs.existsSync(envPath)) {
  console.error('❌  .env.local non trovato. Copia .env.local.example in .env.local e compila i valori.');
  process.exit(1);
}

// Leggi .env.local
const env = {};
fs.readFileSync(envPath, 'utf8')
  .split('\n')
  .filter(line => line.trim() && !line.startsWith('#'))
  .forEach(line => {
    const [key, ...rest] = line.split('=');
    env[key.trim()] = rest.join('=').trim();
  });

// Sostituisci placeholder in config.js
let config = fs.readFileSync(configPath, 'utf8');

const replacements = {
  '__WIKI_PASSWORD__':       env.WIKI_PASSWORD,
  '__EMAILJS_PUBLIC_KEY__':  env.EMAILJS_PUBLIC_KEY,
  '__EMAILJS_SERVICE_ID__':  env.EMAILJS_SERVICE_ID,
  '__EMAILJS_TEMPLATE_ID__': env.EMAILJS_TEMPLATE_ID,
  '__EMAILJS_RECIPIENT__':   env.EMAILJS_RECIPIENT,
};

let missing = [];
for (const [placeholder, value] of Object.entries(replacements)) {
  if (!value) { missing.push(placeholder); continue; }
  config = config.replaceAll(placeholder, value);
}

if (missing.length) {
  console.warn('⚠️  Valori mancanti in .env.local:', missing.join(', '));
}

fs.writeFileSync(configPath, config, 'utf8');
console.log('✅  config.js aggiornato con i valori di .env.local');
console.log('   Ricorda: non committare config.js. Usa `git checkout js/config.js` per ripristinare i placeholder.');
