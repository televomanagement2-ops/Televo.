-- =============================================================================
-- Televo — M16 (AC0): Classifica Aura — flag visibilità + porta di lettura
-- =============================================================================
-- docs/aura/classifica.md (Rev. 1, decisioni PO AC-1..AC-5 del 2026-07-16).
-- La classifica dell'Aura è SOLO tra amici accettati (AC-1): partecipanti =
-- io + i miei amici a mutuo consenso — mai globale, mai amici-di-amici. La
-- classifica LEGGE l'Aura, non la scrive: nessun evento nuovo, nessun peso
-- nuovo (guardarla/condividerla/vincerla NON dà Aura, anti-gaming §8).
--
-- I due pezzi nascono INSIEME in questa migrazione (mai una finestra in cui la
-- classifica esiste senza opt-out):
--  · profiles.show_in_leaderboard (default true) — opt-out RECIPROCO (AC-2):
--    chi si nasconde NON appare a nessuno E NON vede la classifica dei suoi
--    amici. Il flag entra nel grant UPDATE per-colonna ma resta FUORI dal
--    grant SELECT: un estraneo non deve poter enumerare chi si nasconde
--    (§13.1); lo stato proprio viaggia come `listed` nell'envelope della RPC
--    (il client fa `.update()` senza `.select()`, return=minimal).
--  · aura_leaderboard() — l'UNICA porta di lettura (§13.2): UI e motore
--    notifiche derivano tutti dagli stessi filtri di partecipazione — mai
--    duplicare il predicato con logiche divergenti. Zero parametri, niente
--    paginazione (i partecipanti sono il grafo amici: decine a scala
--    invite-only); cap difensivo 200 righe + has_more contro grafi patologici,
--    con `me` calcolato sull'insieme PIENO (posizione propria sempre presente).

-- -----------------------------------------------------------------------------
-- 1. Il flag di visibilità. Famiglia preferenze esistente su profiles
--    (share_location, show_last_seen, show_read_receipts): stessa collocazione,
--    stesso naming inglese. Nessun setter RPC: il flag non ha side-effect da
--    orchestrare (precedente show_last_seen).
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists show_in_leaderboard boolean not null default true;

-- Solo UPDATE per-colonna (RLS profiles_update_own limita alla propria riga).
-- NIENTE grant SELECT: asimmetria voluta (§13.1), verificata in pgTAP.
grant update (show_in_leaderboard) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 2. aura_leaderboard() — la porta di lettura (§13.2).
--    Ordinamento (§2.2): aura_score desc, pari merito per anzianità su Televo
--    (created_at asc), poi id asc come spareggio finale deterministico.
--    row_number() → ranghi sempre sequenziali 1,2,3… (il podio ha tre scalini
--    fisici: due «primi» non ci stanno). Ordine totale e stabile tra refetch.
-- -----------------------------------------------------------------------------
create or replace function public.aura_leaderboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_listed boolean;
  v_total  integer;
  v_me     jsonb;
  v_rows   jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Cancello chiamante (§2.3 punto 1), PRIMA di ogni join: il non listed è uno
  -- stato di prodotto (envelope corto, CTA di rientro nel client), non un
  -- errore. Mai costruire righe per poi scartarle.
  select p.show_in_leaderboard into v_listed
  from public.profiles p
  where p.id = v_uid;
  if v_listed is distinct from true then
    return jsonb_build_object('server_now', now(), 'listed', false);
  end if;

  -- Partecipanti (§2.1): io + i miei amici accepted (coppia normalizzata:
  -- l'amico è "l'altro capo" della riga). Filtri: cancellati e bannati FUORI;
  -- non listed FUORI (cancello righe, §2.3 punto 2); mutati DENTRO (il mute
  -- blocca la creazione di contenuti, non la presenza — toglierli sarebbe una
  -- seconda pena e un segnale pubblico della sanzione). Le coppie bloccate
  -- sono impossibili per costruzione tra righe accepted (invariante pgTAP).
  with friends as (
    select case when f.user_id = v_uid then f.friend_id else f.user_id end as id
    from public.friendships f
    where f.status = 'accepted'
      and (f.user_id = v_uid or f.friend_id = v_uid)
  ),
  participants as (
    select p.id, p.username, p.display_name, p.avatar_url,
           p.aura_score, p.aura_color, p.created_at
    from public.profiles p
    where (p.id = v_uid or p.id in (select fr.id from friends fr))
      and p.deleted_at is null
      and p.banned_at  is null
      and p.show_in_leaderboard
  ),
  ranked as (
    select pa.*,
           row_number() over (order by pa.aura_score desc,
                                       pa.created_at asc,
                                       pa.id asc) as rnk
    from participants pa
  )
  select count(*)::int,
         (select jsonb_build_object(
                   'rank',       r_me.rnk,
                   'aura_score', r_me.aura_score,
                   'aura_color', r_me.aura_color)
          from ranked r_me
          where r_me.id = v_uid),
         coalesce(jsonb_agg(jsonb_build_object(
                    'rank',         r.rnk,
                    'id',           r.id,
                    'username',     r.username,
                    'display_name', r.display_name,
                    'avatar_url',   r.avatar_url,
                    'aura_score',   r.aura_score,
                    'aura_color',   r.aura_color,
                    'is_me',        r.id = v_uid)
                  order by r.rnk) filter (where r.rnk <= 200),
                  '[]'::jsonb)
    into v_total, v_me, v_rows
  from ranked r;

  -- Envelope (§13.2): friends_total = partecipanti me incluso; `me` sticky
  -- (dall'insieme pieno, presente anche oltre il cap); has_more dal totale.
  return jsonb_build_object(
    'server_now',    now(),
    'listed',        true,
    'friends_total', v_total,
    'me',            v_me,
    'rows',          v_rows,
    'has_more',      v_total > 200);
end;
$$;

-- Grant/revoke contract obbligatorio: i DEFAULT PRIVILEGES dell'hosted
-- concedono EXECUTE a anon/authenticated su ogni nuova funzione (lezione CM8):
-- revoke esplicito, poi grant mirato.
revoke all on function public.aura_leaderboard() from public, anon, authenticated;
grant execute on function public.aura_leaderboard() to authenticated;
