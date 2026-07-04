-- =============================================================================
-- Televo — pgTAP smoke test (struttura + RLS abilitata + helper)
-- =============================================================================
-- Esecuzione: `supabase test db` (richiede l'estensione pgtap, disponibile su
-- Supabase). Verifica le invarianti fondamentali del backend Fase 1-8 + GDPR.

begin;
select plan(191);

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
select has_function('public', 'remove_conversation_member', array['uuid','uuid'],
  'remove_conversation_member(uuid,uuid) esiste');

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

-- =============================================================================
-- Aura v3 — reputazione ricalcolata a finestra mobile (0–100%)
-- =============================================================================
-- Struttura: helper di conteggio + drop media.
select has_function('public', 'aura_static_points',  array['uuid'], 'aura_static_points(uuid) esiste');
select has_function('public', 'aura_dynamic_points', array['uuid'], 'aura_dynamic_points(uuid) esiste');
select has_function('public', 'aura_penalty_points', array['uuid'], 'aura_penalty_points(uuid) esiste');
select has_function('public', 'aura_percentage',     array['uuid'], 'aura_percentage(uuid) esiste');
select has_function('public', 'my_aura_percentage',  'my_aura_percentage() esiste');

-- Drop: formato media (foto/video) accanto a audio/testo.
select has_column('public', 'drops', 'media_url', 'drops.media_url esiste (drop media)');

-- Nuovi valori dell'enum notifiche per le variazioni d'Aura.
select ok((select 'aura_upgrade'   = any(enum_range(null::public.notification_type)::text[])),
  'notification_type include aura_upgrade');
select ok((select 'aura_downgrade' = any(enum_range(null::public.notification_type)::text[])),
  'notification_type include aura_downgrade');

-- Comportamento deterministico: un utente senza alcun dato vale 0 (clamp basso).
select is(public.aura_percentage('00000000-0000-0000-0000-000000000000'::uuid), 0::numeric,
  'aura_percentage di utente senza dati = 0');
select is(public.aura_static_points('00000000-0000-0000-0000-000000000000'::uuid), 0::numeric,
  'aura_static_points di utente senza dati = 0');
select is(public.aura_dynamic_points('00000000-0000-0000-0000-000000000000'::uuid), 0::numeric,
  'aura_dynamic_points di utente senza dati = 0');

-- Cron: il ricalcolo è ora giornaliero (sostituisce il settimanale).
select ok((select count(*)::int from cron.job where jobname = 'aura-recompute-daily') = 1,
  'cron aura-recompute-daily attivo');
select ok((select count(*)::int from cron.job where jobname = 'aura-recompute-weekly') = 0,
  'cron aura-recompute-weekly rimosso');

-- =============================================================================
-- Chat — modello dati §3 (D1–D4): organizzazione, salvati, media, presenza, rubrica
-- =============================================================================

-- D4 — organizzazione per-utente su conversation_members (5 colonne + 3 RPC).
select has_column('public', 'conversation_members', 'muted_until',
  'conversation_members.muted_until esiste (silenzia per-conversazione)');
select has_column('public', 'conversation_members', 'archived_at',
  'conversation_members.archived_at esiste');
select has_column('public', 'conversation_members', 'pinned_at',
  'conversation_members.pinned_at esiste');
select has_column('public', 'conversation_members', 'cleared_at',
  'conversation_members.cleared_at esiste');
select has_column('public', 'conversation_members', 'hidden_at',
  'conversation_members.hidden_at esiste');
select has_function('public', 'set_conversation_mute', array['uuid','timestamptz'],
  'set_conversation_mute(uuid,timestamptz) esiste');
select has_function('public', 'set_conversation_flag', array['uuid','text','boolean'],
  'set_conversation_flag(uuid,text,boolean) esiste');
select has_function('public', 'clear_conversation_history', array['uuid'],
  'clear_conversation_history(uuid) esiste');

-- D4 — messaggi salvati (tabella owner-only + 2 RPC).
select has_table('public', 'saved_messages', 'saved_messages esiste');
select ok((select relrowsecurity from pg_class where oid = 'public.saved_messages'::regclass),
  'RLS attiva su saved_messages');
select has_function('public', 'save_message', array['uuid'], 'save_message(uuid) esiste');
select has_function('public', 'unsave_message', array['uuid'], 'unsave_message(uuid) esiste');

-- D3 — foto/media nei messaggi (2 colonne + valore enum).
select has_column('public', 'messages', 'media_url', 'messages.media_url esiste (foto/media)');
select has_column('public', 'messages', 'media_type', 'messages.media_type esiste');
select ok((select 'media' = any(enum_range(null::public.message_type)::text[])),
  'message_type include media');

-- §3.12–3.13 — presenza + toggle privacy (3 colonne + RPC).
select has_column('public', 'profiles', 'last_active_at', 'profiles.last_active_at esiste');
select has_column('public', 'profiles', 'show_last_seen', 'profiles.show_last_seen esiste');
select has_column('public', 'profiles', 'show_read_receipts', 'profiles.show_read_receipts esiste');
select has_function('public', 'touch_presence', 'touch_presence() esiste');

-- D1 — rubrica (tabella + consenso + 2 RPC). Sensibile: RLS senza policy di select.
select has_table('public', 'contact_hashes', 'contact_hashes esiste');
select ok((select relrowsecurity from pg_class where oid = 'public.contact_hashes'::regclass),
  'RLS attiva su contact_hashes');
select has_function('public', 'has_contacts_consent', array['uuid'],
  'has_contacts_consent(uuid) esiste');
select has_function('public', 'register_contact_hash', array['text','text'],
  'register_contact_hash(text,text) esiste');
select has_function('public', 'match_contacts', array['text[]'],
  'match_contacts(text[]) esiste');
select ok((select 'contacts_sync' = any(enum_range(null::public.consent_type)::text[])),
  'consent_type include contacts_sync');

-- =============================================================================
-- CM1 — hardening chat (20260702120000 + fix 20260702130000)
-- =============================================================================
-- Colonna edit-tracking + indice del rate-limit.
select has_column('public', 'messages', 'edited_at', 'messages.edited_at esiste (edit 48h)');
select has_index('public', 'messages', 'messages_sender_created_idx',
  'indice rate-limit (sender_id, created_at) esiste');

-- Trigger: lo storico resta, i duplicati introdotti dal primo hardening NO.
select has_trigger('public', 'messages', 'messages_before_insert_trg',
  'trigger before-insert storico presente');
select hasnt_trigger('public', 'messages', 'messages_before_insert',
  'nessun trigger before-insert duplicato');
select has_trigger('public', 'messages', 'messages_before_update_trg',
  'trigger before-update (finestra edit 48h) presente');
select hasnt_trigger('public', 'messages', 'messages_before_update',
  'vecchio nome del trigger before-update rimosso');
select has_trigger('public', 'messages', 'messages_after_insert_bump_trg',
  'trigger bump/hidden-reset presente');
select hasnt_trigger('public', 'messages', 'messages_after_insert',
  'trigger after-insert ridondante rimosso');

-- Funzioni: presenza RPC, assenza delle funzioni pericolose/ridondanti.
select has_function('public', 'get_peer_presence', array['uuid'],
  'get_peer_presence(uuid) esiste');
select hasnt_function('public', 'anonymize_user_data',
  'anonymize_user_data droppata (era una falla: grant ad authenticated)');
select hasnt_function('public', 'messages_after_insert',
  'funzione messages_after_insert droppata (fusa nel bump)');

-- Corpo di messages_before_insert: hardening presente E logica originale intatta.
select ok((select prosrc not like '%peer_id%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_insert'),
  'before_insert non referenzia colonne inesistenti (peer_id)');
select ok((select prosrc like '%blocked_pair%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_insert'),
  'before_insert applica il blocco DM (R-05)');
select ok((select prosrc like '%rate_limited%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_insert'),
  'before_insert applica il rate-limit');
select ok((select prosrc like '%message_too_long%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_insert'),
  'before_insert applica il cap 4096');
select ok((select prosrc like '%invalid_expiry%' and prosrc like '%invalid_reply_to%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_insert'),
  'before_insert conserva la logica originale (expiry + reply)');

-- GDPR (RC-12): la cancellazione account copre le nuove tabelle chat.
select ok((select prosrc like '%contact_hashes%' and prosrc like '%saved_messages%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'process_account_deletion'),
  'process_account_deletion pulisce contact_hashes e saved_messages');

-- =============================================================================
-- CM4 — chat modern (20260703120000): inoltro, reazioni, ricerca FTS, gruppi
-- =============================================================================

-- Inoltro (RC-06): colonna + FK "on delete set null" (la copia sopravvive
-- alla cancellazione dell'originale).
select has_column('public', 'messages', 'forwarded_from',
  'messages.forwarded_from esiste (inoltro)');
select ok((select confdeltype = 'n' from pg_constraint
           where conname = 'messages_forwarded_from_fkey'),
  'forwarded_from è on delete set null');

-- Ricerca (RC-08): colonna generata + indice GIN.
select has_column('public', 'messages', 'body_tsv',
  'messages.body_tsv esiste (full-text)');
select has_index('public', 'messages', 'messages_body_tsv_idx',
  'indice GIN su body_tsv esiste');

-- Reazioni (RC-07): tabella, PK composita, colonna denormalizzata, set curato.
select has_table('public', 'message_reactions', 'message_reactions esiste');
select ok((select relrowsecurity from pg_class where oid = 'public.message_reactions'::regclass),
  'RLS attiva su message_reactions');
select has_column('public', 'message_reactions', 'conversation_id',
  'message_reactions.conversation_id esiste (filtro realtime)');
select col_is_pk('public', 'message_reactions', array['message_id','user_id'],
  'PK (message_id, user_id): 1 reazione per utente per messaggio');
select ok((select count(*)::int from pg_constraint
           where conrelid = 'public.message_reactions'::regclass
             and contype = 'c'
             and pg_get_constraintdef(oid) like '%emoji%') = 1,
  'message_reactions ha il CHECK sul set curato di emoji');
select has_trigger('public', 'message_reactions', 'message_reactions_before_insert_trg',
  'trigger before-insert delle reazioni presente');

-- Policy: esattamente 3 (select membro, insert propria, delete propria);
-- l''insert passa da is_active_user (unico punto di enforcement mute/ban).
select ok((select count(*)::int from pg_policies
           where schemaname='public' and tablename='message_reactions') = 3,
  'message_reactions ha 3 policy (select/insert/delete)');
select ok((select with_check like '%is_active_user%' from pg_policies
           where schemaname='public' and tablename='message_reactions'
             and policyname='message_reactions_insert_own'),
  'insert reazioni gated da is_active_user (mute/ban)');

-- Realtime: la tabella è nella publication della chat.
select ok((select count(*)::int from pg_publication_tables
           where pubname='supabase_realtime' and schemaname='public'
             and tablename='message_reactions') = 1,
  'message_reactions è in supabase_realtime');

-- Niente path UPDATE: il cambio emoji è delete+insert (meno superficie).
select ok(not has_table_privilege('authenticated', 'public.message_reactions', 'update'),
  'authenticated non ha UPDATE su message_reactions');

-- RPC nuove: ricerca + gestione gruppo.
select has_function('public', 'search_messages', array['text','uuid','integer','timestamptz'],
  'search_messages(text,uuid,int,timestamptz) esiste');
select has_function('public', 'update_conversation_meta', array['uuid','text','text'],
  'update_conversation_meta(uuid,text,text) esiste');
select has_function('public', 'promote_conversation_admin', array['uuid','uuid'],
  'promote_conversation_admin(uuid,uuid) esiste');
select ok(has_function_privilege('authenticated', 'public.search_messages(text,uuid,int,timestamptz)', 'execute')
      and has_function_privilege('authenticated', 'public.update_conversation_meta(uuid,text,text)', 'execute')
      and has_function_privilege('authenticated', 'public.promote_conversation_admin(uuid,uuid)', 'execute'),
  'le 3 RPC CM4 sono eseguibili da authenticated');

-- search_messages: sintassi websearch + visibilità identica alla lista messaggi.
select ok((select prosrc like '%websearch_to_tsquery%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_messages'),
  'search_messages usa websearch_to_tsquery');
select ok((select prosrc like '%cleared_at%' and prosrc like '%hidden_at%'
             and prosrc like '%deleted_at%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_messages'),
  'search_messages rispetta cleared/hidden/deleted');

-- R-09: l''uscita dell''ultimo admin promuove il membro più anziano.
select ok((select prosrc like '%joined_at%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'leave_conversation'),
  'leave_conversation auto-promuove per anzianità (R-09)');

-- Guardie di regressione (lezione CM1): i trigger ridefiniti contengono i
-- blocchi nuovi E conservano quelli vecchi (le guardie CM1 sopra restano valide).
select ok((select prosrc like '%forwarded_from%' and prosrc like '%cannot_forward_type%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_insert'),
  'before_insert valida l''inoltro (solo testo, origine visibile)');
select ok((select prosrc like '%forwarded_from%' and prosrc like '%edit_window_expired%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_update'),
  'before_update: forwarded_from immutabile + finestra edit intatta');

-- GDPR: la cancellazione account pulisce anche le reazioni.
select ok((select prosrc like '%message_reactions%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'process_account_deletion'),
  'process_account_deletion pulisce message_reactions');

-- =============================================================================
-- CM5 — chat media hardening (20260703130000): bucket, validazione, inoltro foto
-- =============================================================================

-- Bucket chat-media: privato (voce/foto dei minori MAI pubbliche), 15 MB,
-- whitelist MIME immagine.
select ok((select not public from storage.buckets where id = 'chat-media'),
  'bucket chat-media è privato');
select ok((select file_size_limit = 15728640 from storage.buckets where id = 'chat-media'),
  'bucket chat-media ha limite 15 MB');
select ok((select allowed_mime_types = array['image/png','image/jpeg','image/webp']
           from storage.buckets where id = 'chat-media'),
  'bucket chat-media accetta solo png/jpeg/webp');

-- Le 3 policy path-based (read membri / write propria cartella / delete proprietario).
select ok((select count(*)::int from pg_policies
           where schemaname='storage' and tablename='objects'
             and policyname like 'chat_media_%') = 3,
  'chat-media ha 3 policy storage path-based');

-- Validazione media nel trigger di insert (guardie prosrc sui codici errore).
select ok((select prosrc like '%media_url_required%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_insert'),
  'before_insert esige media_url sui messaggi media');
select ok((select prosrc like '%invalid_media_type%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_insert'),
  'before_insert valida media_type (solo image)');
select ok((select prosrc like '%invalid_media_path%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_insert'),
  'before_insert esige il prefisso <conv>/<sender>/ (anti cross-conversazione)');
select ok((select prosrc like '%media_cannot_expire%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_insert'),
  'before_insert vieta expires_at sui media (foto permanenti)');

-- Inoltro esteso: testo E media inoltrabili, vocali ancora vietati (guardia di
-- regressione: cannot_forward_type resta).
select ok((select prosrc like '%(''text'', ''media'')%'
             and prosrc like '%cannot_forward_type%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_insert'),
  'inoltro esteso a testo+media, vocali vietati');

-- Media immutabili in update (con eccezione azzeramento su soft-delete/GDPR).
select ok((select prosrc like '%media_url%' and prosrc like '%media_type%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_update'),
  'before_update: media_url/media_type immutabili');

-- GDPR: l''anonimizzazione azzera anche i riferimenti media.
select ok((select prosrc like '%media_url = null%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'process_account_deletion'),
  'process_account_deletion azzera media_url/media_type');

-- =============================================================================
-- CM7 — rubrica: revoca atomica del consenso (20260705100000)
-- =============================================================================
select has_function('public', 'revoke_contacts_sync', array[]::text[],
  'revoke_contacts_sync() esiste');
select ok((select has_function_privilege('authenticated', 'public.revoke_contacts_sync()', 'execute')),
  'revoke_contacts_sync eseguibile da authenticated');
-- Atomica: cancella gli hash propri E revoca il consenso nella stessa funzione.
select ok((select prosrc like '%delete from public.contact_hashes%'
             and prosrc like '%record_consent%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'revoke_contacts_sync'),
  'revoke_contacts_sync cancella gli hash e revoca il consenso insieme');
-- Guardia di regressione sulla regola di safety del match (confermata dal
-- product owner il 2026-07-04): minori solo ad amici, mai coppie bloccate.
select ok((select prosrc like '%is_adult%' and prosrc like '%are_friends%'
             and prosrc like '%is_blocked_pair%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'match_contacts'),
  'match_contacts conserva le regole minori-solo-amici e niente-bloccati');

-- =============================================================================
-- CM8 — chat_overview (20260705110000): hub server-side in una query
-- =============================================================================
select has_function('public', 'chat_overview', array[]::text[],
  'chat_overview() esiste');
select ok((select has_function_privilege('authenticated', 'public.chat_overview()', 'execute')),
  'chat_overview eseguibile da authenticated');
-- Semantica CM1 conservata: cleared_at, deleted_at ed expires_at filtrati.
select ok((select prosrc like '%cleared_at%' and prosrc like '%deleted_at is null%'
             and prosrc like '%expires_at%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'chat_overview'),
  'chat_overview filtra cleared/deleted/expired');

-- =============================================================================
-- CM8 — spunte: enforcement server (20260705120000)
-- =============================================================================
select has_function('public', 'get_read_receipts', array['uuid'],
  'get_read_receipts(uuid) esiste');
select ok((select has_function_privilege('authenticated', 'public.get_read_receipts(uuid)', 'execute')),
  'get_read_receipts eseguibile da authenticated');
-- Il dato raw non è più leggibile: last_read_at altrui SOLO via RPC.
select ok((select not has_column_privilege('authenticated', 'public.conversation_members', 'last_read_at', 'SELECT')),
  'conversation_members.last_read_at NON leggibile raw');
select ok((select not has_column_privilege('authenticated', 'public.profiles', 'last_active_at', 'SELECT')),
  'profiles.last_active_at NON leggibile raw (chiuso compromesso CM1)');
select ok((select not has_column_privilege('authenticated', 'public.profiles', 'expo_push_token', 'SELECT')),
  'profiles.expo_push_token NON leggibile (anti spam push)');
-- Contratto positivo: le colonne che il client usa restano concesse.
select ok((select has_column_privilege('authenticated', 'public.conversation_members', 'cleared_at', 'SELECT')),
  'conversation_members.cleared_at resta leggibile');
select ok((select has_column_privilege('authenticated', 'public.profiles', 'username', 'SELECT')),
  'profiles.username resta leggibile');

select * from finish();
rollback;
