-- =============================================================================
-- Televo — Economia Vibes (simbolica attiva ora, monetaria 18+ pronta per 2027)
-- =============================================================================
-- Due valute nello stesso schema:
--   * 'symbolic' — Vibes simboliche: usabili da TUTTI (anche minori), NON
--     convertibili in denaro. Trasferimento atomico e idempotente, attivo dal
--     lancio. Ogni wallet parte con una dotazione e riceve un'allowance ricorrente.
--   * 'real' — Vibes acquistate con denaro vero: SOLO maggiorenni (gate 18+ a
--     livello DB), scritte SOLO da service_role via Stripe. Inerti senza chiavi.
-- Protezione minori: nessun flusso monetario li tocca; il gate è ridondante
-- (trigger su wallet e transazioni) per difesa in profondità.

create type public.currency_type     as enum ('symbolic', 'real');
create type public.transaction_kind  as enum ('gift', 'tip');
create type public.transaction_status as enum ('pending', 'completed', 'failed', 'refunded');

-- Dotazione iniziale e allowance settimanale delle Vibes simboliche.
-- (Centralizzate come funzioni immutabili per coerenza/tuning futuro.)
create or replace function public.vibes_initial_grant() returns numeric
  language sql immutable set search_path = '' as $$ select 100::numeric $$;
create or replace function public.vibes_weekly_allowance() returns numeric
  language sql immutable set search_path = '' as $$ select 25::numeric $$;
create or replace function public.vibes_symbolic_cap() returns numeric
  language sql immutable set search_path = '' as $$ select 500::numeric $$;

-- -----------------------------------------------------------------------------
-- wallets — un portafoglio per utente. balance_real resta 0 per i minori (gate).
-- -----------------------------------------------------------------------------
create table public.wallets (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  balance_symbolic numeric not null default 0 check (balance_symbolic >= 0),
  balance_real     numeric not null default 0 check (balance_real >= 0),
  updated_at       timestamptz not null default now()
);

create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

-- Gate 18+ (difesa in profondità): un minore non può avere saldo reale.
create or replace function public.wallets_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.balance_real > 0 and not public.is_adult(new.user_id) then
    raise exception 'adults_only_real_balance';
  end if;
  return new;
end;
$$;

create trigger wallets_before_write_trg
  before insert or update on public.wallets
  for each row execute function public.wallets_before_write();

-- Crea il wallet alla creazione del profilo (+ backfill profili esistenti).
create or replace function public.profiles_after_insert_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.wallets (user_id, balance_symbolic)
  values (new.id, public.vibes_initial_grant())
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger profiles_after_insert_wallet_trg
  after insert on public.profiles
  for each row execute function public.profiles_after_insert_wallet();

insert into public.wallets (user_id, balance_symbolic)
select id, public.vibes_initial_grant() from public.profiles
on conflict (user_id) do nothing;

-- -----------------------------------------------------------------------------
-- vibe_transactions — movimenti. Le righe 'real' SOLO da service_role/Stripe.
-- -----------------------------------------------------------------------------
create table public.vibe_transactions (
  id                    uuid primary key default gen_random_uuid(),
  from_user             uuid references public.profiles (id) on delete set null,
  to_user               uuid references public.profiles (id) on delete set null,
  room_id               uuid references public.rooms (id) on delete set null,
  amount                numeric not null check (amount > 0),
  currency_type         public.currency_type not null default 'symbolic',
  kind                  public.transaction_kind not null default 'tip',
  status                public.transaction_status not null default 'pending',
  stripe_payment_intent text,
  idempotency_key       text unique,
  created_at            timestamptz not null default now(),
  completed_at          timestamptz
);

create index vibe_tx_from_idx on public.vibe_transactions (from_user, created_at desc);
create index vibe_tx_to_idx   on public.vibe_transactions (to_user, created_at desc);
create index vibe_tx_room_idx on public.vibe_transactions (room_id);

-- Gate 18+ sulle transazioni reali (ridondante con i flussi Edge, by design).
create or replace function public.vibe_transactions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.currency_type = 'real' then
    if new.from_user is not null and not public.is_adult(new.from_user) then
      raise exception 'adults_only_real_currency';
    end if;
    if new.to_user is not null and not public.is_adult(new.to_user) then
      raise exception 'adults_only_real_currency';
    end if;
  end if;
  return new;
end;
$$;

create trigger vibe_transactions_before_insert_trg
  before insert on public.vibe_transactions
  for each row execute function public.vibe_transactions_before_insert();

-- -----------------------------------------------------------------------------
-- stripe_customers — mapping utente↔cliente Stripe (scritto solo da Edge 2027).
-- -----------------------------------------------------------------------------
create table public.stripe_customers (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- creator_earnings — aggregati per creator (commissione piattaforma sul reale).
-- -----------------------------------------------------------------------------
create table public.creator_earnings (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  total_symbolic    numeric not null default 0,
  total_real        numeric not null default 0,
  platform_fee_real numeric not null default 0,
  updated_at        timestamptz not null default now()
);

-- =============================================================================
-- RPC: tip SIMBOLICO atomico e idempotente (attivo dal lancio, sicuro minori).
-- =============================================================================
create or replace function public.process_symbolic_tip(
  p_to              uuid,
  p_amount          numeric,
  p_room            uuid default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from uuid := (select auth.uid());
  v_bal  numeric;
  v_tx   uuid;
begin
  if v_from is null then raise exception 'not_authenticated'; end if;
  if p_to is null or p_to = v_from then raise exception 'invalid_recipient'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_amount <> floor(p_amount) then raise exception 'amount_must_be_integer'; end if;
  if p_amount > 1000 then raise exception 'amount_too_large'; end if;
  if not public.is_active_user(v_from) then raise exception 'user_not_active'; end if;
  if not exists (select 1 from public.profiles where id = p_to and deleted_at is null) then
    raise exception 'recipient_not_found';
  end if;
  if public.is_blocked_pair(v_from, p_to) then raise exception 'blocked'; end if;

  -- Idempotenza: stessa chiave ⇒ ritorna la transazione esistente.
  if p_idempotency_key is not null then
    select id into v_tx from public.vibe_transactions
    where idempotency_key = p_idempotency_key and from_user = v_from;
    if v_tx is not null then
      return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'idempotent', true);
    end if;
  end if;

  -- Assicura i wallet ed evita deadlock bloccando in ordine deterministico.
  insert into public.wallets (user_id) values (v_from), (p_to) on conflict (user_id) do nothing;
  perform 1 from public.wallets where user_id = least(v_from, p_to)    for update;
  perform 1 from public.wallets where user_id = greatest(v_from, p_to) for update;

  select balance_symbolic into v_bal from public.wallets where user_id = v_from;
  if v_bal < p_amount then raise exception 'insufficient_balance'; end if;

  update public.wallets set balance_symbolic = balance_symbolic - p_amount where user_id = v_from;
  update public.wallets set balance_symbolic = balance_symbolic + p_amount where user_id = p_to;

  insert into public.vibe_transactions
    (from_user, to_user, room_id, amount, currency_type, kind, status, idempotency_key, completed_at)
  values (v_from, p_to, p_room, p_amount, 'symbolic', 'tip', 'completed', p_idempotency_key, now())
  returning id into v_tx;

  insert into public.creator_earnings (user_id, total_symbolic)
  values (p_to, p_amount)
  on conflict (user_id)
  do update set total_symbolic = public.creator_earnings.total_symbolic + p_amount, updated_at = now();

  -- Un tip è anche un piccolo riconoscimento: micro-Aura 'contribution' al ricevente.
  perform public.emit_aura(p_to, 'contribution', 0.25, 'tip', v_tx);

  return jsonb_build_object('ok', true, 'transaction_id', v_tx, 'idempotent', false);
end;
$$;

-- =============================================================================
-- Allowance settimanale delle Vibes simboliche (cron). Niente per i sospesi.
-- =============================================================================
create or replace function public.grant_weekly_vibes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.wallets w
  set balance_symbolic = least(w.balance_symbolic + public.vibes_weekly_allowance(),
                               public.vibes_symbolic_cap()),
      updated_at = now()
  from public.profiles p
  where p.id = w.user_id
    and p.deleted_at is null
    and p.banned_at is null
    and w.balance_symbolic < public.vibes_symbolic_cap();
end;
$$;

-- =============================================================================
-- Grants
-- =============================================================================
grant select on public.wallets            to authenticated;  -- RLS: owner
grant select on public.vibe_transactions  to authenticated;  -- RLS: parti coinvolte
grant select on public.stripe_customers   to authenticated;  -- RLS: owner
grant select on public.creator_earnings   to authenticated;  -- RLS: owner
-- Nessun grant insert/update sulle tabelle: i movimenti passano da RPC/service_role.

revoke all on function public.process_symbolic_tip(uuid, numeric, uuid, text) from public;
revoke all on function public.grant_weekly_vibes()                            from public;
grant execute on function public.process_symbolic_tip(uuid, numeric, uuid, text) to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.wallets           enable row level security;
alter table public.vibe_transactions enable row level security;
alter table public.stripe_customers  enable row level security;
alter table public.creator_earnings  enable row level security;

create policy wallets_select_own
  on public.wallets for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy vibe_transactions_select_parties
  on public.vibe_transactions for select
  to authenticated
  using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

create policy stripe_customers_select_own
  on public.stripe_customers for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy creator_earnings_select_own
  on public.creator_earnings for select
  to authenticated
  using (user_id = (select auth.uid()));

-- =============================================================================
-- Scheduling (pg_cron) — allowance Vibes simboliche, lunedì 04:00 UTC.
-- =============================================================================
select cron.schedule(
  'vibes-weekly-allowance',
  '0 4 * * 1',
  $$ select public.grant_weekly_vibes(); $$
);
