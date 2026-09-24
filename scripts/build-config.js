#!/usr/bin/env node
/**
 * build-config.js — genera js/config.js da js/config.template.js
 *
 * Sostituisce i placeholder __NOME__ con i valori letti da:
 *   1) le variabili d'ambiente già presenti nel processo (usato in CI,
 *      dove GitHub Actions passa i secrets come env vars);
 *   2) in mancanza, il file .env.local nella root del progetto (uso locale).
 *
 * Un placeholder senza valore resta invariato: il sito continua a
 * funzionare in "modalità demo" (vedi i controlli `startsWith('__')`
 * sparsi nei vari js/*.js).
 *
 * Uso:
 *   node scripts/build-config.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT          = path.resolve(__dirname, '..');
const ENV_FILE       = path.join(ROOT, '.env.local');
const TEMPLATE_FILE  = path.join(ROOT, 'js', 'config.template.js');
const OUTPUT_FILE    = path.join(ROOT, 'js', 'config.js');

// Mappa placeholder nel template → nome variabile d'ambiente
const PLACEHOLDERS = {
  __SUPABASE_URL__:        'SUPABASE_URL',
  __SUPABASE_ANON_KEY__:   'SUPABASE_ANON_KEY',
  __WIKI_PASSWORD__:       'WIKI_PASSWORD',
  __EMAILJS_PUBLIC_KEY__:  'EMAILJS_PUBLIC_KEY',
  __EMAILJS_SERVICE_ID__:  'EMAILJS_SERVICE_ID',
  __EMAILJS_TEMPLATE_ID__: 'EMAILJS_TEMPLATE_ID',
};

function parseEnvFile(filePath) {
  const values = {};
  if (!fs.existsSync(filePath)) return values;

  fs.readFileSync(filePath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    values[key] = value;
  });

  return values;
}

function main() {
  if (!fs.existsSync(TEMPLATE_FILE)) {
    console.error(`[build-config] Template non trovato: ${TEMPLATE_FILE}`);
    process.exit(1);
  }

  const fromEnvFile = parseEnvFile(ENV_FILE);
  let template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  let sostituiti = 0;

  for (const [placeholder, envVar] of Object.entries(PLACEHOLDERS)) {
    const value = process.env[envVar] || fromEnvFile[envVar];
    if (!value) continue;
    if (template.includes(placeholder)) {
      template = template.split(placeholder).join(value);
      sostituiti++;
    }
  }

  fs.writeFileSync(OUTPUT_FILE, template);
  console.log(`[build-config] js/config.js generato (${sostituiti}/${Object.keys(PLACEHOLDERS).length} valori sostituiti).`);
  if (sostituiti < Object.keys(PLACEHOLDERS).length) {
    console.log('[build-config] I placeholder mancanti restano tali: il sito userà i fallback statici / la modalità demo per quelle funzionalità.');
  }
}

main();
