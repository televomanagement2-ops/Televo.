// =============================================================================
// useContatti — consenso, sincronizzazione e revoca della rubrica (CM7, S11).
// =============================================================================
// Il consenso si legge da `consents` (RLS owner-only, grant select già live);
// la sync è una mutation che tiene il risultato in cache (contattiKeys.match);
// la revoca invalida il consenso e svuota i match. Lo stato amicizia per riga
// si deriva client-side dalle liste già in cache (useAmici/usePendingRequests):
// nessuna query per-riga.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { recordConsent } from '@/lib/auth';
import { revocaContatti, sincronizzaContatti, type ContattoMatch } from '@/lib/contatti';

// --- Query keys --------------------------------------------------------------
export const contattiKeys = {
  consenso: (uid: string) => ['contatti', uid, 'consenso'] as const,
  match: (uid: string) => ['contatti', uid, 'match'] as const,
};

/** Stato dell'azione mostrata accanto a un match (derivato dalle liste amici). */
export type StatoContatto = 'amico' | 'richiesta_inviata' | 'nessuno';

export interface ContattoArricchito extends ContattoMatch {
  stato: StatoContatto;
}

/** Il consenso 'contacts_sync' è attivo? (granted e non revocato) */
export function useConsensoContatti() {
  const { uid } = useAuth();

  return useQuery({
    queryKey: uid ? contattiKeys.consenso(uid) : ['contatti', 'anon', 'consenso'],
    enabled: !!uid,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('consents')
        .select('granted_at, revoked_at')
        .eq('user_id', uid as string)
        .eq('consent_type', 'contacts_sync')
        .maybeSingle();
      if (error) throw error;
      const row = data as unknown as { granted_at: string | null; revoked_at: string | null } | null;
      return !!row?.granted_at && !row.revoked_at;
    },
  });
}

/** Attiva il consenso (record_consent) e invalida lo stato. */
export function useAttivaContatti() {
  const queryClient = useQueryClient();
  const { uid } = useAuth();

  return useMutation({
    mutationFn: () => recordConsent('contacts_sync', true),
    onSuccess: async () => {
      if (uid) await queryClient.invalidateQueries({ queryKey: contattiKeys.consenso(uid) });
    },
  });
}

/** Sincronizza la rubrica (mio hash → email → hash → match) e cache i risultati. */
export function useSincronizzaContatti() {
  const queryClient = useQueryClient();
  const { session, uid } = useAuth();

  return useMutation({
    mutationFn: () => sincronizzaContatti(session?.user.email ?? null),
    onSuccess: (match) => {
      if (uid) queryClient.setQueryData(contattiKeys.match(uid), match);
    },
  });
}

/** I match dell'ultima sincronizzazione (riempiti dalla mutation). */
export function useMatchContatti() {
  const { uid } = useAuth();

  return useQuery<ContattoMatch[]>({
    queryKey: uid ? contattiKeys.match(uid) : ['contatti', 'anon', 'match'],
    // Nessun fetch automatico: i dati arrivano SOLO dalla sync esplicita
    // (la lettura della rubrica deve restare un gesto volontario dell'utente).
    enabled: false,
    queryFn: () => Promise.resolve([]),
  });
}

/** Revoca atomica: hash cancellati + consenso revocato → si riparte da zero. */
export function useRevocaContatti() {
  const queryClient = useQueryClient();
  const { uid } = useAuth();

  return useMutation({
    mutationFn: () => revocaContatti(),
    onSuccess: async () => {
      if (!uid) return;
      queryClient.removeQueries({ queryKey: contattiKeys.match(uid) });
      await queryClient.invalidateQueries({ queryKey: contattiKeys.consenso(uid) });
    },
  });
}
