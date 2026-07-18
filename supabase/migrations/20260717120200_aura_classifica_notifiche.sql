-- =============================================================================
-- Televo — M16 (AC1): Classifica Aura — rank snapshot + notifiche retention
-- =============================================================================
-- docs/aura/classifica.md (Rev. 1) §7 e §13.3. Il motore delle tre notifiche
-- retention (AC-4) è lo SNAPSHOT GIORNALIERO dei rank: ogni notte, DOPO il
-- ricalcolo Aura delle 03:00 UTC, il cron aura-rank-daily fotografa il rank
-- personale di ogni utente listed e lo confronta col giorno prima. Il recap
-- settimanale è un broadcast DOSATO, clone strutturale di notify_drop_prompt.
--
-- Vincoli di design:
--  · Il rank è PERSONALE (posizione tra i PROPRI amici): la window è
--    `partition by owner` — lo stesso utente ha rank diversi nelle classifiche
--    di amici diversi. Stesso predicato di partecipazione e stesso ordinamento
--    della porta di lettura aura_leaderboard (AC0): mai due logiche divergenti.
--  · Tabelle di SISTEMA: RLS attiva senza policy + revoke (pattern
--    drop_prompts). Il client non le legge MAI: il rank vivo arriva da
--    aura_leaderboard; queste servono solo a cron e GDPR. Retention 14 giorni
--    (il diff usa solo ieri; minimizzazione — purge in AC2, expire_content v10).
--  · Primo snapshot assoluto di un utente ⇒ nessun diff ⇒ NESSUNA notifica:
--    il modulo parte in silenzio (§10.18).
--  · Consegna: pipeline esistente (notifications → dispatch_push → send-push),
--    nessun pezzo nuovo. Insert set-based, mai loop.

-- -----------------------------------------------------------------------------
-- 1. aura_rank_snapshots — la fotografia giornaliera (solo utenti listed).
-- -----------------------------------------------------------------------------
create table public.aura_rank_snapshots (
  user_id       uuid    not null references public.profiles (id) on delete cascade,
  computed_on   date    not null,              -- giorno del calcolo (UTC)
  rank          integer not null,              -- posizione tra i PROPRI amici visibili
  friends_total integer not null,              -- partecipanti, me incluso
  aura_score    numeric not null,              -- punteggio fotografato (recap/export)
  primary key (user_id, computed_on)
);

-- -----------------------------------------------------------------------------
-- 2. aura_recap_of_week — dosaggio del recap settimanale (clone strutturale di
--    drop_prompt_of_day): una riga per settimana ISO, orario semi-random scelto
--    UNA volta, guardia atomica anti-doppio invio.
-- -----------------------------------------------------------------------------
create table public.aura_recap_of_week (
  for_week    date primary key,                -- il lunedì ISO della settimana
  send_after  timestamptz not null,            -- domenica 17:00–19:30 Europe/Rome
  notified_at timestamptz                      -- valorizzato all'invio (una volta)
);

-- -----------------------------------------------------------------------------
-- 3. aura_rank_daily — cron 03:30 UTC (dopo aura-recompute-daily delle 03:00).
--    Un'unica passata set-based: upsert dello snapshot di oggi (idempotente per
--    giorno: la riesecuzione è sicura) + diff col giorno prima → notifiche
--    aura_podio / aura_sorpasso (§7.1/§7.2).
-- -----------------------------------------------------------------------------
create or replace function public.aura_rank_daily()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1) Fotografia dei rank personali. `people` = universo dei partecipanti
  --    (§2.1: cancellati/bannati/non-listed fuori, mutati dentro); `edges` =
  --    amicizie accepted in ENTRAMBE le direzioni; ogni owner è membro della
  --    propria classifica. Ordinamento identico ad aura_leaderboard (§2.2).
  with people as (
    select p.id, p.aura_score, p.created_at
    from public.profiles p
    where p.deleted_at is null
      and p.banned_at  is null
      and p.show_in_leaderboard
  ),
  edges as (
    select f.user_id as owner, f.friend_id as member
    from public.friendships f
    where f.status = 'accepted'
    union all
    select f.friend_id as owner, f.user_id as member
    from public.friendships f
    where f.status = 'accepted'
  ),
  membership as (
    select po.id as owner, po.id as member
    from people po
    union all
    select e.owner, e.member
    from edges e
    join people po on po.id = e.owner
    join people pm on pm.id = e.member
  ),
  ranked as (
    select ms.owner,
           ms.member,
           pm.aura_score,
           row_number() over (partition by ms.owner
                              order by pm.aura_score desc,
                                       pm.created_at asc,
                                       pm.id asc) as rnk,
           count(*) over (partition by ms.owner) as total
    from membership ms
    join people pm on pm.id = ms.member
  )
  insert into public.aura_rank_snapshots (user_id, computed_on, rank, friends_total, aura_score)
  select r.owner, current_date, r.rnk, r.total, r.aura_score
  from ranked r
  where r.member = r.owner
  on conflict (user_id, computed_on) do update
    set rank          = excluded.rank,
        friends_total = excluded.friends_total,
        aura_score    = excluded.aura_score;

  -- 2) aura_podio (§7.1): ieri fuori dal podio, oggi dentro. Il diff è con lo
  --    snapshot più recente PRECEDENTE a oggi (lateral): al primo snapshot
  --    assoluto non c'è riga ⇒ silenzio. Soglia friends_total >= 4 (con 3 o
  --    meno il podio è "tutti sul podio", QA-3). Destinatari attivi e listed
  --    (cancello notifiche, §2.3 punto 3: lo snapshot di oggi contiene SOLO
  --    listed per costruzione). Dedup del repo: mai accumulare copie non lette
  --    dello stesso tipo.
  insert into public.notifications (user_id, type, title, body, payload)
  select s.user_id, 'aura_podio',
         'Sei sul podio Aura 🏆',
         'Ora sei ' || s.rank || '° tra i tuoi amici.',
         jsonb_build_object('rank', s.rank, 'old_rank', prev.rank)
  from public.aura_rank_snapshots s
  cross join lateral (
    select p2.rank
    from public.aura_rank_snapshots p2
    where p2.user_id = s.user_id
      and p2.computed_on < s.computed_on
    order by p2.computed_on desc
    limit 1
  ) prev
  where s.computed_on = current_date
    and s.friends_total >= 4
    and prev.rank > 3
    and s.rank <= 3
    and public.is_active_user(s.user_id)
    and not exists (
      select 1 from public.notifications n
      where n.user_id = s.user_id
        and n.type = 'aura_podio'
        and n.read_at is null);

  -- 3) aura_sorpasso (§7.2, AC-4): SOLO ex-podio (old_rank <= 3) che perde
  --    almeno una posizione (anche restando nel podio: 1°→2° notifica; 4°→7°
  --    no). Mutuamente esclusiva con aura_podio per costruzione (una richiede
  --    old > 3, l'altra old <= 3). Il sorpassante è ANONIMO: mai il nome
  --    (anti-ansia tra minori; nessuna identità di terzi nel ledger).
  insert into public.notifications (user_id, type, title, body, payload)
  select s.user_id, 'aura_sorpasso',
         'Un amico ti ha superato',
         'Sei sceso al ' || s.rank || '° posto nella classifica Aura.',
         jsonb_build_object('rank', s.rank, 'old_rank', prev.rank)
  from public.aura_rank_snapshots s
  cross join lateral (
    select p2.rank
    from public.aura_rank_snapshots p2
    where p2.user_id = s.user_id
      and p2.computed_on < s.computed_on
    order by p2.computed_on desc
    limit 1
  ) prev
  where s.computed_on = current_date
    and s.friends_total >= 4
    and prev.rank <= 3
    and s.rank > prev.rank
    and public.is_active_user(s.user_id)
    and not exists (
      select 1 from public.notifications n
      where n.user_id = s.user_id
        and n.type = 'aura_sorpasso'
        and n.read_at is null);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. notify_aura_recap — cron a tick domenicali (finestra UTC 15–19: copre
--    17:00–19:30 Roma sia in CEST sia in CET); la funzione si auto-gata su
--    send_after. Struttura verbatim di notify_drop_prompt: assicura la riga di
--    dosaggio → esce se non è l'ora o già inviato → guardia atomica → insert
--    set-based ai destinatari eleggibili (§7.3): attivi, listed, con
--    friends_total >= 3 nello snapshot di oggi (QA-2; con un solo amico il
--    recap è rumore). Inviato ogni settimana anche senza variazioni (QA-4).
-- -----------------------------------------------------------------------------
create or replace function public.notify_aura_recap()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_monday date := (date_trunc('week', now() at time zone 'Europe/Rome'))::date;
  v_row    public.aura_recap_of_week%rowtype;
begin
  -- Assicura la riga della settimana corrente: send_after semi-random, scelto
  -- UNA volta (domenica = lunedì ISO + 6, tra le 17:00 e le 19:30 di Roma).
  insert into public.aura_recap_of_week (for_week, send_after)
  values (
    v_monday,
    (((v_monday + 6)::timestamp + time '17:00')
      + (random() * interval '150 minutes')) at time zone 'Europe/Rome'
  )
  on conflict (for_week) do nothing;

  select * into v_row from public.aura_recap_of_week where for_week = v_monday;
  if v_row.for_week    is null     then return; end if;
  if v_row.notified_at is not null then return; end if;  -- già inviato
  if now() < v_row.send_after      then return; end if;  -- non ancora l'ora

  -- Guardia atomica: vince un solo tick (gli altri escono con NOT FOUND).
  update public.aura_recap_of_week
  set notified_at = now()
  where for_week = v_monday and notified_at is null;
  if not found then return; end if;

  -- Broadcast set-based. Il rank e friends_total vengono dallo snapshot di
  -- OGGI (il cron delle 03:30 è già passato); la ri-verifica su profiles
  -- copre chi si è nascosto o è stato cancellato DOPO lo snapshot.
  insert into public.notifications (user_id, type, title, body, payload)
  select s.user_id, 'aura_recap',
         'La classifica Aura è pronta ✨',
         'Sei ' || s.rank || '° tra i tuoi amici questa settimana.',
         jsonb_build_object('rank', s.rank, 'friends_total', s.friends_total)
  from public.aura_rank_snapshots s
  join public.profiles p on p.id = s.user_id
  where s.computed_on = current_date
    and s.friends_total >= 3
    and p.deleted_at is null
    and p.show_in_leaderboard
    and public.is_active_user(s.user_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Grants & RLS. Tabelle di sistema: RLS senza policy + revoke totale.
--    Funzioni: NESSUN grant client (girano come owner via cron); revoke
--    esplicito anche da anon/authenticated (default privileges hosted, CM8).
-- -----------------------------------------------------------------------------
alter table public.aura_rank_snapshots enable row level security;
alter table public.aura_recap_of_week  enable row level security;
revoke all on public.aura_rank_snapshots from anon, authenticated;
revoke all on public.aura_recap_of_week  from anon, authenticated;

revoke all on function public.aura_rank_daily()   from public, anon, authenticated;
revoke all on function public.notify_aura_recap() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Scheduling (pg_cron; cron.schedule fa upsert per jobname, idempotente).
--    · aura-rank-daily alle 03:30 UTC: dopo il ricalcolo Aura delle 03:00 (a
--      scala invite-only il ricalcolo chiude in secondi; l'upsert è comunque
--      idempotente per giorno — rischio monitorato, §10.17).
--    · aura-recap-weekly: tick domenicali ogni 15 min in finestra 15–19 UTC.
-- -----------------------------------------------------------------------------
select cron.schedule(
  'aura-rank-daily',
  '30 3 * * *',
  $$ select public.aura_rank_daily(); $$
);
select cron.schedule(
  'aura-recap-weekly',
  '*/15 15-19 * * 0',
  $$ select public.notify_aura_recap(); $$
);
