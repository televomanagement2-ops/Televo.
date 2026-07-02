// =============================================================================
// rete.ts — stato di connettività: NetInfo cablato in TanStack Query (CM2, RC-02).
// =============================================================================
// `initRete()` va chiamata UNA volta al bootstrap: da lì in poi onlineManager
// riflette la rete reale del device (React Query mette in pausa/riprende le
// query da solo). `useOnline()` è per la UI (banner "Sei offline") e
// `onRiconnessione()` per la coda d'invio (flush dell'outbox al ritorno online).

import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

let inizializzata = false;

/** Cabla NetInfo dentro onlineManager (idempotente). */
export function initRete() {
  if (inizializzata) return;
  inizializzata = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      // isInternetReachable può essere null (sconosciuto): trattiamo come online
      // per non bloccare inutilmente (fallirà la singola richiesta, non l'app).
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    }),
  );
}

/** Stato online reattivo per la UI (banner offline in S1/S2). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe((isOnline) => setOnline(isOnline)), []);
  return online;
}

/**
 * Invoca `fn` a ogni transizione offline→online (non alla sottoscrizione).
 * Ritorna l'unsubscribe. Usata dal flusher dell'outbox.
 */
export function onRiconnessione(fn: () => void): () => void {
  let prima = onlineManager.isOnline();
  return onlineManager.subscribe((adesso) => {
    if (!prima && adesso) fn();
    prima = adesso;
  });
}
