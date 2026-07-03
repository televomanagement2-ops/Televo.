-- =============================================================================
-- Televo — Chat: gestione moderna dei messaggi (CM4 — "chat modern")
-- =============================================================================
-- Milestone CM4 del piano chat (docs/chat/IMPLEMENTATION-PLAN.md): inoltro,
-- reazioni emoji, ricerca full-text e gestione gruppo. In un'unica migrazione
-- (nessun nuovo valore enum: le emoji sono text+CHECK, niente notifiche push
-- per le reazioni — decisione utente 2026-07-03, coerente con l'anti-vanity).
--
-- 1. INOLTRO (RC-06): `messages.forwarded_from` referenzia il messaggio di
--    origine (on delete set null: la copia sopravvive alla cancellazione
--    dell'originale). L'inoltro COPIA il body e referenzia l'origine; il
--    trigger di insert valida che l'origine sia visibile al mittente, non
--    cancellata e di tipo 'text' (i vocali effimeri NON si inoltrano —
--    l'effimero resta effimero; i media arrivano con CM5).
-- 2. REAZIONI (RC-07): `message_reactions`, 1 reazione per utente per
--    messaggio (PK message_id+user_id), set curato di 6 emoji inciso nel
--    CHECK. `conversation_id` è DENORMALIZZATA dal trigger (mai dal client):
--    serve al filtro realtime per-conversazione e alla RLS senza join.
--    Cambio emoji = DELETE+INSERT (niente path UPDATE: meno superficie).
--    Nessun contatore fuori dalla conversazione, nessuna Aura, nessuna
--    notifica: il PROP resta il gesto forte.
--    Compromesso documentato (come il broadcast typing di CM3): i DELETE
--    realtime non sono filtrabili né soggetti a RLS (il payload old porta
--    solo la PK) → un membro di un'ALTRA conversazione iscritto al proprio
--    canale può osservare la PK (message_id, user_id) di una reazione
--    rimossa altrove. Nessun contenuto trapela (né emoji né testo); NON si
--    usa `replica identity full`, che peggiorerebbe il leak.
-- 3. RICERCA (RC-08, R-13): colonna generata `body_tsv` (config 'italian'
--    schema-qualificata: le funzioni girano con search_path = '') + indice
--    GIN + RPC `search_messages` che rispetta membership, cleared_at,
--    hidden_at (la DM "eliminata" non affiora in ricerca — si auto-resetta
--    al nuovo messaggio), deleted_at ed expires_at. Trade-off accettato:
--    body_tsv viaggia nei select('*') e nei payload realtime (byte in più,
--    nessun dato nuovo: deriva dal body già visibile).
-- 4. GRUPPI (R-09): `update_conversation_meta` (rinomina/avatar, admin),
--    `promote_conversation_admin` (passaggio volontario, admin) e
--    `leave_conversation` v2: se esce l'ultimo admin e restano membri,
--    auto-promozione del membro più anziano (joined_at, tie-break user_id).
--    Il cleanup dei gruppi orfani resta differito a CM8 (R-16).
-- 5. GDPR: `process_account_deletion` v3 cancella anche le reazioni
--    dell'utente (dato personale, come i salvati).
--
-- ⚠️ REGOLA ANTI-REGRESSIONE (lezione CM1): `messages_before_insert` e
-- `messages_before_update` sono ridefinite copiando VERBATIM il corpo
-- definitivo di 20260702130000_chat_hardening_fix.sql e AGGIUNGENDO solo i
-- blocchi nuovi (marcati "CM4"). I trigger esistenti non si toccano
-- (create or replace function basta). pgTAP ha guardie di regressione.

-- =============================================================================
-- 1. Inoltro — colonna forwarded_from + grant
-- =============================================================================
alter table public.messages
  add column forwarded_from uuid null references public.messages(id) on delete set null;

comment on column public.messages.forwarded_from is
  'Messaggio di origine di un inoltro (RC-06). Solo testo; validato dal trigger.';

-- I grant di colonna sono additivi: si estende il grant insert esistente.
grant insert (forwarded_from) on public.messages to authenticated;

-- =============================================================================
-- 2. messages_before_insert v3 — corpo CM1 verbatim + validazione inoltro
-- =============================================================================
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv_type   public.conversation_type;
  v_peer        uuid;
  v_recenti     int;
  v_fwd_conv    uuid;
  v_fwd_type    public.message_type;
  v_fwd_deleted timestamptz;
begin
  -- Campi di sistema forzati (mai fidarsi del client).
  new.sender_id  := (select auth.uid());
  new.created_at := now();
  new.deleted_at := null;
  new.edited_at  := null;

  if not public.is_conv_member(new.conversation_id, new.sender_id) then
    raise exception 'not_conv_member';
  end if;

  -- Hardening CM1: cap di lunghezza del testo (null-safe: i vocali hanno body null).
  if length(new.body) > 4096 then
    raise exception 'message_too_long';
  end if;

  -- Hardening CM1: rate-limit di base — max 30 messaggi negli ultimi 60 secondi
  -- (soglia larga: non deve colpire l'uso legittimo). Usa messages_sender_created_idx.
  select count(*) into v_recenti
  from public.messages
  where sender_id = new.sender_id
    and created_at > now() - interval '60 seconds';
  if v_recenti >= 30 then
    raise exception 'rate_limited';
  end if;

  -- Hardening CM1 (R-05): in una DM con coppia bloccata NESSUNO dei due scrive.
  -- Il peer è l'altro membro (conversations non ha una colonna peer).
  select c.type into v_conv_type
  from public.conversations c
  where c.id = new.conversation_id;

  if v_conv_type = 'dm' then
    select m.user_id into v_peer
    from public.conversation_members m
    where m.conversation_id = new.conversation_id
      and m.user_id <> new.sender_id
    limit 1;
    if v_peer is not null and public.is_blocked_pair(new.sender_id, v_peer) then
      raise exception 'blocked_pair';
    end if;
  end if;

  -- Scadenza vocali effimeri: ammessa solo nel futuro e mai oltre 24h.
  if new.expires_at is not null then
    if new.expires_at <= now() then
      raise exception 'invalid_expiry';
    end if;
    new.expires_at := least(new.expires_at, now() + interval '24 hours');
  end if;

  -- reply_to deve appartenere alla stessa conversazione.
  if new.reply_to is not null and not exists (
    select 1 from public.messages m
    where m.id = new.reply_to and m.conversation_id = new.conversation_id
  ) then
    raise exception 'invalid_reply_to';
  end if;

  -- CM4 (RC-06): inoltro — l'origine deve esistere, non essere cancellata ed
  -- essere visibile al mittente (membro della sua conversazione). Solo testo:
  -- i vocali effimeri non si inoltrano (il file scade), i media arrivano in CM5.
  if new.forwarded_from is not null then
    select m.conversation_id, m.type, m.deleted_at
      into v_fwd_conv, v_fwd_type, v_fwd_deleted
    from public.messages m
    where m.id = new.forwarded_from;

    if v_fwd_conv is null or v_fwd_deleted is not null then
      raise exception 'invalid_forward';
    end if;
    if v_fwd_type <> 'text' then
      raise exception 'cannot_forward_type';
    end if;
    if not public.is_conv_member(v_fwd_conv, new.sender_id) then
      raise exception 'invalid_forward';
    end if;
    -- Inoltro e risposta non si combinano (forzato, non è un errore).
    new.reply_to := null;
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 3. messages_before_update v3 — corpo CM1 verbatim + forwarded_from immutabile
-- =============================================================================
create or replace function public.messages_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Campi di sistema immutabili anche in update (difesa oltre i grant per-colonna).
  new.sender_id       := old.sender_id;
  new.conversation_id := old.conversation_id;
  new.created_at      := old.created_at;
  new.type            := old.type;
  -- CM4: la provenienza di un inoltro non si riscrive.
  new.forwarded_from  := old.forwarded_from;

  -- Soft-delete (incl. anonimizzazione GDPR che azzera anche il body): NON è un
  -- edit → nessuna finestra 48h, edited_at intatto.
  if new.deleted_at is not null then
    new.edited_at := old.edited_at;
    return new;
  end if;

  if new.body is distinct from old.body then
    -- Solo il testo dei messaggi 'text' non cancellati è editabile, entro 48h.
    if old.deleted_at is not null or old.type <> 'text' then
      raise exception 'cannot_edit_message';
    end if;
    if (now() - old.created_at) > interval '48 hours' then
      raise exception 'edit_window_expired';
    end if;
    if length(new.body) > 4096 then
      raise exception 'message_too_long';
    end if;
    new.edited_at := now();
  else
    -- edited_at non è modificabile direttamente dal client.
    new.edited_at := old.edited_at;
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 4. Reazioni emoji — tabella, trigger, RLS, realtime
-- =============================================================================
create table public.message_reactions (
  message_id      uuid not null references public.messages(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  -- Denormalizzata dal trigger (mai dal client): filtro realtime + RLS senza join.
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- Set curato (RC-07, confermato dall'utente). ⚠️ byte-identico alla costante
  -- client REACTION_EMOJIS (mobile/src/constants/chat.ts): ❤️ = U+2764 U+FE0F.
  emoji           text not null check (emoji in ('❤️', '😂', '👍', '😮', '😢', '🔥')),
  created_at      timestamptz not null default now(),
  primary key (message_id, user_id)
);

comment on table public.message_reactions is
  'Reazioni emoji ai messaggi (RC-07): 1 per utente per messaggio, visibili solo in conversazione. Niente Aura, niente notifiche (anti-vanity).';

create index message_reactions_conv_idx on public.message_reactions (conversation_id);

-- Trigger: forza i campi di sistema e valida messaggio/membership/blocco.
create or replace function public.message_reactions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv      uuid;
  v_deleted   timestamptz;
  v_expires   timestamptz;
  v_conv_type public.conversation_type;
  v_peer      uuid;
begin
  -- Campi di sistema forzati (mai fidarsi del client).
  new.user_id    := (select auth.uid());
  new.created_at := now();

  select m.conversation_id, m.deleted_at, m.expires_at
    into v_conv, v_deleted, v_expires
  from public.messages m
  where m.id = new.message_id;

  -- Assente, cancellato o effimero scaduto: per chi reagisce non esiste più.
  if v_conv is null or v_deleted is not null
     or (v_expires is not null and v_expires <= now()) then
    raise exception 'message_not_found';
  end if;

  -- conversation_id sempre derivata dal messaggio (il client non la manda).
  new.conversation_id := v_conv;

  if not public.is_conv_member(v_conv, new.user_id) then
    raise exception 'not_conv_member';
  end if;

  -- Parità con l'invio messaggi (R-05): in DM bloccata nessun segnale, nemmeno
  -- una reazione (è comunque un contatto).
  select c.type into v_conv_type from public.conversations c where c.id = v_conv;
  if v_conv_type = 'dm' then
    select m.user_id into v_peer
    from public.conversation_members m
    where m.conversation_id = v_conv and m.user_id <> new.user_id
    limit 1;
    if v_peer is not null and public.is_blocked_pair(new.user_id, v_peer) then
      raise exception 'blocked_pair';
    end if;
  end if;

  return new;
end;
$$;

create trigger message_reactions_before_insert_trg
  before insert on public.message_reactions
  for each row execute function public.message_reactions_before_insert();

-- Grant: mutazioni dirette ma minime (insert della sola coppia messaggio+emoji,
-- delete per il toggle). Cambio emoji = delete + insert.
-- ⚠️ Il progetto hosted ha DEFAULT PRIVILEGES che concedono ALL ad
-- anon/authenticated su ogni nuova tabella (la RLS resta il cancello reale, ma
-- i grant vanno resi davvero minimi): prima si revoca tutto, poi si concede
-- l'esplicito. Audit sistemico degli altri domini rimandato a CM8.
revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;
grant insert (message_id, emoji) on public.message_reactions to authenticated;
grant delete on public.message_reactions to authenticated;

alter table public.message_reactions enable row level security;

-- Visibili SOLO ai membri della conversazione (anti-vanity: nessun contatore fuori).
create policy message_reactions_select_member
  on public.message_reactions for select
  to authenticated
  using (public.is_conv_member(conversation_id, (select auth.uid())));

-- is_active_user = unico punto di enforcement mute/ban (come messages_insert_member).
create policy message_reactions_insert_own
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active_user((select auth.uid()))
  );

create policy message_reactions_delete_own
  on public.message_reactions for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Realtime: stessa publication della chat (pattern idempotente di 20260701010000).
do $$
declare
  v_tables text[] := array['message_reactions'];
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

-- =============================================================================
-- 5. Ricerca full-text — colonna generata + GIN
-- =============================================================================
-- Config schema-qualificata ('pg_catalog.italian'): l'espressione di una colonna
-- generata deve essere immutabile e indipendente dal search_path.
alter table public.messages
  add column body_tsv tsvector
  generated always as (to_tsvector('pg_catalog.italian'::regconfig, coalesce(body, ''))) stored;

create index messages_body_tsv_idx on public.messages using gin (body_tsv);

-- =============================================================================
-- 6. RPC search_messages — ricerca in-chat (p_conv) e globale (p_conv null)
-- =============================================================================
-- SECURITY DEFINER: replica ESATTAMENTE la visibilità della lista messaggi —
-- membership del chiamante, niente cancellati, niente effimeri scaduti, niente
-- messaggi precedenti a cleared_at, niente conversazioni nascoste (hidden_at).
-- websearch_to_tsquery: sintassi utente libera (frasi tra virgolette, OR, -).
create or replace function public.search_messages(
  p_query  text,
  p_conv   uuid default null,
  p_limit  int default 20,
  p_before timestamptz default null
)
returns table (
  message_id      uuid,
  conversation_id uuid,
  body            text,
  created_at      timestamptz,
  sender_id       uuid,
  sender_username text,
  conv_type       public.conversation_type,
  conv_title      text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_q   tsquery;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Query troppo corta o vuota: risultato vuoto, non un errore.
  if p_query is null or length(trim(p_query)) < 2 then
    return;
  end if;
  -- websearch_to_tsquery è una built-in: pg_catalog è sempre risolto anche con
  -- search_path = ''. numnode = 0 → query di sole stopword: nessun risultato.
  v_q := pg_catalog.websearch_to_tsquery('pg_catalog.italian'::regconfig, p_query);
  if pg_catalog.numnode(v_q) = 0 then
    return;
  end if;

  -- ⚠️ Tutte le colonne qualificate: i nomi OUT collidono con quelli delle tabelle.
  return query
  select
    m.id,
    m.conversation_id,
    m.body,
    m.created_at,
    m.sender_id,
    sp.username::text,
    c.type,
    case
      when c.type = 'dm' then coalesce((
        select pp.username::text
        from public.conversation_members cm2
        join public.profiles pp on pp.id = cm2.user_id
        where cm2.conversation_id = c.id and cm2.user_id <> v_uid
        limit 1
      ), 'Utente')
      else coalesce(c.name, 'Gruppo')
    end
  from public.messages m
  join public.conversation_members cm
    on cm.conversation_id = m.conversation_id and cm.user_id = v_uid
  join public.conversations c on c.id = m.conversation_id
  left join public.profiles sp on sp.id = m.sender_id
  where m.body_tsv @@ v_q
    and m.deleted_at is null
    and (m.expires_at is null or m.expires_at > now())
    and (cm.cleared_at is null or m.created_at > cm.cleared_at)
    and cm.hidden_at is null
    and (p_conv is null or m.conversation_id = p_conv)
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

revoke all on function public.search_messages(text, uuid, int, timestamptz) from public;
grant execute on function public.search_messages(text, uuid, int, timestamptz) to authenticated;

-- =============================================================================
-- 7. Gestione gruppo — meta (nome/avatar), promozione admin, leave v2
-- =============================================================================
-- Rinomina/avatar del gruppo: solo admin, mai sulle DM. L'avatar è un URL https
-- (bucket pubblico `avatars`, caricato dal client nella PROPRIA cartella —
-- policy storage esistenti); null lo rimuove. Niente audit_log: è gestione
-- utente del gruppo, non un'azione di moderazione.
create or replace function public.update_conversation_meta(
  p_conv       uuid,
  p_name       text,
  p_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_type public.conversation_type;
  v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select c.type into v_type from public.conversations c where c.id = p_conv;
  if v_type is null then raise exception 'conversation_not_found'; end if;
  if v_type = 'dm' then raise exception 'cannot_edit_dm'; end if;
  if not public.is_conv_admin(p_conv, v_uid) then raise exception 'not_admin'; end if;

  v_name := trim(p_name);
  if v_name is null or length(v_name) < 1 or length(v_name) > 80 then
    raise exception 'invalid_name';
  end if;

  if p_avatar_url is not null then
    if p_avatar_url !~ '^https://' or length(p_avatar_url) > 500 then
      raise exception 'invalid_avatar_url';
    end if;
  end if;

  update public.conversations
     set name = v_name, avatar_url = p_avatar_url
   where id = p_conv;

  return jsonb_build_object('ok', true);
end;
$$;

-- Promozione volontaria di un membro ad admin (idempotente su già-admin).
create or replace function public.promote_conversation_admin(p_conv uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_type public.conversation_type;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select c.type into v_type from public.conversations c where c.id = p_conv;
  if v_type is null then raise exception 'conversation_not_found'; end if;
  if v_type = 'dm' then raise exception 'cannot_edit_dm'; end if;
  if not public.is_conv_admin(p_conv, v_uid) then raise exception 'not_admin'; end if;

  update public.conversation_members
     set role = 'admin'
   where conversation_id = p_conv and user_id = p_user;
  if not found then raise exception 'target_not_member'; end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- leave_conversation v2 (stessa firma di 20260628160100): se esce l'ultimo
-- admin e restano membri, auto-promozione del più anziano (R-09; joined_at,
-- tie-break deterministico su user_id). Gruppo svuotato: resta orfano fino al
-- cron di cleanup (CM8, R-16).
create or replace function public.leave_conversation(p_conv uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_type public.conversation_type;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  delete from public.conversation_members
  where conversation_id = p_conv and user_id = v_uid;

  select c.type into v_type from public.conversations c where c.id = p_conv;
  if v_type in ('group', 'house') and not exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conv and m.role = 'admin'
  ) then
    update public.conversation_members m
       set role = 'admin'
     where m.conversation_id = p_conv
       and m.user_id = (
         select m2.user_id
         from public.conversation_members m2
         where m2.conversation_id = p_conv
         order by m2.joined_at asc, m2.user_id asc
         limit 1
       );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.update_conversation_meta(uuid, text, text) from public;
revoke all on function public.promote_conversation_admin(uuid, uuid) from public;
revoke all on function public.leave_conversation(uuid) from public;
grant execute on function public.update_conversation_meta(uuid, text, text) to authenticated;
grant execute on function public.promote_conversation_admin(uuid, uuid) to authenticated;
grant execute on function public.leave_conversation(uuid) to authenticated;

-- =============================================================================
-- 8. process_account_deletion v3 — corpo v2 verbatim + pulizia reazioni
-- =============================================================================
create or replace function public.process_account_deletion(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then return; end if;

  -- Profilo: anonimizzato e soft-eliminato (username deterministico e valido).
  update public.profiles set
    username       = 'deleted_' || left(replace(p_user::text, '-', ''), 12),
    display_name   = null,
    avatar_url     = null,
    audio_bio_url  = null,
    status_text    = null,
    customization  = '{}'::jsonb,
    interests      = '{}',
    share_location = false,
    expo_push_token = null,
    deleted_at     = coalesce(deleted_at, now())
  where id = p_user;

  -- Dato sensibile: la birth_date privata va rimossa SUBITO.
  delete from public.profiles_private where id = p_user;

  -- Contenuti dell'utente: rimossi/oscurati subito.
  update public.messages set deleted_at = now(), body = null, audio_url = null
  where sender_id = p_user;
  delete from public.drops          where author_id = p_user;
  delete from public.live_presence  where user_id   = p_user;
  delete from public.room_locations where host_id   = p_user;
  delete from public.devices        where user_id   = p_user;
  delete from public.top_friends    where user_id = p_user or friend_id = p_user;

  -- Nuove tabelle chat (CM1, RC-12): hash rubrica e bookmark personali.
  delete from public.contact_hashes where user_id = p_user;
  delete from public.saved_messages where user_id = p_user;

  -- CM4: le reazioni sono dato personale quanto i bookmark.
  delete from public.message_reactions where user_id = p_user;

  perform public.log_audit('account_anonymized', 'user', p_user, '{}'::jsonb);
end;
$$;
