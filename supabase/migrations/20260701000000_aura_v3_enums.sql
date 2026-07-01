-- =============================================================================
-- Televo — Aura v3: nuovi valori enum (preludio alla logica v3)
-- =============================================================================
-- Questo file esiste SEPARATO dalla logica v3 (20260701000100_aura_v3.sql) per un
-- vincolo di Postgres: un valore aggiunto con `ALTER TYPE … ADD VALUE` non può
-- essere USATO nella stessa transazione in cui viene aggiunto. La migrazione della
-- logica chiama `enqueue_notification(..., 'aura_upgrade'/'aura_downgrade', ...)`,
-- quindi i due valori devono essere committati PRIMA, in una transazione a sé.
--
-- 'aura_upgrade'   — l'Aura è cresciuta in modo significativo (>= +5%).
-- 'aura_downgrade' — l'Aura è calata per comportamenti non conformi (penalità).
--                    I cali da sola inattività NON notificano (niente ansia).

alter type public.notification_type add value if not exists 'aura_upgrade';
alter type public.notification_type add value if not exists 'aura_downgrade';
