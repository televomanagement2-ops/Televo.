-- =============================================================================
-- Televo — Mappa Vibe (geolocalizzazione coarse, FRIENDS-ONLY, opt-in)
-- =============================================================================
-- La posizione su Televo è SEMPRE: (a) coarse (geohash a 5 caratteri ≈ ~5km),
-- (b) effimera (presenze con TTL, location stanze solo durante il live),
-- (c) visibile SOLO agli amici, (d) opt-in esplicito (profiles.share_location).
-- Scelta architetturale: la posizione NON vive su public.rooms (pubbliche →
-- trapelerebbe a tutti). Vive in tabelle dedicate con RLS friends-only, esposte
-- al client da una view security_invoker che eredita quella RLS.

-- -----------------------------------------------------------------------------
-- live_presence — "sono in zona" effimero, friends-only, opt-in.
-- -----------------------------------------------------------------------------
create table public.live_presence (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  geohash5   text not null check (geohash5 ~ '^[0-9a-z]{5}$'),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

create index live_presence_expires_idx on public.live_presence (expires_at);

-- -----------------------------------------------------------------------------
-- room_locations — posizione coarse di una stanza, valida solo mentre è live.
-- -----------------------------------------------------------------------------
create table public.room_locations (
  room_id    uuid primary key references public.rooms (id) on delete cascade,
  host_id    uuid not null references public.profiles (id) on delete cascade,
  geohash5   text not null check (geohash5 ~ '^[0-9a-z]{5}$'),
  updated_at timestamptz not null default now()
);

create index room_locations_host_idx on public.room_locations (host_id);

-- -----------------------------------------------------------------------------
-- RPC: aggiorna/azzera la propria presenza (richiede opt-in share_location).
-- -----------------------------------------------------------------------------
create or replace function public.update_presence(p_geohash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_gh  text := lower(substring(coalesce(p_geohash, ''), 1, 5));
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and share_location) then
    raise exception 'location_sharing_off';
  end if;
  if v_gh !~ '^[0-9a-z]{5}$' then raise exception 'invalid_geohash'; end if;

  insert into public.live_presence (user_id, geohash5, updated_at, expires_at)
  values (v_uid, v_gh, now(), now() + interval '15 minutes')
  on conflict (user_id)
  do update set geohash5 = excluded.geohash5, updated_at = now(),
                expires_at = now() + interval '15 minutes';
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.clear_presence()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from public.live_presence where user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: l'host imposta/azzera la posizione coarse della propria stanza live.
-- -----------------------------------------------------------------------------
create or replace function public.set_room_location(p_room uuid, p_geohash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_gh  text := lower(substring(coalesce(p_geohash, ''), 1, 5));
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_gh !~ '^[0-9a-z]{5}$' then raise exception 'invalid_geohash'; end if;
  if not exists (
    select 1 from public.rooms r where r.id = p_room and r.host_id = v_uid and r.status = 'live'
  ) then
    raise exception 'not_live_host';
  end if;

  insert into public.room_locations (room_id, host_id, geohash5, updated_at)
  values (p_room, v_uid, v_gh, now())
  on conflict (room_id)
  do update set geohash5 = excluded.geohash5, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- expire_content v3 — aggiunge la pulizia delle posizioni effimere/finite.
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

  delete from public.drops where expires_at < now();
  delete from public.messages where expires_at is not null and expires_at < now();

  -- Mappa: presenze scadute e location di stanze non più live.
  delete from public.live_presence where expires_at < now();
  delete from public.room_locations rl
  using public.rooms r
  where rl.room_id = r.id and r.status <> 'live';
end;
$$;

-- =============================================================================
-- vibe_map — view unificata per il client (security_invoker → eredita la RLS
-- friends-only delle tabelle base: un estraneo non vede nulla).
-- =============================================================================
create view public.vibe_map
with (security_invoker = true)
as
  select 'room'::text       as kind,
         r.id               as ref_id,
         rl.host_id         as user_id,
         rl.geohash5        as geohash5,
         r.mood::text       as mood,
         r.participant_count as participant_count,
         rl.updated_at      as updated_at
  from public.room_locations rl
  join public.rooms r on r.id = rl.room_id and r.status = 'live'
  union all
  select 'presence'::text,
         null::uuid,
         lp.user_id,
         lp.geohash5,
         null::text,
         null::integer,
         lp.updated_at
  from public.live_presence lp
  where lp.expires_at > now();

-- =============================================================================
-- Grants & RLS
-- =============================================================================
grant select on public.live_presence  to authenticated;  -- ristretto da RLS agli amici
grant select on public.room_locations to authenticated;
grant select on public.vibe_map       to authenticated;

revoke all on function public.update_presence(text)        from public;
revoke all on function public.clear_presence()             from public;
revoke all on function public.set_room_location(uuid, text) from public;
grant execute on function public.update_presence(text)         to authenticated;
grant execute on function public.clear_presence()              to authenticated;
grant execute on function public.set_room_location(uuid, text) to authenticated;

alter table public.live_presence  enable row level security;
alter table public.room_locations enable row level security;

-- Posizione visibile SOLO a sé stessi e agli amici.
create policy live_presence_select_friends
  on public.live_presence for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.are_friends(user_id, (select auth.uid()))
  );

create policy room_locations_select_friends
  on public.room_locations for select
  to authenticated
  using (
    host_id = (select auth.uid())
    or public.are_friends(host_id, (select auth.uid()))
  );
