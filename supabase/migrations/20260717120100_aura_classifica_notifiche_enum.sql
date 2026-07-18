-- =============================================================================
-- Televo — M16 (AC1): nuovi valori enum per le notifiche della Classifica Aura
-- =============================================================================
-- File SEPARATO dalla logica (20260717120200_aura_classifica_notifiche.sql) per
-- un vincolo di Postgres: un valore aggiunto con `ALTER TYPE … ADD VALUE` non
-- può essere USATO nella stessa transazione in cui viene aggiunto. La migrazione
-- successiva li usa subito (insert set-based del motore notturno), quindi vanno
-- committati PRIMA, a sé. Stesso pattern rodato in 20260706140000_drop_prompt_enum.
--
-- Le tre notifiche retention della classifica (AC-4, docs/aura/classifica.md §7):
--  'aura_podio'    — «sei entrato nel podio»: ieri fuori (rank > 3), oggi dentro
--                    (rank <= 3). A soglia (friends_total >= 4) e con dedup.
--  'aura_sorpasso' — «un amico ti ha superato»: SOLO per chi era nel podio
--                    (old_rank <= 3) e ha perso almeno una posizione. Il
--                    sorpassante è ANONIMO (anti-ansia tra minori, §7.2).
--  'aura_recap'    — il recap settimanale: broadcast DOSATO (una volta a
--                    settimana, domenica pomeriggio, orario semi-random) sul
--                    modello del "tema del giorno".

alter type public.notification_type add value if not exists 'aura_podio';
alter type public.notification_type add value if not exists 'aura_sorpasso';
alter type public.notification_type add value if not exists 'aura_recap';
