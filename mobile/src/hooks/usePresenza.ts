// =============================================================================
// usePresenza — presenza "online / ultimo accesso" della chat (CM3, RC-04).
// =============================================================================
// Due pezzi: l'HEARTBEAT che segnala la MIA presenza (RPC `touch_presence`,
// unica via di scrittura di profiles.last_active_at) e la QUERY della presenza
// del peer (RPC `get_peer_presence`, che applica server-side gating relazionale,
// blocchi e reciprocità R-03 — il client non legge mai la colonna raw).
// Batteria: heartbeat SOLO in foreground, interval 60s + throttle 45s.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { callRpc } from '@/lib/rpc';
import { useAuth } from '@/hooks/useAuth';
import { dayLabel, timeHHmm } from '@/lib/datetime';

/** Risposta di `get_peer_presence`: null = non disponibile (privacy/reciprocità). */
export interface PeerPresence {
  online: boolean | null;
  last_active_at: string | null;
}

export const presenzaKeys = {
  peer: (peerId: string) => ['presenza', peerId] as const,
};

/** Prefisso per invalidare TUTTE le presenze (es. al cambio dei toggle S10). */
export const presenzaPrefix = ['presenza'] as const;

// Heartbeat: tick ogni 60s in foreground; il throttle a 45s assorbe i doppi
// trigger (mount + AppState active ravvicinati) senza saltare il tick regolare.
const TICK_MS = 60_000;
const THROTTLE_MS = 45_000;

/**
 * Segnala la presenza dell'utente loggato: al mount, al ritorno in foreground e
 * ogni ~60s mentre l'app è attiva. In background l'interval si ferma (batteria).
 * Errori ignorati (offline → riproverà al tick successivo). Da montare UNA volta
 * nella shell autenticata (ChatRuntime via useChatRuntime).
 */
export function usePresenceHeartbeat() {
  const { uid } = useAuth();
  const lastTouch = useRef(0);

  useEffect(() => {
    if (!uid) return;

    const touch = () => {
      const now = Date.now();
      if (now - lastTouch.current < THROTTLE_MS) return;
      lastTouch.current = now;
      callRpc('touch_presence', {}).catch(() => {});
    };

    touch();
    let interval: ReturnType<typeof setInterval> | null = setInterval(touch, TICK_MS);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        touch();
        if (!interval) interval = setInterval(touch, TICK_MS);
      } else if (interval) {
        clearInterval(interval);
        interval = null;
      }
    });

    return () => {
      sub.remove();
      if (interval) clearInterval(interval);
    };
  }, [uid]);
}

/**
 * Presenza del peer di una DM (header S2). `peerId` null = query spenta (gruppi).
 * Il server risponde `{null, null}` quando la presenza non va mostrata (estranei,
 * coppia bloccata, toggle off da una delle due parti): la UI nasconde la riga.
 * Refetch ogni 30s solo mentre la schermata è montata.
 */
export function usePeerPresence(peerId: string | null) {
  return useQuery({
    queryKey: peerId ? presenzaKeys.peer(peerId) : ['presenza', 'none'],
    enabled: !!peerId,
    queryFn: async (): Promise<PeerPresence> => {
      try {
        return await callRpc<PeerPresence>('get_peer_presence', { p_peer_user: peerId });
      } catch {
        // Errore (rete, RPC): equivale a "non disponibile" → riga nascosta.
        return { online: null, last_active_at: null };
      }
    },
    refetchInterval: 30_000,
  });
}

/** Etichetta per l'header: "online" / "ultimo accesso …" / null (riga nascosta). */
export function presenceLabel(p: PeerPresence | null | undefined): string | null {
  if (!p) return null;
  if (p.online) return 'online';
  if (!p.last_active_at) return null;
  const giorno = dayLabel(p.last_active_at);
  if (giorno === 'Oggi') return `ultimo accesso oggi alle ${timeHHmm(p.last_active_at)}`;
  if (giorno === 'Ieri') return `ultimo accesso ieri alle ${timeHHmm(p.last_active_at)}`;
  return `ultimo accesso il ${giorno}`;
}
