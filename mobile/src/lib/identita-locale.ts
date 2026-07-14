// =============================================================================
// identita-locale.ts — chi era l'utente all'ultimo avvio riuscito (M14/V1).
// =============================================================================
// Il gate di boot decide su `getSession()`, ma con l'access token SCADUTO e
// zero rete auth-js non può rinnovare e risponde `session: null` PUR lasciando
// la sessione (refresh token valido) in SecureStore: un falso logout. Questo
// modulo persiste la verità minima che serve al gate per non buttare fuori un
// utente loggato: `uid` (le queryKey della cache persistita P2 combaciano) e
// `onboarded` (per non finire su /registrazione quando il profilo non è
// leggibile offline). NON è un credenziale: niente token, solo instradamento.
//
// Ciclo di vita: scritta quando il profilo carica con `age_verified === true`;
// cancellata SOLO al logout volontario o a un SIGNED_OUT reale ricevuto ONLINE.
// Storage: MMKV via storagePersistente (in Expo Go è un no-op → il boot
// offline degrada alla login page, coerente con l'assenza di cache P2).

import { storagePersistente } from '@/lib/persistenza';

export interface IdentitaLocale {
  uid: string;
  onboarded: boolean;
}

const CHIAVE = 'televo.identita';

// Cache di modulo: la lettura deve essere sincrona anche nei render (fallback
// isOnboarded). undefined = non ancora letta dal disco.
let cache: IdentitaLocale | null | undefined;

/** L'identità locale persistita, o null se assente/illeggibile. Sincrona. */
export function leggiIdentitaLocale(): IdentitaLocale | null {
  if (cache !== undefined) return cache;
  try {
    const raw = storagePersistente.getItem(CHIAVE);
    const parsed = raw ? (JSON.parse(raw) as Partial<IdentitaLocale>) : null;
    cache =
      parsed && typeof parsed.uid === 'string'
        ? { uid: parsed.uid, onboarded: parsed.onboarded === true }
        : null;
  } catch {
    cache = null;
  }
  return cache;
}

/** Aggiorna l'identità locale (upsert: un solo utente per installazione). */
export function salvaIdentitaLocale(identita: IdentitaLocale): void {
  cache = identita;
  try {
    storagePersistente.setItem(CHIAVE, JSON.stringify(identita));
  } catch {
    // Storage indisponibile: si perde solo il boot offline, non l'app.
  }
}

/** Cancella l'identità (logout volontario o revoca reale online). */
export function rimuoviIdentitaLocale(): void {
  cache = null;
  try {
    storagePersistente.removeItem(CHIAVE);
  } catch {
    // Come sopra: best-effort.
  }
}
