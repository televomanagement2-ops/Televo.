-- =============================================================================
-- Televo — Drops M6 (DM0): interazioni (commenti, like, salvataggi) + lettura
-- =============================================================================
-- Le interazioni attorno al drop e le RPC di lettura del feed/dettaglio.
-- Principio cardine (R-04, D-2): l'anti-vanity è enforced A LIVELLO DATI, non
-- di UI. I NUMERI (like/commenti/salvataggi/reaction) viaggiano SOLO dentro
-- drops_feed/drop_detail (SECURITY DEFINER), valorizzati esclusivamente quando
-- author_id = uid. Le RLS non mostrano a un non-autore le righe da contare:
-- drop_likes solo a se stessi ∨ autore; drop_saves solo a se stessi (R-14: chi
-- salva non è mai esposto, nemmeno all'autore). I commenti sono CONTENUTO
-- (leggibili da chi vede il drop) ma la cifra aggregata resta privata.
--
-- Convenzioni CM8 applicate a ogni tabella nuova: revoke all + grant minimo
-- per-colonna esplicito (i DEFAULT PRIVILEGES dell'hosted concedono ALL: senza
-- revoke i grant sarebbero cosmetici). Campi di sistema forzati dai trigger.

-- =============================================================================
-- 1. drop_comments — testo o vocale, 1 solo livello di reply (R-07, D-4).
-- =============================================================================
create table public.drop_comments (
  id            uuid primary key default gen_random_uuid(),
  drop_id       uuid not null references public.drops (id) on delete cascade,
  author_id     uuid not null references public.profiles (id) on delete cascade,
  parent_id     uuid references public.drop_comments (id) on delete cascade,
  type          text not null default 'text' check (type in ('text', 'audio')),
  body          text,
  audio_url     text,
  audio_seconds integer,
  created_at    timestamptz not null default now()
);

create index drop_comments_drop_created_idx on public.drop_comments (drop_id, created_at);
create index drop_comments_author_idx        on public.drop_comments (author_id);
create index drop_comments_parent_idx        on public.drop_comments (parent_id) where parent_id is not null;

-- Trigger before-insert: forza autore/created, sanzioni, visibilità e vita del
-- drop, coerenza formato, path vocale, profondità 1 + stesso drop, rate-limit.
-- (id server-side: il path del vocale è <drop_id>/<author_id>/commento_… → non
--  serve l'id del commento prima dell'insert, a differenza del drop.)
create or replace function public.drop_comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_drop   uuid;
  v_parent_parent uuid;
  v_recenti       integer;
begin
  new.author_id  := (select auth.uid());
  new.created_at := now();

  if not public.is_active_user(new.author_id) then raise exception 'user_not_active'; end if;
  if not public.can_see_drop(new.drop_id, new.author_id) then raise exception 'drop_not_visible'; end if;
  -- Il commento appartiene a un drop VIVO (i Ricordi non si commentano).
  if not exists (select 1 from public.drops d where d.id = new.drop_id and d.expires_at > now()) then
    raise exception 'drop_expired';
  end if;

  -- Coerenza formato ↔ colonne.
  if new.type = 'text' then
    if nullif(trim(new.body), '') is null then raise exception 'empty_comment'; end if;
    if char_length(new.body) > 1000 then raise exception 'comment_too_long'; end if;
    if new.audio_url is not null or new.audio_seconds is not null then raise exception 'invalid_comment_fields'; end if;
  elsif new.type = 'audio' then
    if nullif(trim(new.audio_url), '') is null then raise exception 'missing_audio'; end if;
    if new.audio_url not like format('%s/%s/%%', new.drop_id, new.author_id) then
      raise exception 'invalid_audio_path';
    end if;
    if new.audio_seconds is null or new.audio_seconds < 1 or new.audio_seconds > 120 then
      raise exception 'invalid_audio_duration';
    end if;
    if new.body is not null then raise exception 'invalid_comment_fields'; end if;
  end if;

  -- Reply: profondità massima 1 (reply solo a un top-level dello STESSO drop).
  if new.parent_id is not null then
    select c.drop_id, c.parent_id into v_parent_drop, v_parent_parent
    from public.drop_comments c where c.id = new.parent_id;
    if v_parent_drop is null or v_parent_drop <> new.drop_id then
      raise exception 'invalid_parent';
    end if;
    if v_parent_parent is not null then
      raise exception 'reply_depth_exceeded';
    end if;
  end if;

  -- Rate-limit anti-spam (RC-06): max 10 commenti negli ultimi 60 secondi.
  select count(*) into v_recenti
  from public.drop_comments
  where author_id = new.author_id and created_at > now() - interval '60 seconds';
  if v_recenti >= 10 then raise exception 'rate_limited'; end if;

  return new;
end;
$$;

create trigger drop_comments_before_insert_trg
  before insert on public.drop_comments
  for each row execute function public.drop_comments_before_insert();

-- =============================================================================
-- 2. drop_likes — gesto leggero (R-05): zero Aura, zero notifiche, zero realtime.
-- =============================================================================
create table public.drop_likes (
  drop_id    uuid not null references public.drops (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (drop_id, user_id)
);

create or replace function public.drop_likes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id    := (select auth.uid());
  new.created_at := now();
  if not public.is_active_user(new.user_id) then raise exception 'user_not_active'; end if;
  if not public.can_see_drop(new.drop_id, new.user_id) then raise exception 'drop_not_visible'; end if;
  if not exists (select 1 from public.drops d where d.id = new.drop_id and d.expires_at > now()) then
    raise exception 'drop_expired';
  end if;
  return new;
end;
$$;

create trigger drop_likes_before_insert_trg
  before insert on public.drop_likes
  for each row execute function public.drop_likes_before_insert();

-- =============================================================================
-- 3. drop_saves — segnalibro effimero (D-1): vive quanto il drop. Mutazioni SOLO
--    via RPC (niente policy insert/delete); l'autore vede solo il NUMERO (R-14).
-- =============================================================================
create table public.drop_saves (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  drop_id    uuid not null references public.drops (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, drop_id)
);

create index drop_saves_user_created_idx on public.drop_saves (user_id, created_at desc);

create or replace function public.save_drop(p_drop uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_user(v_uid) then raise exception 'user_not_active'; end if;
  if not public.can_see_drop(p_drop, v_uid) then raise exception 'drop_not_visible'; end if;
  if not exists (select 1 from public.drops d where d.id = p_drop and d.expires_at > now()) then
    raise exception 'drop_expired';
  end if;
  insert into public.drop_saves (user_id, drop_id) values (v_uid, p_drop)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.unsave_drop(p_drop uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from public.drop_saves where user_id = v_uid and drop_id = p_drop;
  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- 4. RLS
-- =============================================================================
alter table public.drop_comments enable row level security;
alter table public.drop_likes    enable row level security;
alter table public.drop_saves    enable row level security;

-- Commenti = contenuto: leggibili da chi vede il drop.
create policy drop_comments_select_visible
  on public.drop_comments for select
  to authenticated
  using (public.can_see_drop(drop_id, (select auth.uid())));

create policy drop_comments_insert_own
  on public.drop_comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_active_user((select auth.uid()))
    and public.can_see_drop(drop_id, (select auth.uid()))
  );

-- Elimina il proprio commento, O qualunque commento sul PROPRIO drop (safety:
-- l'autore governa il proprio spazio, §8).
create policy drop_comments_delete_own_or_drop_author
  on public.drop_comments for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.drops d
      where d.id = drop_id and d.author_id = (select auth.uid())
    )
  );

-- Like: la riga è visibile a se stessi ∨ all'autore del drop (R-04). Un non-autore
-- vede solo il proprio like → non può contare i like altrui via PostgREST.
create policy drop_likes_select_own_or_author
  on public.drop_likes for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.drops d
      where d.id = drop_id and d.author_id = (select auth.uid())
    )
  );

create policy drop_likes_insert_own
  on public.drop_likes for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_see_drop(drop_id, (select auth.uid()))
  );

create policy drop_likes_delete_own
  on public.drop_likes for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Salvataggi: SOLO a se stessi (nemmeno l'autore vede CHI salva — R-14; il
-- numero arriva dalle RPC di lettura).
create policy drop_saves_select_own
  on public.drop_saves for select
  to authenticated
  using (user_id = (select auth.uid()));

-- =============================================================================
-- 5. Grant minimi (revoke all + re-grant per-colonna; anon a zero).
-- =============================================================================
revoke all on public.drop_comments from anon, authenticated;
grant  select on public.drop_comments to authenticated;
grant  insert (drop_id, parent_id, type, body, audio_url, audio_seconds)
  on public.drop_comments to authenticated;
grant  delete on public.drop_comments to authenticated;  -- NIENTE update (R-12)

revoke all on public.drop_likes from anon, authenticated;
grant  select on public.drop_likes to authenticated;
grant  insert (drop_id) on public.drop_likes to authenticated;
grant  delete on public.drop_likes to authenticated;     -- toggle diretto

revoke all on public.drop_saves from anon, authenticated;
grant  select on public.drop_saves to authenticated;     -- insert/delete via RPC

revoke all on function public.save_drop(uuid)   from public;
revoke all on function public.unsave_drop(uuid) from public;
grant  execute on function public.save_drop(uuid)   to authenticated;
grant  execute on function public.unsave_drop(uuid) to authenticated;

-- =============================================================================
-- 6. RPC di lettura — drops_feed / drop_detail (SECURITY DEFINER, precedente:
--    chat_overview). I contatori sono valorizzati SOLO per author_id = uid; il
--    predicato di visibilità replica ESATTAMENTE can_see_drop/policy sui drop
--    vivi (lezione chat_overview: la RPC non deve mai divergere dalla RLS).
--    Righe: colonne drop + author jsonb + stato personale + contatori privati.
-- =============================================================================
create or replace function public.drops_feed(
  p_before    timestamptz default null,
  p_before_id uuid        default null,
  p_limit     integer     default 20
)
returns table (
  id              uuid,
  author_id       uuid,
  type            text,
  body            text,
  audio_url       text,
  media_url       text,
  audio_seconds   integer,
  audience        text,
  expires_at      timestamptz,
  created_at      timestamptz,
  author          jsonb,
  mio_like        boolean,
  mio_salvataggio boolean,
  mie_reactions   text[],
  ha_commenti     boolean,
  like_count      integer,
  comment_count   integer,
  save_count      integer,
  reaction_counts jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  page as (
    select d.*
    from public.drops d, me
    where d.expires_at > now()
      and (d.author_id = me.uid or public.are_friends(d.author_id, me.uid))
      and (
        p_before is null
        or d.created_at < p_before
        or (d.created_at = p_before and d.id < p_before_id)
      )
    order by d.created_at desc, d.id desc
    limit least(coalesce(p_limit, 20), 50)
  )
  select
    d.id, d.author_id, d.type, d.body, d.audio_url, d.media_url, d.audio_seconds,
    d.audience, d.expires_at, d.created_at,
    jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'aura_score', p.aura_score, 'aura_color', p.aura_color
    ) as author,
    exists (select 1 from public.drop_likes l where l.drop_id = d.id and l.user_id = me.uid) as mio_like,
    exists (select 1 from public.drop_saves s where s.drop_id = d.id and s.user_id = me.uid) as mio_salvataggio,
    coalesce((
      select array_agg(r.trait::text order by r.trait::text)
      from public.drop_reactions r
      where r.drop_id = d.id and r.user_id = me.uid
    ), '{}'::text[]) as mie_reactions,
    exists (select 1 from public.drop_comments c where c.drop_id = d.id) as ha_commenti,
    -- Contatori privati (R-04): NULL per chiunque non sia l'autore.
    case when d.author_id = me.uid
      then (select count(*)::int from public.drop_likes    l where l.drop_id = d.id) end as like_count,
    case when d.author_id = me.uid
      then (select count(*)::int from public.drop_comments c where c.drop_id = d.id) end as comment_count,
    case when d.author_id = me.uid
      then (select count(*)::int from public.drop_saves    s where s.drop_id = d.id) end as save_count,
    case when d.author_id = me.uid
      then (select coalesce(jsonb_object_agg(t.trait, t.n), '{}'::jsonb)
            from (select r.trait::text as trait, count(*)::int as n
                  from public.drop_reactions r where r.drop_id = d.id
                  group by r.trait) t) end as reaction_counts
  from page d
  join public.profiles p on p.id = d.author_id
  cross join me
  order by d.created_at desc, d.id desc;
$$;

create or replace function public.drop_detail(p_drop uuid)
returns table (
  id              uuid,
  author_id       uuid,
  type            text,
  body            text,
  audio_url       text,
  media_url       text,
  audio_seconds   integer,
  audience        text,
  expires_at      timestamptz,
  created_at      timestamptz,
  author          jsonb,
  mio_like        boolean,
  mio_salvataggio boolean,
  mie_reactions   text[],
  ha_commenti     boolean,
  like_count      integer,
  comment_count   integer,
  save_count      integer,
  reaction_counts jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid)
  select
    d.id, d.author_id, d.type, d.body, d.audio_url, d.media_url, d.audio_seconds,
    d.audience, d.expires_at, d.created_at,
    jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'aura_score', p.aura_score, 'aura_color', p.aura_color
    ) as author,
    exists (select 1 from public.drop_likes l where l.drop_id = d.id and l.user_id = me.uid) as mio_like,
    exists (select 1 from public.drop_saves s where s.drop_id = d.id and s.user_id = me.uid) as mio_salvataggio,
    coalesce((
      select array_agg(r.trait::text order by r.trait::text)
      from public.drop_reactions r
      where r.drop_id = d.id and r.user_id = me.uid
    ), '{}'::text[]) as mie_reactions,
    exists (select 1 from public.drop_comments c where c.drop_id = d.id) as ha_commenti,
    case when d.author_id = me.uid
      then (select count(*)::int from public.drop_likes    l where l.drop_id = d.id) end as like_count,
    case when d.author_id = me.uid
      then (select count(*)::int from public.drop_comments c where c.drop_id = d.id) end as comment_count,
    case when d.author_id = me.uid
      then (select count(*)::int from public.drop_saves    s where s.drop_id = d.id) end as save_count,
    case when d.author_id = me.uid
      then (select coalesce(jsonb_object_agg(t.trait, t.n), '{}'::jsonb)
            from (select r.trait::text as trait, count(*)::int as n
                  from public.drop_reactions r where r.drop_id = d.id
                  group by r.trait) t) end as reaction_counts
  from public.drops d
  join public.profiles p on p.id = d.author_id
  cross join me
  where d.id = p_drop
    and d.expires_at > now()
    and (d.author_id = me.uid or public.are_friends(d.author_id, me.uid));
$$;

revoke all on function public.drops_feed(timestamptz, uuid, integer) from public;
revoke all on function public.drop_detail(uuid)                       from public;
grant  execute on function public.drops_feed(timestamptz, uuid, integer) to authenticated;
grant  execute on function public.drop_detail(uuid)                       to authenticated;
