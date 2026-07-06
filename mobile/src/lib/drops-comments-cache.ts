// =============================================================================
// drops-comments-cache.ts — manipolazione della cache React Query dei commenti.
// =============================================================================
// La lista commenti di un drop vive sotto `dropKeys.comments(dropId)` come array
// PIATTO ordinato per created_at asc (la UI ne costruisce l'albero a 1 livello).
// Estratto in un modulo dedicato — come chat-cache — perché serve anche fuori
// dagli hook: il motore dell'outbox commenti scrive qui al successo dell'invio.

import type { QueryClient } from '@tanstack/react-query';
import { dropKeys } from '@/lib/drops';
import type { DropCommentWithAuthor } from '@/types/supabase';

/** Inserisce/aggiorna un commento nella cache (dedup per id, riordino asc). */
export function upsertComment(
  queryClient: QueryClient,
  dropId: string,
  row: DropCommentWithAuthor,
): void {
  queryClient.setQueryData<DropCommentWithAuthor[]>(dropKeys.comments(dropId), (old) => {
    const rest = (old ?? []).filter((c) => c.id !== row.id);
    return [...rest, row].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  });
}

/**
 * Rimuove un commento (e le sue reply) dalla cache. La cancellazione di un
 * top-level porta via le reply via FK cascade lato server: qui le togliamo
 * subito per un feedback immediato (i singoli DELETE realtime arriveranno poi,
 * no-op perché già assenti).
 */
export function removeCommentFromCache(
  queryClient: QueryClient,
  dropId: string,
  commentId: string,
): void {
  queryClient.setQueryData<DropCommentWithAuthor[]>(dropKeys.comments(dropId), (old) =>
    old ? old.filter((c) => c.id !== commentId && c.parent_id !== commentId) : old,
  );
}
