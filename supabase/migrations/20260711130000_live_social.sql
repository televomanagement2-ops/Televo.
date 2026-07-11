-- =============================================================================
-- Televo — Live M12 (LM2): feed, fan-out realtime, notifiche, premio Aura
-- =============================================================================
-- Terza wave della Live (docs/live/live.md, Parte II §18 LM2). La Live smette di
-- essere muta: gli amici la scoprono in tempo reale (inbox privata M7), vengono
-- notificati all'avvio (default TUTTI gli amici, decisione PO L-4 "stile
-- TikTok") e l'host viene premiato con Aura `participation` SOLO per live
-- qualificate, a rendimenti decrescenti. Arrivano le due porte di lettura del
-- client: `lives_feed` (striscia + feed verticale Home) e `live_detail`
-- (dettaglio + revalidation 60s).
--
-- Pezzi costruiti qui:
--  · `live_fanout` — specchio di `map_fanout` sull'inbox privata `map:u:{uid}`
--    (il prefisso è storico: è l'inbox per-utente del progetto, live.md §0.4).
--    Destinatari = UNIONE degli amici degli host ATTIVI (L-3), dedup, filtrata
--    da `can_see_live`: visibilità top_friends, coppie bloccate, kickati e
--    rimossi sono esclusi dall'UNICO predicato del dominio — al momento
--    dell'invio, come il grafo (revoca = stop broadcast per costruzione).
--  · RPC v2 = corpo LM0 VERBATIM + blocchi marcati "-- LM2:" (pattern staged
--    MM3): create_live (notifiche set-based + fan-out live_started + attach
--    mappa BEST-EFFORT: senza sessione/posizione NON fallisce, map_attached
--    dice la verità al client) · pause/resume (fan-out live_status) · end
--    (fan-out live_ended) · live_invite_cohost (notifica live_cohost_invite,
--    assegnata a LM2 sin dall'header di live_enums).
--  · Trigger premio Aura su `ended` (via unica: copre anche i force-end di
--    LM3/LM4): live QUALIFICATA = durata ≥5 min E ≥1 spettatore reale (righe
--    live_viewers, QA-4) → emit_aura('participation', round(1.0/n,3)) con
--    n = live qualificate dell'host chiuse oggi — formula identica ai drop:
--    premia la qualità, non il volume. Live vuote da 10 secondi = zero.
--  · `lives_feed()` / `live_detail(p_live)` — lettura via RPC, mai query
--    libere: l'ordinamento usa i contatori SENZA esporli (anti-vanity R-04:
--    viewer_count/peak_viewers li vede SOLO l'host, in live_detail).
--
-- Regole d'oro applicate (CLAUDE.md §6, live.md §1.2):
--  · Nessuna notifica/fan-out fuori dal perimetro di `can_see_live`: con
--    visibility='top_friends' anche notify_mode='all' notifica SOLO la cerchia
--    (conflitto risolto verso il MENO aperto, vincolo del master plan).
--  · UNA notifica per live (mai su pausa/ripresa), guardia anti-spam 10 minuti
--    per host (pattern dedup dei commenti drop); MAI notifiche per commenti,
--    spettatori o fine live (§9).
--  · Guardare NON dà Aura (watch-time = anti-pilastro): premiato solo l'host.
--  · Il fan-out è best-effort (realtime.send degrada a WARNING): lo SNAPSHOT
--    (`lives_feed`) resta la verità, gli eventi inbox sono delta (M7 §13.3).
--  · Grant: revoke SEMPRE da public+anon+authenticated (DEFAULT PRIVILEGES
--    dell'hosted, lezione CM8), poi grant mirato; gli helper interni e le
--    funzioni trigger restano senza grant.

-- =============================================================================
-- 1. live_fanout(live, event, payload) — l'UNICO punto di fan-out del dominio.
--    Eventi: live_started {live_id, host{…}, title, visibility, status,
--    started_at} · live_status {live_id, status} · live_ended {live_id}.
--    Gli host attivi non ricevono (sono già nella stanza: il loro stato arriva
--    da LiveKit e dalle risposte RPC). Helper interno, non è per il client.
-- =============================================================================
create or replace function public.live_fanout(p_live uuid, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(p_payload, p_event, 'map:u:' || r.uid::text, true)
  from (
    select distinct case when f.user_id = h.user_id then f.friend_id else f.user_id end as uid
    from public.live_hosts h
    join public.friendships f
      on f.status = 'accepted'
     and (f.user_id = h.user_id or f.friend_id = h.user_id)
    where h.live_id = p_live and h.status = 'active'
  ) r
  where not exists (
      select 1 from public.live_hosts h2
      where h2.live_id = p_live and h2.user_id = r.uid and h2.status = 'active'
    )
    and public.can_see_live(p_live, r.uid);
end;
$$;

-- =============================================================================
-- 2. create_live v2 — corpo LM0 VERBATIM + blocchi LM2: notifiche set-based
--    secondo notify_mode (dedup 10 min per host), fan-out live_started, attach
--    mappa best-effort. Il contratto {live_id, livekit_room_name, map_attached}
--    resta identico: map_attached diventa reale.
-- =============================================================================
create or replace function public.create_live(
  p_title            text,
  p_visibility       public.live_visibility  default 'all_friends',
  p_comments_enabled boolean                 default true,
  p_show_on_map      boolean                 default false,
  p_notify_mode      public.live_notify_mode default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_live  public.lives%rowtype;
  -- LM2: identità host (notifiche + payload fan-out) e verità dell'attach mappa.
  v_prof         public.profiles%rowtype;
  v_map_attached boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_user(v_uid) then raise exception 'user_not_active'; end if;
  if v_title is null or char_length(v_title) > 80 then raise exception 'invalid_title'; end if;
  if exists (select 1 from public.lives l where l.host_id = v_uid and l.ended_at is null) then
    raise exception 'live_already_active';
  end if;

  begin
    insert into public.lives (host_id, title, visibility, comments_enabled, show_on_map, notify_mode)
    values (v_uid, v_title,
            coalesce(p_visibility, 'all_friends'),
            coalesce(p_comments_enabled, true),
            coalesce(p_show_on_map, false),
            coalesce(p_notify_mode, 'all'))
    returning * into v_live;
  exception when unique_violation then
    -- corsa sull'unique parziale host attivo: stesso errore del pre-check
    raise exception 'live_already_active';
  end;

  insert into public.live_hosts (live_id, user_id, role, status, joined_at)
  values (v_live.id, v_uid, 'host', 'active', now());

  -- LM2: notifiche live_started set-based (§9). Destinatari secondo notify_mode
  -- (all = amici accettati; top_friends = cerchia 1–8), SEMPRE intersecati con
  -- can_see_live (mai notificare chi non può vedere la live). Dedup: niente
  -- nuova notifica se il destinatario ne ha una non letta dello stesso host da
  -- <10 minuti (l'host che avvia/chiude ripetutamente non fa rumore).
  select * into v_prof from public.profiles where id = v_uid;
  if v_live.notify_mode <> 'none' then
    insert into public.notifications (user_id, type, title, body, payload)
    select r.uid, 'live_started',
           coalesce(v_prof.display_name, v_prof.username::text, 'Un amico') || ' è in diretta',
           v_live.title,
           jsonb_build_object('live_id', v_live.id, 'host_id', v_uid)
    from (
      select case when f.user_id = v_uid then f.friend_id else f.user_id end as uid
      from public.friendships f
      where f.status = 'accepted' and (f.user_id = v_uid or f.friend_id = v_uid)
    ) r
    join public.profiles pr on pr.id = r.uid and pr.deleted_at is null
    where (v_live.notify_mode = 'all'
           or exists (select 1 from public.top_friends t
                      where t.user_id = v_uid and t.friend_id = r.uid))
      and public.can_see_live(v_live.id, r.uid)
      and not exists (
        select 1 from public.notifications n
        where n.user_id = r.uid
          and n.type = 'live_started'
          and n.read_at is null
          and n.payload ->> 'host_id' = v_uid::text
          and n.created_at > now() - interval '10 minutes');
  end if;

  -- LM2: fan-out live_started sull'inbox privata degli amici (delta realtime;
  -- lo snapshot lives_feed resta la verità a mount/foreground).
  perform public.live_fanout(v_live.id, 'live_started', jsonb_build_object(
    'live_id',    v_live.id,
    'title',      v_live.title,
    'visibility', v_live.visibility,
    'status',     'live',
    'started_at', v_live.started_at,
    'host',       jsonb_build_object(
      'user_id',      v_uid,
      'username',     v_prof.username,
      'display_name', v_prof.display_name,
      'avatar_url',   v_prof.avatar_url,
      'aura_score',   v_prof.aura_score,
      'aura_color',   v_prof.aura_color)));

  -- LM2: attach mappa BEST-EFFORT (§12.12): senza sessione posizione attiva o
  -- fix pubblicato l'avvio NON fallisce — map_attached=false e il client
  -- mostra l'hint ("attiva la posizione per apparire sulla mappa").
  if v_live.show_on_map then
    begin
      perform public.map_attach_live(v_live.id);
      v_map_attached := true;
    exception when others then
      v_map_attached := false;
    end;
  end if;

  return jsonb_build_object(
    'live_id',           v_live.id,
    'livekit_room_name', v_live.livekit_room_name,
    'map_attached',      v_map_attached
  );
end;
$$;

-- =============================================================================
-- 3. pause_live / resume_live v2 — corpo LM0 VERBATIM + fan-out live_status.
--    NESSUNA nuova notifica (§2): la pausa è un delta di stato, non un evento.
-- =============================================================================
create or replace function public.pause_live(p_live uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_live public.lives%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_live from public.lives where id = p_live for update;
  if not found then raise exception 'live_not_found'; end if;
  if v_live.host_id <> v_uid then raise exception 'not_live_host'; end if;
  if v_live.status = 'ended' then raise exception 'live_already_ended'; end if;
  if v_live.status <> 'live' then raise exception 'invalid_transition'; end if;

  update public.lives set status = 'paused' where id = p_live;

  -- LM2: delta realtime agli amici (l'evento mappa RESTA aperto, spec §2/§8).
  perform public.live_fanout(p_live, 'live_status',
    jsonb_build_object('live_id', p_live, 'status', 'paused'));

  return jsonb_build_object('ok', true, 'status', 'paused');
end;
$$;

create or replace function public.resume_live(p_live uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_live public.lives%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_live from public.lives where id = p_live for update;
  if not found then raise exception 'live_not_found'; end if;
  if v_live.host_id <> v_uid then raise exception 'not_live_host'; end if;
  if v_live.status = 'ended' then raise exception 'live_already_ended'; end if;
  if v_live.status <> 'paused' then raise exception 'invalid_transition'; end if;

  update public.lives set status = 'live' where id = p_live;

  -- LM2: delta realtime agli amici (mai una nuova notifica su ripresa, §9).
  perform public.live_fanout(p_live, 'live_status',
    jsonb_build_object('live_id', p_live, 'status', 'live'));

  return jsonb_build_object('ok', true, 'status', 'live');
end;
$$;

-- =============================================================================
-- 4. end_live v2 — corpo LM0 VERBATIM + fan-out live_ended. Il trigger di stato
--    chiude l'evento mappa (Echo +3h, LM1) e il trigger Aura (qui sotto) premia
--    se qualificata. I force-end non-RPC (cron LM3, webhook LM4, GDPR) NON
--    passano di qui: per loro vale snapshot-as-truth (riconciliazione a
--    mount/foreground + revalidation 60s), scelta consapevole del piano.
-- =============================================================================
create or replace function public.end_live(p_live uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_live public.lives%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_live from public.lives where id = p_live for update;
  if not found then raise exception 'live_not_found'; end if;
  if v_live.host_id <> v_uid then raise exception 'not_live_host'; end if;
  if v_live.status = 'ended' then raise exception 'live_already_ended'; end if;

  update public.lives set status = 'ended' where id = p_live;

  -- LM2: delta realtime agli amici — la live sparisce da striscia e feed.
  perform public.live_fanout(p_live, 'live_ended',
    jsonb_build_object('live_id', p_live));

  return jsonb_build_object('ok', true, 'status', 'ended');
end;
$$;

-- =============================================================================
-- 5. live_invite_cohost v2 — corpo LM0 VERBATIM + notifica live_cohost_invite
--    al singolo invitato (§9), SOLO su invito reale (mai sui ritorni
--    idempotenti: lo stato 'invited' già presente non ri-notifica).
-- =============================================================================
create or replace function public.live_invite_cohost(p_live uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_live public.lives%rowtype;
  v_row  public.live_hosts%rowtype;
  -- LM2: nome dell'host per il testo della notifica.
  v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_user is null or p_user = v_uid then raise exception 'invalid_target'; end if;
  if not public.is_active_user(v_uid) then raise exception 'user_not_active'; end if;

  select * into v_live from public.lives where id = p_live for update;
  if not found then raise exception 'live_not_found'; end if;
  if v_live.host_id <> v_uid then raise exception 'not_live_host'; end if;
  if v_live.status = 'ended' then raise exception 'live_already_ended'; end if;

  if not public.is_active_user(p_user) then raise exception 'target_not_active'; end if;
  if not public.are_friends(v_uid, p_user) then raise exception 'not_friends'; end if;

  select * into v_row from public.live_hosts
  where live_id = p_live and user_id = p_user for update;

  if found then
    if v_row.status = 'active' then
      return jsonb_build_object('ok', true, 'status', 'active');
    elsif v_row.status = 'invited' then
      return jsonb_build_object('ok', true, 'status', 'invited');
    elsif v_row.status = 'removed' then
      raise exception 'cohost_removed';
    end if;
    -- 'left': re-invito (il tetto va riverificato, la riga era fuori conteggio)
    if (select count(*) from public.live_hosts h
        where h.live_id = p_live and h.status in ('invited', 'active')) >= 4 then
      raise exception 'cohost_cap_reached';
    end if;
    update public.live_hosts
    set status = 'invited', invited_at = now(), joined_at = null, left_at = null
    where live_id = p_live and user_id = p_user;

    -- LM2: notifica del re-invito (pipeline esistente enqueue → dispatch → push).
    select coalesce(display_name, username::text) into v_name
    from public.profiles where id = v_uid;
    perform public.enqueue_notification(
      p_user, 'live_cohost_invite',
      coalesce(v_name, 'Un amico') || ' ti ha invitato nella sua live', null,
      jsonb_build_object('live_id', p_live, 'host_id', v_uid));

    return jsonb_build_object('ok', true, 'status', 'invited');
  end if;

  if (select count(*) from public.live_hosts h
      where h.live_id = p_live and h.status in ('invited', 'active')) >= 4 then
    raise exception 'cohost_cap_reached';
  end if;

  insert into public.live_hosts (live_id, user_id, role, status)
  values (p_live, p_user, 'cohost', 'invited');

  -- LM2: notifica dell'invito al solo invitato (§9).
  select coalesce(display_name, username::text) into v_name
  from public.profiles where id = v_uid;
  perform public.enqueue_notification(
    p_user, 'live_cohost_invite',
    coalesce(v_name, 'Un amico') || ' ti ha invitato nella sua live', null,
    jsonb_build_object('live_id', p_live, 'host_id', v_uid));

  return jsonb_build_object('ok', true, 'status', 'invited');
end;
$$;

-- =============================================================================
-- 6. Trigger premio Aura — after update su status='ended' (via UNICA: copre
--    end_live, i force-end cron/webhook e la deletion GDPR — emit_aura salta
--    da sé gli utenti cancellati). Live QUALIFICATA (§10, QA-4): durata ≥5
--    minuti E ≥1 spettatore reale distinto (righe live_viewers: il mint del
--    token è il join). Premio 'participation' a rendimenti decrescenti
--    round(1.0/n, 3), n = live qualificate dell'host chiuse oggi (conteggio
--    sul ledger: 1 evento aura = 1 live qualificata) — identico ai drop.
-- =============================================================================
create or replace function public.lives_award_participation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if new.ended_at - new.started_at < interval '5 minutes' then return new; end if;
  if not exists (select 1 from public.live_viewers v where v.live_id = new.id) then
    return new;
  end if;

  select count(*) + 1 into v_n
  from public.aura_events e
  where e.user_id = new.host_id
    and e.type = 'participation'
    and e.source_type = 'live'
    and e.created_at >= current_date;

  perform public.emit_aura(new.host_id, 'participation',
                           round((1.0 / v_n)::numeric, 3), 'live', new.id);
  return new;
end;
$$;

create trigger lives_award_participation_trg
  after update of status on public.lives
  for each row
  when (new.status = 'ended' and old.status is distinct from 'ended')
  execute function public.lives_award_participation();

-- =============================================================================
-- 7. lives_feed() — LA porta di lettura della Home (striscia + feed verticale).
--    Live attive (live/paused) visibili al chiamante via can_see_live, con
--    identità dell'host; la PROPRIA live (host o co-host attivo) è esclusa:
--    il feed è "amici in live" (§7, L-1). Ordinamento server-side: prima i
--    Top Friends del viewer, poi spettatori reali e Aura dell'host — i
--    contatori ordinano SENZA essere esposti (anti-vanity R-04). Scala ≤150
--    amici: niente paginazione in v1. server_now per il clock calibrato (M7 §8).
-- =============================================================================
create or replace function public.lives_feed()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_lives jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select coalesce(jsonb_agg(x.item
           order by x.is_top desc, x.vc desc, x.aura desc nulls last, x.started_at desc),
         '[]'::jsonb)
  into v_lives
  from (
    select jsonb_build_object(
             'live_id',          l.id,
             'title',            l.title,
             'status',           l.status,
             'visibility',       l.visibility,
             'comments_enabled', l.comments_enabled,
             'started_at',       l.started_at,
             'paused_at',        l.paused_at,
             'is_top_friend',    exists (select 1 from public.top_friends t
                                         where t.user_id = v_uid and t.friend_id = l.host_id),
             'host', jsonb_build_object(
               'user_id',      p.id,
               'username',     p.username,
               'display_name', p.display_name,
               'avatar_url',   p.avatar_url,
               'aura_score',   p.aura_score,
               'aura_color',   p.aura_color)
           ) as item,
           exists (select 1 from public.top_friends t
                   where t.user_id = v_uid and t.friend_id = l.host_id) as is_top,
           l.viewer_count as vc,
           p.aura_score   as aura,
           l.started_at
    from public.lives l
    join public.profiles p on p.id = l.host_id
    where l.ended_at is null
      and p.deleted_at is null
      and not exists (select 1 from public.live_hosts h
                      where h.live_id = l.id and h.user_id = v_uid and h.status = 'active')
      and public.can_see_live(l.id, v_uid)
  ) x;

  return jsonb_build_object('server_now', now(), 'lives', v_lives);
end;
$$;

-- =============================================================================
-- 8. live_detail(p_live) — dettaglio + revalidation (§5: il client la richiama
--    ogni ~60s; su not_visible/ended si disconnette — copre blocco/rimozione
--    amicizia e kick a metà live). Host ATTIVI con identità (UI multi-video),
--    flag del chiamante, e i contatori SOLO all'host principale (anti-vanity).
-- =============================================================================
create or replace function public.live_detail(p_live uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_live      public.lives%rowtype;
  v_is_host   boolean;
  v_is_cohost boolean;
  v_out       jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_live from public.lives where id = p_live;
  if not found then raise exception 'live_not_found'; end if;
  if not public.can_see_live(p_live, v_uid) then raise exception 'not_visible'; end if;

  v_is_host   := v_live.host_id = v_uid;
  v_is_cohost := exists (select 1 from public.live_hosts h
                         where h.live_id = p_live and h.user_id = v_uid
                           and h.role = 'cohost' and h.status = 'active');

  v_out := jsonb_build_object(
    'server_now', now(),
    'live', jsonb_build_object(
      'live_id',          v_live.id,
      'title',            v_live.title,
      'status',           v_live.status,
      'visibility',       v_live.visibility,
      'comments_enabled', v_live.comments_enabled,
      'show_on_map',      v_live.show_on_map,
      'started_at',       v_live.started_at,
      'paused_at',        v_live.paused_at,
      'ended_at',         v_live.ended_at),
    'hosts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id',      p.id,
               'username',     p.username,
               'display_name', p.display_name,
               'avatar_url',   p.avatar_url,
               'aura_color',   p.aura_color,
               'role',         h.role,
               'joined_at',    h.joined_at)
             order by (h.role = 'host') desc, h.joined_at)
      from public.live_hosts h
      join public.profiles p on p.id = h.user_id
      where h.live_id = p_live and h.status = 'active' and p.deleted_at is null),
      '[]'::jsonb),
    'me', jsonb_build_object(
      'is_host',     v_is_host,
      'is_cohost',   v_is_cohost,
      'can_comment', (v_live.status = 'live'
                      and v_live.comments_enabled
                      and public.is_active_user(v_uid))));

  -- I contatori restano PRIVATI: solo l'host principale li riceve.
  if v_is_host then
    v_out := v_out || jsonb_build_object(
      'viewer_count', v_live.viewer_count,
      'peak_viewers', v_live.peak_viewers);
  end if;

  return v_out;
end;
$$;

-- =============================================================================
-- 9. Grants. live_fanout e la funzione trigger sono interne (revoke totale,
--    nessun grant). Le RPC ridefinite conservano gli ACL di LM0 (create or
--    replace non li resetta). Le due porte di lettura: revoke da public+anon+
--    authenticated, poi grant execute ad authenticated.
-- =============================================================================
revoke all on function public.live_fanout(uuid, text, jsonb)     from public, anon, authenticated;
revoke all on function public.lives_award_participation()        from public, anon, authenticated;
revoke all on function public.lives_feed()                       from public, anon, authenticated;
revoke all on function public.live_detail(uuid)                  from public, anon, authenticated;

grant execute on function public.lives_feed()       to authenticated;
grant execute on function public.live_detail(uuid)  to authenticated;
