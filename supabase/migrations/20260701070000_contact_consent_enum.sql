-- =============================================================================
-- Televo — Rubrica: nuovo consenso 'contacts_sync' (preludio a D1)
-- =============================================================================
-- File SEPARATO dalla logica (20260701070100_contact_match.sql) per il vincolo
-- Postgres: un valore enum appena aggiunto non è usabile nella stessa transazione.
-- La RPC `register_contact_hash` richiede `record_consent('contacts_sync', …)`
-- registrato, quindi il valore va committato PRIMA.
--
-- 'contacts_sync' — l'utente acconsente a confrontare (in forma HASH, mai in chiaro)
--                   la propria rubrica con gli utenti Televo. Revocabile.

alter type public.consent_type add value if not exists 'contacts_sync';
