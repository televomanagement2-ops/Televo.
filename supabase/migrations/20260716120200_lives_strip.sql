-- =============================================================================
-- Televo — Rework Live M15 (LR2): striscia terminate <24h (lives_strip)
-- =============================================================================
-- Terza wave del rework Live (docs/live/live-rework.md, Parte II §11 LR2). La
-- striscia dei cerchi in Home mostra, dopo le live ATTIVE, anche le live
-- TERMINATE da meno di 24 ore (RW-1): un cerchio spento, visivamente
-- inequivocabile ("è finita"), che porta al PROFILO dell'amico (RW-1a) — non
-- esiste replay (il video non è mai persistito, live.md §0.2). Questa migrazione
-- aggiunge la SOLA porta di lettura server delle terminate: lives_strip().
--
-- Il resto della striscia (le ATTIVE) arriva già dalla prima pagina di
-- lives_feed (LR1); l'unione attive+terminate, il filtro-clock 24h, il dedup
-- host-attivo>terminato e il tap→profilo sono lato client (LR6). Qui si costruisce
-- SOLO la fonte dati delle terminate.
--
-- Contratto (live-rework.md §8.2):
--   lives_strip() returns jsonb = { server_now, ended: [ item... ] }
--   item = { live_id, ended_at, host { user_id, username, display_name, avatar_url } }
--   → NIENTE aura nel payload: il cerchio spento non mostra l'anello colore, è
--     solo una scorciatoia al profilo (stile storia scaduta). NIENTE contatori.
--
-- Filtri (l'UNICO predicato di visibilità del dominio è can_see_live, riusato
-- come ovunque — live.md §1.2, regola d'oro CLAUDE.md §6):
--   · l.ended_at is not null and l.ended_at > now() - interval '24 hours'
--       → solo le terminate, e solo nella finestra di 24h;
--   · p.deleted_at is null   → host cancellato ⇒ le sue terminate spariscono;
--   · l.host_id <> v_uid     → la PROPRIA live terminata non appare in striscia
--                               (§1: la propria è esclusa server-side);
--   · public.can_see_live(l.id, v_uid) → SOLO amici visibili. Funziona anche su
--     live 'ended': le righe live_hosts restano (cascade solo sul DELETE della
--     live, a 30 giorni), quindi l'unione degli host attivi in Co-Live (L-3) e la
--     cerchia top_friends dell'host principale valgono ancora; kickati (registro
--     live_viewers.kicked_at), co-host 'removed' e coppie bloccate restano
--     ESCLUSI. In caso di conflitto si risolve sempre verso il MENO aperto.
-- Ordine: ended_at desc (le più recenti prima). Cap: 20 (la striscia è corta).
--
-- ⚠️ INVARIANTE DA NON ROMPERE (live-rework.md §1): la finestra 24h di
--    lives_strip COINCIDE con la purge di live_viewers (registro kick) a 24h da
--    ended_at in expire_content (20260713140000…, blocco purge-24h: i kickati e i
--    commenti muoiono a `ended_at + 24h`). Se un domani quella purge scendesse
--    SOTTO 24h, i kickati rientrerebbero in striscia (can_see_live non troverebbe
--    più kicked_at) — le due durate vanno mosse SEMPRE insieme.
--
-- Retro-compatibilità: funzione NUOVA, additiva → nessuna finestra di rottura
-- durante il rollout (il client vecchio semplicemente non la chiama; LR6 la usa).
--
-- Regole d'oro applicate (CLAUDE.md §6, live-rework.md §0.5):
--  · security definer set search_path='' , schema-qualificata;
--  · guardia not_authenticated (errore stringa-codice);
--  · Grant: revoke SEMPRE da public+anon+authenticated (DEFAULT PRIVILEGES
--    dell'hosted, lezione CM8), poi grant mirato a authenticated.

-- =============================================================================
-- lives_strip() — le live terminate da <24h visibili al chiamante (§8.2).
-- =============================================================================
create or replace function public.lives_strip()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_items jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Il sotto-select filtra/ordina/limita; l'order by DENTRO jsonb_agg fissa
  -- l'ordine dell'array (l'ordine del sotto-select non è garantito post-aggregazione).
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'live_id',  x.id,
             'ended_at', x.ended_at,
             'host', jsonb_build_object(
               'user_id',      x.host_id,
               'username',     x.username,
               'display_name', x.display_name,
               'avatar_url',   x.avatar_url)
           ) order by x.ended_at desc), '[]'::jsonb)
  into v_items
  from (
    select l.id, l.ended_at,
           p.id as host_id, p.username, p.display_name, p.avatar_url
    from public.lives l
    join public.profiles p on p.id = l.host_id
    where l.ended_at is not null
      and l.ended_at > now() - interval '24 hours'
      and p.deleted_at is null
      and l.host_id <> v_uid
      and public.can_see_live(l.id, v_uid)
    order by l.ended_at desc
    limit 20
  ) x;

  return jsonb_build_object(
    'server_now', now(),
    'ended',      v_items);
end;
$$;

-- Grant: revoke esplicito (DEFAULT PRIVILEGES dell'hosted), poi grant mirato.
revoke all on function public.lives_strip() from public, anon, authenticated;
grant execute on function public.lives_strip() to authenticated;
