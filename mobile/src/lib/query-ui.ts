// =============================================================================
// query-ui.ts — mappa lo stato di una query TanStack allo stato dello schermo.
// =============================================================================
// Pattern maturo (stale-while-revalidate), M13/P1 (AUDIT-HARDENING §1.2):
// se ci sono dati in cache si mostrano SEMPRE (refresh silenzioso in
// background); lo spinner appare SOLO senza dati; lo stato di errore SOLO con
// errore e senza dati; lo stato OFFLINE è dedicato (niente rete + niente cache).
//
// ⚠️ Trappola: con l'onlineManager cablato (initRete), una query lanciata
// offline NON parte ma resta in pausa → `isLoading` è `false` mentre `isPending`
// è `true` e `fetchStatus === 'paused'`. Per questo NON si ragiona mai a mano
// nei singoli screen: si usa SEMPRE questo helper (poi reso da VistaStato).

/** Stato di ingresso di uno schermo derivato da una query. */
export type StatoSchermo = 'dati' | 'caricamento' | 'offline' | 'errore';

/**
 * Forma minima condivisa da `UseQueryResult` e `UseInfiniteQueryResult`: si
 * passa la query così com'è (le proprietà extra non danno fastidio) oppure un
 * oggetto sintetico quando lo schermo combina più query (es. chat: header +
 * messaggi).
 */
export interface StatoQuery {
  data: unknown;
  isPending: boolean;
  isError: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
}

/**
 * Decide lo stato dello schermo. Ordine dei rami (§1.2, tabella):
 *  1. dati presenti (anche stale) → 'dati' (render + refresh silenzioso)
 *  2. nessun dato + offline       → 'offline'
 *  3. nessun dato + pending/paused → 'caricamento'
 *  4. nessun dato + errore        → 'errore'
 */
export function statoSchermo(query: StatoQuery, online: boolean): StatoSchermo {
  if (query.data !== undefined) return 'dati';
  if (!online) return 'offline';
  if (query.isPending || query.fetchStatus === 'paused') return 'caricamento';
  if (query.isError) return 'errore';
  return 'caricamento';
}
