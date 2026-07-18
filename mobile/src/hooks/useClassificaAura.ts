// =============================================================================
// useClassificaAura — data layer della Classifica Aura (M16 / AC3).
// =============================================================================
// UNA porta di lettura: la RPC `aura_leaderboard()` (classifica.md §13.2) —
// partecipanti = io + i miei amici accettati, filtrati server-side (opt-out
// reciproco AC-2: il client non calcola MAI un rank da solo). Il dato è
// naturalmente GIORNALIERO (ricalcolo Aura 03:00 UTC): niente realtime, la
// freschezza è remount/pull-to-refresh — che raccolgono variazioni di
// COMPOSIZIONE (nuovi amici, opt-in/out), non di punteggio (§2.4).
//
// Il flag `show_in_leaderboard` è FUORI dal grant SELECT (anti-enumerazione
// §13.1): l'update va fatto SENZA .select() (return=minimal) e lo stato
// proprio si legge SOLO da `listed` nell'envelope.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { callRpc } from '@/lib/rpc';
import { useAuth } from '@/hooks/useAuth';
import { auraKeys } from '@/hooks/useAura';
import type { ClassificaAuraEnvelope } from '@/types/supabase';

/** L'envelope della classifica (refetch al remount del tab se stale). */
export function useClassificaAura() {
  const { uid } = useAuth();

  return useQuery({
    queryKey: uid ? auraKeys.classifica(uid) : ['aura', 'anon', 'classifica'],
    enabled: !!uid,
    queryFn: () => callRpc<ClassificaAuraEnvelope>('aura_leaderboard', {}),
    // Il punteggio cambia una volta al giorno: 60s di staleTime bastano a
    // evitare refetch a raffica nel tab-switching, senza nascondere gli
    // opt-in/out degli amici troppo a lungo.
    staleTime: 60_000,
  });
}

/**
 * Flip di `show_in_leaderboard` (menu ⋮ e CTA «Rientra in classifica»).
 * Ottimistica SOLO su `listed`: le righe vere arrivano dal refetch (quando si
 * rientra l'envelope in cache è quello corto — il container mostra il loader
 * finché l'invalidazione non riporta le righe).
 */
export function useClassificaVisibile() {
  const { uid } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mostra: boolean) => {
      // Cast isolato: l'inferenza di postgrest-js non aggancia gli Update ai
      // tipi `Database` scritti a mano (pattern lib/auth.ts).
      const { error } = await supabase
        .from('profiles')
        .update({ show_in_leaderboard: mostra } as never)
        .eq('id', uid as string);
      if (error) throw error;
    },
    onMutate: async (mostra) => {
      if (!uid) return {};
      const key = auraKeys.classifica(uid);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ClassificaAuraEnvelope>(key);
      if (prev) {
        queryClient.setQueryData<ClassificaAuraEnvelope>(key, { ...prev, listed: mostra });
      }
      return { prev };
    },
    onError: (_err, _mostra, ctx) => {
      if (uid && ctx?.prev) queryClient.setQueryData(auraKeys.classifica(uid), ctx.prev);
    },
    onSettled: () => {
      if (uid) void queryClient.invalidateQueries({ queryKey: auraKeys.classifica(uid) });
    },
  });
}
