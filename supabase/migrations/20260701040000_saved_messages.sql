-- =============================================================================
-- Televo — Chat: messaggi salvati (bookmark personale, SRS §3.11, D4)
-- =============================================================================
-- Bookmark PERSONALE e CROSS-CONVERSAZIONE: l'utente segna un messaggio per
-- ritrovarlo nella vista "Importante → Salvati" (S7). Owner-only: nessuno vede i
-- salvataggi altrui. Salvare è ammesso solo per i messaggi delle proprie
-- conversazioni (difesa in profondità oltre alla RLS di lettura di `messages`).

create table public.saved_messages (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

-- Lista "Salvati" ordinata per data (più recenti in cima).
create index saved_messages_user_created_idx
  on public.saved_messages (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- RPC: salva / rimuovi dai salvati (per l'utente corrente).
-- -----------------------------------------------------------------------------
create or replace function public.save_message(p_message uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_conv uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select conversation_id into v_conv from public.messages where id = p_message;
  if v_conv is null then raise exception 'message_not_found'; end if;
  if not public.is_conv_member(v_conv, v_uid) then raise exception 'not_conv_member'; end if;

  insert into public.saved_messages (user_id, message_id)
  values (v_uid, p_message)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.unsave_message(p_message uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from public.saved_messages
   where user_id = v_uid and message_id = p_message;
  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- Grants (lettura owner-only per la lista; scrittura solo via RPC)
-- =============================================================================
grant select on public.saved_messages to authenticated;

revoke all on function public.save_message(uuid) from public;
revoke all on function public.unsave_message(uuid) from public;
grant execute on function public.save_message(uuid) to authenticated;
grant execute on function public.unsave_message(uuid) to authenticated;

-- =============================================================================
-- Row Level Security — owner-only.
-- =============================================================================
alter table public.saved_messages enable row level security;

create policy saved_messages_select_own
  on public.saved_messages for select
  to authenticated
  using (user_id = (select auth.uid()));
