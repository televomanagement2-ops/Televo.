-- =============================================================================
-- Televo — Social: streak SANE + presenza sana (anti-doomscroll)
-- =============================================================================
-- La streak conta i giorni CONSECUTIVI di attività in una conversazione. Niente
-- ricatto emotivo: se salti un giorno, un "freeze" protegge la streak (se ne hai
-- e se ne guadagni ogni 7 giorni). Reset SENZA penalità Aura.
-- Presenza sana: usage_daily + record_session alimentano l'Aura: 'consistency'
-- per la presenza regolare, 'compulsive_use' (negativo) per le maratone.

create table public.streaks (
  conversation_id    uuid primary key references public.conversations (id) on delete cascade,
  current_streak     integer not null default 0,
  longest_streak     integer not null default 0,
  last_activity_date date,
  freezes_available  integer not null default 2 check (freezes_available between 0 and 2),
  updated_at         timestamptz not null default now()
);

create trigger streaks_set_updated_at
  before update on public.streaks
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- usage_daily — secondi attivi per giorno (anti-doomscroll). Owner-only.
-- -----------------------------------------------------------------------------
create table public.usage_daily (
  user_id           uuid not null references public.profiles (id) on delete cascade,
  day               date not null default current_date,
  active_seconds    integer not null default 0,
  compulsive_flagged boolean not null default false,
  primary key (user_id, day)
);

-- -----------------------------------------------------------------------------
-- touch_streak — aggiorna la streak di una conversazione (chiamata dal trigger
-- messaggi). Gestisce incremento, freeze e reset in modo "lazy" (al momento
-- dell'attività), senza job che puniscono i salti.
-- -----------------------------------------------------------------------------
create or replace function public.touch_streak(p_conv uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today   date := current_date;
  v_s       public.streaks%rowtype;
  v_freezes integer;
  v_current integer;
  v_missed  integer;
begin
  select * into v_s from public.streaks where conversation_id = p_conv for update;

  if not found then
    insert into public.streaks (conversation_id, current_streak, longest_streak, last_activity_date)
    values (p_conv, 1, 1, v_today);
    return;
  end if;

  if v_s.last_activity_date = v_today then
    return;  -- già conteggiato oggi
  end if;

  v_freezes := v_s.freezes_available;

  if v_s.last_activity_date = v_today - 1 then
    v_current := v_s.current_streak + 1;
  else
    v_missed := (v_today - v_s.last_activity_date) - 1;
    if v_missed <= v_freezes then
      v_freezes := v_freezes - v_missed;          -- freeze salva la streak
      v_current := v_s.current_streak + 1;
    else
      v_current := 1;                              -- reset, nessuna penalità
    end if;
  end if;

  -- Ricompensa: ogni 7 giorni recuperi un freeze (max 2).
  if v_current % 7 = 0 and v_freezes < 2 then
    v_freezes := v_freezes + 1;
  end if;

  update public.streaks
  set current_streak    = v_current,
      longest_streak    = greatest(v_s.longest_streak, v_current),
      last_activity_date = v_today,
      freezes_available = v_freezes
  where conversation_id = p_conv;
end;
$$;

-- AFTER INSERT su messages: tocca la streak della conversazione.
create or replace function public.messages_after_insert_streak()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.touch_streak(new.conversation_id);
  return new;
end;
$$;

create trigger messages_after_insert_streak_trg
  after insert on public.messages
  for each row execute function public.messages_after_insert_streak();

-- -----------------------------------------------------------------------------
-- record_session — il client comunica i secondi attivi di sessione. Accumula in
-- usage_daily ed emette 'compulsive_use' superata la soglia sana (3h/giorno).
-- -----------------------------------------------------------------------------
create or replace function public.record_session(p_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_secs  integer := greatest(0, least(coalesce(p_seconds, 0), 14400)); -- clamp 0..4h
  v_total integer;
  v_flag  boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  insert into public.usage_daily (user_id, day, active_seconds)
  values (v_uid, current_date, v_secs)
  on conflict (user_id, day)
  do update set active_seconds = public.usage_daily.active_seconds + excluded.active_seconds
  returning active_seconds, compulsive_flagged into v_total, v_flag;

  -- Oltre 3h/giorno (10800s): segnala uso compulsivo una sola volta al giorno.
  if v_total > 10800 and not v_flag then
    update public.usage_daily set compulsive_flagged = true
    where user_id = v_uid and day = current_date;
    perform public.emit_aura(v_uid, 'compulsive_use', -2, 'session', null);
  end if;

  return jsonb_build_object('ok', true, 'active_seconds', v_total);
end;
$$;

-- -----------------------------------------------------------------------------
-- streak_rollover — cron giornaliero: premia la PRESENZA SANA del giorno prima
-- ('consistency'), una volta per utente. Le streak rotte si resettano in modo
-- lazy alla prossima attività (nessun job ansiogeno).
-- -----------------------------------------------------------------------------
create or replace function public.streak_rollover()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.aura_events (user_id, type, delta, source_type)
  select u.user_id, 'consistency', 1, 'daily_presence'
  from public.usage_daily u
  join public.profiles p on p.id = u.user_id and p.deleted_at is null
  where u.day = current_date - 1
    and u.active_seconds between 300 and 10800;  -- 5 min .. 3h = presenza sana
end;
$$;

-- =============================================================================
-- Grants
-- =============================================================================
grant select on public.streaks     to authenticated;  -- ristretto da RLS ai membri
grant select on public.usage_daily to authenticated;  -- ristretto da RLS all'owner

revoke all on function public.record_session(integer) from public;
grant execute on function public.record_session(integer) to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.streaks     enable row level security;
alter table public.usage_daily enable row level security;

create policy streaks_select_member
  on public.streaks for select
  to authenticated
  using (public.is_conv_member(conversation_id, (select auth.uid())));

create policy usage_daily_select_own
  on public.usage_daily for select
  to authenticated
  using (user_id = (select auth.uid()));

-- =============================================================================
-- Scheduling (pg_cron) — rollover presenza sana, ogni giorno 02:00 UTC
-- =============================================================================
select cron.schedule(
  'streak-rollover-daily',
  '0 2 * * *',
  $$ select public.streak_rollover(); $$
);
