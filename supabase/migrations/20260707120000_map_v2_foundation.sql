-- =============================================================================
-- Televo — M7 · La Mappa della Città (MM0): fondamenta backend (schema + scrittura)
-- =============================================================================
-- Prima wave della Mappa v2 (docs/map/map.md, Parte II §16 MM0). Sostituisce
-- concettualmente la "Mappa Vibe" di Fase 5 (geohash coarse), che verrà DROPpata
-- in MM1 nella stessa transazione delle v6 di lifecycle/GDPR. Qui costruiamo SOLO
-- lo scheletro: PostGIS, le tre tabelle, l'helper di visibilità, il trigger di cap
-- e le 5 RPC di SCRITTURA. Fuori da MM0 (arrivano dopo, milestone dedicate):
--   · map_snapshot / map_attach_room / map_detach_room / trigger rooms→events  → MM2
--   · fan-out realtime.send() da publish/stop                                  → MM3
--   · expire_content v6 / process_account_deletion v6 / drop legacy Fase 5     → MM1
--   · gdpr-export v4                                                            → MM4
--
-- Regole d'oro applicate (CLAUDE.md §6, map.md §1.2):
--  · Posizione friends-only, opt-in, auto-expiry. Le tabelle mappa NON hanno
--    select policy per il client (pattern audit_log): la lettura passerà SOLO da
--    map_snapshot (definer, MM2). Nessun dato grezzo esposto.
--  · Masking Safe Zone PRIMA della persistenza: dentro una zona si scrive il
--    CENTRO-zona, mai il punto esatto → GDPR-by-design, non promessa di UI.
--  · Solo timestamptz (UTC); localizzazione solo lato client al rendering.
--  · is_active_user() come unico cancello di enforcement (mute/ban bloccano anche
--    la pubblicazione di posizione, coerente con Fase 7).
--  · Grant: revoke SEMPRE da public+anon+authenticated (i DEFAULT PRIVILEGES del
--    progetto concedono ALL su ogni nuovo oggetto — lezione CM8), poi grant mirato.

-- =============================================================================
-- 1. PostGIS — prima estensione "pesante" del progetto. Vive nello schema
--    `extensions` (convenzione Supabase): tipi e funzioni vanno SEMPRE
--    schema-qualificati (extensions.geography, extensions.st_dwithin, …) perché
--    tutte le nostre funzioni girano con search_path = ''.
--    Disponibile sull'hosted come 3.3.7 (verificato via pooler prima di scrivere).
-- =============================================================================
create extension if not exists postgis with schema extensions;

-- =============================================================================
-- 2. Enum del tipo di evento georiferito. v1: solo stanze live. Estensibile in
--    futuro (eventi manuali "Aperitivo al Parco" = nuovo valore, QA-4) senza
--    toccare lo schema.
-- =============================================================================
create type public.map_event_type as enum ('room_live');

-- =============================================================================
-- 3. map_presence — UNA riga per utente = sessione opt-in + Last Seen.
--    location NULL finché non arriva il primo publish della sessione.
--    visibility_expires_at = TTL della riga (updated_at + 24h): garantisce che il
--    cron (MM1) recuperi anche le sessioni senza publish (TTL floor impostato allo
--    start). Il masking snappa location al centro-zona quando in Safe Zone.
-- =============================================================================
create table public.map_presence (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  location              extensions.geography(point, 4326),        -- null = sessione senza fix
  masked                boolean not null default false,           -- true = snappata a Safe Zone
  zone_label            text,                                     -- valorizzata solo se masked
  sharing_until         timestamptz not null,                     -- fine sessione opt-in (cap 12h)
  updated_at            timestamptz,                              -- ultimo publish = "last seen at"
  visibility_expires_at timestamptz                               -- updated_at + 24h (TTL riga)
);

create index map_presence_location_idx   on public.map_presence using gist (location);
create index map_presence_expires_idx     on public.map_presence (visibility_expires_at);

-- =============================================================================
-- 4. map_events — eventi georiferiti (v1: stanze live degli amici host).
--    title denormalizzato: l'Echo sopravvive alla stanza (e alla sua rinomina).
--    room_id on delete set null: se la stanza sparisce, l'Echo resta senza join.
--    Unique parziale su room_id where ended_at is null: una sola bolla LIVE per
--    stanza. In MM0 la tabella esiste ma la scrivono solo map_stop_sharing (che
--    cancella i propri eventi live) — attach/detach/trigger arrivano in MM2.
-- =============================================================================
create table public.map_events (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  room_id               uuid references public.rooms (id) on delete set null,
  event_type            public.map_event_type not null,
  title                 text not null,                            -- denormalizzato dalla stanza
  location              extensions.geography(point, 4326) not null,
  masked                boolean not null default false,
  zone_label            text,
  started_at            timestamptz not null default now(),
  ended_at              timestamptz,                              -- null = live
  visibility_expires_at timestamptz                               -- set alla chiusura: ended_at + 12h
);

create index map_events_location_idx on public.map_events using gist (location);
create index map_events_user_idx     on public.map_events (user_id);
create index map_events_expires_idx  on public.map_events (visibility_expires_at);
create unique index map_events_room_live_uidx
  on public.map_events (room_id) where ended_at is null;

-- =============================================================================
-- 5. map_safe_zones — fino a 2 zone personali (centro + raggio). Dentro una zona
--    la posizione appare al CENTRO con etichetta ("In zona · Casa"). È una SCELTA
--    dell'utente (mai default), disattivabile. Cap 2 imposto nel trigger E nella
--    RPC (difesa in profondità).
-- =============================================================================
create table public.map_safe_zones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  label      text not null,
  center     extensions.geography(point, 4326) not null,
  radius_m   int not null default 200 check (radius_m between 100 and 500),
  created_at timestamptz not null default now()
);

create index map_safe_zones_user_idx on public.map_safe_zones (user_id);

-- Cap 2 zone/utente: guardia a livello dati (le insert passano solo dalla RPC
-- definer, ma il trigger è la cintura di sicurezza).
create or replace function public.map_safe_zones_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.map_safe_zones where user_id = new.user_id) >= 2 then
    raise exception 'zone_limit_reached';
  end if;
  return new;
end;
$$;

create trigger map_safe_zones_cap_trg
  before insert on public.map_safe_zones
  for each row execute function public.map_safe_zones_cap();

-- =============================================================================
-- 6. can_see_on_map(owner, viewer) — l'unico predicato di visibilità della mappa.
--    Se stesso, OPPURE amici reciproci accettati E non bloccati. Definer/stable,
--    riusata dallo snapshot (MM2) e dal fan-out (MM3). Non è per il client: viene
--    invocata solo da altre funzioni definer (che girano come owner) → revocata a
--    tutti (coerente con "le tabelle mappa non sono leggibili dal client").
-- =============================================================================
create or replace function public.can_see_on_map(p_owner uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner = p_viewer
      or (public.are_friends(p_owner, p_viewer)
          and not public.is_blocked_pair(p_owner, p_viewer));
$$;

-- =============================================================================
-- 6.b Kill-switch master (map.md §3): spegnere profiles.share_location fa
--     SPARIRE subito dalla mappa — presenza + eventi live propri cancellati in
--     modo ATOMICO. È l'unico modo corretto per "rifiutare la pubblicazione E
--     cancellare la presenza": una RPC che raise() farebbe rollback del proprio
--     delete, quindi la cancellazione vive qui, sul cambio di stato del flag.
--     Fire mirato: solo sulla transizione true→false della colonna. Il fan-out
--     'presence_removed' agli amici arriva in MM3.
-- =============================================================================
create or replace function public.profiles_map_kill_switch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.map_presence where user_id = new.id;
  delete from public.map_events   where user_id = new.id and ended_at is null;
  -- MM3: qui il fan-out realtime.send() 'presence_removed' agli amici.
  return new;
end;
$$;

create trigger profiles_map_kill_switch_trg
  after update of share_location on public.profiles
  for each row
  when (new.share_location = false and old.share_location is distinct from new.share_location)
  execute function public.profiles_map_kill_switch();

-- =============================================================================
-- 7. RPC di scrittura (tutte SECURITY DEFINER, search_path='', errori come
--    stringhe-codice). Ogni mutazione delle tabelle mappa passa da qui.
-- =============================================================================

-- 7.1 map_start_sharing(hours) — accende l'aura sulla mappa per N ore (cap 12).
--     Il consenso GDPR (record_consent('location', …)) lo registra il CLIENT PRIMA
--     della prima attivazione. Se esiste già una riga da un Last Seen precedente:
--     aggiorna SOLO la sessione (conserva posizione/updated_at/visibility). Su una
--     riga nuova imposta un TTL floor (24h) così il cron la recupera anche senza
--     alcun publish.
create or replace function public.map_start_sharing(p_hours int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_until timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 12 then raise exception 'invalid_duration'; end if;
  if not public.is_active_user(v_uid) then raise exception 'user_not_active'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and share_location) then
    raise exception 'location_sharing_off';
  end if;

  v_until := now() + make_interval(hours => p_hours);

  insert into public.map_presence (user_id, sharing_until, visibility_expires_at)
  values (v_uid, v_until, now() + interval '24 hours')
  on conflict (user_id) do update set sharing_until = excluded.sharing_until;

  return jsonb_build_object('ok', true, 'sharing_until', v_until);
end;
$$;

-- 7.2 map_stop_sharing() — revoca istantanea: sparire del tutto (nemmeno Last
--     Seen). Cancella FISICAMENTE la riga di presenza e i propri eventi ancora
--     live (niente Echo: il detach esplicito è una revoca). Il fan-out
--     presence_removed / event_ended alle inbox amici arriva in MM3.
create or replace function public.map_stop_sharing()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  delete from public.map_presence where user_id = v_uid;
  delete from public.map_events   where user_id = v_uid and ended_at is null;
  -- MM3: qui il fan-out realtime.send() 'presence_removed' + 'event_ended' agli amici.

  return jsonb_build_object('ok', true);
end;
$$;

-- 7.3 map_publish_location(lat, lng) — pubblica la posizione durante la sessione.
--     Guardie (ordine map.md §13.2): autenticato · is_active_user() · sessione
--     attiva · kill-switch share_location · bounds/NaN. Rate-limit 20s (no-op
--     silenzioso). Masking Safe Zone: se il punto cade in una zona dell'utente si
--     persiste il CENTRO-zona più vicino (mai il punto esatto) + masked + label.
--     visibility_expires_at ricalcolato a now()+24h. Il fan-out realtime (solo se
--     spostamento > ~30m o cambio stato masked) arriva in MM3.
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
  -- MM3: qui il fan-out realtime.send() 'presence' agli amici se moved>~30m o cambio masked.

  return jsonb_build_object('ok', true, 'masked', v_masked);
end;
$$;

-- 7.4 map_set_safe_zone(label, lat, lng, radius) — crea una Safe Zone (cap 2).
create or replace function public.map_set_safe_zone(
  p_label    text,
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m int default 200
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_lbl text := nullif(btrim(coalesce(p_label, '')), '');
  v_id  uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_lbl is null then raise exception 'invalid_label'; end if;
  if p_radius_m is null or p_radius_m < 100 or p_radius_m > 500 then raise exception 'invalid_radius'; end if;
  if p_lat is null or p_lng is null
     or not (p_lat between -90 and 90) or not (p_lng between -180 and 180) then
    raise exception 'invalid_location';
  end if;
  if (select count(*) from public.map_safe_zones where user_id = v_uid) >= 2 then
    raise exception 'zone_limit_reached';
  end if;

  insert into public.map_safe_zones (user_id, label, center, radius_m)
  values (
    v_uid,
    left(v_lbl, 40),
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
    p_radius_m
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- 7.5 map_delete_safe_zone(id) — elimina una propria Safe Zone (dal publish
--     successivo torna il punto esatto).
create or replace function public.map_delete_safe_zone(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from public.map_safe_zones where id = p_id and user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- 8. Grants & RLS. map_presence/map_events: RLS attiva SENZA policy (pattern
--    audit_log) → nessuna lettura client, solo RPC definer. map_safe_zones:
--    lettura owner-only (l'editor le mostra), mutazioni solo via RPC.
--    revoke da public+anon+authenticated per battere i DEFAULT PRIVILEGES (CM8).
-- =============================================================================
alter table public.map_presence   enable row level security;
alter table public.map_events     enable row level security;
alter table public.map_safe_zones enable row level security;

revoke all on public.map_presence   from public, anon, authenticated;
revoke all on public.map_events     from public, anon, authenticated;
revoke all on public.map_safe_zones from public, anon, authenticated;
grant  select on public.map_safe_zones to authenticated;  -- RLS: owner-only

-- map_safe_zones: l'owner vede le proprie zone (il viewer amico vedrà solo
-- "In zona · label" nello snapshot, mai la zona).
create policy map_safe_zones_select_own
  on public.map_safe_zones for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Funzioni: revoke esplicito da public+anon+authenticated, poi grant mirato.
-- can_see_on_map + il trigger cap NON sono per il client (solo definer/owner).
revoke all on function public.map_safe_zones_cap()                             from public, anon, authenticated;
revoke all on function public.profiles_map_kill_switch()                        from public, anon, authenticated;
revoke all on function public.can_see_on_map(uuid, uuid)                       from public, anon, authenticated;
revoke all on function public.map_start_sharing(int)                           from public, anon, authenticated;
revoke all on function public.map_stop_sharing()                              from public, anon, authenticated;
revoke all on function public.map_publish_location(double precision, double precision) from public, anon, authenticated;
revoke all on function public.map_set_safe_zone(text, double precision, double precision, int) from public, anon, authenticated;
revoke all on function public.map_delete_safe_zone(uuid)                       from public, anon, authenticated;

grant execute on function public.map_start_sharing(int)                           to authenticated;
grant execute on function public.map_stop_sharing()                              to authenticated;
grant execute on function public.map_publish_location(double precision, double precision) to authenticated;
grant execute on function public.map_set_safe_zone(text, double precision, double precision, int) to authenticated;
grant execute on function public.map_delete_safe_zone(uuid)                       to authenticated;
