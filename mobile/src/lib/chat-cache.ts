// =============================================================================
// chat-cache.ts — query key e manipolazione della cache React Query della chat.
// =============================================================================
// Estratto da useChat (CM2) perché serve anche FUORI dagli hook: il motore
// dell'outbox (lib/outbox.ts) scrive in cache al successo dell'invio. Le chiavi
// restano identiche a prima → nessuna invalidazione cambia comportamento.

import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { MessageRow, ReactionRow } from '@/types';
import type { ConversationView } from '@/lib/chat';

// --- Query keys ---------------------------------------------------------------
export const chatKeys = {
  conversations: (uid: string, view: ConversationView = 'active') =>
    ['chat', uid, 'conversations', view] as const,
  header: (convId: string) => ['chat', 'header', convId] as const,
  /** PREFISSO dei messaggi: la chiave reale include anche il cleared_at. */
  messages: (convId: string) => ['chat', 'messages', convId] as const,
  senders: (convId: string) => ['chat', 'senders', convId] as const,
  saved: (uid: string) => ['chat', uid, 'saved'] as const,
  /** Reazioni emoji della conversazione (CM4): lista piatta, raggruppata in UI. */
  reactions: (convId: string) => ['chat', 'reactions', convId] as const,
};

/** Prefisso per invalidare TUTTE le viste della lista conversazioni. */
export function conversationsPrefix(uid: string) {
  return ['chat', uid, 'conversations'] as const;
}

export type MessagesData = InfiniteData<MessageRow[], string | undefined>;

/**
 * Inserisce/aggiorna un messaggio nella cache infinita (dedup per id).
 * `chatKeys.messages(convId)` è un PREFISSO: setQueriesData copre ogni variante
 * di chiave (una per cleared_at — vedi useMessages).
 */
export function upsertMessage(queryClient: QueryClient, convId: string, msg: MessageRow) {
  queryClient.setQueriesData<MessagesData>({ queryKey: chatKeys.messages(convId) }, (old) => {
    if (!old) return old;
    const exists = old.pages.some((p) => p.some((m) => m.id === msg.id));
    if (exists) {
      return {
        ...old,
        pages: old.pages.map((p) => p.map((m) => (m.id === msg.id ? msg : m))),
      };
    }
    // Nuovo: in cima alla prima pagina (la più recente).
    const pages = old.pages.slice();
    pages[0] = [msg, ...(pages[0] ?? [])];
    return { ...old, pages };
  });
}

// --- Reazioni (CM4) -----------------------------------------------------------
// La cache è la lista piatta delle reazioni della conversazione; PK logica
// (message_id, user_id) → una insert dello stesso utente sullo stesso messaggio
// SOSTITUISCE la precedente (il DB fa delete+insert, il realtime può arrivare
// in qualsiasi ordine: l'upsert per PK rende l'operazione idempotente).

/** Inserisce/sostituisce una reazione nella cache della conversazione. */
export function setReactionInCache(queryClient: QueryClient, convId: string, row: ReactionRow) {
  queryClient.setQueryData<ReactionRow[]>(chatKeys.reactions(convId), (old) => {
    const rest = (old ?? []).filter(
      (r) => !(r.message_id === row.message_id && r.user_id === row.user_id),
    );
    return [...rest, row];
  });
}

/** Rimuove una reazione (per PK) dalla cache della conversazione. */
export function removeReactionFromCache(
  queryClient: QueryClient,
  convId: string,
  messageId: string,
  userId: string,
) {
  queryClient.setQueryData<ReactionRow[]>(chatKeys.reactions(convId), (old) =>
    old ? old.filter((r) => !(r.message_id === messageId && r.user_id === userId)) : old,
  );
}
