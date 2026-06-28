-- =============================================================================
-- Televo — Aura v2: props peer-to-peer + ricalcolo con DECADIMENTO temporale
-- =============================================================================
-- L'Aura è reputazione VIVA, non cumulativa: ogni evento del ledger pesa meno
-- col tempo (half-life 14 giorni). I "props" sono i riconoscimenti che gli
-- utenti si danno (gentile, divertente, accogliente, utile, "real"): alimentano
-- i tratti di carattere. Anti-gaming: un prop unico per (donatore, destinatario,
-- tratto, contenuto) + cap giornaliero; i segnali di volume (Fase drops/rooms)
-- avranno rendimenti decrescenti.

-- -----------------------------------------------------------------------------
-- Peso del decadimento e mappa tratto -> colore dell'anello (vibe).
-- -----------------------------------------------------------------------------
create or replace function public.aura_decay(p_ts timestamptz)
returns double precision
language sql
stable
set search_path = ''
as $$
  -- exp(-ln(2)/14 * giorni) → metà peso ogni 14 giorni.
  select exp(- ln(2) / 14.0 * (extract(epoch from (now() - p_ts)) / 86400.0));
$$;

create or replace function public.vibe_color(p_trait text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_trait
    when 'kindness'      then '#FF6B9D'  -- rosa caldo
    when 'humor'         then '#FFD23F'  -- giallo
    when 'contribution'  then '#3DD68C'  -- verde
    when 'welcoming'     then '#2EC4B6'  -- teal
    when 'consistency'   then '#4D7CFE'  -- blu
    when 'participation' then '#9B5DE5'  -- viola
    else '#8A8D91'                        -- grigio "chill" di default
  end;
$$;

-- -----------------------------------------------------------------------------
-- props — riconoscimenti peer-to-peer (fonte dei tratti positivi).
-- -----------------------------------------------------------------------------
create table public.props (
  id          uuid primary key default gen_random_uuid(),
  giver       uuid not null references public.profiles (id) on delete cascade,
  recipient   uuid not null references public.profiles (id) on delete cascade,
  trait       public.aura_event_type not null,
  source_type text,
  source_id   uuid,
  created_at  timestamptz not null default now(),
  constraint prop_not_self check (giver <> recipient),
  constraint prop_positive_trait check
    (trait in ('kindness','consistency','contribution','welcoming','humor','participation'))
);

-- Un solo prop per (donatore, destinatario, tratto, contenuto). Senza contenuto
-- (prop "alla persona") il vincolo usa un sentinella per evitare duplicati.
create unique index props_unique_uidx on public.props
  (giver, recipient, trait, coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index props_recipient_idx on public.props (recipient);

-- Peso Aura per tratto del prop ricevuto.
create or replace function public.prop_weight(p_trait public.aura_event_type)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_trait
    when 'kindness' then 2.0
    when 'humor' then 1.5
    when 'welcoming' then 2.0
    when 'contribution' then 2.5
    when 'consistency' then 1.5
    when 'participation' then 1.0
    else 1.0
  end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger props: forza il donatore, valida (no blocco), impone il cap giornaliero.
-- -----------------------------------------------------------------------------
create or replace function public.props_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_given_today integer;
begin
  new.giver := (select auth.uid());
  new.created_at := now();

  if new.giver = new.recipient then raise exception 'cannot_prop_self'; end if;
  if not public.is_active_user(new.giver) then raise exception 'user_not_active'; end if;
  if not exists (select 1 from public.profiles where id = new.recipient and deleted_at is null) then
    raise exception 'recipient_not_found';
  end if;
  if public.is_blocked_pair(new.giver, new.recipient) then raise exception 'blocked'; end if;

  -- Cap anti-spam: max 20 props dati al giorno.
  select count(*) into v_given_today from public.props
  where giver = new.giver and created_at >= current_date;
  if v_given_today >= 20 then raise exception 'daily_prop_limit'; end if;

  return new;
end;
$$;

create trigger props_before_insert_trg
  before insert on public.props
  for each row execute function public.props_before_insert();

-- AFTER INSERT: Aura al destinatario (tratto) + micro 'kindness' al donatore
-- (premia il "far sentire visti gli altri": le reazioni date contano).
create or replace function public.props_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.emit_aura(new.recipient, new.trait, public.prop_weight(new.trait),
                           coalesce(new.source_type, 'prop'), new.source_id);
  perform public.emit_aura(new.giver, 'kindness', 0.5, 'prop_given', new.id);
  return new;
end;
$$;

create trigger props_after_insert_trg
  after insert on public.props
  for each row execute function public.props_after_insert();

-- =============================================================================
-- recompute_aura v2 — cache decaduta + breakdown per tratto + colore vibe +
-- snapshot settimanale + classifiche. Sostituisce la v1 (somma piatta).
-- =============================================================================
create or replace function public.recompute_aura()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1) Cache aura_score = somma DECADUTA di tutto il ledger.
  update public.profiles p
  set aura_score = round(coalesce(d.score, 0)::numeric, 2)
  from (
    select user_id, sum(delta * public.aura_decay(created_at)) as score
    from public.aura_events
    group by user_id
  ) d
  where d.user_id = p.id;

  update public.profiles p
  set aura_score = 0
  where not exists (select 1 from public.aura_events e where e.user_id = p.id)
    and p.aura_score <> 0;

  -- 2) Tratto dominante della settimana -> colore dell'anello.
  update public.profiles p
  set aura_color = public.vibe_color(t.top_trait)
  from (
    select user_id, (array_agg(type::text order by s desc))[1] as top_trait
    from (
      select user_id, type, sum(delta * public.aura_decay(created_at)) as s
      from public.aura_events
      where delta > 0
        and type in ('kindness','consistency','contribution','welcoming','humor','participation')
        and created_at > now() - interval '7 days'
      group by user_id, type
    ) r
    group by user_id
  ) t
  where t.user_id = p.id;

  -- 3) Snapshot settimanale (breakdown per il grafico nel profilo).
  insert into public.aura_snapshots (user_id, period_start, score, vibe_color, character_breakdown)
  select p.id,
         date_trunc('week', now())::date,
         p.aura_score,
         coalesce(p.aura_color, public.vibe_color(null)),
         coalesce(b.breakdown, '{}'::jsonb)
  from public.profiles p
  left join (
    select user_id, jsonb_object_agg(type::text, round(s::numeric, 2)) as breakdown
    from (
      select user_id, type, sum(delta * public.aura_decay(created_at)) as s
      from public.aura_events
      where delta > 0
        and type in ('kindness','consistency','contribution','welcoming','humor','participation')
        and created_at > now() - interval '7 days'
      group by user_id, type
    ) r
    group by user_id
  ) b on b.user_id = p.id
  where p.deleted_at is null
  on conflict (user_id, period_start)
  do update set score = excluded.score,
                vibe_color = excluded.vibe_color,
                character_breakdown = excluded.character_breakdown;

  -- 4) Classifiche.
  refresh materialized view public.leaderboard_school;
  refresh materialized view public.leaderboard_character;
end;
$$;

-- Ridefinisci la classifica per carattere su somme DECADUTE (ultime 8 settimane).
drop materialized view if exists public.leaderboard_character;
create materialized view public.leaderboard_character as
select
  e.user_id,
  e.type,
  sum(e.delta * public.aura_decay(e.created_at)) as score
from public.aura_events e
where e.delta > 0
  and e.type in ('kindness', 'consistency', 'contribution', 'welcoming', 'humor')
  and e.created_at > now() - interval '56 days'
group by e.user_id, e.type;

create unique index leaderboard_character_pk
  on public.leaderboard_character (user_id, type);

grant select on public.leaderboard_character to authenticated;

-- =============================================================================
-- Grants & RLS — props
-- =============================================================================
grant select on public.props to authenticated;
grant insert (recipient, trait, source_type, source_id) on public.props to authenticated;

alter table public.props enable row level security;

-- Visibili a chi li dà e a chi li riceve (aggregati mostrati sul profilo).
create policy props_select_parties
  on public.props for select
  to authenticated
  using (giver = (select auth.uid()) or recipient = (select auth.uid()));

create policy props_insert_giver
  on public.props for insert
  to authenticated
  with check (
    giver = (select auth.uid())
    and recipient <> (select auth.uid())
    and public.is_active_user((select auth.uid()))
  );
