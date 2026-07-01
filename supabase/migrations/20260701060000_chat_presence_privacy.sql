-- =============================================================================
-- Televo — Chat: presenza "ultimo accesso" + toggle privacy (SRS §3.12–3.13)
-- =============================================================================
-- "Ultimo accesso" (S2 header) e i toggle privacy (S10). Scelta MVP (SRS R-02):
-- persistiamo `last_active_at` (storico leggero, aggiornato a heartbeat) invece del
-- Realtime presence puro — più semplice e già gated dai toggle. `last_active_at` è
-- scritto SOLO dalla RPC `touch_presence` (l'utente non può falsificarlo). I due
-- toggle sono preferenze utente, modificabili via grant update per-colonna.
--
-- Visibilità agli altri (SRS R-03, stile WhatsApp): l'ultimo accesso si mostra solo
-- se il proprietario ha `show_last_seen = true`; le spunte solo se ENTRAMBI hanno
-- `show_read_receipts = true`. L'enforcement MVP è di PRESENTAZIONE (lato client);
-- un gating server più stretto è un affinamento successivo.

-- -----------------------------------------------------------------------------
-- Colonne su profiles. I due toggle default TRUE (comportamento attuale invariato).
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists last_active_at     timestamptz,
  add column if not exists show_last_seen     boolean not null default true,
  add column if not exists show_read_receipts boolean not null default true;

-- Grant update ESTESO (additivo): l'utente cambia solo le proprie preferenze.
-- `last_active_at` NON è qui → non falsificabile via update diretto.
grant update (show_last_seen, show_read_receipts) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: heartbeat presenza. L'app la chiama in foreground (throttled lato client).
-- -----------------------------------------------------------------------------
create or replace function public.touch_presence()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  update public.profiles set last_active_at = now() where id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.touch_presence() from public;
grant execute on function public.touch_presence() to authenticated;
