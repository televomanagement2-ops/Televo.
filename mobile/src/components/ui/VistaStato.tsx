// =============================================================================
// VistaStato — rende lo stato di ingresso non-dati (M13/P1, AUDIT-HARDENING §1.2).
// =============================================================================
// Materializza UNA sola volta la tabella «stato → componente» dell'helper
// `statoSchermo`, così i ~15 screen non la ripetono a mano (regola: usare
// SEMPRE l'helper). Lo schermo chiama:
//
//   const stato = statoSchermo(query, online);
//   if (stato !== 'dati') return <VistaStato stato={stato} messaggio={…} onRetry={…} />;
//   // …render dei dati (lo stato vuoto lo gestisce lo schermo)…
//
//  caricamento → LoadingSpinner (o un loader custom, es. skeleton)
//  offline     → StatoErrore variante offline
//  errore      → StatoErrore

import { type ReactNode } from 'react';
import { type ViewStyle } from 'react-native';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatoErrore } from '@/components/ui/StatoErrore';
import type { StatoSchermo } from '@/lib/query-ui';

interface Props {
  /** Stato non-dati: lo schermo garantisce di NON passare 'dati'. */
  stato: Exclude<StatoSchermo, 'dati'>;
  onRetry: () => void;
  /** Messaggio d'errore (ignorato in offline, che ha il suo default). */
  messaggio?: string;
  /** Etichetta dello spinner di caricamento. */
  etichettaCaricamento?: string;
  /** Loader alternativo per il caricamento (es. skeleton della lista). */
  caricamento?: ReactNode;
  /** Stile del loader (passato a LoadingSpinner). */
  style?: ViewStyle;
}

export function VistaStato({
  stato,
  onRetry,
  messaggio,
  etichettaCaricamento,
  caricamento,
  style,
}: Props) {
  if (stato === 'caricamento') {
    return <>{caricamento ?? <LoadingSpinner label={etichettaCaricamento} style={style} />}</>;
  }
  if (stato === 'offline') {
    return <StatoErrore variante="offline" onRetry={onRetry} />;
  }
  return <StatoErrore messaggio={messaggio} onRetry={onRetry} />;
}
