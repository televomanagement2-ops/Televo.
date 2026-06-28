-- =============================================================================
-- Televo — RPC redeem_invite (redenzione invito atomica + attivazione profilo)
-- =============================================================================
-- Eseguita come SECURITY DEFINER usando auth.uid() del chiamante.
-- Atomica: blocca la riga invito (FOR UPDATE) per evitare race sul contatore.
-- Difesa in profondità: ricontrolla l'età >=16 (già imposta dal trigger signup).

create or replace function public.redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_invite     public.invites%rowtype;
  v_birth_date date;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_not_found';
  end if;

  -- Idempotenza: se già verificato, non consumare un altro invito.
  if exists (select 1 from public.profiles where id = v_uid and age_verified) then
    return jsonb_build_object('ok', true, 'already_verified', true);
  end if;

  -- Lock dell'invito: evita doppia redenzione concorrente.
  select * into v_invite
  from public.invites
  where code = p_code
  for update;

  if not found then
    raise exception 'invite_invalid';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'invite_expired';
  end if;
  if v_invite.uses >= v_invite.max_uses then
    raise exception 'invite_exhausted';
  end if;

  -- Age-gate >=16 (difesa in profondità).
  select birth_date into v_birth_date
  from public.profiles_private
  where id = v_uid;

  if v_birth_date is null or v_birth_date > (current_date - interval '16 years') then
    raise exception 'age_below_minimum';
  end if;

  update public.invites
  set uses = uses + 1
  where code = p_code;

  update public.profiles
  set age_verified = true,
      school_id    = v_invite.school_id
  where id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'school_id', v_invite.school_id,
    'age_verified', true
  );
end;
$$;

revoke all on function public.redeem_invite(text) from public;
grant execute on function public.redeem_invite(text) to authenticated;
