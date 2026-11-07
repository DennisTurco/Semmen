-- ============================================================
-- Migrazione 011 — Data di fine degli eventi
-- ============================================================
-- Da eseguire UNA VOLTA nel SQL Editor, DOPO 010.
-- Si può rieseguire senza danni.
--
-- La durata si inserisce come intervallo "dal → al" (data, data_fine)
-- invece che come testo libero: così il link a Google Calendar copre
-- esattamente i giorni giusti. La colonna `durata` resta per gli
-- eventi già inseriti che non hanno una data di fine.
-- ============================================================
alter table semmen.eventi
  add column if not exists data_fine date;

alter table semmen.eventi
  drop constraint if exists eventi_data_fine_check;
alter table semmen.eventi
  add constraint eventi_data_fine_check
  check (data_fine is null or (data is not null and data_fine >= data));
