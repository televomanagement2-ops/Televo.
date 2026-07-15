-- =============================================================================
-- Televo — M14 round 2 (F5): il ledger notifiche entra nel realtime
-- =============================================================================
-- Il badge della campanella (tab Notifiche, P10) nasce da una query unread che
-- il client non aveva modo di sapere quando rinfrescare: l'unica invalidazione
-- viveva nel listener della push ricevuta in FOREGROUND — con push non
-- consegnate (o permesso negato) il badge restava fermo al valore del boot.
-- Stesso rimedio della chat (§8.5): postgres_changes sugli INSERT del ledger.
-- La RLS owner-only di `notifications` (notifications_select_own) è il filtro
-- di sicurezza: ogni utente riceve SOLO gli eventi delle proprie righe.
-- Guardia idempotente: ADD TABLE fallisce se la tabella è già in pubblicazione.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
