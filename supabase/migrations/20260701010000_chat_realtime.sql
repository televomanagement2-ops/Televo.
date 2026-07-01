-- =============================================================================
-- Televo — Chat: abilita Realtime (postgres_changes) sulle tabelle della chat
-- =============================================================================
-- Il client mobile si iscrive agli INSERT/UPDATE dei messaggi (chat live) e agli
-- UPDATE di conversation_members (spunte di lettura live) e conversations
-- (riordino della lista chat). Additivo e SICURO: la RLS esistente continua a
-- filtrare cosa ogni utente riceve — Realtime valuta le policy `*_select_*` per
-- ogni sottoscrittore, quindi un utente riceve solo i cambi delle proprie
-- conversazioni (la voce dei minori e i messaggi restano protetti come nelle
-- letture normali).
--
-- Idempotente: si può ri-applicare senza errori "is already member of publication".

do $$
declare
  v_tables text[] := array['messages', 'conversations', 'conversation_members'];
  v_t text;
begin
  foreach v_t in array v_tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_t);
    end if;
  end loop;
end $$;
