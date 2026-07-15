-- =============================================================================
-- Televo — Live M14 round 2 (F1): guardia di riconnessione sul co-host attivo
-- =============================================================================
-- Root cause dello split-screen che non compariva MAI (verificata sul ledger
-- di produzione: in ogni prova reale la riga del co-host passava ad 'active'
-- e ~300-400ms dopo a 'left').
--
-- L'accettazione di un invito Co-Live comporta una RICONNESSIONE LiveKit: il
-- token da spettatore in mano non pubblica, quindi il client si disconnette e
-- riminta (il mint è il join, live.md §5). La disconnessione del VECCHIO
-- collegamento fa scattare la riconciliazione di servizio (webhook LiveKit
-- `participant_left`), che arriva a DB pochi istanti DOPO l'accettazione e
-- retrocedeva a 'left' il co-host appena attivato: il mint successivo nasceva
-- da spettatore (canPublish=false) e nessuno vedeva mai la griglia.
--
-- Regola: nei primi 60 secondi dal join (la finestra in cui vive la
-- riconnessione post-accettazione) la transizione active→left di un co-host è
-- riservata alla SCELTA dell'utente (auth.uid() presente: live_leave/"Lascia
-- il Co-Live"). La riconciliazione di servizio (auth.uid() assente) in quella
-- finestra viene ignorata: se il co-host è caduto davvero, il silenzio verrà
-- riconciliato dal prossimo participant_left oltre la finestra, o la live
-- finisce e chiude tutto. Il kick dell'host passa da 'removed' e non è
-- toccato; i DELETE (purge, GDPR) nemmeno.

create or replace function public.live_cohost_reconnect_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'cohost'
     and old.status = 'active'
     and new.status = 'left'
     and (select auth.uid()) is null
     and old.joined_at is not null
     and old.joined_at > now() - interval '60 seconds'
  then
    return null; -- update ignorato: il co-host appena attivato resta 'active'
  end if;
  return new;
end;
$$;

create trigger live_cohost_reconnect_guard_trg
  before update on public.live_hosts
  for each row execute function public.live_cohost_reconnect_guard();

-- Funzione di trigger: nessuna esecuzione diretta dai ruoli client.
revoke all on function public.live_cohost_reconnect_guard() from public, anon, authenticated;
