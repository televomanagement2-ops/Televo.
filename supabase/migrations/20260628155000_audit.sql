-- =============================================================================
-- Televo — Audit log trasversale (append-only)
-- =============================================================================
-- Registro immutabile delle azioni sensibili: moderazione, transazioni,
-- richieste GDPR, accessi service-role. Scritto SOLO da funzioni SECURITY
-- DEFINER / service_role tramite public.log_audit(). La lettura è bloccata da
-- RLS (nessuna policy qui): la policy di lettura per i moderatori viene aggiunta
-- nella Fase 7 (moderazione), così l'ordine delle dipendenze resta pulito.

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users (id) on delete set null,
  actor_role  text,
  action      text not null,
  target_type text,
  target_id   uuid,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_target_idx  on public.audit_log (target_type, target_id);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx   on public.audit_log (actor_id);

-- -----------------------------------------------------------------------------
-- log_audit — unico punto di scrittura del registro. actor_id = chiamante
-- (null per i job service-role senza sessione utente).
-- -----------------------------------------------------------------------------
create or replace function public.log_audit(
  p_action      text,
  p_target_type text default null,
  p_target_id   uuid default null,
  p_meta        jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, actor_role, action, target_type, target_id, meta)
  values (
    (select auth.uid()),
    coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'system'),
    p_action,
    p_target_type,
    p_target_id,
    coalesce(p_meta, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.log_audit(text, text, uuid, jsonb) from public;

-- =============================================================================
-- Row Level Security — abilitata, nessuna policy: tabella bloccata a tutti
-- tranne service_role. La lettura per i moderatori arriva in Fase 7.
-- =============================================================================
alter table public.audit_log enable row level security;
