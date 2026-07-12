// =============================================================================
// map-realtime.ts — inbox privata realtime per-utente (M7 / MM7, estesa M12).
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
// M12 (LM5): il prefisso `map:` è storico — il canale è di fatto l'INBOX PRIVATA
// per-utente del progetto (live.md §0.4/§15.4) e la Live vi aggiunge i suoi tre
// eventi (`live_fanout`, LM2) sull'UNICO canale, senza topic nuovi: stessa
// policy, stessa subscription, un solo join.
//
// M12 (LM7) — MULTIPLEXER. Da LM7 più superfici vivono INSIEME sullo stesso
// topic: il feed live della Home resta montato sotto lo stack quando si apre
// `/live/[id]` (e idem la mappa). realtime-js 2.108 RIUSA l'istanza di canale
// per topic identico e `removeChannel` la smonta per TUTTI: senza questo strato
// la prima superficie che smonta spegnerebbe l'inbox delle altre in silenzio.
// Quindi: UN canale reale per uid + REGISTRO di handler-set; ogni consumatore
// registra/deregistra i propri handler, il canale nasce col primo e muore
// (con una piccola grazia) quando il registro si svuota. L'API pubblica è
// invariata: `subscribeMapInbox(uid, handlers) → cleanup`.
//
// Lo SNAPSHOT resta la verità (map.md §13.3): questi delta sono aggiornamenti
// incrementali. Un delta di un amico non ancora noto (payload SENZA identità) fa
// scattare un refetch di arricchimento nell'hook.

import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  LiveEndedPayload,
  LiveStartedPayload,
  LiveStatusPayload,
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
  /** M12: un amico ha avviato una live (payload CON identità host). */
  onLiveStarted?: (p: LiveStartedPayload) => void;
  /** M12: transizione live↔paused di una live già nota. */
  onLiveStatus?: (p: LiveStatusPayload) => void;
  /** M12: live finita → sparisce da striscia e feed (nessun archivio). */
  onLiveEnded?: (p: LiveEndedPayload) => void;
}

// -----------------------------------------------------------------------------
// Stato del multiplexer (modulo = singleton)
// -----------------------------------------------------------------------------

/** Handler-set dei consumatori vivi: ogni evento viene smistato a TUTTI. */
const registro = new Set<MapInboxHandlers>();
let canale: RealtimeChannel | null = null;
/** uid a cui il canale (attivo o prenotato) appartiene; null = spento. */
let canaleUid: string | null = null;
/** Smontaggio del canale precedente in corso: le accensioni lo ATTENDONO
 *  (rimuovere e ricreare lo stesso topic ha una finestra async in realtime-js:
 *  `channel(topic)` riuserebbe l'istanza morente ancora nella lista client). */
let smontaggio: Promise<unknown> | null = null;
/** Invalida le accensioni in volo quando lo stato cambia sotto di loro. */
let generazione = 0;
let timerSpegnimento: ReturnType<typeof setTimeout> | null = null;

/** Grazia prima dello smontaggio reale quando il registro si svuota: copre le
 *  transizioni tra superfici (feed → schermo live → back) senza churn di
 *  join/leave e rende rarissima la ricreazione ravvicinata dello stesso topic. */
const SPEGNIMENTO_GRACE_MS = 1500;

function annullaTimerSpegnimento() {
  if (timerSpegnimento) {
    clearTimeout(timerSpegnimento);
    timerSpegnimento = null;
  }
}

/** Smista un evento a tutti gli handler-set registrati IN QUESTO momento:
 *  chi si aggiunge dopo il join riceve i delta successivi, chi si toglie
 *  smette subito (il registro è letto a ogni dispatch, mai fotografato). */
function dispatch(consegna: (h: MapInboxHandlers) => void) {
  for (const h of registro) consegna(h);
}

/** Spegne il canale ADESSO (cambio utente o registro rimasto vuoto). */
function spegni() {
  generazione += 1;
  annullaTimerSpegnimento();
  canaleUid = null;
  if (canale) {
    const ch = canale;
    canale = null;
    smontaggio = supabase.removeChannel(ch).catch(() => {});
  }
}

/** Crea, collega e sottoscrive il canale per `uid` (dopo aver atteso l'eventuale
 *  smontaggio del predecessore). Abortisce se nel frattempo lo stato è cambiato. */
async function accendi(uid: string, gen: number) {
  try {
    await smontaggio;
  } catch {
    // lo smontaggio fallito non blocca l'accensione
  }
  if (gen !== generazione || canaleUid !== uid || registro.size === 0) return;

  const ch = supabase.channel(`map:u:${uid}`, { config: { private: true } });
  ch.on('broadcast', { event: 'presence' }, (msg) =>
    dispatch((h) => h.onPresence?.(msg.payload as MapPresencePayload)),
  )
    .on('broadcast', { event: 'presence_removed' }, (msg) =>
      dispatch((h) => h.onPresenceRemoved?.(msg.payload as MapPresenceRemovedPayload)),
    )
    .on('broadcast', { event: 'event_started' }, (msg) =>
      dispatch((h) => h.onEventStarted?.(msg.payload as MapEventStartedPayload)),
    )
    .on('broadcast', { event: 'event_ended' }, (msg) =>
      dispatch((h) => h.onEventEnded?.(msg.payload as MapEventEndedPayload)),
    )
    .on('broadcast', { event: 'live_started' }, (msg) =>
      dispatch((h) => h.onLiveStarted?.(msg.payload as LiveStartedPayload)),
    )
    .on('broadcast', { event: 'live_status' }, (msg) =>
      dispatch((h) => h.onLiveStatus?.(msg.payload as LiveStatusPayload)),
    )
    .on('broadcast', { event: 'live_ended' }, (msg) =>
      dispatch((h) => h.onLiveEnded?.(msg.payload as LiveEndedPayload)),
    );
  canale = ch;

  // Il canale privato richiede il JWT sul client Realtime prima del join.
  // `setAuth()` senza argomenti usa il token della sessione corrente. Best-effort:
  // se fallisce (o è già impostato dall'auto-wiring), il subscribe procede comunque
  // e, in caso di join negato, il refetch a foreground/riconnessione riallinea.
  void supabase.realtime
    .setAuth()
    .catch(() => {})
    .finally(() => {
      // Spento mentre si attendeva il setAuth: non joinare un canale morto.
      if (gen === generazione && canale === ch) ch.subscribe();
    });
}

/**
 * Registra un consumatore dell'inbox privata. Sicura in un useEffect: usare la
 * funzione restituita come teardown. Più superfici possono registrarsi INSIEME
 * (Home live + schermo live + mappa): il canale reale è uno solo e resta vivo
 * finché almeno un consumatore è registrato.
 */
export function subscribeMapInbox(uid: string, handlers: MapInboxHandlers): () => void {
  // Cambio utente (logout/login): l'inbox è per-uid, il canale vecchio muore
  // subito e il registro riparte (gli eventuali cleanup dei vecchi consumatori
  // diventano no-op innocui: rimuovono handler che non ci sono più).
  if (canaleUid && canaleUid !== uid) {
    registro.clear();
    spegni();
  }

  annullaTimerSpegnimento();
  registro.add(handlers);

  if (!canaleUid) {
    canaleUid = uid;
    generazione += 1;
    void accendi(uid, generazione);
  }

  return () => {
    registro.delete(handlers);
    if (registro.size > 0) return;
    // Ultimo consumatore: spegnimento con grazia (una nuova superficie che
    // monta subito dopo — es. back dallo schermo live — riusa il canale vivo).
    annullaTimerSpegnimento();
    timerSpegnimento = setTimeout(() => {
      timerSpegnimento = null;
      if (registro.size === 0) spegni();
    }, SPEGNIMENTO_GRACE_MS);
  };
}
