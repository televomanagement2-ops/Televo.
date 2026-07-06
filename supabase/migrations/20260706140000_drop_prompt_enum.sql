-- =============================================================================
-- Televo — Drops M6 (DM7): nuovo valore enum per "Drop del giorno"
-- =============================================================================
-- File SEPARATO dalla logica (20260706140100_drop_prompt.sql) per un vincolo di
-- Postgres: un valore aggiunto con `ALTER TYPE … ADD VALUE` non può essere USATO
-- nella stessa transazione in cui viene aggiunto. La migrazione successiva lo usa
-- subito (notifica broadcast del tema del giorno), quindi va committato PRIMA, a
-- sé. Stesso pattern rodato in 20260701000000_aura_v3_enums.sql e
-- 20260705150000_drops_notify_enum.sql.
--
-- 'drop_prompt' (notification_type) — il "tema del giorno" (§16.2): una notifica
--                broadcast, inviata a orario semi-random pomeridiano, che invita
--                a condividere un drop sul tema curato del giorno. È l'UNICA
--                notifica NON richiesta di Televo (decisione product owner
--                2026-07-06): va dosata (una sola al giorno, opzionale, non scade).

alter type public.notification_type add value if not exists 'drop_prompt';
