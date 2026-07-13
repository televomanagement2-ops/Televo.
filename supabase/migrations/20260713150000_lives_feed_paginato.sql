-- =============================================================================
-- Televo — M13 (P8): lives_feed paginata keyset (AH-2) — feed illimitato
-- =============================================================================
-- Debito di scala F1 dell'audit (AUDIT-HARDENING §6.1, warning in roadmap.md):
-- la lives_feed zero-arg era pensata per ≤150 amici, senza paginazione, e il
-- suo ordinamento usava segnali che un cursore keyset non può trasportare
-- senza violare l'anti-vanity R-04 (nessun contatore esce dal server, nemmeno
-- codificato in un cursore).
--
-- Decisione PO AH-2 — ordinamento a DUE BLOCCHI: prima le live dei Top
-- Friends del viewer, poi gli altri amici; dentro ogni blocco recenza
-- (started_at desc, id desc). Il tier per spettatori/Aura si perde: trade-off
-- accettato in sessione di audit.
--
-- Il CURSORE è interamente derivabile dal client dall'ultima riga ricevuta —
-- (is_top_friend, started_at, live_id) sono già nel payload di ogni item —
-- quindi la nuova firma non espone NULLA di nuovo. Il predicato composito
-- (is_top::int, started_at, id) < (p_top::int, p_before, p_before_id) è la
-- traduzione esatta dell'ordinamento tutto-desc (modello drops_feed).
--
-- Compatibilità: la chiamata client esistente `rpc('lives_feed', {})` resta
-- valida (tutti i parametri hanno default = prima pagina). Output:
-- { server_now, lives, has_more } — shape degli item INVARIATA.

drop function public.lives_feed();

create or replace function public.lives_feed(
  p_top       boolean     default null,
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
    select row_number() over (order by y.is_top desc, y.started_at desc, y.id desc) as rn,
           jsonb_build_object(
             'live_id',          y.id,
             'title',            y.title,
             'status',           y.status,
             'visibility',       y.visibility,
             'comments_enabled', y.comments_enabled,
             'started_at',       y.started_at,
             'paused_at',        y.paused_at,
             'is_top_friend',    y.is_top,
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
             l.started_at, l.paused_at,
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
    where (p_top is null or p_before is null or p_before_id is null)
       or ((y.is_top::int, y.started_at, y.id) < (p_top::int, p_before, p_before_id))
    order by y.is_top desc, y.started_at desc, y.id desc
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
revoke all on function public.lives_feed(boolean, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.lives_feed(boolean, timestamptz, uuid, integer)
  to authenticated;
