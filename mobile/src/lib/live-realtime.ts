// =============================================================================
// live-realtime.ts — commenti E like live in tempo reale (M12/LM6 + M15/LR5).
// =============================================================================
// UN canale per live (`live:{liveId}`), DUE listener postgres_changes sullo
// stesso socket (zero canali nuovi, live-rework.md §8.3):
//
//  · live_comments, solo INSERT — i commenti non si modificano né si cancellano
//    dal client (spariscono col fade visivo e con la purge server a 24h dalla
//    fine). Pattern `subscribeDropComments` (live.md §15.4).
//  · live_likes, solo INSERT (M15/RW-3) — una riga = un LOTTO di like (batching
//    client ~800ms, cap 50): il volume è bounded a ≤15 lotti/10s per utente
//    attivo. L'identità del liker è tecnicamente nel payload (come per i
//    commenti) ma la UI mostra SOLO il totale (RW-3a; trade-off accettato R-5).
//
// La RLS (`can_see_live`) filtra i sottoscrittori di ENTRAMBE le tabelle: un
// estraneo/bloccato/kickato non riceve nulla. Il canale vive SOLO dentro lo
// schermo live (mount/unmount con /live/[id]).
//
// I delta di stato della live (live_started/live_status/live_ended) NON
// passano di qui: viaggiano sull'inbox privata utente (map-realtime.ts).

import { supabase } from '@/lib/supabase';
import type { LiveCommentRow, LiveLikeRow } from '@/types';

/** Handler del canale live: entrambi opzionali (chi consuma solo i commenti
 *  non paga nulla per i like — il filtro RLS e il batching bound il volume). */
export interface LiveRealtimeHandlers {
  /** INSERT su live_comments. L'eco del PROPRIO insert arriva anche qui:
   *  dedup per id a valle (useLiveComments). */
  onComment?: (row: LiveCommentRow) => void;
  /** INSERT su live_likes (lotti). Le PROPRIE righe vanno SALTATE a valle
   *  (user_id === uid): l'optimistic locale le ha già contate (§3.2). */
  onLike?: (row: LiveLikeRow) => void;
}

/**
 * Si iscrive al realtime di UNA live: commenti e like sullo STESSO canale
 * `live:{liveId}` (un socket, due listener). Sicura in un useEffect: usare la
 * funzione di cleanup restituita come teardown (chiude il canale all'unmount).
 * ⚠️ Un solo subscribe per schermo: chi ha bisogno di entrambi i flussi passa
 * entrambi gli handler QUI (due canali con lo stesso topic confliggono).
 */
export function subscribeLiveRealtime(
  liveId: string,
  handlers: LiveRealtimeHandlers,
): () => void {
  const channel = supabase
    .channel(`live:${liveId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'live_comments', filter: `live_id=eq.${liveId}` },
      (payload) => handlers.onComment?.(payload.new as LiveCommentRow),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'live_likes', filter: `live_id=eq.${liveId}` },
      (payload) => handlers.onLike?.(payload.new as LiveLikeRow),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
