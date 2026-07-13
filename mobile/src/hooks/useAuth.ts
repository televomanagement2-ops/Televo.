// =============================================================================
// useAuth — listener di sessione + selettore comodo per le schermate.
// =============================================================================
// `useAuthListener()` va montato UNA volta (nel root layout): aggancia
// onAuthStateChange e popola authStore (sessione + profilo). `useAuth()` è il
// selettore che le schermate usano per sapere stato/azioni.
//
// Nota: dentro il callback di onAuthStateChange NON si fanno altre chiamate
// Supabase in modo sincrono (rischio di deadlock col lock interno) → la fetch
// del profilo è differita con setTimeout(0).

import { useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { consumaLogoutVolontario, fetchMyProfile, signOut as doSignOut } from '@/lib/auth';
import { avvisa } from '@/lib/dialoghi';
import { rimuoviTokenPush } from '@/lib/expo-push';
import { rimuoviCachePersistita } from '@/lib/persistenza';
import { queryClient } from '@/lib/queryClient';

/**
 * M13/P2: i dati locali di un account NON sopravvivono al cambio utente
 * (vincolo privacy §2.2) — cache query persistita, cache in memoria e
 * outbox/bozze su disco se ne vanno col logout. Agganciata all'evento
 * SIGNED_OUT: copre sia il logout volontario sia la revoca della sessione.
 */
function pulisciDatiAccount(): void {
  useChatStore.getState().reset();
  useChatStore.persist.clearStorage();
  rimuoviCachePersistita();
  queryClient.clear();
}

export function useAuthListener(): void {
  const setSession = useAuthStore((s) => s.setSession);
  const setProfile = useAuthStore((s) => s.setProfile);
  const setInitializing = useAuthStore((s) => s.setInitializing);

  useEffect(() => {
    let active = true;

    // Carica il profilo e ATTENDE: il chiamante decide quando spegnere
    // `initializing`. Differita di un tick per non chiamare Supabase dentro il
    // lock di gotrue (rischio deadlock). Risolve sempre (mai throw).
    const loadProfile = (userId: string | undefined): Promise<void> =>
      new Promise((resolve) => {
        if (!userId) {
          setProfile(null);
          resolve();
          return;
        }
        setTimeout(async () => {
          try {
            const profile = await fetchMyProfile(userId);
            if (active) setProfile(profile);
          } catch {
            if (active) setProfile(null);
          } finally {
            resolve();
          }
        }, 0);
      });

    // All'avvio: NON spegnere `initializing` finché non abbiamo anche il profilo,
    // altrimenti per un istante isAuthenticated=true + isOnboarded=false → flash
    // di redirect a /registrazione prima di arrivare a /home.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (active) setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // P2: prima di aggiornare lo store, al logout si azzerano i dati locali
      // (la pulizia è sincrona e locale: nessuna chiamata Supabase nel lock).
      if (event === 'SIGNED_OUT') {
        // P5: la revoca SUBITA (refresh token revocato/scaduto, ban) non è più
        // un kick silenzioso: il redirect a /welcome lo fa già lo store, qui
        // si spiega cosa è successo. Il dialog appare solo se c'ERA una
        // sessione (mai su eventi spuri senza utente dentro).
        const volontario = consumaLogoutVolontario();
        const aveaSessione = !!useAuthStore.getState().session;
        pulisciDatiAccount();
        if (!volontario && aveaSessione) {
          avvisa('Sessione scaduta', 'Accedi di nuovo per continuare.');
        }
      }
      setSession(session);
      void loadProfile(session?.user.id);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [setSession, setProfile, setInitializing]);
}

export function useAuth() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const initializing = useAuthStore((s) => s.initializing);
  const setProfile = useAuthStore((s) => s.setProfile);
  const reset = useAuthStore((s) => s.reset);

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    setProfile(await fetchMyProfile(session.user.id));
  }, [session, setProfile]);

  const signOut = useCallback(async () => {
    // CM6: il token push va staccato PRIMA del signOut (la RPC richiede la
    // sessione). Best-effort e mai bloccante: se fallisce, register_device al
    // prossimo login riassegna comunque il token a chi accede.
    await rimuoviTokenPush();
    await doSignOut();
    reset();
  }, [reset]);

  return {
    session,
    profile,
    initializing,
    isAuthenticated: !!session,
    /** Profilo finalizzato: età verificata + invito redento. */
    isOnboarded: profile?.age_verified === true,
    refreshProfile,
    signOut,
  };
}
