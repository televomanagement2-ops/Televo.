// =============================================================================
// persistenza.ts — cache offline su disco (M13/P2, AUDIT-HARDENING §2.2).
// =============================================================================
// MMKV = storage nativo SINCRONO: il restore avviene al boot senza flash di
// vuoto (un persister asincrono mostrerebbe schermate vuote prima dei dati).
// Guard Expo Go (pattern LiveKit/MapCanvas): lì il modulo nativo non esiste →
// `persister` resta null e l'app degrada senza persistenza, identica a prima.
//
// La cache TanStack persiste in WHITELIST stretta: SOLO i dati con valore
// offline (hub conversazioni, header, messaggi — trim alle prime 2 pagine —,
// reazioni, profilo, feed drops, amici, ledger notifiche). MAI i dati
// volatili/real-time: live feed, mappa, search, receipts, presence,
// composer-block. Nota portante (§2.1): gli URL firmati dei media NON vivono
// nelle query (la firma è on-demand al render, cache di modulo) → persistere
// è sicuro; offline si legge il testo, i media si firmano al ritorno online.

import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type {
  PersistedClient,
  PersistQueryClientProviderProps,
} from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';
import { GC_TIME_MS } from '@/lib/queryClient';

// --- Storage nativo (guard Expo Go) --------------------------------------------

interface StorageMmkv {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

// Il require è deliberato: serve un'istanza SINCRONA al primo tick del boot
// (un import() asincrono vanificherebbe il restore senza flash). In Expo Go il
// costruttore lancia (modulo nativo assente) → si prosegue senza persistenza.
const mmkv: StorageMmkv | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    return new MMKV({ id: 'televo' });
  } catch {
    return null;
  }
})();

/** True se lo storage su disco è disponibile (Dev Build; in Expo Go è false). */
export const persistenzaDisponibile = mmkv != null;

// Interfaccia SINCRONA (niente Promise): è ciò che esige il sync persister ed
// è un sottotipo dello StateStorage di zustand — un solo oggetto per entrambi.
interface StorageSincrono {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
  removeItem(name: string): void;
}

/**
 * Storage per zustand/persist (outbox chat su disco, AH-4) e per il persister
 * TanStack. Senza MMKV è un no-op trasparente: stato in-sessione come prima di P2.
 */
export const storagePersistente: StorageSincrono = {
  getItem: (name) => mmkv?.getString(name) ?? null,
  setItem: (name, value) => {
    mmkv?.set(name, value);
  },
  removeItem: (name) => {
    mmkv?.delete(name);
  },
};

// --- Whitelist di persistenza ---------------------------------------------------

/**
 * Il contratto esplicito di COSA va su disco (§2.2). Tutto il resto — live
 * feed, mappa, search, receipts, presence, composer-block — è volatile e non
 * si persiste. Le chiavi con 'anon' (query spente senza sessione) mai.
 */
function persistibile(query: Query): boolean {
  const key = query.queryKey as readonly unknown[];
  if (key.includes('anon')) return false;
  const [dominio, secondo, terzo] = key;
  if (dominio === 'chat') {
    // Hub ['chat',uid,'conversations',view] · header ['chat','header',convId] ·
    // messaggi ['chat','messages',convId,clearedAt] · reazioni ['chat','reactions',convId].
    return (
      terzo === 'conversations' ||
      secondo === 'header' ||
      secondo === 'messages' ||
      secondo === 'reactions'
    );
  }
  // Profilo proprio + contatori + top friends (['profilo', uid, …]).
  if (dominio === 'profilo') return true;
  // Drops: SOLO il feed (dettagli/commenti si rileggono online).
  if (dominio === 'drops') return secondo === 'feed';
  // Amici: la sola lista accettata.
  if (dominio === 'amici') return terzo === 'list';
  // Ledger notifiche (tab P10: pronta da subito, degrada finché non esiste).
  if (dominio === 'notifiche') return true;
  return false;
}

// --- Trim dei messaggi nel serialize --------------------------------------------

const PAGINE_MESSAGGI_PERSISTITE = 2; // ~80 messaggi per conversazione
const PAGINE_NOTIFICHE_PERSISTITE = 1; // prima pagina del ledger (§2.2, P10)

/** Quante pagine della query infinita vanno su disco (0 = non è una infinita da trimmare). */
function pagineDaPersistere(key: readonly unknown[]): number {
  const [dominio, secondo, terzo] = key;
  if (dominio === 'chat' && secondo === 'messages') return PAGINE_MESSAGGI_PERSISTITE;
  if (dominio === 'notifiche' && terzo === 'list') return PAGINE_NOTIFICHE_PERSISTITE;
  return 0;
}

/**
 * Serialize del persister con trim: delle query infinite (messaggi, ledger
 * notifiche) vanno su disco solo le prime pagine (le più recenti). Il paging
 * oltre il trim riparte dal server via getNextPageParam — nessuna incoerenza
 * al restore.
 */
function serializeConTrim(client: PersistedClient): string {
  const queries = client.clientState.queries.map((q) => {
    const cap = pagineDaPersistere(q.queryKey as readonly unknown[]);
    if (cap === 0) return q;
    const data = q.state.data as
      | { pages?: unknown[]; pageParams?: unknown[] }
      | undefined;
    if (!data?.pages || data.pages.length <= cap) return q;
    return {
      ...q,
      state: {
        ...q.state,
        data: {
          pages: data.pages.slice(0, cap),
          pageParams: data.pageParams?.slice(0, cap),
        },
      },
    };
  });
  return JSON.stringify({
    ...client,
    clientState: { ...client.clientState, queries },
  });
}

// --- Persister + opzioni provider ------------------------------------------------

const CHIAVE_CACHE = 'televo.query-cache';

// Da bumpare a ogni cambio di shape dei dati persistiti (il restore con buster
// diverso scarta la cache); la versione app fa da seconda componente.
// v2: ConversationPreview porta clearedAt (P11/H1).
const CACHE_BUSTER = `v2:${Constants.expoConfig?.version ?? '0'}`;

const persister = mmkv
  ? createSyncStoragePersister({
      storage: storagePersistente,
      key: CHIAVE_CACHE,
      serialize: serializeConTrim,
    })
  : null;

/**
 * Opzioni per <PersistQueryClientProvider/> (identità stabile: modulo, non
 * render). null in Expo Go → il root layout torna al provider semplice.
 * `maxAge` = `gcTime` (obbligatorio: se gcTime < maxAge l'eviction svuoterebbe
 * lo stato deidratato prima della scadenza su disco).
 */
export const persistOptions: PersistQueryClientProviderProps['persistOptions'] | null =
  persister
    ? {
        persister,
        maxAge: GC_TIME_MS,
        buster: CACHE_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: (q: Query) => defaultShouldDehydrateQuery(q) && persistibile(q),
          shouldDehydrateMutation: () => false,
        },
      }
    : null;

/**
 * Cancella la cache query persistita. Da chiamare al logout (SIGNED_OUT):
 * i dati di un account NON sopravvivono al cambio utente (vincolo privacy §2.2).
 */
export function rimuoviCachePersistita(): void {
  void persister?.removeClient();
}
