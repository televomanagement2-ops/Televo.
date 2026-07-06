-- =============================================================================
-- Televo — Drops M6 (DM5): inoltro di un drop in chat come RIFERIMENTO (R-08)
-- =============================================================================
-- Micro-migrazione del piano drop.md §20 (DM5). Un drop inoltrato in chat (voce
-- "Inoltra in chat" del menu ⋯) o "Rispondi in privato" NON copia il contenuto:
-- viaggia come un PUNTATORE (`messages.drop_ref`) risolto lato LETTORE con la
-- SUA di RLS. Conseguenze (tutte volute, drop.md R-08):
--  · inoltrare NON estende mai la visibilità: se il lettore non è amico
--    dell'autore, o il drop è scaduto/eliminato, la bolla mostra "Drop non
--    disponibile" (identico in tutti i casi: non riveliamo quale);
--  · l'effimero resta effimero: alla scadenza il drop sparisce anche dai
--    riferimenti in chat (drop_detail non lo risolve più);
--  · zero duplicazione storage (nessun file copiato, a differenza dell'inoltro
--    foto CM5).
--
-- `on delete set null`: se l'autore elimina il drop (o il GDPR lo cancella), il
-- riferimento degrada a "non disponibile" senza rompere il messaggio.
--
-- ⚠️ REGOLA ANTI-REGRESSIONE (verbatim + add): `messages_before_insert` è
-- ridefinita copiando il corpo live (v4, 20260703130000_chat_media_hardening.sql)
-- e AGGIUNGENDO SOLO il blocco `drop_ref` (marcato "DM5"). Nessun altro blocco è
-- toccato. pgTAP ha guardie che verificano che i blocchi CM1/CM4/CM5 restino.

-- -----------------------------------------------------------------------------
-- 1. Colonna del riferimento (nullable): la stragrande maggioranza dei messaggi
--    non ne ha uno. FK a drops con on delete set null (vedi sopra).
-- -----------------------------------------------------------------------------
alter table public.messages
  add column if not exists drop_ref uuid references public.drops (id) on delete set null;

-- -----------------------------------------------------------------------------
-- 2. messages_before_insert v5 — corpo CM5 VERBATIM + validazione drop_ref (DM5).
-- -----------------------------------------------------------------------------
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

  -- DM5 (R-08): riferimento a un drop inoltrato in chat / risposto in privato.
  -- È SEMPRE un messaggio di testo (la caption/nota viaggia nel body); mai
  -- combinato con media/audio/reply/inoltro/scadenza. Il mittente DEVE poter
  -- vedere il drop (can_see_drop): inoltrare non estende la visibilità — il
  -- lettore risolverà la bolla con la SUA di RLS (o vedrà "non disponibile").
  if new.drop_ref is not null then
    if new.type <> 'text' then
      raise exception 'invalid_drop_ref';
    end if;
    if new.audio_url is not null or new.media_url is not null
       or new.media_type is not null or new.reply_to is not null
       or new.forwarded_from is not null or new.expires_at is not null then
      raise exception 'invalid_drop_ref';
    end if;
    if not public.can_see_drop(new.drop_ref, new.sender_id) then
      raise exception 'drop_not_visible';
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

-- -----------------------------------------------------------------------------
-- 3. Grant insert esteso con drop_ref (additivo: si somma alle colonne già
--    concesse — conversation_id, type, body, audio_url, media_url, media_type,
--    reply_to, expires_at, forwarded_from). I campi di sistema restano forzati.
-- -----------------------------------------------------------------------------
grant insert (drop_ref) on public.messages to authenticated;
