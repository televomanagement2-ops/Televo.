-- =============================================================================
-- Televo — Chat: nuovo valore enum 'media' per i messaggi (preludio a D3)
-- =============================================================================
-- File SEPARATO dalla logica (20260701050100_chat_media.sql) per il vincolo di
-- Postgres: un valore aggiunto con `ALTER TYPE … ADD VALUE` non è usabile nella
-- stessa transazione in cui viene aggiunto. La migrazione successiva referenzia
-- 'media' (constraint/commenti), quindi il valore va committato PRIMA, a sé.
--
-- 'media' — messaggio con allegato foto/immagine (media_url + media_type). La voce
--           dei minori resta su 'audio'/'voice_thread'; 'text' invariato.

alter type public.message_type add value if not exists 'media';
