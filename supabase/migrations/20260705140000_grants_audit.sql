-- =============================================================================
-- Televo — Audit grant vs DEFAULT PRIVILEGES (CM8) — difesa in profondità
-- =============================================================================
-- Scoperta CM4 e confermata in CM8: il progetto hosted ha DEFAULT PRIVILEGES
-- (di postgres E di supabase_admin) che concedono ALL (arwdDxtm) ad anon e
-- authenticated su OGNI nuova tabella di public. Quindi i grant espliciti delle
-- migrazioni erano cosmetici: la RLS è stata finora l'unico cancello reale.
-- Qui si rende il grant DAVVERO minimo su ogni tabella: prima `revoke all`,
-- poi si riconcede SOLO quanto dichiarato storicamente nelle migrazioni. `anon`
-- resta senza alcun privilegio (l'app è invite-only, nessuna lettura
-- pre-sessione: onboarding e tutto il resto sono post-auth).
--
-- Le viste (leaderboard_*, vibe_map) non sono toccate: i default privileges
-- delle TABELLE non le riguardano e restano select-only via i loro grant.
--
-- ALTER DEFAULT PRIVILEGES: si revoca il default per il ruolo `postgres` (con
-- cui girano le migrazioni) → le tabelle FUTURE non erediteranno più ALL. Il
-- defacl di `supabase_admin` non è alterabile da qui: resta valida la regola di
-- progetto "ogni nuova tabella dichiara revoke+grant espliciti" (convenzione da
-- CM4, ora vincolante nel piano).

-- -----------------------------------------------------------------------------
-- 0. Default privileges futuri (per il ruolo delle migrazioni).
-- -----------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. anon: nessun privilegio su nessuna tabella (nessuna lettura pre-sessione).
--    Un solo colpo su tutte le tabelle esistenti.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;

-- -----------------------------------------------------------------------------
-- 2. authenticated: revoke all + re-grant minimo, tabella per tabella.
--    Solo lettura dove non dichiarato altro; scritture di sistema via RPC.
-- -----------------------------------------------------------------------------

-- Identità / core
revoke all on public.schools          from authenticated;
grant  select on public.schools       to authenticated;

revoke all on public.profiles from authenticated;
grant  select (id, username, display_name, age_verified, avatar_url,
               audio_bio_url, status_text, customization, interests, school_id,
               aura_score, aura_color, share_location, created_at, updated_at,
               deleted_at, muted_until, banned_at, show_last_seen,
               show_read_receipts) on public.profiles to authenticated;
grant  update (username, display_name, avatar_url, audio_bio_url, status_text,
               customization, interests, share_location, expo_push_token,
               show_last_seen, show_read_receipts) on public.profiles to authenticated;

revoke all on public.profiles_private    from authenticated;
grant  select on public.profiles_private to authenticated;  -- RLS: owner

revoke all on public.invites from authenticated;  -- solo via RPC check_invite (definer)

-- Aura
revoke all on public.aura_events       from authenticated;
grant  select on public.aura_events    to authenticated;  -- RLS: owner
revoke all on public.aura_snapshots    from authenticated;
grant  select on public.aura_snapshots to authenticated;

-- Stanze live
revoke all on public.rooms       from authenticated;
grant  select on public.rooms    to authenticated;
grant  insert on public.rooms    to authenticated;  -- sanitizzato da trigger + RLS
grant  update (title, topic, mood, visibility, format, duration_minutes,
               max_participants, status) on public.rooms to authenticated;
grant  delete on public.rooms    to authenticated;

revoke all on public.room_participants          from authenticated;
grant  select on public.room_participants       to authenticated;
grant  insert (room_id) on public.room_participants to authenticated;
grant  update (role, is_on_stage, left_at) on public.room_participants to authenticated;
grant  delete on public.room_participants       to authenticated;

revoke all on public.vibechain_queue                 from authenticated;
grant  select, insert, delete on public.vibechain_queue to authenticated;

-- Social
revoke all on public.friendships    from authenticated;
grant  select on public.friendships to authenticated;  -- mutazioni via RPC
revoke all on public.top_friends    from authenticated;
grant  select, insert, delete on public.top_friends to authenticated;
grant  update (friend_id, position) on public.top_friends to authenticated;

-- Conversazioni / messaggi (spunte: colonne come in 20260705120000)
revoke all on public.conversations    from authenticated;
grant  select on public.conversations to authenticated;  -- mutazioni via RPC
revoke all on public.conversation_members from authenticated;
grant  select (conversation_id, user_id, role, joined_at, muted_until,
               archived_at, pinned_at, cleared_at, hidden_at)
  on public.conversation_members to authenticated;
revoke all on public.messages    from authenticated;
grant  select on public.messages to authenticated;
grant  insert (conversation_id, type, body, audio_url, media_url, media_type,
               reply_to, expires_at, forwarded_from) on public.messages to authenticated;
grant  update (body, deleted_at) on public.messages to authenticated;
revoke all on public.message_reactions from authenticated;
grant  select on public.message_reactions to authenticated;
grant  insert (message_id, emoji) on public.message_reactions to authenticated;
grant  delete on public.message_reactions to authenticated;
revoke all on public.saved_messages    from authenticated;
grant  select on public.saved_messages to authenticated;  -- via RPC save/unsave
revoke all on public.contact_hashes    from authenticated;  -- solo via RPC (RLS senza policy)

-- Streak / uso
revoke all on public.streaks        from authenticated;
grant  select on public.streaks     to authenticated;
revoke all on public.usage_daily    from authenticated;
grant  select on public.usage_daily to authenticated;

-- Props / drops
revoke all on public.props    from authenticated;
grant  select on public.props to authenticated;
grant  insert (recipient, trait, source_type, source_id) on public.props to authenticated;
revoke all on public.drops    from authenticated;
grant  select on public.drops to authenticated;
grant  insert (type, body, audio_url, media_url, audience) on public.drops to authenticated;
grant  delete on public.drops to authenticated;
revoke all on public.drop_reactions                 from authenticated;
grant  select, insert, delete on public.drop_reactions to authenticated;

-- Mappa (mutazioni via RPC)
revoke all on public.live_presence     from authenticated;
grant  select on public.live_presence  to authenticated;  -- RLS: amici
revoke all on public.room_locations    from authenticated;
grant  select on public.room_locations to authenticated;

-- Notifiche / achievement (mutazioni via RPC, tranne i toggle dichiarati)
revoke all on public.devices        from authenticated;
grant  select on public.devices     to authenticated;  -- mutazioni via RPC
revoke all on public.notifications  from authenticated;
grant  select on public.notifications to authenticated;
grant  update (read_at) on public.notifications to authenticated;
revoke all on public.achievements      from authenticated;
grant  select on public.achievements   to authenticated;
revoke all on public.user_achievements from authenticated;
grant  select on public.user_achievements to authenticated;
grant  update (is_public) on public.user_achievements to authenticated;

-- Moderazione (solo lettura, RLS moderator-only)
revoke all on public.moderators         from authenticated;
grant  select on public.moderators       to authenticated;
revoke all on public.reports            from authenticated;
grant  select on public.reports          to authenticated;
revoke all on public.moderation_queue   from authenticated;
grant  select on public.moderation_queue to authenticated;
revoke all on public.moderation_actions from authenticated;
grant  select on public.moderation_actions to authenticated;

-- Economia (solo lettura; le righe monetarie le scrive service_role/Stripe)
revoke all on public.wallets           from authenticated;
grant  select on public.wallets        to authenticated;  -- RLS: owner
revoke all on public.vibe_transactions from authenticated;
grant  select on public.vibe_transactions to authenticated;  -- RLS: parti
revoke all on public.stripe_customers  from authenticated;
grant  select on public.stripe_customers to authenticated;  -- RLS: owner
revoke all on public.creator_earnings  from authenticated;
grant  select on public.creator_earnings to authenticated;  -- RLS: owner

-- GDPR (solo lettura; scrittura via record_consent/request_gdpr)
revoke all on public.consents        from authenticated;
grant  select on public.consents     to authenticated;  -- RLS: owner
revoke all on public.gdpr_requests   from authenticated;
grant  select on public.gdpr_requests to authenticated;  -- RLS: owner

-- Audit: nessun accesso al client (append-only via definer; lettura moderatori
-- resterà da abilitare con un grant esplicito quando arriverà la UI dedicata).
revoke all on public.audit_log from authenticated;
