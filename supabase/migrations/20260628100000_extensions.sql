-- =============================================================================
-- Televo — Estensioni
-- =============================================================================
-- Le estensioni Supabase vivono nello schema dedicato `extensions`.

-- citext: username case-insensitive con unicità affidabile.
create extension if not exists citext with schema extensions;

-- pgcrypto: hashing/funzioni crittografiche (gen_random_uuid è già built-in in PG17).
create extension if not exists pgcrypto with schema extensions;

-- pg_cron: scheduling dei job ricorrenti (Aura recompute, spotlight, expire-content).
-- Allowlisted su Supabase hosted. Le schedule vere sono in fondo alle migrazioni
-- di dominio (aura/rooms) come blocchi cron.schedule().
create extension if not exists pg_cron;
