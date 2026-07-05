-- =============================================================================
-- Televo — Drops M6 (DM0): il drop "post" (foto/audio/testo), solo-amici, 24h
-- =============================================================================
-- I drop diventano il sistema di post di Televo (docs/media/drop.md). Qui si
-- consolida il MODELLO del drop; le interazioni (commenti/like/salvataggi) e la
-- lettura via RPC vivono in 20260705150200_drops_interactions.sql, il ciclo di
-- vita (scadenza/pulizia/notifiche) in 20260705150300_drops_lifecycle.sql.
--
-- Decisioni di prodotto applicate (drop.md §14):
--  · R-02  audience SOLO 'friends' — la "scuola" esce dal progetto (D-3): il
--          ramo school sparisce da can_see_drop e dalla policy select; le righe
--          'school' esistenti diventano 'friends' PRIMA del nuovo constraint.
--  · R-03  id del drop generato dal client: il grant include `id` e i file si
--          caricano PRIMA dell'insert su path <drop_id>/<author_id>/… (outbox).
--          NB: la DEFAULT gen_random_uuid() della colonna popola già new.id nel
--          BEFORE trigger anche quando il client non lo fornisce (i default sono
--          applicati prima dei BEFORE trigger) → nessun coalesce esplicito.
--  · R-06  bucket privati dedicati (drop-media 15 MB immagini, drop-audio 25 MB
--          audio), lettura via can_see_drop, scrittura/delete su cartella propria.
--  · R-11  caption = `body` riusato: testo ≤ 2000, caption ≤ 280.
--
-- ⚠️ REGOLA ANTI-REGRESSIONE (verbatim + add): drops_before_insert è ridefinita
-- copiando il corpo live (20260701000100_aura_v3.sql) e AGGIUNGENDO solo i
-- blocchi nuovi. drops_after_insert (Aura participation) NON si tocca.

-- -----------------------------------------------------------------------------
-- 1. Colonne nuove: durata audio + snapshot statistiche finali (Ricordi).
--    stats_finali lo scrive SOLO il sistema alla scadenza (fuori dal grant).
-- -----------------------------------------------------------------------------
alter table public.drops add column if not exists audio_seconds integer;
alter table public.drops add column if not exists stats_finali  jsonb;

-- -----------------------------------------------------------------------------
-- 2. Audience solo-amici (R-02, D-3): bonifica righe school → friends, poi il
--    CHECK si restringe. La colonna resta (punto di estensione futuro 'circle').
-- -----------------------------------------------------------------------------
update public.drops set audience = 'friends' where audience <> 'friends';
alter table public.drops drop constraint if exists drops_audience_check;
alter table public.drops add constraint drops_audience_check check (audience in ('friends'));

-- -----------------------------------------------------------------------------
-- 3. can_see_drop v2 — senza il ramo 'school'. Autore (sempre, anche scaduti →
--    Ricordi) ∨ amico dell'autore su drop vivo. Stessa firma → create or replace.
-- -----------------------------------------------------------------------------
create or replace function public.can_see_drop(p_drop uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.drops d
    where d.id = p_drop
      and (d.expires_at > now() or d.author_id = uid)
      and (d.author_id = uid or public.are_friends(d.author_id, uid))
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. drops_before_insert v3 — corpo aura_v3 VERBATIM + validazioni M6.
--    Coerenza formato↔colonne (niente campi incrociati), path <id>/<author>/…
--    per audio/media, durata audio 1–300s, cap testo/caption, rate-limit 20/24h.
-- -----------------------------------------------------------------------------
create or replace function public.drops_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_recenti integer;
begin
  -- Campi di sistema forzati (mai fidarsi del client). new.id è già valorizzato:
  -- o dal client (R-03, per l'upload pre-insert) o dalla DEFAULT della colonna.
  new.author_id   := (select auth.uid());
  new.created_at  := now();
  new.expires_at  := now() + interval '24 hours';
  new.stats_finali := null;  -- lo scrive SOLO expire_content alla scadenza

  if not public.is_active_user(new.author_id) then raise exception 'user_not_active'; end if;

  -- Coerenza formato ↔ colonne + limiti (il grant per-colonna da solo non basta).
  if new.type = 'text' then
    if nullif(trim(new.body), '') is null then raise exception 'empty_drop'; end if;
    if new.audio_url is not null or new.media_url is not null or new.audio_seconds is not null then
      raise exception 'invalid_drop_fields';
    end if;
    if char_length(new.body) > 2000 then raise exception 'drop_too_long'; end if;

  elsif new.type = 'audio' then
    if nullif(trim(new.audio_url), '') is null then raise exception 'missing_audio'; end if;
    if new.media_url is not null then raise exception 'invalid_drop_fields'; end if;
    -- Path OBBLIGATORIO <drop_id>/<author_id>/… (anti riferimento a file altrui,
    -- pattern chat_media_hardening): la RLS storage dà lettura via can_see_drop.
    if new.audio_url not like format('%s/%s/%%', new.id, new.author_id) then
      raise exception 'invalid_audio_path';
    end if;
    if new.audio_seconds is null or new.audio_seconds < 1 or new.audio_seconds > 300 then
      raise exception 'invalid_audio_duration';
    end if;
    if new.body is not null and char_length(new.body) > 280 then raise exception 'caption_too_long'; end if;

  elsif new.type = 'media' then
    if nullif(trim(new.media_url), '') is null then raise exception 'missing_media'; end if;
    if new.audio_url is not null or new.audio_seconds is not null then raise exception 'invalid_drop_fields'; end if;
    if new.media_url not like format('%s/%s/%%', new.id, new.author_id) then
      raise exception 'invalid_media_path';
    end if;
    if new.body is not null and char_length(new.body) > 280 then raise exception 'caption_too_long'; end if;
  end if;

  -- Rate-limit anti-spam (RC-06): max 20 drop nelle ultime 24h per autore.
  select count(*) into v_recenti
  from public.drops
  where author_id = new.author_id and created_at > now() - interval '24 hours';
  if v_recenti >= 20 then raise exception 'rate_limited'; end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Policy select v2 — senza il ramo 'school' (drop + recreate).
-- -----------------------------------------------------------------------------
drop policy if exists drops_select_visible on public.drops;
create policy drops_select_visible
  on public.drops for select
  to authenticated
  using (
    author_id = (select auth.uid())
    or (
      expires_at > now()
      and public.are_friends(author_id, (select auth.uid()))
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Grant insert esteso: id (R-03) + audio_seconds. stats_finali resta fuori
--    (solo sistema). revoke insert prima, poi re-grant minimo per-colonna (CM8).
-- -----------------------------------------------------------------------------
revoke insert on public.drops from authenticated;
grant insert (id, type, body, audio_url, media_url, audio_seconds, audience)
  on public.drops to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Indice del feed keyset (author_id, created_at desc) — RC-03.
-- -----------------------------------------------------------------------------
create index if not exists drops_author_created_idx on public.drops (author_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 8. Bucket privati dedicati (R-06). drop-audio rispecchia voice-messages
--    (25 MB, stessi MIME m4a/mp3/…); drop-media rispecchia chat-media (15 MB
--    png/jpeg/webp). Path convenzionale <drop_id>/<author_id>/<file>.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('drop-media', 'drop-media', false, 15728640,  -- 15 MB
   array['image/png','image/jpeg','image/webp']),
  ('drop-audio', 'drop-audio', false, 26214400,  -- 25 MB
   array['audio/mpeg','audio/mp4','audio/aac','audio/webm','audio/ogg'])
on conflict (id) do nothing;

-- Lettura: chiunque possa vedere il drop (path[1] = drop_id). Per l'autore
-- can_see_drop è sempre vera → vale anche per i file dei Ricordi.
create policy drop_media_read_visible
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'drop-media'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.can_see_drop((storage.foldername(name))[1]::uuid, (select auth.uid()))
  );
-- Scrittura: solo la propria cartella (path[2] = uid). Il drop può non esistere
-- ancora (upload PRIMA dell'insert): nessun can_see_drop in scrittura.
create policy drop_media_write_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'drop-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
create policy drop_media_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'drop-media'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- drop-audio: condiviso da drop vocali e commenti vocali (prefissi file drop_/
-- commento_); stessa semantica di visibilità (path[1] = drop_id).
create policy drop_audio_read_visible
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'drop-audio'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and public.can_see_drop((storage.foldername(name))[1]::uuid, (select auth.uid()))
  );
create policy drop_audio_write_own
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'drop-audio'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
create policy drop_audio_delete_own
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'drop-audio'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- NB: le RPC di lettura drops_feed/drop_detail (contatori privati) vivono in
-- 20260705150200_drops_interactions.sql, DOPO la creazione delle tabelle
-- drop_likes/drop_saves/drop_comments che interrogano (dipendenza di catalogo:
-- una funzione SQL è validata alla CREATE, le tabelle devono già esistere).
