// =============================================================================
// ChatRuntime — servizi globali della shell autenticata (CM2 + CM6 + M6 + M7).
// =============================================================================
// Componente invisibile montato in (main)/_layout: rete (NetInfo→onlineManager),
// canale realtime globale dell'hub, flush dell'outbox alla riconnessione
// (useChatRuntime), i servizi push: handler foreground + token + badge icona
// (usePushRuntime) e tap sulla notifica → deep link (useNotificaTap), e da M6 il
// runtime del dominio Drops: flush dell'outbox drop + surface dei fallimenti
// (useDropRuntime). Unico punto di montaggio dei servizi globali autenticati.

import { useChatRuntime } from '@/hooks/useChat';
import { useNotificaTap, usePushRuntime } from '@/hooks/useNotifiche';
import { useDropRuntime } from '@/hooks/useDrops';
import { useCondivisionePosizioneRuntime } from '@/hooks/useCondivisionePosizione';

export function ChatRuntime() {
  useChatRuntime();
  usePushRuntime();
  useNotificaTap();
  useDropRuntime();
  // M7/MM6: watcher posizione (foreground + sessione attiva) → map_publish_location.
  useCondivisionePosizioneRuntime();
  return null;
}
