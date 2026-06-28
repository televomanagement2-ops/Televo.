-- =============================================================================
-- Televo — Core: identità, scuole, inviti
-- =============================================================================
-- Decisioni chiave:
--  * birth_date vive in `profiles_private` (mai esposta agli altri utenti).
--  * Age-gate >=16 imposto a livello DB nel trigger di creazione profilo.
--  * Nessun campo sensibile (age_verified, school_id, aura_*) è modificabile
--    dall'utente: GRANT a livello di colonna + RLS.

-- -----------------------------------------------------------------------------
-- Utility: updated_at automatico
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- schools
-- -----------------------------------------------------------------------------
create table public.schools (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  city       text not null default 'Terni',
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- profiles  (1:1 con auth.users) — SENZA birth_date (vedi profiles_private)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  username        extensions.citext not null unique,
  display_name    text,
  age_verified    boolean not null default false,
  avatar_url      text,
  audio_bio_url   text,
  status_text     text,
  customization   jsonb not null default '{}'::jsonb,
  interests       text[] not null default '{}',
  school_id       uuid references public.schools (id) on delete set null,
  aura_score      numeric not null default 0,
  aura_color      text,
  share_location  boolean not null default false,
  expo_push_token text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint username_format check ((username::text) ~ '^[a-z0-9_.]{3,20}$')
);

create index profiles_school_id_idx on public.profiles (school_id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- profiles_private — dati sensibili (birth_date). Solo owner + service_role.
-- -----------------------------------------------------------------------------
create table public.profiles_private (
  id         uuid primary key references public.profiles (id) on delete cascade,
  birth_date date not null,
  created_at timestamptz not null default now(),
  constraint birth_date_sane check (birth_date > '1900-01-01')
);

-- -----------------------------------------------------------------------------
-- invites — distribuiti tramite scuola (verifica età "reale")
-- -----------------------------------------------------------------------------
create table public.invites (
  code       text primary key,
  school_id  uuid not null references public.schools (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  max_uses   integer not null default 1 check (max_uses > 0),
  uses       integer not null default 0 check (uses >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint uses_within_max check (uses <= max_uses)
);

-- -----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER) — usate da RLS in tutti i domini
-- -----------------------------------------------------------------------------

-- Maggiore età calcolata dalla birth_date privata (per il gate monetario 18+).
create or replace function public.is_adult(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles_private pp
    where pp.id = uid
      and pp.birth_date <= (current_date - interval '18 years')
  );
$$;

-- Utente "attivo": profilo verificato (>=16 + invito) e non cancellato.
create or replace function public.is_active_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.age_verified
      and p.deleted_at is null
  );
$$;

-- -----------------------------------------------------------------------------
-- Trigger di registrazione: crea profilo + profiles_private dai metadati,
-- imponendo l'age-gate >=16 come HARD STOP (annulla la creazione account).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username   text;
  v_birth_date date;
begin
  v_username   := nullif(new.raw_user_meta_data ->> 'username', '');
  v_birth_date := (new.raw_user_meta_data ->> 'birth_date')::date;

  if v_username is null then
    raise exception 'username mancante nei metadati di registrazione';
  end if;
  if v_birth_date is null then
    raise exception 'birth_date mancante nei metadati di registrazione';
  end if;

  -- Age-gate >=16: blocca la creazione dell'account.
  if v_birth_date > (current_date - interval '16 years') then
    raise exception 'Devi avere almeno 16 anni per usare Televo';
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, nullif(new.raw_user_meta_data ->> 'display_name', ''));

  insert into public.profiles_private (id, birth_date)
  values (new.id, v_birth_date);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Grants (auto_expose disattivato: concediamo esplicitamente)
-- =============================================================================
grant select on public.schools to authenticated;

grant select on public.profiles to authenticated;
-- Solo le colonne non sensibili sono modificabili dall'utente.
grant update (
  username, display_name, avatar_url, audio_bio_url, status_text,
  customization, interests, share_location, expo_push_token
) on public.profiles to authenticated;

grant select on public.profiles_private to authenticated;  -- ristretto da RLS all'owner

-- invites: nessun grant -> accessibile solo da service_role (verify-invite).

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.schools          enable row level security;
alter table public.profiles         enable row level security;
alter table public.profiles_private enable row level security;
alter table public.invites          enable row level security;

-- schools: lettura per tutti gli autenticati.
create policy schools_select_all
  on public.schools for select
  to authenticated
  using (true);

-- profiles: lettura dei profili non cancellati (o il proprio); update solo del proprio.
create policy profiles_select_visible
  on public.profiles for select
  to authenticated
  using (deleted_at is null or id = (select auth.uid()));

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- profiles_private: solo l'owner legge la propria birth_date.
create policy profiles_private_select_own
  on public.profiles_private for select
  to authenticated
  using (id = (select auth.uid()));

-- invites: RLS abilitata, nessuna policy -> bloccata a tutti tranne service_role.
