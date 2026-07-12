// =============================================================================
// live.ts — dominio Live (broadcast video personale) lato client (M12 / LM5).
// =============================================================================
// Strato dati completo del dominio: wrapper tipizzati delle RPC definer
// (convenzione repo: il client non scrive MAI le tabelle live direttamente) e
// le due chiamate Edge (token e kick). La live è intrinsecamente ONLINE:
// NESSUN outbox (live.md §15.6) — un'azione fallita si mostra e si ritenta a
// mano, mai in coda.
//
// Punti fermi del contratto (live.md §5/§15.3):
//  · IL MINT È IL JOIN: `fetchTokenLive` è l'unica porta d'ingresso dello
//    spettatore (upsert `live_viewers` server-side) e OGNI ricontrollo di
//    visibilità (revalidation, reconnect a token scaduto) ripassa da lì.
//  · Errori come stringhe-codice: le RPC li sollevano come PostgrestError, le
//    Edge come `{error: <codice>}` — qui li normalizziamo a `Error(<codice>)`
//    così `liveErrorMessage` (lib/errors.ts) li traduce in italiano.
//  · Il numero di spettatori arriva SOLO all'host (anti-vanity R-04): il tipo
//    LiveDetailRaw ha i contatori opzionali per questo.

import { callRpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import type {
  CreateLiveResult,
  LiveDetailRaw,
  LiveNotifyMode,
  LivesFeedRaw,
  LiveVisibility,
} from '@/types/supabase';

// -----------------------------------------------------------------------------
// RPC di scrittura (SECURITY DEFINER, LM0→LM2)
// -----------------------------------------------------------------------------

/** Opzioni del composer camera-first (live.md §3). I default sono quelli del
 *  server: all_friends, commenti on, mappa OFF (opt-in), notifica a tutti (L-4). */
export interface NuovaLive {
  titolo: string;
  visibility?: LiveVisibility;
  commentiAbilitati?: boolean;
  mostraSullaMappa?: boolean;
  notifica?: LiveNotifyMode;
}

/**
 * Avvia la live (create_live): riga `lives` + notifiche secondo notify_mode +
 * fan-out realtime + attach mappa BEST-EFFORT. Se `mostraSullaMappa` era true ma
 * `map_attached` torna false, il client mostra l'hint "attiva la posizione"
 * (§12.12). Errori: live_already_active, invalid_title, user_not_active.
 */
export async function avviaLive(opzioni: NuovaLive): Promise<CreateLiveResult> {
  return callRpc<CreateLiveResult>('create_live', {
    p_title: opzioni.titolo,
    p_visibility: opzioni.visibility ?? 'all_friends',
    p_comments_enabled: opzioni.commentiAbilitati ?? true,
    p_show_on_map: opzioni.mostraSullaMappa ?? false,
    p_notify_mode: opzioni.notifica ?? 'all',
  });
}

/** Pausa (solo host principale): gli spettatori restano connessi e vedono
 *  "Live in pausa"; l'evento mappa resta aperto. Mai nuove notifiche. */
export async function pausaLive(liveId: string): Promise<void> {
  await callRpc('pause_live', { p_live: liveId });
}

/** Ripresa dalla pausa (solo host principale). */
export async function riprendiLive(liveId: string): Promise<void> {
  await callRpc('resume_live', { p_live: liveId });
}

/** Termina la live (solo host principale): stato FINALE. Echo mappa 3h e premio
 *  Aura (se qualificata) scattano dai trigger server-side. */
export async function terminaLive(liveId: string): Promise<void> {
  await callRpc('end_live', { p_live: liveId });
}

/** Invita un amico come co-host (tetto 4 host totali → cohost_cap_reached).
 *  Notifica live_cohost_invite al solo invitato; idempotente sui re-inviti. */
export async function invitaCoHost(liveId: string, userId: string): Promise<void> {
  await callRpc('live_invite_cohost', { p_live: liveId, p_user: userId });
}

/** Accetta l'invito co-host: da qui il proprio grafo entra nel pubblico (L-3)
 *  e il PROSSIMO token ottiene canPublish → dopo l'accettazione va richiesto
 *  un token nuovo con fetchTokenLive. */
export async function accettaInvitoCoHost(liveId: string): Promise<void> {
  await callRpc('live_accept_cohost', { p_live: liveId });
}

/** Revoca un invito o rimuove un co-host attivo (solo host principale). Il
 *  taglio del media già in corso è compito della Edge kick (kickDaLive). */
export async function rimuoviCoHost(liveId: string, userId: string): Promise<void> {
  await callRpc('live_remove_cohost', { p_live: liveId, p_user: userId });
}

/**
 * Esce dalla live (spettatore → left_at; co-host attivo → 'left'). BEST-EFFORT:
 * chiamarla fire-and-forget alla disconnessione — se si perde, il webhook
 * LiveKit riconcilia il disconnesso silenzioso (live.md §5).
 */
export function lasciaLive(liveId: string): void {
  void callRpc('live_leave', { p_live: liveId }).catch(() => {});
}

// -----------------------------------------------------------------------------
// RPC di lettura (LM2)
// -----------------------------------------------------------------------------

/** Feed Home (striscia + verticale): live ATTIVE degli amici visibili, già
 *  ordinate server-side (Top Friends → spettatori reali → Aura host) senza mai
 *  esporre i contatori. È la VERITÀ a mount/foreground; i delta inbox patchano. */
export async function fetchLivesFeed(): Promise<LivesFeedRaw> {
  return callRpc<LivesFeedRaw>('lives_feed', {});
}

/** Dettaglio + revalidation 60s: su errore `not_visible` (blocco, rimozione
 *  amicizia, kick a metà live) o stato `ended` il client si disconnette (§5). */
export async function fetchLiveDetail(liveId: string): Promise<LiveDetailRaw> {
  return callRpc<LiveDetailRaw>('live_detail', { p_live: liveId });
}

// -----------------------------------------------------------------------------
// Edge Functions (LM4) — errori normalizzati a Error(<codice>)
// -----------------------------------------------------------------------------

/** Risposta di livekit-token (ramo live), normalizzata in camelCase. */
export interface TokenLive {
  token: string;
  wsUrl: string;
  room: string;
  identity: string;
  canPublish: boolean;
}

/** Estrae il codice-stringa dal body `{error}` di una Edge fallita (il client
 *  functions solleva FunctionsHttpError con la Response in `context`). */
async function codiceErroreEdge(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // body non-JSON (es. gateway): si cade sul codice generico.
    }
  }
  return 'edge_error';
}

/**
 * Chiede il token LiveKit per una live: IL MINT È IL JOIN (upsert
 * `live_viewers` server-side; host/co-host attivo → canPublish). Da richiamare
 * anche a ogni reconnect (TTL 1h): ogni mint riesegue il controllo completo di
 * visibilità/kick. Errori: live_not_joinable (409, live finita), forbidden
 * (403, kickato/bloccato/non-amico), live_not_found, livekit_not_configured.
 */
export async function fetchTokenLive(liveId: string): Promise<TokenLive> {
  const { data, error } = await supabase.functions.invoke('livekit-token', {
    body: { live_id: liveId },
  });
  if (error) throw new Error(await codiceErroreEdge(error));
  const res = data as {
    token: string;
    ws_url: string;
    room: string;
    identity: string;
    can_publish: boolean;
  };
  return {
    token: res.token,
    wsUrl: res.ws_url,
    room: res.room,
    identity: res.identity,
    canPublish: res.can_publish,
  };
}

/**
 * Kick (solo host principale): DB PRIMA (il predicato can_see_live chiude
 * subito feed/commenti/token) POI removeParticipant su LiveKit (media tagliato,
 * best-effort: `mediaRemoved` dice com'è andata; il retry è idempotente).
 * scope 'viewer' = spettatore (kicked_at), 'cohost' = co-host → 'removed'.
 */
export async function kickDaLive(
  liveId: string,
  userId: string,
  scope: 'viewer' | 'cohost',
): Promise<{ mediaRemoved: boolean }> {
  const { data, error } = await supabase.functions.invoke('live-kick', {
    body: { live_id: liveId, user_id: userId, scope },
  });
  if (error) throw new Error(await codiceErroreEdge(error));
  const res = data as { ok: boolean; media_removed: boolean };
  return { mediaRemoved: res.media_removed };
}
