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
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { consumaLogoutVolontario, fetchMyProfile, signOut as doSignOut } from '@/lib/auth';
import { avvisa } from '@/lib/dialoghi';
import { rimuoviTokenPush } from '@/lib/expo-push';
import {
  leggiIdentitaLocale,
  rimuoviIdentitaLocale,
  salvaIdentitaLocale,
} from '@/lib/identita-locale';
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
  const setUidOffline = useAuthStore((s) => s.setUidOffline);

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
            if (active) {
              setProfile(profile);
              // V1: il profilo onboardato è la verità che il boot offline
              // riusa per instradare senza rete (uid per le queryKey della
              // cache P2 + flag per non finire su /registrazione).
              if (profile?.age_verified === true) {
                salvaIdentitaLocale({ uid: userId, onboarded: true });
              }
            }
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
      if (!data.session) {
        // V1: con l'access token scaduto e zero rete auth-js risponde
        // `session: null` LASCIANDO la sessione (refresh token valido) su
        // disco — un falso logout. Se l'installazione conosce un utente
        // onboardato e il device è davvero offline, si entra in shell in
        // modalità offline: cache persistita a schermo, query in pausa; al
        // ritorno online l'auto-refresh rianima la sessione da solo.
        // NetInfo.fetch() e non onlineManager: al primissimo tick del boot
        // l'onlineManager può non aver ancora ricevuto lo stato reale.
        const identita = leggiIdentitaLocale();
        if (identita?.onboarded) {
          const stato = await NetInfo.fetch().catch(() => null);
          const offline = stato != null && !(!!stato.isConnected && stato.isInternetReachable !== false);
          if (active && offline) setUidOffline(identita.uid);
        }
      }
      await loadProfile(data.session?.user.id);
      if (active) setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // P2: prima di aggiornare lo store, al logout si azzerano i dati locali
      // (la pulizia è sincrona e locale: nessuna chiamata Supabase nel lock).
      if (event === 'SIGNED_OUT') {
        const volontario = consumaLogoutVolontario();
        // V1: una revoca non si può ACCERTARE senza rete — un SIGNED_OUT
        // subìto offline è transitorio (al ritorno online o il refresh
        // riesce, o la revoca vera arriva qui di nuovo, stavolta online).
        // Ignorarlo preserva sessione in store e cache su disco.
        if (!volontario && !onlineManager.isOnline()) return;
        // P5: la revoca SUBITA (refresh token revocato/scaduto, ban) non è più
        // un kick silenzioso: il redirect a /welcome lo fa già lo store, qui
        // si spiega cosa è successo. Il dialog appare solo se c'ERA una
        // sessione (mai su eventi spuri senza utente dentro).
        const aveaSessione = !!useAuthStore.getState().session;
        rimuoviIdentitaLocale();
        pulisciDatiAccount();
        if (!volontario && aveaSessione) {
          avvisa('Sessione scaduta', 'Accedi di nuovo per continuare.');
        }
        setUidOffline(null);
      } else if (session) {
        // Sessione vera (SIGNED_IN / TOKEN_REFRESHED / INITIAL_SESSION piena):
        // la modalità offline V1 finisce qui.
        setUidOffline(null);
      }
      setSession(session);
      void loadProfile(session?.user.id);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [setSession, setProfile, setInitializing, setUidOffline]);
}

export function useAuth() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const initializing = useAuthStore((s) => s.initializing);
  const uidOffline = useAuthStore((s) => s.uidOffline);
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

  // V1: l'uid vale anche in modalità offline (stesse queryKey → la cache
  // persistita P2 si mostra). È QUESTO, non session.user.id, ciò che gli hook
  // dati devono usare.
  const uid = session?.user.id ?? uidOffline ?? undefined;

  // V1: profilo non (ancora) leggibile ma l'ultima verità locale dice che
  // QUESTO utente era onboardato → niente redirect a /registrazione (né
  // offline né nel lampo tra sessione e profilo).
  const identita = leggiIdentitaLocale();
  const onboardedNoto = profile == null && uid != null && identita?.uid === uid && identita.onboarded;

  return {
    session,
    profile,
    initializing,
    uid,
    isAuthenticated: !!session || !!uidOffline,
    /** Profilo finalizzato: età verificata + invito redento. */
    isOnboarded: profile?.age_verified === true || onboardedNoto,
    refreshProfile,
    signOut,
  };
}
