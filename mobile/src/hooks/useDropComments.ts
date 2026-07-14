// =============================================================================
// useDropComments — hook del dettaglio drop e dei commenti (S3, DM3).
// =============================================================================
// Il dettaglio (hero + statistiche private) via RPC `drop_detail`; i commenti
// via query diretta con RLS (autore embeddato). Realtime SOLO qui (a schermata
// aperta, RC-04): il canale per-drop sui commenti invalida la lista al bisogno.
// L'invio è ottimistico (outbox commenti, specchio della chat): testo subito,
// vocale upload-first. Nessun realtime su like/salvataggi (contatori privati).

import { useCallback, useEffect, useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  deleteDropComment,
  dropKeys,
  fetchDropComments,
  fetchDropDetail,
  fetchDropLikers,
} from '@/lib/drops';
import { removeCommentFromCache } from '@/lib/drops-comments-cache';
import {
  enqueueAudioComment,
  enqueueTextComment,
  retrySendComment,
} from '@/lib/drops-comments-outbox';
import { subscribeDropComments } from '@/lib/drops-realtime';
import { useDropStore } from '@/store/dropStore';
import type { DropCommentWithAuthor, DropFeedRow } from '@/types/supabase';

// --- Dettaglio (hero + statistiche private) ----------------------------------

/**
 * Il drop singolo (S3). Parte dalla riga già in cache del feed (render istantaneo
 * dell'hero) e la aggiorna con `drop_detail` (contatori freschi per l'autore).
 * `data === null` ⇒ drop scaduto o non visibile (schermata "non disponibile").
 */
export function useDropDetail(dropId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: dropKeys.detail(dropId),
    enabled: !!dropId,
    queryFn: () => fetchDropDetail(dropId),
    // Seed dal feed: la card è già stata letta (contatori solo se autore). Paint
    // istantaneo dell'hero; `initialDataUpdatedAt: 0` marca il seed come stale →
    // refetch al mount (contatori freschi per l'autore + scadenza rilevata).
    initialData: () => {
      const feed = queryClient.getQueryData<InfiniteData<DropFeedRow[]>>(dropKeys.feed());
      return feed?.pages.flat().find((r) => r.id === dropId);
    },
    initialDataUpdatedAt: 0,
    staleTime: 10_000,
  });
}

/** Chi ha messo like al mio drop (StatistichePrivate). Attivo SOLO per l'autore. */
export function useDropLikers(dropId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...dropKeys.detail(dropId), 'likers'] as const,
    enabled: enabled && !!dropId,
    queryFn: () => fetchDropLikers(dropId),
    staleTime: 10_000,
  });
}

// --- Commenti (lista piatta → albero a 1 livello in UI) ----------------------

/** Tutti i commenti del drop (asc). La RLS filtra: un non-amico non riceve nulla. */
export function useDropComments(dropId: string) {
  return useQuery({
    queryKey: dropKeys.comments(dropId),
    enabled: !!dropId,
    queryFn: () => fetchDropComments(dropId),
  });
}

/**
 * Realtime dei commenti a schermata aperta (RC-04): un canale per-drop
 * (INSERT/DELETE). Alla notifica invalida la lista (refetch RLS-filtrato: fonte
 * di verità, niente ricostruzioni fragili) e il dettaglio (comment_count autore).
 * Il canale si chiude all'unmount. Nessun realtime su feed/like/salvataggi (§6).
 */
export function useDropCommentsRealtime(dropId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!dropId) return;
    const cleanup = subscribeDropComments(dropId, {
      onInsert: () => {
        void queryClient.invalidateQueries({ queryKey: dropKeys.comments(dropId) });
        void queryClient.invalidateQueries({ queryKey: dropKeys.detail(dropId) });
      },
      onDelete: (id) => {
        // Rimozione immediata dalla cache (il refetch riconferma via RLS).
        removeCommentFromCache(queryClient, dropId, id);
        void queryClient.invalidateQueries({ queryKey: dropKeys.detail(dropId) });
      },
    });
    return cleanup;
  }, [dropId, queryClient]);
}

// --- Outbox commenti (invio ottimistico) -------------------------------------

/**
 * Coda d'invio dei commenti del drop: item pending/failed + azioni. Testo subito,
 * vocale upload-first (bolla pending immediata). Offline: resta pending, riparte
 * alla riconnessione (flush in useDropRuntime).
 */
export function useCommentOutbox(dropId: string) {
  const queryClient = useQueryClient();
  const { uid } = useAuth();
  const all = useDropStore((s) => s.commentOutbox);
  const items = useMemo(() => all.filter((o) => o.dropId === dropId), [all, dropId]);

  const sendText = useCallback(
    (body: string, parentId: string | null) => {
      if (uid) enqueueTextComment(queryClient, uid, { dropId, parentId, body });
    },
    [queryClient, uid, dropId],
  );
  const sendAudio = useCallback(
    (audioLocalUri: string, audioSeconds: number, parentId: string | null) => {
      if (uid) enqueueAudioComment(queryClient, uid, { dropId, parentId, audioLocalUri, audioSeconds });
    },
    [queryClient, uid, dropId],
  );
  const retry = useCallback(
    (tempId: string) => {
      if (uid) retrySendComment(queryClient, uid, tempId);
    },
    [queryClient, uid],
  );
  const discard = useCallback(
    (tempId: string) => useDropStore.getState().commentOutboxRemove(tempId),
    [],
  );

  return { items, sendText, sendAudio, retry, discard };
}

/** Elimina un commento (autore del commento O autore del drop). Ottimistico. */
export function useDeleteComment(dropId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => deleteDropComment(commentId),
    onMutate: (commentId) => {
      const snapshot = queryClient.getQueryData<DropCommentWithAuthor[]>(dropKeys.comments(dropId));
      removeCommentFromCache(queryClient, dropId, commentId);
      return { snapshot };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(dropKeys.comments(dropId), ctx.snapshot);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: dropKeys.detail(dropId) }),
  });
}
