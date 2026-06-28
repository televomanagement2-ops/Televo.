-- =============================================================================
-- Televo — Aura: ledger, snapshot, classifiche, recompute
-- =============================================================================
-- aura_score su profiles è una CACHE: la verità è il ledger append-only
-- aura_events. recompute_aura() ricalcola la cache, scrive lo snapshot
-- settimanale e aggiorna le classifiche. Schedulato via pg_cron.

-- Tipi di evento Aura: positivi (qualità della connessione) e negativi.
create type public.aura_event_type as enum (
  'kindness',        -- gentilezza
  'consistency',     -- costanza/presenza sana
  'contribution',    -- contributo alla community
  'welcoming',       -- accoglienza verso i nuovi
  'humor',           -- umorismo apprezzato
  'toxicity',        -- tossicità (negativo)
  'compulsive_use'   -- uso compulsivo (negativo)
);

-- -----------------------------------------------------------------------------
-- aura_events — ledger append-only (scritto solo lato server)
-- -----------------------------------------------------------------------------
create table public.aura_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        public.aura_event_type not null,
  delta       numeric not null,
  source_type text,
  source_id   uuid,
  created_at  timestamptz not null default now()
);

create index aura_events_user_created_idx
  on public.aura_events (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- aura_snapshots — andamento settimanale per il grafico nel profilo
-- -----------------------------------------------------------------------------
create table public.aura_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  period_start        date not null,
  score               numeric not null,
  vibe_color          text,
  character_breakdown jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  unique (user_id, period_start)
);

-- -----------------------------------------------------------------------------
-- Classifiche (viste materializzate, solo aggregati — nessun dato sensibile)
-- -----------------------------------------------------------------------------
create materialized view public.leaderboard_school as
select
  s.id   as school_id,
  s.name as school_name,
  count(p.id)                        as members,
  coalesce(sum(p.aura_score), 0)     as total_aura,
  coalesce(avg(p.aura_score), 0)     as avg_aura
from public.schools s
left join public.profiles p
  on p.school_id = s.id and p.deleted_at is null
group by s.id, s.name;

create unique index leaderboard_school_pk
  on public.leaderboard_school (school_id);

-- Classifica per carattere: somma dei delta positivi per tipo "di carattere".
create materialized view public.leaderboard_character as
select
  e.user_id,
  e.type,
  sum(e.delta) as score
from public.aura_events e
where e.delta > 0
  and e.type in ('kindness', 'consistency', 'contribution', 'welcoming', 'humor')
group by e.user_id, e.type;

create unique index leaderboard_character_pk
  on public.leaderboard_character (user_id, type);

-- -----------------------------------------------------------------------------
-- recompute_aura — ricalcola cache, snapshot settimanale, classifiche
-- -----------------------------------------------------------------------------
create or replace function public.recompute_aura()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1) Cache aura_score dal ledger.
  update public.profiles p
  set aura_score = coalesce(agg.score, 0)
  from (
    select user_id, sum(delta) as score
    from public.aura_events
    group by user_id
  ) agg
  where agg.user_id = p.id;

  -- Azzeramento per chi non ha eventi (coerenza cache).
  update public.profiles p
  set aura_score = 0
  where not exists (select 1 from public.aura_events e where e.user_id = p.id)
    and p.aura_score <> 0;

  -- 2) Snapshot settimanale (lunedì come period_start).
  insert into public.aura_snapshots (user_id, period_start, score)
  select p.id, date_trunc('week', now())::date, p.aura_score
  from public.profiles p
  where p.deleted_at is null
  on conflict (user_id, period_start)
  do update set score = excluded.score;

  -- 3) Classifiche.
  refresh materialized view public.leaderboard_school;
  refresh materialized view public.leaderboard_character;
end;
$$;

-- =============================================================================
-- Grants
-- =============================================================================
grant select on public.aura_events    to authenticated;  -- ristretto da RLS all'owner
grant select on public.aura_snapshots to authenticated;
grant select on public.leaderboard_school    to authenticated;
grant select on public.leaderboard_character to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.aura_events    enable row level security;
alter table public.aura_snapshots enable row level security;

-- aura_events: il ledger (incluse le voci negative) è visibile solo all'owner.
create policy aura_events_select_own
  on public.aura_events for select
  to authenticated
  using (user_id = (select auth.uid()));

-- aura_snapshots: andamento pubblico sul profilo (esclusi profili cancellati).
create policy aura_snapshots_select_visible
  on public.aura_snapshots for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = aura_snapshots.user_id and p.deleted_at is null
    )
  );

-- =============================================================================
-- Scheduling (pg_cron) — ricalcolo Aura ogni lunedì 03:00 UTC
-- =============================================================================
select cron.schedule(
  'aura-recompute-weekly',
  '0 3 * * 1',
  $$ select public.recompute_aura(); $$
);
