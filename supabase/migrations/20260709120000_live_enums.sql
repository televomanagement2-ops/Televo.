-- =============================================================================
-- Televo — Live M12 (LM0): nuovi valori enum (preludio al dominio lives)
-- =============================================================================
-- File SEPARATO dalla logica LM0 (live_foundation) per il vincolo di Postgres:
-- un valore aggiunto con `ALTER TYPE … ADD VALUE` non può essere USATO nella
-- stessa transazione in cui viene aggiunto. La migrazione successiva li usa
-- subito (moderation_target_user v3), e LM1/LM2 useranno gli altri. Stesso
-- pattern rodato di 20260705150000_drops_notify_enum.sql.
--
-- 'live' / 'live_comment' (moderation_target) — la live e il singolo commento
--     sono segnalabili col sistema report ESISTENTE (`file_report` +
--     moderation_queue): nessuna tabella dedicata (live.md, correzioni al
--     master plan). moderation_target_user v3 li mappa a host/autore.
-- 'live_started' / 'live_cohost_invite' (notification_type) — notifica di
--     avvio (default TUTTI gli amici, decisione PO L-4) e invito co-host.
--     Cablate in LM2 sulla pipeline esistente (enqueue_notification).
-- 'live_broadcast' (map_event_type) — badge LIVE sulla Mappa della Città:
--     riuso integrale di map_events (M7), attach/detach in LM1.

alter type public.moderation_target add value if not exists 'live';
alter type public.moderation_target add value if not exists 'live_comment';
alter type public.notification_type add value if not exists 'live_started';
alter type public.notification_type add value if not exists 'live_cohost_invite';
alter type public.map_event_type    add value if not exists 'live_broadcast';
