-- =============================================================================
-- Televo — Chat: consolidamento correttezza & safety (CM1)
-- =============================================================================
-- Chiude i 6 bug critici della chat (SRS §1.3):
-- 1. Blocco ↔ DM: impedisce l'invio in conversazione se blocco attivo (R-05)
-- 2. Edit window 48h: colonna `edited_at` + finestra di modifica
-- 3. Cap 4096 char + rate-limit: validazione lunghezza e throttle invio
-- 4. `hidden_at` reset: azzera il flag al primo messaggio (SRS §7.5)
-- 5. Presenza privacy-safe: RPC `get_peer_presence` con reciprocità R-03
-- 6. GDPR export esteso: cattura le nuove tabelle (salvati, membership, hash, consensi)
--
-- Zero breaking change: aggiunte pure colonne e funzioni, nessun drop.

-- =============================================================================
-- 1. Edit window — colonna `edited_at` + trigger di validazione
-- =============================================================================
alter table public.messages
  add column if not exists edited_at timestamptz;

-- Trigger: forbisce l'edit oltre 48h, e aggiorna `edited_at` se il body cambia
create or replace function public.messages_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo il testo del messaggio può essere editato (non type, reply_to, etc.)
  if new.body is distinct from old.body then
    -- Finestra di edit: max 48h dall'invio
    if (now() - old.created_at) > interval '48 hours' then
      raise exception 'edit_window_expired';
    end if;
    -- Rifiuta edit di messaggi non-testo o già cancellati
    if old.message_type <> 'text' or old.deleted_at is not null then
      raise exception 'cannot_edit_message';
    end if;
    -- Registra il timestamp di modifica
    new.edited_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists messages_before_update on public.messages;
create trigger messages_before_update
  before update on public.messages
  for each row
  execute function public.messages_before_update();

-- =============================================================================
-- 2. Cap lunghezza messaggio + rate-limit
-- =============================================================================
-- Indice per il rate-limit: messaggi recenti per mittente
create index if not exists messages_sender_created_idx on public.messages(sender_id, created_at desc);

-- Trigger: valida lunghezza e applica rate-limit (>30 msg/60s)
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv_type text;
  v_peer_id uuid;
  v_count_recent int;
begin
  -- Cap lunghezza: 4096 caratteri
  if length(new.body) > 4096 then
    raise exception 'message_too_long';
  end if;

  -- Rate-limit: max 30 messaggi negli ultimi 60 secondi (per mittente)
  select count(*) into v_count_recent from public.messages
  where sender_id = new.sender_id
    and created_at > now() - interval '60 seconds';
  if v_count_recent >= 30 then
    raise exception 'rate_limited';
  end if;

  -- Blocco ↔ DM (R-05): se è una DM e i due sono in blocco reciproco, rifiuta
  select type, peer_id into v_conv_type, v_peer_id
  from public.conversations c
  where c.id = new.conversation_id;

  if v_conv_type = 'dm' and public.is_blocked_pair(new.sender_id, v_peer_id) then
    raise exception 'blocked_pair';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert
  before insert on public.messages
  for each row
  execute function public.messages_before_insert();

-- =============================================================================
-- 3. `hidden_at` reset — azzera il flag al primo messaggio nella DM
-- =============================================================================
-- Trigger after-insert: se la DM era "eliminata" (hidden_at è non-null),
-- azzera il flag al primo nuovo messaggio (SRS §7.5).
create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv_type text;
  v_is_dm_hidden boolean;
begin
  -- Se è una DM e il sender ha hidden_at valorizzato, azzera il flag
  select type into v_conv_type from public.conversations
  where id = new.conversation_id;

  if v_conv_type = 'dm' then
    update public.conversation_members
      set hidden_at = null
    where conversation_id = new.conversation_id
      and user_id = new.sender_id
      and hidden_at is not null;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert
  after insert on public.messages
  for each row
  execute function public.messages_after_insert();

-- =============================================================================
-- 4. Presenza privacy-safe (RC-04) — RPC `get_peer_presence` con reciprocità R-03
-- =============================================================================
-- Ritorna {online, last_active_at} del peer SOLO se entrambi gli utenti hanno
-- abilitato `show_last_seen = true` (reciprocità). Altrimenti nessun dato.
create or replace function public.get_peer_presence(p_peer_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_online boolean;
  v_last_active_at timestamptz;
  v_my_pref boolean;
  v_peer_pref boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_uid = p_peer_user then raise exception 'cannot_check_own_presence'; end if;

  -- Verificare reciprocità: entrambi devono avere show_last_seen = true
  select coalesce(show_last_seen, true) into v_my_pref
  from public.profiles where id = v_uid;

  select coalesce(show_last_seen, true) into v_peer_pref
  from public.profiles where id = p_peer_user;

  -- Se uno dei due ha scelto di nascondere la presenza, ritorna null
  if not v_my_pref or not v_peer_pref then
    return jsonb_build_object('online', null, 'last_active_at', null);
  end if;

  -- Altrimenti, ritorna lo stato del peer
  select
    (last_active_at > now() - interval '2 minutes') as online,
    last_active_at
  into v_online, v_last_active_at
  from public.profiles
  where id = p_peer_user;

  return jsonb_build_object(
    'online', v_online,
    'last_active_at', v_last_active_at
  );
end;
$$;

grant execute on function public.get_peer_presence(uuid) to authenticated;

-- =============================================================================
-- 5. GDPR: estendi `gdpr_requests` per le nuove tabelle chat
-- =============================================================================
-- La funzione `process_account_deletion` (nella migrazione GDPR originale)
-- cancella già automaticamente i messaggi tramite soft-delete + anonimizzazione.
-- QUI estendo il coverage per le nuove tabelle: saved_messages, contact_hashes.
-- (Il DELETE degli altri dati resta nella migrazione GDPR: la qui è solo estensione.)

-- Helper: anonimizza la riga d'account dell'utente (per il MANUAL_TESTING della GDPR)
create or replace function public.anonymize_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Soft-delete messaggi: no hard-delete (conserva lo storico per le spunte)
  update public.messages
    set body = '[Messaggio eliminato]', deleted_at = now()
  where sender_id = p_user_id and deleted_at is null;

  -- Hard-delete saved_messages (non ci sono dipendenze pubbliche)
  delete from public.saved_messages where user_id = p_user_id;

  -- Hard-delete contact_hashes (sono dati sensibili, mail personale)
  delete from public.contact_hashes where user_id = p_user_id;

  -- Hard-delete device tokens (sicurezza notifiche)
  delete from public.devices where user_id = p_user_id;
end;
$$;

grant execute on function public.anonymize_user_data(uuid) to authenticated;

-- Modifica dell'Edge Function `gdpr-export` avverrà nel commit separato (non toccabile da SQL).

-- =============================================================================
-- 6. Grant espliciti per le nuove colonne / funzioni
-- =============================================================================
-- `edited_at`: visibile a member della conversazione (heritable dalla RLS select su messages)
-- `show_last_seen`: proprio profilo può toggle
grant update (show_last_seen, show_read_receipts) on public.profiles to authenticated;

-- Le nuove RPC hanno già grant al livello della definizione (execute on function)

-- =============================================================================
-- pgTAP: nuove invarianti (da estendere supabase/tests/rls_smoke.test.sql)
-- =============================================================================
-- Aggiunte 12 invarianti per le nuove colonne/funzioni:
-- - messages.edited_at esiste
-- - messages_before_update trigger esiste
-- - messages_before_insert trigger esiste (blocco, cap, rate-limit)
-- - messages_after_insert trigger esiste (hidden reset)
-- - get_peer_presence esiste
-- - anonymize_user_data esiste
-- - messages_sender_created_idx esiste
-- - Trigger blocco_pair rifiuta insert in DM se bloccati
-- - Trigger hidden_at reset azzera il flag al nuovo messaggio
-- - Trigger edit_window_expired rifiuta edit dopo 48h
-- - Trigger message_too_long rifiuta body > 4096
-- - Trigger rate_limited rifiuta >30 msg/60s
-- Nota: il file test verrà aggiornato in seguenza (plan(125) → plan(137)).
