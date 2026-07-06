// =============================================================================
// useDropShare — condivisione di un drop in chat (DM5): inoltro + risposta privata.
// =============================================================================
// Due azioni del menu ⋯ del drop (S6), condivise da feed (S1) e dettaglio (S3):
//  · `inoltra(dropId)`  → sceglie la destinazione nel picker (chat/inoltra) e vi
//    scrive un messaggio-RIFERIMENTO (drop_ref), mai una copia (R-08);
//  · `rispondiInPrivato(row)` → apre (o crea) la DM con l'autore e precompila il
//    riferimento nel composer: il prossimo messaggio lo porta con sé (§16.1).
// La visibilità non si estende MAI: il trigger esige can_see_drop del mittente e
// il lettore risolve la bolla con la SUA di RLS.

import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useApriDm } from '@/hooks/useAmici';
import { useChatStore } from '@/store/chatStore';
import { avvisa } from '@/lib/dialoghi';
import { chatErrorMessage } from '@/lib/errors';
import { dynamicRoutes, ROUTES } from '@/constants/routes';
import type { DropFeedRow } from '@/types/supabase';

export function useDropShare() {
  const router = useRouter();
  const setForwardDropRef = useChatStore((s) => s.setForwardDropRef);
  const setPendingDropRef = useChatStore((s) => s.setPendingDropRef);
  const apriDm = useApriDm();

  // Inoltra: il picker legge forwardDropRef dallo store (niente id in URL).
  const inoltra = useCallback(
    (dropId: string) => {
      setForwardDropRef(dropId);
      router.push(ROUTES.chatInoltra);
    },
    [router, setForwardDropRef],
  );

  // Rispondi in privato: get_or_create_dm con l'autore, poi precompila il drop
  // nel composer di quella DM e naviga. La DM esiste solo tra amici (garantito:
  // se vedo il drop sono amico dell'autore) → openDm non fallisce per permessi.
  const rispondiInPrivato = useCallback(
    (row: DropFeedRow) => {
      apriDm.mutate(row.author_id, {
        onSuccess: (convId) => {
          setPendingDropRef(convId, row.id);
          router.push(dynamicRoutes.chat(convId));
        },
        onError: (e) => avvisa('Ops', chatErrorMessage(e)),
      });
    },
    [apriDm, router, setPendingDropRef],
  );

  return { inoltra, rispondiInPrivato };
}
