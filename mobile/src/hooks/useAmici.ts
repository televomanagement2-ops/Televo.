// =============================================================================
// useAmici — amicizie: lista amici, richieste pendenti, relazione con un utente,
// ricerca, e le mutazioni (richiedi/accetta/rimuovi/blocca/sblocca) + apri DM.
// =============================================================================
// Letture via RLS, mutazioni via RPC (vedi lib/social.ts). Le query key sono
// namespacizzate per utente come in useProfilo. Ogni mutazione invalida le liste
// coinvolte + il conteggio amici del profilo (profiloKeys.friendCount).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { profiloKeys } from '@/hooks/useProfilo';
import {
  acceptFriendRequest,
  blockUser,
  fetchBlockedUsers,
  fetchProfileCard,
  fetchProfileCards,
  openDm,
  removeFriend,
  searchProfiles,
  sendFriendRequest,
  unblockUser,
} from '@/lib/social';
import type { ProfileCard } from '@/types';

// --- Query keys --------------------------------------------------------------
export const amiciKeys = {
  list: (uid: string) => ['amici', uid, 'list'] as const,
  pending: (uid: string) => ['amici', uid, 'pending'] as const,
  relazione: (uid: string, other: string) => ['amici', uid, 'rel', other] as const,
  ricerca: (term: string) => ['amici', 'search', term] as const,
  bloccati: (uid: string) => ['amici', uid, 'bloccati'] as const,
};

/** Stato della relazione con un altro utente (per la schermata profilo altrui). */
export type Relazione =
  | 'none' // nessuna relazione
  | 'pending_out' // ho inviato io, in attesa
  | 'pending_in' // l'ha inviata l'altro, posso accettare
  | 'accepted' // amici
  | 'blocked_by_me' // l'ho bloccato io
  | 'blocked_by_them'; // mi ha bloccato

// --- Liste -------------------------------------------------------------------

/** Gli amici accettati (card profilo), per la schermata Amici. */
export function useAmici() {
  const { uid } = useAuth();

  return useQuery({
    queryKey: uid ? amiciKeys.list(uid) : ['amici', 'anon', 'list'],
    enabled: !!uid,
    queryFn: async (): Promise<ProfileCard[]> => {
      const { data, error } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .eq('status', 'accepted')
        .or(`user_id.eq.${uid},friend_id.eq.${uid}`);
      if (error) throw error;
      // Cast isolato: postgrest-js non aggancia i select a colonne sui tipi a mano.
      const rows = (data ?? []) as unknown as { user_id: string; friend_id: string }[];
      const ids = rows.map((r) => (r.user_id === uid ? r.friend_id : r.user_id));
      const cards = await fetchProfileCards(ids);
      return ids.map((id) => cards.get(id)).filter((c): c is ProfileCard => !!c);
    },
  });
}

export interface RichiestePendenti {
  /** Richieste ricevute (posso accettarle). */
  incoming: ProfileCard[];
  /** Richieste inviate da me (in attesa). */
  outgoing: ProfileCard[];
}

/** Richieste di amicizia pendenti (in entrata e in uscita). */
export function usePendingRequests() {
  const { uid } = useAuth();

  return useQuery({
    queryKey: uid ? amiciKeys.pending(uid) : ['amici', 'anon', 'pending'],
    enabled: !!uid,
    queryFn: async (): Promise<RichiestePendenti> => {
      const { data, error } = await supabase
        .from('friendships')
        .select('user_id, friend_id, requested_by')
        .eq('status', 'pending')
        .or(`user_id.eq.${uid},friend_id.eq.${uid}`);
      if (error) throw error;

      const rows = (data ?? []) as unknown as {
        user_id: string;
        friend_id: string;
        requested_by: string;
      }[];
      const incomingIds: string[] = [];
      const outgoingIds: string[] = [];
      for (const r of rows) {
        const other = r.user_id === uid ? r.friend_id : r.user_id;
        if (r.requested_by === uid) outgoingIds.push(other);
        else incomingIds.push(other);
      }
      const cards = await fetchProfileCards([...incomingIds, ...outgoingIds]);
      const pick = (ids: string[]) =>
        ids.map((id) => cards.get(id)).filter((c): c is ProfileCard => !!c);
      return { incoming: pick(incomingIds), outgoing: pick(outgoingIds) };
    },
  });
}

/** Gli utenti che ho bloccato io (lista "Utenti bloccati" in S10, CM8). */
export function useBloccati() {
  const { uid } = useAuth();

  return useQuery({
    queryKey: uid ? amiciKeys.bloccati(uid) : ['amici', 'anon', 'bloccati'],
    enabled: !!uid,
    queryFn: () => fetchBlockedUsers(uid as string),
  });
}

/** Ricerca utenti per username/nome (min 2 caratteri). */
export function useSearchUsers(term: string) {
  const { uid } = useAuth();
  const enabled = !!uid && term.trim().length >= 2;

  return useQuery({
    queryKey: amiciKeys.ricerca(term.trim()),
    enabled,
    queryFn: () => searchProfiles(term, uid as string),
  });
}

/** La relazione con un utente specifico (per il profilo altrui). */
export function useRelazione(otherId: string | undefined) {
  const { uid } = useAuth();
  const enabled = !!uid && !!otherId && otherId !== uid;

  return useQuery({
    queryKey: uid && otherId ? amiciKeys.relazione(uid, otherId) : ['amici', 'anon', 'rel'],
    enabled,
    queryFn: async (): Promise<Relazione> => {
      const { data, error } = await supabase
        .from('friendships')
        .select('status, requested_by, blocked_by')
        .or(
          `and(user_id.eq.${uid},friend_id.eq.${otherId}),and(user_id.eq.${otherId},friend_id.eq.${uid})`,
        )
        .maybeSingle();
      if (error) throw error;
      const row = data as unknown as {
        status: 'pending' | 'accepted' | 'blocked';
        requested_by: string;
        blocked_by: string | null;
      } | null;
      if (!row) return 'none';
      if (row.status === 'accepted') return 'accepted';
      if (row.status === 'pending') {
        return row.requested_by === uid ? 'pending_out' : 'pending_in';
      }
      // blocked
      return row.blocked_by === uid ? 'blocked_by_me' : 'blocked_by_them';
    },
  });
}

// --- Mutazioni ---------------------------------------------------------------

/** Invalida tutte le viste amicizia dopo una mutazione. */
function useInvalidateAmici() {
  const queryClient = useQueryClient();
  const { uid } = useAuth();
  return async () => {
    if (!uid) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: amiciKeys.list(uid) }),
      queryClient.invalidateQueries({ queryKey: amiciKeys.pending(uid) }),
      queryClient.invalidateQueries({ queryKey: ['amici', uid, 'rel'] }),
      queryClient.invalidateQueries({ queryKey: amiciKeys.bloccati(uid) }),
      queryClient.invalidateQueries({ queryKey: profiloKeys.friendCount(uid) }),
    ]);
  };
}

/** Le azioni sociali come mutazioni (throw + invalidate), pronte per la UI. */
export function useAzioniAmicizia() {
  const invalidate = useInvalidateAmici();
  const opts = { onSuccess: invalidate } as const;

  return {
    richiedi: useMutation({ mutationFn: (id: string) => sendFriendRequest(id), ...opts }),
    accetta: useMutation({ mutationFn: (id: string) => acceptFriendRequest(id), ...opts }),
    rimuovi: useMutation({ mutationFn: (id: string) => removeFriend(id), ...opts }),
    blocca: useMutation({ mutationFn: (id: string) => blockUser(id), ...opts }),
    sblocca: useMutation({ mutationFn: (id: string) => unblockUser(id), ...opts }),
  };
}

/** Apre (o crea) la DM con un utente e restituisce il conversation_id. */
export function useApriDm() {
  return useMutation({ mutationFn: (otherId: string) => openDm(otherId) });
}

/** Card di un profilo altrui (per la schermata profilo/[id]). */
export function useProfiloCard(id: string | undefined) {
  return useQuery({
    queryKey: ['profilo-card', id ?? 'anon'],
    enabled: !!id,
    queryFn: () => fetchProfileCard(id as string),
  });
}
