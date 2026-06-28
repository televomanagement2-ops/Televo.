-- =============================================================================
-- Televo — Seed (dati di base per dev/test)
-- =============================================================================
-- Eseguito da `supabase db reset` (locale) o manualmente sul progetto hosted.
-- Contiene SOLO dati non-utente (scuole + inviti): robusto e indipendente
-- dalla versione di Supabase. Gli utenti di test si creano via signup reale
-- (o via supabase/tests/), così il trigger di age-gate viene esercitato davvero.

insert into public.schools (id, name, city) values
  ('11111111-1111-1111-1111-111111111111', 'Liceo Scientifico Galilei', 'Terni'),
  ('22222222-2222-2222-2222-222222222222', 'ITT Allievi-Sangallo', 'Terni')
on conflict (id) do nothing;

insert into public.invites (code, school_id, max_uses, expires_at) values
  ('TERNI-GALILEI-2026', '11111111-1111-1111-1111-111111111111', 500, '2026-12-31T23:59:59Z'),
  ('TERNI-ALLIEVI-2026', '22222222-2222-2222-2222-222222222222', 500, '2026-12-31T23:59:59Z'),
  ('TEST-SINGLE-USE',    '11111111-1111-1111-1111-111111111111', 1,   null),
  ('TEST-EXPIRED',       '11111111-1111-1111-1111-111111111111', 100, '2020-01-01T00:00:00Z')
on conflict (code) do nothing;
