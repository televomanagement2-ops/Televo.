// =============================================================================
// chat.ts — dati della chat: lista conversazioni, header, messaggi, invio.
// =============================================================================
// Letture via RLS (vedo solo le conversazioni di cui sono membro). L'invio è un
// INSERT diretto su `messages` (il trigger forza sender/membership/expiry). Le
// azioni di stato (letto) passano da RPC. Niente vista backend per la lista: la
// assembliamo lato client con poche query (scala MVP; una vista/RPC dedicata è
// un'ottimizzazione futura per storici molto lunghi).

import { supabase } from '@/lib/supabase';
import { callRpc } from '@/lib/rpc';
import { fetchProfileCards } from '@/lib/social';
import type {
  ConversationPreview,
  ConversationRow,
  MessageRow,
  ProfileCard,
  SavedMessage,
} from '@/types';
import type { ConversationRole, ConversationType } from '@/types/supabase';

// Finestra di messaggi recenti scandagliata per costruire anteprime + unread.
// Oltre questa, l'unread potrebbe essere approssimato (vedi nota SRS §8.5).
const LISTA_MSG_WINDOW = 400;
export const MESSAGES_PAGE = 40;

// --- Lista conversazioni (hub) ----------------------------------------------

/** Organizzazione per-utente della conversazione (D4), letta dalla mia membership. */
interface MemberOrg {
  last_read_at: string;
  muted_until: string | null;
  archived_at: string | null;
  pinned_at: string | null;
  cleared_at: string | null;
  hidden_at: string | null;
}

export async function fetchConversations(
  uid: string,
  filter: ConversationView = 'active',
): Promise<ConversationPreview[]> {
  // 1. Le mie membership (conversation_id + last_read_at + campi organizzazione D4).
  const { data: memData, error: memErr } = await supabase
    .from('conversation_members')
    .select('conversation_id, last_read_at, muted_until, archived_at, pinned_at, cleared_at, hidden_at')
    .eq('user_id', uid);
  if (memErr) throw memErr;
  const mems = (memData ?? []) as unknown as ({ conversation_id: string } & MemberOrg)[];
  if (mems.length === 0) return [];
  const convIds = mems.map((m) => m.conversation_id);
  const orgByConv = new Map<string, MemberOrg>(mems.map((m) => [m.conversation_id, m]));
  const lastReadByConv = new Map(mems.map((m) => [m.conversation_id, m.last_read_at]));

  // 2. Le conversazioni.
  const { data: convData, error: convErr } = await supabase
    .from('conversations')
    .select('id, type, name, avatar_url, updated_at')
    .in('id', convIds);
  if (convErr) throw convErr;
  const convs = (convData ?? []) as unknown as {
    id: string;
    type: ConversationType;
    name: string | null;
    avatar_url: string | null;
    updated_at: string;
  }[];

  // 3. Peer delle DM (l'altro membro).
  const dmIds = convs.filter((c) => c.type === 'dm').map((c) => c.id);
  const peerByConv = new Map<string, string>();
  if (dmIds.length > 0) {
    const { data: others, error } = await supabase
      .from('conversation_members')
      .select('conversation_id, user_id')
      .in('conversation_id', dmIds)
      .neq('user_id', uid);
    if (error) throw error;
    for (const r of (others ?? []) as unknown as { conversation_id: string; user_id: string }[]) {
      peerByConv.set(r.conversation_id, r.user_id);
    }
  }
  const peerCards = await fetchProfileCards([...peerByConv.values()]);

  // 4. Ultimi messaggi + conteggio non letti (finestra recente).
  const { data: msgData, error: msgErr } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false })
    .limit(LISTA_MSG_WINDOW);
  if (msgErr) throw msgErr;
  const msgs = (msgData ?? []) as unknown as MessageRow[];
  const lastByConv = new Map<string, MessageRow>();
  const unreadByConv = new Map<string, number>();
  for (const m of msgs) {
    // "Cancella cronologia": nascondo i messaggi <= cleared_at (solo per me).
    const cleared = orgByConv.get(m.conversation_id)?.cleared_at;
    if (cleared && m.created_at <= cleared) continue;
    if (m.deleted_at == null && !lastByConv.has(m.conversation_id)) {
      lastByConv.set(m.conversation_id, m);
    }
    const lr = lastReadByConv.get(m.conversation_id);
    if (m.deleted_at == null && m.sender_id !== uid && lr && m.created_at > lr) {
      unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1);
    }
  }

  // 5. Streak per conversazione.
  const { data: stData } = await supabase
    .from('streaks')
    .select('conversation_id, current_streak')
    .in('conversation_id', convIds);
  const streakByConv = new Map(
    ((stData ?? []) as unknown as { conversation_id: string; current_streak: number }[]).map(
      (s) => [s.conversation_id, s.current_streak],
    ),
  );

  // 6. Assembla, filtra per vista, ordina (fissate prima, poi attività recente).
  const previews: ConversationPreview[] = convs.map((c) => {
    const org = orgByConv.get(c.id);
    const peerId = peerByConv.get(c.id);
    const peer: ProfileCard | null = peerId ? peerCards.get(peerId) ?? null : null;
    const title = c.type === 'dm' ? peer?.displayName || peer?.username || 'Chat' : c.name || 'Gruppo';
    return {
      id: c.id,
      type: c.type,
      title,
      avatarUrl: c.type === 'dm' ? peer?.avatarUrl ?? null : c.avatar_url,
      lastMessage: lastByConv.get(c.id) ?? null,
      unreadCount: unreadByConv.get(c.id) ?? 0,
      updatedAt: c.updated_at,
      streak: streakByConv.get(c.id) ?? null,
      peer,
      muted: !!org?.muted_until && org.muted_until > new Date().toISOString(),
      archivedAt: org?.archived_at ?? null,
      pinnedAt: org?.pinned_at ?? null,
      hiddenAt: org?.hidden_at ?? null,
    };
  });
  const filtered = previews.filter((p) => convMatchesView(p, filter));
  // Fissate in cima; a parità, per attività recente (updated_at desc).
  filtered.sort((a, b) => {
    const ap = a.pinnedAt ? 1 : 0;
    const bp = b.pinnedAt ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });
  return filtered;
}

/** Vista della lista: hub attivo, archiviate (S8), silenziate (S9). */
export type ConversationView = 'active' | 'archived' | 'muted';

/** Una conversazione appartiene alla vista richiesta? "hidden_at" riappare se
 *  arriva un nuovo messaggio (updated_at > hidden_at). */
function convMatchesView(p: ConversationPreview, view: ConversationView): boolean {
  const isHidden = !!p.hiddenAt && p.updatedAt <= p.hiddenAt;
  const isArchived = !!p.archivedAt;
  switch (view) {
    case 'archived':
      return isArchived && !isHidden;
    case 'muted':
      return p.muted && !isArchived && !isHidden;
    case 'active':
    default:
      return !isArchived && !isHidden;
  }
}

// --- Header della conversazione ---------------------------------------------

/** Membro di una conversazione, con ruolo e profilo risolto (per la schermata Info). */
export interface ConversationMemberCard {
  userId: string;
  role: ConversationRole;
  profile: ProfileCard | null;
}

export interface ConversationHeader {
  id: string;
  type: ConversationType;
  title: string;
  avatarUrl: string | null;
  peer: ProfileCard | null;
  /** last_read_at del peer (DM): base della doppia spunta. */
  peerLastReadAt: string | null;
  streak: number | null;
  memberCount: number;
  /** Membri con ruolo e profilo (popolato solo per group/house; DM = vuoto). */
  members: ConversationMemberCard[];
}

export async function fetchConversationHeader(
  convId: string,
  uid: string,
): Promise<ConversationHeader | null> {
  const { data: convData, error } = await supabase
    .from('conversations')
    .select('id, type, name, avatar_url')
    .eq('id', convId)
    .maybeSingle();
  if (error) throw error;
  const c = convData as unknown as {
    id: string;
    type: ConversationType;
    name: string | null;
    avatar_url: string | null;
  } | null;
  if (!c) return null;

  const { data: memData } = await supabase
    .from('conversation_members')
    .select('user_id, role, last_read_at')
    .eq('conversation_id', convId);
  const members = (memData ?? []) as unknown as {
    user_id: string;
    role: ConversationRole;
    last_read_at: string;
  }[];

  let peer: ProfileCard | null = null;
  let peerLastReadAt: string | null = null;
  let memberCards: ConversationMemberCard[] = [];
  if (c.type === 'dm') {
    const peerRow = members.find((m) => m.user_id !== uid);
    if (peerRow) {
      peer = (await fetchProfileCards([peerRow.user_id])).get(peerRow.user_id) ?? null;
      peerLastReadAt = peerRow.last_read_at;
    }
  } else {
    // Group/house: risolvi il profilo di ogni membro per la schermata Info.
    const cards = await fetchProfileCards(members.map((m) => m.user_id));
    memberCards = members.map((m) => ({
      userId: m.user_id,
      role: m.role,
      profile: cards.get(m.user_id) ?? null,
    }));
  }

  const { data: stData } = await supabase
    .from('streaks')
    .select('current_streak')
    .eq('conversation_id', convId)
    .maybeSingle();
  const streak = (stData as unknown as { current_streak: number } | null)?.current_streak ?? null;

  const title = c.type === 'dm' ? peer?.displayName || peer?.username || 'Chat' : c.name || 'Gruppo';
  return {
    id: c.id,
    type: c.type,
    title,
    avatarUrl: c.type === 'dm' ? peer?.avatarUrl ?? null : c.avatar_url,
    peer,
    peerLastReadAt,
    streak,
    memberCount: members.length,
    members: memberCards,
  };
}

/**
 * Mappa `sender_id → ProfileCard` per una conversazione, per mostrare il nome del
 * mittente sopra le bolle nei gruppi. I mittenti sono normalmente membri correnti;
 * gli ex-membri usciti non compaiono qui (fallback UI: "Utente").
 */
export async function fetchGroupSenders(convId: string): Promise<Map<string, ProfileCard>> {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', convId);
  if (error) throw error;
  const ids = ((data ?? []) as unknown as { user_id: string }[]).map((r) => r.user_id);
  return fetchProfileCards(ids);
}

// --- Mutazioni gruppo (via RPC) ---------------------------------------------

/** Crea un gruppo/house (creatore = admin). Ritorna il conversation_id. */
export async function createGroupConversation(
  type: ConversationType,
  name: string | null,
  members: string[],
): Promise<string> {
  const res = await callRpc<{ ok: boolean; conversation_id: string }>(
    'create_group_conversation',
    { p_type: type, p_name: name, p_members: members },
  );
  return res.conversation_id;
}

/** Aggiunge un membro (solo admin; group=amici, house=amici o stessa scuola). */
export const addConversationMember = (convId: string, userId: string) =>
  callRpc('add_conversation_member', { p_conv: convId, p_user: userId });

/** Rimuove un membro (solo admin; non per DM, non sé stessi). */
export const removeConversationMember = (convId: string, userId: string) =>
  callRpc('remove_conversation_member', { p_conv: convId, p_user: userId });

/** Esci da una conversazione (rimuove la propria membership). */
export const leaveConversation = (convId: string) =>
  callRpc('leave_conversation', { p_conv: convId });

// --- Organizzazione conversazione per-utente (D4) ----------------------------

/** Silenzia (p_until futuro) o riattiva (null) una conversazione. */
export const setConversationMute = (convId: string, until: string | null) =>
  callRpc('set_conversation_mute', { p_conv: convId, p_until: until });

/** Attiva/disattiva un flag: 'archived' | 'pinned' | 'hidden'. */
export const setConversationFlag = (
  convId: string,
  flag: 'archived' | 'pinned' | 'hidden',
  on: boolean,
) => callRpc('set_conversation_flag', { p_conv: convId, p_flag: flag, p_on: on });

/** Cancella cronologia (solo per me): nasconde i messaggi fino ad ora. */
export const clearConversationHistory = (convId: string) =>
  callRpc('clear_conversation_history', { p_conv: convId });

// --- Messaggi salvati (D4) ---------------------------------------------------

/** Salva / rimuovi dai salvati un messaggio (bookmark personale). */
export const saveMessage = (messageId: string) =>
  callRpc('save_message', { p_message: messageId });
export const unsaveMessage = (messageId: string) =>
  callRpc('unsave_message', { p_message: messageId });

/**
 * Lista dei messaggi salvati (cross-conversazione, più recenti in cima). Assemblata
 * lato client: saved_messages → messaggi → titolo conversazione d'origine.
 */
export async function fetchSavedMessages(uid: string): Promise<SavedMessage[]> {
  const { data: savedData, error: savedErr } = await supabase
    .from('saved_messages')
    .select('message_id, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });
  if (savedErr) throw savedErr;
  const saved = (savedData ?? []) as unknown as { message_id: string; created_at: string }[];
  if (saved.length === 0) return [];

  const ids = saved.map((s) => s.message_id);
  const { data: msgData, error: msgErr } = await supabase
    .from('messages')
    .select('*')
    .in('id', ids);
  if (msgErr) throw msgErr;
  const msgs = (msgData ?? []) as unknown as MessageRow[];
  const msgById = new Map(msgs.map((m) => [m.id, m]));

  // Titolo della conversazione d'origine (nome gruppo o "Chat").
  const convIds = [...new Set(msgs.map((m) => m.conversation_id))];
  const { data: convData } = await supabase
    .from('conversations')
    .select('id, name')
    .in('id', convIds);
  const nameByConv = new Map(
    ((convData ?? []) as unknown as { id: string; name: string | null }[]).map((c) => [c.id, c.name]),
  );

  const out: SavedMessage[] = [];
  for (const s of saved) {
    const m = msgById.get(s.message_id);
    if (!m) continue; // messaggio cancellato/scaduto → salto (niente fantasmi)
    out.push({
      message: m,
      conversationId: m.conversation_id,
      conversationTitle: nameByConv.get(m.conversation_id) || 'Chat',
      savedAt: s.created_at,
    });
  }
  return out;
}

// --- Messaggi ----------------------------------------------------------------

/** Una pagina di messaggi (desc, più recenti prima). `before` = paginazione indietro. */
export async function fetchMessagesPage(
  convId: string,
  before?: string,
  limit = MESSAGES_PAGE,
): Promise<MessageRow[]> {
  let q = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as MessageRow[];
}

/** Invia un messaggio di testo (il trigger forza sender/membership/created_at). */
export async function sendTextMessage(
  convId: string,
  body: string,
  replyTo?: string | null,
): Promise<MessageRow> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: convId, type: 'text', body, reply_to: replyTo ?? null } as never)
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as MessageRow;
}

/**
 * Invia un vocale effimero. `audioPath` = PATH storage nel bucket privato
 * `voice-messages` (non un URL): la riproduzione lo firma alla lettura. Il trigger
 * clampa comunque `expires_at` a max 24h (qui lo impostiamo esplicitamente a 24h).
 */
export async function sendAudioMessage(
  convId: string,
  audioPath: string,
  replyTo?: string | null,
): Promise<MessageRow> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: convId,
      type: 'audio',
      audio_url: audioPath,
      reply_to: replyTo ?? null,
      expires_at: expiresAt,
    } as never)
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as MessageRow;
}

/** Soft-delete del proprio messaggio (deleted_at). */
export async function softDeleteMessage(id: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', id);
  if (error) throw error;
}

/** Segna la conversazione come letta (aggiorna last_read_at a now). */
export const markConversationRead = (convId: string) =>
  callRpc('mark_conversation_read', { p_conv: convId });

/** Anteprima testuale dell'ultimo messaggio per la lista chat. */
export function previewText(m: MessageRow | null): string {
  if (!m) return 'Nessun messaggio';
  if (m.deleted_at) return 'Messaggio eliminato';
  switch (m.type) {
    case 'text':
      return m.body ?? '';
    case 'audio':
    case 'voice_thread':
      return '🎙️ Vocale';
    case 'media':
      return '📷 Foto';
    default:
      return 'Messaggio';
  }
}

// Ri-esporta per comodità nei componenti.
export type { ConversationRow };
