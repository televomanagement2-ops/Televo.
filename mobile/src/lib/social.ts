// =============================================================================
// social.ts — amicizie a mutuo consenso + ricerca utenti + apertura DM.
// =============================================================================
// Tutte le mutazioni delicate passano dalle RPC SECURITY DEFINER del backend
// (send/accept/remove_friend, block/unblock_user, get_or_create_dm): il client
// NON scrive mai direttamente `friendships`/`conversations`. Le letture (lista
// amici, ricerca) vanno via RLS. La coppia in `friendships` è NORMALIZZATA
// (user_id < friend_id): una sola riga simmetrica per coppia.

import { supabase } from '@/lib/supabase';
import { callRpc } from '@/lib/rpc';
import type { ProfileCard } from '@/types';

// --- Mutazioni via RPC -------------------------------------------------------

/** Invia una richiesta di amicizia (o accetta la reciproca, idempotente). */
export const sendFriendRequest = (target: string) =>
  callRpc('send_friend_request', { p_target: target });

/** Accetta una richiesta di amicizia in entrata. */
export const acceptFriendRequest = (other: string) =>
  callRpc('accept_friend_request', { p_other: other });

/** Rimuove un'amicizia o annulla una richiesta pendente. */
export const removeFriend = (other: string) =>
  callRpc('remove_friend', { p_other: other });

/** Blocca un utente (status='blocked', rimosso dalle cerchie). */
export const blockUser = (target: string) => callRpc('block_user', { p_target: target });

/** Sblocca un utente precedentemente bloccato da me. */
export const unblockUser = (target: string) => callRpc('unblock_user', { p_target: target });

/** Ottieni o crea la DM con un amico. Ritorna l'id della conversazione. */
export async function openDm(other: string): Promise<string> {
  const res = await callRpc<{ ok: boolean; conversation_id: string; created: boolean }>(
    'get_or_create_dm',
    { p_other: other },
  );
  return res.conversation_id;
}

// --- Letture -----------------------------------------------------------------

// Colonne "card" del profilo: sottoinsieme leggero per liste/header.
const CARD_COLS = 'id, username, display_name, avatar_url, aura_score, aura_color, status_text';

interface ProfileCardRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  aura_score: number;
  aura_color: string | null;
  status_text: string | null;
}

function toCard(r: ProfileCardRow): ProfileCard {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    auraScore: r.aura_score,
    auraColor: r.aura_color,
    statusText: r.status_text,
  };
}

/** Carica i profili (card) per un elenco di id, in una mappa id→card. */
export async function fetchProfileCards(ids: string[]): Promise<Map<string, ProfileCard>> {
  const out = new Map<string, ProfileCard>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.from('profiles').select(CARD_COLS).in('id', ids);
  if (error) throw error;
  for (const r of (data ?? []) as unknown as ProfileCardRow[]) out.set(r.id, toCard(r));
  return out;
}

/**
 * Gli utenti che HO bloccato io (per la lista "Utenti bloccati" in S10, CM8).
 * `friendships_select_parties` mi lascia leggere le mie righe `blocked`; i loro
 * profili restano leggibili (l'invisibilità stile Instagram nasconde solo chi
 * ha bloccato ME). Da qui posso sbloccare.
 */
export async function fetchBlockedUsers(uid: string): Promise<ProfileCard[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('user_id, friend_id, blocked_by')
    .eq('status', 'blocked')
    .eq('blocked_by', uid);
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    user_id: string;
    friend_id: string;
    blocked_by: string;
  }[];
  const ids = rows.map((r) => (r.user_id === uid ? r.friend_id : r.user_id));
  const cards = await fetchProfileCards(ids);
  return ids.map((id) => cards.get(id)).filter((c): c is ProfileCard => !!c);
}

/** Card di un singolo profilo (per la schermata profilo altrui). */
export async function fetchProfileCard(id: string): Promise<ProfileCard | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(CARD_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toCard(data as unknown as ProfileCardRow) : null;
}

/**
 * Cerca utenti per username o nome (esclude sé stessi e i cancellati).
 * Stile Instagram: chi MI ha bloccato non compare mai nei risultati (il blocco
 * non va rivelato al bloccato). Chi ho bloccato IO resta visibile: dal suo
 * profilo posso sbloccarlo.
 */
export async function searchProfiles(term: string, excludeId: string): Promise<ProfileCard[]> {
  const t = term.trim();
  if (t.length < 2) return [];
  const like = `%${t}%`;
  const [profili, blocchi] = await Promise.all([
    supabase
      .from('profiles')
      .select(CARD_COLS)
      .or(`username.ilike.${like},display_name.ilike.${like}`)
      .neq('id', excludeId)
      .is('deleted_at', null)
      .limit(20),
    supabase
      .from('friendships')
      .select('user_id, friend_id, blocked_by')
      .eq('status', 'blocked')
      .or(`user_id.eq.${excludeId},friend_id.eq.${excludeId}`),
  ]);
  if (profili.error) throw profili.error;
  if (blocchi.error) throw blocchi.error;

  const nascosti = new Set<string>();
  const righeBlocco = (blocchi.data ?? []) as unknown as {
    user_id: string;
    friend_id: string;
    blocked_by: string | null;
  }[];
  for (const r of righeBlocco) {
    // blocked_by diverso da me = mi ha bloccato l'altro → invisibile per me.
    if (r.blocked_by && r.blocked_by !== excludeId) {
      nascosti.add(r.user_id === excludeId ? r.friend_id : r.user_id);
    }
  }

  return ((profili.data ?? []) as unknown as ProfileCardRow[])
    .map(toCard)
    .filter((c) => !nascosti.has(c.id));
}
