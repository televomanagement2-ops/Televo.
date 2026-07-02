// =============================================================================
// chat-realtime.ts — sottoscrizioni Supabase Realtime per la chat.
// =============================================================================
// postgres_changes su `messages` (nuovi/aggiornati nella conversazione aperta) e
// su `conversation_members` (last_read_at del peer → spunte live). La RLS filtra
// lato server cosa ricevo (solo le mie conversazioni). Richiede che le tabelle
// siano nella publication `supabase_realtime` (migrazione 20260701010000): finché
// non è pushata, gli eventi non arrivano e la UI ricade sul refetch on-focus.

import { supabase } from '@/lib/supabase';
import type { MessageRow } from '@/types';

export interface ConversationRealtimeHandlers {
  /** Nuovo messaggio inserito nella conversazione. */
  onInsert?: (m: MessageRow) => void;
  /** Messaggio aggiornato (edit / soft-delete). */
  onUpdate?: (m: MessageRow) => void;
  /** Un membro ha aggiornato il proprio stato (es. last_read_at → spunte). */
  onMemberUpdate?: () => void;
}

/**
 * Si iscrive agli eventi realtime di una conversazione. Restituisce la funzione
 * di cleanup (rimuove il canale). Sicura da chiamare in un useEffect.
 */
/**
 * Canale GLOBALE dell'hub (CM2, §8.5): un solo canale per tutta la shell, su
 * TUTTI gli INSERT di `messages` visibili all'utente (la RLS filtra lato server
 * le conversazioni di cui non è membro). Aggiorna lista chat e badge tab senza
 * aprire la conversazione. Restituisce la funzione di cleanup.
 */
export function subscribeMessagesAll(onInsert: (m: MessageRow) => void): () => void {
  const channel = supabase
    .channel('chat:hub')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => onInsert(payload.new as MessageRow),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeConversation(
  convId: string,
  handlers: ConversationRealtimeHandlers,
): () => void {
  const filter = `conversation_id=eq.${convId}`;
  const channel = supabase
    .channel(`chat:${convId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter },
      (payload) => handlers.onInsert?.(payload.new as MessageRow),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter },
      (payload) => handlers.onUpdate?.(payload.new as MessageRow),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter },
      () => handlers.onMemberUpdate?.(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
