-- =============================================================================
-- Televo — Notifiche & dispositivi (push Expo, scritte solo lato server)
-- =============================================================================
-- Le notifiche sono un ledger owner-only: accodate da trigger/funzioni SECURITY
-- DEFINER su eventi reali (richiesta amicizia, accettazione, messaggio, prop,
-- traguardo). L'invio push è asincrono: la Edge Function `send-push` preleva le
-- righe con `pushed_at is null`, invia via Expo ai `devices` dell'utente e le
-- marca. Lo scheduling avviene via pg_cron → pg_net (net.http_post) con header
-- x-cron-secret; i segreti vivono in Vault (mai in git).

-- pg_net: per invocare la Edge Function dallo scheduler.
create extension if not exists pg_net;
-- supabase_vault: segreti per le chiamate cron (url, service key, cron secret).
create extension if not exists supabase_vault;

create type public.notification_type as enum (
  'friend_request',   -- hai ricevuto una richiesta di amicizia
  'friend_accepted',  -- la tua richiesta è stata accettata
  'message',          -- nuovo messaggio in una conversazione
  'prop',             -- qualcuno ti ha dato un prop (riconoscimento di carattere)
  'achievement'       -- hai sbloccato un traguardo
);

-- -----------------------------------------------------------------------------
-- devices — token push Expo per multi-device. Un token appartiene a UN utente
-- (al re-login viene riassegnato). Sostituisce la singola colonna su profiles.
-- -----------------------------------------------------------------------------
create table public.devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null unique,
  platform        text not null default 'ios' check (platform in ('ios', 'android', 'web')),
  last_seen       timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index devices_user_idx on public.devices (user_id);

-- -----------------------------------------------------------------------------
-- notifications — ledger owner-only. `pushed_at` = inviata via push; `read_at` =
-- letta in-app dall'utente.
-- -----------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       public.notification_type not null,
  title      text not null,
  body       text,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  pushed_at  timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_unpushed_idx      on public.notifications (created_at) where pushed_at is null;
create index notifications_unread_idx        on public.notifications (user_id)    where read_at  is null;

-- -----------------------------------------------------------------------------
-- RPC: registra/aggiorna il proprio dispositivo (upsert per token).
-- -----------------------------------------------------------------------------
create or replace function public.register_device(p_token text, p_platform text default 'ios')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if nullif(trim(coalesce(p_token, '')), '') is null then raise exception 'invalid_token'; end if;

  insert into public.devices (user_id, expo_push_token, platform, last_seen)
  values (v_uid, p_token, coalesce(nullif(p_platform, ''), 'ios'), now())
  on conflict (expo_push_token)
  do update set user_id = v_uid, platform = excluded.platform, last_seen = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.unregister_device(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from public.devices where expo_push_token = p_token and user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- enqueue_notification — unico punto di accodamento (salta utenti cancellati).
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_notification(
  p_user    uuid,
  p_type    public.notification_type,
  p_title   text,
  p_body    text default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then return; end if;
  if not exists (select 1 from public.profiles where id = p_user and deleted_at is null) then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, payload)
  values (p_user, p_type, p_title, p_body, coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger: richiesta di amicizia ricevuta -> notifica al destinatario.
-- (Solo sui nuovi 'pending'; i blocchi non notificano.)
-- -----------------------------------------------------------------------------
create or replace function public.friendships_after_insert_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_name   text;
begin
  if new.status <> 'pending' then return new; end if;
  v_target := case when new.requested_by = new.user_id then new.friend_id else new.user_id end;
  select coalesce(display_name, username::text) into v_name
  from public.profiles where id = new.requested_by;
  perform public.enqueue_notification(
    v_target, 'friend_request',
    coalesce(v_name, 'Qualcuno') || ' vuole essere tuo amico',
    null,
    jsonb_build_object('from', new.requested_by)
  );
  return new;
end;
$$;

create trigger friendships_after_insert_notify_trg
  after insert on public.friendships
  for each row execute function public.friendships_after_insert_notify();

-- Amicizia accettata -> notifica a chi aveva inviato la richiesta.
create or replace function public.friendships_after_update_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acceptor uuid;
  v_name     text;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    v_acceptor := case when new.requested_by = new.user_id then new.friend_id else new.user_id end;
    select coalesce(display_name, username::text) into v_name
    from public.profiles where id = v_acceptor;
    perform public.enqueue_notification(
      new.requested_by, 'friend_accepted',
      coalesce(v_name, 'Qualcuno') || ' ha accettato la tua richiesta',
      null,
      jsonb_build_object('friend', v_acceptor)
    );
  end if;
  return new;
end;
$$;

create trigger friendships_after_update_notify_trg
  after update on public.friendships
  for each row execute function public.friendships_after_update_notify();

-- -----------------------------------------------------------------------------
-- Trigger: nuovo messaggio -> notifica a tutti i membri tranne il mittente.
-- -----------------------------------------------------------------------------
create or replace function public.messages_after_insert_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender  text;
  v_preview text;
  v_conv    public.conversations%rowtype;
begin
  select coalesce(display_name, username::text) into v_sender
  from public.profiles where id = new.sender_id;
  select * into v_conv from public.conversations where id = new.conversation_id;

  v_preview := case
    when new.type = 'text' then left(coalesce(new.body, ''), 120)
    else '🎙️ Messaggio vocale'
  end;

  insert into public.notifications (user_id, type, title, body, payload)
  select m.user_id, 'message',
         case when v_conv.type = 'dm' then coalesce(v_sender, 'Nuovo messaggio')
              else coalesce(v_conv.name, 'Gruppo') || ' • ' || coalesce(v_sender, '') end,
         v_preview,
         jsonb_build_object('conversation_id', new.conversation_id,
                            'sender_id', new.sender_id, 'message_id', new.id)
  from public.conversation_members m
  join public.profiles p on p.id = m.user_id and p.deleted_at is null
  where m.conversation_id = new.conversation_id
    and m.user_id <> new.sender_id;
  return new;
end;
$$;

create trigger messages_after_insert_notify_trg
  after insert on public.messages
  for each row execute function public.messages_after_insert_notify();

-- -----------------------------------------------------------------------------
-- Trigger: prop ricevuto -> notifica al destinatario.
-- -----------------------------------------------------------------------------
create or replace function public.props_after_insert_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_giver text;
begin
  select coalesce(display_name, username::text) into v_giver
  from public.profiles where id = new.giver;
  perform public.enqueue_notification(
    new.recipient, 'prop',
    coalesce(v_giver, 'Qualcuno') || ' ti ha dato un prop',
    new.trait::text,
    jsonb_build_object('from', new.giver, 'trait', new.trait::text,
                       'source_type', new.source_type, 'source_id', new.source_id)
  );
  return new;
end;
$$;

create trigger props_after_insert_notify_trg
  after insert on public.props
  for each row execute function public.props_after_insert_notify();

-- =============================================================================
-- dispatch_push — invocata da pg_cron: chiama la Edge Function send-push solo se
-- ci sono notifiche da inviare. URL/chiavi vivono in Vault (no-op se assenti).
-- =============================================================================
create or replace function public.dispatch_push()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_key    text;
  v_secret text;
begin
  -- Niente da inviare: evita chiamate HTTP a vuoto.
  if not exists (select 1 from public.notifications where pushed_at is null) then
    return;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'edge_base_url';
  select decrypted_secret into v_key    from vault.decrypted_secrets where name = 'service_role_key';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';

  -- Non configurato (lancio futuro): no-op finché i segreti non sono in Vault.
  if v_url is null or v_key is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'x-cron-secret', v_secret
    ),
    body    := '{}'::jsonb
  );
end;
$$;

-- =============================================================================
-- Grants
-- =============================================================================
grant select on public.devices to authenticated;          -- mutazioni via RPC
grant select on public.notifications to authenticated;     -- ristretto da RLS all'owner
grant update (read_at) on public.notifications to authenticated;

revoke all on function public.register_device(text, text)   from public;
revoke all on function public.unregister_device(text)       from public;
revoke all on function public.enqueue_notification(uuid, public.notification_type, text, text, jsonb) from public;
revoke all on function public.dispatch_push()               from public;
grant execute on function public.register_device(text, text) to authenticated;
grant execute on function public.unregister_device(text)     to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.devices       enable row level security;
alter table public.notifications enable row level security;

create policy devices_select_own
  on public.devices for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Update consentito solo sul proprio (e solo la colonna read_at via grant).
create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- =============================================================================
-- Scheduling (pg_cron) — invio push ogni minuto.
-- =============================================================================
select cron.schedule(
  'dispatch-push-minutely',
  '* * * * *',
  $$ select public.dispatch_push(); $$
);
