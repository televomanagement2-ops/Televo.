-- =============================================================================
-- Televo — Live M14 (V6): live_detail v2 — contatori agli host ATTIVI
-- =============================================================================
-- Decisione PO (audit di verifica M14, VF-1): il co-host attivo riceve la
-- "dashboard quasi-host" — oltre ai controlli publisher che già possiede,
-- vede il numero di spettatori e può lasciare il Co-Live. Fine live, kick e
-- inviti restano SOLO all'host principale (le RPC relative non cambiano).
--
-- Qui cambia UNA riga di live_detail: il blocco contatori è consegnato a
-- `v_is_host or v_is_cohost`. La regola anti-vanity R-04 resta intatta nel suo
-- significato: i contatori appartengono a chi STA TRASMETTENDO (gli host
-- attivi) e non raggiungono MAI gli spettatori — né nel payload, né nel feed.
-- Ridefinizione conservativa: tutto il resto del corpo è identico alla
-- definizione in vigore; ACL ribaditi in coda (revoke totale + grant mirato).

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
      'ended_at',         v_live.ended_at),
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

  -- I contatori restano PRIVATI di chi sta trasmettendo (host attivi):
  -- non raggiungono MAI gli spettatori (anti-vanity R-04).
  if v_is_host or v_is_cohost then
    v_out := v_out || jsonb_build_object(
      'viewer_count', v_live.viewer_count,
      'peak_viewers', v_live.peak_viewers);
  end if;

  return v_out;
end;
$$;

revoke all on function public.live_detail(uuid) from public, anon, authenticated;
grant execute on function public.live_detail(uuid) to authenticated;
