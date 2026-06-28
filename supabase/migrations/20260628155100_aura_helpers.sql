-- =============================================================================
-- Televo — Helper di scrittura del ledger Aura
-- =============================================================================
-- Punto d'ingresso UNICO per scrivere eventi nel ledger append-only aura_events.
-- Usato da tutti i domini (social, drops, moderazione, streak...) così la logica
-- di emissione resta centralizzata e sempre server-side (SECURITY DEFINER).
-- aura_events resta scrivibile solo da definer/service_role (nessun grant insert).

create or replace function public.emit_aura(
  p_user        uuid,
  p_type        public.aura_event_type,
  p_delta       numeric,
  p_source_type text default null,
  p_source_id   uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Niente evento per utenti inesistenti/cancellati (coerenza del ledger).
  if p_user is null then
    return;
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = p_user and p.deleted_at is null
  ) then
    return;
  end if;

  insert into public.aura_events (user_id, type, delta, source_type, source_id)
  values (p_user, p_type, p_delta, p_source_type, p_source_id);
end;
$$;

revoke all on function public.emit_aura(uuid, public.aura_event_type, numeric, text, uuid) from public;

-- 'participation' — creare momenti reali (ospitare/partecipare a live, postare
-- drop, interazioni pubbliche). Si aggiunge ai tratti già esistenti.
alter type public.aura_event_type add value if not exists 'participation';
