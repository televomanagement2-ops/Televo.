-- =============================================================================
-- Televo — Push M13 (P4): receipt Expo + osservabilità della pipeline push
-- =============================================================================
-- La pipeline push era CIECA a valle dell'invio: la Edge send-push (v2) leggeva
-- solo i TICKET sincroni della risposta Expo (per DeviceNotRegistered), MAI le
-- RECEIPT asincrone. Gli errori a livello receipt — InvalidCredentials (FCM v1/
-- APNs mal configurati), MessageRateExceeded, MessageTooBig — arrivavano dopo,
-- restavano INVISIBILI e sul device non compariva nulla (§3 dell'audit,
-- breakpoint #4, oggi indeterminabile via pooler). Anche il no-op silenzioso di
-- `dispatch_push` quando i segreti Vault mancano non lasciava alcuna traccia.
--
-- Questa migrazione aggiunge due tabelle di SISTEMA (RLS attiva SENZA policy,
-- pattern `invites`/`storage_cleanup_queue`: scritte/lette SOLO da service_role,
-- il client non le tocca mai) e rende `dispatch_push` osservabile:
--   • push_tickets — i ticket id "ok" della risposta Expo, per interrogarne le
--     receipt dopo ~15 min (send-push v3). Righe effimere: risolte o potate ≤24h.
--   • push_health  — sink diagnostico chiave→jsonb (last-run, errori receipt,
--     dispatch saltato per segreti mancanti).
-- La Edge send-push passa a v3 (salva i ticket, controlla le receipt, pota i
-- device morti, scrive send_push_last_run). `dispatch_push` è ridefinita
-- VERBATIM + UNA aggiunta (marker nel ramo segreti assenti): nessun cambio di
-- comportamento, solo una traccia diagnosticabile.

-- -----------------------------------------------------------------------------
-- 1. push_tickets — ticket id Expo in attesa di receipt. RLS attiva SENZA policy
--    (pattern invites/storage_cleanup_queue): solo service_role scrive e legge.
--    Colonne diagnostiche disaccoppiate (nessuna FK: la coda si auto-pota ≤24h,
--    come storage_cleanup_queue) — `expo_push_token` serve a potare il device
--    quando la receipt torna DeviceNotRegistered.
-- -----------------------------------------------------------------------------
create table public.push_tickets (
  ticket_id       text primary key,             -- receipt id restituito da Expo
  notification_id uuid        not null,         -- notifica d'origine (diagnostica)
  expo_push_token text        not null,         -- per potare il device se morto
  created_at      timestamptz not null default now()
);

create index push_tickets_created_idx on public.push_tickets (created_at);

alter table public.push_tickets enable row level security;
revoke all on public.push_tickets from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. push_health — sink diagnostico chiave→valore. RLS attiva SENZA policy.
--    Chiavi note: 'send_push_last_run', 'send_push_receipt_errors',
--    'dispatch_skipped_no_secrets'. Sola porta di osservabilità della pipeline.
-- -----------------------------------------------------------------------------
create table public.push_health (
  key        text primary key,
  value      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.push_health enable row level security;
revoke all on public.push_health from anon, authenticated;

-- =============================================================================
-- 3. dispatch_push — RIDEFINITA verbatim + UNA aggiunta (osservabilità).
-- =============================================================================
-- Il corpo è identico alla v1 (20260628180000_notifications.sql): stesso gate
-- "niente da inviare", stessa lettura dei tre segreti Vault, stessa chiamata
-- net.http_post. UNICA differenza: nel ramo "segreti assenti" lascia una traccia
-- in push_health prima del return. Il no-op resta (nessuna chiamata HTTP a
-- vuoto), ma ora è DIAGNOSTICABILE: chi indaga vede quando e perché lo scheduler
-- non ha spinto. (Su questo progetto i segreti ci SONO — il marker è la rete di
-- sicurezza per il futuro / per gli ambienti non configurati.)
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
  -- Niente da inviare: evita chiamate HTTP a vuoto.
  if not exists (select 1 from public.notifications where pushed_at is null) then
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

revoke all on function public.dispatch_push() from public;
