// =============================================================================
// useCondividiClassifica — il flusso della share card (M16 / AC4, §6.2).
// =============================================================================
// Monta la card off-screen on-demand → aspetta il layout (+ una pausa breve
// per le immagini async: avatar/wordmark) → `captureRef` PNG 1080×1920 →
// `Sharing.shareAsync`. QUALSIASI inciampo (runtime senza i moduli nativi —
// Expo Go —, cattura fallita, condivisione file non disponibile) degrada al
// fallback TESTUALE `Share.share` (pattern profilo.tsx): mai un crash, sempre
// una condivisione. I moduli nativi sono importati DINAMICAMENTE dentro il
// try: la valutazione stessa è dietro il guard.
//
// La card contiene SOLO dati del mittente (INVARIANTE §6.1): questo hook
// riceve già il pacchetto `DatiCardClassifica` pronto — niente righe di amici.

import { useCallback, useRef, useState } from 'react';
import { Share, type View } from 'react-native';
import { INVITE_URL } from '@/constants/config';

/** I dati PROPRI mostrati sulla card (§6.1): mai identità di amici. */
export interface DatiCardClassifica {
  /** Posizione 1-based nella PROPRIA classifica. */
  rank: number;
  /** Partecipanti, me incluso (numero nudo: dato proprio, ammesso). */
  friendsTotal: number;
  auraScore: number;
  displayName: string | null;
  username: string;
  avatarUrl: string | null;
}

/** Pausa post-layout: lascia decodificare le immagini async prima dello scatto. */
const ATTESA_IMMAGINI_MS = 350;
/** Cintura: se onLayout non arrivasse, si prova comunque (il catch copre). */
const TIMEOUT_LAYOUT_MS = 1500;

export function useCondividiClassifica(dati: DatiCardClassifica | null) {
  const [inCorso, setInCorso] = useState(false);
  const cardRef = useRef<View | null>(null);
  const prontaRef = useRef<(() => void) | null>(null);

  /** Chiamata dal primo onLayout della card montata. */
  const onCardPronta = useCallback(() => {
    prontaRef.current?.();
    prontaRef.current = null;
  }, []);

  const condividi = useCallback(() => {
    if (!dati || inCorso) return;
    setInCorso(true); // → il container monta la card off-screen

    void (async () => {
      try {
        // 1) layout della card appena montata (con cintura di timeout)
        await Promise.race([
          new Promise<void>((resolve) => {
            prontaRef.current = resolve;
          }),
          new Promise<void>((resolve) => setTimeout(resolve, TIMEOUT_LAYOUT_MS)),
        ]);
        await new Promise<void>((resolve) => setTimeout(resolve, ATTESA_IMMAGINI_MS));

        // 2) scatto: PNG 1080×1920 (layout logico 360×640 riscalato, §6.2)
        const { captureRef } = await import('react-native-view-shot');
        const uri = await captureRef(cardRef, {
          format: 'png',
          width: 1080,
          height: 1920,
          result: 'tmpfile',
        });

        // 3) condivisione del file
        const Sharing = await import('expo-sharing');
        if (!(await Sharing.isAvailableAsync())) throw new Error('sharing_unavailable');
        await Sharing.shareAsync(uri, { mimeType: 'image/png' });
      } catch {
        // Fallback testuale: stessa storia, senza immagine (§6.2).
        Share.share({
          message: `Sono ${dati.rank}° nella classifica Aura dei miei amici su Televo — ${INVITE_URL}`,
        }).catch(() => {});
      } finally {
        prontaRef.current = null;
        setInCorso(false); // → la card off-screen si smonta
      }
    })();
  }, [dati, inCorso]);

  return {
    condividi,
    /** True dal tap alla fine del flusso: la card resta montata solo qui. */
    inCorso,
    /** True quando il container deve montare la ShareCardClassifica. */
    montaCard: inCorso && !!dati,
    cardRef,
    onCardPronta,
  };
}
