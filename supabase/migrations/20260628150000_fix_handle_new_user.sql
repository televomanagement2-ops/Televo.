-- =============================================================================
-- Fix: handle_new_user — escaping del username da metadati
-- =============================================================================
-- Il trigger precedente non garantisce che il username rispetti la constraint.
-- Ora lo generiamo deterministicamente dal user ID se il metadato è assente/invalido.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username   text;
  v_birth_date date;
  v_sanitized  text;
begin
  v_username   := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  v_birth_date := (new.raw_user_meta_data ->> 'birth_date')::date;

  -- Se username manca, generalo dal user ID
  if v_username is null then
    v_username := 'user_' || substring(new.id::text, 1, 8);
  end if;

  if v_birth_date is null then
    raise exception 'birth_date mancante nei metadati di registrazione';
  end if;

  -- Age-gate >=16: blocca la creazione dell'account.
  if v_birth_date > (current_date - interval '16 years') then
    raise exception 'Devi avere almeno 16 anni per usare Televo';
  end if;

  -- Sanitizza username: lowercase, solo lettere/numeri/underscore/punto, max 20 car.
  v_sanitized := lower(regexp_replace(v_username, '[^a-z0-9_.]', '', 'g'));
  v_sanitized := substring(v_sanitized, 1, 20);

  if length(v_sanitized) < 3 then
    v_sanitized := 'user_' || substring(new.id::text, 1, 8);
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, v_sanitized, nullif(new.raw_user_meta_data ->> 'display_name', ''));

  insert into public.profiles_private (id, birth_date)
  values (new.id, v_birth_date);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
