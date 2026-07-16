// =============================================================================
// useLiveLikes — i like TikTok dello schermo live (M15 / LR8, RW-3).
// =============================================================================
// Un tap NON è un insert (live-rework.md §3.2): i tap si accumulano qui e si
// scaricano a LOTTI su `live_likes` (insert diretta arbitrata dal trigger,
// stesso pattern dei commenti). Il contatore ❤ mostrato è la somma di tre voci:
//  · la BASELINE `like_count` dell'ultimo live_detail (revalidation 60s);
//  · i lotti ALTRUI arrivati via postgres_changes DOPO lo snapshot — l'handler
//    `onLike` va agganciato al canale condiviso `live:{id}` dei commenti
//    (UN solo subscribe per schermo: LiveSurface lo passa a useLiveComments);
//    le PROPRIE righe vengono SALTATE (l'optimistic locale le ha già contate);
//  · i PROPRI tap, in optimistic immediato (i cuori sono solo locali, RW-3a:
//    nessuna eco attesa — l'insert parte SENZA .select()).
// Display MONOTÒNO: a ogni aggiornamento `display = max(corrente, base+delta)`
// — mai regressioni percepite (§3.2). Se un lotto viene scartato dal server
// (rate-limit) il display può sovrastimare: accettato, si risana da solo
// quando il totale reale supera.
//
// ⚠️ FLUSH_MS = 800 è ACCOPPIATO al rate-limit server di 15 insert/10s del
// trigger `live_likes_before_insert` (R-2: 800ms → max 12,5 lotti/10s +
// headroom di rete): chi cambia una delle due cifre DEVE cambiare l'altra —
// il commento gemello vive nella migrazione 20260716120000_live_likes.sql.
// Errori del lotto (rate_limited, live_not_likeable, live_not_visible, …):
// scartati IN SILENZIO, niente retry-loop né coda (la live è intrinsecamente
// online, pattern M12 — un like perso non è un dato da recuperare).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { inviaLikeLive } from '@/lib/live';
import type { LiveLikeRow } from '@/types';

/** Finestra di accumulo dei tap prima del flush (accoppiata al rate-limit, R-2). */
const FLUSH_MS = 800;
/** Cap del singolo lotto (check server `count between 1 and 50`): l'eccedenza
 *  di una raffica >50 tap in 800ms slitta al lotto successivo. */
const MAX_LOTTO = 50;

export interface LiveLikesApi {
  /** Totale ❤ da mostrare a video (monotòno: non regredisce mai). */
  likeTotali: number;
  /** Un tap = +1 like (double-tap sul video o bottone del rail). Inerte se
   *  il chiamante passa `abilitato=false` (fase non attiva o live in pausa). */
  tap: () => void;
  /** Handler per il canale realtime condiviso: righe `live_likes` ALTRUI
   *  (le proprie vengono saltate qui dentro, non serve filtrare a monte). */
  onLike: (row: LiveLikeRow) => void;
}

export function useLiveLikes(
  liveId: string | undefined,
  abilitato: boolean,
  likeCountSnapshot: number,
): LiveLikesApi {
  const { uid } = useAuth();

  const [likeTotali, setLikeTotali] = useState(likeCountSnapshot);
  // Base = ultimo snapshot; delta = tap propri + lotti altrui POST-snapshot.
  const baseRef = useRef(likeCountSnapshot);
  const deltaRef = useRef(0);
  // Tap accumulati non ancora spediti + timer del prossimo flush.
  const pendingRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aggiornaDisplay = useCallback(() => {
    setLikeTotali((d) => Math.max(d, baseRef.current + deltaRef.current));
  }, []);

  // Snapshot nuovo → base nuova, delta azzerato (il server ha già contato
  // tutto ciò che lo precede), display mai regressivo (max, §3.2).
  useEffect(() => {
    baseRef.current = likeCountSnapshot;
    deltaRef.current = 0;
    setLikeTotali((d) => Math.max(d, likeCountSnapshot));
  }, [likeCountSnapshot]);

  // Flush del lotto: fire-and-forget, errori inghiottiti (vedi header). Se
  // resta un residuo oltre il cap, si riprogramma da solo alla stessa cadenza.
  const flush = useCallback(() => {
    timerRef.current = null;
    if (!liveId) {
      pendingRef.current = 0;
      return;
    }
    const lotto = Math.min(pendingRef.current, MAX_LOTTO);
    if (lotto <= 0) return;
    pendingRef.current -= lotto;
    void inviaLikeLive(liveId, lotto).catch(() => {});
    if (pendingRef.current > 0) timerRef.current = setTimeout(flush, FLUSH_MS);
  }, [liveId]);

  const tap = useCallback(() => {
    if (!abilitato) return; // in pausa/fuori fase: il gesto è già spento in UI
    pendingRef.current += 1;
    deltaRef.current += 1;
    aggiornaDisplay();
    if (!timerRef.current) timerRef.current = setTimeout(flush, FLUSH_MS);
  }, [abilitato, flush, aggiornaDisplay]);

  const onLike = useCallback(
    (row: LiveLikeRow) => {
      if (row.user_id === uid) return; // eco del proprio lotto: già contato
      deltaRef.current += row.count;
      aggiornaDisplay();
    },
    [uid, aggiornaDisplay],
  );

  // Flush finale best-effort all'unmount (o al cambio live): i tap ancora in
  // pancia partono come ultimo lotto; l'eccedenza oltre il cap si perde
  // (accettato: si sta lasciando la live).
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const lotto = Math.min(pendingRef.current, MAX_LOTTO);
      pendingRef.current = 0;
      if (lotto > 0 && liveId) void inviaLikeLive(liveId, lotto).catch(() => {});
    };
  }, [liveId]);

  return { likeTotali, tap, onLike };
}
