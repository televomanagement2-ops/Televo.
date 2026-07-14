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
  /**
   * M14/V1 — modalità offline: uid dell'utente noto quando `getSession()` non
   * può rinnovare il token (zero rete) ma la sessione su disco è viva. Le
   * queryKey restano quelle giuste e la shell mostra la cache persistita.
   * Si azzera appena arriva una sessione vera (o a un SIGNED_OUT online).
   */
  uidOffline: string | null;
  setSession: (session: Session | null) => void;
  setProfile: (profile: ProfileRow | null) => void;
  setInitializing: (initializing: boolean) => void;
  setUidOffline: (uid: string | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  initializing: true,
  uidOffline: null,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setInitializing: (initializing) => set({ initializing }),
  setUidOffline: (uidOffline) => set({ uidOffline }),
  reset: () => set({ session: null, profile: null, uidOffline: null }),
}));
