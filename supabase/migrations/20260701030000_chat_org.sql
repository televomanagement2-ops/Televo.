-- =============================================================================
-- Televo — Chat: organizzazione per-utente delle conversazioni (SRS §3.2, D4)
-- =============================================================================
-- Silenzia / Archivia / Fissa / Cancella cronologia / Elimina (soft) sono stati
-- PER-UTENTE e PER-CONVERSAZIONE: vivono su `conversation_members`, non sulla
-- conversazione (che è condivisa). Tutti i campi sono additivi e nullable → nessuna
-- regressione sulle query esistenti (M1–M3 non li selezionano).
--
-- ⚠️ Naming: `profiles.muted_until` esiste già (mute GLOBALE di moderazione,
-- 20260628190000_moderation.sql). QUI `conversation_members.muted_until` è un campo
-- OMONIMO ma diverso: mute PER-CONVERSAZIONE scelto dall'utente (durata 8h/1sett/
-- sempre). I due non interferiscono.
--
-- Le mutazioni passano da RPC SECURITY DEFINER (convenzione del repo: alle tabelle
-- solo SELECT). Il trigger di notifica messaggi diventa MUTE-AWARE (SRS §9.3).

-- -----------------------------------------------------------------------------
-- Colonne per-utente (tutte null = stato di default "attivo/visibile").
-- -----------------------------------------------------------------------------
alter table public.conversation_members
  add column if not exists muted_until timestamptz,  -- null=attivo, futuro=silenziato
  add column if not exists archived_at timestamptz,  -- null=in lista, valorizzato=archiviata
  add column if not exists pinned_at   timestamptz,  -- valorizzato=fissata in cima
  add column if not exists cleared_at  timestamptz,  -- nascondi i messaggi <= questo istante
  add column if not exists hidden_at   timestamptz;  -- "elimina chat" (DM): fuori dalla lista

-- -----------------------------------------------------------------------------
-- RPC: silenzia / riattiva una conversazione (per l'utente corrente).
-- p_until null = riattiva; futuro = silenzia fino a quella data (durata dal client).
-- -----------------------------------------------------------------------------
create or replace function public.set_conversation_mute(p_conv uuid, p_until timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_conv_member(p_conv, v_uid) then raise exception 'not_conv_member'; end if;
  if p_until is not null and p_until <= now() then raise exception 'invalid_mute'; end if;

  update public.conversation_members
     set muted_until = p_until
   where conversation_id = p_conv and user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: setta un flag booleano-temporale (archived / pinned / hidden) on/off.
-- Una sola RPC parametrica: il nome colonna è scelto da una WHITELIST `case`
-- (MAI SQL dinamico su input utente → niente injection). on = now(), off = null.
-- -----------------------------------------------------------------------------
create or replace function public.set_conversation_flag(p_conv uuid, p_flag text, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ts  timestamptz := case when p_on then now() else null end;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_conv_member(p_conv, v_uid) then raise exception 'not_conv_member'; end if;

  -- Whitelist esplicita del campo: un update per ramo, nessun identificatore dinamico.
  if p_flag = 'archived' then
    update public.conversation_members set archived_at = v_ts
     where conversation_id = p_conv and user_id = v_uid;
  elsif p_flag = 'pinned' then
    update public.conversation_members set pinned_at = v_ts
     where conversation_id = p_conv and user_id = v_uid;
  elsif p_flag = 'hidden' then
    update public.conversation_members set hidden_at = v_ts
     where conversation_id = p_conv and user_id = v_uid;
  else
    raise exception 'invalid_flag';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: cancella cronologia (solo per me). Nasconde i messaggi con
-- created_at <= cleared_at. MVP = "tutto fino ad ora" (SRS R-18 "da un momento"
-- rimandato). Non distrugge dati: l'altro vede ancora tutto.
-- -----------------------------------------------------------------------------
create or replace function public.clear_conversation_history(p_conv uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_conv_member(p_conv, v_uid) then raise exception 'not_conv_member'; end if;

  update public.conversation_members set cleared_at = now()
   where conversation_id = p_conv and user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- Grants (mutazioni via RPC: alle colonne nessun grant update diretto)
-- =============================================================================
revoke all on function public.set_conversation_mute(uuid, timestamptz) from public;
revoke all on function public.set_conversation_flag(uuid, text, boolean) from public;
revoke all on function public.clear_conversation_history(uuid) from public;
grant execute on function public.set_conversation_mute(uuid, timestamptz) to authenticated;
grant execute on function public.set_conversation_flag(uuid, text, boolean) to authenticated;
grant execute on function public.clear_conversation_history(uuid) to authenticated;

-- =============================================================================
-- Trigger notifica messaggi — ora MUTE-AWARE (SRS §3.10 / §9.3).
-- Ridefinizione di public.messages_after_insert_notify (20260628180000): identica
-- all'originale, con l'AGGIUNTA del filtro sui membri che hanno silenziato la
-- conversazione (muted_until nel futuro) → a loro non si accoda la notifica.
-- =============================================================================
create or replace function public.messages_after_insert_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender  text;
  v_preview text;
  v_conv    public.conversations%rowtype;
begin
  select coalesce(display_name, username::text) into v_sender
  from public.profiles where id = new.sender_id;
  select * into v_conv from public.conversations where id = new.conversation_id;

  v_preview := case
    when new.type = 'text' then left(coalesce(new.body, ''), 120)
    else '🎙️ Messaggio vocale'
  end;

  insert into public.notifications (user_id, type, title, body, payload)
  select m.user_id, 'message',
         case when v_conv.type = 'dm' then coalesce(v_sender, 'Nuovo messaggio')
              else coalesce(v_conv.name, 'Gruppo') || ' • ' || coalesce(v_sender, '') end,
         v_preview,
         jsonb_build_object('conversation_id', new.conversation_id,
                            'sender_id', new.sender_id, 'message_id', new.id)
  from public.conversation_members m
  join public.profiles p on p.id = m.user_id and p.deleted_at is null
  where m.conversation_id = new.conversation_id
    and m.user_id <> new.sender_id
    and (m.muted_until is null or m.muted_until <= now());  -- mute-aware (D4)
  return new;
end;
$$;
