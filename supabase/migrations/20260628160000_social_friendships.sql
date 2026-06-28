-- =============================================================================
-- Televo — Social: amicizie (mutuo consenso) + top friends
-- =============================================================================
-- Modello a MUTUO CONSENSO (non follow): l'amicizia è la chiave d'accesso alle
-- DM (decisione: si scrive solo agli amici accettati). La coppia è normalizzata
-- (user_id < friend_id) per avere UNA sola riga simmetrica. Le mutazioni passano
-- da RPC SECURITY DEFINER (come redeem_invite): gestiscono normalizzazione,
-- regole (no auto-amicizia, no accettare la propria richiesta) e blocchi. La
-- tabella è in sola lettura via RLS per le due parti coinvolte.

create type public.friendship_status as enum ('pending', 'accepted', 'blocked');

create table public.friendships (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  friend_id    uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  status       public.friendship_status not null default 'pending',
  blocked_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friendship_pair_ordered check (user_id < friend_id)
);

create index friendships_friend_idx on public.friendships (friend_id);
create index friendships_status_idx on public.friendships (status);

create trigger friendships_set_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- top_friends — la "cerchia stretta" ordinata, gestita dall'owner.
-- -----------------------------------------------------------------------------
create table public.top_friends (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  friend_id  uuid not null references public.profiles (id) on delete cascade,
  position   integer not null check (position between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (user_id, position),
  unique (user_id, friend_id),
  constraint top_friend_not_self check (user_id <> friend_id)
);

-- -----------------------------------------------------------------------------
-- Helper RLS: amicizia accettata / coppia bloccata (simmetrici).
-- -----------------------------------------------------------------------------
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.user_id = least(a, b)
      and f.friend_id = greatest(a, b)
      and f.status = 'accepted'
  );
$$;

create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.user_id = least(a, b)
      and f.friend_id = greatest(a, b)
      and f.status = 'blocked'
  );
$$;

-- -----------------------------------------------------------------------------
-- RPC: invia richiesta di amicizia (o accetta automaticamente se reciproca).
-- -----------------------------------------------------------------------------
create or replace function public.send_friend_request(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_a   uuid := least((select auth.uid()), p_target);
  v_b   uuid := greatest((select auth.uid()), p_target);
  v_row public.friendships%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_target is null or p_target = v_uid then raise exception 'invalid_target'; end if;
  if not public.is_active_user(v_uid) then raise exception 'user_not_active'; end if;
  if not exists (select 1 from public.profiles where id = p_target and deleted_at is null) then
    raise exception 'target_not_found';
  end if;

  select * into v_row from public.friendships
  where user_id = v_a and friend_id = v_b for update;

  if not found then
    insert into public.friendships (user_id, friend_id, requested_by, status)
    values (v_a, v_b, v_uid, 'pending');
    return jsonb_build_object('ok', true, 'status', 'pending');
  elsif v_row.status = 'blocked' then
    raise exception 'blocked';
  elsif v_row.status = 'accepted' then
    return jsonb_build_object('ok', true, 'status', 'already_friends');
  else  -- pending
    if v_row.requested_by = v_uid then
      return jsonb_build_object('ok', true, 'status', 'pending');  -- idempotente
    end if;
    -- L'altro aveva già richiesto: la mia richiesta vale come accettazione.
    update public.friendships set status = 'accepted'
    where user_id = v_a and friend_id = v_b;
    perform public.emit_aura(v_a, 'welcoming', 3, 'friendship', null);
    perform public.emit_aura(v_b, 'welcoming', 3, 'friendship', null);
    return jsonb_build_object('ok', true, 'status', 'accepted');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: accetta una richiesta pendente ricevuta (non puoi accettare la tua).
-- -----------------------------------------------------------------------------
create or replace function public.accept_friend_request(p_other uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_a   uuid := least((select auth.uid()), p_other);
  v_b   uuid := greatest((select auth.uid()), p_other);
  v_row public.friendships%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_row from public.friendships
  where user_id = v_a and friend_id = v_b for update;

  if not found or v_row.status <> 'pending' then raise exception 'no_pending_request'; end if;
  if v_row.requested_by = v_uid then raise exception 'cannot_accept_own_request'; end if;

  update public.friendships set status = 'accepted'
  where user_id = v_a and friend_id = v_b;
  perform public.emit_aura(v_a, 'welcoming', 3, 'friendship', null);
  perform public.emit_aura(v_b, 'welcoming', 3, 'friendship', null);
  return jsonb_build_object('ok', true, 'status', 'accepted');
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: rimuovi (unfriend / annulla richiesta / rifiuta). Cancella la riga.
-- -----------------------------------------------------------------------------
create or replace function public.remove_friend(p_other uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_a   uuid := least((select auth.uid()), p_other);
  v_b   uuid := greatest((select auth.uid()), p_other);
  v_row public.friendships%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_row from public.friendships
  where user_id = v_a and friend_id = v_b for update;
  if not found then return jsonb_build_object('ok', true, 'status', 'none'); end if;
  -- Non si "rimuove" un blocco scrivendo qui: serve unblock_user.
  if v_row.status = 'blocked' then raise exception 'blocked'; end if;

  delete from public.friendships where user_id = v_a and friend_id = v_b;
  delete from public.top_friends
  where (user_id = v_uid and friend_id = p_other)
     or (user_id = p_other and friend_id = v_uid);
  return jsonb_build_object('ok', true, 'status', 'removed');
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: blocca un utente (interrompe amicizia e impedisce ogni contatto).
-- -----------------------------------------------------------------------------
create or replace function public.block_user(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_a   uuid := least((select auth.uid()), p_target);
  v_b   uuid := greatest((select auth.uid()), p_target);
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_target is null or p_target = v_uid then raise exception 'invalid_target'; end if;

  insert into public.friendships (user_id, friend_id, requested_by, status, blocked_by)
  values (v_a, v_b, v_uid, 'blocked', v_uid)
  on conflict (user_id, friend_id)
  do update set status = 'blocked', blocked_by = v_uid, updated_at = now();

  delete from public.top_friends
  where (user_id = v_uid and friend_id = p_target)
     or (user_id = p_target and friend_id = v_uid);
  return jsonb_build_object('ok', true, 'status', 'blocked');
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: sblocca (solo chi ha bloccato). Riporta la coppia a "nessuna relazione".
-- -----------------------------------------------------------------------------
create or replace function public.unblock_user(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_a   uuid := least((select auth.uid()), p_target);
  v_b   uuid := greatest((select auth.uid()), p_target);
  v_row public.friendships%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_row from public.friendships
  where user_id = v_a and friend_id = v_b for update;
  if not found or v_row.status <> 'blocked' then raise exception 'not_blocked'; end if;
  if v_row.blocked_by <> v_uid then raise exception 'not_blocker'; end if;

  delete from public.friendships where user_id = v_a and friend_id = v_b;
  return jsonb_build_object('ok', true, 'status', 'unblocked');
end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger top_friends: forza l'owner e impone l'amicizia accettata.
-- -----------------------------------------------------------------------------
create or replace function public.top_friends_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := (select auth.uid());
  if not public.are_friends(new.user_id, new.friend_id) then
    raise exception 'not_friends';
  end if;
  return new;
end;
$$;

create trigger top_friends_before_write_trg
  before insert or update on public.top_friends
  for each row execute function public.top_friends_before_write();

-- =============================================================================
-- Grants
-- =============================================================================
-- friendships: SOLO lettura diretta; le mutazioni passano dalle RPC.
grant select on public.friendships to authenticated;

grant select, insert, delete on public.top_friends to authenticated;
grant update (friend_id, position) on public.top_friends to authenticated;

revoke all on function public.send_friend_request(uuid)    from public;
revoke all on function public.accept_friend_request(uuid)  from public;
revoke all on function public.remove_friend(uuid)          from public;
revoke all on function public.block_user(uuid)             from public;
revoke all on function public.unblock_user(uuid)           from public;
grant execute on function public.send_friend_request(uuid)   to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid)         to authenticated;
grant execute on function public.block_user(uuid)            to authenticated;
grant execute on function public.unblock_user(uuid)          to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.friendships enable row level security;
alter table public.top_friends enable row level security;

-- friendships: visibile solo alle due parti (i blocchi restano privati).
create policy friendships_select_parties
  on public.friendships for select
  to authenticated
  using (user_id = (select auth.uid()) or friend_id = (select auth.uid()));

-- top_friends: l'owner gestisce la propria cerchia; gli amici possono vederla.
create policy top_friends_select_visible
  on public.top_friends for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.are_friends(user_id, (select auth.uid()))
  );

create policy top_friends_insert_own
  on public.top_friends for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy top_friends_update_own
  on public.top_friends for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy top_friends_delete_own
  on public.top_friends for delete
  to authenticated
  using (user_id = (select auth.uid()));
