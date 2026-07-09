// =============================================================================
// useSafeZones — le mie Safe Zone sulla Mappa della Città (M7 / MM9).
// =============================================================================
// Le Safe Zone sono una scelta di privacy dell'utente (map.md §4): fino a 2 zone
// dove appari «In zona · label» invece che nel punto esatto. Il masking è
// server-side; qui gestiamo la loro DEFINIZIONE (lista + crea + elimina).
//
// SORGENTE DELLE ZONE = `map_snapshot().me.zones`: la stessa RPC di lettura della
// mappa già estrae lat/lng dalle geography (via st_x/st_y). Riusarla evita di
// leggere `map_safe_zones` grezza (la colonna geography arriverebbe come EWKB) e
// non aggiunge backend. Condividiamo la queryKey dello snapshot con useMappa: sul
// map è UNA sola fetch (dedup TanStack); in impostazioni (Expo Go, senza mappa)
// è una fetch a sé — map_snapshot gira comunque, non richiede il modulo nativo.

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { mappaKeys } from '@/hooks/useCondivisionePosizione';
import { creaSafeZone, eliminaSafeZone, fetchMapSnapshot, type NuovaSafeZone } from '@/lib/map';
import type { MapSnapshotRaw, MapZoneRaw } from '@/types/supabase';

/** Una Safe Zone normalizzata per la UI (camelCase; lat/lng già estratti dal server). */
export interface SafeZone {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radiusM: number;
}

/** Cap di prodotto: massimo 2 zone (imposto anche dal server). */
export const MAX_SAFE_ZONES = 2;

function normalizza(z: MapZoneRaw): SafeZone {
  return { id: z.id, label: z.label, lat: z.lat, lng: z.lng, radiusM: z.radius_m };
}

// Selettore STABILE (module-level): estrae me.zones dallo snapshot. Reference fissa
// → TanStack non ri-esegue il select sui render che non toccano lo snapshot (es.
// pan/zoom della mappa) e `zones` resta referenzialmente stabile → ZonesLayer non
// ricostruisce i cerchi (né la source nativa) senza motivo.
const selectZones = (snap: MapSnapshotRaw): SafeZone[] => (snap.me.zones ?? []).map(normalizza);

export function useSafeZones() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;

  // Le zone vivono dentro lo snapshot (me.zones). `select` estrae solo quelle:
  // gli altri observer dello stesso key (useMappa) restano invariati.
  const query = useQuery({
    queryKey: uid ? mappaKeys.snapshot(uid) : ['mappa', 'anon', 'snapshot'],
    enabled: !!uid,
    queryFn: fetchMapSnapshot,
    staleTime: 30_000,
    select: selectZones,
  });

  const invalida = useCallback(() => {
    if (uid) void queryClient.invalidateQueries({ queryKey: mappaKeys.snapshot(uid) });
  }, [queryClient, uid]);

  // Creare/eliminare una zona cambia il masking → invalida lo snapshot: la lista
  // si aggiorna e la mappa ridisegna i cerchi al refetch.
  const crea = useMutation({
    mutationFn: (z: NuovaSafeZone) => creaSafeZone(z),
    onSuccess: invalida,
  });

  const elimina = useMutation({
    mutationFn: (id: string) => eliminaSafeZone(id),
    onSuccess: invalida,
  });

  const zones = query.data ?? [];

  return {
    zones,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    crea,
    elimina,
    pieno: zones.length >= MAX_SAFE_ZONES,
  };
}
