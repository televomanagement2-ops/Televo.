// =============================================================================
// notifiche-realtime — INSERT del ledger `notifications` in tempo reale (M14R2/F5).
// =============================================================================
// Il badge della campanella (P10) nasce da una query unread: senza un segnale
// il client non sa QUANDO rinfrescarla — l'invalidazione legata alla push in
// foreground non copre i permessi negati né le push non consegnate. Stesso
// pattern del canale globale della chat (subscribeMessagesAll): postgres_changes
// sugli INSERT, con la RLS owner-only di `notifications` come filtro di
// sicurezza server-side (il filter user_id è solo una riduzione di traffico).

import { supabase } from '@/lib/supabase';

/**
 * Si iscrive agli INSERT delle MIE notifiche; `onInsert` è pensata per
 * invalidare badge e lista della tab (i dati veri li rilegge la query).
 * Ritorna l'unsubscribe (sicura da usare come teardown di un useEffect).
 */
export function subscribeNotificheAll(uid: string, onInsert: () => void): () => void {
  const channel = supabase
    .channel('notifiche:hub')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
      () => onInsert(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
