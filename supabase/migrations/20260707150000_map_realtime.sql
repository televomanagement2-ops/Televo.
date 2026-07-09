-- =============================================================================
-- Televo — M7 · La Mappa della Città (MM3): realtime inbox + fan-out server-side
-- =============================================================================
-- Quarta wave della Mappa v2 (docs/map/map.md, Parte II §16 MM3). La mappa smette
-- di essere solo "snapshot a richiesta": gli amici ricevono i DELTA di posizione/
-- eventi in tempo reale, senza polling. Modello "inbox" (map.md §13.3): UNA inbox
-- privata per utente, topic `map:u:{user_id}`. Chi pubblica fa fan-out SERVER-SIDE
-- alle inbox dei propri amici via realtime.send() (broadcast-from-database) dentro
-- RPC/trigger → il grafo di amicizia è letto AL MOMENTO dell'invio, quindi revoca
-- amicizia = stop broadcast per costruzione. Il client sottoscrive UN solo canale
-- (privato) mentre la mappa è montata.
--
-- Verificato PRIMA di scrivere (rischio §18.3, "realtime.send mai usato nel
-- progetto"): sul remoto esistono realtime.send(payload,event,topic,private) e
-- realtime.topic(); realtime.messages ha RLS attiva SENZA policy; il ruolo
-- `postgres` (owner delle nostre funzioni definer) è BYPASSRLS e membro di
-- supabase_realtime_admin → può INSERIRE in realtime.messages (fan-out) e creare
-- policy sulla tabella; `authenticated` ha già GRANT SELECT su realtime.messages
-- (quindi la policy di ricezione fa effetto). realtime.send auto-cattura gli errori
-- come WARNING → un fan-out fallito NON rompe mai l'azione utente (la posizione è
-- best-effort, lo SNAPSHOT resta la verità: map.md §13.3).
--
-- Regole d'oro applicate (CLAUDE.md §6, map.md §1.2):
--  · Solo il proprietario dell'inbox la può sottoscrivere: policy su
--    realtime.messages che lega realtime.topic() a `map:u:{auth.uid()}`. Nessuno
--    legge l'inbox altrui; le tabelle mappa restano NON leggibili dal client.
--  · Coppie bloccate/non-amici escluse dal fan-out (si enumerano SOLO le amicizie
--    'accepted', simmetriche): un estraneo non riceve NULLA, come nello snapshot.
--  · Payload minimo (map.md §13.3): fatti + timestamp UTC GREZZI; gli stati
--    Live/Echo/Last Seen li deriva il CLIENT (clock calibrato su server_now).
--  · Grant: map_fanout è un helper interno (solo definer) → revoke da public+anon+
--    authenticated, nessun grant (i DEFAULT PRIVILEGES concedono ALL — lezione CM8).
--  · PostGIS schema-qualificato (extensions.st_x/st_y/st_distance, cast
--    ::extensions.geometry) perché tutte le funzioni girano con search_path = ''.

-- =============================================================================
-- 1. Policy di RICEZIONE sull'inbox privata (realtime.messages).
--    Quando un client sottoscrive un canale PRIVATO, Realtime autorizza la
--    ricezione valutando questa SELECT policy col GUC `realtime.topic` impostato
--    al topic del canale e col JWT dell'utente (auth.uid()). Un utente può leggere
--    SOLO il proprio topic `map:u:{suo_uid}`. In una query normale realtime.topic()
--    è null → nessuna riga visibile: la tabella resta inaccessibile al client, la
--    policy autorizza esclusivamente la sottoscrizione realtime della propria inbox.
--    NESSUNA policy di INSERT per authenticated: il client NON può inviare broadcast
--    su questi topic (il fan-out è solo server-side, via postgres BYPASSRLS). I
--    canali non-privati esistenti (typing chat) non toccano questa RLS.
-- =============================================================================
create policy map_inbox_select_own
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) = 'map:u:' || (select auth.uid())::text
  );

-- =============================================================================
-- 2. map_fanout(owner, event, payload) — l'UNICO punto di fan-out. Invia il
--    payload all'inbox `map:u:{amico}` di OGNI amico reciproco accettato di owner,
--    leggendo il grafo AL MOMENTO dell'invio (revoca amicizia/blocco = niente
--    broadcast, per costruzione: le righe 'blocked' non sono 'accepted'). Helper
--    interno: gira come postgres (definer) → realtime.send bypassa la RLS di
--    realtime.messages e la scrittura va a buon fine. Non è per il client.
-- =============================================================================
create or replace function public.map_fanout(p_owner uuid, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
            p_payload,
            p_event,
            'map:u:' || (case when f.user_id = p_owner then f.friend_id else f.user_id end)::text,
            true
          )
  from public.friendships f
  where f.status = 'accepted'
    and (f.user_id = p_owner or f.friend_id = p_owner);
end;
$$;

-- =============================================================================
-- 3. RPC di scrittura ridefinite (create or replace) = corpo MM0/MM2 VERBATIM +
--    fan-out nei punti già marcati "-- MM3:". Le guardie prosrc dei test MM0/MM2
--    (token invariati) restano verdi; il grant esistente è preservato da
--    create or replace (nessun re-grant necessario).
-- =============================================================================

-- 3.1 map_publish_location — fan-out 'presence' SOLO se la posizione cambia in
--     modo percepibile: primo fix della sessione (era null), spostamento > ~30m
--     (extensions.st_distance in metri sul geography) o cambio stato masked. GPS
--     jitter sotto soglia → nessun broadcast (oltre al rate-limit 20s a monte).
create or replace function public.map_publish_location(
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_pres   public.map_presence%rowtype;
  v_point  extensions.geography;
  v_zone   public.map_safe_zones%rowtype;
  v_loc    extensions.geography;
  v_masked boolean := false;
  v_label  text := null;
  v_moved  boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_user(v_uid) then raise exception 'user_not_active'; end if;

  select * into v_pres from public.map_presence where user_id = v_uid for update;
  if not found or v_pres.sharing_until <= now() then raise exception 'no_active_session'; end if;

  -- Kill-switch: guardia difensiva. In pratica spegnere share_location cancella
  -- GIÀ la presenza (trigger profiles_map_kill_switch_trg), quindi qui si arriva
  -- di norma con no_active_session; questo ramo copre stati residui.
  if not exists (select 1 from public.profiles where id = v_uid and share_location) then
    raise exception 'location_sharing_off';
  end if;

  -- Bounds + NaN (i confronti con NaN sono false → il not li respinge).
  if p_lat is null or p_lng is null
     or not (p_lat between -90 and 90) or not (p_lng between -180 and 180) then
    raise exception 'invalid_location';
  end if;

  -- Rate-limit: no-op silenzioso sotto i 20s (GPS jitter / doppio timer).
  if v_pres.updated_at is not null and v_pres.updated_at > now() - interval '20 seconds' then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;

  -- st_makepoint vuole (lng, lat) = (x, y). SRID 4326, cast a geography.
  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  -- Masking: zona dell'utente che CONTIENE il punto (la più vicina se sovrapposte).
  select * into v_zone
  from public.map_safe_zones z
  where z.user_id = v_uid
    and extensions.st_dwithin(z.center, v_point, z.radius_m)
  order by extensions.st_distance(z.center, v_point) asc
  limit 1;

  if found then
    v_loc    := v_zone.center;   -- il punto esatto in-zona NON tocca mai il disco
    v_masked := true;
    v_label  := v_zone.label;
  else
    v_loc    := v_point;
    v_masked := false;
    v_label  := null;
  end if;

  update public.map_presence
  set location              = v_loc,
      masked                = v_masked,
      zone_label            = v_label,
      updated_at            = now(),
      visibility_expires_at = now() + interval '24 hours'
  where user_id = v_uid;

  -- Fan-out 'presence' agli amici (map.md §13.3) solo se qualcosa di visibile è
  -- cambiato: primo fix, movimento > ~30m o cambio stato masked.
  v_moved := v_pres.location is null
          or v_masked <> v_pres.masked
          or extensions.st_distance(v_pres.location, v_loc) > 30;
  if v_moved then
    perform public.map_fanout(v_uid, 'presence', jsonb_build_object(
      'user_id',               v_uid,
      'lat',                   extensions.st_y(v_loc::extensions.geometry),
      'lng',                   extensions.st_x(v_loc::extensions.geometry),
      'masked',                v_masked,
      'zone_label',            v_label,
      'updated_at',            now(),
      'sharing_until',         v_pres.sharing_until,
      'visibility_expires_at', now() + interval '24 hours'
    ));
  end if;

  return jsonb_build_object('ok', true, 'masked', v_masked);
end;
$$;

-- 3.2 map_stop_sharing — revoca istantanea. Fan-out 'event_ended' (removed=true,
--     niente Echo: è una revoca) per ogni proprio evento live PRIMA di cancellarlo,
--     poi cancella presenza + eventi e manda 'presence_removed'. Il client rimuove
--     tutto all'istante (nessun Last Seen residuo, map.md §3/§11.2).
create or replace function public.map_stop_sharing()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_row     record;
  v_deleted uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Eventi live propri → 'event_ended' removed=true, poi cancellati (niente Echo).
  for v_row in
    with d as (
      delete from public.map_events
      where user_id = v_uid and ended_at is null
      returning id, room_id
    )
    select id, room_id from d
  loop
    perform public.map_fanout(v_uid, 'event_ended', jsonb_build_object(
      'id', v_row.id, 'user_id', v_uid, 'room_id', v_row.room_id, 'removed', true));
  end loop;

  delete from public.map_presence where user_id = v_uid returning user_id into v_deleted;
  if v_deleted is not null then
    perform public.map_fanout(v_uid, 'presence_removed', jsonb_build_object('user_id', v_uid));
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- 3.3 map_attach_room — fan-out 'event_started' agli amici solo se la bolla è
--     stata effettivamente creata (l'idempotenza on conflict do nothing NON
--     ri-broadcasta un attach già presente).
create or replace function public.map_attach_room(p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_room     public.rooms%rowtype;
  v_pres     public.map_presence%rowtype;
  v_event_id uuid;
  v_started  timestamptz;
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
  on conflict (room_id) where ended_at is null do nothing
  returning id, started_at into v_event_id, v_started;

  -- Fan-out 'event_started' solo su inserimento reale (non su re-attach idempotente).
  if v_event_id is not null then
    perform public.map_fanout(v_uid, 'event_started', jsonb_build_object(
      'id',         v_event_id,
      'user_id',    v_uid,
      'room_id',    p_room,
      'event_type', 'room_live',
      'title',      left(v_room.title, 120),
      'lat',        extensions.st_y(v_pres.location::extensions.geometry),
      'lng',        extensions.st_x(v_pres.location::extensions.geometry),
      'masked',     v_pres.masked,
      'zone_label', v_pres.zone_label,
      'started_at', v_started));
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- 3.4 map_detach_room — revoca: DELETE dell'evento live + fan-out 'event_ended'
--     (removed=true, niente Echo). L'unique parziale garantisce ≤1 evento live per
--     stanza → basta catturare la singola riga cancellata.
create or replace function public.map_detach_room(p_room uuid)
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
  where room_id = p_room and user_id = v_uid and ended_at is null
  returning id into v_event_id;

  if v_event_id is not null then
    perform public.map_fanout(v_uid, 'event_ended', jsonb_build_object(
      'id', v_event_id, 'user_id', v_uid, 'room_id', p_room, 'removed', true));
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- 4. Trigger ridefiniti (create or replace) = corpo MM0/MM2 VERBATIM + fan-out.
-- =============================================================================

-- 4.1 rooms_map_close_events — fine naturale della stanza: gli eventi diventano
--     Echo (ended_at=now(), +12h) e gli amici ricevono 'event_ended' removed=false
--     → la bolla NON sparisce, inizia a decadere (map.md §2/§5). Fan-out all'host
--     (proprietario dell'evento) → suoi amici.
create or replace function public.rooms_map_close_events()
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
      set ended_at = now(), visibility_expires_at = now() + interval '12 hours'
      where room_id = new.id and ended_at is null
      returning id, user_id, room_id, ended_at, visibility_expires_at
    )
    select id, user_id, room_id, ended_at, visibility_expires_at from u
  loop
    perform public.map_fanout(v_row.user_id, 'event_ended', jsonb_build_object(
      'id',                    v_row.id,
      'user_id',               v_row.user_id,
      'room_id',               v_row.room_id,
      'ended_at',              v_row.ended_at,
      'visibility_expires_at', v_row.visibility_expires_at,
      'removed',               false));
  end loop;
  return new;
end;
$$;

-- 4.2 profiles_map_kill_switch — spegnere share_location fa SPARIRE subito: come
--     map_stop_sharing (event_ended removed=true + presence_removed), ma innescato
--     dal cambio di flag true→false (atomico, map.md §3).
create or replace function public.profiles_map_kill_switch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row     record;
  v_deleted uuid;
begin
  for v_row in
    with d as (
      delete from public.map_events where user_id = new.id and ended_at is null
      returning id, room_id
    )
    select id, room_id from d
  loop
    perform public.map_fanout(new.id, 'event_ended', jsonb_build_object(
      'id', v_row.id, 'user_id', new.id, 'room_id', v_row.room_id, 'removed', true));
  end loop;

  delete from public.map_presence where user_id = new.id returning user_id into v_deleted;
  if v_deleted is not null then
    perform public.map_fanout(new.id, 'presence_removed', jsonb_build_object('user_id', new.id));
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 5. Grants. map_fanout è interno (solo definer/owner): revoke da public+anon+
--    authenticated (i DEFAULT PRIVILEGES concedono ALL — CM8), nessun grant. Le
--    RPC/trigger ridefinite mantengono i grant di MM0/MM2 (create or replace non
--    resetta gli ACL). La policy su realtime.messages non richiede grant: il
--    ruolo authenticated ha già SELECT sulla tabella.
-- =============================================================================
revoke all on function public.map_fanout(uuid, text, jsonb) from public, anon, authenticated;
