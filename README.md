# Semmen

```bash
# 1. Copia e compila il file env
cp .env.local.example .env.local
# (modifica .env.local con i valori reali)

# 2. Inietta i valori in config.js
node inject-env.js

# 3. Avvia il server locale
npx serve .

# 4. Prima di committare, ripristina i placeholder
git checkout js/config.js
```
