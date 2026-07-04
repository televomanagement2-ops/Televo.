-- =============================================================================
-- Televo — Chat: pulizia gruppi orfani (CM8, R-16) — expire_content v4
-- =============================================================================
-- `leave_conversation` e `remove_conversation_member` lasciano il gruppo orfano
-- (0 membri) quando esce l'ultimo: fin qui restava a bagno nel DB. Estendo il
-- cron `expire_content` (già ogni 5 min) — regola "verbatim + add": copia esatta
-- della v3 (20260628170000) + un blocco nuovo in coda.
--
-- I gruppi orfani si cancellano (le FK cascade portano via messages,
-- conversation_members, streaks, message_reactions; saved_messages via
-- messages).
--
-- ⚠️ FILE nei bucket privati (chat-media / voice-messages): NON si cancellano
-- da qui. Il progetto hosted VIETA la DELETE diretta su storage.objects
-- ("Direct deletion from storage tables is not allowed. Use the Storage API
-- instead.") — verificato in CM8: un delete da SQL farebbe fallire l'intero
-- cron. La rimozione dei file resta quindi DEBITO documentato, insieme agli
-- altri orfani di storage non deducibili da una FK (upload falliti dopo insert
-- non riuscito, media azzerati dal GDPR): serve un job dedicato che parla con
-- la Storage API (Edge Function) — annotato in CM8/M8 del piano chat.

create or replace function public.expire_content()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rooms
  set status = 'ended'
  where status = 'live' and ends_at is not null and ends_at < now();

  delete from public.drops where expires_at < now();
  delete from public.messages where expires_at is not null and expires_at < now();

  -- Mappa: presenze scadute e location di stanze non più live.
  delete from public.live_presence where expires_at < now();
  delete from public.room_locations rl
  using public.rooms r
  where rl.room_id = r.id and r.status <> 'live';

  -- CM8 (R-16): gruppi/house senza più membri → cancellati (FK cascade sul
  -- resto: messages, conversation_members, streaks, message_reactions,
  -- saved_messages). I file dei bucket restano debito (vedi header).
  delete from public.conversations c
  where c.type in ('group', 'house')
    and not exists (
      select 1 from public.conversation_members m where m.conversation_id = c.id
    );
end;
$$;
