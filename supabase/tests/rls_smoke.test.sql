-- =============================================================================
-- Televo — pgTAP smoke test (struttura + RLS abilitata + helper)
-- =============================================================================
-- Esecuzione: `supabase test db` (richiede l'estensione pgtap, disponibile su
-- Supabase). Verifica le invarianti fondamentali del backend Fase 1-3.

begin;
select plan(24);

-- Tabelle core
select has_table('public', 'schools', 'schools esiste');
select has_table('public', 'profiles', 'profiles esiste');
select has_table('public', 'profiles_private', 'profiles_private esiste');
select has_table('public', 'invites', 'invites esiste');

-- Tabelle aura / rooms
select has_table('public', 'aura_events', 'aura_events esiste');
select has_table('public', 'aura_snapshots', 'aura_snapshots esiste');
select has_table('public', 'rooms', 'rooms esiste');
select has_table('public', 'room_participants', 'room_participants esiste');
select has_table('public', 'vibechain_queue', 'vibechain_queue esiste');

-- birth_date NON deve stare su profiles (dato sensibile separato)
select hasnt_column('public', 'profiles', 'birth_date',
  'profiles non espone birth_date');
select has_column('public', 'profiles_private', 'birth_date',
  'birth_date vive in profiles_private');

-- RLS abilitata sulle tabelle sensibili
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS attiva su profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles_private'::regclass),
  'RLS attiva su profiles_private');
select ok((select relrowsecurity from pg_class where oid = 'public.invites'::regclass),
  'RLS attiva su invites');
select ok((select relrowsecurity from pg_class where oid = 'public.aura_events'::regclass),
  'RLS attiva su aura_events');
select ok((select relrowsecurity from pg_class where oid = 'public.rooms'::regclass),
  'RLS attiva su rooms');
select ok((select relrowsecurity from pg_class where oid = 'public.room_participants'::regclass),
  'RLS attiva su room_participants');

-- invites: nessuna policy -> tabella bloccata a anon/authenticated
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='invites'),
  0, 'invites non ha policy (solo service_role)');

-- Helper functions presenti
select has_function('public', 'is_adult', array['uuid'], 'is_adult(uuid) esiste');
select has_function('public', 'is_active_user', array['uuid'], 'is_active_user(uuid) esiste');
select has_function('public', 'is_room_participant', array['uuid','uuid'],
  'is_room_participant(uuid,uuid) esiste');
select has_function('public', 'redeem_invite', array['text'], 'redeem_invite(text) esiste');
select has_function('public', 'recompute_aura', 'recompute_aura() esiste');
select has_function('public', 'rotate_spotlight', 'rotate_spotlight() esiste');

select * from finish();
rollback;
