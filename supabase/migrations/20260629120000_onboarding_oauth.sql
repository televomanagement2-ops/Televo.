-- =============================================================================
-- Televo — Onboarding differito + OAuth + inviti a catena (school-free)
-- =============================================================================
-- Perché:
--  * Google (OAuth) NON fornisce birth_date al momento dell'insert di auth.users:
--    il vecchio handle_new_user, che la pretendeva, faceva FALLIRE il signup OAuth.
--  * L'invito si può consumare solo DOPO l'auth (serve il JWT): per l'onboarding
--    serve una validazione di SOLA LETTURA, e una finalizzazione atomica.
--  * Le scuole escono dal path invito (modello non scalabile): l'invito diventa un
--    codice puro a catena. school_id resta nullable e non valorizzato qui.
--
-- Strategia:
--  1) handle_new_user crea solo lo SCHELETRO del profilo (username temporaneo,
--     age_verified=false), tollerante a metadati assenti (email-OTP e Google).
--  2) complete_onboarding(...) finalizza: età >=16 + username + birth_date +
--     redenzione invito, tutto atomico. Path UNICO per email e Google.
--  3) check_invite(code) valida il codice SENZA consumarlo (callabile da anon).
--  4) create_invite() genera codici monouso per la catena (budget per utente).

-- -----------------------------------------------------------------------------
-- Inviti school-free: il codice non è più legato a una scuola.
-- -----------------------------------------------------------------------------
alter table public.invites alter column school_id drop not null;

-- -----------------------------------------------------------------------------
-- handle_new_user (v3): solo scheletro profilo, tollerante a OAuth.
-- Non inserisce più profiles_private (birth_date arriva da complete_onboarding).
-- Gli utenti già esistenti non sono toccati (il trigger scatta solo su INSERT).
-- -----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username  text;
  v_sanitized text;
begin
  -- Username eventualmente passato dai metadati (email path); altrimenti temporaneo.
  v_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');

  if v_username is not null then
    v_sanitized := substring(lower(regexp_replace(v_username, '[^a-z0-9_.]', '', 'g')), 1, 20);
  end if;

  -- Fallback deterministico se assente/troppo corto (es. signup Google).
  if v_sanitized is null or length(v_sanitized) < 3 then
    v_sanitized := 'user_' || substring(new.id::text, 1, 8);
  end if;

  -- Scheletro: profilo non verificato. birth_date e username definitivo li imposta
  -- complete_onboarding. Niente insert in profiles_private qui.
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    v_sanitized,
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- check_invite(code): valida un codice SENZA consumarlo. Read-only.
-- Callabile anche da anon (la UI valida prima del login). Espone solo
-- { valid, reason }: nessun dato sensibile, nessuna scuola.
-- -----------------------------------------------------------------------------
create or replace function public.check_invite(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invite public.invites%rowtype;
begin
  if p_code is null or trim(p_code) = '' then
    return jsonb_build_object('valid', false, 'reason', 'missing_code');
  end if;

  select * into v_invite
  from public.invites
  where code = trim(p_code);

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'invite_invalid');
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return jsonb_build_object('valid', false, 'reason', 'invite_expired');
  end if;
  if v_invite.uses >= v_invite.max_uses then
    return jsonb_build_object('valid', false, 'reason', 'invite_exhausted');
  end if;

  return jsonb_build_object('valid', true, 'reason', null);
end;
$$;

-- -----------------------------------------------------------------------------
-- complete_onboarding(...): finalizza l'account in modo ATOMICO.
-- Valida età >=16, username (formato + unicità), salva birth_date, e consuma
-- l'invito (uses+1, age_verified=true). Idempotente: se già verificato, no-op.
-- Errori come codici-stringa (mappati a HTTP/UX lato client).
-- -----------------------------------------------------------------------------
create or replace function public.complete_onboarding(
  p_username     text,
  p_display_name text,
  p_birth_date   date,
  p_invite_code  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_username text;
  v_invite   public.invites%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile_not_found';
  end if;

  -- Idempotenza: già onboardato → non consumare un altro invito.
  if exists (select 1 from public.profiles where id = v_uid and age_verified) then
    return jsonb_build_object('ok', true, 'already_verified', true);
  end if;

  -- Età >=16 (hard gate, difesa in profondità anche lato DB).
  if p_birth_date is null or p_birth_date > (current_date - interval '16 years') then
    raise exception 'age_below_minimum';
  end if;

  -- Username: normalizza (lowercase) e valida formato.
  v_username := lower(trim(coalesce(p_username, '')));
  if v_username !~ '^[a-z0-9_.]{3,20}$' then
    raise exception 'username_invalid';
  end if;
  if exists (
    select 1 from public.profiles
    where username = v_username::extensions.citext and id <> v_uid
  ) then
    raise exception 'username_taken';
  end if;

  -- Invito: lock della riga, controlli, consumo (atomico con il resto).
  select * into v_invite
  from public.invites
  where code = trim(p_invite_code)
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

  -- birth_date nel posto sensibile.
  insert into public.profiles_private (id, birth_date)
  values (v_uid, p_birth_date)
  on conflict (id) do update set birth_date = excluded.birth_date;

  -- Consuma invito + attiva profilo (NIENTE school_id: invito school-free).
  update public.invites set uses = uses + 1 where code = v_invite.code;

  update public.profiles
  set username     = v_username,
      display_name = nullif(trim(coalesce(p_display_name, '')), ''),
      age_verified = true
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- create_invite(): genera un invito monouso per la catena. Budget per utente.
-- Codice generico (school_id null), scadenza 14 giorni. Pronto per "Invita amici".
-- -----------------------------------------------------------------------------
create or replace function public.create_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_budget   constant int := 5;     -- inviti "vivi" simultanei per utente
  -- Alfabeto senza caratteri ambigui (niente 0/O/1/I).
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_active   int;
  v_code     text;
  v_exp      timestamptz := now() + interval '14 days';
  v_try      int := 0;
  i          int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_active_user(v_uid) then
    raise exception 'not_active';
  end if;

  -- Budget: conta solo gli inviti dell'utente ancora utilizzabili.
  select count(*) into v_active
  from public.invites
  where created_by = v_uid
    and uses < max_uses
    and (expires_at is null or expires_at > now());

  if v_active >= v_budget then
    raise exception 'invite_budget_exhausted';
  end if;

  -- Codice leggibile senza caratteri ambigui; retry in caso di collisione.
  loop
    v_try := v_try + 1;
    v_code := 'TLV-';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into public.invites (code, school_id, created_by, max_uses, uses, expires_at)
      values (v_code, null, v_uid, 1, 0, v_exp);
      exit;  -- inserito con successo
    exception when unique_violation then
      if v_try >= 5 then
        raise exception 'invite_generation_failed';
      end if;
    end;
  end loop;

  return jsonb_build_object('code', v_code, 'expires_at', v_exp);
end;
$$;

-- =============================================================================
-- Grants — auto-expose OFF: concediamo esplicitamente.
-- =============================================================================
revoke all on function public.check_invite(text)        from public;
revoke all on function public.complete_onboarding(text, text, date, text) from public;
revoke all on function public.create_invite()           from public;

-- check_invite: anche anon (validazione codice PRIMA del login).
grant execute on function public.check_invite(text) to anon, authenticated;
grant execute on function public.complete_onboarding(text, text, date, text) to authenticated;
grant execute on function public.create_invite() to authenticated;
