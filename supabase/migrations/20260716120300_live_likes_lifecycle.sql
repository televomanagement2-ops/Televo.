-- =============================================================================
-- Televo — Rework Live M15 (LR3): ciclo di vita & GDPR dei like
-- =============================================================================
-- Quarta wave del rework Live (docs/live/live-rework.md, Parte II §11 LR3): i
-- like (live_likes, introdotti in LR0) entrano nell'effimerità del dominio e nei
-- diritti GDPR, SPECCHIANDO la posizione di commenti e spettatori:
--   1. expire_content v9            → purge delle righe live_likes a 24h dalla
--      fine della live (stesso blocco di live_comments/live_viewers). Le righe a
--      30 giorni cascano già con la riga lives (FK on delete cascade, LR0).
--   2. process_account_deletion v8  → art. 17: DELETE dei lotti di like propri
--      (anche su live ALTRUI). lives.like_count NON si tocca (aggregato anonimo).
-- La terza gamba di LR3 vive nel repo Edge: gdpr-export v6 (art. 15, sezione
-- live_likes) — in coda deploy owner.
--
-- ⚠️ REGOLA ANTI-REGRESSIONE (vincolo MM1/LM3): entrambe le funzioni copiano il
-- corpo dell'ULTIMA versione in vigore VERBATIM e AGGIUNGONO i soli blocchi like:
--   · expire_content            ← v8 (20260713140000_live_viewer_count_incrementale.sql,
--     NON v7! v8 ha il blocco di riconciliazione anti-drift di viewer_count).
--   · process_account_deletion  ← v7 (20260711140000_live_lifecycle.sql).
-- Stessa migrazione = stessa transazione: il cron `expire-content` (5 min) non
-- vede mai uno stato intermedio. NESSUN job cron nuovo.
--
-- Scelte di design (live-rework.md §3.5/§8.4):
--  · like_count SOPRAVVIVE a purge e cancellazione account del liker: è un
--    aggregato ANONIMO non riconducibile all'interessato (stessa posizione dei
--    contatori congelati dei drops e di peak_viewers), e muore comunque coi 30
--    giorni della riga lives. Le delete NON lo decrementano (totale storico, LR0).
--  · INVARIANTE finestra 24h: la purge di live_likes coincide con quella di
--    live_viewers (registro kick) e con la finestra 24h della striscia terminate
--    (lives_strip, §1). Se un domani una delle tre durate cambiasse, le altre
--    vanno mosse insieme (i kickati rientrerebbero, le righe like sopravvivrebbero
--    oltre la striscia).

-- =============================================================================
-- 1. expire_content v9 — corpo v8 VERBATIM + purge live_likes nel blocco 24h.
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

  -- M12 (LM3): reti di sicurezza della Live (live.md §12.1/§12.2/§12.10). Il
  -- force-end passa dall'UPDATE di stato: lives_before_write valorizza ended_at
  -- e gli after-trigger (badge mappa → Echo 3h, premio Aura se qualificata)
  -- scattano da soli. Casi: cap durata 8h (QA-1, host crashato senza webhook) ·
  -- pausa dimenticata oltre 30 minuti (QA-2) · host che non passa più
  -- is_active_user() (ban/mute moderatore o auto-mute Perspective, §11).
  update public.lives l
  set status = 'ended'
  where l.status <> 'ended'
    and ( (l.status = 'live'   and l.started_at < now() - interval '8 hours')
       or (l.status = 'paused' and l.paused_at  < now() - interval '30 minutes')
       or not public.is_active_user(l.host_id) );

  -- M12 (LM3): commenti e spettatori vivono 24 ore oltre la fine della live
  -- (finestra di moderazione, §6) — poi via. Gli excerpt dei contenuti
  -- segnalati sopravvivono in moderation_queue (§12.9).
  delete from public.live_comments c using public.lives l
    where c.live_id = l.id and l.ended_at is not null
      and l.ended_at < now() - interval '24 hours';
  delete from public.live_viewers v using public.lives l
    where v.live_id = l.id and l.ended_at is not null
      and l.ended_at < now() - interval '24 hours';

  -- M15 (LR3): i lotti di like seguono commenti/spettatori — via a 24h dalla
  -- fine (live-rework.md §3.5/§8.4). lives.like_count SOPRAVVIVE (aggregato
  -- anonimo: muore coi 30 giorni della riga lives). INVARIANTE: questa finestra
  -- 24h coincide con quella di live_viewers e della striscia terminate
  -- (lives_strip) — le tre durate vanno mosse insieme.
  delete from public.live_likes lk using public.lives l
    where lk.live_id = l.id and l.ended_at is not null
      and l.ended_at < now() - interval '24 hours';

  -- M12 (LM3): minimizzazione — la riga lives sparisce dopo 30 giorni dalla
  -- fine (nessun archivio di live passate, §0.2). live_hosts casca via FK;
  -- map_events.live_id va a NULL da sé (FK set null di LM1).
  delete from public.lives
    where ended_at is not null and ended_at < now() - interval '30 days';

  -- M12 (LM3): cintura difensiva mappa (specchio della cintura room_live qui
  -- sopra): un evento live_broadcast ancora aperto la cui live NON è più in
  -- corso (ended, o riga già rimossa) va chiuso → Echo con finestra di 3 ORE
  -- (vs 12h stanze, §8). La via primaria è il trigger lives_map_close_events
  -- (LM1): questo è il recupero a 5 minuti.
  update public.map_events e
  set ended_at = now(), visibility_expires_at = now() + interval '3 hours'
  where e.event_type = 'live_broadcast' and e.ended_at is null
    and not exists (
      select 1 from public.lives l where l.id = e.live_id and l.status <> 'ended'
    );

  -- M13 (P7): riconciliazione anti-drift del contatore spettatori (audit §6.2).
  -- Il contatore vive a delta sotto row-lock (trigger su live_viewers); questa
  -- rete di sicurezza riallinea viewer_count allo stato reale delle righe per
  -- le sole live ancora attive, se mai divergesse (heal ≤5 min via il cron
  -- esistente). peak_viewers è monotòno e non si tocca.
  update public.lives l
  set viewer_count = x.reale
  from (
    select l2.id,
           (select count(*)::int from public.live_viewers v
            where v.live_id = l2.id and v.left_at is null and v.kicked_at is null) as reale
    from public.lives l2
    where l2.status in ('live', 'paused')
  ) x
  where x.id = l.id and l.viewer_count is distinct from x.reale;
end;
$$;

revoke all on function public.expire_content() from public, anon, authenticated;

-- =============================================================================
-- 2. process_account_deletion v8 — corpo v7 VERBATIM + DELETE dei like propri
--    (prima del log_audit finale, che resta la chiusura della funzione).
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
  -- (sostituisce i vecchi rami della Mappa Vibe di Fase 5, tabelle droppate lì).
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

  -- M12 (LM3): Live dell'utente (§12.14). Prima l'END (la macchina a stati
  -- resta l'unico arbitro: lives_before_write valorizza ended_at; il premio
  -- Aura dell'after-trigger è un no-op — emit_aura salta i profili cancellati,
  -- e il profilo è già anonimizzato sopra), POI il DELETE fisico (cascade su
  -- live_hosts/live_viewers/live_comments). La stanza LiveKit muore da sola
  -- (empty timeout / webhook). Gli eventi mappa dell'utente sono già stati
  -- cancellati dal blocco Mappa v2 qui sopra.
  update public.lives set status = 'ended' where host_id = p_user and status <> 'ended';
  delete from public.lives where host_id = p_user;

  -- M12 (LM3): tracce lasciate su live ALTRUI — commenti scritti, presenze da
  -- spettatore, righe da co-host. Dato personale → via subito (art. 17).
  delete from public.live_comments where author_id = p_user;
  delete from public.live_viewers  where user_id   = p_user;
  delete from public.live_hosts    where user_id   = p_user;

  -- M15 (LR3): i lotti di like propri (anche su live ALTRUI; quelli sulle live
  -- proprie sono già cascati col delete sopra) sono dato personale → via subito
  -- (art. 17). lives.like_count NON si tocca: è un aggregato anonimo non
  -- riconducibile all'interessato (§3.5), e muore coi 30 giorni della riga lives.
  delete from public.live_likes where user_id = p_user;

  perform public.log_audit('account_anonymized', 'user', p_user, '{}'::jsonb);
end;
$$;

-- Hardening (M15/LR3): la migrazione GDPR originale (20260628210000_gdpr.sql)
-- revocava questa funzione SOLO `from public`, ma sull'hosted le DEFAULT
-- PRIVILEGES concedono EXECUTE DIRETTAMENTE ad anon/authenticated (lezione CM8):
-- il grant restava, rendendo la RPC chiamabile da qualunque utente autenticato
-- con un p_user ARBITRARIO (anonimizzazione di account terzi). Chiudiamo il buco
-- qui — l'unica via legittima è la Edge gdpr-delete (service_role, p_user = uid
-- del JWT) e il cron purge_due_deletions (SECURITY DEFINER): entrambi ignorano
-- il grant, quindi il revoke non rompe nulla.
revoke all on function public.process_account_deletion(uuid) from public, anon, authenticated;
