-- =============================================================================
-- Televo — Gamification: traguardi (badge) sani, non vanity
-- =============================================================================
-- I traguardi premiano comportamenti coerenti coi pilastri (presenza reale,
-- accoglienza, connessioni autentiche), NON il volume. Sono un layer parallelo
-- all'Aura: NON toccano il punteggio Aura (separazione netta badge ↔ reputazione).
-- Lo sblocco è idempotente e avviene server-side (SECURITY DEFINER) tramite
-- trigger sugli eventi reali; allo sblocco parte una notifica.

create table public.achievements (
  key         text primary key,
  name        text not null,
  description text not null,
  icon        text not null default '🏆',
  category    text not null default 'general',
  created_at  timestamptz not null default now()
);

create table public.user_achievements (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  achievement_key text not null references public.achievements (key) on delete cascade,
  is_public       boolean not null default true,
  unlocked_at     timestamptz not null default now(),
  primary key (user_id, achievement_key)
);

create index user_achievements_key_idx on public.user_achievements (achievement_key);

-- -----------------------------------------------------------------------------
-- unlock_achievement — sblocco idempotente + notifica al primo sblocco.
-- Ritorna true solo se appena sbloccato.
-- -----------------------------------------------------------------------------
create or replace function public.unlock_achievement(p_user uuid, p_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_name text;
begin
  if p_user is null then return false; end if;
  select name into v_name from public.achievements where key = p_key;
  if v_name is null then return false; end if;  -- chiave sconosciuta
  if not exists (select 1 from public.profiles where id = p_user and deleted_at is null) then
    return false;
  end if;

  insert into public.user_achievements (user_id, achievement_key)
  values (p_user, p_key)
  on conflict (user_id, achievement_key) do nothing;

  if not found then
    return false;  -- già sbloccato
  end if;

  perform public.enqueue_notification(
    p_user, 'achievement', 'Nuovo traguardo!', v_name,
    jsonb_build_object('achievement_key', p_key)
  );
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger di assegnazione — agganciati agli eventi reali già esistenti.
-- -----------------------------------------------------------------------------

-- Primo drop pubblicato.
create or replace function public.drops_after_insert_achv()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.unlock_achievement(new.author_id, 'first_drop');
  return new;
end; $$;
create trigger drops_after_insert_achv_trg
  after insert on public.drops
  for each row execute function public.drops_after_insert_achv();

-- Primo messaggio inviato.
create or replace function public.messages_after_insert_achv()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.unlock_achievement(new.sender_id, 'first_message');
  return new;
end; $$;
create trigger messages_after_insert_achv_trg
  after insert on public.messages
  for each row execute function public.messages_after_insert_achv();

-- Prima stanza andata live (host).
create or replace function public.rooms_after_update_achv()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    perform public.unlock_achievement(new.host_id, 'first_live');
  end if;
  return new;
end; $$;
create trigger rooms_after_update_achv_trg
  after update on public.rooms
  for each row execute function public.rooms_after_update_achv();

-- Amicizia accettata -> prima amicizia per entrambe le parti.
create or replace function public.friendships_after_update_achv()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform public.unlock_achievement(new.user_id, 'first_friend');
    perform public.unlock_achievement(new.friend_id, 'first_friend');
  end if;
  return new;
end; $$;
create trigger friendships_after_update_achv_trg
  after update on public.friendships
  for each row execute function public.friendships_after_update_achv();

-- Streak di costanza: 7 e 30 giorni.
create or replace function public.streaks_after_update_achv()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  -- premia tutti i membri della conversazione (la streak è condivisa).
  for v_uid in
    select user_id from public.conversation_members where conversation_id = new.conversation_id
  loop
    if new.current_streak >= 7  then perform public.unlock_achievement(v_uid, 'streak_7');  end if;
    if new.current_streak >= 30 then perform public.unlock_achievement(v_uid, 'streak_30'); end if;
  end loop;
  return new;
end; $$;
create trigger streaks_after_update_achv_trg
  after update on public.streaks
  for each row execute function public.streaks_after_update_achv();

-- Milestone Aura (cache aggiornata da recompute_aura): 100 / 250 / 500.
create or replace function public.profiles_after_update_achv()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.aura_score is distinct from old.aura_score then
    if new.aura_score >= 100 and old.aura_score < 100 then perform public.unlock_achievement(new.id, 'aura_100'); end if;
    if new.aura_score >= 250 and old.aura_score < 250 then perform public.unlock_achievement(new.id, 'aura_250'); end if;
    if new.aura_score >= 500 and old.aura_score < 500 then perform public.unlock_achievement(new.id, 'aura_500'); end if;
  end if;
  return new;
end; $$;
create trigger profiles_after_update_achv_trg
  after update on public.profiles
  for each row execute function public.profiles_after_update_achv();

-- Props ricevuti per tratto -> badge di carattere (soglie qualità, non volume).
create or replace function public.props_after_insert_achv()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.props where recipient = new.recipient and trait = new.trait;

  if    new.trait = 'welcoming'    and v_count >= 5  then perform public.unlock_achievement(new.recipient, 'welcomer');
  elsif new.trait = 'humor'        and v_count >= 10 then perform public.unlock_achievement(new.recipient, 'humorist');
  elsif new.trait = 'contribution' and v_count >= 10 then perform public.unlock_achievement(new.recipient, 'helper');
  elsif new.trait = 'kindness'     and v_count >= 10 then perform public.unlock_achievement(new.recipient, 'kind_soul');
  end if;
  return new;
end; $$;
create trigger props_after_insert_achv_trg
  after insert on public.props
  for each row execute function public.props_after_insert_achv();

-- =============================================================================
-- Seed catalogo iniziale
-- =============================================================================
insert into public.achievements (key, name, description, icon, category) values
  ('first_drop',    'Primo Drop',           'Hai pubblicato il tuo primo momento.',                 '🎙️', 'create'),
  ('first_message', 'Rompighiaccio',        'Hai inviato il tuo primo messaggio.',                  '💬', 'social'),
  ('first_live',    'On Air',               'Hai ospitato la tua prima stanza live.',               '🔴', 'create'),
  ('first_friend',  'Connessione Reale',    'Hai stretto la tua prima amicizia.',                   '🤝', 'social'),
  ('streak_7',      'Una Settimana Insieme','7 giorni di fila in conversazione con qualcuno.',      '🔥', 'consistency'),
  ('streak_30',     'Un Mese di Vibe',      '30 giorni di fila: costanza vera.',                    '🌟', 'consistency'),
  ('aura_100',      'Aura Crescente',       'Hai raggiunto 100 di Aura.',                           '✨', 'aura'),
  ('aura_250',      'Aura Luminosa',        'Hai raggiunto 250 di Aura.',                           '💫', 'aura'),
  ('aura_500',      'Aura Magnetica',       'Hai raggiunto 500 di Aura.',                           '🌈', 'aura'),
  ('welcomer',      'Accogliente',          'In tanti ti hanno riconosciuto come persona accogliente.', '🫶', 'character'),
  ('humorist',      'Buonumore',            'La tua ironia è apprezzata da molti.',                 '😄', 'character'),
  ('helper',        'Sempre sul Pezzo',     'Aiuti gli altri e si vede.',                            '🛠️', 'character'),
  ('kind_soul',     'Cuore Gentile',        'La gentilezza è la tua firma.',                        '💖', 'character')
on conflict (key) do nothing;

-- =============================================================================
-- Grants
-- =============================================================================
grant select on public.achievements      to authenticated;
grant select on public.user_achievements to authenticated;
grant update (is_public) on public.user_achievements to authenticated;  -- mostra/nascondi badge

-- unlock_achievement: solo server/definer (nessun grant a authenticated).
revoke all on function public.unlock_achievement(uuid, text) from public;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.achievements      enable row level security;
alter table public.user_achievements enable row level security;

-- Catalogo: leggibile da tutti gli autenticati.
create policy achievements_select_all
  on public.achievements for select
  to authenticated
  using (true);

-- Badge utente: i propri sempre; quelli pubblici degli altri profili attivi.
create policy user_achievements_select_visible
  on public.user_achievements for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (is_public and exists (
          select 1 from public.profiles p
          where p.id = user_achievements.user_id and p.deleted_at is null))
  );

create policy user_achievements_update_own
  on public.user_achievements for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
