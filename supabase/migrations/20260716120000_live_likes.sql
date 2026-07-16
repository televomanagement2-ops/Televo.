-- =============================================================================
-- Televo — Rework Live M15 (LR0): dominio like (`live_likes`)
-- =============================================================================
-- Prima wave del rework Live (docs/live/live-rework.md, Parte II §11 LR0): il
-- like stile TikTok Live — ILLIMITATO e NON-toggle (ogni tap = +1) — nasce a DB
-- con tutte le guardie, il contatore e il realtime. Dominio NUOVO che si innesta
-- sulle fondamenta M12 (20260709120100_live_foundation.sql) e ne SPECCHIA i
-- pattern collaudati: insert diretta dal client arbitrata da un trigger BEFORE
-- (come live_comments), sync a delta del contatore (come sync_live_viewer_count),
-- realtime via postgres_changes + RLS can_see_live (un solo canale coi commenti).
--
-- Fuori da LR0 (staged come M6/M7/M12, le porte di lettura si ridefiniscono dopo):
--   · grant pubblico viewer_count/like_count + lives_feed v3 (ranking) + live_detail v3 → LR1
--   · lives_strip() (striscia terminate <24h)                                          → LR2
--   · expire_content v9 (purge like 24h) / process_account_deletion v8 / gdpr-export v6 → LR3
--   · pgTAP (rovesciamenti R-04 per le live + nuove invarianti live_likes)              → LR4
--
-- Regole d'oro applicate (CLAUDE.md §6, live-rework.md §0.5):
--  · Visibilità SOLO amici (accettati) via l'UNICO predicato can_see_live —
--    estranei, coppie bloccate, kickati e co-host rimossi restano fuori sia in
--    RLS (canale postgres_changes) sia nel trigger arbitro (§3.3).
--  · is_active_user() sul percorso di CREAZIONE (mute/ban bloccano anche i like).
--  · Nessun campo di sistema dal client: user_id/created_at forzati dal trigger;
--    grant insert PER-COLONNA (live_id, count) — user_id FUORI dal grant.
--  · Solo timestamptz UTC.
--  · Grant: revoke SEMPRE da public+anon+authenticated (DEFAULT PRIVILEGES
--    dell'hosted, lezione CM8), poi grant mirato.
--  · ⚠️ Il grant per-colonna di public.lives NON si tocca qui: viewer_count e
--    like_count diventano leggibili dal client in LR1 (decisione contatori
--    completa). Qui like_count esiste come colonna ma resta non-selezionabile
--    dal client (lo scrivono solo i trigger SECURITY DEFINER).

-- =============================================================================
-- 1. Nuova colonna su lives — il totale accumulato dei like, sincronizzato a
--    delta (§8.1) e CONGELATO a fine live (il sync salta le 'ended', come
--    peak_viewers). Azzerato all'avvio da lives_before_write v2 (§5).
-- =============================================================================
alter table public.lives add column like_count integer not null default 0;

-- =============================================================================
-- 2. live_likes — una riga = un LOTTO di like (il client accumula i tap e li
--    scarica a lotti ogni ~800ms; §3.2). count = tap nel lotto (cap 50). Le
--    righe muoiono con la live (cascade) e sono purgate a 24h dalla fine (LR3);
--    lives.like_count è un aggregato che SOPRAVVIVE alla purge (§3.5).
-- =============================================================================
create table public.live_likes (
  id         uuid primary key default gen_random_uuid(),
  live_id    uuid not null references public.lives (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  count      integer not null check (count between 1 and 50),
  created_at timestamptz not null default now()
);

-- Indici: (live_id, created_at) serve la finestra rate-limit del trigger e la
-- purge 24h (LR3); (user_id) serve i diritti GDPR (delete/export, LR3).
create index live_likes_live_created_idx on public.live_likes (live_id, created_at);
create index live_likes_user_idx         on public.live_likes (user_id);

-- =============================================================================
-- 3. Trigger live_likes_before_insert — l'arbitro dei like (§3.3), specchio
--    dichiarato di live_comments_before_insert. Guardie IN QUEST'ORDINE:
--    (1) autore/created_at forzati · (2) is_active_user · (3) live esistente ·
--    (4) stato 'live' (in pausa/finita NON si lika) · (5) can_see_live ·
--    (6) count nel range · (7) rate-limit.
-- =============================================================================
create or replace function public.live_likes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live    public.lives%rowtype;
  v_recenti integer;
begin
  -- (1) identità e tempo forzati: mai dal client
  new.user_id    := (select auth.uid());
  new.created_at := now();

  -- (2) i sanzionati (mute/ban) non mettono like
  if not public.is_active_user(new.user_id) then raise exception 'user_not_active'; end if;

  -- (3) la live deve esistere
  select * into v_live from public.lives where id = new.live_id;
  if not found then raise exception 'live_not_found'; end if;

  -- (4) si lika SOLO in diretta: in pausa o finita no (specchio dei commenti)
  if v_live.status <> 'live' then raise exception 'live_not_likeable'; end if;

  -- (5) visibilità: estranei/bloccati/kickati/co-host rimossi fuori
  if not public.can_see_live(new.live_id, new.user_id) then
    raise exception 'live_not_visible';
  end if;

  -- (6) cap del lotto (check constraint gemello sulla colonna count)
  if new.count is null or new.count not between 1 and 50 then
    raise exception 'invalid_like_count';
  end if;

  -- (7) rate-limit: max 15 insert / 10 secondi per (live, utente).
  --     ⚠️ ACCOPPIATO al flush del client (useLiveLikes, ~800ms): 800ms → al
  --     più ~12,5 insert/10s + headroom di rete. Chi cambia UNO dei due valori
  --     DEVE cambiare l'altro (R-2, commento gemello lato client). Tetto
  --     anti-script: 50 like/riga × 15 righe = 750 like/10s; per un umano è
  --     illimitato.
  select count(*) into v_recenti
  from public.live_likes lk
  where lk.live_id = new.live_id
    and lk.user_id = new.user_id
    and lk.created_at > now() - interval '10 seconds';
  if v_recenti >= 15 then raise exception 'rate_limited'; end if;

  return new;
end;
$$;

create trigger live_likes_before_insert_trg
  before insert on public.live_likes
  for each row execute function public.live_likes_before_insert();

-- =============================================================================
-- 4. Trigger sync_live_like_count — incremento a DELTA del contatore, SOLO su
--    INSERT (schema di sync_live_viewer_count). Il where salta le live 'ended'
--    → il totale resta congelato a fine live. NESSUN trigger su DELETE: il
--    totale è STORICO e monotòno (purge e cancellazioni NON decrementano, §3.2).
--    Nota: l'UPDATE su lives passa da lives_before_write (BEFORE UPDATE), che in
--    UPDATE NON forza like_count al valore old → il delta arriva a destinazione.
-- =============================================================================
create or replace function public.sync_live_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lives
  set like_count = like_count + new.count
  where id = new.live_id and status <> 'ended';
  return new;
end;
$$;

create trigger live_likes_count_ins_trg
  after insert on public.live_likes
  for each row execute function public.sync_live_like_count();

-- =============================================================================
-- 5. lives_before_write v2 — corpo v1 (live_foundation) VERBATIM + UNA riga nel
--    ramo INSERT: new.like_count := 0 (accanto a viewer_count/peak_viewers). Il
--    ramo UPDATE resta INVARIATO: NON deve forzare like_count (altrimenti il
--    delta del sync-trigger andrebbe perso).
-- =============================================================================
create or replace function public.lives_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.host_id           := (select auth.uid());
    new.livekit_room_name := 'live_' || gen_random_uuid();
    new.status            := 'live';
    new.started_at        := now();
    new.paused_at         := null;
    new.ended_at          := null;
    new.viewer_count      := 0;
    new.peak_viewers      := 0;
    new.like_count        := 0;
    new.created_at        := now();
  else
    if old.status = 'ended' then
      raise exception 'live_already_ended';
    end if;

    new.host_id           := old.host_id;
    new.title             := old.title;
    new.livekit_room_name := old.livekit_room_name;
    new.visibility        := old.visibility;
    new.comments_enabled  := old.comments_enabled;
    new.show_on_map       := old.show_on_map;
    new.notify_mode       := old.notify_mode;
    new.clip_consent      := old.clip_consent;
    new.started_at        := old.started_at;
    new.created_at        := old.created_at;

    if new.status is distinct from old.status then
      if old.status = 'live' and new.status = 'paused' then
        new.paused_at := now();
        new.ended_at  := null;
      elsif old.status = 'paused' and new.status = 'live' then
        new.paused_at := null;
        new.ended_at  := null;
      elsif new.status = 'ended' then
        new.paused_at := null;
        new.ended_at  := now();
      else
        raise exception 'invalid_transition';
      end if;
    else
      new.paused_at := old.paused_at;
      new.ended_at  := old.ended_at;
    end if;
  end if;
  return new;
end;
$$;

-- =============================================================================
-- 6. Row Level Security — lettura per chi vede la live (serve al canale
--    postgres_changes) + insert diretta arbitrata dal trigger (§3.3).
--    Niente update/delete (i like sono immutabili; la purge è definer, LR3).
-- =============================================================================
alter table public.live_likes enable row level security;

create policy live_likes_select_visible
  on public.live_likes for select
  to authenticated
  using (public.can_see_live(live_id, (select auth.uid())));

create policy live_likes_insert_own
  on public.live_likes for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active_user((select auth.uid()))
    and public.can_see_live(live_id, (select auth.uid()))
  );

-- =============================================================================
-- 7. Grant minimi (revoke da public+anon+authenticated, poi grant mirato).
--    select su tutte le colonne (come live_comments — serve al postgres_changes);
--    insert PER-COLONNA (live_id, count): user_id FUORI dal grant, forzato dal
--    trigger. + revoke sulle due funzioni trigger nuove.
-- =============================================================================
revoke all on public.live_likes from public, anon, authenticated;
grant select on public.live_likes to authenticated;
grant insert (live_id, count) on public.live_likes to authenticated;

revoke all on function public.live_likes_before_insert() from public, anon, authenticated;
revoke all on function public.sync_live_like_count()      from public, anon, authenticated;

-- =============================================================================
-- 8. Realtime: gli INSERT su live_likes viaggiano via postgres_changes + RLS
--    (can_see_live filtra i sottoscrittori), SECONDO listener sullo STESSO
--    canale client dei commenti (nessun canale nuovo; volume bounded dal
--    batching). Guardia idempotente (ADD TABLE fallisce se già presente).
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_likes'
  ) then
    alter publication supabase_realtime add table public.live_likes;
  end if;
end;
$$;
