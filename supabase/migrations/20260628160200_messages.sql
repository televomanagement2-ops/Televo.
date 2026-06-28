-- =============================================================================
-- Televo — Social: messaggi (testo / audio / thread vocali, drop-in 24h)
-- =============================================================================
-- Inviati con INSERT diretto (pattern Realtime: il client si iscrive ai
-- postgres_changes). Il trigger forza sender_id, verifica la membership (difesa
-- in profondità oltre la RLS) e limita l'eventuale scadenza dei vocali effimeri
-- a max 24h. La streak viene toccata nella migrazione streaks (AFTER INSERT).

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  type            public.message_type not null default 'text',
  body            text,
  audio_url       text,
  reply_to        uuid references public.messages (id) on delete set null,
  expires_at      timestamptz,           -- impostato per i vocali "drop-in" 24h
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index messages_conv_created_idx on public.messages (conversation_id, created_at desc);
create index messages_expires_idx      on public.messages (expires_at) where expires_at is not null;

-- -----------------------------------------------------------------------------
-- Trigger INSERT: owner forzato, membership richiesta, expiry limitata, reply
-- coerente con la conversazione.
-- -----------------------------------------------------------------------------
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sender_id := (select auth.uid());
  new.created_at := now();
  new.deleted_at := null;

  if not public.is_conv_member(new.conversation_id, new.sender_id) then
    raise exception 'not_conv_member';
  end if;

  -- Scadenza vocali effimeri: ammessa solo nel futuro e mai oltre 24h.
  if new.expires_at is not null then
    if new.expires_at <= now() then
      raise exception 'invalid_expiry';
    end if;
    new.expires_at := least(new.expires_at, now() + interval '24 hours');
  end if;

  -- reply_to deve appartenere alla stessa conversazione.
  if new.reply_to is not null and not exists (
    select 1 from public.messages m
    where m.id = new.reply_to and m.conversation_id = new.conversation_id
  ) then
    raise exception 'invalid_reply_to';
  end if;

  return new;
end;
$$;

create trigger messages_before_insert_trg
  before insert on public.messages
  for each row execute function public.messages_before_insert();

-- Bump dell'updated_at della conversazione (ordina le chat per ultimo messaggio).
create or replace function public.messages_after_insert_bump()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_after_insert_bump_trg
  after insert on public.messages
  for each row execute function public.messages_after_insert_bump();

-- =============================================================================
-- Grants
-- =============================================================================
grant select on public.messages to authenticated;
grant insert (conversation_id, type, body, audio_url, reply_to, expires_at)
  on public.messages to authenticated;
grant update (body, deleted_at) on public.messages to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.messages enable row level security;

-- Lettura: membri della conversazione; i messaggi soft-deleted spariscono
-- (tranne per il loro autore).
create policy messages_select_member
  on public.messages for select
  to authenticated
  using (
    public.is_conv_member(conversation_id, (select auth.uid()))
    and (deleted_at is null or sender_id = (select auth.uid()))
  );

create policy messages_insert_member
  on public.messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_active_user((select auth.uid()))
    and public.is_conv_member(conversation_id, (select auth.uid()))
  );

-- Update: solo il mittente (edit del corpo / soft-delete).
create policy messages_update_own
  on public.messages for update
  to authenticated
  using (sender_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()));

-- =============================================================================
-- Storage — voice-messages: accesso ESTESO ai membri della conversazione.
-- Nuova convenzione path: "<conversation_id>/<user_id>/<file>".
-- Sostituisce la policy owner-only della Fase 1 (tutela minori: mai pubblico).
-- =============================================================================
drop policy if exists voice_messages_all_own on storage.objects;

-- Lettura: i membri della conversazione cui appartiene il file.
create policy voice_messages_read_members
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'voice-messages'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.is_conv_member((storage.foldername(name))[1]::uuid, (select auth.uid()))
  );

-- Scrittura/cancellazione: solo l'autore del file, dentro una sua conversazione.
create policy voice_messages_write_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'voice-messages'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.is_conv_member((storage.foldername(name))[1]::uuid, (select auth.uid()))
  );

create policy voice_messages_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'voice-messages'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
