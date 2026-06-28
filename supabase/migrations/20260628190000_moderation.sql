-- =============================================================================
-- Televo — Moderazione & Safety (network di minori: tolleranza zero gestita bene)
-- =============================================================================
-- Pilastri di safety: (1) chiunque può segnalare; (2) i moderatori (designati da
-- service_role, auditabili) gestiscono coda e azioni; (3) le sanzioni sono
-- gradate (warn → mute → ban) e SEMPRE loggate in audit_log; (4) le azioni
-- confermate pesano sull'Aura (tratto 'toxicity'); (5) la moderazione AI
-- (Perspective) è un assist, non un giudice: degrada con grazia senza chiave.
--
-- 'mute' e 'ban' sono implementati ESTENDENDO is_active_user(): un utente mutato
-- o bannato non è più "attivo" → tutte le insert di contenuto (messaggi, drop,
-- props, stanze, richieste amicizia) lo rifiutano per RLS/trigger, ma può ancora
-- LEGGERE. Soluzione DRY: un solo punto di enforcement.

create type public.report_status        as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type public.moderation_action_type as enum ('warn', 'mute', 'ban');
create type public.moderation_target     as enum ('user', 'room', 'message', 'drop');

-- Sanzioni sul profilo (campi di sistema: non nel grant utente → solo server).
alter table public.profiles add column if not exists muted_until timestamptz;
alter table public.profiles add column if not exists banned_at   timestamptz;

-- -----------------------------------------------------------------------------
-- is_active_user v2 — aggiunge ban/mute alla definizione di "attivo".
-- -----------------------------------------------------------------------------
create or replace function public.is_active_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.age_verified
      and p.deleted_at is null
      and p.banned_at is null
      and (p.muted_until is null or p.muted_until <= now())
  );
$$;

-- -----------------------------------------------------------------------------
-- moderators — designati SOLO da service_role (nessun grant insert). is_moderator
-- è usata dalle RLS (default execute a public, come gli altri helper).
-- -----------------------------------------------------------------------------
create table public.moderators (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.is_moderator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.moderators m where m.user_id = uid);
$$;

-- Mappa un target di moderazione all'utente "responsabile" (per Aura/sanzione).
create or replace function public.moderation_target_user(p_type public.moderation_target, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'user'    then p_id
    when 'message' then (select sender_id from public.messages where id = p_id)
    when 'drop'    then (select author_id from public.drops    where id = p_id)
    when 'room'    then (select host_id   from public.rooms    where id = p_id)
  end;
$$;

-- -----------------------------------------------------------------------------
-- reports — segnalazioni degli utenti (una per coppia segnalante/target).
-- -----------------------------------------------------------------------------
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.moderation_target not null,
  target_id   uuid not null,
  reason      text not null,
  details     text,
  status      public.report_status not null default 'open',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  unique (reporter_id, target_type, target_id)
);

create index reports_status_idx on public.reports (status);
create index reports_target_idx on public.reports (target_type, target_id);

-- -----------------------------------------------------------------------------
-- moderation_queue — coda di revisione con punteggi AI (Perspective).
-- -----------------------------------------------------------------------------
create table public.moderation_queue (
  id              uuid primary key default gen_random_uuid(),
  target_type     public.moderation_target not null,
  target_id       uuid not null,
  content_excerpt text,
  scores          jsonb not null default '{}'::jsonb,
  severity        numeric not null default 0,
  status          text not null default 'pending'
                  check (status in ('pending', 'reviewed', 'actioned', 'cleared')),
  created_at      timestamptz not null default now()
);

create index moderation_queue_status_idx   on public.moderation_queue (status);
create index moderation_queue_severity_idx on public.moderation_queue (severity desc);

-- -----------------------------------------------------------------------------
-- moderation_actions — registro delle azioni dei moderatori (append-only).
-- -----------------------------------------------------------------------------
create table public.moderation_actions (
  id           uuid primary key default gen_random_uuid(),
  moderator_id uuid references public.profiles (id) on delete set null,
  target_type  public.moderation_target not null,
  target_id    uuid not null,
  action       public.moderation_action_type not null,
  reason       text,
  report_id    uuid references public.reports (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id);

-- =============================================================================
-- RPC: segnala un contenuto/utente (qualsiasi utente attivo).
-- =============================================================================
create or replace function public.file_report(
  p_target_type public.moderation_target,
  p_target_id   uuid,
  p_reason      text,
  p_details     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_active_user(v_uid) then raise exception 'user_not_active'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'reason_required'; end if;
  -- non puoi segnalare te stesso
  if public.moderation_target_user(p_target_type, p_target_id) = v_uid then
    raise exception 'cannot_report_self';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (v_uid, p_target_type, p_target_id, p_reason, p_details)
  on conflict (reporter_id, target_type, target_id)
  do update set reason = excluded.reason, details = excluded.details,
                status = 'open', resolved_at = null
  returning id into v_id;

  -- porta/aggiorna l'elemento in coda di revisione umana.
  insert into public.moderation_queue (target_type, target_id, content_excerpt, status)
  values (p_target_type, p_target_id, left(coalesce(p_details, p_reason), 280), 'pending');

  perform public.log_audit('report_filed', p_target_type::text, p_target_id,
                           jsonb_build_object('report_id', v_id, 'reason', p_reason));
  return jsonb_build_object('ok', true, 'report_id', v_id);
end;
$$;

-- =============================================================================
-- RPC: azione di moderazione (solo moderatori). Applica la sanzione, pesa
-- sull'Aura (toxicity) e logga in audit_log.
-- =============================================================================
create or replace function public.take_moderation_action(
  p_target_type public.moderation_target,
  p_target_id   uuid,
  p_action      public.moderation_action_type,
  p_reason      text default null,
  p_duration    interval default null,
  p_report_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_target  uuid := public.moderation_target_user(p_target_type, p_target_id);
  v_penalty numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_moderator(v_uid) then raise exception 'not_moderator'; end if;

  insert into public.moderation_actions (moderator_id, target_type, target_id, action, reason, report_id)
  values (v_uid, p_target_type, p_target_id, p_action, p_reason, p_report_id);

  -- Applica la sanzione all'utente responsabile.
  if v_target is not null then
    if p_action = 'mute' then
      update public.profiles
      set muted_until = now() + coalesce(p_duration, interval '24 hours')
      where id = v_target;
      v_penalty := -5;
    elsif p_action = 'ban' then
      update public.profiles set banned_at = now() where id = v_target;
      v_penalty := -15;
    else  -- warn
      v_penalty := -2;
    end if;
    perform public.emit_aura(v_target, 'toxicity', v_penalty, 'moderation', p_target_id);
  end if;

  -- Chiudi report ed elementi in coda collegati.
  if p_report_id is not null then
    update public.reports set status = 'resolved', resolved_at = now() where id = p_report_id;
  end if;
  update public.moderation_queue
  set status = 'actioned'
  where target_type = p_target_type and target_id = p_target_id and status in ('pending', 'reviewed');

  perform public.log_audit('moderation_action', p_target_type::text, p_target_id,
                           jsonb_build_object('action', p_action::text, 'reason', p_reason,
                                              'target_user', v_target, 'report_id', p_report_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- RPC: revoca sanzioni (solo moderatori) — toglie mute/ban e logga.
create or replace function public.lift_sanctions(p_user uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_moderator(v_uid) then raise exception 'not_moderator'; end if;
  update public.profiles set muted_until = null, banned_at = null where id = p_user;
  perform public.log_audit('sanctions_lifted', 'user', p_user,
                           jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- RPC: aggiorna lo stato di un report senza sanzione (solo moderatori).
create or replace function public.resolve_report(p_report_id uuid, p_status public.report_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_moderator(v_uid) then raise exception 'not_moderator'; end if;
  update public.reports
  set status = p_status,
      resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end
  where id = p_report_id;
  perform public.log_audit('report_status', 'user', null,
                           jsonb_build_object('report_id', p_report_id, 'status', p_status::text));
  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- enqueue_moderation — chiamata SOLO lato server (Edge moderate-text). Scrive i
-- punteggi AI in coda e, oltre soglia critica, applica un mute soft automatico.
-- =============================================================================
create or replace function public.enqueue_moderation(
  p_target_type public.moderation_target,
  p_target_id   uuid,
  p_excerpt     text,
  p_scores      jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sev    numeric := coalesce((p_scores ->> 'TOXICITY')::numeric, 0);
  v_target uuid;
  v_auto   boolean := false;
begin
  insert into public.moderation_queue (target_type, target_id, content_excerpt, scores, severity, status)
  values (p_target_type, p_target_id, left(coalesce(p_excerpt, ''), 280), coalesce(p_scores, '{}'::jsonb),
          v_sev, 'pending');

  -- Soglia critica: mute soft automatico (30 min) + Aura toxicity + audit.
  if v_sev >= 0.9 then
    v_target := public.moderation_target_user(p_target_type, p_target_id);
    if v_target is not null then
      update public.profiles
      set muted_until = greatest(coalesce(muted_until, now()), now() + interval '30 minutes')
      where id = v_target;
      perform public.emit_aura(v_target, 'toxicity', -3, 'auto_moderation', p_target_id);
      perform public.log_audit('auto_mute', p_target_type::text, p_target_id,
                               jsonb_build_object('severity', v_sev, 'scores', p_scores));
      v_auto := true;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'severity', v_sev, 'auto_actioned', v_auto);
end;
$$;

-- =============================================================================
-- Grants
-- =============================================================================
grant select on public.moderators         to authenticated;  -- RLS: solo moderatori
grant select on public.reports            to authenticated;  -- RLS: reporter o moderatori
grant select on public.moderation_queue   to authenticated;  -- RLS: solo moderatori
grant select on public.moderation_actions to authenticated;  -- RLS: solo moderatori

revoke all on function public.file_report(public.moderation_target, uuid, text, text)            from public;
revoke all on function public.take_moderation_action(public.moderation_target, uuid, public.moderation_action_type, text, interval, uuid) from public;
revoke all on function public.lift_sanctions(uuid, text)                                          from public;
revoke all on function public.resolve_report(uuid, public.report_status)                          from public;
revoke all on function public.enqueue_moderation(public.moderation_target, uuid, text, jsonb)     from public;
revoke all on function public.moderation_target_user(public.moderation_target, uuid)              from public;
grant execute on function public.file_report(public.moderation_target, uuid, text, text)          to authenticated;
grant execute on function public.take_moderation_action(public.moderation_target, uuid, public.moderation_action_type, text, interval, uuid) to authenticated;
grant execute on function public.lift_sanctions(uuid, text)                                       to authenticated;
grant execute on function public.resolve_report(uuid, public.report_status)                       to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.moderators         enable row level security;
alter table public.reports            enable row level security;
alter table public.moderation_queue   enable row level security;
alter table public.moderation_actions enable row level security;

create policy moderators_select_mods
  on public.moderators for select
  to authenticated
  using (public.is_moderator((select auth.uid())));

-- reports: il segnalante vede i propri; i moderatori vedono tutto.
create policy reports_select_visible
  on public.reports for select
  to authenticated
  using (reporter_id = (select auth.uid()) or public.is_moderator((select auth.uid())));

create policy moderation_queue_select_mods
  on public.moderation_queue for select
  to authenticated
  using (public.is_moderator((select auth.uid())));

create policy moderation_actions_select_mods
  on public.moderation_actions for select
  to authenticated
  using (public.is_moderator((select auth.uid())));

-- =============================================================================
-- audit_log — policy di lettura per i moderatori (rimandata dalla Fase infra).
-- =============================================================================
create policy audit_log_select_moderator
  on public.audit_log for select
  to authenticated
  using (public.is_moderator((select auth.uid())));
