// =============================================================================
// useCondivisionePosizione — opt-in gestuale + pipeline posizione (M7 / MM6).
// =============================================================================
// Due livelli, stesso file (come usePresenza: heartbeat + query):
//  · useCondivisionePosizione(): l'API della UI (controllo sulla mappa, sheet,
//    onboarding, impostazioni) — consenso GDPR, permesso OS, avvia/estendi/
//    spegni la sessione, kill-switch master (profiles.share_location).
//  · useCondivisionePosizioneRuntime(): il WATCHER, montato UNA volta in
//    ChatRuntime. Osserva il GPS SOLO con sessione attiva + permesso concesso +
//    app in foreground, e pubblica con throttling adattivo (map.md §13.5):
//    movimento ≥30m o heartbeat ~4.5min, sopra il rate-limit server (20s). La
//    VERITÀ è il server: un publish che torna no_active_session /
//    location_sharing_off / user_not_active azzera la sessione locale.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LocationSubscription } from 'expo-location';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateProfile } from '@/hooks/useProfilo';
import { recordConsent, authErrorCode } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';
import {
  avviaCondivisione,
  cancellaSessioneLocale,
  fermaCondivisione,
  leggiSessioneLocale,
  pubblicaPosizione,
  salvaSessioneLocale,
} from '@/lib/map';
import {
  distanzaMetri,
  osservaPosizione,
  posizioneCorrente,
  richiediPermessoPosizione,
  statoPermessoPosizione,
  type Coordinate,
  type PermessoPosizione,
} from '@/lib/location';
import { sessioneAttiva, useMapStore } from '@/store/mapStore';

// --- Parametri di pubblicazione (map.md §13.5) -------------------------------
const PUBLISH_MIN_INTERVAL_MS = 25_000; // guard client sopra il rate-limit server (20s)
const PUBLISH_MOVE_M = 30; //             pubblica se mi sono spostato ≥30m
const HEARTBEAT_MS = 270_000; //          …o comunque ogni ~4.5min (freshness "Live" <10min)

// --- Query keys --------------------------------------------------------------
export const mappaKeys = {
  consenso: (uid: string) => ['mappa', uid, 'consenso-posizione'] as const,
  snapshot: (uid: string) => ['mappa', uid, 'snapshot'] as const, // MM7: map_snapshot()
};

// -----------------------------------------------------------------------------
// Consenso GDPR 'location' (granted e non revocato). Stesso schema di
// useConsensoContatti: `consents` è owner-only via RLS, grant select già live.
// -----------------------------------------------------------------------------
export function useConsensoPosizione() {
  const { uid } = useAuth();

  return useQuery({
    queryKey: uid ? mappaKeys.consenso(uid) : ['mappa', 'anon', 'consenso-posizione'],
    enabled: !!uid,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('consents')
        .select('granted_at, revoked_at')
        .eq('user_id', uid as string)
        .eq('consent_type', 'location')
        .maybeSingle();
      if (error) throw error;
      const row = data as unknown as { granted_at: string | null; revoked_at: string | null } | null;
      return !!row?.granted_at && !row.revoked_at;
    },
  });
}

// -----------------------------------------------------------------------------
// API della UI
// -----------------------------------------------------------------------------
export function useCondivisionePosizione() {
  const queryClient = useQueryClient();
  const { uid } = useAuth();
  const update = useUpdateProfile();

  const sessione = useMapStore((s) => s.sessione);
  const permesso = useMapStore((s) => s.permesso);
  const myCoords = useMapStore((s) => s.myCoords);
  const problema = useMapStore((s) => s.problema);

  const consenso = useConsensoPosizione();

  const invalidaConsenso = useCallback(() => {
    if (uid) void queryClient.invalidateQueries({ queryKey: mappaKeys.consenso(uid) });
  }, [queryClient, uid]);

  // Accende (o estende) la sessione per N ore. Garantisce il master
  // share_location=true (idempotente), poi map_start_sharing. Il runtime, vista
  // la sessione attiva nello store, inizia subito a pubblicare.
  const avvia = useMutation({
    mutationFn: async (ore: number): Promise<void> => {
      const attuale = useAuthStore.getState().profile?.share_location;
      if (attuale !== true) await update.mutateAsync({ share_location: true });
      const { sharingUntil } = await avviaCondivisione(ore);
      const untilMs = Date.parse(sharingUntil);
      useMapStore.getState().setSessione({
        sharingUntil: untilMs,
        masked: false,
        zoneLabel: null,
        updatedAt: null,
      });
      await salvaSessioneLocale(untilMs);
    },
  });

  // "Spegni ora": revoca istantanea (sparire del tutto, nemmeno Last Seen).
  const spegni = useMutation({
    mutationFn: async (): Promise<void> => {
      await fermaCondivisione();
      useMapStore.getState().clearSessione();
      await cancellaSessioneLocale();
    },
  });

  // Onboarding: registra il consenso GDPR 'location'.
  const registraConsenso = useMutation({
    mutationFn: () => recordConsent('location', true),
    onSuccess: invalidaConsenso,
  });

  // Kill-switch master (impostazioni). ON = abilita + registra consenso; OFF =
  // il trigger DB ha già cancellato la presenza/eventi → azzeriamo il client.
  const impostaMaster = useMutation({
    mutationFn: async (on: boolean): Promise<void> => {
      await update.mutateAsync({ share_location: on });
      if (on) {
        await recordConsent('location', true);
      } else {
        useMapStore.getState().clearSessione();
        await cancellaSessioneLocale();
      }
    },
    onSuccess: invalidaConsenso,
  });

  const richiediPermesso = useCallback(async (): Promise<PermessoPosizione> => {
    const p = await richiediPermessoPosizione();
    useMapStore.getState().setPermesso(p);
    return p;
  }, []);

  const sincronizzaPermesso = useCallback(async (): Promise<PermessoPosizione> => {
    const p = await statoPermessoPosizione();
    useMapStore.getState().setPermesso(p);
    return p;
  }, []);

  return {
    sessione,
    permesso,
    myCoords,
    problema,
    consenso,
    avvia,
    spegni,
    registraConsenso,
    impostaMaster,
    richiediPermesso,
    sincronizzaPermesso,
  };
}

// -----------------------------------------------------------------------------
// Runtime del watcher — montato UNA volta in ChatRuntime.
// -----------------------------------------------------------------------------
export function useCondivisionePosizioneRuntime() {
  const { uid } = useAuth();

  const sessione = useMapStore((s) => s.sessione);
  const permesso = useMapStore((s) => s.permesso);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  // Stato del throttling (ref: non deve causare render).
  const subRef = useRef<LocationSubscription | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scadenzaRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPublishRef = useRef(0);
  const lastCoordsRef = useRef<Coordinate | null>(null);

  // Decide se pubblicare questo fix e, in caso, lo invia. `force` bypassa le
  // soglie (primo fix della sessione). La verità è il server: sugli errori di
  // "sessione finita" si azzera tutto.
  const tentaPublish = useCallback(async (coord: Coordinate, force: boolean): Promise<void> => {
    const s = useMapStore.getState().sessione;
    if (!sessioneAttiva(s, Date.now())) return;

    const now = Date.now();
    if (!force && now - lastPublishRef.current < PUBLISH_MIN_INTERVAL_MS) return;

    const moved = lastCoordsRef.current ? distanzaMetri(lastCoordsRef.current, coord) : Infinity;
    const heartbeatDovuto = now - lastPublishRef.current >= HEARTBEAT_MS;
    if (!force && !heartbeatDovuto && moved < PUBLISH_MOVE_M) return;

    lastPublishRef.current = now;
    try {
      const { masked, skipped } = await pubblicaPosizione(coord);
      if (skipped) return; // no-op del rate-limit server: nulla è cambiato
      lastCoordsRef.current = coord;
      useMapStore.getState().aggiornaSessione({ masked, updatedAt: now });
    } catch (e) {
      const code = authErrorCode(e);
      if (code === 'no_active_session' || code === 'location_sharing_off' || code === 'user_not_active') {
        useMapStore.getState().clearSessione();
        void cancellaSessioneLocale();
      }
      // Altri errori (rete): si salta, il prossimo fix riprova (posizione effimera).
    }
  }, []);

  const fermaWatcher = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (scadenzaRef.current) {
      clearTimeout(scadenzaRef.current);
      scadenzaRef.current = null;
    }
  }, []);

  // 1) All'accesso: sincronizza il permesso e RIPRENDI una sessione ancora
  //    valida dopo un cold-start (map.md §3, "la pipeline riparte da sola").
  useEffect(() => {
    if (!uid) return;
    let vivo = true;
    void (async () => {
      const p = await statoPermessoPosizione();
      if (!vivo) return;
      useMapStore.getState().setPermesso(p);
      const untilMs = await leggiSessioneLocale();
      if (!vivo) return;
      if (untilMs && untilMs > Date.now()) {
        if (!useMapStore.getState().sessione) {
          useMapStore.getState().setSessione({
            sharingUntil: untilMs,
            masked: false,
            zoneLabel: null,
            updatedAt: null,
          });
        }
      } else if (untilMs) {
        await cancellaSessioneLocale();
      }
    })();
    return () => {
      vivo = false;
    };
  }, [uid]);

  // 2) AppState: aggiorna appActive e, tornando in foreground, ri-legge il
  //    permesso (potrebbe essere stato tolto dalle impostazioni di sistema).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const attivo = state === 'active';
      setAppActive(attivo);
      if (attivo) {
        void statoPermessoPosizione().then((p) => useMapStore.getState().setPermesso(p));
        // Sessione scaduta mentre eravamo in background (il timer era fermo):
        // azzera lo store + il marker persistito. Resta il Last Seen lato server.
        const s = useMapStore.getState().sessione;
        if (s && !sessioneAttiva(s, Date.now())) {
          useMapStore.getState().clearSessione();
          void cancellaSessioneLocale();
        }
      }
    });
    return () => sub.remove();
  }, []);

  // 3) Logout: ferma tutto e azzera lo store.
  useEffect(() => {
    if (uid) return;
    fermaWatcher();
    useMapStore.getState().reset();
  }, [uid, fermaWatcher]);

  // 4) Il cuore: osserva solo con sessione attiva + permesso + foreground.
  const attiva = sessioneAttiva(sessione, Date.now());
  const deveOsservare = !!uid && attiva && permesso === 'granted' && appActive;
  const sharingUntil = sessione?.sharingUntil ?? 0;

  useEffect(() => {
    if (!deveOsservare) {
      fermaWatcher();
      return;
    }
    let annullato = false;

    void (async () => {
      // Publish immediato (fresh avvia o resume): la riga prende subito un fix.
      const first = await posizioneCorrente();
      if (annullato) return;
      if (first) {
        useMapStore.getState().setMyCoords(first);
        await tentaPublish(first, true);
      }
      if (annullato) return;

      let sub: LocationSubscription;
      try {
        sub = await osservaPosizione((coord) => {
          useMapStore.getState().setMyCoords(coord);
          void tentaPublish(coord, false);
        });
      } catch {
        // Permesso tolto a runtime o servizi off: segnala e non insistere.
        if (!annullato) useMapStore.getState().setProblema('permesso');
        return;
      }
      if (annullato) {
        sub.remove();
        return;
      }
      subRef.current = sub;

      // Heartbeat da fermo: mantiene la freshness "Live" a costo minimo.
      heartbeatRef.current = setInterval(() => {
        const c = useMapStore.getState().myCoords;
        if (c) void tentaPublish(c, false);
      }, HEARTBEAT_MS);
    })();

    // Auto-spegnimento alla scadenza naturale: resta il Last Seen (NON stop_sharing).
    const restanti = sharingUntil - Date.now();
    if (restanti > 0) {
      scadenzaRef.current = setTimeout(() => useMapStore.getState().clearSessione(), restanti);
    }

    return () => {
      annullato = true;
      fermaWatcher();
    };
  }, [deveOsservare, sharingUntil, tentaPublish, fermaWatcher]);
}
