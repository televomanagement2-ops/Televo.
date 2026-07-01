-- =============================================================================
-- Rimozione forzata di un membro (solo admin) — M3 Gruppi/house
-- =============================================================================
-- Il backend aveva già `add_conversation_member` (admin) e `leave_conversation`
-- (uscita volontaria), ma NON un modo per un admin di rimuovere un altro membro.
-- Questa RPC colma il buco: stesso pattern SECURITY DEFINER delle sorelle in
-- 20260628160100_conversations.sql. Le DM non hanno gestione membri (nascono e
-- muoiono con la coppia), quindi la rimozione è vietata lì; per uscire da soli si
-- usa `leave_conversation` (che gestisce anche l'admin che se ne va).

create or replace function public.remove_conversation_member(p_conv uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_type public.conversation_type;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_conv_admin(p_conv, v_uid) then raise exception 'not_admin'; end if;

  select type into v_type from public.conversations where id = p_conv;
  if v_type is null then raise exception 'conversation_not_found'; end if;
  if v_type = 'dm' then raise exception 'cannot_remove_from_dm'; end if;

  -- L'admin non si rimuove con questa RPC: per uscire c'è `leave_conversation`.
  if p_user = v_uid then raise exception 'use_leave_conversation'; end if;

  delete from public.conversation_members
  where conversation_id = p_conv and user_id = p_user;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.remove_conversation_member(uuid, uuid) from public;
grant execute on function public.remove_conversation_member(uuid, uuid) to authenticated;
