-- =============================================================================
-- Televo — Drops: momenti pubblici EFFIMERI (24h) — i "post" anti-doomscroll
-- =============================================================================
-- Un drop è un momento vocale/testo che dura 24h, visibile agli amici (o ai
-- compagni di scuola se l'autore sceglie 'school'). Niente feed permanente né
-- vanity-count: coerente col pilastro anti-doomscroll. Postare alimenta l'Aura
-- ('participation', a rendimenti DECRESCENTI per non premiare il volume); le
-- reaction diventano props (tratti di carattere).
-- NB sicurezza: niente posizione sui drop (la geolocalizzazione coarse vive solo
-- in Fase 5 ed è friends-only). Così un compagno di scuola non-amico non ottiene
-- mai un dato di posizione.

create table public.drops (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  type       text not null default 'audio' check (type in ('text', 'audio')),
  body       text,
  audio_url  text,
  audience   text not null default 'friends' check (audience in ('friends', 'school')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

create index drops_author_idx  on public.drops (author_id);
create index drops_expires_idx on public.drops (expires_at);

create table public.drop_reactions (
  drop_id    uuid not null references public.drops (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  trait      public.aura_event_type not null
             check (trait in ('kindness','humor','welcoming','contribution')),
  created_at timestamptz not null default now(),
  primary key (drop_id, user_id, trait)
);

-- -----------------------------------------------------------------------------
-- Helper: posso vedere questo drop? (amico dell'autore o stessa scuola se 'school')
-- SECURITY DEFINER → niente ricorsione RLS.
-- -----------------------------------------------------------------------------
create or replace function public.can_see_drop(p_drop uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.drops d
    where d.id = p_drop
      and (d.expires_at > now() or d.author_id = uid)
      and (
        d.author_id = uid
        or public.are_friends(d.author_id, uid)
        or (d.audience = 'school' and exists (
              select 1 from public.profiles a join public.profiles b on true
              where a.id = d.author_id and b.id = uid
                and a.school_id is not null and a.school_id = b.school_id))
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- Trigger drops: owner forzato, expiry forzata a 24h, Aura participation
-- a rendimenti decrescenti (1°: +1, 2°: +0.5, 3°: +0.33, ...).
-- -----------------------------------------------------------------------------
create or replace function public.drops_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_id := (select auth.uid());
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  if not public.is_active_user(new.author_id) then raise exception 'user_not_active'; end if;
  if new.type = 'text' and nullif(trim(new.body), '') is null then raise exception 'empty_drop'; end if;
  if new.type = 'audio' and nullif(trim(new.audio_url), '') is null then raise exception 'missing_audio'; end if;
  return new;
end;
$$;

create trigger drops_before_insert_trg
  before insert on public.drops
  for each row execute function public.drops_before_insert();

create or replace function public.drops_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_today integer;
begin
  select count(*) into v_today from public.drops
  where author_id = new.author_id and created_at >= current_date;
  -- rendimenti decrescenti: niente farming del volume
  perform public.emit_aura(new.author_id, 'participation', round((1.0 / v_today)::numeric, 3),
                           'drop', new.id);
  return new;
end;
$$;

create trigger drops_after_insert_trg
  after insert on public.drops
  for each row execute function public.drops_after_insert();

-- -----------------------------------------------------------------------------
-- Trigger drop_reactions: owner forzato, deve poter vedere il drop; la reaction
-- diventa un prop all'autore (salvo auto-reaction).
-- -----------------------------------------------------------------------------
create or replace function public.drop_reactions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := (select auth.uid());
  if not public.can_see_drop(new.drop_id, new.user_id) then raise exception 'drop_not_visible'; end if;
  return new;
end;
$$;

create trigger drop_reactions_before_insert_trg
  before insert on public.drop_reactions
  for each row execute function public.drop_reactions_before_insert();

create or replace function public.drop_reactions_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_author uuid;
begin
  select author_id into v_author from public.drops where id = new.drop_id;
  if v_author is not null and v_author <> new.user_id then
    -- la reaction = prop all'autore (props gestisce dedup, cap e Aura)
    insert into public.props (giver, recipient, trait, source_type, source_id)
    values (new.user_id, v_author, new.trait, 'drop', new.drop_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger drop_reactions_after_insert_trg
  after insert on public.drop_reactions
  for each row execute function public.drop_reactions_after_insert();

-- =============================================================================
-- expire_content v2 — chiude stanze scadute + cancella drop e vocali effimeri.
-- (La pulizia di geohash5 sulle stanze finite si aggiunge in Fase 5.)
-- =============================================================================
create or replace function public.expire_content()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Stanze live scadute -> ended.
  update public.rooms
  set status = 'ended'
  where status = 'live' and ends_at is not null and ends_at < now();

  -- Drop scaduti (24h) -> via (cascade su drop_reactions).
  delete from public.drops where expires_at < now();

  -- Messaggi vocali effimeri scaduti -> via.
  delete from public.messages where expires_at is not null and expires_at < now();
end;
$$;

-- =============================================================================
-- Grants & RLS
-- =============================================================================
grant select on public.drops to authenticated;
grant insert (type, body, audio_url, audience) on public.drops to authenticated;
grant delete on public.drops to authenticated;

grant select, insert, delete on public.drop_reactions to authenticated;

alter table public.drops          enable row level security;
alter table public.drop_reactions enable row level security;

-- drops: l'autore vede sempre i suoi; gli altri solo i non scaduti e se autorizzati.
create policy drops_select_visible
  on public.drops for select
  to authenticated
  using (
    author_id = (select auth.uid())
    or (
      expires_at > now()
      and (
        public.are_friends(author_id, (select auth.uid()))
        or (audience = 'school' and exists (
              select 1 from public.profiles a join public.profiles b on true
              where a.id = author_id and b.id = (select auth.uid())
                and a.school_id is not null and a.school_id = b.school_id))
      )
    )
  );

create policy drops_insert_own
  on public.drops for insert
  to authenticated
  with check (author_id = (select auth.uid()) and public.is_active_user((select auth.uid())));

create policy drops_delete_own
  on public.drops for delete
  to authenticated
  using (author_id = (select auth.uid()));

-- drop_reactions: visibili a chi può vedere il drop; inserisci solo le tue.
create policy drop_reactions_select_visible
  on public.drop_reactions for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.can_see_drop(drop_id, (select auth.uid()))
  );

create policy drop_reactions_insert_own
  on public.drop_reactions for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_see_drop(drop_id, (select auth.uid()))
  );

create policy drop_reactions_delete_own
  on public.drop_reactions for delete
  to authenticated
  using (user_id = (select auth.uid()));
