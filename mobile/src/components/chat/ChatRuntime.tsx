// =============================================================================
// ChatRuntime — servizi chat globali della shell autenticata (CM2).
// =============================================================================
// Componente invisibile montato in (main)/_layout: rete (NetInfo→onlineManager),
// canale realtime globale dell'hub e flush dell'outbox alla riconnessione.
// Tutta la logica vive in useChatRuntime (hooks/useChat).

import { useChatRuntime } from '@/hooks/useChat';

export function ChatRuntime() {
  useChatRuntime();
  return null;
}
