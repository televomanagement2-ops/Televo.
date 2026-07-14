// =============================================================================
// useLivesFeed — dati reali della categoria Live della Home (M12 / LM7).
// =============================================================================
// Stesso modello a due sorgenti della mappa (useMappa, map.md §13.3): lo
// SNAPSHOT (`lives_feed` via TanStack Query) è la VERITÀ a `server_now` e
// rimpiazza per intero dizionario e ordine nel liveStore; i DELTA dell'inbox
// privata (`live_started`/`live_status`/`live_ended`) patchano tra un refetch
// e l'altro. `live_started` porta l'identità dell'host → niente refetch di
// arricchimento; `live_status` di una live IGNOTA (join del canale avvenuto
// dopo il suo live_started) invece sì.
//
// Il reconcile periodico esiste perché il fan-out è best-effort (realtime.send:
// un delta perso non viene ritrasmesso) e perché l'ORDINE del feed dipende da
// segnali che non viaggiano come delta (spettatori reali, Aura host): senza
// refetch l'ordinamento resterebbe congelato al mount. Frequenza moderata: i
// video sono connessi per pagina visibile, non c'entrano col refetch.
//
// Montato in LiveFeed → vive SOLO mentre la categoria Live è a schermo: la
// sottoscrizione condivide il canale inbox con le altre superfici (multiplexer
// map-realtime, LM7) e all'unmount lo store si svuota (il prossimo mount rifetcha).

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchLivesFeed } from '@/lib/live';
import { subscribeMapInbox } from '@/lib/map-realtime';
import { onRiconnessione } from '@/lib/rete';
import { useLiveStore } from '@/store/liveStore';

export const liveKeys = {
  feed: (uid: string) => ['live', uid, 'feed'] as const,
};

// I delta incompleti (live_status di una live ignota) coalescono in UN refetch.
const ENRICH_DEBOUNCE_MS = 800;

// Reconcile a bassa frequenza in foreground: riallinea ordine (viewer_count/Aura
// non fanno fan-out) e delta best-effort persi. 60s: gli eventi live sono rari
// e lo snapshot è una RPC leggera (≤150 amici, live.md §15.2).
const RECONCILE_MS = 60_000;

export function useLivesFeed() {
  const queryClient = useQueryClient();
  const { uid } = useAuth();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  // Snapshot: la porta di lettura (PRIMA pagina — P8: il refetch resetta la
  // paginazione, le pagine oltre la prima si ricaricano scorrendo). RN non ha
  // "window focus" → refetch a foreground/riconnessione gestiti sotto;
  // l'interval vive SOLO in foreground. ⚠️ arrow esplicita: fetchLivesFeed ha
  // un parametro cursore opzionale e il context di TanStack NON deve finirci.
  const query = useQuery({
    queryKey: uid ? liveKeys.feed(uid) : ['live', 'anon', 'feed'],
    enabled: !!uid,
    queryFn: () => fetchLivesFeed(),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    refetchInterval: appActive ? RECONCILE_MS : false,
    refetchIntervalInBackground: false,
  });

  // Idrata lo store a ogni snapshot (anche dalla cache al remount): ricalibra
  // il clock e rimpiazza dizionario e ordine (le live finite spariscono qui).
  const data = query.data;
  useEffect(() => {
    if (data) useLiveStore.getState().idrataFeed(data);
  }, [data]);

  // Refetch di riconciliazione, debounced (più delta ignoti → un solo giro).
  const enrichTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalida = useCallback(() => {
    if (uid) void queryClient.invalidateQueries({ queryKey: liveKeys.feed(uid) });
  }, [queryClient, uid]);

  const refetchSoon = useCallback(() => {
    if (enrichTimer.current) return; // già programmato
    enrichTimer.current = setTimeout(() => {
      enrichTimer.current = null;
      invalida();
    }, ENRICH_DEBOUNCE_MS);
  }, [invalida]);

  // Inbox realtime: i delta patchano lo store senza polling (live.md §7).
  useEffect(() => {
    if (!uid) return;
    return subscribeMapInbox(uid, {
      onLiveStarted: (p) => useLiveStore.getState().applicaLiveStarted(p),
      onLiveStatus: (p) => {
        if (p.status === 'ended') return; // la fine viaggia su live_ended
        const nota = useLiveStore.getState().lives[p.live_id];
        if (!nota) {
          // live_started perso (join tardivo del canale): la verità dallo snapshot.
          refetchSoon();
          return;
        }
        useLiveStore.getState().applicaLiveStatus(p);
      },
      onLiveEnded: (p) => useLiveStore.getState().rimuoviLive(p.live_id),
    });
  }, [uid, refetchSoon]);

  // AppState: traccia il foreground (pilota il refetchInterval) e, a ogni
  // ritorno attivo, refetch immediato per riallineare i delta persi in background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      const attivo = st === 'active';
      setAppActive(attivo);
      if (attivo) invalida();
    });
    return () => sub.remove();
  }, [invalida]);

  // M13/P8 — load-more keyset: pesca la pagina successiva col cursore dello
  // store (derivato dall'ultima riga RAW) e la APPENDE (dedup nello store).
  // Fuori da TanStack di proposito: le pagine oltre la prima sono contenuto
  // deperibile che non va né in cache né persistito — al prossimo snapshot la
  // paginazione riparte pulita.
  const caricandoAltre = useRef(false);
  const caricaAltre = useCallback(() => {
    const { hasMore, cursore } = useLiveStore.getState();
    if (!uid || !hasMore || !cursore || caricandoAltre.current) return;
    caricandoAltre.current = true;
    void (async () => {
      try {
        const pagina = await fetchLivesFeed(cursore);
        useLiveStore.getState().appendFeed(pagina);
      } catch {
        // Best-effort: si ritenta al prossimo onEndReached (o allo snapshot).
      } finally {
        caricandoAltre.current = false;
      }
    })();
  }, [uid]);

  // Refetch alla riconnessione (i broadcast non vengono ritrasmessi).
  useEffect(() => onRiconnessione(invalida), [invalida]);

  // All'unmount della superficie: svuota lo store e annulla i refetch pendenti.
  useEffect(() => {
    return () => {
      if (enrichTimer.current) {
        clearTimeout(enrichTimer.current);
        enrichTimer.current = null;
      }
      useLiveStore.getState().resetDatiLive();
    };
  }, []);

  return { query, appActive, caricaAltre };
}
