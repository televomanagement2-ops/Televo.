-- =============================================================================
-- Televo — Drops M6 (DM6): scheduling della pulizia storage (event-driven, R-09)
-- =============================================================================
-- Le fondamenta esistono da DM0: la coda `storage_cleanup_queue`, i trigger
-- `enqueue_storage_cleanup` (drops/drop_comments/messages) e l'accodamento nel
-- GDPR (`process_account_deletion` v5). Mancava il CONSUMATORE: l'hosted vieta la
-- DELETE SQL su storage.objects (CM8), quindi i file vanno rimossi via Storage
-- API da una Edge dedicata (`storage-cleanup`, verify_jwt=false + x-cron-secret).
--
-- Questa migrazione aggiunge lo scheduler, specchio 1:1 di `dispatch_push`
-- (20260628180000_notifications.sql): una funzione SECURITY DEFINER che, SOLO se
-- la coda ha righe, invoca la Edge via pg_net leggendo URL/chiavi dal Vault
-- (no-op sicuro finché i segreti non sono configurati — qui già lo sono), e un
-- cron pg_cron ogni 15 minuti. Nessuna tabella nuova, nessun grant a client.

-- =============================================================================
-- dispatch_storage_cleanup — invocata da pg_cron: chiama la Edge storage-cleanup
-- solo se c'è qualcosa da rimuovere. Vault: edge_base_url/service_role_key/
-- cron_secret (gli stessi già usati da dispatch_push).
-- =============================================================================
create or replace function public.dispatch_storage_cleanup()
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
  -- Coda vuota: evita chiamate HTTP a vuoto (caso normale la gran parte del tempo).
  if not exists (select 1 from public.storage_cleanup_queue) then
    return;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'edge_base_url';
  select decrypted_secret into v_key    from vault.decrypted_secrets where name = 'service_role_key';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';

  -- Non configurato: no-op finché i segreti non sono in Vault (già registrati).
  if v_url is null or v_key is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/storage-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'x-cron-secret', v_secret
    ),
    body    := '{}'::jsonb
  );
end;
$$;

revoke all on function public.dispatch_storage_cleanup() from public;

-- =============================================================================
-- Scheduling (pg_cron) — pulizia storage ogni 15 minuti. cron.schedule fa upsert
-- per jobname: idempotente se la migrazione viene ri-applicata.
-- =============================================================================
select cron.schedule(
  'storage-cleanup-15min',
  '*/15 * * * *',
  $$ select public.dispatch_storage_cleanup(); $$
);
