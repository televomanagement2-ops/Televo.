-- =============================================================================
-- Televo — Drops M6 (DM0): ciclo di vita (scadenza, pulizia storage, notifiche)
-- =============================================================================
-- Effimerità LOGICA, non fisica (R-01): alla scadenza il drop NON si cancella
-- più. Il cron expire_content congela le statistiche in stats_finali, cancella
-- le interazioni e lascia la riga viva → per gli amici sparisce (RLS
-- expires_at), per l'autore diventa un Ricordo. I file dei contenuti cancellati
-- finiscono in una coda (l'hosted VIETA la DELETE su storage.objects — CM8),
-- svuotata da una Edge dedicata (storage-cleanup, DM6).
--
-- ⚠️ REGOLA ANTI-REGRESSIONE (verbatim + add): expire_content copia la v4
-- (20260705130000_chat_cleanup.sql) e SOSTITUISCE il solo blocco drops;
-- moderation_target_user e process_account_deletion copiano il corpo live e
-- AGGIUNGONO i rami drops. pgTAP ha guardie prosrc.

-- =============================================================================
-- 1. Coda di pulizia storage (R-09). RLS attiva SENZA policy (pattern audit_log):
--    scrittura solo via trigger/definer, lettura solo service_role (Edge DM6).
-- =============================================================================
create table public.storage_cleanup_queue (
  id         bigint generated always as identity primary key,
  bucket     text        not null,
  path       text        not null,
  created_at timestamptz not null default now()
);

create index storage_cleanup_queue_created_idx on public.storage_cleanup_queue (created_at);

alter table public.storage_cleanup_queue enable row level security;
revoke all on public.storage_cleanup_queue from anon, authenticated;

-- Trigger after-delete: accoda i file dei contenuti cancellati. Un'unica funzione
-- distingue la tabella d'origine (drops, drop_comments, messages — quest'ultimo
-- sana anche il debito dei vocali chat hard-deleted dal cron, R-09).
create or replace function public.enqueue_storage_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'drops' then
    if old.media_url is not null then
      insert into public.storage_cleanup_queue (bucket, path) values ('drop-media', old.media_url);
    end if;
    if old.audio_url is not null then
      insert into public.storage_cleanup_queue (bucket, path) values ('drop-audio', old.audio_url);
    end if;
  elsif tg_table_name = 'drop_comments' then
    if old.audio_url is not null then
      insert into public.storage_cleanup_queue (bucket, path) values ('drop-audio', old.audio_url);
    end if;
  elsif tg_table_name = 'messages' then
    if old.audio_url is not null then
      insert into public.storage_cleanup_queue (bucket, path) values ('voice-messages', old.audio_url);
    end if;
    if old.media_url is not null then
      insert into public.storage_cleanup_queue (bucket, path) values ('chat-media', old.media_url);
    end if;
  end if;
  return old;
end;
$$;

create trigger drops_after_delete_cleanup
  after delete on public.drops
  for each row execute function public.enqueue_storage_cleanup();

create trigger drop_comments_after_delete_cleanup
  after delete on public.drop_comments
  for each row execute function public.enqueue_storage_cleanup();

create trigger messages_after_delete_cleanup
  after delete on public.messages
  for each row execute function public.enqueue_storage_cleanup();

-- =============================================================================
-- 2. expire_content v5 — v4 VERBATIM, ma il blocco drops passa da "cancella" a
--    "congela stats + cancella interazioni + lascia la riga" (R-01).
-- =============================================================================
create or replace function public.expire_content()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rooms
  set status = 'ended'
  where status = 'live' and ends_at is not null and ends_at < now();

  -- M6 (R-01): i drop scaduti NON si cancellano. Prima congela le statistiche
  -- (idempotente: solo dove stats_finali is null), POI cancella le interazioni.
  update public.drops d
  set stats_finali = jsonb_build_object(
        'likes',     (select count(*) from public.drop_likes    l where l.drop_id = d.id),
        'comments',  (select count(*) from public.drop_comments c where c.drop_id = d.id),
        'saves',     (select count(*) from public.drop_saves    s where s.drop_id = d.id),
        'reactions', coalesce((
           select jsonb_object_agg(t.trait, t.n)
           from (select r.trait::text as trait, count(*) as n
                 from public.drop_reactions r where r.drop_id = d.id
                 group by r.trait) t
        ), '{}'::jsonb)
      )
  where d.expires_at < now() and d.stats_finali is null;

  -- Interazioni dei drop scaduti → via (i vocali dei commenti finiscono in coda
  -- cleanup via trigger after-delete). I props/Aura già emessi restano nel ledger.
  delete from public.drop_comments  c using public.drops d
    where c.drop_id = d.id and d.expires_at < now();
  delete from public.drop_likes     l using public.drops d
    where l.drop_id = d.id and d.expires_at < now();
  delete from public.drop_saves     s using public.drops d
    where s.drop_id = d.id and d.expires_at < now();
  delete from public.drop_reactions r using public.drops d
    where r.drop_id = d.id and d.expires_at < now();

  delete from public.messages where expires_at is not null and expires_at < now();

  -- Mappa: presenze scadute e location di stanze non più live.
  delete from public.live_presence where expires_at < now();
  delete from public.room_locations rl
  using public.rooms r
  where rl.room_id = r.id and r.status <> 'live';

  -- CM8 (R-16): gruppi/house senza più membri → cancellati (FK cascade sul
  -- resto: messages, conversation_members, streaks, message_reactions,
  -- saved_messages). I file dei bucket restano debito (vedi header).
  delete from public.conversations c
  where c.type in ('group', 'house')
    and not exists (
      select 1 from public.conversation_members m where m.conversation_id = c.id
    );
end;
$$;

-- =============================================================================
-- 3. Notifica commenti (R-15): drop_comment all'autore del drop e, per le reply,
--    all'autore del commento padre (dedup, mai a se stessi, mai numeri nel testo,
--    anti-spam 10 min per lo stesso drop). Consegna via pipeline esistente.
-- =============================================================================
create or replace function public.drop_comments_after_insert_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_drop_author   uuid;
  v_parent_author uuid;
  v_name          text;
begin
  select author_id into v_drop_author from public.drops where id = new.drop_id;
  select coalesce(display_name, username::text) into v_name
  from public.profiles where id = new.author_id;

  -- All'autore del drop (se non commenta se stesso), con dedup anti-spam 10 min.
  if v_drop_author is not null and v_drop_author <> new.author_id then
    if not exists (
      select 1 from public.notifications n
      where n.user_id = v_drop_author and n.type = 'drop_comment'
        and n.read_at is null
        and n.payload ->> 'drop_id' = new.drop_id::text
        and n.created_at > now() - interval '10 minutes'
    ) then
      perform public.enqueue_notification(
        v_drop_author, 'drop_comment',
        coalesce(v_name, 'Qualcuno') || ' ha commentato il tuo drop', null,
        jsonb_build_object('drop_id', new.drop_id, 'comment_id', new.id)
      );
    end if;
  end if;

  -- Reply: anche all'autore del commento padre (se diverso da sé e dall'autore
  -- del drop, che è già stato notificato sopra → dedup).
  if new.parent_id is not null then
    select author_id into v_parent_author from public.drop_comments where id = new.parent_id;
    if v_parent_author is not null
       and v_parent_author <> new.author_id
       and v_parent_author is distinct from v_drop_author then
      if not exists (
        select 1 from public.notifications n
        where n.user_id = v_parent_author and n.type = 'drop_comment'
          and n.read_at is null
          and n.payload ->> 'drop_id' = new.drop_id::text
          and n.created_at > now() - interval '10 minutes'
      ) then
        perform public.enqueue_notification(
          v_parent_author, 'drop_comment',
          coalesce(v_name, 'Qualcuno') || ' ha risposto al tuo commento', null,
          jsonb_build_object('drop_id', new.drop_id, 'comment_id', new.id)
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger drop_comments_after_insert_notify_trg
  after insert on public.drop_comments
  for each row execute function public.drop_comments_after_insert_notify();

-- =============================================================================
-- 4. moderation_target_user v2 — corpo live VERBATIM + ramo 'drop_comment'
--    (→ author_id del commento). ACL invariata (create or replace la preserva).
-- =============================================================================
create or replace function public.moderation_target_user(p_type public.moderation_target, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'user'         then p_id
    when 'message'      then (select sender_id from public.messages      where id = p_id)
    when 'drop'         then (select author_id from public.drops         where id = p_id)
    when 'drop_comment' then (select author_id from public.drop_comments where id = p_id)
    when 'room'         then (select host_id   from public.rooms         where id = p_id)
  end;
$$;

-- =============================================================================
-- 5. process_account_deletion v5 — corpo CM5 VERBATIM + interazioni drops e
--    accodamento dei file media chat (l'anonimizzazione AZZERA i riferimenti
--    con un UPDATE, non un DELETE → i byte vanno accodati esplicitamente qui).
-- =============================================================================
create or replace function public.process_account_deletion(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then return; end if;

  -- Profilo: anonimizzato e soft-eliminato (username deterministico e valido).
  update public.profiles set
    username       = 'deleted_' || left(replace(p_user::text, '-', ''), 12),
    display_name   = null,
    avatar_url     = null,
    audio_bio_url  = null,
    status_text    = null,
    customization  = '{}'::jsonb,
    interests      = '{}',
    share_location = false,
    expo_push_token = null,
    deleted_at     = coalesce(deleted_at, now())
  where id = p_user;

  -- Dato sensibile: la birth_date privata va rimossa SUBITO.
  delete from public.profiles_private where id = p_user;

  -- M6 (R-09): i file media dei messaggi vengono azzerati (UPDATE sotto) → i byte
  -- restano orfani; accodali PRIMA di perdere i path (la Edge storage-cleanup li
  -- rimuove, DM6). I file dei drop dell'utente li accoda il trigger after-delete.
  insert into public.storage_cleanup_queue (bucket, path)
  select 'voice-messages', audio_url from public.messages where sender_id = p_user and audio_url is not null
  union all
  select 'chat-media', media_url from public.messages where sender_id = p_user and media_url is not null;

  -- Contenuti dell'utente: rimossi/oscurati subito. CM5: anche i riferimenti
  -- media (i FILE nel bucket restano orfani → coda cleanup DM6).
  update public.messages set deleted_at = now(), body = null, audio_url = null,
                             media_url = null, media_type = null
  where sender_id = p_user;
  delete from public.drops          where author_id = p_user;  -- fa scattare la coda cleanup dei file drop
  delete from public.live_presence  where user_id   = p_user;
  delete from public.room_locations where host_id   = p_user;
  delete from public.devices        where user_id   = p_user;
  delete from public.top_friends    where user_id = p_user or friend_id = p_user;

  -- Nuove tabelle chat (CM1, RC-12): hash rubrica e bookmark personali.
  delete from public.contact_hashes where user_id = p_user;
  delete from public.saved_messages where user_id = p_user;

  -- CM4: le reazioni sono dato personale quanto i bookmark.
  delete from public.message_reactions where user_id = p_user;

  -- M6 (RC-08): interazioni lasciate su drop ALTRUI (i propri drop col loro
  -- corredo sono già spariti col delete sopra). I vocali dei commenti → coda.
  delete from public.drop_comments where author_id = p_user;
  delete from public.drop_likes    where user_id   = p_user;
  delete from public.drop_saves    where user_id   = p_user;

  perform public.log_audit('account_anonymized', 'user', p_user, '{}'::jsonb);
end;
$$;

-- =============================================================================
-- 6. Realtime: i commenti sono l'unico punto con realtime (S3, RC-04). Guardia
--    idempotente (ADD TABLE fallisce se già presente).
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'drop_comments'
  ) then
    alter publication supabase_realtime add table public.drop_comments;
  end if;
end;
$$;
