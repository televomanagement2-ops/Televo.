-- =============================================================================
-- Televo — pgTAP smoke test (struttura + RLS abilitata + helper)
-- =============================================================================
-- Esecuzione: `supabase test db` (richiede l'estensione pgtap, disponibile su
-- Supabase). Verifica le invarianti fondamentali del backend Fase 1-8 + GDPR.

begin;
select plan(86);

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

-- =============================================================================
-- Fase 4-8 + GDPR — esistenza tabelle
-- =============================================================================
select has_table('public', 'friendships',          'friendships esiste');
select has_table('public', 'top_friends',           'top_friends esiste');
select has_table('public', 'conversations',         'conversations esiste');
select has_table('public', 'conversation_members',  'conversation_members esiste');
select has_table('public', 'messages',              'messages esiste');
select has_table('public', 'streaks',               'streaks esiste');
select has_table('public', 'usage_daily',           'usage_daily esiste');
select has_table('public', 'drops',                 'drops esiste');
select has_table('public', 'drop_reactions',        'drop_reactions esiste');
select has_table('public', 'props',                 'props esiste');
select has_table('public', 'live_presence',         'live_presence esiste');
select has_table('public', 'room_locations',        'room_locations esiste');
select has_table('public', 'devices',               'devices esiste');
select has_table('public', 'notifications',         'notifications esiste');
select has_table('public', 'achievements',          'achievements esiste');
select has_table('public', 'user_achievements',     'user_achievements esiste');
select has_table('public', 'moderators',            'moderators esiste');
select has_table('public', 'reports',               'reports esiste');
select has_table('public', 'moderation_queue',      'moderation_queue esiste');
select has_table('public', 'moderation_actions',    'moderation_actions esiste');
select has_table('public', 'wallets',               'wallets esiste');
select has_table('public', 'vibe_transactions',     'vibe_transactions esiste');
select has_table('public', 'stripe_customers',      'stripe_customers esiste');
select has_table('public', 'creator_earnings',      'creator_earnings esiste');
select has_table('public', 'consents',              'consents esiste');
select has_table('public', 'gdpr_requests',         'gdpr_requests esiste');
select has_table('public', 'audit_log',             'audit_log esiste');

-- =============================================================================
-- RLS abilitata sui nuovi domini sensibili
-- =============================================================================
select ok((select relrowsecurity from pg_class where oid = 'public.friendships'::regclass),       'RLS attiva su friendships');
select ok((select relrowsecurity from pg_class where oid = 'public.messages'::regclass),          'RLS attiva su messages');
select ok((select relrowsecurity from pg_class where oid = 'public.drops'::regclass),             'RLS attiva su drops');
select ok((select relrowsecurity from pg_class where oid = 'public.props'::regclass),             'RLS attiva su props');
select ok((select relrowsecurity from pg_class where oid = 'public.live_presence'::regclass),     'RLS attiva su live_presence');
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass),     'RLS attiva su notifications');
select ok((select relrowsecurity from pg_class where oid = 'public.user_achievements'::regclass), 'RLS attiva su user_achievements');
select ok((select relrowsecurity from pg_class where oid = 'public.reports'::regclass),           'RLS attiva su reports');
select ok((select relrowsecurity from pg_class where oid = 'public.wallets'::regclass),           'RLS attiva su wallets');
select ok((select relrowsecurity from pg_class where oid = 'public.vibe_transactions'::regclass), 'RLS attiva su vibe_transactions');
select ok((select relrowsecurity from pg_class where oid = 'public.consents'::regclass),          'RLS attiva su consents');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_log'::regclass),         'RLS attiva su audit_log');

-- audit_log: nessuna policy di scrittura -> append-only via SECURITY DEFINER.
select ok((select count(*)::int from pg_policies
           where schemaname='public' and tablename='audit_log' and cmd in ('INSERT','UPDATE','DELETE','ALL')) = 0,
  'audit_log non ha policy di scrittura');

-- =============================================================================
-- Helper / RPC fondamentali presenti
-- =============================================================================
select has_function('public', 'are_friends', array['uuid','uuid'],       'are_friends(uuid,uuid) esiste');
select has_function('public', 'is_conv_member', array['uuid','uuid'],     'is_conv_member(uuid,uuid) esiste');
select has_function('public', 'is_moderator', array['uuid'],              'is_moderator(uuid) esiste');
select has_function('public', 'can_see_drop', array['uuid','uuid'],       'can_see_drop(uuid,uuid) esiste');
select has_function('public', 'process_symbolic_tip', array['uuid','numeric','uuid','text'],
  'process_symbolic_tip(...) esiste');
select has_function('public', 'dispatch_push',       'dispatch_push() esiste');
select has_function('public', 'purge_due_deletions', 'purge_due_deletions() esiste');
select has_function('public', 'unlock_achievement', array['uuid','text'], 'unlock_achievement(uuid,text) esiste');
select has_function('public', 'send_friend_request', array['uuid'],       'send_friend_request(uuid) esiste');
select has_function('public', 'get_or_create_dm', array['uuid'],          'get_or_create_dm(uuid) esiste');

-- =============================================================================
-- Invarianti strutturali di sicurezza
-- =============================================================================
-- Gate sanzioni: mute/ban vivono su profiles (campi di sistema, non grant utente).
select has_column('public', 'profiles', 'muted_until', 'profiles.muted_until (mute) esiste');
select has_column('public', 'profiles', 'banned_at',   'profiles.banned_at (ban) esiste');
-- Economia: saldo reale separato + idempotenza transazioni.
select has_column('public', 'wallets', 'balance_real',           'wallets.balance_real esiste');
select has_column('public', 'vibe_transactions', 'idempotency_key', 'vibe_transactions.idempotency_key esiste');
-- Notifiche: marcatura invio push.
select has_column('public', 'notifications', 'pushed_at', 'notifications.pushed_at esiste');
-- Drops: niente posizione, ma audience friends/school.
select has_column('public', 'drops', 'audience', 'drops.audience esiste');
-- Anti-spam props: indice unico (donatore,destinatario,tratto,contenuto).
select ok((select count(*)::int from pg_indexes
           where schemaname='public' and indexname='props_unique_uidx') = 1,
  'props ha indice unico anti-spam');
-- DM uniche per coppia.
select ok((select count(*)::int from pg_indexes
           where schemaname='public' and indexname='conversations_dm_key_uidx') = 1,
  'conversations ha indice unico dm_key');

-- =============================================================================
-- Onboarding differito + inviti a catena (migrazione onboarding_oauth)
-- =============================================================================
select has_function('public', 'check_invite', array['text'],
  'check_invite(text) esiste');
select has_function('public', 'complete_onboarding', array['text','text','date','text'],
  'complete_onboarding(text,text,date,text) esiste');
select has_function('public', 'create_invite',
  'create_invite() esiste');
-- Invito school-free: school_id non più obbligatorio.
select col_is_null('public', 'invites', 'school_id',
  'invites.school_id è nullable (invito school-free)');

select * from finish();
rollback;
