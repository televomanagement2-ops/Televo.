-- =============================================================================
-- Televo — Rework Live M15 (LR1): contatori pubblici + ranking a engagement
-- =============================================================================
-- Seconda wave del rework Live (docs/live/live-rework.md, Parte II §11 LR1).
-- Due decisioni di prodotto del PO (2026-07-15) atterrano qui:
--
--  · RW-4 — Viewer count PUBBLICO. La regola anti-vanity R-04 ("contatori
--    visibili SOLO all'host") viene ROVESCIATA *limitatamente alle live*:
--    viewer_count e like_count diventano leggibili da chi può vedere la live
--    (amici visibili, non solo host/co-host). NON si abroga il resto di R-04:
--    peak_viewers resta PRIVATO (host/co-host), livekit_room_name resta ESCLUSO
--    dal grant, la lista nominativa spettatori + kick resta solo host, e i
--    DROPS restano INTOCCATI (i loro contatori privati non cambiano).
--
--  · RW-2 — Ranking del feed a engagement. In lives_feed i Best Friends del
--    viewer (top_friends) restano SEMPRE primi, poi TUTTE le altre live per
--    viewer_count desc (engagement = SOLO spettatori concorrenti). L'Aura ESCE
--    dal ranking (resta nel payload host per l'anello colore in UI); la recenza
--    scende a tie-break. Il cursore keyset diventa QUATERNARIO
--    (is_top, viewer_count, started_at, id): viewer_count entra nel payload
--    dell'item (consentito da RW-4) e nel cursore.
--
-- Superano regole precedenti (live-rework.md §0.3), da rovesciare in pgTAP a LR4:
--   · R-04 a livello dati per le live (grant viewer_count/like_count).
--   · AH-2 ("nessun contatore esce dal server, nemmeno nel cursore keyset"):
--     superata SOLO per le live — viewer_count entra nel payload E nel cursore.
--
-- Retro-compatibilità del rollout: firma lives_feed additiva-con-default (il
-- client vecchio che chiama rpc('lives_feed', {p_top, p_before, p_before_id})
-- continua a funzionare: p_viewers=null → il ramo keyset resta inerte e torna la
-- prima pagina, degradazione senza rottura); live_detail additivo (nuovi campi
-- nel payload, nessuno tolto). Nessuna finestra di rottura.
--
-- Ridefinizioni VERBATIM + add (regola del repo): i corpi di lives_feed e
-- live_detail sono copiati dall'ULTIMA versione in vigore (rispettivamente
-- 20260713150000_lives_feed_paginato.sql e 20260715130000_live_detail_cohost.sql)
-- con le SOLE differenze elencate sopra.
-- ⚠️ Il corpo di lives_feed (COMMENTI INCLUSI) non deve MAI citare peak_viewers:
--    la guardia prosrc pgTAP che vieta il contatore privato nel feed resta in
--    vigore (viene solo estesa a esigere viewer_count, LR4/R-6).

-- =============================================================================
-- 1. Grant pubblico dei contatori sul client (RW-4). ADDITIVO al grant
--    per-colonna di public.lives (LM0, 20260709120100): aggiunge viewer_count e
--    like_count alla lista leggibile da authenticated. peak_viewers e
--    livekit_room_name restano FUORI dal grant (privati / mai al client). La RLS
--    lives_select_visible continua a decidere quali RIGHE, invariata.
-- =============================================================================
grant select (viewer_count, like_count) on public.lives to authenticated;

-- =============================================================================
-- 2. lives_feed v3 — DROP della firma a 4 parametri + ricreazione a 5 (aggiunge
--    p_viewers al cursore). Corpo v2 VERBATIM con: ordinamento a engagement
--    (is_top desc, viewer_count desc, started_at desc, id desc); viewer_count
--    nel sotto-select e nel payload dell'item; keyset QUATERNARIO attivo solo se
--    TUTTI i cursor-param sono non-null. Output invariato {server_now, lives,
--    has_more}; item con UN campo in più (viewer_count).
-- =============================================================================
drop function public.lives_feed(boolean, timestamptz, uuid, integer);

create or replace function public.lives_feed(
  p_top       boolean     default null,
  p_viewers   integer     default null,
  p_before    timestamptz default null,
  p_before_id uuid        default null,
  p_limit     integer     default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid    := (select auth.uid());
  v_limit integer := least(coalesce(p_limit, 10), 20);
  v_items jsonb;
  v_count integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Si pesca v_limit+1 righe: la sentinella in eccesso decide has_more e viene
  -- scartata dal filter sull'aggregazione.
  select coalesce(jsonb_agg(x.item order by x.rn) filter (where x.rn <= v_limit),
                  '[]'::jsonb),
         coalesce(max(x.rn), 0)::int
  into v_items, v_count
  from (
    select row_number() over (order by y.is_top desc, y.viewer_count desc,
                                       y.started_at desc, y.id desc) as rn,
           jsonb_build_object(
             'live_id',          y.id,
             'title',            y.title,
             'status',           y.status,
             'visibility',       y.visibility,
             'comments_enabled', y.comments_enabled,
             'started_at',       y.started_at,
             'paused_at',        y.paused_at,
             'is_top_friend',    y.is_top,
             'viewer_count',     y.viewer_count,
             'host', jsonb_build_object(
               'user_id',      y.host_id,
               'username',     y.username,
               'display_name', y.display_name,
               'avatar_url',   y.avatar_url,
               'aura_score',   y.aura_score,
               'aura_color',   y.aura_color)
           ) as item
    from (
      select l.id, l.title, l.status, l.visibility, l.comments_enabled,
             l.started_at, l.paused_at, l.viewer_count,
             exists (select 1 from public.top_friends t
                     where t.user_id = v_uid and t.friend_id = l.host_id) as is_top,
             p.id as host_id, p.username, p.display_name, p.avatar_url,
             p.aura_score, p.aura_color
      from public.lives l
      join public.profiles p on p.id = l.host_id
      where l.ended_at is null
        and p.deleted_at is null
        and not exists (select 1 from public.live_hosts h
                        where h.live_id = l.id and h.user_id = v_uid and h.status = 'active')
        and public.can_see_live(l.id, v_uid)
    ) y
    -- Keyset QUATERNARIO tutto-desc: le righe DOPO il cursore sono quelle con
    -- tupla strettamente minore. Attivo solo quando il client passa TUTTI e
    -- quattro i pezzi del cursore (derivati dall'ultima riga della pagina); se
    -- ne manca uno (prima pagina, o client vecchio senza p_viewers) il ramo
    -- resta inerte e si torna alla prima pagina.
    where (p_top is null or p_viewers is null or p_before is null or p_before_id is null)
       or ((y.is_top::int, y.viewer_count, y.started_at, y.id)
           < (p_top::int, p_viewers, p_before, p_before_id))
    order by y.is_top desc, y.viewer_count desc, y.started_at desc, y.id desc
    limit v_limit + 1
  ) x;

  return jsonb_build_object(
    'server_now', now(),
    'lives',      v_items,
    'has_more',   v_count > v_limit);
end;
$$;

-- Grant: revoke esplicito sulla NUOVA firma (DEFAULT PRIVILEGES dell'hosted,
-- lezione CM8), poi grant mirato ad authenticated.
revoke all on function public.lives_feed(boolean, integer, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.lives_feed(boolean, integer, timestamptz, uuid, integer)
  to authenticated;

-- =============================================================================
-- 3. live_detail v3 — corpo v2 (20260715130000) VERBATIM con UN solo
--    spostamento: viewer_count e like_count entrano nel jsonb `live` di base
--    (li ricevono TUTTI i visibili, RW-4); il blocco condizionale host/co-host
--    consegna ora il SOLO peak_viewers (che resta privato, R-04 non abrogato).
--    Stessa firma → create or replace (ACL ribaditi in coda).
-- =============================================================================
create or replace function public.live_detail(p_live uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_live      public.lives%rowtype;
  v_is_host   boolean;
  v_is_cohost boolean;
  v_out       jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_live from public.lives where id = p_live;
  if not found then raise exception 'live_not_found'; end if;
  if not public.can_see_live(p_live, v_uid) then raise exception 'not_visible'; end if;

  v_is_host   := v_live.host_id = v_uid;
  v_is_cohost := exists (select 1 from public.live_hosts h
                         where h.live_id = p_live and h.user_id = v_uid
                           and h.role = 'cohost' and h.status = 'active');

  -- Contatori PUBBLICI ai visibili (RW-4): viewer_count e like_count nel payload
  -- base della live, per TUTTI quelli che la vedono.
  v_out := jsonb_build_object(
    'server_now', now(),
    'live', jsonb_build_object(
      'live_id',          v_live.id,
      'title',            v_live.title,
      'status',           v_live.status,
      'visibility',       v_live.visibility,
      'comments_enabled', v_live.comments_enabled,
      'show_on_map',      v_live.show_on_map,
      'started_at',       v_live.started_at,
      'paused_at',        v_live.paused_at,
      'ended_at',         v_live.ended_at,
      'viewer_count',     v_live.viewer_count,
      'like_count',       v_live.like_count),
    'hosts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id',      p.id,
               'username',     p.username,
               'display_name', p.display_name,
               'avatar_url',   p.avatar_url,
               'aura_color',   p.aura_color,
               'role',         h.role,
               'joined_at',    h.joined_at)
             order by (h.role = 'host') desc, h.joined_at)
      from public.live_hosts h
      join public.profiles p on p.id = h.user_id
      where h.live_id = p_live and h.status = 'active' and p.deleted_at is null),
      '[]'::jsonb),
    'me', jsonb_build_object(
      'is_host',     v_is_host,
      'is_cohost',   v_is_cohost,
      'can_comment', (v_live.status = 'live'
                      and v_live.comments_enabled
                      and public.is_active_user(v_uid))));

  -- peak_viewers resta PRIVATO di chi sta trasmettendo (host attivi): non
  -- raggiunge MAI gli spettatori (R-04 non abrogato per il picco storico).
  if v_is_host or v_is_cohost then
    v_out := v_out || jsonb_build_object('peak_viewers', v_live.peak_viewers);
  end if;

  return v_out;
end;
$$;

revoke all on function public.live_detail(uuid) from public, anon, authenticated;
grant execute on function public.live_detail(uuid) to authenticated;
