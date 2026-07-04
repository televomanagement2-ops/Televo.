// =============================================================================
// ChatRuntime — servizi chat globali della shell autenticata (CM2 + CM6).
// =============================================================================
// Componente invisibile montato in (main)/_layout: rete (NetInfo→onlineManager),
// canale realtime globale dell'hub, flush dell'outbox alla riconnessione
// (useChatRuntime) e, da CM6, i servizi push: handler foreground + token +
// badge icona (usePushRuntime) e tap sulla notifica → deep link (useNotificaTap).

import { useChatRuntime } from '@/hooks/useChat';
import { useNotificaTap, usePushRuntime } from '@/hooks/useNotifiche';

export function ChatRuntime() {
  useChatRuntime();
  usePushRuntime();
  useNotificaTap();
  return null;
}
