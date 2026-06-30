// =============================================================================
// TanStack Query — istanza singola condivisa dall'app.
// =============================================================================
// Default prudenti per mobile: niente refetch aggressivi (anti-doomscroll anche
// nei dati), staleTime ragionevole, retry contenuti.

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
