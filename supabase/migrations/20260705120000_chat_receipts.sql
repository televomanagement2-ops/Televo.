-- =============================================================================
-- Televo — Chat: spunte di lettura ENFORCEMENT SERVER (CM8, §6.4 R-03)
-- =============================================================================
-- Fin qui il gating delle spunte era SOLO client (compromesso CM3 documentato):
-- un client modificato poteva leggere raw `conversation_members.last_read_at` e
-- `profiles.show_read_receipts` altrui, ignorando i toggle privacy. Qui il buco
-- si chiude in due mosse:
--
--  1. RPC `get_read_receipts(p_conv)` — l'UNICA via per le ricevute di lettura:
--     • solo membri della conversazione (not_member);
--     • reciprocità §6.4: se IO nascondo le spunte non vedo quelle altrui
--       (zero righe); chi le nasconde è escluso dall'elenco (nei gruppi risulta
--       "non ha ancora letto" — scelta WhatsApp-like, il denominatore resta
--       membri−1).
--  2. Grant SELECT per-colonna: `conversation_members` SENZA last_read_at
--     (l'unread proprio arriva da chat_overview, SECURITY DEFINER;
--     mark_conversation_read resta la via di scrittura) e `profiles` SENZA
--     last_active_at — chiude anche il compromesso CM1 sulla presenza (il dato
--     passa già da get_peer_presence) — e SENZA expo_push_token (colonna legacy
--     mai letta dal client: un token push esposto permette spam diretto via
--     Expo; i device vivono nella tabella `devices`).
--
-- NOTA realtime: walrus filtra le COLONNE senza privilegio ma consegna comunque
-- l'evento UPDATE su conversation_members → il client lo usa solo come segnale
-- di invalidazione (chatKeys.receipts), mai come fonte del dato.
-- NOTA grants: si revoca il SOLO privilegio SELECT (i grant UPDATE per-colonna
-- esistenti su entrambe le tabelle restano intatti). `anon` perde ogni lettura:
-- nessun flusso pre-sessione tocca queste tabelle (RLS resta comunque attiva).

-- -----------------------------------------------------------------------------
-- 1. RPC get_read_receipts — ricevute di lettura privacy-safe.
-- -----------------------------------------------------------------------------
create or replace function public.get_read_receipts(p_conv uuid)
returns table (user_id uuid, last_read_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_conv_member(p_conv, v_uid) then raise exception 'not_member'; end if;

  -- Reciprocità §6.4: se nego le mie spunte, non vedo quelle degli altri.
  if not exists (
    select 1 from public.profiles pr where pr.id = v_uid and pr.show_read_receipts
  ) then
    return;
  end if;

  return query
  select m.user_id, m.last_read_at
  from public.conversation_members m
  join public.profiles p on p.id = m.user_id
  where m.conversation_id = p_conv
    and m.user_id <> v_uid
    and p.show_read_receipts;
end;
$$;

revoke all on function public.get_read_receipts(uuid) from public;
grant execute on function public.get_read_receipts(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Grant SELECT per-colonna (revoca del solo SELECT, poi lista esplicita).
-- -----------------------------------------------------------------------------
revoke select on public.conversation_members from anon, authenticated;
grant select (conversation_id, user_id, role, joined_at, muted_until,
              archived_at, pinned_at, cleared_at, hidden_at)
  on public.conversation_members to authenticated;

revoke select on public.profiles from anon, authenticated;
grant select (id, username, display_name, age_verified, avatar_url,
              audio_bio_url, status_text, customization, interests, school_id,
              aura_score, aura_color, share_location, created_at, updated_at,
              deleted_at, muted_until, banned_at, show_last_seen,
              show_read_receipts)
  on public.profiles to authenticated;
