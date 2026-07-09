-- =============================================================================
-- Televo — M7 · La Mappa della Città (MM2): stanze sulla mappa + snapshot lettura
-- =============================================================================
-- Terza wave della Mappa v2 (docs/map/map.md, Parte II §16 MM2). Costruisce la
-- PORTA DI LETTURA della mappa e mette le Stanze Live come bolle. Contenuti:
--   1. trigger rooms→map_events: quando una stanza LIVE smette di esserlo, i suoi
--      eventi mappa si chiudono (ended_at = now(), Echo a +12h). Via PRIMARIA;
--      la cintura difensiva in expire_content (MM1) resta la rete a 5 minuti.
--   2. map_attach_room / map_detach_room: l'host mette/toglie la propria stanza
--      live dalla mappa (bolla = posizione host, masked-aware; detach = revoca).
--   3. map_snapshot(): l'UNICA porta di lettura. Restituisce {server_now, me,
--      friends[], events[]} con timestamp UTC GREZZI: gli stati Live/Echo/LastSeen
--      li deriva il CLIENT (clock calibrato su server_now).
-- Fuori da MM2 (arrivano dopo): fan-out realtime.send() da attach/detach/end/
-- publish/stop → MM3; gdpr-export v4 → MM4.
--
-- Regole d'oro applicate (CLAUDE.md §6, map.md §1.2):
--  · Lettura SOLO via RPC definer filtrata server-side (can_see_on_map = amici
--    reciproci non bloccati): un estraneo non vede NULLA. Le tabelle mappa NON
--    hanno select policy per il client (invariata da MM0).
--  · Solo timestamptz (UTC): il server restituisce FATTI + timestamp grezzi, mai
--    "stati". La localizzazione ("2h fa") e il decadimento sono client-side.
--  · is_active_user() come cancello di enforcement anche sull'attach (pubblicare
--    una stanza in mappa è creazione di contenuto: mute/ban la bloccano).
--  · Grant: revoke SEMPRE da public+anon+authenticated (i DEFAULT PRIVILEGES del
--    progetto concedono ALL — lezione CM8), poi grant mirato ad authenticated.
--  · PostGIS schema-qualificato (extensions.st_x/st_y, cast ::extensions.geometry)
--    perché tutte le funzioni girano con search_path = ''.

-- =============================================================================
-- 1. Trigger rooms → map_events. Quando una stanza LASCIA lo stato 'live' (→
--    ended o cancelled), i suoi eventi mappa ancora aperti diventano Echo:
--    ended_at = now(), visibility_expires_at = now() + 12h. È la VIA PRIMARIA di
--    chiusura (map.md §5); la cintura difensiva in expire_content (MM1) copre il
--    caso in cui questo trigger, per qualsiasi ragione, non fosse scattato.
--    AFTER UPDATE OF status: tocca un'ALTRA tabella (map_events) → after, non before.
-- =============================================================================
create or replace function public.rooms_map_close_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.map_events
  set ended_at = now(),
      visibility_expires_at = now() + interval '12 hours'
  where room_id = new.id and ended_at is null;
  -- MM3: qui il fan-out realtime.send() 'event_ended' alle inbox degli amici.
  return new;
end;
$$;

create trigger rooms_map_close_events_trg
  after update of status on public.rooms
  for each row
  when (old.status = 'live' and new.status is distinct from 'live')
  execute function public.rooms_map_close_events();

-- =============================================================================
-- 2. map_attach_room(room) — l'host mette in mappa la propria stanza LIVE.
--    Guardie: autenticato · is_active_user() (mute/ban bloccano) · host della
--    stanza · stanza status='live' · sessione di condivisione ATTIVA con una
--    posizione già pubblicata (la bolla usa location/masked/zone_label correnti
--    dell'host → masking-aware, coerente con map.md §5). Title denormalizzato: la
--    bolla/Echo sopravvive alla stanza e alla sua rinomina. Idempotente: l'unique
--    parziale (room_id where ended_at is null) garantisce UNA bolla live per stanza.
-- =============================================================================
create or replace function public.map_attach_room(p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_room public.rooms%rowtype;
  v_pres public.map_presence%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_user(v_uid) then raise exception 'user_not_active'; end if;

  select * into v_room from public.rooms where id = p_room;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_id <> v_uid then raise exception 'not_room_host'; end if;
  if v_room.status <> 'live' then raise exception 'room_not_live'; end if;

  -- La bolla eredita la posizione dell'host: serve una sessione attiva con un fix.
  select * into v_pres from public.map_presence where user_id = v_uid;
  if not found or v_pres.sharing_until <= now() then raise exception 'no_active_session'; end if;
  if v_pres.location is null then raise exception 'no_location'; end if;

  insert into public.map_events (user_id, room_id, event_type, title, location, masked, zone_label)
  values (v_uid, p_room, 'room_live', left(v_room.title, 120),
          v_pres.location, v_pres.masked, v_pres.zone_label)
  on conflict (room_id) where ended_at is null do nothing;
  -- MM3: qui il fan-out realtime.send() 'event_started' alle inbox degli amici.

  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- 3. map_detach_room(room) — l'host toglie la propria stanza dalla mappa. È una
--    REVOCA: DELETE dell'evento ancora live (niente Echo, a differenza della fine
--    naturale). Solo i propri eventi. Idempotente (nessun errore se già staccata).
-- =============================================================================
create or replace function public.map_detach_room(p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  delete from public.map_events
  where room_id = p_room and user_id = v_uid and ended_at is null;
  -- MM3: qui il fan-out realtime.send() 'event_ended' (flag rimozione) agli amici.

  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- 4. map_snapshot() — LA porta di lettura (map.md §13.2). Restituisce jsonb:
--    { server_now, me, friends[], events[] }. Il server NON calcola stati:
--    restituisce timestamp UTC GREZZI + server_now (calibrazione clock lato
--    client). La visibilità è filtrata server-side da can_see_on_map (self ∨
--    amici reciproci non bloccati) → nessun dato di un estraneo esce mai.
--    Scala v1: snapshot completo (≤150 amici), niente bbox — il client fa
--    fit-to-bounds. lat/lng estratti da geography via cast ::geometry + st_x/st_y.
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
  -- Live = ended_at is null; Echo = visibility_expires_at (= ended_at+12h) non scaduto.
  select coalesce(jsonb_agg(ev order by sort_key), '[]'::jsonb) into v_events
  from (
    select jsonb_build_object(
             'id',                    e.id,
             'user_id',               e.user_id,
             'room_id',               e.room_id,
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
-- 5. Grants. La funzione trigger NON è per il client (solo owner/definer): revoke
--    da tutti, nessun grant. Le 3 RPC: revoke da public+anon+authenticated (i
--    DEFAULT PRIVILEGES concedono ALL — CM8), poi grant execute ad authenticated.
-- =============================================================================
revoke all on function public.rooms_map_close_events() from public, anon, authenticated;
revoke all on function public.map_attach_room(uuid)    from public, anon, authenticated;
revoke all on function public.map_detach_room(uuid)    from public, anon, authenticated;
revoke all on function public.map_snapshot()           from public, anon, authenticated;

grant execute on function public.map_attach_room(uuid) to authenticated;
grant execute on function public.map_detach_room(uuid) to authenticated;
grant execute on function public.map_snapshot()        to authenticated;
