// =============================================================================
// useProfilo — dati del profilo proprio + mutazione di modifica.
// =============================================================================
// Letture via RLS (il profilo proprio è sempre visibile a sé). La modifica scrive
// SOLO le colonne con GRANT update su `profiles` (display_name, status_text,
// username, avatar_url + i toggle privacy chat show_last_seen/show_read_receipts):
// i campi di sistema (aura_*, age_verified, school_id) NON sono toccabili dal client. Al salvataggio invalidiamo le query e ricarichiamo
// il profilo in authStore (così l'header/menu si aggiornano subito).

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchMyProfile } from '@/lib/auth';
import { useAuth } from '@/hooks/useAuth';
import type { ProfileRow } from '@/types';

// --- Query keys (namespacing per utente) -------------------------------------
export const profiloKeys = {
  me: (uid: string) => ['profilo', uid] as const,
  friendCount: (uid: string) => ['profilo', uid, 'friend-count'] as const,
  dropCount: (uid: string) => ['profilo', uid, 'drop-count'] as const,
  topFriends: (uid: string) => ['profilo', uid, 'top-friends'] as const,
};

// --- Profilo proprio ---------------------------------------------------------

/** Il profilo dell'utente loggato (parte dalla cache di authStore, poi rivalida). */
export function useMyProfile() {
  const { session, profile } = useAuth();
  const uid = session?.user.id;

  return useQuery({
    queryKey: uid ? profiloKeys.me(uid) : ['profilo', 'anon'],
    queryFn: () => fetchMyProfile(uid as string),
    enabled: !!uid,
    initialData: profile ?? undefined,
  });
}

/** Campi modificabili dall'utente (sottoinsieme col GRANT update). */
export interface ProfilePatch {
  display_name?: string | null;
  status_text?: string | null;
  username?: string;
  avatar_url?: string | null;
  /** Toggle privacy chat (S10, CM3) — grant per-colonna già live a DB. */
  show_last_seen?: boolean;
  show_read_receipts?: boolean;
}

/** Aggiorna il profilo proprio; invalida le query e ricarica authStore. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { session, refreshProfile } = useAuth();
  const uid = session?.user.id;

  return useMutation({
    mutationFn: async (patch: ProfilePatch): Promise<ProfileRow> => {
      if (!uid) throw new Error('not_authenticated');
      const { data, error } = await supabase
        .from('profiles')
        // Cast isolato: l'inferenza dei generici di postgrest-js non aggancia gli
        // Update ai tipi `Database` scritti a mano (come in lib/auth.ts).
        .update(patch as never)
        .eq('id', uid)
        .select('*')
        .single();
      if (error) throw error;
      return data as ProfileRow;
    },
    onSuccess: async () => {
      if (uid) await queryClient.invalidateQueries({ queryKey: profiloKeys.me(uid) });
      await refreshProfile();
    },
  });
}

// --- Conteggi sociali (niente follower: amicizia mutua) ----------------------

/**
 * Numero di amici (amicizie accettate). La coppia è normalizzata (una sola riga
 * per coppia, user_id < friend_id) quindi l'utente può comparire come `user_id`
 * O come `friend_id`: contiamo entrambe le posizioni con un filtro OR.
 */
export function useFriendCount(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? profiloKeys.friendCount(userId) : ['profilo', 'anon', 'friend-count'],
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Numero di drop ATTIVI (non scaduti) dell'utente: i drop scadono a 24h. */
export function useDropCount(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? profiloKeys.dropCount(userId) : ['profilo', 'anon', 'drop-count'],
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('drops')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', userId as string)
        .gt('expires_at', new Date().toISOString());
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// --- Cerchia stretta (top friends, sola lettura) -----------------------------

export interface TopFriend {
  position: number;
  friendId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * La cerchia stretta dell'utente (1–8), con i dati del profilo amico, ordinata
 * per posizione. Sola lettura qui (la gestione/riordino è M5). Il FK
 * top_friends.friend_id → profiles è auto-nominato `top_friends_friend_id_fkey`.
 */
export function useTopFriends(userId: string | undefined) {
  return useQuery({
    queryKey: userId ? profiloKeys.topFriends(userId) : ['profilo', 'anon', 'top-friends'],
    enabled: !!userId,
    queryFn: async (): Promise<TopFriend[]> => {
      const { data, error } = await supabase
        .from('top_friends')
        .select(
          'position, friend_id, friend:profiles!top_friends_friend_id_fkey(username, display_name, avatar_url)',
        )
        .eq('user_id', userId as string)
        .order('position', { ascending: true });
      if (error) throw error;

      type RowShape = {
        position: number;
        friend_id: string;
        friend: { username: string; display_name: string | null; avatar_url: string | null } | null;
      };
      return ((data ?? []) as unknown as RowShape[]).map((r) => ({
        position: r.position,
        friendId: r.friend_id,
        username: r.friend?.username ?? '',
        displayName: r.friend?.display_name ?? null,
        avatarUrl: r.friend?.avatar_url ?? null,
      }));
    },
  });
}

// --- Helper comodo per le schermate ------------------------------------------

/** Invalidatore manuale (es. dopo upload avatar) del profilo proprio. */
export function useInvalidateProfilo() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  return useCallback(() => {
    if (uid) queryClient.invalidateQueries({ queryKey: profiloKeys.me(uid) });
  }, [queryClient, uid]);
}
