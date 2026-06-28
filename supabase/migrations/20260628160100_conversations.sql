-- =============================================================================
-- Televo — Social: conversazioni (DM / group / stanza-casa) + membri
-- =============================================================================
-- Tipi: 'dm' (1:1, SOLO tra amici accettati), 'group' (gruppo di amici),
-- 'house' (stanza-casa = micro-community stabile). Le DM sono uniche per coppia
-- (dm_key). Membership e creazione passano da RPC SECURITY DEFINER; la lettura è
-- via RLS ai soli membri (helper is_conv_member rompe la ricorsione RLS).

create type public.conversation_type as enum ('dm', 'group', 'house');
create type public.message_type      as enum ('text', 'audio', 'voice_thread');

create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  type       public.conversation_type not null,
  name       text,
  topic      text,
  avatar_url text,
  dm_key     text,                       -- "<least>:<greatest>" solo per le DM
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una sola DM per coppia.
create unique index conversations_dm_key_uidx
  on public.conversations (dm_key) where type = 'dm';

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null default 'member' check (role in ('admin', 'member')),
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id);

-- -----------------------------------------------------------------------------
-- Helper RLS (SECURITY DEFINER → niente ricorsione tra le due tabelle).
-- -----------------------------------------------------------------------------
create or replace function public.is_conv_member(p_conv uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conv and m.user_id = uid
  );
$$;

create or replace function public.is_conv_admin(p_conv uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conv and m.user_id = uid and m.role = 'admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- RPC: ottieni o crea la DM con un amico (solo tra amici accettati).
-- -----------------------------------------------------------------------------
create or replace function public.get_or_create_dm(p_other uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_key text := least((select auth.uid()), p_other)::text || ':' ||
                greatest((select auth.uid()), p_other)::text;
  v_id  uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_other is null or p_other = v_uid then raise exception 'invalid_target'; end if;
  if not public.are_friends(v_uid, p_other) then raise exception 'not_friends'; end if;

  select id into v_id from public.conversations where type = 'dm' and dm_key = v_key;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'conversation_id', v_id, 'created', false);
  end if;

  insert into public.conversations (type, dm_key, created_by)
  values ('dm', v_key, v_uid)
  on conflict (dm_key) where type = 'dm' do nothing
  returning id into v_id;

  if v_id is null then  -- race: l'ha creata un'altra transazione
    select id into v_id from public.conversations where type = 'dm' and dm_key = v_key;
    return jsonb_build_object('ok', true, 'conversation_id', v_id, 'created', false);
  end if;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_id, v_uid, 'member'), (v_id, p_other, 'member');
  return jsonb_build_object('ok', true, 'conversation_id', v_id, 'created', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: crea un gruppo o una stanza-casa con membri (amici del creatore).
-- -----------------------------------------------------------------------------
create or replace function public.create_group_conversation(
  p_type    public.conversation_type,
  p_name    text,
  p_members uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
  v_m   uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_type = 'dm' then raise exception 'use_get_or_create_dm'; end if;
  if not public.is_active_user(v_uid) then raise exception 'user_not_active'; end if;

  insert into public.conversations (type, name, created_by)
  values (p_type, nullif(trim(p_name), ''), v_uid)
  returning id into v_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_id, v_uid, 'admin');

  foreach v_m in array coalesce(p_members, '{}')
  loop
    if v_m <> v_uid and public.are_friends(v_uid, v_m) then
      insert into public.conversation_members (conversation_id, user_id, role)
      values (v_id, v_m, 'member')
      on conflict do nothing;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'conversation_id', v_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: aggiungi un membro (solo admin; amico per group, stessa scuola per house).
-- -----------------------------------------------------------------------------
create or replace function public.add_conversation_member(p_conv uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_type public.conversation_type;
  v_ok   boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_conv_admin(p_conv, v_uid) then raise exception 'not_admin'; end if;

  select type into v_type from public.conversations where id = p_conv;
  if v_type is null then raise exception 'conversation_not_found'; end if;
  if v_type = 'dm' then raise exception 'cannot_add_to_dm'; end if;

  if v_type = 'house' then
    v_ok := public.are_friends(v_uid, p_user) or exists (
      select 1 from public.profiles a, public.profiles b
      where a.id = v_uid and b.id = p_user
        and a.school_id is not null and a.school_id = b.school_id
    );
  else
    v_ok := public.are_friends(v_uid, p_user);
  end if;
  if not v_ok then raise exception 'not_allowed'; end if;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (p_conv, p_user, 'member')
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: abbandona conversazione / segna come letta.
-- -----------------------------------------------------------------------------
create or replace function public.leave_conversation(p_conv uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from public.conversation_members
  where conversation_id = p_conv and user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mark_conversation_read(p_conv uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  update public.conversation_members set last_read_at = now()
  where conversation_id = p_conv and user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- Grants (mutazioni via RPC: alle tabelle solo SELECT)
-- =============================================================================
grant select on public.conversations        to authenticated;
grant select on public.conversation_members to authenticated;

revoke all on function public.get_or_create_dm(uuid) from public;
revoke all on function public.create_group_conversation(public.conversation_type, text, uuid[]) from public;
revoke all on function public.add_conversation_member(uuid, uuid) from public;
revoke all on function public.leave_conversation(uuid) from public;
revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
grant execute on function public.create_group_conversation(public.conversation_type, text, uuid[]) to authenticated;
grant execute on function public.add_conversation_member(uuid, uuid) to authenticated;
grant execute on function public.leave_conversation(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;

create policy conversations_select_member
  on public.conversations for select
  to authenticated
  using (public.is_conv_member(id, (select auth.uid())));

create policy conversation_members_select_member
  on public.conversation_members for select
  to authenticated
  using (public.is_conv_member(conversation_id, (select auth.uid())));
