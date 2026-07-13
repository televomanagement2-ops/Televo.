-- =============================================================================
-- Televo — M13 (P7): contatore spettatori Live incrementale + riconciliazione
-- =============================================================================
-- Debito di scala F2 dell'audit (AUDIT-HARDENING §6.2, warning in roadmap.md):
-- l'aggiornamento di lives.viewer_count scattava per OGNI evento riga su
-- live_viewers, inclusi i no-op (re-upsert del mint token, purge di live
-- finite), con lock contention sulla riga lives e possibilità di scritture
-- stantie sotto concorrenza. Da qui in poi:
--   • sync_live_viewer_count lavora a DELTA: attivo = dentro e non kickato;
--     il delta della transizione OLD→NEW viene sommato al contatore SOTTO il
--     row-lock dell'UPDATE su lives — atomico e corretto sotto concorrenza,
--     zero lavoro quando nulla cambia.
--   • TRE trigger mirati con WHEN sulla stessa funzione: l'insert di uno
--     spettatore attivo, la transizione left/kick, la delete. Gli update che
--     non toccano left_at/kicked_at non arrivano nemmeno alla funzione.
--   • Indice parziale sugli spettatori dentro (per riconciliazione e path attivi).
--   • expire_content v8 = corpo v7 VERBATIM (20260711140000_live_lifecycle.sql)
--     + UN blocco in coda (regola anti-regressione MM1): riconciliazione
--     anti-drift di viewer_count per le sole live attive, heal ≤5 min via il
--     cron `expire-content` ESISTENTE — nessun job nuovo. peak_viewers è
--     monotòno e non si riconcilia.

-- -----------------------------------------------------------------------------
-- 1. sync_live_viewer_count — versione a delta. La semantica esterna resta
--    identica: viewer_count = spettatori dentro e non kickati; peak_viewers
--    solo in salita (greatest); le live 'ended' congelate (il where le salta).
-- -----------------------------------------------------------------------------
create or replace function public.sync_live_viewer_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live  uuid;
  v_delta integer;
begin
  -- attivo = left_at is null AND kicked_at is null; delta = attivo(NEW) − attivo(OLD).
  if tg_op = 'INSERT' then
    v_live  := new.live_id;
    v_delta := case when new.left_at is null and new.kicked_at is null then 1 else 0 end;
  elsif tg_op = 'DELETE' then
    v_live  := old.live_id;
    v_delta := case when old.left_at is null and old.kicked_at is null then -1 else 0 end;
  else
    v_live  := new.live_id;
    v_delta := (case when new.left_at is null and new.kicked_at is null then 1 else 0 end)
             - (case when old.left_at is null and old.kicked_at is null then 1 else 0 end);
  end if;

  if v_delta = 0 then
    return coalesce(new, old);
  end if;

  -- L'incremento sotto row-lock è atomico; greatest(0, …) è la cintura contro
  -- ogni sottostima; il picco sale solo con i delta positivi.
  update public.lives l
  set viewer_count = greatest(0, l.viewer_count + v_delta),
      peak_viewers = case when v_delta > 0
                          then greatest(l.peak_viewers, l.viewer_count + v_delta)
                          else l.peak_viewers end
  where l.id = v_live and l.status <> 'ended';

  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_live_viewer_count() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Trigger mirati: il vecchio trigger unico lascia il posto a tre trigger
--    con WHEN (l'update che non tocca left_at/kicked_at non invoca la funzione).
-- -----------------------------------------------------------------------------
drop trigger if exists live_viewers_count_trg on public.live_viewers;

create trigger live_viewers_count_ins_trg
  after insert on public.live_viewers
  for each row
  when (new.left_at is null and new.kicked_at is null)
  execute function public.sync_live_viewer_count();

create trigger live_viewers_count_upd_trg
  after update on public.live_viewers
  for each row
  when (old.left_at is distinct from new.left_at
     or old.kicked_at is distinct from new.kicked_at)
  execute function public.sync_live_viewer_count();

create trigger live_viewers_count_del_trg
  after delete on public.live_viewers
  for each row
  execute function public.sync_live_viewer_count();

-- -----------------------------------------------------------------------------
-- 3. Indice parziale sugli spettatori DENTRO: serve la riconciliazione (v8) e
--    ogni lettura dei presenti attivi di una live.
-- -----------------------------------------------------------------------------
create index live_viewers_active_idx on public.live_viewers (live_id)
  where left_at is null and kicked_at is null;

-- =============================================================================
-- 4. expire_content v8 — corpo v7 VERBATIM + blocco riconciliazione IN CODA.
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
