-- =============================================================================
-- Televo — Push M14 (V2): dispatch_push v4 — drenaggio receipt a backlog vuoto
-- =============================================================================
-- La Edge send-push (v3) esegue a OGNI invocazione due fasi: l'invio delle
-- notifiche accodate e la verifica delle receipt Expo dei ticket pendenti
-- (età >15 min). Lo scheduler `dispatch_push` è però l'UNICO punto che la
-- invoca: se decide di partire guardando soltanto la coda delle notifiche, i
-- ticket in attesa non vengono mai riconciliati nei periodi senza traffico —
-- restano in `push_tickets` a tempo indefinito e gli eventuali errori di
-- consegna (InvalidCredentials, MessageRateExceeded, …) non emergono mai in
-- `push_health`. È il sintomo osservato nell'audit di verifica M14: ticket
-- fermi in tabella a code notifiche vuote.
--
-- Fix: il gate considera ENTRAMBE le code. La chiamata parte se c'è QUALCOSA
-- da fare — notifiche con `pushed_at is null` O ticket in `push_tickets` — e
-- a code vuote resta il no-op (nessuna chiamata HTTP a vuoto a regime: i
-- ticket si risolvono/potano in poche run e il cron torna silenzioso).
-- Ridefinizione conservativa: Vault, marker di osservabilità
-- (`dispatch_skipped_no_secrets`) e chiamata `net.http_post` identici alla
-- definizione in vigore; cambia SOLO il gate d'ingresso.
--
-- Alternativa scartata: un cron dedicato al drenaggio receipt — un job e un
-- percorso d'invocazione in più per lo stesso effetto; il gate esteso riusa
-- l'infrastruttura esistente (cron `dispatch-push-minutely` + Edge invariati).

create or replace function public.dispatch_push()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_key    text;
  v_secret text;
begin
  -- Qualcosa da fare? Si parte se ci sono notifiche da spingere O ticket di
  -- cui riconciliare la receipt; con entrambe le code vuote, nessuna chiamata.
  if not exists (select 1 from public.notifications where pushed_at is null)
     and not exists (select 1 from public.push_tickets) then
    return;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'edge_base_url';
  select decrypted_secret into v_key    from vault.decrypted_secrets where name = 'service_role_key';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';

  -- Non configurato (lancio futuro): no-op finché i segreti non sono in Vault.
  if v_url is null or v_key is null or v_secret is null then
    -- Osservabilità (P4): il no-op resta, ma lascia una traccia diagnosticabile.
    insert into public.push_health (key, value, updated_at)
    values ('dispatch_skipped_no_secrets', jsonb_build_object('at', now()), now())
    on conflict (key) do update
      set value = jsonb_build_object('at', now()), updated_at = now();
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'x-cron-secret', v_secret
    ),
    body    := '{}'::jsonb
  );
end;
$$;

revoke all on function public.dispatch_push() from public, anon, authenticated;
