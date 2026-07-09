// =============================================================================
// map.ts — dominio "condivisione posizione" lato client (M7 / MM6).
// =============================================================================
// Le sole scritture della mappa passano da RPC definer (convenzione repo): qui
// i wrapper tipizzati di map_start_sharing / map_stop_sharing /
// map_publish_location, più la persistenza LOCALE minima della sessione. La
// posizione è effimera per natura → NESSUN outbox (map.md §9): un publish
// fallito si salta, il prossimo riuscito riallinea tutto. Il MASKING Safe Zone
// e il RATE-LIMIT vivono SUL SERVER (la RPC): il client manda sempre il punto
// esatto, il DB decide cosa persistere.

import * as SecureStore from 'expo-secure-store';
import { callRpc } from '@/lib/rpc';
import type { Coordinate } from '@/lib/location';
import type { MapSnapshotRaw } from '@/types/supabase';

/** Esito di map_start_sharing: la fine sessione (UTC) decisa dal server. */
export interface AvvioCondivisione {
  sharingUntil: string; // ISO UTC
}

/** Esito di map_publish_location. `skipped` = no-op del rate-limit server (20s). */
export interface EsitoPublish {
  masked: boolean;
  skipped: boolean;
}

/** Accende l'aura sulla mappa per N ore (1–12). Richiede share_location=true a monte. */
export async function avviaCondivisione(ore: number): Promise<AvvioCondivisione> {
  const res = await callRpc<{ ok: boolean; sharing_until: string }>('map_start_sharing', {
    p_hours: ore,
  });
  return { sharingUntil: res.sharing_until };
}

/** Revoca istantanea: cancella FISICAMENTE la presenza + gli eventi live propri. */
export async function fermaCondivisione(): Promise<void> {
  await callRpc('map_stop_sharing', {});
}

/**
 * Legge lo snapshot della mappa (MM7): { server_now, me, friends[], events[] }.
 * È l'UNICA porta di lettura (RPC definer filtrata `can_see_on_map` server-side:
 * un estraneo non riceve NULLA). Timestamp UTC grezzi → gli stati Live/Echo/
 * LastSeen li deriva il client con clock calibrato su `server_now` (map.md §8).
 */
export async function fetchMapSnapshot(): Promise<MapSnapshotRaw> {
  return callRpc<MapSnapshotRaw>('map_snapshot', {});
}

/**
 * Pubblica la posizione durante la sessione. Il server valida (sessione attiva,
 * kill-switch, bounds), applica il rate-limit e il masking Safe Zone, poi decide
 * il fan-out realtime. Ritorna `{masked, skipped}`.
 */
export async function pubblicaPosizione(coord: Coordinate): Promise<EsitoPublish> {
  const res = await callRpc<{ ok: boolean; masked?: boolean; skipped?: boolean }>(
    'map_publish_location',
    { p_lat: coord.lat, p_lng: coord.lng },
  );
  return { masked: res.masked ?? false, skipped: res.skipped ?? false };
}

// -----------------------------------------------------------------------------
// Safe Zone (MM9) — CRUD via RPC definer. Il masking (punto esatto in-zona →
// centro-zona) avviene SERVER-SIDE in map_publish_location: qui gestiamo solo la
// DEFINIZIONE delle zone. Cap 2/utente imposto dal server (`zone_limit_reached`).
// -----------------------------------------------------------------------------

/** Dati per creare una Safe Zone: etichetta, centro (long-press sulla mappa), raggio. */
export interface NuovaSafeZone {
  label: string;
  lat: number;
  lng: number;
  radiusM: number; // 100..500
}

/** Crea una Safe Zone (cap 2). Ritorna l'id assegnato. */
export async function creaSafeZone(z: NuovaSafeZone): Promise<{ id: string }> {
  const res = await callRpc<{ ok: boolean; id: string }>('map_set_safe_zone', {
    p_label: z.label,
    p_lat: z.lat,
    p_lng: z.lng,
    p_radius_m: z.radiusM,
  });
  return { id: res.id };
}

/** Elimina una propria Safe Zone (dal publish successivo torna il punto esatto). */
export async function eliminaSafeZone(id: string): Promise<void> {
  await callRpc('map_delete_safe_zone', { p_id: id });
}

// -----------------------------------------------------------------------------
// Persistenza locale della sessione — solo il timestamp di fine (epoch ms UTC).
// Serve a UNA cosa: dopo un cold-start mentre la sessione è ancora valida, il
// runtime riprende a pubblicare da solo (map.md §3). NON è la verità (il server
// lo è): al primo publish, se la sessione lato server non c'è più, la RPC alza
// `no_active_session` e il client si azzera. Non è un segreto → SecureStore va
// bene (già dipendenza) e non introduciamo AsyncStorage.
// -----------------------------------------------------------------------------
const CHIAVE_SESSIONE = 'televo.map.session';

export async function salvaSessioneLocale(sharingUntilMs: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(CHIAVE_SESSIONE, String(sharingUntilMs));
  } catch {
    // Persistenza best-effort: senza, si perde solo il resume post-cold-start.
  }
}

export async function leggiSessioneLocale(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(CHIAVE_SESSIONE);
    if (!raw) return null;
    const ms = Number(raw);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

export async function cancellaSessioneLocale(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CHIAVE_SESSIONE);
  } catch {
    // idem: best-effort.
  }
}
