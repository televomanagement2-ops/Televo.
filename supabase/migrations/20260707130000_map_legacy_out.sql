-- =============================================================================
-- Televo — M7 · La Mappa della Città (MM1): legacy Fase 5 out + ciclo di vita v6
-- =============================================================================
-- Seconda wave della Mappa v2 (docs/map/map.md, Parte II §16 MM1). La "Mappa Vibe"
-- di Fase 5 (20260628170000_map.sql: geohash coarse, presenze 15min, view
-- vibe_map) NON è mai stata esposta a un client e viene DEPRECATA in blocco. Qui:
--   1. expire_content       → v6 (pulisce le tabelle Mappa v2, non più le legacy)
--   2. process_account_deletion → v6 (cancella le righe Mappa v2 dell'utente)
--   3. DROP di vibe_map / update_presence / clear_presence / set_room_location
--   4. DROP delle tabelle live_presence / room_locations
-- profiles.share_location RESTA (kill-switch, nuova semantica map.md §3 — già
-- riusato dal trigger profiles_map_kill_switch di MM0).
--
-- ⚠️ VINCOLO DI ORDINAMENTO CRITICO (map.md §13.4): il cron `expire-content` gira
-- ogni 5 minuti e invoca expire_content(). Se droppassimo live_presence/
-- room_locations in una migrazione e ridefinissimo le funzioni in un'altra, tra i
-- due deploy il cron esploderebbe sul riferimento a una tabella inesistente. La
-- TRANSAZIONALITÀ di questa singola migrazione è l'UNICA protezione: ridefinire le
-- v6 (che non citano più le legacy) e droppare le tabelle DEVE avvenire nella
-- STESSA transazione. MAI splittare in due migrazioni.
--
-- ⚠️ REGOLA ANTI-REGRESSIONE: entrambe le funzioni copiano il corpo v5 LIVE
-- (20260705150300_drops_lifecycle.sql) VERBATIM e SOSTITUISCONO/rimuovono solo il
-- blocco mappa. pgTAP ha guardie prosrc aggiornate.

-- =============================================================================
-- 1. expire_content v6 — v5 VERBATIM, REPLACE del solo blocco mappa:
--    · via la pulizia legacy (live_presence/room_locations);
--    · dentro: righe Mappa v2 scadute per TTL (presenze a updated_at+24h, eventi
--      al loro visibility_expires_at = Echo a ended_at+12h);
--    · cintura difensiva: eventi room_live ancora live la cui stanza non è più
--      live vengono CHIUSI qui (→ Echo). La via primaria è il trigger rooms→
--      map_events (MM2): questa è la rete di sicurezza a 5 minuti.
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

  -- Mappa v2 (M7/MM1): auto-expiry delle righe. Le presenze a 24h dall'ultimo
  -- publish (visibility_expires_at), gli eventi al loro visibility_expires_at
  -- (Echo = ended_at + 12h). L'auto-expiry È l'elemento di design della mappa.
  delete from public.map_presence
    where visibility_expires_at is not null and visibility_expires_at < now();
  delete from public.map_events
    where visibility_expires_at is not null and visibility_expires_at < now();

  -- Cintura difensiva (map.md §5/§13.4): un evento room_live ancora "live"
  -- (ended_at is null) la cui stanza NON è più live va chiuso → diventa Echo con
  -- finestra di 12h. La via primaria sarà il trigger su rooms (MM2); questo è il
  -- recupero a 5 minuti nel caso il trigger non sia scattato.
  update public.map_events e
  set ended_at = now(), visibility_expires_at = now() + interval '12 hours'
  from public.rooms r
  where e.room_id = r.id and e.ended_at is null and r.status <> 'live';

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
-- 2. process_account_deletion v6 — v5 VERBATIM, con i due rami legacy
--    (live_presence/room_locations) SOSTITUITI dalle righe Mappa v2. Il profilo
--    resta (viene solo anonimizzato con UPDATE, deleted_at valorizzato) → il
--    cascade FK di map_* NON scatta: servono i delete espliciti qui.
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
  -- Mappa v2 (M7/MM1): ogni riga di posizione/evento/zona dell'utente sparisce
  -- (sostituisce i vecchi rami della Mappa Vibe di Fase 5, tabelle droppate qui).
  delete from public.map_presence   where user_id   = p_user;
  delete from public.map_events     where user_id   = p_user;
  delete from public.map_safe_zones where user_id   = p_user;
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
-- 3. Deprecazione legacy Fase 5. A questo punto NESSUNA funzione live cita più
--    live_presence/room_locations (le v6 sopra le hanno rimosse), quindi il drop
--    è sicuro DENTRO questa transazione. Ordine: prima la view (dipende dalle due
--    tabelle), poi le RPC geohash, infine le tabelle (indici e policy cascadono).
-- =============================================================================
drop view if exists public.vibe_map;

drop function if exists public.update_presence(text);
drop function if exists public.clear_presence();
drop function if exists public.set_room_location(uuid, text);

drop table if exists public.live_presence;
drop table if exists public.room_locations;
