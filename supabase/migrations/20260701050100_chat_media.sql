-- =============================================================================
-- Televo — Chat: foto/media nei messaggi (SRS §3.3 / §3.4, D3)
-- =============================================================================
-- I messaggi possono portare un'immagine. Come per i vocali, si salva il PATH nel
-- bucket privato `chat-media` (non un URL): la riproduzione lo firma alla lettura.
-- Bucket privato + RLS path-based `<conversation_id>/<user_id>/<file>` → specchio
-- esatto di `voice-messages` (tutela minori: MAI pubblico, SRS §1.3). Il valore enum
-- 'media' è già stato aggiunto in 20260701050000_chat_media_enum.sql.

-- -----------------------------------------------------------------------------
-- Colonne su messages (path storage + tipo media, es. 'image').
-- -----------------------------------------------------------------------------
alter table public.messages
  add column if not exists media_url  text,   -- path nel bucket chat-media
  add column if not exists media_type text;   -- 'image' (estendibile in futuro)

-- Grant insert ESTESO: additivo rispetto a quello di 20260628160200_messages.sql,
-- aggiunge le due colonne media (il trigger *_before_insert continua a forzare
-- sender/created_at/membership/expiry). Update invariato (body, deleted_at).
grant insert (conversation_id, type, body, audio_url, media_url, media_type, reply_to, expires_at)
  on public.messages to authenticated;

-- -----------------------------------------------------------------------------
-- Bucket privato chat-media (specchio di voice-messages).
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('chat-media', 'chat-media', false, 15728640,  -- 15 MB
   array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Lettura: i membri della conversazione cui appartiene il file (path[1] = conv_id).
create policy chat_media_read_members
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.is_conv_member((storage.foldername(name))[1]::uuid, (select auth.uid()))
  );

-- Scrittura: solo l'autore del file, dentro una sua conversazione (path[2] = uid).
create policy chat_media_write_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and public.is_conv_member((storage.foldername(name))[1]::uuid, (select auth.uid()))
  );

-- Cancellazione: solo il proprietario del file.
create policy chat_media_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- =============================================================================
-- Trigger notifica — anteprima MEDIA-AWARE (SRS §9.4). Ridefinizione additiva:
-- mantiene il filtro mute-aware del blocco A e distingue foto/vocale/testo nel body.
-- ('media' è ora un valore enum valido: questa migrazione gira DOPO l'enum.)
-- =============================================================================
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

  v_preview := case new.type
    when 'text'  then left(coalesce(new.body, ''), 120)
    when 'media' then '📷 Foto'
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
    and m.user_id <> new.sender_id
    and (m.muted_until is null or m.muted_until <= now());  -- mute-aware (D4)
  return new;
end;
$$;
