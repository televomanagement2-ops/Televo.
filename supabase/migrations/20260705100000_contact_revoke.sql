-- =============================================================================
-- Televo — Rubrica: revoca ATOMICA del consenso contacts_sync (CM7) — SENSIBILE
-- =============================================================================
-- La coppia register_contact_hash/match_contacts (20260701070100) non aveva una
-- via per RIMUOVERE l'hash del proprio contatto alla revoca del consenso: due
-- chiamate separate dal client (record_consent(false) + delete) potrebbero
-- fallire a metà lasciando hash orfani SENZA consenso attivo — incoerenza GDPR
-- inaccettabile su una feature che tocca i minori. Questa RPC fa le due cose in
-- UNA transazione: prima cancella gli hash propri, poi revoca il consenso
-- (riusando record_consent → upsert + audit log già esistenti).
--
-- Nota: process_account_deletion cancella già contact_hashes (hardening CM1,
-- riconfermato nelle v2/v3) — qui si copre la revoca VOLONTARIA, non la
-- cancellazione account.

create or replace function public.revoke_contacts_sync()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Prima gli hash (il dato), poi il consenso (lo stato): tutto o niente.
  delete from public.contact_hashes where user_id = v_uid;
  perform public.record_consent('contacts_sync'::public.consent_type, '1', false);

  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- Grants — solo authenticated (pattern delle altre RPC rubrica).
-- =============================================================================
revoke all on function public.revoke_contacts_sync() from public;
grant execute on function public.revoke_contacts_sync() to authenticated;
