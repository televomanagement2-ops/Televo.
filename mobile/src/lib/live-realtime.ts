// =============================================================================
// live-realtime.ts — commenti live in tempo reale (M12 / LM6).
// =============================================================================
// Specchio di `subscribeDropComments` (il pattern provato del repo, live.md
// §15.4): postgres_changes su `live_comments` filtrato per live
// (`live_id=eq.X`), solo INSERT — i commenti live non si modificano né si
// cancellano dal client (spariscono col fade visivo e con la purge server a
// 24h dalla fine). La RLS (`can_see_live`) filtra i sottoscrittori: un
// estraneo/bloccato/kickato non riceve nulla. Il canale vive SOLO dentro lo
// schermo live (mount/unmount con /live/[id]).
//
// I delta di stato della live (live_started/live_status/live_ended) NON
// passano di qui: viaggiano sull'inbox privata utente (map-realtime.ts).

import { supabase } from '@/lib/supabase';
import type { LiveCommentRow } from '@/types';

/**
 * Si iscrive ai commenti di UNA live. Sicura in un useEffect: usare la funzione
 * di cleanup restituita come teardown (chiude il canale all'unmount).
 */
export function subscribeLiveComments(
  liveId: string,
  onInsert: (row: LiveCommentRow) => void,
): () => void {
  const channel = supabase
    .channel(`live:${liveId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'live_comments', filter: `live_id=eq.${liveId}` },
      (payload) => onInsert(payload.new as LiveCommentRow),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
