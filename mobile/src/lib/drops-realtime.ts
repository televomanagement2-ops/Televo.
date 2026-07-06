// =============================================================================
// drops-realtime.ts — sottoscrizione Supabase Realtime del dettaglio drop (S3).
// =============================================================================
// Specchio minimale di `subscribeConversation` (chat), ristretto a ciò che il
// dettaglio drop richiede: postgres_changes su `drop_comments` filtrato per
// drop (`drop_id=eq.X`), eventi INSERT e DELETE. La RLS lato server filtra i
// sottoscrittori (solo chi vede il drop riceve). Il feed (S1) NON ha realtime
// (scelta anti-doomscroll §6): questo canale vive SOLO a schermata aperta
// (mount/unmount con S3, RC-04). Nota da CM4: il payload DELETE porta solo la
// PK (nessun contenuto) — qui basta il segnale per rileggere la lista via RLS.

import { supabase } from '@/lib/supabase';
import type { DropCommentRow } from '@/types';

export interface DropCommentsHandlers {
  /** Nuovo commento inserito su questo drop (payload = riga grezza, senza autore). */
  onInsert?: (row: DropCommentRow) => void;
  /** Commento rimosso: il payload DELETE porta solo la PK (id). */
  onDelete?: (id: string) => void;
}

/**
 * Si iscrive ai commenti di UN drop. Sicura in un useEffect: usare la funzione
 * di cleanup restituita come teardown (chiude il canale all'unmount di S3).
 */
export function subscribeDropComments(
  dropId: string,
  handlers: DropCommentsHandlers,
): () => void {
  const filter = `drop_id=eq.${dropId}`;
  const channel = supabase
    .channel(`drop:${dropId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'drop_comments', filter },
      (payload) => handlers.onInsert?.(payload.new as DropCommentRow),
    )
    // Il DELETE non è filtrabile da Realtime (nessuna RLS/filtro sui delete) e il
    // payload `old` porta solo la PK: lo scoping è client-side (un id non in
    // cache è un no-op innocuo), come per le reazioni chat.
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'drop_comments' },
      (payload) => {
        const old = payload.old as { id?: string } | undefined;
        if (old?.id) handlers.onDelete?.(old.id);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
