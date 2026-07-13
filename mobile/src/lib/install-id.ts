// =============================================================================
// install-id.ts — identità stabile di QUESTA installazione (M13/P6).
// =============================================================================
// Un UUID generato al primo uso e persistito in SecureStore: identifica
// l'INSTALLAZIONE (non l'utente, non l'hardware) e serve alla notifica "nuovo
// accesso" per (1) dedupare gli avvisi dello stesso device lato server (RPC
// enqueue_login_alert, finestra 1h) e (2) sopprimere il banner sul device che
// ha appena fatto login (installNotificationHandler). Sopravvive a login e
// logout; cambia con la reinstallazione — comportamento voluto: una
// reinstallazione È un nuovo accesso da annunciare.

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const INSTALL_ID_KEY = 'televo.install_id';

let cache: string | null = null;

/**
 * L'install id già caricato in questa sessione (per i confronti SINCRONI del
 * notification handler). null finché getInstallId non è stata chiamata.
 */
export function installIdNoto(): string | null {
  return cache;
}

/** L'install id persistente, creato al primo accesso. Non lancia mai. */
export async function getInstallId(): Promise<string> {
  if (cache) return cache;
  let id = await SecureStore.getItemAsync(INSTALL_ID_KEY).catch(() => null);
  if (!id) {
    id = Crypto.randomUUID();
    // Best-effort: se SecureStore non salva, l'id resta valido per la sessione
    // (al prossimo avvio se ne genera un altro: al peggio un avviso in più).
    await SecureStore.setItemAsync(INSTALL_ID_KEY, id).catch(() => {});
  }
  cache = id;
  return id;
}
