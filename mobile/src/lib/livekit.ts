// =============================================================================
// livekit.ts — bootstrap del runtime nativo LiveKit (M12 / LM5).
// =============================================================================
// LiveKit RN è un modulo NATIVO (WebRTC): come MapLibre, NON gira in Expo Go —
// serve la Dev Build EAS. Stesso pattern di MapCanvas, applicato a un modulo
// non-componente:
//
//  1. GUARD Expo Go — `liveKitDisponibile` è il gate che ogni superficie live
//     controlla PRIMA di montare qualunque cosa tocchi il nativo (pannello
//     "serve la Dev Build" al posto del redbox).
//  2. VALUTAZIONE PIGRA — `@livekit/react-native` è importato via import()
//     dinamico SOLO dentro `inizializzaLiveKit()`: aprendo Televo in Expo Go il
//     modulo nativo non viene mai valutato e il resto dell'app funziona.
//  3. `registerGlobals()` UNA VOLTA SOLA — polyfilla i globals WebRTC per
//     livekit-client e va chiamato prima di QUALSIASI connessione a una stanza
//     (live video M12 e, in futuro, stanze audio). Idempotente per costruzione:
//     le chiamate successive riusano la stessa promise.
//  4. BOOTSTRAP PRIMA DEL CHUNK — `livekit-client` estende `DOMException` alla
//     VALUTAZIONE del modulo (non alla connessione): il polyfill, installato
//     dai side-effect import di `@livekit/react-native`, deve esistere prima
//     che QUALSIASI superficie live venga valutata. Ogni `lazy()` che porta a
//     moduli livekit passa quindi da `dopoBootstrapLiveKit`.

import Constants from 'expo-constants';

// Expo Go: `appOwnership === 'expo'`. Sulla Dev Build / standalone è 'standalone'
// o null → il runtime nativo LiveKit è disponibile.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

/** La superficie Live può montare? False SOLO in Expo Go (pattern MapCanvas). */
export const liveKitDisponibile = !IS_EXPO_GO;

let bootstrap: Promise<void> | null = null;

/**
 * Prepara il runtime LiveKit (registerGlobals). Da attendere prima di creare o
 * connettere una Room. In Expo Go NON valuta il modulo nativo e ritorna `false`
 * (il chiamante mostra il pannello Dev Build); su Dev Build ritorna `true`.
 */
export async function inizializzaLiveKit(): Promise<boolean> {
  if (!liveKitDisponibile) return false;
  if (!bootstrap) {
    bootstrap = import('@livekit/react-native').then(({ registerGlobals }) => {
      registerGlobals();
    });
    // Un fallimento del bootstrap non deve "avvelenare" i tentativi successivi.
    bootstrap.catch(() => {
      bootstrap = null;
    });
  }
  await bootstrap;
  return true;
}

/**
 * Avvolge l'import pigro di una superficie live: attende il bootstrap PRIMA di
 * valutare il chunk (vincolo 4 in testa al file). Da usare in OGNI `lazy()`
 * che porta — anche transitivamente — a un import di livekit.
 */
export function dopoBootstrapLiveKit<T>(importa: () => Promise<T>): () => Promise<T> {
  return async () => {
    await inizializzaLiveKit();
    return importa();
  };
}
