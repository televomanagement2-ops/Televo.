// =============================================================================
// TanStack Query — istanza singola condivisa dall'app.
// =============================================================================
// Default prudenti per mobile: niente refetch aggressivi (anti-doomscroll anche
// nei dati), staleTime ragionevole, retry contenuti.
//
// M13/P1 (AUDIT-HARDENING §1.2): l'onlineManager è cablato dal boot (initRete in
// app/_layout.tsx) quindi `networkMode: 'online'` (default) è ora corretto — una
// query offline resta in PAUSA invece di fallire subito ("freccia refresh" in
// ~1s). In più: retry esponenziale (transitori online), `gcTime` 48h come
// prerequisito della persistenza cache (P2: gcTime ≥ maxAge, altrimenti
// l'eviction svuota lo stato deidratato) e refetch automatico al ritorno online.

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // La cache sopravvive 48h in memoria: base dello stale-while-revalidate e
      // vincolo della persistenza P2 (gcTime ≥ maxAge del persister).
      gcTime: 48 * 60 * 60 * 1000,
      retry: 2,
      // Backoff esponenziale 1s → 2s, con tetto a 5s (attemptIndex 0-based).
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      refetchOnWindowFocus: false,
      // Al ritorno online riallinea i dati anche se non ancora stale.
      refetchOnReconnect: 'always',
    },
    mutations: {
      retry: 0,
    },
  },
});
