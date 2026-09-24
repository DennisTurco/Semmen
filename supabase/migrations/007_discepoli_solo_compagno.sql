-- ============================================================
-- Migrazione 007 — Elenco Discepoli visibile solo a Compagno+
-- ============================================================
-- Da eseguire UNA VOLTA nel SQL Editor, DOPO 006_organizzatore_e_attivita.sql.
--
-- In precedenza semmen.discepoli era leggibile da chiunque (anche anon),
-- coerentemente con discepoli.html che era una pagina pubblica. Ora la
-- pagina richiede il grado di Compagno (vedi requireRole in
-- discepoli.html), quindi anche la select RLS viene allineata: senza
-- questo la restrizione lato pagina sarebbe solo estetica, aggirabile
-- da chiunque interrogasse direttamente l'API con la anon key.
--
-- Effetto collaterale noto: il contatore "Membri" in home page
-- (index.html), che conta le righe di discepoli, per un visitatore
-- anonimo o con ruolo "utente" tornerà a mostrare il valore statico di
-- fallback (CONFIG.stats.members) invece del conteggio reale.
-- ============================================================

drop policy if exists discepoli_select_all on semmen.discepoli;
create policy discepoli_select_all on semmen.discepoli
  for select using (semmen.is_compagno_or_above());

-- discepoli era grant-ato anche ad anon per la vecchia pagina pubblica;
-- non serve più (la RLS blocca comunque anon, ma togliamo anche il grant
-- di base per coerenza col resto dello schema).
revoke select, insert, update, delete on semmen.discepoli from anon;
