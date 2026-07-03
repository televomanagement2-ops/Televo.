// =============================================================================
// chat-realtime.ts — sottoscrizioni Supabase Realtime per la chat.
// =============================================================================
// postgres_changes su `messages` (nuovi/aggiornati nella conversazione aperta) e
// su `conversation_members` (last_read_at del peer → spunte live). La RLS filtra
// lato server cosa ricevo (solo le mie conversazioni). Richiede che le tabelle
// siano nella publication `supabase_realtime` (migrazione 20260701010000): finché
// non è pushata, gli eventi non arrivano e la UI ricade sul refetch on-focus.
// CM3: sul canale della conversazione viaggia anche il broadcast `typing`
// ("sta scrivendo…", RC-03) — effimero, nessuna persistenza.

import { supabase } from '@/lib/supabase';
import type { MessageRow } from '@/types';

export interface ConversationRealtimeHandlers {
  /** Nuovo messaggio inserito nella conversazione. */
  onInsert?: (m: MessageRow) => void;
  /** Messaggio aggiornato (edit / soft-delete). */
  onUpdate?: (m: MessageRow) => void;
  /** Un membro ha aggiornato il proprio stato (es. last_read_at → spunte). */
  onMemberUpdate?: () => void;
  /** Un altro membro sta scrivendo (CM3, RC-03 — evento broadcast effimero). */
  onTyping?: (userId: string) => void;
}

/** Sottoscrizione a una conversazione: cleanup + invio del segnale "sta scrivendo". */
export interface ConversationSubscription {
  cleanup: () => void;
  /** Emette l'evento typing sul canale (no-op finché il canale non è joined). */
  sendTyping: (userId: string) => void;
}
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

/**
 * Si iscrive agli eventi realtime di una conversazione (postgres_changes +
 * broadcast typing sullo STESSO canale: zero canali extra sul piano Free).
 * Sicura da chiamare in un useEffect (usare `cleanup` come teardown).
 *
 * Nota privacy (compromesso CM3, documentato nel piano chat): il topic broadcast
 * non è un canale privato Realtime — è raggiungibile solo conoscendo l'UUID
 * della conversazione (non indovinabile) e trasporta solo lo user_id di chi
 * digita. L'upgrade a canali privati (RLS su realtime.messages) è un
 * affinamento CM8, coerente col compromesso già accettato per last_active_at.
 */
export function subscribeConversation(
  convId: string,
  handlers: ConversationRealtimeHandlers,
): ConversationSubscription {
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
    .on('broadcast', { event: 'typing' }, (payload) => {
      const userId = (payload.payload as { user_id?: string } | undefined)?.user_id;
      if (userId) handlers.onTyping?.(userId);
    })
    .subscribe();

  return {
    cleanup: () => {
      void supabase.removeChannel(channel);
    },
    sendTyping: (userId: string) => {
      // Prima del join l'invio fallirebbe: evento effimero, si perde senza danni.
      if (channel.state !== 'joined') return;
      void channel
        .send({ type: 'broadcast', event: 'typing', payload: { user_id: userId } })
        .catch(() => {});
    },
  };
}
