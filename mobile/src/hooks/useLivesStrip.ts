// =============================================================================
// useLivesStrip — le live TERMINATE da <24h nella striscia (M15 / LR6, RW-1).
// =============================================================================
// Seconda metà della striscia della Home: dopo le attive (che vengono dal feed,
// useLivesFeed) i SEGNAPOSTO delle live finite da meno di 24h — cerchio spento,
// tap → PROFILO dell'amico (RW-1a: non esiste replay). Porta di lettura
// dedicata `lives_strip()` (LR2): stessa visibilità delle attive
// (can_see_live: kickati/bloccati/estranei esclusi, la propria esclusa
// server-side), ended_at desc, cap 20.
//
// Compiti CLIENT dichiarati dalla spec (live-rework.md §1/§8.5):
//  · sparizione a 24h ESATTE da ended_at, anche TRA un refetch e l'altro:
//    filtro sul clock calibrato (`server_now` → offset, pattern M7 §8) + un
//    timer mirato alla prossima scadenza che forza il ricalcolo;
//  · dedup per host: se l'host ha una live ATTIVA visibile nello store, il suo
//    segnaposto terminato NON si mostra (chiude-e-riapre entro 24h → vince
//    l'attiva); tra più terminate dello stesso host resta la più recente (la
//    striscia è fatta di persone, non di righe: un solo cerchio per amico);
//  · le terminate NON toccano MAI gli items del pager (feed = solo attive).
//
// Riconciliazione: lo snapshot è la verità (refetch 60s in foreground, al
// ritorno attivo e a riconnessione — i force-end del cron non fanno fan-out);
// l'evento `live_ended` sull'inbox privata (multiplexer map-realtime, canale
// condiviso col feed) INVALIDA la query → la terminata fresca appare subito.

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { liveKeys } from '@/hooks/useLivesFeed';
import { fetchLivesStrip } from '@/lib/live';
import { subscribeMapInbox } from '@/lib/map-realtime';
import { onRiconnessione } from '@/lib/rete';
import { useLiveStore } from '@/store/liveStore';

/** Un segnaposto di live terminata, normalizzato (epoch-ms UTC, camelCase). */
export interface LiveTerminata {
  liveId: string;
  endedAt: number; // epoch ms UTC
  host: {
    userId: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

// Finestra della striscia: 24h esatte da ended_at. INVARIANTE (live-rework.md
// §1): coincide con la purge di live_viewers (registro kick) in expire_content
// — se una delle due durate cambia, vanno mosse insieme (i kickati rientrerebbero).
const FINESTRA_STRISCIA_MS = 24 * 60 * 60 * 1000;

// Reconcile in foreground: stessa cadenza del feed (le terminate cambiano di
// rado; il grosso lo fa l'invalidazione su live_ended).
const RECONCILE_MS = 60_000;

export function useLivesStrip() {
  const queryClient = useQueryClient();
  const { uid } = useAuth();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  const query = useQuery({
    queryKey: uid ? liveKeys.strip(uid) : ['live', 'anon', 'strip'],
    enabled: !!uid,
    queryFn: fetchLivesStrip,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    refetchInterval: appActive ? RECONCILE_MS : false,
    refetchIntervalInBackground: false,
  });

  const invalida = useCallback(() => {
    if (uid) void queryClient.invalidateQueries({ queryKey: liveKeys.strip(uid) });
  }, [queryClient, uid]);

  // live_ended → una terminata nuova: refetch subito. Il multiplexer smista a
  // TUTTI gli handler-set registrati: questo convive con quello di useLivesFeed
  // (che rimuove la live dal feed) sull'UNICO canale reale `map:u:{uid}`.
  useEffect(() => {
    if (!uid) return;
    return subscribeMapInbox(uid, { onLiveEnded: () => invalida() });
  }, [uid, invalida]);

  // AppState: pilota il refetchInterval e riallinea al ritorno in foreground
  // (i force-end del cron non fanno fan-out: solo lo snapshot li scopre).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      const attivo = st === 'active';
      setAppActive(attivo);
      if (attivo) invalida();
    });
    return () => sub.remove();
  }, [invalida]);

  // Refetch alla riconnessione (i broadcast non vengono ritrasmessi).
  useEffect(() => onRiconnessione(invalida), [invalida]);

  // Dedup attiva>terminata: serve la fotografia delle live attive nello store.
  const livesAttive = useLiveStore((s) => s.lives);

  // Tick di scadenza: forza il ricalcolo del filtro quando la terminata più
  // vecchia compie 24h (sparizione esatta anche senza refetch).
  const [tick, scatta] = useReducer((n: number) => n + 1, 0);

  const data = query.data;

  // Clock calibrato sulla RISPOSTA della strip (self-contained: non dipende
  // dall'idratazione del feed): un orologio device sballato non tiene in vita
  // né uccide in anticipo i segnaposto.
  const clockOffsetMs = useMemo(
    () => (data ? Date.parse(data.server_now) - Date.now() : 0),
    [data],
  );

  const terminate = useMemo<LiveTerminata[]>(() => {
    void tick; // dipendenza esplicita: il timer di scadenza forza il ricalcolo
    if (!data) return [];
    const nowMs = Date.now() + clockOffsetMs;
    const hostAttivi = new Set(Object.values(livesAttive).map((l) => l.host.userId));
    const hostVisti = new Set<string>();
    const out: LiveTerminata[] = [];
    for (const raw of data.ended) {
      const endedAt = Date.parse(raw.ended_at);
      if (nowMs - endedAt >= FINESTRA_STRISCIA_MS) continue; // 24h esatte
      if (hostAttivi.has(raw.host.user_id)) continue; //         vince l'attiva
      if (hostVisti.has(raw.host.user_id)) continue; //          un cerchio per amico
      hostVisti.add(raw.host.user_id); // ended_at desc dal server → resta la più recente
      out.push({
        liveId: raw.live_id,
        endedAt,
        host: {
          userId: raw.host.user_id,
          username: raw.host.username,
          displayName: raw.host.display_name,
          avatarUrl: raw.host.avatar_url,
        },
      });
    }
    return out;
  }, [data, livesAttive, clockOffsetMs, tick]);

  // Programma il tick sulla PROSSIMA scadenza tra i segnaposto visibili (il
  // ricalcolo che ne segue riprogramma per il successivo). Best-effort in
  // background: al ritorno attivo l'invalidazione riallinea comunque.
  useEffect(() => {
    if (terminate.length === 0) return;
    const nowMs = Date.now() + clockOffsetMs;
    const prossimaMs = Math.min(...terminate.map((t) => t.endedAt + FINESTRA_STRISCIA_MS));
    // Margine di 250ms oltre la soglia: il filtro `>=` deve vederla già scaduta.
    const timer = setTimeout(scatta, Math.max(prossimaMs - nowMs, 0) + 250);
    return () => clearTimeout(timer);
  }, [terminate, clockOffsetMs]);

  return { terminate, clockOffsetMs, query };
}
