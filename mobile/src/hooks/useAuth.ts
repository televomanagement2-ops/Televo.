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
import { fetchMyProfile, signOut as doSignOut } from '@/lib/auth';

export function useAuthListener(): void {
  const setSession = useAuthStore((s) => s.setSession);
  const setProfile = useAuthStore((s) => s.setProfile);
  const setInitializing = useAuthStore((s) => s.setInitializing);

  useEffect(() => {
    let active = true;

    const loadProfile = (userId: string | undefined) => {
      if (!userId) {
        setProfile(null);
        return;
      }
      // Differita: evita deadlock col lock di gotrue.
      setTimeout(async () => {
        try {
          const profile = await fetchMyProfile(userId);
          if (active) setProfile(profile);
        } catch {
          if (active) setProfile(null);
        }
      }, 0);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      loadProfile(data.session?.user.id);
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      loadProfile(session?.user.id);
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
