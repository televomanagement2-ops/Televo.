// =============================================================================
// authStore — stato di autenticazione globale (Zustand).
// =============================================================================
// Fonte di verità per sessione + profilo dell'utente corrente. Popolato dal
// listener in useAuthListener(); le schermate leggono di qui (selettori).
// `initializing` resta true finché non abbiamo il primo esito di getSession:
// serve a evitare flash di redirect prima di sapere se c'è una sessione.

import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { ProfileRow } from '@/types';

interface AuthState {
  session: Session | null;
  profile: ProfileRow | null;
  initializing: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: ProfileRow | null) => void;
  setInitializing: (initializing: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  initializing: true,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setInitializing: (initializing) => set({ initializing }),
  reset: () => set({ session: null, profile: null }),
}));
