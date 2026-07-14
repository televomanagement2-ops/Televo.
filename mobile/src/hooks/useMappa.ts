// =============================================================================
// useMappa — dati reali sulla Mappa della Città (M7 / MM7).
// =============================================================================
// Unisce le due sorgenti di map.md §13.3: lo SNAPSHOT (map_snapshot via TanStack
// Query) è la VERITÀ a `server_now`, il REALTIME (inbox privata `map:u:{me}`) sono
// i DELTA. Entrambi confluiscono nei dizionari amici/eventi dello store; gli stati
// Live/Echo/LastSeen NON si fetchano: si derivano client-side dai timestamp UTC con
// il clock calibrato (`clockOffsetMs`).
//
// Riconciliazione (map.md §13.3): lo snapshot rimpiazza i dizionari (rimuove chi non
// è più visibile), i delta li aggiornano tra un refetch e l'altro. Un delta `presence`
// NON porta identità (username/aura): se riguarda un amico non ancora noto, si mostra
// SUBITO il punto (soddisfa "comparire senza refresh") e si programma un refetch di
// arricchimento. Refetch anche a ritorno in foreground e a riconnessione.
//
// Montato in MapSurface → vive SOLO mentre la mappa è aperta (Dev Build): la
// sottoscrizione realtime e le query non pesano quando la mappa non è a schermo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { mappaKeys } from '@/hooks/useCondivisionePosizione';
import { fetchMapSnapshot } from '@/lib/map';
import { subscribeMapInbox } from '@/lib/map-realtime';
import { onRiconnessione } from '@/lib/rete';
import { useMapStore } from '@/store/mapStore';

// I delta di un amico non ancora noto (o eventi incompleti) coalescono in UN refetch.
const ENRICH_DEBOUNCE_MS = 800;

// Refetch di riconciliazione a bassa frequenza mentre la mappa è aperta in
// foreground. Serve al caso "amico fermo": il backend NON fa fan-out `presence`
// sotto i ~30m di spostamento (MM3), quindi l'heartbeat (~4.5min) tiene fresca la
// sessione lato server ma non arriva come delta. Senza questo, un amico Live ma
// immobile scivolerebbe a Last Seen dopo 10min nella vista di chi guarda. Con
// heartbeat 4.5min + intervallo 3min la staleness resta < soglia 10min (margine).
const RECONCILE_MS = 180_000;

export function useMappa() {
  const queryClient = useQueryClient();
  const { uid } = useAuth();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  // Snapshot: la porta di lettura. RN non ha "window focus" → gestiamo noi il
  // refetch a foreground/riconnessione (sotto), non affidato a refetchOnWindowFocus.
  // Il refetchInterval è attivo SOLO con app in foreground (batteria/quota).
  const query = useQuery({
    queryKey: uid ? mappaKeys.snapshot(uid) : ['mappa', 'anon', 'snapshot'],
    enabled: !!uid,
    queryFn: fetchMapSnapshot,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: appActive ? RECONCILE_MS : false,
    refetchIntervalInBackground: false,
  });

  // Idrata lo store a ogni snapshot (anche dalla cache al remount): ricalibra il
  // clock e rimpiazza i dizionari amici/eventi.
  const data = query.data;
  useEffect(() => {
    if (data) useMapStore.getState().idrataSnapshot(data);
  }, [data]);

  // Refetch di riconciliazione, debounced (più delta "sconosciuti" → un solo giro).
  const enrichTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalida = useCallback(() => {
    if (uid) void queryClient.invalidateQueries({ queryKey: mappaKeys.snapshot(uid) });
  }, [queryClient, uid]);

  const refetchSoon = useCallback(() => {
    if (enrichTimer.current) return; // già programmato
    enrichTimer.current = setTimeout(() => {
      enrichTimer.current = null;
      invalida();
    }, ENRICH_DEBOUNCE_MS);
  }, [invalida]);

  // Inbox realtime: i delta aggiornano lo store; l'identità mancante fa arricchire.
  useEffect(() => {
    if (!uid) return;
    return subscribeMapInbox(uid, {
      onPresence: (p) => {
        const noto = useMapStore.getState().friends[p.user_id];
        useMapStore.getState().applicaPresenza(p);
        // Amico mai visto o senza identità (delta puro) → riallinea per nome/aura.
        if (!noto || noto.username == null) refetchSoon();
      },
      onPresenceRemoved: (p) => useMapStore.getState().rimuoviAmico(p.user_id),
      onEventStarted: (e) => useMapStore.getState().applicaEventoStart(e),
      onEventEnded: (e) => {
        if (e.removed) {
          useMapStore.getState().rimuoviEvento(e.id); // revoca: niente Echo
          return;
        }
        if (e.ended_at && e.visibility_expires_at) {
          const noto = useMapStore.getState().events[e.id];
          useMapStore
            .getState()
            .chiudiEvento(e.id, Date.parse(e.ended_at), Date.parse(e.visibility_expires_at));
          // Echo di un evento mai ricevuto (event_started perso): serve posizione/titolo.
          if (!noto) refetchSoon();
        } else {
          refetchSoon(); // payload incompleto: riconcilia dallo snapshot
        }
      },
    });
  }, [uid, refetchSoon]);

  // AppState: traccia foreground (pilota il refetchInterval) e, a ogni ritorno
  // attivo, refetch immediato (map.md §13.3) per riallineare i delta persi in background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      const attivo = st === 'active';
      setAppActive(attivo);
      if (attivo) invalida();
    });
    return () => sub.remove();
  }, [invalida]);

  // Refetch alla riconnessione (i broadcast non vengono ritrasmessi): lo snapshot
  // ricostruisce lo stato coerente.
  useEffect(() => onRiconnessione(invalida), [invalida]);

  // All'unmount della mappa: svuota i dizionari (il prossimo mount rifetcha) e
  // annulla un eventuale refetch pendente.
  useEffect(() => {
    return () => {
      if (enrichTimer.current) {
        clearTimeout(enrichTimer.current);
        enrichTimer.current = null;
      }
      useMapStore.getState().resetDatiMappa();
    };
  }, []);

  return { query };
}
