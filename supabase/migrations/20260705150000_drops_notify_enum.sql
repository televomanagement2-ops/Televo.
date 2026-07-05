-- =============================================================================
-- Televo — Drops M6 (DM0): nuovi valori enum (preludio al modello drops v2)
-- =============================================================================
-- Questo file esiste SEPARATO dalla logica DM0 (drops_v2/interactions/lifecycle)
-- per un vincolo di Postgres: un valore aggiunto con `ALTER TYPE … ADD VALUE`
-- non può essere USATO nella stessa transazione in cui viene aggiunto. Le
-- migrazioni successive lo usano subito (trigger notifica commenti, ramo
-- moderazione), quindi i due valori devono essere committati PRIMA, a sé.
-- Stesso pattern rodato in 20260701000000_aura_v3_enums.sql.
--
-- 'drop_comment' (notification_type) — un amico ha commentato un mio drop, o ha
--                risposto a un mio commento (R-15: solo i commenti notificano;
--                like e salvataggi MAI, niente numeri nel testo).
-- 'drop_comment' (moderation_target) — un commento a un drop è segnalabile
--                (§9); moderation_target_user lo mappa all'autore del commento.

alter type public.notification_type add value if not exists 'drop_comment';
alter type public.moderation_target add value if not exists 'drop_comment';
