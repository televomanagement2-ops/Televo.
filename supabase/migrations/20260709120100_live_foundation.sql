-- =============================================================================
-- Televo — Live M12 (LM0): fondamenta del dominio (schema + guardie + RPC base)
-- =============================================================================
-- Prima wave della Live (docs/live/live.md, Parte II §18 LM0): il broadcast
-- video personale, SOLO amici (L-1), dominio NUOVO e parallelo alle Stanze
-- audio `rooms` (L-2: coesistono, rooms non si tocca). Qui costruiamo:
-- tipi · tabelle lives/live_hosts/live_viewers/live_comments · l'UNICO
-- predicato di visibilità can_see_live · i trigger arbitro (macchina a stati,
-- tetto 4 host, sync contatori, guardie commenti con rate-limit) · le 8 RPC di
-- scrittura in versione BASE · moderation_target_user v3 · realtime commenti.
--
-- Fuori da LM0 (pattern staged di M7 — le RPC saranno RIDEFINITE verbatim+add):
--   · colonna map_events.live_id + attach/detach + trigger chiusura 3h  → LM1
--   · notifiche di avvio/invito, fan-out inbox, premio Aura, RPC lettura → LM2
--   · expire_content v7 / process_account_deletion v7 / gdpr-export v5  → LM3
--   · Edge: ramo live in livekit-token (mint=join), live-kick, webhook  → LM4
--
-- Regole d'oro applicate (CLAUDE.md §6, live.md §1.2):
--  · Visibilità SOLO amici accettati degli host ATTIVI (L-3); coppie bloccate,
--    kickati e co-host rimossi esclusi OVUNQUE da can_see_live. Con
--    visibility='top_friends' conta SOLO la cerchia dell'host principale (§4).
--    Nota (§0.4, risolto verso il meno aperto): il co-host 'removed' perde la
--    visibilità della live come lo spettatore kickato — non rientra.
--  · Contatori PRIVATI a livello dati (pattern drops R-04): viewer_count e
--    peak_viewers NON sono nel grant select del client; li esporrà solo
--    live_detail (LM2) al solo host.
--  · Nessuna scrittura client su lives/live_hosts/live_viewers: solo RPC
--    definer (troppi effetti collaterali). live_comments: insert diretta col
--    trigger che valida tutto (pattern drop_comments).
--  · is_active_user() su ogni percorso di CREAZIONE (live, inviti, commenti);
--    terminare/pausare la propria live resta possibile anche da sanzionati
--    (riduce l'esposizione, non crea contenuto).
--  · Solo timestamptz UTC; stati derivati client con clock calibrato (M7 §8).
--  · Grant: revoke SEMPRE da public+anon+authenticated (DEFAULT PRIVILEGES
--    dell'hosted, lezione CM8), poi grant mirato.

-- =============================================================================
-- 1. Tipi del dominio (l'enum esteso di moderazione/notifiche/mappa è nella
--    migrazione precedente, vincolo ADD VALUE).
-- =============================================================================
create type public.live_status      as enum ('live', 'paused', 'ended');
create type public.live_visibility  as enum ('all_friends', 'top_friends');
create type public.live_notify_mode as enum ('none', 'top_friends', 'all');

-- =============================================================================
-- 2. lives — una riga per broadcast. La stanza LiveKit è dedicata
--    (livekit_room_name generato dal trigger, mai scelto dal client).
--    clip_consent: campo RISERVATO (Momenti Salienti, Fase 2), sempre false in
--    v1 — esiste sin d'ora per non migrare dopo (vincolo del master plan).
-- =============================================================================
create table public.lives (
  id                uuid primary key default gen_random_uuid(),
  host_id           uuid not null references public.profiles (id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 80),
  status            public.live_status not null default 'live',
  livekit_room_name text not null unique,
  visibility        public.live_visibility not null default 'all_friends',
  comments_enabled  boolean not null default true,
  show_on_map       boolean not null default false,
  notify_mode       public.live_notify_mode not null default 'all',
  clip_consent      boolean not null default false,
  started_at        timestamptz not null default now(),
  paused_at         timestamptz,
  ended_at          timestamptz,
  viewer_count      integer not null default 0,
  peak_viewers      integer not null default 0,
  created_at        timestamptz not null default now()
);

-- UNA sola live attiva per host (tentativo doppio → live_already_active).
create unique index lives_host_active_uidx on public.lives (host_id) where ended_at is null;
create index lives_status_idx on public.lives (status);
create index lives_host_idx   on public.lives (host_id);

-- =============================================================================
-- 3. live_hosts — host principale + co-host (tetto 4 TOTALE, invited+active).
--    L'host principale nasce 'active'; il co-host nasce 'invited' e deve
--    accettare. 'left' = uscito da solo; 'removed' = revocato/rimosso dall'host
--    (e non rientra, §0.4). Le righe muoiono con la live (cascade).
-- =============================================================================
create table public.live_hosts (
  live_id    uuid not null references public.lives (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('host', 'cohost')),
  status     text not null default 'invited'
             check (status in ('invited', 'active', 'left', 'removed')),
  invited_at timestamptz not null default now(),
  joined_at  timestamptz,
  left_at    timestamptz,
  primary key (live_id, user_id)
);

create index live_hosts_user_idx on public.live_hosts (user_id);

-- =============================================================================
-- 4. live_viewers — spettatori REALI (il mint del token è il join, LM4) +
--    registro kick. È insieme: fonte del viewer_count (sync-trigger), criterio
--    "spettatori reali" per feed/Aura (LM2), negazione in can_see_live e nel
--    token, e gancio naturale per il futuro blocco 1:1 adulto-minore (basterà
--    un predicato su is_adult qui — nessun refactor, scelta del master plan).
-- =============================================================================
create table public.live_viewers (
  live_id   uuid not null references public.lives (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  kicked_at timestamptz,
  kicked_by uuid references public.profiles (id) on delete set null,
  primary key (live_id, user_id)
);

create index live_viewers_user_idx on public.live_viewers (user_id);

-- =============================================================================
-- 5. live_comments — effimeri (fade client-side; purge a 24h dalla fine, LM3),
--    solo testo ≤200, niente reply. Realtime via postgres_changes + RLS
--    (pattern provato di drop_comments).
-- =============================================================================
create table public.live_comments (
  id         uuid primary key default gen_random_uuid(),
  live_id    uuid not null references public.lives (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);

create index live_comments_live_created_idx on public.live_comments (live_id, created_at);
create index live_comments_author_idx       on public.live_comments (author_id);

-- =============================================================================
-- 6. can_see_live(live, viewer) — l'UNICO predicato di visibilità del dominio,
--    riusato da RLS, RPC, token (LM4), commenti e fan-out (LM2). Ordine:
--    1. host o co-host ATTIVO → true (vedono sempre la propria live);
--    2. kickato (spettatore) o rimosso (co-host) → false, non rientra (§0.4);
--    3. coppia bloccata con ALCUN host attivo → false (L-3);
--    4. perimetro: all_friends = amico di ≥1 host ATTIVO (unione, L-3);
--       top_friends = SOLO cerchia 1–8 dell'host PRINCIPALE (e amico) — è
--       l'intimità di chi apre la live, l'unione non si applica (§4).
-- =============================================================================
create or replace function public.can_see_live(p_live uuid, p_viewer uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_live public.lives%rowtype;
begin
  if p_live is null or p_viewer is null then return false; end if;

  select * into v_live from public.lives where id = p_live;
  if not found then return false; end if;

  if exists (
    select 1 from public.live_hosts h
    where h.live_id = p_live and h.user_id = p_viewer and h.status = 'active'
  ) then
    return true;
  end if;

  if exists (
    select 1 from public.live_viewers v
    where v.live_id = p_live and v.user_id = p_viewer and v.kicked_at is not null
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.live_hosts h
    where h.live_id = p_live and h.user_id = p_viewer and h.status = 'removed'
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.live_hosts h
    where h.live_id = p_live and h.status = 'active'
      and public.is_blocked_pair(h.user_id, p_viewer)
  ) then
    return false;
  end if;

  if v_live.visibility = 'top_friends' then
    return public.are_friends(v_live.host_id, p_viewer)
       and exists (
         select 1 from public.top_friends t
         where t.user_id = v_live.host_id and t.friend_id = p_viewer
       );
  end if;

  return exists (
    select 1 from public.live_hosts h
    where h.live_id = p_live and h.status = 'active'
      and public.are_friends(h.user_id, p_viewer)
  );
end;
$$;

-- =============================================================================
-- 7. Trigger lives_before_write — l'UNICO arbitro della macchina a stati (§2).
--    INSERT: forza TUTTI i campi di sistema (identità, stanza, stato, tempi).
--    UPDATE: 'ended' è terminale e IMMUTABILE; i toggle fotografano l'avvio
--    (§3: non rieditabili in v1) → forzati ai valori old; le transizioni
--    valide sono solo live↔paused e live/paused→ended, coi timestamp di stato
--    forzati qui (paused_at valorizzato SOLO in pausa).
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

create trigger lives_before_write_trg
  before insert or update on public.lives
  for each row execute function public.lives_before_write();

-- =============================================================================
-- 8. Trigger live_hosts_cap — tetto 4 host TOTALI (invited+active) per live
--    (cintura di sicurezza: la RPC di invito fa già il pre-check).
-- =============================================================================
create or replace function public.live_hosts_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('invited', 'active') and (
    select count(*) from public.live_hosts h
    where h.live_id = new.live_id
      and h.user_id <> new.user_id
      and h.status in ('invited', 'active')
  ) >= 4 then
    raise exception 'cohost_cap_reached';
  end if;
  return new;
end;
$$;

create trigger live_hosts_cap_trg
  before insert or update on public.live_hosts
  for each row execute function public.live_hosts_cap();

-- =============================================================================
-- 9. Trigger sync viewer_count/peak_viewers — dagli spettatori ATTIVI (dentro,
--    non kickati). A live finita i contatori restano congelati (il where salta
--    le righe 'ended', che il trigger di stato rifiuterebbe comunque).
-- =============================================================================
create or replace function public.sync_live_viewer_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live  uuid := coalesce(new.live_id, old.live_id);
  v_count integer;
begin
  select count(*) into v_count
  from public.live_viewers v
  where v.live_id = v_live and v.left_at is null and v.kicked_at is null;

  update public.lives l
  set viewer_count = v_count,
      peak_viewers = greatest(l.peak_viewers, v_count)
  where l.id = v_live and l.status <> 'ended';

  return coalesce(new, old);
end;
$$;

create trigger live_viewers_count_trg
  after insert or update or delete on public.live_viewers
  for each row execute function public.sync_live_viewer_count();

-- =============================================================================
-- 10. Trigger live_comments_before_insert — le regole server dei commenti (§6):
--     autore forzato · is_active_user · live in stato 'live' (in pausa NON si
--     commenta) · comments_enabled · can_see_live · testo 1–200 · rate-limit
--     5 commenti / 30 secondi per utente PER live.
-- =============================================================================
create or replace function public.live_comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_live    public.lives%rowtype;
  v_recenti integer;
begin
  new.author_id  := (select auth.uid());
  new.created_at := now();

  if not public.is_active_user(new.author_id) then raise exception 'user_not_active'; end if;

  select * into v_live from public.lives where id = new.live_id;
  if not found then raise exception 'live_not_found'; end if;
  if v_live.status <> 'live' then raise exception 'live_not_commentable'; end if;
  if not v_live.comments_enabled then raise exception 'comments_disabled'; end if;
  if not public.can_see_live(new.live_id, new.author_id) then
    raise exception 'live_not_visible';
  end if;

  if nullif(trim(new.body), '') is null then raise exception 'empty_comment'; end if;
  if char_length(new.body) > 200 then raise exception 'comment_too_long'; end if;

  select count(*) into v_recenti
  from public.live_comments c
  where c.live_id = new.live_id
    and c.author_id = new.author_id
    and c.created_at > now() - interval '30 seconds';
  if v_recenti >= 5 then raise exception 'rate_limited'; end if;

  return new;
end;
$$;

create trigger live_comments_before_insert_trg
  before insert on public.live_comments
  for each row execute function public.live_comments_before_insert();

-- =============================================================================
-- 11. RPC di scrittura — versione BASE (LM0). SECURITY DEFINER, search_path='',
--     errori stringhe-codice. In LM2 saranno ridefinite verbatim+add per
--     innestare notifiche, fan-out realtime e aggancio mappa.
-- =============================================================================

-- 11.1 create_live — la nascita è camera-first: la live nasce GIÀ in diretta
--      (nessuno scheduled, §2). Ritorna il contratto stabile
--      {live_id, livekit_room_name, map_attached} (map_attached diventerà
--      reale in LM2; qui è sempre false).
create or replace function public.create_live(
  p_title            text,
  p_visibility       public.live_visibility  default 'all_friends',
  p_comments_enabled boolean                 default true,
  p_show_on_map      boolean                 default false,
  p_notify_mode      public.live_notify_mode default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_live  public.lives%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_user(v_uid) then raise exception 'user_not_active'; end if;
  if v_title is null or char_length(v_title) > 80 then raise exception 'invalid_title'; end if;
  if exists (select 1 from public.lives l where l.host_id = v_uid and l.ended_at is null) then
    raise exception 'live_already_active';
  end if;

  begin
    insert into public.lives (host_id, title, visibility, comments_enabled, show_on_map, notify_mode)
    values (v_uid, v_title,
            coalesce(p_visibility, 'all_friends'),
            coalesce(p_comments_enabled, true),
            coalesce(p_show_on_map, false),
            coalesce(p_notify_mode, 'all'))
    returning * into v_live;
  exception when unique_violation then
    -- corsa sull'unique parziale host attivo: stesso errore del pre-check
    raise exception 'live_already_active';
  end;

  insert into public.live_hosts (live_id, user_id, role, status, joined_at)
  values (v_live.id, v_uid, 'host', 'active', now());

  return jsonb_build_object(
    'live_id',           v_live.id,
    'livekit_room_name', v_live.livekit_room_name,
    'map_attached',      false
  );
end;
$$;

-- 11.2 pause_live — solo host principale, solo dalla diretta. La pausa è uno
--      stato visivo chiaro; l'evento mappa RESTA aperto (LM1 non fa nulla qui).
create or replace function public.pause_live(p_live uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_live public.lives%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_live from public.lives where id = p_live for update;
  if not found then raise exception 'live_not_found'; end if;
  if v_live.host_id <> v_uid then raise exception 'not_live_host'; end if;
  if v_live.status = 'ended' then raise exception 'live_already_ended'; end if;
  if v_live.status <> 'live' then raise exception 'invalid_transition'; end if;

  update public.lives set status = 'paused' where id = p_live;
  return jsonb_build_object('ok', true, 'status', 'paused');
end;
$$;

-- 11.3 resume_live — solo host principale, solo dalla pausa.
create or replace function public.resume_live(p_live uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_live public.lives%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_live from public.lives where id = p_live for update;
  if not found then raise exception 'live_not_found'; end if;
  if v_live.host_id <> v_uid then raise exception 'not_live_host'; end if;
  if v_live.status = 'ended' then raise exception 'live_already_ended'; end if;
  if v_live.status <> 'paused' then raise exception 'invalid_transition'; end if;

  update public.lives set status = 'live' where id = p_live;
  return jsonb_build_object('ok', true, 'status', 'live');
end;
$$;

-- 11.4 end_live — solo host principale; stato FINALE (il trigger lo rende
--      immutabile). Niente guardia is_active_user: chiudere riduce l'esposizione.
create or replace function public.end_live(p_live uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_live public.lives%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_live from public.lives where id = p_live for update;
  if not found then raise exception 'live_not_found'; end if;
  if v_live.host_id <> v_uid then raise exception 'not_live_host'; end if;
  if v_live.status = 'ended' then raise exception 'live_already_ended'; end if;

  update public.lives set status = 'ended' where id = p_live;
  return jsonb_build_object('ok', true, 'status', 'ended');
end;
$$;

-- 11.5 live_invite_cohost — solo host principale; invitato amico, attivo.
--      Idempotente su 'invited'/'active'; il rimosso NON è re-invitabile
--      (§0.4); chi è uscito da solo ('left') può essere re-invitato.
create or replace function public.live_invite_cohost(p_live uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_live public.lives%rowtype;
  v_row  public.live_hosts%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_user is null or p_user = v_uid then raise exception 'invalid_target'; end if;
  if not public.is_active_user(v_uid) then raise exception 'user_not_active'; end if;

  select * into v_live from public.lives where id = p_live for update;
  if not found then raise exception 'live_not_found'; end if;
  if v_live.host_id <> v_uid then raise exception 'not_live_host'; end if;
  if v_live.status = 'ended' then raise exception 'live_already_ended'; end if;

  if not public.is_active_user(p_user) then raise exception 'target_not_active'; end if;
  if not public.are_friends(v_uid, p_user) then raise exception 'not_friends'; end if;

  select * into v_row from public.live_hosts
  where live_id = p_live and user_id = p_user for update;

  if found then
    if v_row.status = 'active' then
      return jsonb_build_object('ok', true, 'status', 'active');
    elsif v_row.status = 'invited' then
      return jsonb_build_object('ok', true, 'status', 'invited');
    elsif v_row.status = 'removed' then
      raise exception 'cohost_removed';
    end if;
    -- 'left': re-invito (il tetto va riverificato, la riga era fuori conteggio)
    if (select count(*) from public.live_hosts h
        where h.live_id = p_live and h.status in ('invited', 'active')) >= 4 then
      raise exception 'cohost_cap_reached';
    end if;
    update public.live_hosts
    set status = 'invited', invited_at = now(), joined_at = null, left_at = null
    where live_id = p_live and user_id = p_user;
    return jsonb_build_object('ok', true, 'status', 'invited');
  end if;

  if (select count(*) from public.live_hosts h
      where h.live_id = p_live and h.status in ('invited', 'active')) >= 4 then
    raise exception 'cohost_cap_reached';
  end if;

  insert into public.live_hosts (live_id, user_id, role, status)
  values (p_live, p_user, 'cohost', 'invited');

  return jsonb_build_object('ok', true, 'status', 'invited');
end;
$$;

-- 11.6 live_accept_cohost — l'invitato accetta: da qui pubblica (token con
--      canPublish, LM4) e il SUO grafo amici entra nel pubblico (L-3).
create or replace function public.live_accept_cohost(p_live uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_live public.lives%rowtype;
  v_row  public.live_hosts%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_user(v_uid) then raise exception 'user_not_active'; end if;

  select * into v_live from public.lives where id = p_live for update;
  if not found then raise exception 'live_not_found'; end if;
  if v_live.status = 'ended' then raise exception 'live_already_ended'; end if;

  select * into v_row from public.live_hosts
  where live_id = p_live and user_id = v_uid for update;
  if not found or v_row.status <> 'invited' then raise exception 'no_invite'; end if;

  update public.live_hosts
  set status = 'active', joined_at = now(), left_at = null
  where live_id = p_live and user_id = v_uid;

  return jsonb_build_object('ok', true, 'status', 'active');
end;
$$;

-- 11.7 live_remove_cohost — solo host principale: revoca un invito o rimuove
--      un co-host attivo → 'removed' (non rientra). Il taglio media immediato
--      è compito della Edge live-kick (LM4). Idempotente sul già rimosso.
create or replace function public.live_remove_cohost(p_live uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_live public.lives%rowtype;
  v_row  public.live_hosts%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_live from public.lives where id = p_live for update;
  if not found then raise exception 'live_not_found'; end if;
  if v_live.host_id <> v_uid then raise exception 'not_live_host'; end if;
  if v_live.status = 'ended' then raise exception 'live_already_ended'; end if;

  select * into v_row from public.live_hosts
  where live_id = p_live and user_id = p_user for update;
  if not found or v_row.role <> 'cohost' then raise exception 'not_cohost'; end if;

  if v_row.status <> 'removed' then
    update public.live_hosts
    set status = 'removed', left_at = coalesce(left_at, now())
    where live_id = p_live and user_id = p_user;
  end if;

  return jsonb_build_object('ok', true, 'status', 'removed');
end;
$$;

-- 11.8 live_leave — best-effort e idempotente (il client la chiama alla
--      disconnessione; il webhook LiveKit riconcilia i silenziosi, LM4).
--      Co-host attivo → 'left'; spettatore dentro → left_at. L'host principale
--      non "lascia": termina (nessun errore, la chiamata è best-effort).
create or replace function public.live_leave(p_live uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_role text := 'none';
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.live_hosts
  set status = 'left', left_at = now()
  where live_id = p_live and user_id = v_uid and role = 'cohost' and status = 'active';
  if found then v_role := 'cohost'; end if;

  update public.live_viewers
  set left_at = now()
  where live_id = p_live and user_id = v_uid and left_at is null and kicked_at is null;
  if found and v_role = 'none' then v_role := 'viewer'; end if;

  return jsonb_build_object('ok', true, 'role', v_role);
end;
$$;

-- =============================================================================
-- 12. moderation_target_user v3 — corpo live VERBATIM (v2, drops_lifecycle) +
--     rami 'live' (→ host principale) e 'live_comment' (→ autore del
--     commento). ACL invariata (create or replace la preserva).
-- =============================================================================
create or replace function public.moderation_target_user(p_type public.moderation_target, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'user'         then p_id
    when 'message'      then (select sender_id from public.messages      where id = p_id)
    when 'drop'         then (select author_id from public.drops         where id = p_id)
    when 'drop_comment' then (select author_id from public.drop_comments where id = p_id)
    when 'room'         then (select host_id   from public.rooms         where id = p_id)
    when 'live'         then (select host_id   from public.lives         where id = p_id)
    when 'live_comment' then (select author_id from public.live_comments where id = p_id)
  end;
$$;

-- =============================================================================
-- 13. Row Level Security
-- =============================================================================
alter table public.lives         enable row level security;
alter table public.live_hosts    enable row level security;
alter table public.live_viewers  enable row level security;
alter table public.live_comments enable row level security;

-- lives: SOLA lettura per chi la vede (serve a client, commenti e
-- postgres_changes); NESSUNA policy di scrittura — solo RPC definer.
create policy lives_select_visible
  on public.lives for select
  to authenticated
  using (public.can_see_live(id, (select auth.uid())));

-- live_hosts / live_viewers: l'host principale della live vede tutto,
-- l'utente vede le proprie righe. Mutazioni solo RPC/definer.
create policy live_hosts_select_own_or_host
  on public.live_hosts for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.lives l
      where l.id = live_id and l.host_id = (select auth.uid())
    )
  );

create policy live_viewers_select_own_or_host
  on public.live_viewers for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.lives l
      where l.id = live_id and l.host_id = (select auth.uid())
    )
  );

-- live_comments: contenuto per chi vede la live; insert diretta validata dal
-- trigger (pattern drop_comments). Niente update/delete (effimeri, purge LM3).
create policy live_comments_select_visible
  on public.live_comments for select
  to authenticated
  using (public.can_see_live(live_id, (select auth.uid())));

create policy live_comments_insert_own
  on public.live_comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_active_user((select auth.uid()))
    and public.can_see_live(live_id, (select auth.uid()))
  );

-- =============================================================================
-- 14. Grant minimi (revoke da public+anon+authenticated, poi grant mirato).
-- =============================================================================
revoke all on public.lives         from public, anon, authenticated;
revoke all on public.live_hosts    from public, anon, authenticated;
revoke all on public.live_viewers  from public, anon, authenticated;
revoke all on public.live_comments from public, anon, authenticated;

-- lives: select PER-COLONNA senza i contatori (anti-vanity a livello dati,
-- pattern drops R-04: viewer_count/peak_viewers arrivano solo da live_detail
-- in LM2, valorizzati per il solo host).
grant select (id, host_id, title, status, visibility, comments_enabled,
              show_on_map, notify_mode, clip_consent, started_at, paused_at,
              ended_at, created_at)
  on public.lives to authenticated;

grant select on public.live_hosts   to authenticated;
grant select on public.live_viewers to authenticated;

grant select on public.live_comments to authenticated;
grant insert (live_id, body) on public.live_comments to authenticated;

-- Funzioni: revoke esplicito, poi grant mirato. can_see_live resta eseguibile
-- da authenticated perché le policy RLS la valutano come utente chiamante.
revoke all on function public.can_see_live(uuid, uuid)              from public, anon, authenticated;
revoke all on function public.lives_before_write()                  from public, anon, authenticated;
revoke all on function public.live_hosts_cap()                      from public, anon, authenticated;
revoke all on function public.sync_live_viewer_count()              from public, anon, authenticated;
revoke all on function public.live_comments_before_insert()         from public, anon, authenticated;
revoke all on function public.create_live(text, public.live_visibility, boolean, boolean, public.live_notify_mode) from public, anon, authenticated;
revoke all on function public.pause_live(uuid)                      from public, anon, authenticated;
revoke all on function public.resume_live(uuid)                     from public, anon, authenticated;
revoke all on function public.end_live(uuid)                        from public, anon, authenticated;
revoke all on function public.live_invite_cohost(uuid, uuid)        from public, anon, authenticated;
revoke all on function public.live_accept_cohost(uuid)              from public, anon, authenticated;
revoke all on function public.live_remove_cohost(uuid, uuid)        from public, anon, authenticated;
revoke all on function public.live_leave(uuid)                      from public, anon, authenticated;

grant execute on function public.can_see_live(uuid, uuid)           to authenticated;
grant execute on function public.create_live(text, public.live_visibility, boolean, boolean, public.live_notify_mode) to authenticated;
grant execute on function public.pause_live(uuid)                   to authenticated;
grant execute on function public.resume_live(uuid)                  to authenticated;
grant execute on function public.end_live(uuid)                     to authenticated;
grant execute on function public.live_invite_cohost(uuid, uuid)     to authenticated;
grant execute on function public.live_accept_cohost(uuid)           to authenticated;
grant execute on function public.live_remove_cohost(uuid, uuid)     to authenticated;
grant execute on function public.live_leave(uuid)                   to authenticated;

-- =============================================================================
-- 15. Realtime: i commenti live viaggiano via postgres_changes + RLS (pattern
--     drop_comments). Guardia idempotente (ADD TABLE fallisce se già presente).
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_comments'
  ) then
    alter publication supabase_realtime add table public.live_comments;
  end if;
end;
$$;
