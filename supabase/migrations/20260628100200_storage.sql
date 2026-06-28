-- =============================================================================
-- Televo — Storage buckets + policy
-- =============================================================================
-- Convenzione path: ogni file sta nella cartella dell'utente -> "<user_id>/..."
-- Così l'ownership è verificabile via (storage.foldername(name))[1].
--
-- avatars        : lettura pubblica (immagini profilo).
-- audio-bio      : PRIVATO. Voce dei minori mai esposta -> al lancio solo owner.
-- voice-messages : PRIVATO. Al lancio solo owner; in fase social verrà esteso
--                  ai membri della conversazione via signed URL server-mediati.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880,
   array['image/png','image/jpeg','image/webp']),
  ('audio-bio', 'audio-bio', false, 10485760,
   array['audio/mpeg','audio/mp4','audio/aac','audio/webm','audio/ogg']),
  ('voice-messages', 'voice-messages', false, 26214400,
   array['audio/mpeg','audio/mp4','audio/aac','audio/webm','audio/ogg'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- avatars: chiunque (autenticato) può leggere; scrittura solo nella propria cartella.
-- -----------------------------------------------------------------------------
create policy avatars_read_all
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');

create policy avatars_insert_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- -----------------------------------------------------------------------------
-- audio-bio: privato, solo owner (lettura/scrittura). Esposizione agli altri
-- avverrà in seguito via funzione server-side (signed URL), con tutela minori.
-- -----------------------------------------------------------------------------
create policy audio_bio_all_own
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'audio-bio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'audio-bio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- -----------------------------------------------------------------------------
-- voice-messages: privato, solo owner per ora (esteso ai membri conversazione
-- nella fase social).
-- -----------------------------------------------------------------------------
create policy voice_messages_all_own
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'voice-messages'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'voice-messages'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
