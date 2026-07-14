// =============================================================================
// useNotificheTab — dati della tab Notifiche della bottombar (M13/P10, AH-1).
// =============================================================================
// Il ledger `notifications` è owner-only via RLS (`notifications_select_own` +
// `notifications_update_own` con grant per-colonna su read_at): il client legge
// DIRETTO e il mark-all-read è un singolo UPDATE — nessuna RPC (§7).
// Semantica dei tipi (coerente Instagram): la LISTA mostra tutto TRANNE
// 'message' (i DM vivono già nell'hub Messaggi); il mark-all-read copre TUTTE
// le righe, incluse le 'message' (che servono solo al push) — così l'unread
// del ledger resta coerente col campo `badge` calcolato dalla Edge send-push.

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { NotificationType } from '@/types/supabase';

export const NOTIFICHE_PAGE = 30;

/** Riga del ledger come la mostra la tab (payload = jsonb dei trigger). */
export interface NotificaRiga {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export const notificheKeys = {
  radice: (uid: string) => ['notifiche', uid] as const,
  list: (uid: string) => ['notifiche', uid, 'list'] as const,
  unread: (uid: string) => ['notifiche', uid, 'unread'] as const,
};

/** Cursore keyset (created_at desc, id desc): l'ultima riga della pagina. */
export interface CursoreNotifiche {
  created_at: string;
  id: string;
}

// Il keyset è COMPOSITO: enqueue_notification usa il now() di transazione,
// quindi righe accodate insieme (es. accettazione amicizia + badge sbloccato)
// condividono lo stesso created_at — l'id spareggia. I valori vanno quotati
// (l'ISO contiene ':' e '+', separatori della sintassi or di PostgREST).
async function fetchNotifichePage(cursore?: CursoreNotifiche): Promise<NotificaRiga[]> {
  let query = supabase
    .from('notifications')
    .select('id, type, title, body, payload, read_at, created_at')
    .neq('type', 'message')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(NOTIFICHE_PAGE);
  if (cursore) {
    query = query.or(
      `created_at.lt."${cursore.created_at}",and(created_at.eq."${cursore.created_at}",id.lt."${cursore.id}")`,
    );
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as NotificaRiga[];
}

/** Lista paginata del ledger (senza le 'message'), più recente in testa. */
export function useNotificheTab() {
  const { uid } = useAuth();
  return useInfiniteQuery({
    queryKey: uid ? notificheKeys.list(uid) : ['notifiche', 'anon', 'list'],
    enabled: !!uid,
    initialPageParam: undefined as CursoreNotifiche | undefined,
    queryFn: ({ pageParam }) => fetchNotifichePage(pageParam),
    getNextPageParam: (lastPage) => {
      const ultima = lastPage[lastPage.length - 1];
      return lastPage.length === NOTIFICHE_PAGE && ultima
        ? { created_at: ultima.created_at, id: ultima.id }
        : undefined;
    },
  });
}

async function fetchNotificheUnread(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .neq('type', 'message')
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Non lette del ledger SENZA le 'message' (badge tab Notifiche, §7 — gli
 * unread chat hanno già il loro badge sulla tab Messaggi). null = non ancora
 * caricato: i chiamanti non devono azzerare un badge esistente (stessa
 * semantica di useUnreadTotale).
 */
export function useNotificheUnread(): number | null {
  const { uid } = useAuth();
  const query = useQuery({
    queryKey: uid ? notificheKeys.unread(uid) : ['notifiche', 'anon', 'unread'],
    enabled: !!uid,
    queryFn: fetchNotificheUnread,
  });
  return query.data ?? null;
}

/**
 * Mark-all-read (apertura del tab): UN solo UPDATE su TUTTE le non lette
 * (incluse le 'message', vedi testata). Il badge si azzera OTTIMISTICAMENTE;
 * la lista in cache NON viene invalidata di proposito — i dot delle righe
 * appena viste restano visibili fino al prossimo refetch, niente flash (§7).
 */
export function useSegnaTutteLette() {
  const { uid } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Cast isolato: l'inferenza dei generici di postgrest-js non aggancia gli
      // Update ai tipi `Database` scritti a mano (come in lib/auth.ts).
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() } as never)
        .is('read_at', null);
      if (error) throw error;
    },
    onMutate: () => {
      if (uid) queryClient.setQueryData(notificheKeys.unread(uid), 0);
    },
    onError: () => {
      if (uid) void queryClient.invalidateQueries({ queryKey: notificheKeys.unread(uid) });
    },
  });
}
