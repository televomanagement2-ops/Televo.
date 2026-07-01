-- =============================================================================
-- Televo — Aura v3: reputazione RICALCOLATA a finestra mobile (0–100%)
-- =============================================================================
-- Cambio di paradigma rispetto alla v2 (ledger accumulato + decadimento). L'Aura
-- v3 è DETERMINISTICA: si ricalcola da zero a ogni run, leggendo le tabelle
-- sorgente. Tre componenti:
--   * STATICI (cap 300)  — traguardi permanenti (proof-of-human, profilo completo,
--                          badge). Non decadono.
--   * DINAMICI (cap 700) — attività degli ultimi 7 giorni (drop, reazioni, live),
--                          con cap per categoria e rendimenti decrescenti.
--   * PENALITÀ           — segnalazioni approvate e mute degli ultimi 7 giorni.
-- Punteggio = clamp(0..100, (statici + dinamici − penalità) / 1000 * 100).
--
-- Il ledger `aura_events` RESTA: props, streak, moderazione e tip continuano a
-- scriverci (storico + colore dei tratti + segnali). Ma NON è più la fonte del
-- numero: `profiles.aura_score` diventa la PERCENTUALE 0–100. Il colore
-- (`aura_color`) resta guidato dal tratto dominante della settimana (props).
--
-- "Post" = drop. Un drop ha 3 formati: media (foto/video), audio, testo. Qui sotto
-- estendiamo `drops.type` con 'media' (il client lo prevede già: createTypes/feed).

-- -----------------------------------------------------------------------------
-- a. Drop: aggiungi il formato 'media' (foto/video) accanto a 'audio'/'text'.
-- -----------------------------------------------------------------------------
alter table public.drops add column if not exists media_url text;

alter table public.drops drop constraint if exists drops_type_check;
alter table public.drops
  add constraint drops_type_check check (type in ('text', 'audio', 'media'));

-- Il trigger di insert valida ora anche i drop media (richiedono media_url).
create or replace function public.drops_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_id := (select auth.uid());
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  if not public.is_active_user(new.author_id) then raise exception 'user_not_active'; end if;
  if new.type = 'text'  and nullif(trim(new.body), '')      is null then raise exception 'empty_drop'; end if;
  if new.type = 'audio' and nullif(trim(new.audio_url), '') is null then raise exception 'missing_audio'; end if;
  if new.type = 'media' and nullif(trim(new.media_url), '') is null then raise exception 'missing_media'; end if;
  return new;
end;
$$;

-- Il client può ora valorizzare media_url all'insert (gli altri campi di sistema
-- restano forzati dal trigger).
grant insert (type, body, audio_url, media_url, audience) on public.drops to authenticated;

-- =============================================================================
-- b. Helper di conteggio — un blocco del punteggio ciascuno. SECURITY DEFINER
--    (leggono tabelle protette da RLS), schema-qualificati, search_path vuoto.
-- =============================================================================

-- STATICI (cap 300): proof-of-human + profilo completo + badge.
create or replace function public.aura_static_points(p_user uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select least(
    300,
    -- Proof of Human: ha partecipato ad almeno una stanza live (presenza reale).
    (case when exists (
       select 1 from public.room_participants rp where rp.user_id = p_user
     ) then 100 else 0 end)
    -- Profilo completo: avatar + bio + nome AND >=5 amici AND >=1 drop pubblicato.
    + (case when exists (
         select 1 from public.profiles p
         where p.id = p_user
           and p.avatar_url is not null
           and nullif(trim(p.status_text), '')  is not null
           and nullif(trim(p.display_name), '') is not null
       )
       and (
         select count(*) from public.friendships f
         where f.status = 'accepted'
           and (f.user_id = p_user or f.friend_id = p_user)
       ) >= 5
       and exists (select 1 from public.drops d where d.author_id = p_user)
       then 50 else 0 end)
    -- Badge sbloccati: 15 punti ciascuno.
    + (select count(*) from public.user_achievements ua where ua.user_id = p_user) * 15
  )::numeric;
$$;

-- DINAMICI (cap 700): attività ultimi 7 giorni, cap per categoria + rendimenti
-- decrescenti su reazioni e minuti live.
create or replace function public.aura_dynamic_points(p_user uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since      timestamptz := now() - interval '7 days';
  v_audio      integer;
  v_post       integer;   -- media + testo (i "post" non-audio)
  v_reactions  integer;
  v_minutes    numeric;
  v_p_audio    numeric;
  v_p_post     numeric;
  v_p_react    numeric := 0;
  v_p_live     numeric := 0;
  v_total      numeric;
begin
  -- Drop audio: 20 pt cad., cap 140 (≈ 7/sett premiati).
  select count(*) into v_audio
  from public.drops d
  where d.author_id = p_user and d.created_at >= v_since and d.type = 'audio';
  v_p_audio := least(v_audio * 20, 140);

  -- Drop media + testo: 15 pt cad., cap 105.
  select count(*) into v_post
  from public.drops d
  where d.author_id = p_user and d.created_at >= v_since and d.type in ('media', 'text');
  v_p_post := least(v_post * 15, 105);

  -- Commenti audio = reazioni date ai drop. Rendimenti decrescenti, cap 150.
  --   primi 10 → 5pt, dall'11 al 30 → 2pt, dal 31 al 50 → 1pt.
  select count(*) into v_reactions
  from public.drop_reactions r
  where r.user_id = p_user and r.created_at >= v_since;
  v_p_react := least(v_reactions, 10) * 5;
  if v_reactions > 10 then v_p_react := v_p_react + least(v_reactions - 10, 20) * 2; end if;
  if v_reactions > 30 then v_p_react := v_p_react + least(v_reactions - 30, 20) * 1; end if;
  v_p_react := least(v_p_react, 150);

  -- Live: minuti in stanza (left_at o adesso, se ancora dentro). Rendimenti
  -- decrescenti, cap 200. 1ª ora → 1pt/min, 2ª–3ª → 0.5, oltre → 0.25.
  select coalesce(sum(
           extract(epoch from (coalesce(rp.left_at, now()) - rp.joined_at)) / 60.0
         ), 0) into v_minutes
  from public.room_participants rp
  where rp.user_id = p_user and rp.joined_at >= v_since;
  v_p_live := least(v_minutes, 60) * 1.0;
  if v_minutes > 60  then v_p_live := v_p_live + least(v_minutes - 60, 120) * 0.5;  end if;
  if v_minutes > 180 then v_p_live := v_p_live + least(v_minutes - 180, 120) * 0.25; end if;
  v_p_live := least(v_p_live, 200);

  v_total := v_p_audio + v_p_post + v_p_react + v_p_live;
  return least(v_total, 700);
end;
$$;

-- PENALITÀ: segnalazioni approvate (azione di moderazione presa) + mute, 7gg.
-- "Segnalazione approvata" = moderation_action presa sull'utente (warn/mute/ban).
create or replace function public.aura_penalty_points(p_user uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since   timestamptz := now() - interval '7 days';
  v_reports integer;
  v_mutes   integer;
begin
  select count(*) into v_reports
  from public.moderation_actions ma
  where ma.target_type = 'user' and ma.target_id = p_user
    and ma.created_at >= v_since;

  select count(*) into v_mutes
  from public.moderation_actions ma
  where ma.target_type = 'user' and ma.target_id = p_user
    and ma.action = 'mute' and ma.created_at >= v_since;

  return (v_reports * 50) + (v_mutes * 25);
end;
$$;

-- Composizione finale → percentuale 0–100 (denominatore unico = 1000).
create or replace function public.aura_percentage(p_user uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, least(100,
    round(
      (public.aura_static_points(p_user)
       + public.aura_dynamic_points(p_user)
       - public.aura_penalty_points(p_user)
      ) / 1000.0 * 100.0
    , 2)
  ));
$$;

-- Helper read-only per il client (il proprio punteggio "in tempo reale", senza
-- attendere il cron giornaliero). RLS-safe: ognuno vede solo il proprio.
create or replace function public.my_aura_percentage()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select public.aura_percentage((select auth.uid()));
$$;

revoke all on function public.aura_static_points(uuid)  from public;
revoke all on function public.aura_dynamic_points(uuid) from public;
revoke all on function public.aura_penalty_points(uuid) from public;
revoke all on function public.aura_percentage(uuid)     from public;
revoke all on function public.my_aura_percentage()      from public;
grant execute on function public.my_aura_percentage() to authenticated;

-- =============================================================================
-- c. recompute_aura v3 — RIDEFINISCE la v2. Ricalcola la percentuale per ogni
--    profilo, aggiorna il colore dal tratto dominante, scrive lo snapshot e
--    notifica le variazioni significative. Volume utenti basso (invite-only):
--    il loop per-utente è leggibile e adeguato.
-- =============================================================================
create or replace function public.recompute_aura()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec       record;
  v_new     numeric;
  v_old     numeric;
  v_penalty numeric;
  v_delta   numeric;
begin
  for rec in
    select id, aura_score from public.profiles where deleted_at is null
  loop
    v_old     := coalesce(rec.aura_score, 0);
    v_new     := public.aura_percentage(rec.id);
    v_penalty := public.aura_penalty_points(rec.id);
    v_delta   := v_new - v_old;

    update public.profiles set aura_score = v_new where id = rec.id;

    -- Notifica solo le variazioni significative (>= 5 punti percentuali).
    if abs(v_delta) >= 5 then
      if v_delta > 0 then
        perform public.enqueue_notification(
          rec.id, 'aura_upgrade',
          'La tua Aura è aumentata!', 'Continua così.',
          jsonb_build_object('old', v_old, 'new', v_new)
        );
      elsif v_penalty > 0 then
        -- Cali da inattività NON notificano: solo quelli da comportamenti scorretti.
        perform public.enqueue_notification(
          rec.id, 'aura_downgrade',
          'La tua Aura è diminuita', 'A causa di comportamenti non conformi.',
          jsonb_build_object('old', v_old, 'new', v_new)
        );
      end if;
    end if;
  end loop;

  -- Colore dell'anello: tratto dominante della settimana dal ledger (props).
  update public.profiles p
  set aura_color = public.vibe_color(t.top_trait)
  from (
    select user_id, (array_agg(type::text order by s desc))[1] as top_trait
    from (
      select user_id, type, sum(delta * public.aura_decay(created_at)) as s
      from public.aura_events
      where delta > 0
        and type in ('kindness','consistency','contribution','welcoming','humor','participation')
        and created_at > now() - interval '7 days'
      group by user_id, type
    ) r
    group by user_id
  ) t
  where t.user_id = p.id;

  -- Snapshot settimanale (score = percentuale; breakdown dai tratti del ledger).
  insert into public.aura_snapshots (user_id, period_start, score, vibe_color, character_breakdown)
  select p.id,
         date_trunc('week', now())::date,
         p.aura_score,
         coalesce(p.aura_color, public.vibe_color(null)),
         coalesce(b.breakdown, '{}'::jsonb)
  from public.profiles p
  left join (
    select user_id, jsonb_object_agg(type::text, round(s::numeric, 2)) as breakdown
    from (
      select user_id, type, sum(delta * public.aura_decay(created_at)) as s
      from public.aura_events
      where delta > 0
        and type in ('kindness','consistency','contribution','welcoming','humor','participation')
        and created_at > now() - interval '7 days'
      group by user_id, type
    ) r
    group by user_id
  ) b on b.user_id = p.id
  where p.deleted_at is null
  on conflict (user_id, period_start)
  do update set score = excluded.score,
                vibe_color = excluded.vibe_color,
                character_breakdown = excluded.character_breakdown;

  -- Classifiche (NB: restano sui dati del ledger; il riadattamento alla nuova
  -- scala è un round successivo, vedi piano).
  refresh materialized view public.leaderboard_school;
  refresh materialized view public.leaderboard_character;
end;
$$;

-- =============================================================================
-- d. Cron: il ricalcolo passa da settimanale a GIORNALIERO (03:00 UTC). La
--    finestra mobile 7gg e le notifiche ±5% hanno senso solo con cadenza fitta.
-- =============================================================================
do $$
begin
  -- unschedule è idempotente solo se il job esiste: guard sulla tabella cron.job.
  if exists (select 1 from cron.job where jobname = 'aura-recompute-weekly') then
    perform cron.unschedule('aura-recompute-weekly');
  end if;
  if exists (select 1 from cron.job where jobname = 'aura-recompute-daily') then
    perform cron.unschedule('aura-recompute-daily');
  end if;
end;
$$;

select cron.schedule(
  'aura-recompute-daily',
  '0 3 * * *',
  $$ select public.recompute_aura(); $$
);
