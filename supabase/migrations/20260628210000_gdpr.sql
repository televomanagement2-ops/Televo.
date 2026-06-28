-- =============================================================================
-- Televo — GDPR: consensi, diritti dell'interessato, retention
-- =============================================================================
-- Network di minori in EU: la compliance è un requisito di prodotto, non un
-- accessorio. Qui: (1) registro consensi (ToS/privacy/posizione), (2) richieste
-- di accesso/cancellazione (art. 15/17), (3) retention con hard-delete dei dati
-- soft-eliminati oltre i 30 giorni. La cancellazione anonimizza SUBITO i dati
-- (incl. la birth_date privata) e programma la rimozione definitiva.

create type public.consent_type      as enum ('tos', 'privacy', 'location', 'marketing');
create type public.gdpr_request_kind as enum ('export', 'delete');

-- -----------------------------------------------------------------------------
-- consents — stato del consenso per (utente, tipo). La storia immutabile vive in
-- audit_log (ogni cambio è loggato).
-- -----------------------------------------------------------------------------
create table public.consents (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  consent_type public.consent_type not null,
  version      text not null default '1',
  granted_at   timestamptz,
  revoked_at   timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, consent_type)
);

-- -----------------------------------------------------------------------------
-- gdpr_requests — tracciamento richieste di export/cancellazione.
-- -----------------------------------------------------------------------------
create table public.gdpr_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         public.gdpr_request_kind not null,
  status       text not null default 'pending'
               check (status in ('pending', 'processing', 'completed', 'failed')),
  result_meta  jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create index gdpr_requests_user_idx   on public.gdpr_requests (user_id);
create index gdpr_requests_status_idx on public.gdpr_requests (status);

-- =============================================================================
-- RPC: registra/aggiorna un consenso (o lo revoca). Ogni cambio è auditato.
-- =============================================================================
create or replace function public.record_consent(
  p_type    public.consent_type,
  p_version text default '1',
  p_granted boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  insert into public.consents (user_id, consent_type, version, granted_at, revoked_at, updated_at)
  values (
    v_uid, p_type, coalesce(nullif(p_version, ''), '1'),
    case when p_granted then now() end,
    case when p_granted then null else now() end,
    now()
  )
  on conflict (user_id, consent_type)
  do update set version    = excluded.version,
                granted_at = case when p_granted then now() else public.consents.granted_at end,
                revoked_at = case when p_granted then null  else now() end,
                updated_at = now();

  perform public.log_audit('consent_' || case when p_granted then 'granted' else 'revoked' end,
                           'user', v_uid,
                           jsonb_build_object('consent_type', p_type::text, 'version', p_version));
  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- RPC: apri una richiesta GDPR (export/delete). L'esecuzione è nelle Edge.
-- =============================================================================
create or replace function public.request_gdpr(p_kind public.gdpr_request_kind)
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
  insert into public.gdpr_requests (user_id, kind)
  values (v_uid, p_kind)
  returning id into v_id;
  perform public.log_audit('gdpr_request', 'user', v_uid,
                           jsonb_build_object('kind', p_kind::text, 'request_id', v_id));
  return jsonb_build_object('ok', true, 'request_id', v_id);
end;
$$;

-- =============================================================================
-- process_account_deletion — anonimizzazione IMMEDIATA + soft-delete. Server-only
-- (la chiama la Edge gdpr-delete dopo aver verificato l'identità). L'hard-delete
-- definitivo avviene col cron di retention dopo 30 giorni.
-- =============================================================================
create or replace function public.process_account_deletion(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then return; end if;

  -- Profilo: anonimizzato e soft-eliminato (username deterministico e valido).
  update public.profiles set
    username       = 'deleted_' || left(replace(p_user::text, '-', ''), 12),
    display_name   = null,
    avatar_url     = null,
    audio_bio_url  = null,
    status_text    = null,
    customization  = '{}'::jsonb,
    interests      = '{}',
    share_location = false,
    expo_push_token = null,
    deleted_at     = coalesce(deleted_at, now())
  where id = p_user;

  -- Dato sensibile: la birth_date privata va rimossa SUBITO.
  delete from public.profiles_private where id = p_user;

  -- Contenuti dell'utente: rimossi/oscurati subito.
  update public.messages set deleted_at = now(), body = null, audio_url = null
  where sender_id = p_user;
  delete from public.drops          where author_id = p_user;
  delete from public.live_presence  where user_id   = p_user;
  delete from public.room_locations where host_id   = p_user;
  delete from public.devices        where user_id   = p_user;
  delete from public.top_friends    where user_id = p_user or friend_id = p_user;

  perform public.log_audit('account_anonymized', 'user', p_user, '{}'::jsonb);
end;
$$;

-- =============================================================================
-- purge_due_deletions — retention: hard-delete dei dati soft-eliminati > 30gg.
-- =============================================================================
create or replace function public.purge_due_deletions()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Account cancellati da oltre 30 giorni: rimozione DEFINITIVA anche dell'identità
  -- auth (l'email è un dato personale). Cascade su profiles e tutto il resto.
  -- In ambienti dove il ruolo non può scrivere su auth.users, si degrada in modo
  -- silenzioso lasciando la pulizia auth a un processo admin.
  begin
    delete from auth.users u
    using public.profiles p
    where u.id = p.id
      and p.deleted_at is not null
      and p.deleted_at < now() - interval '30 days';
  exception when insufficient_privilege then
    null;
  end;

  -- Profili cancellati da oltre 30 giorni (orfani senza auth): rimozione cascade.
  delete from public.profiles
  where deleted_at is not null and deleted_at < now() - interval '30 days';

  -- Messaggi soft-eliminati da oltre 30 giorni.
  delete from public.messages
  where deleted_at is not null and deleted_at < now() - interval '30 days';

  -- Richieste GDPR completate da oltre 90 giorni (housekeeping).
  delete from public.gdpr_requests
  where status = 'completed' and completed_at is not null
    and completed_at < now() - interval '90 days';
end;
$$;

-- =============================================================================
-- Grants
-- =============================================================================
grant select on public.consents      to authenticated;  -- RLS: owner
grant select on public.gdpr_requests to authenticated;  -- RLS: owner

revoke all on function public.record_consent(public.consent_type, text, boolean) from public;
revoke all on function public.request_gdpr(public.gdpr_request_kind)             from public;
revoke all on function public.process_account_deletion(uuid)                     from public;
revoke all on function public.purge_due_deletions()                              from public;
grant execute on function public.record_consent(public.consent_type, text, boolean) to authenticated;
grant execute on function public.request_gdpr(public.gdpr_request_kind)             to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.consents      enable row level security;
alter table public.gdpr_requests enable row level security;

create policy consents_select_own
  on public.consents for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy gdpr_requests_select_own
  on public.gdpr_requests for select
  to authenticated
  using (user_id = (select auth.uid()));

-- =============================================================================
-- Scheduling (pg_cron) — retention/hard-delete, ogni giorno 03:30 UTC.
-- =============================================================================
select cron.schedule(
  'gdpr-retention-daily',
  '30 3 * * *',
  $$ select public.purge_due_deletions(); $$
);
