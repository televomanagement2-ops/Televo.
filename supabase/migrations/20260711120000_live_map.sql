-- =============================================================================
-- Televo — Live M12 (LM1): la Live sulla Mappa della Città (badge LIVE)
-- =============================================================================
-- Seconda wave della Live (docs/live/live.md, Parte II §18 LM1). La mappa M7 si
-- estende — NON si duplica: riuso integrale di map_events con il valore enum
-- 'live_broadcast' (aggiunto in live_enums) + una colonna live_id. Le RPC e il
-- trigger sono lo SPECCHIO delle versioni room (map_attach_room/map_detach_room/
-- rooms_map_close_events, MM2+MM3), con le differenze volute dalla spec:
--   · Echo del badge live = 3 ORE da ended_at (vs 12h delle stanze, live.md §8);
--   · il badge appartiene all'HOST PRINCIPALE di una live in stato 'live'
--     (non a co-host o spettatori, spec §4/§8);
--   · in 'paused' il badge RESTA pieno: il trigger di chiusura scatta SOLO al
--     passaggio a 'ended' (spec §2/§8).
-- map_snapshot è ridefinita verbatim+add (espone live_id negli events: il
-- client naviga a /live/[id] da "Guarda la live", LM8).
--
-- Regole d'oro applicate (CLAUDE.md §6, live.md §1.2):
--  · Nessuna posizione nuova: la bolla eredita location/masked/zone_label
--    CORRENTI dell'host (masking Safe Zone incluso — masked-aware come le
--    stanze). Serve una sessione M7 attiva con un fix: senza, l'attach fallisce
--    (create_live v2 in LM2 lo renderà best-effort, qui l'errore è esplicito).
--  · Opt-in esplicito: nulla scatta da solo — l'attach è una RPC chiamata su
--    scelta dell'utente (show_on_map, default false).
--  · Revoca istantanea: detach = DELETE fisico (niente Echo); map_stop_sharing
--    e il kill-switch share_location cancellano GIÀ tutti i map_events
--    dell'utente (incluse le bolle live) — nessuna modifica necessaria.
--  · is_active_user() sull'attach (pubblicare la propria live in mappa è
--    creazione di contenuto: mute/ban la bloccano).
--  · Fan-out best-effort sui payload già parsati dal client M7 (event_started /
--    event_ended con removed), arricchiti con live_id; room_id esplicitamente
--    null per coerenza di forma.
--  · PostGIS schema-qualificato (extensions.st_x/st_y, cast
--    ::extensions.geometry): tutte le funzioni girano con search_path = ''.

-- =============================================================================
-- 1. map_events.live_id — il collegamento alla live. on delete set null: se la
--    riga lives viene purgata (LM3, 30 giorni), l'eventuale Echo residuo resta
--    coerente senza join. Unique parziale: UNA sola bolla live per broadcast.
--    Check: una riga referenzia UN solo dominio (room XOR live, entrambi null
--    ammesso per tipi futuri) — chiude il rischio annotato nel piano LM1.
-- =============================================================================
alter table public.map_events
  add column live_id uuid references public.lives (id) on delete set null;

create unique index map_events_live_broadcast_uidx
  on public.map_events (live_id) where ended_at is null;

alter table public.map_events
  add constraint map_events_single_source_chk
  check (room_id is null or live_id is null);

-- =============================================================================
-- 2. map_attach_live(live) — l'host principale mette la propria live sulla
--    mappa. Specchio di map_attach_room (MM3): stesse guardie, stesso fan-out
--    'event_started' SOLO su inserimento reale (l'idempotenza on conflict non
--    ri-broadcasta). Guardie: autenticato · is_active_user · host principale ·
--    stato 'live' (da 'paused' non si attacca: il badge si mette in diretta) ·
--    sessione M7 attiva con posizione pubblicata (masked-aware).
-- =============================================================================
create or replace function public.map_attach_live(p_live uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_live     public.lives%rowtype;
  v_pres     public.map_presence%rowtype;
  v_event_id uuid;
  v_started  timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_user(v_uid) then raise exception 'user_not_active'; end if;

  select * into v_live from public.lives where id = p_live;
  if not found then raise exception 'live_not_found'; end if;
  if v_live.host_id <> v_uid then raise exception 'not_live_host'; end if;
  if v_live.status = 'ended' then raise exception 'live_already_ended'; end if;
  if v_live.status <> 'live' then raise exception 'live_not_active'; end if;

  -- La bolla eredita la posizione dell'host: serve una sessione attiva con un fix.
  select * into v_pres from public.map_presence where user_id = v_uid;
  if not found or v_pres.sharing_until <= now() then raise exception 'no_active_session'; end if;
  if v_pres.location is null then raise exception 'no_location'; end if;

  insert into public.map_events (user_id, live_id, event_type, title, location, masked, zone_label)
  values (v_uid, p_live, 'live_broadcast', left(v_live.title, 120),
          v_pres.location, v_pres.masked, v_pres.zone_label)
  on conflict (live_id) where ended_at is null do nothing
  returning id, started_at into v_event_id, v_started;

  -- Fan-out 'event_started' solo su inserimento reale (non su re-attach idempotente).
  if v_event_id is not null then
    perform public.map_fanout(v_uid, 'event_started', jsonb_build_object(
      'id',         v_event_id,
      'user_id',    v_uid,
      'room_id',    null,
      'live_id',    p_live,
      'event_type', 'live_broadcast',
      'title',      left(v_live.title, 120),
      'lat',        extensions.st_y(v_pres.location::extensions.geometry),
      'lng',        extensions.st_x(v_pres.location::extensions.geometry),
      'masked',     v_pres.masked,
      'zone_label', v_pres.zone_label,
      'started_at', v_started));
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- 3. map_detach_live(live) — revoca: DELETE dell'evento ancora aperto (niente
--    Echo, a differenza della fine naturale) + fan-out 'event_ended'
--    removed=true. Solo i propri eventi; idempotente. La live NON si tocca:
--    mappa e live sono ortogonali (spec §8).
-- =============================================================================
create or replace function public.map_detach_live(p_live uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_event_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  delete from public.map_events
  where live_id = p_live and user_id = v_uid and ended_at is null
  returning id into v_event_id;

  if v_event_id is not null then
    perform public.map_fanout(v_uid, 'event_ended', jsonb_build_object(
      'id', v_event_id, 'user_id', v_uid, 'room_id', null, 'live_id', p_live,
      'removed', true));
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- 4. Trigger lives → map_events (via PRIMARIA di chiusura, specchio di
--    rooms_map_close_events). SOLO al passaggio a 'ended': l'evento diventa
--    Echo con visibility_expires_at = now() + 3 ORE (spec §8: decadimento breve,
--    la live è presenza, non un luogo) + fan-out 'event_ended' removed=false.
--    live↔paused NON scatta: il badge resta pieno in pausa (spec §2).
--    La cintura difensiva a 5 minuti arriva in expire_content v7 (LM3).
-- =============================================================================
create or replace function public.lives_map_close_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_row record;
begin
  for v_row in
    with u as (
      update public.map_events
      set ended_at = now(), visibility_expires_at = now() + interval '3 hours'
      where live_id = new.id and ended_at is null
      returning id, user_id, live_id, ended_at, visibility_expires_at
    )
    select id, user_id, live_id, ended_at, visibility_expires_at from u
  loop
    perform public.map_fanout(v_row.user_id, 'event_ended', jsonb_build_object(
      'id',                    v_row.id,
      'user_id',               v_row.user_id,
      'room_id',               null,
      'live_id',               v_row.live_id,
      'ended_at',              v_row.ended_at,
      'visibility_expires_at', v_row.visibility_expires_at,
      'removed',               false));
  end loop;
  return new;
end;
$$;

create trigger lives_map_close_events_trg
  after update of status on public.lives
  for each row
  when (new.status = 'ended' and old.status is distinct from 'ended')
  execute function public.lives_map_close_events();

-- =============================================================================
-- 5. map_snapshot v2 — corpo MM2 VERBATIM + live_id negli events (il client
--    apre /live/[id] da "Guarda la live", LM8; per il resto la forma resta
--    identica: il client M7 esistente ignora i campi che non conosce).
-- =============================================================================
create or replace function public.map_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_me      jsonb;
  v_friends jsonb;
  v_events  jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- me: stato della propria sessione (o solo user_id se non ho mai condiviso).
  select jsonb_build_object(
    'user_id',               v_uid,
    'sharing_until',         p.sharing_until,
    'updated_at',            p.updated_at,
    'visibility_expires_at', p.visibility_expires_at,
    'masked',                p.masked,
    'zone_label',            p.zone_label,
    'lat', case when p.location is null then null
                else extensions.st_y(p.location::extensions.geometry) end,
    'lng', case when p.location is null then null
                else extensions.st_x(p.location::extensions.geometry) end
  )
  into v_me
  from public.map_presence p
  where p.user_id = v_uid;

  if v_me is null then
    v_me := jsonb_build_object('user_id', v_uid, 'sharing_until', null);
  end if;

  -- me.zones: le proprie Safe Zone (visibili solo a sé; l'amico ne vede solo la
  -- maschera "In zona · label"). Presenti anche senza sessione attiva.
  v_me := v_me || jsonb_build_object('zones', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', z.id, 'label', z.label, 'radius_m', z.radius_m,
             'lat', extensions.st_y(z.center::extensions.geometry),
             'lng', extensions.st_x(z.center::extensions.geometry)
           ) order by z.created_at)
    from public.map_safe_zones z where z.user_id = v_uid
  ), '[]'::jsonb));

  -- friends: amici visibili con presenza VIVA e una posizione pubblicata. Filtri
  -- (map.md §13.2): can_see_on_map, profilo non cancellato, TTL non scaduto. Gli
  -- stati Live/Last Seen li deriva il client dai timestamp (updated_at, sharing_until).
  select coalesce(jsonb_agg(f order by sort_key), '[]'::jsonb) into v_friends
  from (
    select jsonb_build_object(
             'user_id',               pr.id,
             'username',              pr.username,
             'display_name',          pr.display_name,
             'avatar_url',            pr.avatar_url,
             'aura_score',            pr.aura_score,
             'aura_color',            pr.aura_color,
             'lat',                   extensions.st_y(mp.location::extensions.geometry),
             'lng',                   extensions.st_x(mp.location::extensions.geometry),
             'masked',                mp.masked,
             'zone_label',            mp.zone_label,
             'updated_at',            mp.updated_at,
             'sharing_until',         mp.sharing_until,
             'visibility_expires_at', mp.visibility_expires_at
           ) as f,
           pr.username as sort_key
    from public.map_presence mp
    join public.profiles pr on pr.id = mp.user_id
    where mp.user_id <> v_uid
      and mp.location is not null
      and pr.deleted_at is null
      and mp.visibility_expires_at is not null
      and mp.visibility_expires_at > now()
      and public.can_see_on_map(mp.user_id, v_uid)
  ) s;

  -- events: bolle Live + Echo degli amici (e mie: can_see_on_map è vera su di sé).
  -- Live = ended_at is null; Echo = visibility_expires_at (= ended_at+TTL) non scaduto.
  select coalesce(jsonb_agg(ev order by sort_key), '[]'::jsonb) into v_events
  from (
    select jsonb_build_object(
             'id',                    e.id,
             'user_id',               e.user_id,
             'room_id',               e.room_id,
             'live_id',               e.live_id,
             'event_type',            e.event_type,
             'title',                 e.title,
             'lat',                   extensions.st_y(e.location::extensions.geometry),
             'lng',                   extensions.st_x(e.location::extensions.geometry),
             'masked',                e.masked,
             'zone_label',            e.zone_label,
             'started_at',            e.started_at,
             'ended_at',              e.ended_at,
             'visibility_expires_at', e.visibility_expires_at
           ) as ev,
           e.started_at as sort_key
    from public.map_events e
    join public.profiles pr on pr.id = e.user_id
    where pr.deleted_at is null
      and (e.ended_at is null
           or (e.visibility_expires_at is not null and e.visibility_expires_at > now()))
      and public.can_see_on_map(e.user_id, v_uid)
  ) s2;

  return jsonb_build_object(
    'server_now', now(),
    'me',         v_me,
    'friends',    v_friends,
    'events',     v_events
  );
end;
$$;

-- =============================================================================
-- 6. Grants. La funzione trigger NON è per il client (revoke totale). Le 2 RPC:
--    revoke da public+anon+authenticated (i DEFAULT PRIVILEGES concedono ALL —
--    lezione CM8), poi grant execute ad authenticated. map_snapshot mantiene
--    l'ACL esistente (create or replace non la resetta).
-- =============================================================================
revoke all on function public.map_attach_live(uuid)     from public, anon, authenticated;
revoke all on function public.map_detach_live(uuid)     from public, anon, authenticated;
revoke all on function public.lives_map_close_events()  from public, anon, authenticated;

grant execute on function public.map_attach_live(uuid) to authenticated;
grant execute on function public.map_detach_live(uuid) to authenticated;
