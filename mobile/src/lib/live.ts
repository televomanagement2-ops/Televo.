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
  LiveHostRole,
  LiveHostStatus,
  LiveNotifyMode,
  LivesFeedRaw,
  LiveVisibility,
} from '@/types/supabase';
import type { LiveCommentRow } from '@/types';

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

/** Cursore keyset del feed live (M13/P8): interamente derivabile dall'ULTIMA
 *  riga ricevuta — is_top_friend, started_at (ISO verbatim dal server, mai
 *  ricostruito da epoch: la precisione ai microsecondi è parte del cursore) e
 *  live_id. Nessun contatore viaggia nel cursore (anti-vanity R-04). */
export interface CursoreLiveFeed {
  top: boolean;
  before: string;
  beforeId: string;
}

/** Feed Home (striscia + verticale): live ATTIVE degli amici visibili, già
 *  ordinate server-side a due blocchi (Top Friends del viewer → resto, dentro
 *  recenza — AH-2) senza mai esporre i contatori. Senza cursore = prima
 *  pagina (la VERITÀ a mount/foreground; i delta inbox patchano); col cursore
 *  = pagina successiva (load-more, append allo store). */
export async function fetchLivesFeed(cursore?: CursoreLiveFeed): Promise<LivesFeedRaw> {
  return callRpc<LivesFeedRaw>(
    'lives_feed',
    cursore
      ? { p_top: cursore.top, p_before: cursore.before, p_before_id: cursore.beforeId }
      : {},
  );
}

// Pre-warm del dettaglio (M13/P11, H2): al press su striscia/feed si scalda
// `live_detail` in parallelo alla navigazione, così il mount dello schermo
// risparmia un round-trip. La voce scaldata vale UNA volta e pochi secondi;
// le revalidation successive ripassano sempre dal server.
let dettaglioCaldo: {
  liveId: string;
  promessa: Promise<LiveDetailRaw>;
  natoA: number;
} | null = null;
const PREWARM_TTL_MS = 5_000;

/** Scalda il dettaglio della live che si sta per aprire (fire-and-forget). */
export function prewarmLiveDetail(liveId: string): void {
  const promessa = callRpc<LiveDetailRaw>('live_detail', { p_live: liveId });
  // Se nessuno la consuma non deve diventare un'unhandled rejection; chi la
  // consuma riceve comunque l'errore originale (il catch non altera promessa).
  promessa.catch(() => {});
  dettaglioCaldo = { liveId, promessa, natoA: Date.now() };
}

/** Dettaglio + revalidation 60s: su errore `not_visible` (blocco, rimozione
 *  amicizia, kick a metà live) o stato `ended` il client si disconnette (§5). */
export async function fetchLiveDetail(liveId: string): Promise<LiveDetailRaw> {
  const caldo = dettaglioCaldo;
  if (caldo && caldo.liveId === liveId && Date.now() - caldo.natoA < PREWARM_TTL_MS) {
    dettaglioCaldo = null; // vale una volta sola
    return caldo.promessa;
  }
  return callRpc<LiveDetailRaw>('live_detail', { p_live: liveId });
}

// -----------------------------------------------------------------------------
// Letture dirette via RLS (LM6) — righe live_hosts (le policy le limitano già:
// l'host della live vede tutto, l'utente le proprie righe)
// -----------------------------------------------------------------------------

/** Una riga host/co-host come la vede il client (sottoinsieme di live_hosts). */
export interface RigaCoHost {
  userId: string;
  role: LiveHostRole;
  status: LiveHostStatus;
}

/** Il MIO stato host/co-host in una live (null = nessuna riga). È la fonte del
 *  banner "Accetta invito co-host" nello schermo spettatore (status 'invited'). */
export async function fetchMioStatoCoHost(
  liveId: string,
  uid: string,
): Promise<RigaCoHost | null> {
  const { data, error } = await supabase
    .from('live_hosts')
    .select('user_id, role, status')
    .eq('live_id', liveId)
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as { user_id: string; role: LiveHostRole; status: LiveHostStatus } | null;
  return row ? { userId: row.user_id, role: row.role, status: row.status } : null;
}

/** Tutte le righe host/co-host della live (visibili per intero SOLO all'host
 *  principale via RLS): alimenta il CoHostSheet (invitati + attivi + tetto 4). */
export async function fetchRigheCoHost(liveId: string): Promise<RigaCoHost[]> {
  const { data, error } = await supabase
    .from('live_hosts')
    .select('user_id, role, status')
    .eq('live_id', liveId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    user_id: string;
    role: LiveHostRole;
    status: LiveHostStatus;
  }[];
  return rows.map((r) => ({ userId: r.user_id, role: r.role, status: r.status }));
}

// -----------------------------------------------------------------------------
// Commenti (LM6) — insert diretta validata dal trigger (stato live,
// comments_enabled, can_see_live, rate-limit 5/30s), pattern drop_comments
// -----------------------------------------------------------------------------

/**
 * Invia un commento (≤200 caratteri, solo testo). Ritorna la riga inserita per
 * l'aggiunta ottimistica (l'eco realtime viene dedupato per id). Errori del
 * trigger come codici-stringa: rate_limited, comments_disabled,
 * live_not_commentable, comment_too_long, empty_comment, live_not_visible.
 */
export async function inviaCommentoLive(liveId: string, body: string): Promise<LiveCommentRow> {
  const { data, error } = await supabase
    .from('live_comments')
    .insert({ live_id: liveId, body } as never)
    .select('id, live_id, author_id, body, created_at')
    .single();
  if (error) throw error;
  return data as unknown as LiveCommentRow;
}

/**
 * Modera in background il testo di un commento live (§6): fire-and-forget verso
 * la Edge `moderate-text` (Perspective; severità ≥0.9 = auto-mute 30 min +
 * Aura toxicity; degrada con grazia senza chiave). NON blocca l'invio — parte
 * DOPO l'insert e inghiotte ogni errore (pattern moderaDropComment).
 */
export function moderaCommentoLive(commentId: string, text: string): void {
  const t = text.trim();
  if (!t) return;
  void supabase.functions
    .invoke('moderate-text', {
      body: { text: t, target_type: 'live_comment', target_id: commentId },
    })
    .catch(() => {});
}

// -----------------------------------------------------------------------------
// Segnalazioni (LM6) — sistema report esistente, target M12 (live.md §11)
// -----------------------------------------------------------------------------

/** Segnala la live (→ host principale) ai moderatori. */
export const segnalaLive = (liveId: string, reason: string) =>
  callRpc('file_report', { p_target_type: 'live', p_target_id: liveId, p_reason: reason });

/** Segnala un singolo commento (→ autore) ai moderatori. */
export const segnalaCommentoLive = (commentId: string, reason: string) =>
  callRpc('file_report', {
    p_target_type: 'live_comment',
    p_target_id: commentId,
    p_reason: reason,
  });

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
