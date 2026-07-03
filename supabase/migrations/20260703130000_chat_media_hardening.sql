-- =============================================================================
-- Televo — Chat: hardening foto/media + inoltro foto (CM5 — "chat media hardening")
-- =============================================================================
-- Milestone CM5 del piano chat (docs/chat/IMPLEMENTATION-PLAN.md): il backend
-- media (enum, colonne, bucket chat-media + RLS, anteprima '📷 Foto') è live da
-- 20260701050100, ma l'audit pre-CM5 ha trovato lacune reali che questa
-- migrazione chiude PRIMA che la prima foto esista:
--
-- 1. VALIDAZIONE MEDIA nel trigger di insert (finora assente: si poteva
--    inserire type='media' senza file, o un 'text' con media_url):
--    - media_url obbligatorio e non vuoto            → 'media_url_required'
--    - media_type solo 'image' (unico formato D3)    → 'invalid_media_type'
--    - media_url DEVE avere prefisso <conversation_id>/<sender_id>/
--                                                    → 'invalid_media_path'
--      Uccide a livello DB la classe di attacchi "riferimento a file di
--      un'ALTRA conversazione" (la RLS storage di chat-media dà lettura solo
--      ai membri della conversazione in path[1]: un path estraneo sarebbe una
--      foto rotta per i destinatari o un probe su file altrui).
--    - FOTO PERMANENTI (decisione utente 2026-07-03, coerente con SRS Rev. 2:
--      solo i vocali sono effimeri): expires_at vietato → 'media_cannot_expire'
--    - audio_url vietato sui media, colonne media vietate sugli altri tipi
--                                                    → 'invalid_media_fields'
-- 2. INOLTRO ESTESO AI MEDIA (promesso dal commento CM4): origine 'text' O
--    'media'; i vocali restano vietati (effimeri). Il client COPIA il file
--    nella conversazione di destinazione via Storage API
--    (storage.from('chat-media').copy(src, dest)): la copia avviene sul
--    server, la RLS fa da doppio cancello (SELECT sull'origine = membro;
--    INSERT su <destConv>/<uid>/ = proprio path) e il file copiato vive nella
--    destinazione — stessa semantica dell'inoltro testo (sopravvive a
--    cancellazioni/GDPR dell'origine). Il prefisso obbligatorio del punto 1
--    valida la copia gratis: nessuna logica dedicata, nessuna nuova funzione
--    SECURITY DEFINER. In più: new.type deve dichiarare il tipo dell'origine
--    (niente travestimenti)                          → 'invalid_forward'
-- 3. MEDIA IMMUTABILI in update (difesa in profondità oltre il grant
--    (body, deleted_at)): media_url/media_type non si riscrivono MAI verso un
--    altro valore; l'AZZERAMENTO contestuale a un soft-delete resta possibile
--    (process_account_deletion setta deleted_at + media null nello STESSO
--    update — forzare old incondizionatamente romperebbe il GDPR).
-- 4. GDPR: process_account_deletion v4 azzera anche media_url/media_type.
--
-- ⚠️ FILE STORAGE ORFANI (dichiarato, rinviato a CM8 — decisione 2026-07-03):
-- nessuna pulizia di storage.objects nel repo. Restano orfani i file di
-- upload-senza-insert (retry outbox), di messaggi scaduti/soft-cancellati e
-- dell'anonimizzazione GDPR (le COLONNE si azzerano qui; i byte nel bucket
-- privato diventano irraggiungibili ma non vengono cancellati). La pulizia
-- (cron/Edge con service_role) è in carico a CM8 insieme agli orfani vocali.
--
-- ⚠️ REGOLA ANTI-REGRESSIONE (lezione CM1): `messages_before_insert` e
-- `messages_before_update` sono ridefinite copiando VERBATIM il corpo
-- definitivo di 20260703120000_chat_modern.sql e AGGIUNGENDO solo i blocchi
-- nuovi (marcati "CM5"). I trigger esistenti non si toccano (create or
-- replace function basta). pgTAP ha guardie di regressione.

-- =============================================================================
-- 1. messages_before_insert v4 — corpo CM4 verbatim + validazione media
--    + inoltro esteso a testo/media
-- =============================================================================
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv_type   public.conversation_type;
  v_peer        uuid;
  v_recenti     int;
  v_fwd_conv    uuid;
  v_fwd_type    public.message_type;
  v_fwd_deleted timestamptz;
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

  -- CM5 (D3): coerenza type <-> colonne media (il grant da solo non basta).
  if new.type = 'media' then
    if new.media_url is null or length(btrim(new.media_url)) = 0 then
      raise exception 'media_url_required';
    end if;
    if new.media_type is distinct from 'image' then
      raise exception 'invalid_media_type';
    end if;
    -- Il path DEVE stare nella conversazione e nella cartella del mittente:
    -- nessun riferimento a file di ALTRE conversazioni (l'inoltro COPIA il file).
    if new.media_url not like format('%s/%s/%%', new.conversation_id, new.sender_id) then
      raise exception 'invalid_media_path';
    end if;
    -- Foto PERMANENTI (decisione utente 2026-07-03): niente scadenza.
    if new.expires_at is not null then
      raise exception 'media_cannot_expire';
    end if;
    -- Un media non trasporta audio.
    if new.audio_url is not null then
      raise exception 'invalid_media_fields';
    end if;
  elsif new.media_url is not null or new.media_type is not null then
    -- Colonne media vietate su text/audio/voice_thread.
    raise exception 'invalid_media_fields';
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

  -- CM4 (RC-06): inoltro — l'origine deve esistere, non essere cancellata ed
  -- essere visibile al mittente (membro della sua conversazione).
  if new.forwarded_from is not null then
    select m.conversation_id, m.type, m.deleted_at
      into v_fwd_conv, v_fwd_type, v_fwd_deleted
    from public.messages m
    where m.id = new.forwarded_from;

    if v_fwd_conv is null or v_fwd_deleted is not null then
      raise exception 'invalid_forward';
    end if;
    -- CM5: inoltrabili testo E media; i vocali restano vietati (effimeri).
    if v_fwd_type not in ('text', 'media') then
      raise exception 'cannot_forward_type';
    end if;
    -- La copia dichiara lo stesso tipo dell'origine (niente travestimenti).
    if new.type <> v_fwd_type then
      raise exception 'invalid_forward';
    end if;
    if not public.is_conv_member(v_fwd_conv, new.sender_id) then
      raise exception 'invalid_forward';
    end if;
    -- Inoltro e risposta non si combinano (forzato, non è un errore).
    new.reply_to := null;
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 2. messages_before_update v4 — corpo CM4 verbatim + media immutabili
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
  -- CM4: la provenienza di un inoltro non si riscrive.
  new.forwarded_from  := old.forwarded_from;

  -- CM5: media immutabili — MA l'azzeramento contestuale a un soft-delete resta
  -- possibile (GDPR: process_account_deletion setta deleted_at + media null
  -- nello STESSO update; forzare old qui romperebbe l'anonimizzazione).
  if new.deleted_at is null then
    new.media_url  := old.media_url;
    new.media_type := old.media_type;
  else
    -- Soft-delete: ammesso solo azzerare, mai riscrivere verso un altro valore.
    if new.media_url  is not null then new.media_url  := old.media_url;  end if;
    if new.media_type is not null then new.media_type := old.media_type; end if;
  end if;

  -- Soft-delete (incl. anonimizzazione GDPR che azzera anche il body): NON è un
  -- edit → nessuna finestra 48h, edited_at intatto.
  if new.deleted_at is not null then
    new.edited_at := old.edited_at;
    return new;
  end if;

  if new.body is distinct from old.body then
    -- Solo il testo dei messaggi 'text' non cancellati è editabile, entro 48h.
    -- (Le caption delle foto NON si editano: old.type='media' cade qui.)
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

-- =============================================================================
-- 3. process_account_deletion v4 — corpo CM4 verbatim + azzeramento media
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

  -- Contenuti dell'utente: rimossi/oscurati subito. CM5: anche i riferimenti
  -- media (i FILE nel bucket restano orfani e irraggiungibili → pulizia CM8).
  update public.messages set deleted_at = now(), body = null, audio_url = null,
                             media_url = null, media_type = null
  where sender_id = p_user;
  delete from public.drops          where author_id = p_user;
  delete from public.live_presence  where user_id   = p_user;
  delete from public.room_locations where host_id   = p_user;
  delete from public.devices        where user_id   = p_user;
  delete from public.top_friends    where user_id = p_user or friend_id = p_user;

  -- Nuove tabelle chat (CM1, RC-12): hash rubrica e bookmark personali.
  delete from public.contact_hashes where user_id = p_user;
  delete from public.saved_messages where user_id = p_user;

  -- CM4: le reazioni sono dato personale quanto i bookmark.
  delete from public.message_reactions where user_id = p_user;

  perform public.log_audit('account_anonymized', 'user', p_user, '{}'::jsonb);
end;
$$;
