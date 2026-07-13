-- =============================================================================
-- Televo — M13 (P6): notifica "nuovo accesso" (enqueue_login_alert)
-- =============================================================================
-- Sintomo 6 dell'audit (AUDIT-HARDENING §5.2): il login su un device deve
-- AVVISARE l'utente sugli altri device ("un nuovo accesso è stato
-- effettuato…"), con la città stimata dall'IP in best-effort (decisione PO
-- AH-3). La geolocalizzazione avviene NELLA Edge login-alert e l'IP non viene
-- MAI persistito: qui arriva solo il nome della città (o null → testo
-- generico). La notifica viaggia sulla pipeline push ESISTENTE
-- (enqueue_notification → dispatch_push → send-push): zero pezzi nuovi a valle.
--
-- Perché una RPC dedicata: enqueue_notification non è eseguibile né dai ruoli
-- client né da service_role (revoke totale, by design) — questo wrapper
-- SECURITY DEFINER è l'unico punto d'ingresso del tipo 'new_login',
-- eseguibile SOLO da service_role (l'adminClient della Edge login-alert).
-- Anti-spam: lo stesso install_id che accede più volte entro 1 ora non genera
-- nuove righe (retry di rete, login ripetuti sullo stesso device).

create or replace function public.enqueue_login_alert(
  p_user         uuid,
  p_install_id   text,
  p_device_label text default null,
  p_city         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_install text := nullif(btrim(coalesce(p_install_id, '')), '');
  v_label   text := left(coalesce(nullif(btrim(coalesce(p_device_label, '')), ''),
                                  'un nuovo dispositivo'), 64);
  v_city    text := left(nullif(btrim(coalesce(p_city, '')), ''), 64);
begin
  if p_user is null or v_install is null then
    raise exception 'invalid_input';
  end if;

  -- Anti-spam: stesso utente + stesso install_id da meno di 1 ora → no-op.
  if exists (
    select 1 from public.notifications n
    where n.user_id = p_user
      and n.type = 'new_login'
      and n.payload ->> 'install_id' = v_install
      and n.created_at > now() - interval '1 hour'
  ) then
    return jsonb_build_object('ok', true, 'skipped', 'duplicate');
  end if;

  -- Il payload porta install_id (dedup + soppressione del banner sul device
  -- che ha appena fatto login) e city (solo il NOME, mai coordinate né IP).
  perform public.enqueue_notification(
    p_user, 'new_login',
    'Nuovo accesso al tuo account',
    'Da ' || v_label || coalesce(' · vicino a ' || v_city, ''),
    jsonb_build_object('install_id', v_install, 'city', v_city)
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- Grant: SOLO service_role (la Edge login-alert). Revoke esplicito da tutti i
-- ruoli client (DEFAULT PRIVILEGES dell'hosted, lezione CM8).
revoke all on function public.enqueue_login_alert(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_login_alert(uuid, text, text, text)
  to service_role;
