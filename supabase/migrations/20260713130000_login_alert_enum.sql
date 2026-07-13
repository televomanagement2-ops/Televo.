-- =============================================================================
-- Televo — M13 (P6): nuovo valore enum notification_type = 'new_login'
-- =============================================================================
-- File SEPARATO dal primo uso per il vincolo di Postgres: un valore aggiunto
-- con `ALTER TYPE … ADD VALUE` non può essere usato nella stessa transazione
-- in cui viene aggiunto. Stesso pattern rodato di 20260709120000_live_enums.sql
-- e 20260706140000_drop_prompt_enum.sql. La migrazione successiva
-- (login_alert) lo usa subito nella RPC enqueue_login_alert.
--
-- 'new_login' (notification_type) — "nuovo accesso al tuo account": nasce
--     SERVER-SIDE dalla Edge login-alert al login con password su un device
--     (audit AUDIT-HARDENING §5.2, decisione PO AH-3: città stimata dall'IP
--     best-effort, IP mai persistito), viaggia sulla pipeline push esistente
--     (enqueue → dispatch_push → send-push) e sarà elencata nella tab
--     Notifiche (AH-1, P10).

alter type public.notification_type add value if not exists 'new_login';
