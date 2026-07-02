-- =============================================================================
-- Televo — Chat: FIX del consolidamento CM1 (corregge 20260702120000)
-- =============================================================================
-- La migrazione di hardening precedente ha introdotto regressioni gravi. Qui le
-- correzioni, in blocco atomico:
--
-- 1. `messages_before_insert()` era stata SOVRASCRITTA perdendo il corpo
--    originale (sender forzato, membership, clamp expiry 24h, validazione
--    reply_to — 20260628160200) e il nuovo corpo leggeva `conversations.peer_id`,
--    colonna INESISTENTE → ogni INSERT su messages falliva a runtime. Qui il
--    corpo unico definitivo: logica originale + hardening (cap 4096, rate-limit,
--    blocco↔DM con peer ricavato da conversation_members).
-- 2. Trigger DUPLICATO `messages_before_insert` accanto allo storico
--    `messages_before_insert_trg` (stessa funzione eseguita due volte): rimosso.
-- 3. `messages_before_update()` leggeva `old.message_type` (la colonna è `type`)
--    → ogni edit del body falliva; inoltre bloccava la cancellazione GDPR
--    (`process_account_deletion` azzera il body di messaggi >48h). Qui: la via
--    del soft-delete (deleted_at valorizzato) bypassa la finestra di edit, e i
--    campi di sistema sono forzati immutabili.
-- 4. Il reset di `hidden_at` avveniva solo per il MITTENTE: inutile — SRS §7.5
--    vuole che la chat "eliminata" riappaia a chi l'ha nascosta quando ARRIVA un
--    messaggio. Qui: reset per TUTTI i membri, integrato nel trigger di bump già
--    esistente (un trigger in meno).
-- 5. `anonymize_user_data(uuid)` era SECURITY DEFINER con GRANT ad
--    `authenticated`: qualunque utente poteva anonimizzare i dati di CHIUNQUE.
--    Droppata; la cancellazione resta in `process_account_deletion` (v2, sotto)
--    che ora copre anche contact_hashes e saved_messages (piano CM1, RC-12).
-- 6. `get_peer_presence` era interrogabile su chiunque (nessun gating
--    relazionale, nessun revoke da public). Qui v2: visibile solo tra amici o
--    co-membri di una conversazione, mai in coppia bloccata.
--
-- Compromesso documentato (piano CM1): il grant SELECT su `profiles` copre
-- ancora `last_active_at` raw; lo spostamento su tabella dedicata con gating
-- server completo è rimandato a CM8. La RPC `get_peer_presence` è la via
-- ufficiale del client.

-- =============================================================================
-- 1+2. messages_before_insert — corpo definitivo (originale + hardening CM1)
-- =============================================================================
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv_type public.conversation_type;
  v_peer      uuid;
  v_recenti   int;
begin
  -- Campi di sistema forzati (mai fidarsi del client).
  new.sender_id  := (select auth.uid());
  new.created_at := now();
  new.deleted_at := null;
  new.edited_at  := null;

  if not public.is_conv_member(new.conversation_id, new.sender_id) then
    raise exception 'not_conv_member';
  end if;

  -- Hardening CM1: cap di lunghezza del testo (null-safe: i vocali hanno body null).
  if length(new.body) > 4096 then
    raise exception 'message_too_long';
  end if;

  -- Hardening CM1: rate-limit di base — max 30 messaggi negli ultimi 60 secondi
  -- (soglia larga: non deve colpire l'uso legittimo). Usa messages_sender_created_idx.
  select count(*) into v_recenti
  from public.messages
  where sender_id = new.sender_id
    and created_at > now() - interval '60 seconds';
  if v_recenti >= 30 then
    raise exception 'rate_limited';
  end if;

  -- Hardening CM1 (R-05): in una DM con coppia bloccata NESSUNO dei due scrive.
  -- Il peer è l'altro membro (conversations non ha una colonna peer).
  select c.type into v_conv_type
  from public.conversations c
  where c.id = new.conversation_id;

  if v_conv_type = 'dm' then
    select m.user_id into v_peer
    from public.conversation_members m
    where m.conversation_id = new.conversation_id
      and m.user_id <> new.sender_id
    limit 1;
    if v_peer is not null and public.is_blocked_pair(new.sender_id, v_peer) then
      raise exception 'blocked_pair';
    end if;
  end if;

  -- Scadenza vocali effimeri: ammessa solo nel futuro e mai oltre 24h.
  if new.expires_at is not null then
    if new.expires_at <= now() then
      raise exception 'invalid_expiry';
    end if;
    new.expires_at := least(new.expires_at, now() + interval '24 hours');
  end if;

  -- reply_to deve appartenere alla stessa conversazione.
  if new.reply_to is not null and not exists (
    select 1 from public.messages m
    where m.id = new.reply_to and m.conversation_id = new.conversation_id
  ) then
    raise exception 'invalid_reply_to';
  end if;

  return new;
end;
$$;

-- Il trigger storico `messages_before_insert_trg` resta e ora esegue il corpo
-- corretto; il duplicato introdotto da 20260702120000 va rimosso.
drop trigger if exists messages_before_insert on public.messages;

-- =============================================================================
-- 3. messages_before_update — colonna giusta, bypass GDPR, sistema immutabile
-- =============================================================================
create or replace function public.messages_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Campi di sistema immutabili anche in update (difesa oltre i grant per-colonna).
  new.sender_id       := old.sender_id;
  new.conversation_id := old.conversation_id;
  new.created_at      := old.created_at;
  new.type            := old.type;

  -- Soft-delete (incl. anonimizzazione GDPR che azzera anche il body): NON è un
  -- edit → nessuna finestra 48h, edited_at intatto.
  if new.deleted_at is not null then
    new.edited_at := old.edited_at;
    return new;
  end if;

  if new.body is distinct from old.body then
    -- Solo il testo dei messaggi 'text' non cancellati è editabile, entro 48h.
    if old.deleted_at is not null or old.type <> 'text' then
      raise exception 'cannot_edit_message';
    end if;
    if (now() - old.created_at) > interval '48 hours' then
      raise exception 'edit_window_expired';
    end if;
    if length(new.body) > 4096 then
      raise exception 'message_too_long';
    end if;
    new.edited_at := now();
  else
    -- edited_at non è modificabile direttamente dal client.
    new.edited_at := old.edited_at;
  end if;

  return new;
end;
$$;

-- Rinominato secondo la convenzione del repo (*_trg).
drop trigger if exists messages_before_update on public.messages;
drop trigger if exists messages_before_update_trg on public.messages;
create trigger messages_before_update_trg
  before update on public.messages
  for each row execute function public.messages_before_update();

-- =============================================================================
-- 4. hidden_at reset per TUTTI i membri — integrato nel bump esistente
-- =============================================================================
create or replace function public.messages_after_insert_bump()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;

  -- SRS §7.5: una chat "eliminata" (hidden_at) riappare al primo nuovo
  -- messaggio, per TUTTI i membri che l'avevano nascosta (non solo il mittente).
  update public.conversation_members
     set hidden_at = null
   where conversation_id = new.conversation_id
     and hidden_at is not null;

  return new;
end;
$$;

-- Trigger e funzione ridondanti introdotti da 20260702120000: rimossi.
drop trigger if exists messages_after_insert on public.messages;
drop function if exists public.messages_after_insert();

-- =============================================================================
-- 5. anonymize_user_data droppata + process_account_deletion v2
-- =============================================================================
drop function if exists public.anonymize_user_data(uuid);

-- v2: identica all'originale (20260628210000) + pulizia delle nuove tabelle
-- chat: contact_hashes (hash della mail = dato personale) e saved_messages.
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

  -- Contenuti dell'utente: rimossi/oscurati subito.
  update public.messages set deleted_at = now(), body = null, audio_url = null
  where sender_id = p_user;
  delete from public.drops          where author_id = p_user;
  delete from public.live_presence  where user_id   = p_user;
  delete from public.room_locations where host_id   = p_user;
  delete from public.devices        where user_id   = p_user;
  delete from public.top_friends    where user_id = p_user or friend_id = p_user;

  -- Nuove tabelle chat (CM1, RC-12): hash rubrica e bookmark personali.
  delete from public.contact_hashes where user_id = p_user;
  delete from public.saved_messages where user_id = p_user;

  perform public.log_audit('account_anonymized', 'user', p_user, '{}'::jsonb);
end;
$$;

-- =============================================================================
-- 6. get_peer_presence v2 — gating relazionale + reciprocità R-03
-- =============================================================================
create or replace function public.get_peer_presence(p_peer_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_allowed   boolean;
  v_my_pref   boolean;
  v_peer_pref boolean;
  v_online    boolean;
  v_last      timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_peer_user is null or p_peer_user = v_uid then raise exception 'invalid_target'; end if;

  -- Mai in coppia bloccata (nessun segnale, nemmeno "nascosto").
  if public.is_blocked_pair(v_uid, p_peer_user) then
    return jsonb_build_object('online', null, 'last_active_at', null);
  end if;

  -- Gating relazionale: la presenza NON è pubblica — solo amici o co-membri di
  -- una conversazione (safety minori: nessun probing da estranei).
  select public.are_friends(v_uid, p_peer_user)
      or exists (
           select 1
           from public.conversation_members a
           join public.conversation_members b using (conversation_id)
           where a.user_id = v_uid and b.user_id = p_peer_user
         )
    into v_allowed;
  if not v_allowed then
    return jsonb_build_object('online', null, 'last_active_at', null);
  end if;

  -- Reciprocità (R-03): entrambi devono esporre l'ultimo accesso.
  select coalesce(show_last_seen, true) into v_my_pref
  from public.profiles where id = v_uid;
  select coalesce(show_last_seen, true) into v_peer_pref
  from public.profiles where id = p_peer_user and deleted_at is null;

  if v_my_pref is distinct from true or v_peer_pref is distinct from true then
    return jsonb_build_object('online', null, 'last_active_at', null);
  end if;

  select (p.last_active_at > now() - interval '2 minutes'), p.last_active_at
    into v_online, v_last
  from public.profiles p
  where p.id = p_peer_user;

  return jsonb_build_object('online', coalesce(v_online, false), 'last_active_at', v_last);
end;
$$;

revoke all on function public.get_peer_presence(uuid) from public;
grant execute on function public.get_peer_presence(uuid) to authenticated;
