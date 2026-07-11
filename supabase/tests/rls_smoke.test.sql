-- =============================================================================
-- Televo — pgTAP smoke test (struttura + RLS abilitata + helper)
-- =============================================================================
-- Esecuzione: `supabase test db` (richiede l'estensione pgtap, disponibile su
-- Supabase). Verifica le invarianti fondamentali del backend Fase 1-8 + GDPR.

begin;
select plan(537);

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

-- =============================================================================
-- CM8 — pulizia gruppi orfani (20260705130000): expire_content v4
-- =============================================================================
-- La logica drops/messaggi resta intatta (verbatim) e si aggiunge la
-- cancellazione degli orfani. (La parte mappa è passata a v6 in MM1: v. sotto.)
select ok((select prosrc like '%stats_finali%' and prosrc like '%delete from public.messages%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'expire_content'),
  'expire_content conserva la logica drops (stats_finali) e messaggi');
select ok((select prosrc like '%conversation_members%' and prosrc like '%delete from public.conversations%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'expire_content'),
  'expire_content v4 cancella i gruppi orfani (0 membri)');

-- =============================================================================
-- CM8 — audit grant vs default privileges (20260705140000)
-- =============================================================================
-- Le tabelle ledger/sistema: authenticated NON scrive (solo service_role/RPC).
select ok((select not has_table_privilege('authenticated', 'public.aura_events', 'INSERT')),
  'authenticated non inserisce aura_events');
select ok((select not has_table_privilege('authenticated', 'public.aura_events', 'UPDATE')),
  'authenticated non aggiorna aura_events');
select ok((select not has_table_privilege('authenticated', 'public.wallets', 'INSERT')),
  'authenticated non inserisce wallets');
select ok((select not has_table_privilege('authenticated', 'public.wallets', 'UPDATE')),
  'authenticated non aggiorna wallets');
select ok((select not has_table_privilege('authenticated', 'public.vibe_transactions', 'INSERT')),
  'authenticated non inserisce vibe_transactions');
select ok((select not has_table_privilege('authenticated', 'public.moderation_queue', 'INSERT')),
  'authenticated non inserisce moderation_queue');
select ok((select not has_table_privilege('authenticated', 'public.moderation_actions', 'UPDATE')),
  'authenticated non aggiorna moderation_actions');
-- audit_log: nessun accesso dal client.
select ok((select not has_table_privilege('authenticated', 'public.audit_log', 'SELECT')),
  'authenticated non legge audit_log');
-- Mutazioni sociali/conversazioni: solo via RPC (niente scrittura diretta).
select ok((select not has_table_privilege('authenticated', 'public.friendships', 'INSERT')),
  'authenticated non inserisce friendships (via RPC)');
select ok((select not has_table_privilege('authenticated', 'public.conversations', 'INSERT')),
  'authenticated non inserisce conversations (via RPC)');
select ok((select not has_table_privilege('authenticated', 'public.messages', 'DELETE')),
  'authenticated non DELETE messages (soft-delete via update)');
select ok((select not has_table_privilege('authenticated', 'public.contact_hashes', 'SELECT')),
  'authenticated non legge contact_hashes (solo via RPC)');
-- Notifiche: contratto positivo — solo read_at aggiornabile.
select ok((select has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE')),
  'authenticated aggiorna notifications.read_at');
select ok((select not has_column_privilege('authenticated', 'public.notifications', 'created_at', 'UPDATE')),
  'authenticated non aggiorna altre colonne di notifications');
-- anon: nessuna lettura di dati sensibili (app invite-only, tutto post-auth).
select ok((select not has_table_privilege('anon', 'public.profiles', 'SELECT')),
  'anon non legge profiles');
select ok((select not has_table_privilege('anon', 'public.wallets', 'SELECT')),
  'anon non legge wallets');

-- =============================================================================
-- M6 DM0 — Drops v2: fondamenta (drop.md §20). Modello, interazioni, lettura,
-- ciclo di vita, storage, notifiche, guardie anti-regressione (school, expire).
-- =============================================================================

-- Esistenza tabelle nuove.
select has_table('public', 'drop_comments',          'drop_comments esiste');
select has_table('public', 'drop_likes',             'drop_likes esiste');
select has_table('public', 'drop_saves',             'drop_saves esiste');
select has_table('public', 'storage_cleanup_queue',  'storage_cleanup_queue esiste');

-- RLS abilitata su tutte e quattro.
select ok((select relrowsecurity from pg_class where oid = 'public.drop_comments'::regclass),
  'RLS attiva su drop_comments');
select ok((select relrowsecurity from pg_class where oid = 'public.drop_likes'::regclass),
  'RLS attiva su drop_likes');
select ok((select relrowsecurity from pg_class where oid = 'public.drop_saves'::regclass),
  'RLS attiva su drop_saves');
select ok((select relrowsecurity from pg_class where oid = 'public.storage_cleanup_queue'::regclass),
  'RLS attiva su storage_cleanup_queue');

-- storage_cleanup_queue: nessuna policy (pattern audit_log: solo definer/service_role).
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='storage_cleanup_queue'),
  0, 'storage_cleanup_queue non ha policy (solo service_role/definer)');

-- Colonne nuove di drops.
select has_column('public', 'drops', 'audio_seconds', 'drops.audio_seconds esiste');
select has_column('public', 'drops', 'stats_finali',  'drops.stats_finali esiste (Ricordi)');

-- R-02/D-3: audience solo 'friends', il ramo school è sparito dal constraint.
select ok((select count(*)::int from pg_constraint
           where conrelid = 'public.drops'::regclass and conname = 'drops_audience_check'
             and pg_get_constraintdef(oid) like '%friends%'
             and pg_get_constraintdef(oid) not like '%school%') = 1,
  'drops.audience CHECK è solo-amici (niente school)');

-- RC-09: can_see_drop v2 non contiene più il ramo school.
select ok((select prosrc not like '%school%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'can_see_drop'),
  'can_see_drop non referenzia più school (R-02)');

-- RC-09: expire_content v5 NON cancella più i drop e congela stats_finali (R-01).
select ok((select prosrc not like '%delete from public.drops where%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'expire_content'),
  'expire_content NON cancella più i drop (effimerità logica)');
select ok((select prosrc like '%stats_finali%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'expire_content'),
  'expire_content congela le statistiche finali alla scadenza');

-- Guardie prosrc sui codici errore del trigger drops_before_insert v3.
select ok((select prosrc like '%invalid_audio_path%' and prosrc like '%invalid_media_path%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'drops_before_insert'),
  'drops_before_insert esige il path <id>/<author>/ per audio e media');
select ok((select prosrc like '%invalid_audio_duration%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'drops_before_insert'),
  'drops_before_insert valida la durata audio (1–300s)');
select ok((select prosrc like '%rate_limited%' and prosrc like '%caption_too_long%'
             and prosrc like '%drop_too_long%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'drops_before_insert'),
  'drops_before_insert applica rate-limit + cap testo/caption');
select ok((select prosrc like '%invalid_drop_fields%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'drops_before_insert'),
  'drops_before_insert vieta i campi incrociati tra formati');

-- Guardie prosrc sul trigger drop_comments_before_insert (R-07).
select ok((select prosrc like '%reply_depth_exceeded%' and prosrc like '%invalid_parent%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'drop_comments_before_insert'),
  'drop_comments_before_insert impone reply a profondità 1 sullo stesso drop');
select ok((select prosrc like '%drop_expired%' and prosrc like '%rate_limited%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'drop_comments_before_insert'),
  'drop_comments_before_insert esige drop vivo + rate-limit');

-- RPC di lettura/salvataggio: esistenza.
select has_function('public', 'drops_feed', array['timestamptz','uuid','integer'],
  'drops_feed(timestamptz,uuid,integer) esiste');
select has_function('public', 'drop_detail', array['uuid'], 'drop_detail(uuid) esiste');
select has_function('public', 'save_drop',   array['uuid'], 'save_drop(uuid) esiste');
select has_function('public', 'unsave_drop', array['uuid'], 'unsave_drop(uuid) esiste');

-- Le 4 RPC sono security definer con search_path svuotato (regola d'oro).
select ok((select bool_and(prosecdef) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('drops_feed','drop_detail','save_drop','unsave_drop')),
  'drops_feed/drop_detail/save_drop/unsave_drop sono security definer');
select ok((select bool_and(proconfig::text like '%search_path=%') from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('drops_feed','drop_detail','save_drop','unsave_drop')),
  'le 4 RPC drops hanno search_path impostato');
select ok(has_function_privilege('authenticated', 'public.drops_feed(timestamptz,uuid,integer)', 'execute')
      and has_function_privilege('authenticated', 'public.drop_detail(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.save_drop(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.unsave_drop(uuid)', 'execute'),
  'le 4 RPC drops sono eseguibili da authenticated');

-- RC-02: drops_feed replica il predicato di visibilità della RLS (are_friends +
-- expires_at, niente school) e valorizza i contatori SOLO per l'autore.
select ok((select prosrc like '%are_friends%' and prosrc like '%expires_at%'
             and prosrc not like '%school%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'drops_feed'),
  'drops_feed replica la visibilità della RLS (amici + drop vivo, no school)');
select ok((select prosrc like '%author_id = me.uid%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'drops_feed'),
  'drops_feed valorizza i contatori SOLO per l''autore (R-04)');

-- Grant minimi (revoke all + re-grant): niente scritture proibite dal client.
select ok((select not has_table_privilege('authenticated', 'public.drop_comments', 'UPDATE')),
  'authenticated non aggiorna drop_comments (niente edit, R-12)');
select ok((select not has_table_privilege('authenticated', 'public.drop_saves', 'INSERT')),
  'authenticated non inserisce drop_saves (solo via RPC save_drop)');
select ok((select not has_table_privilege('authenticated', 'public.drop_saves', 'DELETE')),
  'authenticated non cancella drop_saves (solo via RPC unsave_drop)');
select ok((select not has_table_privilege('authenticated', 'public.storage_cleanup_queue', 'SELECT')),
  'authenticated non legge storage_cleanup_queue');
select ok((select not has_table_privilege('anon', 'public.drop_comments', 'SELECT')),
  'anon non legge drop_comments (app invite-only)');
-- Contratto positivo dei grant.
select ok((select has_column_privilege('authenticated', 'public.drop_likes', 'drop_id', 'INSERT')),
  'authenticated inserisce drop_likes.drop_id (toggle like)');
select ok((select has_column_privilege('authenticated', 'public.drops', 'id', 'INSERT')
             and has_column_privilege('authenticated', 'public.drops', 'audio_seconds', 'INSERT')),
  'authenticated inserisce drops.id (R-03) e audio_seconds');

-- R-06: bucket privati dedicati + policy storage path-based.
select ok((select not public from storage.buckets where id = 'drop-media'),
  'bucket drop-media è privato');
select ok((select file_size_limit = 15728640 from storage.buckets where id = 'drop-media'),
  'bucket drop-media ha limite 15 MB');
select ok((select (not public) and file_size_limit = 26214400 from storage.buckets where id = 'drop-audio'),
  'bucket drop-audio è privato con limite 25 MB');
select ok((select count(*)::int from pg_policies
           where schemaname='storage' and tablename='objects' and policyname like 'drop_media_%') = 3,
  'drop-media ha 3 policy storage (read/write/delete)');
select ok((select count(*)::int from pg_policies
           where schemaname='storage' and tablename='objects' and policyname like 'drop_audio_%') = 3,
  'drop-audio ha 3 policy storage (read/write/delete)');
select ok((select qual like '%can_see_drop%' from pg_policies
           where schemaname='storage' and tablename='objects' and policyname='drop_media_read_visible'),
  'la lettura di drop-media passa da can_see_drop');

-- Enum estesi (migrazione drops_notify_enum).
select ok((select 'drop_comment' = any(enum_range(null::public.notification_type)::text[])),
  'notification_type include drop_comment');
select ok((select 'drop_comment' = any(enum_range(null::public.moderation_target)::text[])),
  'moderation_target include drop_comment');

-- Verbatim+add: moderation_target_user mappa anche il commento al suo autore.
select ok((select prosrc like '%drop_comments%' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'moderation_target_user'),
  'moderation_target_user gestisce il ramo drop_comment');

-- RC-08: la cancellazione account copre le interazioni drops su contenuti altrui.
select ok((select prosrc like '%drop_comments%' and prosrc like '%drop_likes%'
             and prosrc like '%drop_saves%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'process_account_deletion'),
  'process_account_deletion pulisce drop_comments/likes/saves');

-- RC-04: i commenti sono l'unico punto realtime (publication estesa).
select ok((select count(*)::int from pg_publication_tables
           where pubname='supabase_realtime' and schemaname='public' and tablename='drop_comments') = 1,
  'drop_comments è in supabase_realtime');

-- Trigger e funzioni di servizio presenti.
select has_trigger('public', 'drop_comments', 'drop_comments_before_insert_trg',
  'trigger before-insert commenti presente');
select has_trigger('public', 'drop_comments', 'drop_comments_after_insert_notify_trg',
  'trigger notifica commenti presente');
select has_trigger('public', 'drop_likes', 'drop_likes_before_insert_trg',
  'trigger before-insert like presente');
select has_trigger('public', 'drops', 'drops_after_delete_cleanup',
  'trigger after-delete cleanup su drops presente');
select has_function('public', 'enqueue_storage_cleanup', 'enqueue_storage_cleanup() esiste');

-- =============================================================================
-- DM5 — inoltro drop come riferimento (20260706120000_drops_forward)
-- =============================================================================
-- R-08: messages.drop_ref è un PUNTATORE (mai una copia). FK on delete set null
-- → il riferimento degrada a "non disponibile" se il drop viene eliminato.
select has_column('public', 'messages', 'drop_ref',
  'messages.drop_ref esiste (inoltro drop, DM5)');
select ok((select confdeltype = 'n' from pg_constraint
           where conname = 'messages_drop_ref_fkey'),
  'drop_ref è on delete set null (degrada a "non disponibile")');
-- Il client può valorizzare drop_ref in insert (grant per-colonna additivo).
select ok((select has_column_privilege('authenticated', 'public.messages', 'drop_ref', 'INSERT')),
  'authenticated inserisce messages.drop_ref');
-- Verbatim+add: il trigger valida il riferimento (solo testo, visibilità del
-- mittente via can_see_drop) E conserva i blocchi CM4/CM5 (inoltro foto, media).
select ok((select prosrc like '%drop_ref%' and prosrc like '%invalid_drop_ref%'
             and prosrc like '%can_see_drop%' and prosrc like '%invalid_media_path%'
             and prosrc like '%cannot_forward_type%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'messages_before_insert'),
  'before_insert valida drop_ref (R-08) senza perdere i blocchi CM4/CM5');

-- =============================================================================
-- DM6 — scheduling pulizia storage (20260706130000_storage_cleanup_cron)
-- =============================================================================
-- R-09: la coda storage_cleanup_queue (DM0) ha finalmente un consumatore. La Edge
-- storage-cleanup la svuota via Storage API (l'hosted vieta DELETE su
-- storage.objects); qui verifichiamo lo scheduler lato DB (specchio dispatch_push).
select has_function('public', 'dispatch_storage_cleanup',
  'dispatch_storage_cleanup() esiste (scheduler pulizia storage)');
-- Regola d'oro: security definer + search_path svuotato.
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'dispatch_storage_cleanup'),
  'dispatch_storage_cleanup è security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'dispatch_storage_cleanup'),
  'dispatch_storage_cleanup ha search_path svuotato');
-- No-op sicuro: guardia coda vuota + lettura Vault + endpoint corretto.
select ok((select prosrc like '%storage_cleanup_queue%' and prosrc like '%decrypted_secrets%'
             and prosrc like '%/functions/v1/storage-cleanup%'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'dispatch_storage_cleanup'),
  'dispatch_storage_cleanup: guardia coda + Vault + endpoint storage-cleanup');
-- Cron ogni 15 minuti, schedulato una sola volta.
select ok((select count(*)::int from cron.job where jobname = 'storage-cleanup-15min') = 1,
  'cron storage-cleanup-15min schedulato');

-- =============================================================================
-- DM7 — "Drop del giorno" (20260706140000_drop_prompt_enum + 20260706140100)
-- =============================================================================
-- §16.2: tema curato giornaliero + UNA notifica broadcast dosata. Tabelle di
-- SISTEMA (nessuna scrittura client, lettura del tema solo via RPC definer),
-- broadcast solo agli utenti attivi, invio semi-random ma una-volta-al-giorno.

-- Struttura + RLS (tabelle di sistema, come audit_log/storage_cleanup_queue).
select has_table('public', 'drop_prompts',       'drop_prompts esiste');
select has_table('public', 'drop_prompt_of_day',  'drop_prompt_of_day esiste');
select ok((select relrowsecurity from pg_class where oid = 'public.drop_prompts'::regclass),
  'RLS attiva su drop_prompts');
select ok((select relrowsecurity from pg_class where oid = 'public.drop_prompt_of_day'::regclass),
  'RLS attiva su drop_prompt_of_day');
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='drop_prompts'),
  0, 'drop_prompts non ha policy (solo sistema/definer)');
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='drop_prompt_of_day'),
  0, 'drop_prompt_of_day non ha policy (solo sistema/definer)');
select ok((select not has_table_privilege('authenticated', 'public.drop_prompts', 'SELECT')),
  'authenticated non legge drop_prompts (tema via RPC definer)');
select ok((select not has_table_privilege('authenticated', 'public.drop_prompt_of_day', 'SELECT')),
  'authenticated non legge drop_prompt_of_day');
select ok((select not has_table_privilege('anon', 'public.drop_prompts', 'SELECT')),
  'anon non legge drop_prompts (app invite-only)');
select has_column('public', 'drop_prompt_of_day', 'send_after',
  'drop_prompt_of_day ha send_after (orario invio semi-random)');

-- Enum notification_type esteso col tema del giorno.
select ok((select exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'notification_type' and e.enumlabel = 'drop_prompt')),
  'notification_type ha il valore drop_prompt');

-- RPC di lettura del tema (drop_prompt_today): definer + search_path + execute client.
select has_function('public', 'drop_prompt_today', 'drop_prompt_today() esiste');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname='drop_prompt_today'),
  'drop_prompt_today è security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname='drop_prompt_today'),
  'drop_prompt_today ha search_path svuotato');
select ok((select has_function_privilege('authenticated', 'public.drop_prompt_today()', 'EXECUTE')),
  'authenticated può leggere il tema di oggi (drop_prompt_today)');

-- pick/notify: definer + search_path, e NON eseguibili dal client (solo cron).
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname='pick_drop_prompt_of_day'),
  'pick_drop_prompt_of_day è security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname='pick_drop_prompt_of_day'),
  'pick_drop_prompt_of_day ha search_path svuotato');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname='notify_drop_prompt'),
  'notify_drop_prompt è security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname='notify_drop_prompt'),
  'notify_drop_prompt ha search_path svuotato');
select ok((select not has_function_privilege('authenticated', 'public.pick_drop_prompt_of_day()', 'EXECUTE')),
  'authenticated non esegue pick_drop_prompt_of_day (solo cron)');
select ok((select not has_function_privilege('authenticated', 'public.notify_drop_prompt()', 'EXECUTE')),
  'authenticated non esegue notify_drop_prompt (solo cron)');

-- Guardie prosrc (semantica che protegge i pilastri).
select ok((select prosrc like '%is_active_user%' and prosrc like '%drop_prompt%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='notify_drop_prompt'),
  'notify_drop_prompt: broadcast SOLO agli utenti attivi');
select ok((select prosrc like '%send_after%' and prosrc like '%notified_at%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='notify_drop_prompt'),
  'notify_drop_prompt: guard send_after + una-volta-al-giorno (notified_at)');
select ok((select prosrc like '%Europe/Rome%' and prosrc like '%last_used_on%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='pick_drop_prompt_of_day'),
  'pick_drop_prompt_of_day: giorno Europe/Rome + rotazione LRU (last_used_on)');

-- Cron schedulati una sola volta + seed presente.
select ok((select count(*)::int from cron.job where jobname = 'drop-prompt-pick-daily') = 1,
  'cron drop-prompt-pick-daily schedulato');
select ok((select count(*)::int from cron.job where jobname = 'drop-prompt-notify') = 1,
  'cron drop-prompt-notify schedulato');
select ok((select exists (select 1 from public.drop_prompts where is_active)),
  'seed: almeno un tema curato attivo esiste');

-- =============================================================================
-- M7 · MM0 — Mappa v2, fondamenta backend (20260707120000_map_v2_foundation)
-- =============================================================================
-- docs/map/map.md §16 MM0. Invarianti: PostGIS attivo; le tabelle mappa NON sono
-- leggibili dal client (lettura solo via RPC definer, MM2); masking/rate-limit/
-- cap-2 codificati nelle RPC; ogni RPC è definer con search_path svuotato e
-- grant mirato ad authenticated. Le prove FUNZIONALI (masking persiste il centro,
-- rate-limit, cap enforced, publish rifiutato) sono nello smoke via pooler.

-- PostGIS installato (prima estensione "pesante" del progetto).
select ok((select exists (select 1 from pg_extension where extname = 'postgis')),
  'PostGIS installato');

-- Tabelle presenti.
select has_table('public', 'map_presence',   'map_presence esiste');
select has_table('public', 'map_events',      'map_events esiste');
select has_table('public', 'map_safe_zones',  'map_safe_zones esiste');

-- Enum del tipo evento (v1: room_live).
select ok((select exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'map_event_type' and e.enumlabel = 'room_live')),
  'map_event_type ha il valore room_live');

-- RLS attiva su tutte e tre.
select ok((select relrowsecurity from pg_class where oid = 'public.map_presence'::regclass),
  'RLS attiva su map_presence');
select ok((select relrowsecurity from pg_class where oid = 'public.map_events'::regclass),
  'RLS attiva su map_events');
select ok((select relrowsecurity from pg_class where oid = 'public.map_safe_zones'::regclass),
  'RLS attiva su map_safe_zones');

-- map_presence/map_events: NESSUNA policy (pattern audit_log → solo RPC definer).
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='map_presence'),
  0, 'map_presence non ha policy (lettura solo via RPC)');
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='map_events'),
  0, 'map_events non ha policy (lettura solo via RPC)');
-- map_safe_zones: esattamente 1 policy (select owner-only).
select is((select count(*)::int from pg_policies where schemaname='public' and tablename='map_safe_zones'),
  1, 'map_safe_zones ha una sola policy (select owner-only)');

-- Un estraneo/authenticated NON legge le tabelle di posizione.
select ok((select not has_table_privilege('authenticated', 'public.map_presence', 'SELECT')),
  'authenticated non legge map_presence (solo snapshot RPC)');
select ok((select not has_table_privilege('authenticated', 'public.map_events', 'SELECT')),
  'authenticated non legge map_events (solo snapshot RPC)');
select ok((select not has_table_privilege('anon', 'public.map_presence', 'SELECT')),
  'anon non legge map_presence');
-- L'owner può leggere le proprie Safe Zone (via RLS), ma non mutarle direttamente.
select ok((select has_table_privilege('authenticated', 'public.map_safe_zones', 'SELECT')),
  'authenticated legge map_safe_zones (owner-only via RLS)');
select ok((select not has_table_privilege('authenticated', 'public.map_safe_zones', 'INSERT')),
  'authenticated non inserisce map_safe_zones (mutazioni solo via RPC)');

-- Colonne chiave presenti.
select has_column('public', 'map_presence', 'location',              'map_presence.location esiste');
select has_column('public', 'map_presence', 'masked',                'map_presence.masked esiste');
select has_column('public', 'map_presence', 'sharing_until',         'map_presence.sharing_until esiste');
select has_column('public', 'map_presence', 'visibility_expires_at', 'map_presence.visibility_expires_at esiste');
select has_column('public', 'map_events',   'visibility_expires_at', 'map_events.visibility_expires_at esiste');
select has_column('public', 'map_safe_zones', 'radius_m',            'map_safe_zones.radius_m esiste');

-- Indici distintivi: unique parziale "una bolla live per stanza" + GIST posizione.
select ok((select exists (select 1 from pg_indexes
             where schemaname='public' and indexname='map_events_room_live_uidx')),
  'map_events: unique parziale room_id where ended_at is null');
select ok((select exists (select 1 from pg_indexes
             where schemaname='public' and indexname='map_presence_location_idx')),
  'map_presence: indice GIST sulla posizione');

-- Helper di visibilità: definer, search_path svuotato, NON eseguibile dal client.
select has_function('public', 'can_see_on_map', 'can_see_on_map esiste');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='can_see_on_map'),
  'can_see_on_map è security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='can_see_on_map'),
  'can_see_on_map ha search_path svuotato');
select ok((select not has_function_privilege('authenticated', 'public.can_see_on_map(uuid, uuid)', 'EXECUTE')),
  'authenticated non esegue can_see_on_map (solo funzioni definer interne)');

-- Le 5 RPC di scrittura esistono.
select has_function('public', 'map_start_sharing',    'map_start_sharing esiste');
select has_function('public', 'map_stop_sharing',     'map_stop_sharing esiste');
select has_function('public', 'map_publish_location', 'map_publish_location esiste');
select has_function('public', 'map_set_safe_zone',    'map_set_safe_zone esiste');
select has_function('public', 'map_delete_safe_zone', 'map_delete_safe_zone esiste');

-- Regola d'oro: definer + search_path svuotato (spot-check su publish).
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='map_publish_location'),
  'map_publish_location è security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='map_publish_location'),
  'map_publish_location ha search_path svuotato');

-- Le RPC sono eseguibili SOLO da authenticated (client), non da anon.
select ok((select has_function_privilege('authenticated', 'public.map_start_sharing(int)', 'EXECUTE')),
  'authenticated esegue map_start_sharing');
select ok((select has_function_privilege('authenticated', 'public.map_stop_sharing()', 'EXECUTE')),
  'authenticated esegue map_stop_sharing');
select ok((select has_function_privilege('authenticated', 'public.map_publish_location(double precision, double precision)', 'EXECUTE')),
  'authenticated esegue map_publish_location');
select ok((select has_function_privilege('authenticated', 'public.map_set_safe_zone(text, double precision, double precision, int)', 'EXECUTE')),
  'authenticated esegue map_set_safe_zone');
select ok((select has_function_privilege('authenticated', 'public.map_delete_safe_zone(uuid)', 'EXECUTE')),
  'authenticated esegue map_delete_safe_zone');
select ok((select not has_function_privilege('anon', 'public.map_start_sharing(int)', 'EXECUTE')),
  'anon non esegue map_start_sharing (app invite-only)');

-- Guardie prosrc: la semantica che protegge i pilastri è nel corpo delle RPC.
select ok((select prosrc like '%invalid_duration%' and prosrc like '%is_active_user%'
             and prosrc like '%location_sharing_off%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_start_sharing'),
  'map_start_sharing: cap durata + is_active_user + kill-switch');
select ok((select prosrc like '%st_dwithin%' and prosrc like '%masked%'
             and prosrc like '%no_active_session%' and prosrc like '%20 seconds%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_publish_location'),
  'map_publish_location: masking (st_dwithin) + sessione + rate-limit 20s');
select ok((select prosrc like '%is_active_user%' and prosrc like '%invalid_location%'
             and prosrc like '%visibility_expires_at%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_publish_location'),
  'map_publish_location: enforcement + bounds + TTL 24h');
select ok((select prosrc like '%zone_limit_reached%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_safe_zones_cap'),
  'map_safe_zones_cap: cap 2 zone a livello dati');
select ok((select prosrc like '%zone_limit_reached%' and prosrc like '%invalid_radius%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_set_safe_zone'),
  'map_set_safe_zone: cap 2 + raggio 100-500m');

-- Trigger di cap montato su map_safe_zones.
select ok((select exists (select 1 from pg_trigger
             where tgrelid='public.map_safe_zones'::regclass and tgname='map_safe_zones_cap_trg')),
  'trigger map_safe_zones_cap_trg presente su map_safe_zones');

-- Kill-switch master: spegnere share_location cancella la presenza (trigger su
-- profiles), atomico. La funzione è definer.
select ok((select exists (select 1 from pg_trigger
             where tgrelid='public.profiles'::regclass and tgname='profiles_map_kill_switch_trg')),
  'trigger profiles_map_kill_switch_trg presente su profiles (kill-switch)');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='profiles_map_kill_switch'),
  'profiles_map_kill_switch è security definer');

-- =============================================================================
-- M7 · Mappa v2 (MM1) — legacy Fase 5 rimosso + ciclo di vita v6
-- =============================================================================
-- docs/map/map.md §16 MM1. La "Mappa Vibe" geohash (Fase 5) è deprecata: tabelle,
-- view e RPC droppate ATOMICAMENTE con le v6 di expire_content /
-- process_account_deletion (vincolo di ordinamento §13.4). Invarianti: nulla di
-- legacy sopravvive; il kill-switch share_location resta; le v6 puliscono la
-- Mappa v2 e non citano più le tabelle legacy.

-- Tabelle e view legacy SPARITE.
select hasnt_table('public', 'live_presence',  'live_presence rimossa (legacy Fase 5)');
select hasnt_table('public', 'room_locations', 'room_locations rimossa (legacy Fase 5)');
select hasnt_view('public',  'vibe_map',        'vibe_map rimossa (legacy Fase 5)');

-- RPC geohash SPARITE (catalogo, per non dipendere dagli overload di hasnt_function).
select ok((select not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='update_presence')),
  'update_presence rimossa (RPC geohash legacy)');
select ok((select not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='clear_presence')),
  'clear_presence rimossa (RPC geohash legacy)');
select ok((select not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='set_room_location')),
  'set_room_location rimossa (RPC geohash legacy)');

-- Kill-switch: profiles.share_location RESTA (nuova semantica, map.md §3).
select has_column('public', 'profiles', 'share_location',
  'profiles.share_location resta (kill-switch mappa v2)');

-- expire_content v6: pulisce le tabelle Mappa v2, non più le legacy.
select ok((select prosrc like '%map_presence%' and prosrc like '%map_events%'
             and prosrc not like '%live_presence%' and prosrc not like '%room_locations%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='expire_content'),
  'expire_content v6: pulizia map_presence/map_events, zero riferimenti legacy');

-- process_account_deletion v6: rimuove le righe Mappa v2 dell'utente, non le legacy.
select ok((select prosrc like '%map_presence%' and prosrc like '%map_events%'
             and prosrc like '%map_safe_zones%'
             and prosrc not like '%live_presence%' and prosrc not like '%room_locations%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='process_account_deletion'),
  'process_account_deletion v6: cancella righe Mappa v2, zero riferimenti legacy');

-- =============================================================================
-- M7 · Mappa v2 (MM2) — stanze sulla mappa + snapshot di lettura
-- =============================================================================
-- docs/map/map.md §16 MM2. La porta di LETTURA (map_snapshot) + le bolle Stanze
-- Live (map_attach_room/map_detach_room) + il trigger rooms→map_events (chiusura
-- eventi → Echo). Invarianti strutturali qui; le prove FUNZIONALI (attach visibile
-- all'amico e non all'estraneo, fine stanza → echo, detach = sparizione) sono
-- nello smoke via pooler. La lettura resta blindata: nessuna select policy sulle
-- tabelle di posizione, solo la RPC definer.

-- Le 3 RPC di MM2 esistono.
select has_function('public', 'map_attach_room',  'map_attach_room esiste');
select has_function('public', 'map_detach_room',  'map_detach_room esiste');
select has_function('public', 'map_snapshot',     'map_snapshot esiste');

-- map_snapshot: definer + search_path svuotato (la porta di lettura filtra
-- server-side; mai una select policy sulle tabelle di posizione).
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='map_snapshot'),
  'map_snapshot è security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='map_snapshot'),
  'map_snapshot ha search_path svuotato');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='map_attach_room'),
  'map_attach_room è security definer');

-- Le RPC sono eseguibili SOLO da authenticated (client), mai da anon.
select ok((select has_function_privilege('authenticated', 'public.map_snapshot()', 'EXECUTE')),
  'authenticated esegue map_snapshot');
select ok((select has_function_privilege('authenticated', 'public.map_attach_room(uuid)', 'EXECUTE')),
  'authenticated esegue map_attach_room');
select ok((select has_function_privilege('authenticated', 'public.map_detach_room(uuid)', 'EXECUTE')),
  'authenticated esegue map_detach_room');
select ok((select not has_function_privilege('anon', 'public.map_snapshot()', 'EXECUTE')),
  'anon non esegue map_snapshot (app invite-only)');

-- Trigger rooms→map_events: la via PRIMARIA di chiusura degli eventi (→ Echo).
select ok((select exists (select 1 from pg_trigger
             where tgrelid='public.rooms'::regclass and tgname='rooms_map_close_events_trg')),
  'trigger rooms_map_close_events_trg presente su rooms');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='rooms_map_close_events'),
  'rooms_map_close_events è security definer');
select ok((select not has_function_privilege('authenticated', 'public.rooms_map_close_events()', 'EXECUTE')),
  'authenticated non esegue rooms_map_close_events (funzione trigger)');

-- Guardie prosrc: la semantica che protegge i pilastri vive nel corpo delle RPC.
select ok((select prosrc like '%not_room_host%' and prosrc like '%room_not_live%'
             and prosrc like '%no_active_session%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_attach_room'),
  'map_attach_room: solo host + stanza live + sessione attiva');
select ok((select prosrc like '%room_live%' and prosrc like '%is_active_user%'
             and prosrc like '%no_location%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_attach_room'),
  'map_attach_room: enforcement + evento room_live con posizione host');
select ok((select prosrc like '%delete from public.map_events%' and prosrc like '%ended_at is null%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_detach_room'),
  'map_detach_room: DELETE dell''evento live (revoca, niente Echo)');
select ok((select prosrc like '%server_now%' and prosrc like '%friends%'
             and prosrc like '%events%' and prosrc like '%can_see_on_map%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_snapshot'),
  'map_snapshot: {server_now, friends, events} filtrati da can_see_on_map');
select ok((select prosrc like '%ended_at%' and prosrc like '%12 hours%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='rooms_map_close_events'),
  'rooms_map_close_events: chiude gli eventi con Echo a +12h');

-- =============================================================================
-- M7 · Mappa v2 (MM3) — realtime inbox privata + fan-out server-side
-- =============================================================================
-- docs/map/map.md §16 MM3. Gli amici ricevono i DELTA (presence / presence_removed
-- / event_started / event_ended) sull'inbox privata `map:u:{uid}` via
-- realtime.send() dentro RPC/trigger definer. Invarianti STRUTTURALI qui: la policy
-- di ricezione lega il topic all'utente (nessuno legge l'inbox altrui), il fan-out
-- passa da un helper interno non esposto, e i punti di emissione sono cablati nelle
-- funzioni. Le prove FUNZIONALI (righe scritte SOLO ai topic degli amici, mai
-- all'estraneo; autorizzazione della sottoscrizione) sono nello smoke via pooler.

-- Helper di fan-out: esiste, definer, search_path svuotato, NON eseguibile dal
-- client (solo funzioni definer interne lo chiamano).
select has_function('public', 'map_fanout', 'map_fanout esiste');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='map_fanout'),
  'map_fanout è security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='map_fanout'),
  'map_fanout ha search_path svuotato');
select ok((select not has_function_privilege('authenticated', 'public.map_fanout(uuid, text, jsonb)', 'EXECUTE')),
  'authenticated non esegue map_fanout (helper interno)');
select ok((select not has_function_privilege('anon', 'public.map_fanout(uuid, text, jsonb)', 'EXECUTE')),
  'anon non esegue map_fanout');

-- Policy di ricezione sull'inbox privata: ESATTAMENTE una policy su
-- realtime.messages (nessuna INSERT/ALL → il client non può inviare broadcast),
-- di tipo SELECT, per authenticated, che lega il topic all'utente (`map:u:`).
select is((select count(*)::int from pg_policies where schemaname='realtime' and tablename='messages'),
  1, 'realtime.messages ha una sola policy (ricezione inbox, nessun invio client)');
select ok((select exists (select 1 from pg_policies
             where schemaname='realtime' and tablename='messages'
               and policyname='map_inbox_select_own')),
  'policy map_inbox_select_own presente su realtime.messages');
select is((select cmd from pg_policies
             where schemaname='realtime' and tablename='messages' and policyname='map_inbox_select_own'),
  'SELECT', 'map_inbox_select_own è una policy di SELECT (sola ricezione)');
select ok((select roles::text like '%authenticated%' from pg_policies
             where schemaname='realtime' and tablename='messages' and policyname='map_inbox_select_own'),
  'map_inbox_select_own vale per authenticated');
select ok((select qual like '%map:u:%' from pg_policies
             where schemaname='realtime' and tablename='messages' and policyname='map_inbox_select_own'),
  'map_inbox_select_own lega il topic all''utente (map:u:{uid})');

-- Guardie prosrc: il fan-out è cablato nei punti giusti (map.md §13.3).
select ok((select prosrc like '%realtime.send%' and prosrc like '%friendships%'
             and prosrc like '%accepted%' and prosrc like '%map:u:%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_fanout'),
  'map_fanout: realtime.send agli amici accepted sul topic map:u:');
select ok((select prosrc like '%map_fanout%' and prosrc like '%st_distance%' and prosrc like '%presence%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_publish_location'),
  'map_publish_location: fan-out presence su movimento (st_distance)');
select ok((select prosrc like '%map_fanout%' and prosrc like '%presence_removed%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_stop_sharing'),
  'map_stop_sharing: fan-out presence_removed');
select ok((select prosrc like '%map_fanout%' and prosrc like '%event_started%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_attach_room'),
  'map_attach_room: fan-out event_started');
select ok((select prosrc like '%map_fanout%' and prosrc like '%event_ended%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='map_detach_room'),
  'map_detach_room: fan-out event_ended (removed)');
select ok((select prosrc like '%map_fanout%' and prosrc like '%event_ended%' and prosrc like '%12 hours%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='rooms_map_close_events'),
  'rooms_map_close_events: fan-out event_ended (Echo a +12h)');
select ok((select prosrc like '%map_fanout%' and prosrc like '%presence_removed%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='profiles_map_kill_switch'),
  'profiles_map_kill_switch: fan-out presence_removed');

-- =============================================================================
-- M7 · Mappa v2 (MM4) — GDPR + chiusura backend
-- =============================================================================
-- docs/map/map.md §16 MM4. Nessun oggetto DB nuovo: MM4 chiude il dominio mappa
-- sul lato privacy/GDPR. Invarianti STRUTTURALI qui:
--  · il consenso dedicato alla posizione esiste (consent_type='location', usato dal
--    client PRIMA della prima accensione dell'aura, map.md §3);
--  · il diritto all'oblio è coperto su ENTRAMBE le vie: soft-delete/anonimizzazione
--    immediata via process_account_deletion v6 (guardia prosrc in MM1) + hard-delete
--    a 30gg via cascade FK profiles→map_* (verificato qui).
-- La prova FUNZIONALE (export che contiene le sezioni mappa; delete che svuota ogni
-- riga mappa; estraneo escluso) è nello smoke MM4 via pooler. La Edge gdpr-export v4
-- (art. 15) vive fuori dal DB → non testabile in pgTAP: va in coda deploy owner.

-- Consenso posizione: il valore enum dedicato alla mappa esiste.
select ok((select exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'consent_type' and e.enumlabel = 'location')),
  'consent_type ha il valore location (consenso posizione mappa, map.md §3)');

-- Hard-delete (retention 30gg, purge_due_deletions): la cancellazione del profilo
-- deve cascadare su TUTTE le tabelle mappa dell'utente → nessuna posizione orfana.
select ok((select bool_or(confdeltype = 'c') from pg_constraint
    where conrelid = 'public.map_presence'::regclass and contype = 'f'
      and confrelid = 'public.profiles'::regclass),
  'map_presence.user_id → profiles ON DELETE CASCADE (hard-delete GDPR)');
select ok((select bool_or(confdeltype = 'c') from pg_constraint
    where conrelid = 'public.map_events'::regclass and contype = 'f'
      and confrelid = 'public.profiles'::regclass),
  'map_events.user_id → profiles ON DELETE CASCADE (hard-delete GDPR)');
select ok((select bool_or(confdeltype = 'c') from pg_constraint
    where conrelid = 'public.map_safe_zones'::regclass and contype = 'f'
      and confrelid = 'public.profiles'::regclass),
  'map_safe_zones.user_id → profiles ON DELETE CASCADE (hard-delete GDPR)');

-- =============================================================================
-- M12 · Live (LM0) — enum + fondamenta dominio
-- =============================================================================
-- docs/live/live.md §18 LM0. Il broadcast video personale SOLO amici (L-1),
-- dominio parallelo a rooms (L-2). Invarianti STRUTTURALI qui: schema, RLS,
-- grant contract (contatori privati a livello dati), macchina a stati e
-- guardie nei trigger/RPC (guardie prosrc). Le prove FUNZIONALI (host crea →
-- amico vede e l'estraneo no, transizioni illegali, tetto 4, kick, rate-limit)
-- sono nello smoke via pooler.

-- Valori enum aggiunti (migrazione live_enums).
select ok((select exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'moderation_target' and e.enumlabel = 'live')),
  'moderation_target ha il valore live (report sulla live)');
select ok((select exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'moderation_target' and e.enumlabel = 'live_comment')),
  'moderation_target ha il valore live_comment (report sul commento)');
select ok((select exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'notification_type' and e.enumlabel = 'live_started')),
  'notification_type ha il valore live_started (avvio, default tutti gli amici L-4)');
select ok((select exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'notification_type' and e.enumlabel = 'live_cohost_invite')),
  'notification_type ha il valore live_cohost_invite (invito co-host)');
select ok((select exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'map_event_type' and e.enumlabel = 'live_broadcast')),
  'map_event_type ha il valore live_broadcast (badge LIVE sulla mappa, LM1)');

-- Tipi nuovi del dominio con i valori esatti.
select is((select array_agg(e.enumlabel::text order by e.enumsortorder)
    from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'live_status'),
  array['live','paused','ended'],
  'live_status = live|paused|ended (stati espliciti a DB, mai inferenza client)');
select is((select array_agg(e.enumlabel::text order by e.enumsortorder)
    from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'live_visibility'),
  array['all_friends','top_friends'],
  'live_visibility = all_friends|top_friends');
select is((select array_agg(e.enumlabel::text order by e.enumsortorder)
    from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'live_notify_mode'),
  array['none','top_friends','all'],
  'live_notify_mode = none|top_friends|all (default all, decisione PO L-4)');

-- Tabelle del dominio.
select has_table('public', 'lives',         'lives esiste');
select has_table('public', 'live_hosts',    'live_hosts esiste');
select has_table('public', 'live_viewers',  'live_viewers esiste');
select has_table('public', 'live_comments', 'live_comments esiste');

-- RLS attiva su tutte.
select ok((select relrowsecurity from pg_class where oid = 'public.lives'::regclass),
  'RLS attiva su lives');
select ok((select relrowsecurity from pg_class where oid = 'public.live_hosts'::regclass),
  'RLS attiva su live_hosts');
select ok((select relrowsecurity from pg_class where oid = 'public.live_viewers'::regclass),
  'RLS attiva su live_viewers');
select ok((select relrowsecurity from pg_class where oid = 'public.live_comments'::regclass),
  'RLS attiva su live_comments');

-- Colonne chiave: clip_consent riservato (Momenti Salienti, Fase 2) e stanza
-- LiveKit dedicata univoca.
select has_column('public', 'lives', 'clip_consent',
  'lives.clip_consent esiste (riservato Fase 2, sempre false in v1)');
select ok((select exists (select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'lives'
      and indexdef ilike '%unique%' and indexdef ilike '%livekit_room_name%')),
  'lives.livekit_room_name è univoco (una stanza LiveKit per live)');

-- UNA sola live attiva per host: unique parziale su (host_id) where ended_at is null.
select ok((select exists (select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'lives'
      and indexname = 'lives_host_active_uidx'
      and indexdef ilike '%(host_id)%' and indexdef ilike '%ended_at is null%')),
  'unique parziale host attivo: una sola live non-ended per host');

-- Hard-delete GDPR: cascade su profiles per ogni tabella; le righe del corredo
-- muoiono con la live.
select ok((select bool_or(confdeltype = 'c') from pg_constraint
    where conrelid = 'public.lives'::regclass and contype = 'f'
      and confrelid = 'public.profiles'::regclass),
  'lives.host_id → profiles ON DELETE CASCADE (hard-delete GDPR)');
select ok((select bool_or(confdeltype = 'c') from pg_constraint
    where conrelid = 'public.live_hosts'::regclass and contype = 'f'
      and confrelid = 'public.profiles'::regclass),
  'live_hosts.user_id → profiles ON DELETE CASCADE');
select ok((select bool_or(confdeltype = 'c') from pg_constraint
    where conrelid = 'public.live_viewers'::regclass and contype = 'f'
      and confrelid = 'public.profiles'::regclass),
  'live_viewers.user_id → profiles ON DELETE CASCADE');
select ok((select bool_or(confdeltype = 'c') from pg_constraint
    where conrelid = 'public.live_comments'::regclass and contype = 'f'
      and confrelid = 'public.profiles'::regclass),
  'live_comments.author_id → profiles ON DELETE CASCADE');
select ok((select bool_or(confdeltype = 'c') from pg_constraint
    where conrelid = 'public.live_hosts'::regclass and contype = 'f'
      and confrelid = 'public.lives'::regclass),
  'live_hosts.live_id → lives ON DELETE CASCADE (le righe muoiono con la live)');

-- can_see_live: l'UNICO predicato di visibilità (RLS, RPC, token, fan-out).
select has_function('public', 'can_see_live', array['uuid','uuid'],
  'can_see_live(uuid,uuid) esiste');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_see_live'),
  'can_see_live è security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_see_live'),
  'can_see_live ha search_path svuotato');
select ok((select has_function_privilege('authenticated', 'public.can_see_live(uuid, uuid)', 'EXECUTE')),
  'authenticated esegue can_see_live (le policy RLS la valutano come chiamante)');
select ok((select not has_function_privilege('anon', 'public.can_see_live(uuid, uuid)', 'EXECUTE')),
  'anon non esegue can_see_live');
select ok((select prosrc like '%kicked_at%' and prosrc like '%removed%'
             and prosrc like '%is_blocked_pair%' and prosrc like '%are_friends%'
             and prosrc like '%top_friends%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_see_live'),
  'can_see_live: nega kickati/rimossi/bloccati e applica top_friends al solo host principale');

-- Macchina a stati: lives_before_write è l'unico arbitro delle transizioni.
select ok((select exists (select 1 from pg_trigger
    where tgrelid = 'public.lives'::regclass and tgname = 'lives_before_write_trg')),
  'trigger lives_before_write_trg presente su lives');
select ok((select prosrc like '%live_already_ended%' and prosrc like '%invalid_transition%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lives_before_write'),
  'lives_before_write: ended immutabile + transizioni illegali rifiutate');
select ok((select prosrc like '%gen_random_uuid%' and strpos(prosrc, '''live_''') > 0
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lives_before_write'),
  'lives_before_write: livekit_room_name generato server-side, mai dal client');
select ok((select not has_function_privilege('authenticated', 'public.lives_before_write()', 'EXECUTE')),
  'authenticated non esegue lives_before_write (funzione trigger)');

-- Tetto 4 host (invited+active) per live.
select ok((select exists (select 1 from pg_trigger
    where tgrelid = 'public.live_hosts'::regclass and tgname = 'live_hosts_cap_trg')),
  'trigger live_hosts_cap_trg presente su live_hosts');
select ok((select prosrc like '%cohost_cap_reached%' and prosrc like '%invited%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'live_hosts_cap'),
  'live_hosts_cap: tetto 4 su invited+active');

-- Sync contatori spettatori (privati: mai nel grant select del client).
select ok((select exists (select 1 from pg_trigger
    where tgrelid = 'public.live_viewers'::regclass and tgname = 'live_viewers_count_trg')),
  'trigger live_viewers_count_trg presente su live_viewers');
select ok((select prosrc like '%peak_viewers%' and prosrc like '%greatest%'
             and prosrc like '%kicked_at is null%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_live_viewer_count'),
  'sync_live_viewer_count: conta gli spettatori ATTIVI e aggiorna il picco');

-- Guardie commenti: stato live + toggle + visibilità + rate-limit 5/30s.
select ok((select exists (select 1 from pg_trigger
    where tgrelid = 'public.live_comments'::regclass and tgname = 'live_comments_before_insert_trg')),
  'trigger live_comments_before_insert_trg presente su live_comments');
select ok((select prosrc like '%live_not_commentable%' and prosrc like '%comments_disabled%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'live_comments_before_insert'),
  'live_comments_before_insert: rifiuta live non in diretta e commenti disabilitati');
select ok((select prosrc like '%rate_limited%' and prosrc like '%30 seconds%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'live_comments_before_insert'),
  'live_comments_before_insert: rate-limit 5 commenti / 30 secondi per live');
select ok((select prosrc like '%can_see_live%' and prosrc like '%is_active_user%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'live_comments_before_insert'),
  'live_comments_before_insert: visibilità + enforcement sanzioni');

-- Le 8 RPC di scrittura esistono.
select has_function('public', 'create_live',        'create_live esiste');
select has_function('public', 'pause_live',         'pause_live esiste');
select has_function('public', 'resume_live',        'resume_live esiste');
select has_function('public', 'end_live',           'end_live esiste');
select has_function('public', 'live_invite_cohost', 'live_invite_cohost esiste');
select has_function('public', 'live_accept_cohost', 'live_accept_cohost esiste');
select has_function('public', 'live_remove_cohost', 'live_remove_cohost esiste');
select has_function('public', 'live_leave',         'live_leave esiste');

-- Grant contract: eseguibili da authenticated, mai da anon.
select ok((select has_function_privilege('authenticated',
    'public.create_live(text, public.live_visibility, boolean, boolean, public.live_notify_mode)', 'EXECUTE')),
  'authenticated esegue create_live');
select ok((select has_function_privilege('authenticated', 'public.pause_live(uuid)', 'EXECUTE')),
  'authenticated esegue pause_live');
select ok((select has_function_privilege('authenticated', 'public.resume_live(uuid)', 'EXECUTE')),
  'authenticated esegue resume_live');
select ok((select has_function_privilege('authenticated', 'public.end_live(uuid)', 'EXECUTE')),
  'authenticated esegue end_live');
select ok((select has_function_privilege('authenticated', 'public.live_invite_cohost(uuid, uuid)', 'EXECUTE')),
  'authenticated esegue live_invite_cohost');
select ok((select has_function_privilege('authenticated', 'public.live_accept_cohost(uuid)', 'EXECUTE')),
  'authenticated esegue live_accept_cohost');
select ok((select has_function_privilege('authenticated', 'public.live_remove_cohost(uuid, uuid)', 'EXECUTE')),
  'authenticated esegue live_remove_cohost');
select ok((select has_function_privilege('authenticated', 'public.live_leave(uuid)', 'EXECUTE')),
  'authenticated esegue live_leave');
select ok((select not has_function_privilege('anon',
    'public.create_live(text, public.live_visibility, boolean, boolean, public.live_notify_mode)', 'EXECUTE')),
  'anon non esegue create_live (app invite-only)');

-- Nessuna scrittura client diretta su lives (solo RPC definer).
select ok((select not has_table_privilege('authenticated', 'public.lives', 'INSERT')),
  'authenticated non inserisce su lives');
select ok((select not has_table_privilege('authenticated', 'public.lives', 'UPDATE')),
  'authenticated non aggiorna lives');
select ok((select not has_table_privilege('authenticated', 'public.lives', 'DELETE')),
  'authenticated non cancella lives');

-- Contatori PRIVATI a livello dati (pattern drops R-04): il select per-colonna
-- esclude viewer_count/peak_viewers; il resto della riga è leggibile.
select ok((select not has_column_privilege('authenticated', 'public.lives', 'viewer_count', 'SELECT')),
  'viewer_count NON leggibile dal client (anti-vanity a livello dati)');
select ok((select not has_column_privilege('authenticated', 'public.lives', 'peak_viewers', 'SELECT')),
  'peak_viewers NON leggibile dal client');
select ok((select has_column_privilege('authenticated', 'public.lives', 'title', 'SELECT')),
  'title leggibile dal client (controllo positivo del grant per-colonna)');

-- live_hosts / live_viewers: sola lettura, mutazioni solo RPC/definer.
select ok((select not has_table_privilege('authenticated', 'public.live_hosts', 'INSERT')
             and not has_table_privilege('authenticated', 'public.live_hosts', 'UPDATE')
             and not has_table_privilege('authenticated', 'public.live_hosts', 'DELETE')),
  'live_hosts: nessuna scrittura client');
select ok((select not has_table_privilege('authenticated', 'public.live_viewers', 'INSERT')
             and not has_table_privilege('authenticated', 'public.live_viewers', 'UPDATE')
             and not has_table_privilege('authenticated', 'public.live_viewers', 'DELETE')),
  'live_viewers: nessuna scrittura client');

-- live_comments: insert diretta SOLO su (live_id, body); autore forzato dal trigger.
select ok((select has_column_privilege('authenticated', 'public.live_comments', 'body', 'INSERT')),
  'live_comments: insert su body consentita');
select ok((select not has_column_privilege('authenticated', 'public.live_comments', 'author_id', 'INSERT')),
  'live_comments: author_id fuori dal grant insert (forzato dal trigger)');

-- Policy: lives ha SOLO la select via can_see_live; commenti col pattern drop_comments.
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'lives'),
  1, 'lives ha una sola policy (select visibile, zero scrittura client)');
select ok((select exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lives'
      and policyname = 'lives_select_visible' and cmd = 'SELECT'
      and qual like '%can_see_live%')),
  'lives_select_visible: SELECT via can_see_live');
select ok((select exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'live_comments'
      and policyname = 'live_comments_insert_own')),
  'live_comments_insert_own presente');
select ok((select exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'live_hosts'
        and policyname = 'live_hosts_select_own_or_host')
    and exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'live_viewers'
        and policyname = 'live_viewers_select_own_or_host')),
  'live_hosts/live_viewers: select limitata a sé stessi o all''host della live');

-- Realtime: i commenti live sono in pubblicazione (postgres_changes + RLS).
select ok((select exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_comments')),
  'live_comments in pubblicazione supabase_realtime');

-- moderation_target_user v3: rami live (→ host) e live_comment (→ autore).
select ok((select prosrc like '%public.lives%' and prosrc like '%public.live_comments%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'moderation_target_user'),
  'moderation_target_user v3: mappa live e live_comment ai responsabili');

-- anon a zero sull''intero dominio.
select ok((select not has_any_column_privilege('anon', 'public.lives', 'SELECT')
             and not has_any_column_privilege('anon', 'public.live_comments', 'SELECT')),
  'anon non legge nulla del dominio live');

-- =============================================================================
-- M12 · Live (LM1) — la Live sulla Mappa della Città (badge LIVE)
-- =============================================================================
-- docs/live/live.md §18 LM1. Riuso integrale di map_events (M7): colonna
-- live_id + RPC map_attach_live/map_detach_live (specchio delle versioni room)
-- + trigger di chiusura con Echo a +3h (vs 12h stanze). Invarianti STRUTTURALI
-- qui; le prove FUNZIONALI (attach visibile all'amico e non all'estraneo,
-- end → Echo 3h, pause → badge resta, detach/stop_sharing → sparizione) sono
-- nello smoke via pooler.

-- Colonna di collegamento: FK a lives con SET NULL (l'Echo sopravvive alla
-- purge della riga live, LM3).
select has_column('public', 'map_events', 'live_id',
  'map_events.live_id esiste (badge LIVE sulla mappa)');
select ok((select bool_or(confdeltype = 'n') from pg_constraint
    where conrelid = 'public.map_events'::regclass and contype = 'f'
      and confrelid = 'public.lives'::regclass),
  'map_events.live_id → lives ON DELETE SET NULL (Echo coerente dopo la purge)');

-- UNA sola bolla live per broadcast + una riga referenzia UN solo dominio.
select ok((select exists (select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'map_events'
      and indexname = 'map_events_live_broadcast_uidx'
      and indexdef ilike '%unique%' and indexdef ilike '%(live_id)%'
      and indexdef ilike '%ended_at is null%')),
  'unique parziale (live_id) where ended_at is null: una bolla live per broadcast');
select ok((select exists (select 1 from pg_constraint
    where conrelid = 'public.map_events'::regclass
      and conname = 'map_events_single_source_chk' and contype = 'c')),
  'check map_events_single_source_chk: room_id e live_id mai insieme');

-- Le 2 RPC esistono, definer, search_path svuotato.
select has_function('public', 'map_attach_live', 'map_attach_live esiste');
select has_function('public', 'map_detach_live', 'map_detach_live esiste');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'map_attach_live'),
  'map_attach_live è security definer');
select ok((select proconfig::text like '%search_path=%' from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'map_attach_live'),
  'map_attach_live ha search_path svuotato');
select ok((select prosecdef and proconfig::text like '%search_path=%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'map_detach_live'),
  'map_detach_live è security definer con search_path svuotato');

-- Grant contract: authenticated sì, anon no.
select ok((select has_function_privilege('authenticated', 'public.map_attach_live(uuid)', 'EXECUTE')),
  'authenticated esegue map_attach_live');
select ok((select has_function_privilege('authenticated', 'public.map_detach_live(uuid)', 'EXECUTE')),
  'authenticated esegue map_detach_live');
select ok((select not has_function_privilege('anon', 'public.map_attach_live(uuid)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.map_detach_live(uuid)', 'EXECUTE')),
  'anon non esegue attach/detach live (app invite-only)');

-- Guardie prosrc: la semantica che protegge i pilastri vive nel corpo delle RPC.
select ok((select prosrc like '%not_live_host%' and prosrc like '%live_not_active%'
             and prosrc like '%no_active_session%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'map_attach_live'),
  'map_attach_live: solo host principale + live in diretta + sessione mappa attiva');
select ok((select prosrc like '%live_already_ended%' and prosrc like '%is_active_user%'
             and prosrc like '%no_location%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'map_attach_live'),
  'map_attach_live: enforcement sanzioni + posizione pubblicata richiesta');
select ok((select prosrc like '%live_broadcast%' and prosrc like '%map_fanout%'
             and prosrc like '%event_started%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'map_attach_live'),
  'map_attach_live: evento live_broadcast + fan-out event_started agli amici');
select ok((select prosrc like '%delete from public.map_events%' and prosrc like '%ended_at is null%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'map_detach_live'),
  'map_detach_live: DELETE dell''evento aperto (revoca, niente Echo)');
select ok((select prosrc like '%map_fanout%' and prosrc like '%event_ended%'
             and prosrc like '%removed%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'map_detach_live'),
  'map_detach_live: fan-out event_ended (removed)');

-- Trigger di chiusura: via PRIMARIA, SOLO al passaggio a ended (in paused il
-- badge resta pieno); Echo a +3 ore (vs 12h stanze).
select ok((select exists (select 1 from pg_trigger
    where tgrelid = 'public.lives'::regclass and tgname = 'lives_map_close_events_trg')),
  'trigger lives_map_close_events_trg presente su lives');
select ok((select pg_get_triggerdef(oid) ilike '%after update of status%'
             and pg_get_triggerdef(oid) ilike '%''ended''%'
    from pg_trigger
    where tgrelid = 'public.lives'::regclass and tgname = 'lives_map_close_events_trg'),
  'lives_map_close_events_trg scatta solo verso ended (pause non chiude il badge)');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lives_map_close_events'),
  'lives_map_close_events è security definer');
select ok((select not has_function_privilege('authenticated', 'public.lives_map_close_events()', 'EXECUTE')),
  'authenticated non esegue lives_map_close_events (funzione trigger)');
select ok((select prosrc like '%3 hours%' and prosrc like '%map_fanout%'
             and prosrc like '%event_ended%' and prosrc like '%removed%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lives_map_close_events'),
  'lives_map_close_events: Echo a +3h + fan-out event_ended (removed=false)');

-- map_snapshot v2: espone live_id negli events (il client naviga a /live/[id]).
select ok((select prosrc like '%live_id%' from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'map_snapshot'),
  'map_snapshot v2: events con live_id (porta di lettura unica, forma invariata)');

-- =============================================================================
-- M12 · Live (LM2) — feed, fan-out realtime, notifiche, premio Aura
-- =============================================================================
-- docs/live/live.md §18 LM2. Invarianti STRUTTURALI qui (esistenza, ACL,
-- guardie prosrc); le prove FUNZIONALI (notify_mode all/top/none, dedup 10 min,
-- inbox realtime, delta Aura 1.0 → 0.5, ordinamento feed, anti-vanity nel
-- payload di live_detail) sono nello smoke via pooler.

-- live_fanout: l'UNICO punto di fan-out del dominio (inbox privata M7 riusata).
select has_function('public', 'live_fanout', array['uuid','text','jsonb'],
  'live_fanout(uuid,text,jsonb) esiste');
select ok((select prosecdef and proconfig::text like '%search_path=%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'live_fanout'),
  'live_fanout è security definer con search_path svuotato');
select ok((select not has_function_privilege('authenticated', 'public.live_fanout(uuid, text, jsonb)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.live_fanout(uuid, text, jsonb)', 'EXECUTE')),
  'live_fanout è interno: né authenticated né anon lo eseguono');
select ok((select prosrc like '%realtime.send%' and prosrc like '%map:u:%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'live_fanout'),
  'live_fanout: broadcast best-effort sull''inbox privata per-utente');
select ok((select prosrc like '%can_see_live%' and prosrc like '%friendships%'
             and prosrc like '%distinct%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'live_fanout'),
  'live_fanout: unione amici host attivi con dedup, filtrata dall''unico predicato');

-- create_live v2: notifiche set-based + fan-out + attach mappa best-effort.
select ok((select prosrc like '%live_started%' and prosrc like '%public.notifications%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_live'),
  'create_live v2: notifica live_started set-based all''avvio (L-4)');
select ok((select prosrc like '%10 minutes%' and prosrc like '%read_at%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_live'),
  'create_live v2: guardia anti-spam 10 minuti per host (dedup non lette)');
select ok((select prosrc like '%notify_mode%' and prosrc like '%top_friends%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_live'),
  'create_live v2: destinatari secondo notify_mode (all / top_friends / none)');
select ok((select prosrc like '%can_see_live%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_live'),
  'create_live v2: mai notificare chi non può vedere la live (perimetro unico)');
select ok((select prosrc like '%map_attach_live%' and prosrc like '%map_attached%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_live'),
  'create_live v2: attach mappa best-effort (senza sessione/posizione NON fallisce)');
select ok((select prosrc like '%live_fanout%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_live'),
  'create_live v2: fan-out live_started sull''inbox degli amici');
select ok((select prosrc like '%live_already_active%' and prosrc like '%is_active_user%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_live'),
  'create_live v2: guardie LM0 conservate (verbatim+add, nessuna regressione)');
select ok((select has_function_privilege('authenticated',
      'public.create_live(text, public.live_visibility, boolean, boolean, public.live_notify_mode)', 'EXECUTE')
    and not has_function_privilege('anon',
      'public.create_live(text, public.live_visibility, boolean, boolean, public.live_notify_mode)', 'EXECUTE')),
  'create_live v2: ACL preservato dalla ridefinizione (authenticated sì, anon no)');

-- pause/resume/end v2: delta realtime, mai nuove notifiche.
select ok((select prosrc like '%live_fanout%' and prosrc like '%live_status%'
             and strpos(prosrc, '''paused''') > 0
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'pause_live'),
  'pause_live v2: fan-out live_status (pausa = delta, non notifica)');
select ok((select prosrc like '%live_fanout%' and prosrc like '%live_status%'
             and prosrc like '%invalid_transition%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'resume_live'),
  'resume_live v2: fan-out live_status + transizioni LM0 conservate');
select ok((select prosrc like '%live_fanout%' and prosrc like '%live_ended%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'end_live'),
  'end_live v2: fan-out live_ended (la live sparisce da striscia e feed)');
select ok((select prosrc like '%not_live_host%' and prosrc like '%live_already_ended%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'end_live'),
  'end_live v2: guardie LM0 conservate (solo host, stato finale)');

-- live_invite_cohost v2: notifica al singolo invitato.
select ok((select prosrc like '%enqueue_notification%' and prosrc like '%live_cohost_invite%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'live_invite_cohost'),
  'live_invite_cohost v2: notifica live_cohost_invite al solo invitato');
select ok((select prosrc like '%cohost_cap_reached%' and prosrc like '%cohost_removed%'
             and prosrc like '%not_friends%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'live_invite_cohost'),
  'live_invite_cohost v2: guardie LM0 conservate (tetto, rimossi, solo amici)');

-- Premio Aura: trigger su ended, live qualificata, rendimenti decrescenti.
select ok((select exists (select 1 from pg_trigger
    where tgrelid = 'public.lives'::regclass and tgname = 'lives_award_participation_trg')),
  'trigger lives_award_participation_trg presente su lives');
select ok((select pg_get_triggerdef(oid) ilike '%after update of status%'
             and pg_get_triggerdef(oid) ilike '%''ended''%'
    from pg_trigger
    where tgrelid = 'public.lives'::regclass and tgname = 'lives_award_participation_trg'),
  'lives_award_participation_trg scatta solo al passaggio a ended (via unica)');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'lives_award_participation')
    and not has_function_privilege('authenticated', 'public.lives_award_participation()', 'EXECUTE'),
  'lives_award_participation: definer, non eseguibile dal client (funzione trigger)');
select ok((select prosrc like '%5 minutes%' and prosrc like '%live_viewers%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lives_award_participation'),
  'lives_award_participation: qualificata = durata ≥5 min E ≥1 spettatore reale (QA-4)');
select ok((select prosrc like '%emit_aura%' and prosrc like '%participation%'
             and prosrc like '%round%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lives_award_participation'),
  'lives_award_participation: premio 1/n a rendimenti decrescenti (formula drops)');

-- lives_feed: la porta di lettura della Home.
select has_function('public', 'lives_feed', 'lives_feed esiste');
select ok((select prosecdef and proconfig::text like '%search_path=%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lives_feed'),
  'lives_feed è security definer con search_path svuotato');
select ok((select has_function_privilege('authenticated', 'public.lives_feed()', 'EXECUTE')
             and not has_function_privilege('anon', 'public.lives_feed()', 'EXECUTE')),
  'lives_feed: authenticated sì, anon no');
select ok((select prosrc like '%can_see_live%' and prosrc like '%ended_at is null%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lives_feed'),
  'lives_feed: solo live attive visibili al chiamante (unico predicato)');
select ok((select prosrc like '%top_friends%' and prosrc like '%viewer_count%'
             and prosrc like '%aura_score%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lives_feed'),
  'lives_feed: ordinamento server-side (Top Friends → spettatori reali → Aura)');
select ok((select prosrc like '%server_now%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lives_feed'),
  'lives_feed: server_now per il clock calibrato del client (M7 §8)');

-- live_detail: dettaglio + revalidation, contatori solo all'host.
select has_function('public', 'live_detail', array['uuid'], 'live_detail(uuid) esiste');
select ok((select prosecdef and proconfig::text like '%search_path=%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'live_detail'),
  'live_detail è security definer con search_path svuotato');
select ok((select has_function_privilege('authenticated', 'public.live_detail(uuid)', 'EXECUTE')
             and not has_function_privilege('anon', 'public.live_detail(uuid)', 'EXECUTE')),
  'live_detail: authenticated sì, anon no');
select ok((select prosrc like '%not_visible%' and prosrc like '%can_see_live%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'live_detail'),
  'live_detail: not_visible se il predicato nega (il client si disconnette, §5)');
select ok((select prosrc like '%is_host%' and prosrc like '%viewer_count%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'live_detail'),
  'live_detail: contatori spettatori SOLO all''host principale (anti-vanity R-04)');
select ok((select prosrc like '%is_cohost%' and prosrc like '%can_comment%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'live_detail'),
  'live_detail: flag del chiamante (is_host/is_cohost/can_comment)');

-- =============================================================================
-- M12 · Live (LM3) — ciclo di vita v7 (reti di sicurezza cron + GDPR)
-- =============================================================================
-- docs/live/live.md §18 LM3. expire_content v7 e process_account_deletion v7
-- ridefinite nella STESSA migrazione (vincolo di transazionalità MM1): nessuna
-- live orfana possibile, diritto all'oblio su tutto il dominio. Invarianti
-- prosrc qui; le prove FUNZIONALI (pausa 31 min → force-end, host sanzionato →
-- force-end, purge 24h/30gg, cintura mappa, delete account con live attiva)
-- sono nello smoke via pooler.

-- expire_content v7: le tre reti di sicurezza del force-end (§12.1/§12.2/§12.10).
select ok((select prosrc like '%8 hours%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'expire_content'),
  'expire_content v7: cap durata 8h (QA-1, host crashato senza webhook)');
select ok((select prosrc like '%30 minutes%' and prosrc like '%paused%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'expire_content'),
  'expire_content v7: auto-end della pausa dimenticata a 30 min (QA-2)');
select ok((select prosrc like '%is_active_user%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'expire_content'),
  'expire_content v7: force-end delle live con host sanzionato (mute/ban, ≤5 min)');

-- expire_content v7: effimerità del dominio (nessun archivio, §0.2).
select ok((select prosrc like '%live_comments%' and prosrc like '%live_viewers%'
             and prosrc like '%24 hours%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'expire_content'),
  'expire_content v7: purge commenti/spettatori a 24h dalla fine (finestra moderazione)');
select ok((select prosrc like '%delete from public.lives%' and prosrc like '%30 days%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'expire_content'),
  'expire_content v7: minimizzazione righe lives a 30 giorni');
select ok((select prosrc like '%live_broadcast%' and prosrc like '%3 hours%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'expire_content'),
  'expire_content v7: cintura difensiva mappa (evento live aperto → Echo 3h)');

-- expire_content v7: verbatim+add — il corpo v6 è conservato per intero.
select ok((select prosrc like '%stats_finali%' and prosrc like '%map_presence%'
             and prosrc like '%delete from public.conversations%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'expire_content'),
  'expire_content v7: corpo v6 conservato (drops, mappa, gruppi orfani — nessuna regressione)');

-- process_account_deletion v7: art. 17 sul dominio live.
select ok((select prosrc like '%update public.lives%' and prosrc like '%host_id = p_user%'
             and prosrc like '%delete from public.lives%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'process_account_deletion'),
  'process_account_deletion v7: end + DELETE delle live proprie (macchina a stati rispettata)');
select ok((select prosrc like '%live_comments%' and prosrc like '%live_viewers%'
             and prosrc like '%live_hosts%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'process_account_deletion'),
  'process_account_deletion v7: tracce su live altrui rimosse (commenti/spettatore/co-host)');
select ok((select prosrc like '%map_safe_zones%' and prosrc like '%contact_hashes%'
             and prosrc like '%drop_saves%' and prosrc like '%log_audit%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'process_account_deletion'),
  'process_account_deletion v7: corpo v6 conservato (mappa, chat, drops, audit)');

select * from finish();
rollback;
