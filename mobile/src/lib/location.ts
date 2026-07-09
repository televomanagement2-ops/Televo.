// =============================================================================
// location.ts — accesso al GPS del device per la Mappa della Città (M7 / MM6).
// =============================================================================
// SOLO device: permesso (When-In-Use, foreground v1), lettura one-shot, watcher
// a basso consumo e la distanza in metri tra due punti. NESSUNA logica di
// dominio qui (le RPC vivono in lib/map.ts, l'orchestrazione in
// hooks/useCondivisionePosizione.ts): questo file non sa cosa sia una
// "sessione". `expo-location` è incluso in Expo Go → la pipeline è testabile
// anche prima della Dev Build (la mappa MapLibre no, ma la posizione sì).

import * as Location from 'expo-location';

/** Coordinata WGS84 come la usiamo ovunque nel client (lat/lng separati). */
export interface Coordinate {
  lat: number;
  lng: number;
}

export type PermessoPosizione = 'granted' | 'denied' | 'undetermined';

// -----------------------------------------------------------------------------
// Parametri della pipeline (map.md §13.5). Il watcher è "grezzo" (movimento/
// tempo del sistema); la decisione FINE di quando pubblicare la prende l'hook
// (soglia movimento + heartbeat + rate-limit), non expo-location.
// -----------------------------------------------------------------------------
export const WATCH_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.Balanced, // ~100m HW: basso consumo, sufficiente
  distanceInterval: 25, // il sistema ci sveglia ogni ~25m di spostamento
  timeInterval: 30_000, // …o al più ogni 30s (Android best-effort)
};

// -----------------------------------------------------------------------------
// Permessi
// -----------------------------------------------------------------------------

function mappaStato(res: Location.PermissionResponse): PermessoPosizione {
  if (res.granted) return 'granted';
  // canAskAgain=false ⇒ "non chiedermelo più" → di fatto negato (serve Impostazioni).
  if (res.status === 'undetermined' && res.canAskAgain) return 'undetermined';
  return 'denied';
}

/** Stato del permesso di posizione in foreground (non chiede nulla). */
export async function statoPermessoPosizione(): Promise<PermessoPosizione> {
  try {
    return mappaStato(await Location.getForegroundPermissionsAsync());
  } catch {
    return 'denied';
  }
}

/** Chiede il permesso di posizione in foreground (dialog di sistema). */
export async function richiediPermessoPosizione(): Promise<PermessoPosizione> {
  try {
    return mappaStato(await Location.requestForegroundPermissionsAsync());
  } catch {
    return 'denied';
  }
}

/** True se i servizi di localizzazione del device sono accesi (GPS/rete). */
export async function serviziPosizioneAttivi(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// Lettura
// -----------------------------------------------------------------------------

/** Un fix singolo (per centrare la mappa o piazzare il puntino "tu"). null su errore. */
export async function posizioneCorrente(): Promise<Coordinate | null> {
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Avvia il watcher a basso consumo. Ogni fix passa `onFix` (coordinate + epoch
 * ms UTC del rilevamento). Ritorna la subscription: chiamare `.remove()` per
 * fermarlo. Il caller (hook) decide se e quando pubblicare.
 */
export async function osservaPosizione(
  onFix: (coord: Coordinate, timestampMs: number) => void,
): Promise<Location.LocationSubscription> {
  return Location.watchPositionAsync(WATCH_OPTIONS, (pos) => {
    onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude }, pos.timestamp);
  });
}

// -----------------------------------------------------------------------------
// Geometria — distanza in metri (haversine). Serve alla soglia di movimento
// client-side (evita publish inutili quando si è fermi con jitter GPS).
// -----------------------------------------------------------------------------
const R_TERRA_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function distanzaMetri(a: Coordinate, b: Coordinate): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
