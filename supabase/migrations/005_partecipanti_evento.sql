-- ============================================================
-- Migrazione 005 — Elenco partecipanti evento visibile a Compagno+
-- ============================================================
-- Da eseguire UNA VOLTA nel SQL Editor, DOPO 004_storage_e_username_check.sql.
--
-- La select RLS su event_partecipazioni resta "proprietario o
-- editor/admin" (un Compagno non deve poter leggere direttamente le
-- righe altrui). Per mostrare comunque, nella pagina di dettaglio
-- evento, l'elenco di chi ha aderito a Compagno/Editor/Admin, si usa
-- una funzione SECURITY DEFINER che espone solo i campi non sensibili
-- (nessuna email), sullo stesso modello di semmen.directory_utenti().
-- ============================================================

create or replace function semmen.evento_partecipanti(p_evento_id uuid)
returns table (
  id             uuid,
  user_id        uuid,
  display_name   text,
  grado_nome     text,
  grado_simbolo  text,
  note           text,
  created_at     timestamptz
)
language plpgsql security definer set search_path = semmen, public as $$
begin
  if not semmen.is_compagno_or_above() then
    raise exception 'Permesso negato';
  end if;

  return query
    select
      ep.id,
      ep.user_id,
      coalesce(p.username, p.full_name, p.email),
      g.nome,
      g.simbolo,
      ep.note,
      ep.created_at
    from semmen.event_partecipazioni ep
    left join semmen.profiles p on p.id = ep.user_id
    left join semmen.gradi g on g.id = p.grado_id
    where ep.evento_id = p_evento_id
    order by ep.created_at asc;
end;
$$;

revoke all on function semmen.evento_partecipanti(uuid) from public;
grant execute on function semmen.evento_partecipanti(uuid) to authenticated;
