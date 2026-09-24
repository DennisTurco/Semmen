-- ============================================================
-- Migrazione 003 — Stato "Candidato" auto-impostato dal form
-- ============================================================
-- Da eseguire UNA VOLTA nel SQL Editor, DOPO 002_gradi_e_profili.sql.
--
-- Introduce semmen.candidarsi(): l'utente che completa il form in
-- candidatura.html imposta da sé il proprio grado a "Candidato",
-- così l'Admin lo vede subito nel Pannello → Utenti. La funzione
-- agisce solo sulla riga dell'utente che la chiama (auth.uid()) e
-- solo verso il grado fisso "Candidato": non è un modo per
-- auto-assegnarsi altri gradi o ruoli.
-- ============================================================

create or replace function semmen.candidarsi()
returns void
language plpgsql security definer set search_path = semmen, public as $$
declare
  candidato_id uuid;
begin
  select id into candidato_id from semmen.gradi where nome = 'Candidato';
  if candidato_id is null then
    raise exception 'Grado "Candidato" non trovato';
  end if;

  update semmen.profiles
  set grado_id = candidato_id
  where id = auth.uid() and role = 'utente';
end;
$$;

revoke all on function semmen.candidarsi() from public;
grant execute on function semmen.candidarsi() to authenticated;
