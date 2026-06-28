-- =============================================================================
-- Televo — Stanze Live: rooms, partecipanti, VibeChain, Spotlight
-- =============================================================================
-- Sicurezza: i campi "di sistema" (host_id, livekit_room_name, is_spotlight,
-- spotlight_until, started_at, ends_at, participant_count, energy_score, status
-- all'insert) sono gestiti SOLO da trigger/funzioni server. L'host non può
-- auto-assegnarsi lo Spotlight (equità della vetrina).

-- Enums
create type public.mood_type        as enum ('hype', 'chill', 'deep', 'fun');
create type public.room_format      as enum ('co_live', 'vibechain');
create type public.room_status      as enum ('scheduled', 'live', 'ended', 'cancelled');
create type public.room_visibility  as enum ('public', 'private');
create type public.participant_role as enum ('host', 'speaker', 'listener');

-- -----------------------------------------------------------------------------
-- rooms
-- -----------------------------------------------------------------------------
create table public.rooms (
  id                uuid primary key default gen_random_uuid(),
  host_id           uuid not null references public.profiles (id) on delete cascade,
  title             text not null,
  topic             text,
  mood              public.mood_type not null default 'chill',
  visibility        public.room_visibility not null default 'public',
  format            public.room_format not null default 'co_live',
  livekit_room_name text not null unique,
  status            public.room_status not null default 'scheduled',
  duration_minutes  integer not null default 30 check (duration_minutes between 15 and 60),
  started_at        timestamptz,
  ends_at           timestamptz,
  max_participants  integer not null default 50 check (max_participants > 0),
  is_spotlight      boolean not null default false,
  spotlight_until   timestamptz,
  participant_count integer not null default 0,
  energy_score      numeric not null default 0,
  created_at        timestamptz not null default now()
);

create index rooms_status_idx     on public.rooms (status);
create index rooms_host_idx       on public.rooms (host_id);
create index rooms_spotlight_idx  on public.rooms (is_spotlight) where is_spotlight;

-- -----------------------------------------------------------------------------
-- room_participants
-- -----------------------------------------------------------------------------
create table public.room_participants (
  room_id     uuid not null references public.rooms (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.participant_role not null default 'listener',
  is_on_stage boolean not null default false,
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  primary key (room_id, user_id)
);

create index room_participants_user_idx on public.room_participants (user_id);

-- -----------------------------------------------------------------------------
-- vibechain_queue — rotazione microfono tra sconosciuti compatibili
-- -----------------------------------------------------------------------------
create table public.vibechain_queue (
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  position   integer not null,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- -----------------------------------------------------------------------------
-- Helper: partecipazione attiva a una stanza
-- -----------------------------------------------------------------------------
create or replace function public.is_room_participant(p_room uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_participants rp
    where rp.room_id = p_room and rp.user_id = uid and rp.left_at is null
  );
$$;

-- -----------------------------------------------------------------------------
-- Trigger rooms: sanitizza l'insert, gestisce le transizioni di stato
-- -----------------------------------------------------------------------------
create or replace function public.rooms_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- campi di sistema forzati: il client non può falsarli
    new.host_id           := (select auth.uid());
    new.livekit_room_name := 'televo_' || gen_random_uuid();
    new.status            := 'scheduled';
    new.started_at        := null;
    new.ends_at           := null;
    new.is_spotlight      := false;
    new.spotlight_until   := null;
    new.participant_count := 0;
    new.energy_score      := 0;
  elsif tg_op = 'UPDATE' then
    -- avvio stanza: calcola la finestra temporale
    if new.status = 'live' and old.status is distinct from 'live' then
      new.started_at := now();
      new.ends_at    := now() + make_interval(mins => new.duration_minutes);
    end if;
  end if;
  return new;
end;
$$;

create trigger rooms_before_write_trg
  before insert or update on public.rooms
  for each row execute function public.rooms_before_write();

-- -----------------------------------------------------------------------------
-- Trigger room_participants: imposta owner, ruolo iniziale; mantiene il conteggio
-- -----------------------------------------------------------------------------
create or replace function public.room_participants_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id   := (select auth.uid());
  new.joined_at := now();
  new.left_at   := null;
  -- l'host della stanza entra come 'host', gli altri come 'listener'
  if exists (
    select 1 from public.rooms r
    where r.id = new.room_id and r.host_id = new.user_id
  ) then
    new.role := 'host';
  else
    new.role := 'listener';
  end if;
  return new;
end;
$$;

create trigger room_participants_before_insert_trg
  before insert on public.room_participants
  for each row execute function public.room_participants_before_insert();

create or replace function public.sync_room_participant_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid := coalesce(new.room_id, old.room_id);
begin
  update public.rooms r
  set participant_count = (
    select count(*) from public.room_participants rp
    where rp.room_id = v_room and rp.left_at is null
  )
  where r.id = v_room;
  return coalesce(new, old);
end;
$$;

create trigger room_participants_count_trg
  after insert or update or delete on public.room_participants
  for each row execute function public.sync_room_participant_count();

-- -----------------------------------------------------------------------------
-- Spotlight: 5 stanze casuali in vetrina 30 minuti
-- -----------------------------------------------------------------------------
create or replace function public.rotate_spotlight()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- togli lo spotlight scaduto
  update public.rooms
  set is_spotlight = false, spotlight_until = null
  where is_spotlight and (spotlight_until is null or spotlight_until < now());

  -- scegli 5 stanze live pubbliche a caso
  with picks as (
    select id from public.rooms
    where status = 'live' and visibility = 'public' and is_spotlight = false
    order by random()
    limit 5
  )
  update public.rooms r
  set is_spotlight = true,
      spotlight_until = now() + interval '30 minutes'
  from picks
  where r.id = picks.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- expire_content: chiude le stanze scadute (esteso ai vocali 24h in fase social)
-- -----------------------------------------------------------------------------
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
end;
$$;

-- =============================================================================
-- Grants
-- =============================================================================
grant select on public.rooms to authenticated;
grant insert on public.rooms to authenticated;  -- sanitizzato dal trigger + RLS
grant update (title, topic, mood, visibility, format, duration_minutes,
              max_participants, status) on public.rooms to authenticated;
grant delete on public.rooms to authenticated;

grant select on public.room_participants to authenticated;
grant insert (room_id) on public.room_participants to authenticated;
grant update (role, is_on_stage, left_at) on public.room_participants to authenticated;
grant delete on public.room_participants to authenticated;

grant select, insert, delete on public.vibechain_queue to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.rooms             enable row level security;
alter table public.room_participants enable row level security;
alter table public.vibechain_queue   enable row level security;

-- rooms: pubbliche visibili a tutti; private solo a host/partecipanti.
create policy rooms_select_visible
  on public.rooms for select
  to authenticated
  using (
    visibility = 'public'
    or host_id = (select auth.uid())
    or public.is_room_participant(id, (select auth.uid()))
  );

create policy rooms_insert_own
  on public.rooms for insert
  to authenticated
  with check (
    host_id = (select auth.uid())
    and public.is_active_user((select auth.uid()))
  );

create policy rooms_update_own
  on public.rooms for update
  to authenticated
  using (host_id = (select auth.uid()))
  with check (host_id = (select auth.uid()));

create policy rooms_delete_own
  on public.rooms for delete
  to authenticated
  using (host_id = (select auth.uid()));

-- room_participants: vedi i partecipanti delle stanze che puoi vedere.
create policy room_participants_select_visible
  on public.room_participants for select
  to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id = room_participants.room_id
        and (
          r.visibility = 'public'
          or r.host_id = (select auth.uid())
          or public.is_room_participant(r.id, (select auth.uid()))
        )
    )
  );

create policy room_participants_join
  on public.room_participants for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active_user((select auth.uid()))
    and exists (
      select 1 from public.rooms r
      where r.id = room_participants.room_id
        and r.status in ('scheduled', 'live')
        and (r.visibility = 'public' or r.host_id = (select auth.uid()))
    )
  );

create policy room_participants_update
  on public.room_participants for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.rooms r
      where r.id = room_participants.room_id and r.host_id = (select auth.uid())
    )
  );

create policy room_participants_delete
  on public.room_participants for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.rooms r
      where r.id = room_participants.room_id and r.host_id = (select auth.uid())
    )
  );

-- vibechain_queue: visibile/gestibile dai partecipanti della stanza.
create policy vibechain_select
  on public.vibechain_queue for select
  to authenticated
  using (public.is_room_participant(room_id, (select auth.uid())));

create policy vibechain_insert_own
  on public.vibechain_queue for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_room_participant(room_id, (select auth.uid()))
  );

create policy vibechain_delete
  on public.vibechain_queue for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.rooms r
      where r.id = vibechain_queue.room_id and r.host_id = (select auth.uid())
    )
  );

-- =============================================================================
-- Scheduling (pg_cron)
-- =============================================================================
-- Spotlight: una volta al giorno (18:00 UTC) sceglie 5 stanze per 30 minuti.
select cron.schedule(
  'spotlight-daily',
  '0 18 * * *',
  $$ select public.rotate_spotlight(); $$
);

-- Expire: chiude le stanze scadute ogni 5 minuti.
select cron.schedule(
  'expire-content',
  '*/5 * * * *',
  $$ select public.expire_content(); $$
);
