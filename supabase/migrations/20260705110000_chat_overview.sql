-- =============================================================================
-- Televo — Chat: chat_overview() — l'hub in UNA query server-side (CM8)
-- =============================================================================
-- Fin qui la lista conversazioni era assemblata dal client con 5 query e uno
-- scan globale delle 400 righe più recenti di `messages`: oltre la finestra
-- l'unread era APPROSSIMATO (una chat molto attiva poteva "mangiarsi" la
-- finestra delle altre — nota SRS §8.5). Questa RPC calcola tutto sul server:
-- una riga per membership del chiamante con org D4, ultimo messaggio valido,
-- UNREAD ESATTO, peer della DM e streak. Volutamente NESSUN filtro vista
-- (attive/archiviate/silenziate) né ordinamento pinned: restano client-side
-- così una sola cache serve tutte e tre le viste dell'hub.
--
-- Semantica allineata al client (e a CM1):
--   • ultimo messaggio = il più recente NON cancellato, NON scaduto e
--     successivo a cleared_at ("Cancella cronologia" vale anche qui);
--   • unread = messaggi altrui non cancellati/scaduti, > last_read_at e
--     > cleared_at;
--   • peer/last_message come jsonb: conservano la shape client (ProfileCard /
--     MessageRow) senza esplodere 15 colonne nel result set.
-- SECURITY DEFINER: legge anche il profilo del peer e resterà valida quando i
-- grant per-colonna (enforcement spunte, migrazione successiva) chiuderanno la
-- lettura raw di last_read_at.
-- L'indice necessario esiste già: messages_conv_created_idx
-- (conversation_id, created_at desc) — 20260628160200.

create or replace function public.chat_overview()
returns table (
  conversation_id uuid,
  type            public.conversation_type,
  name            text,
  avatar_url      text,
  updated_at      timestamptz,
  muted_until     timestamptz,
  archived_at     timestamptz,
  pinned_at       timestamptz,
  cleared_at      timestamptz,
  hidden_at       timestamptz,
  my_last_read_at timestamptz,
  peer            jsonb,
  last_message    jsonb,
  unread_count    integer,
  streak          integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.type,
    c.name,
    c.avatar_url,
    c.updated_at,
    cm.muted_until,
    cm.archived_at,
    cm.pinned_at,
    cm.cleared_at,
    cm.hidden_at,
    cm.last_read_at,
    pe.card,
    lm.msg,
    coalesce(un.n, 0)::integer,
    st.current_streak
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  -- Ultimo messaggio visibile per ME (deleted/expired/cleared esclusi).
  left join lateral (
    select to_jsonb(m.*) as msg
    from public.messages m
    where m.conversation_id = c.id
      and m.deleted_at is null
      and (m.expires_at is null or m.expires_at > now())
      and (cm.cleared_at is null or m.created_at > cm.cleared_at)
    order by m.created_at desc
    limit 1
  ) lm on true
  -- Unread ESATTO (niente finestra): altrui, validi, dopo last_read/cleared.
  left join lateral (
    select count(*) as n
    from public.messages m
    where m.conversation_id = c.id
      and m.deleted_at is null
      and (m.expires_at is null or m.expires_at > now())
      and (cm.cleared_at is null or m.created_at > cm.cleared_at)
      and m.sender_id <> cm.user_id
      and m.created_at > cm.last_read_at
  ) un on true
  -- Peer della DM come card profilo (shape di ProfileCard client).
  left join lateral (
    select jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'aura_score', p.aura_score,
      'aura_color', p.aura_color,
      'status_text', p.status_text
    ) as card
    from public.conversation_members m2
    join public.profiles p on p.id = m2.user_id
    where c.type = 'dm'
      and m2.conversation_id = c.id
      and m2.user_id <> cm.user_id
    limit 1
  ) pe on true
  left join public.streaks st on st.conversation_id = c.id
  where cm.user_id = (select auth.uid());
$$;

-- =============================================================================
-- Grants — solo authenticated (con auth.uid() null il result set è vuoto).
-- =============================================================================
revoke all on function public.chat_overview() from public;
grant execute on function public.chat_overview() to authenticated;
