// =============================================================================
// map-realtime.ts — inbox privata realtime della Mappa della Città (M7 / MM7).
// =============================================================================
// Modello "inbox" (map.md §13.3): UNA sola sottoscrizione per utente al topic
// PRIVATO `map:u:{uid}`. Il fan-out è SERVER-SIDE (realtime.send da RPC/trigger,
// migrazione MM3), letto dal grafo di amicizia AL MOMENTO dell'invio → un estraneo
// non riceve nulla e revocare l'amicizia interrompe il broadcast per costruzione.
// Qui si RICEVE soltanto: il client non invia mai su questo canale.
//
// È il PRIMO canale privato del progetto (i canali chat/drop usano postgres_changes
// o broadcast pubblici). L'autorizzazione alla ricezione è la policy
// `map_inbox_select_own` su realtime.messages, che lega realtime.topic() ad
// auth.uid(): nessuno può sottoscrivere l'inbox altrui. Il client Realtime deve
// avere il JWT PRIMA del join → `setAuth()` (vedi sotto).
//
// Lo SNAPSHOT resta la verità (map.md §13.3): questi delta sono aggiornamenti
// incrementali. Un delta di un amico non ancora noto (payload SENZA identità) fa
// scattare un refetch di arricchimento nell'hook.

import { supabase } from '@/lib/supabase';
import type {
  MapEventEndedPayload,
  MapEventStartedPayload,
  MapPresencePayload,
  MapPresenceRemovedPayload,
} from '@/types/supabase';

export interface MapInboxHandlers {
  /** Un amico ha (ri)pubblicato la posizione (payload senza identità). */
  onPresence?: (p: MapPresencePayload) => void;
  /** Un amico ha spento del tutto (revoca/kill-switch): sparizione fisica. */
  onPresenceRemoved?: (p: MapPresenceRemovedPayload) => void;
  /** Un amico ha messo in mappa una stanza live (bolla). */
  onEventStarted?: (e: MapEventStartedPayload) => void;
  /** Fine evento: `removed=true` → rimozione (niente Echo); `removed=false` → Echo. */
  onEventEnded?: (e: MapEventEndedPayload) => void;
}

/**
 * Sottoscrive l'inbox privata dell'utente. Sicura in un useEffect: usare la
 * funzione di cleanup restituita come teardown (chiude il canale all'unmount della
 * mappa — la sottoscrizione vive SOLO mentre la mappa è montata, map.md §13.3).
 */
export function subscribeMapInbox(uid: string, handlers: MapInboxHandlers): () => void {
  const channel = supabase.channel(`map:u:${uid}`, { config: { private: true } });

  channel
    .on('broadcast', { event: 'presence' }, (msg) =>
      handlers.onPresence?.(msg.payload as MapPresencePayload),
    )
    .on('broadcast', { event: 'presence_removed' }, (msg) =>
      handlers.onPresenceRemoved?.(msg.payload as MapPresenceRemovedPayload),
    )
    .on('broadcast', { event: 'event_started' }, (msg) =>
      handlers.onEventStarted?.(msg.payload as MapEventStartedPayload),
    )
    .on('broadcast', { event: 'event_ended' }, (msg) =>
      handlers.onEventEnded?.(msg.payload as MapEventEndedPayload),
    );

  // Il canale privato richiede il JWT sul client Realtime prima del join.
  // `setAuth()` senza argomenti usa il token della sessione corrente. Best-effort:
  // se fallisce (o è già impostato dall'auto-wiring), il subscribe procede comunque
  // e, in caso di join negato, il refetch a foreground/riconnessione riallinea.
  void supabase.realtime
    .setAuth()
    .catch(() => {})
    .finally(() => channel.subscribe());

  return () => {
    void supabase.removeChannel(channel);
  };
}
