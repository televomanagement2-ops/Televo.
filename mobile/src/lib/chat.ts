// =============================================================================
// chat.ts — dati della chat: lista conversazioni, header, messaggi, invio.
// =============================================================================
// Letture via RLS (vedo solo le conversazioni di cui sono membro). L'invio è un
// INSERT diretto su `messages` (il trigger forza sender/membership/expiry). Le
// azioni di stato (letto) passano da RPC. La lista dell'hub arriva dalla RPC
// `chat_overview()` (CM8): una query server-side con unread ESATTO — ha
// sostituito lo scan client di 400 messaggi (unread approssimato, SRS §8.5).

import { decode as decodeBase64 } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { callRpc } from '@/lib/rpc';
import { copiaFotoInoltro } from '@/lib/media';
import { fetchProfileCards } from '@/lib/social';
import { timeHHmm } from '@/lib/datetime';
import type {
  ConversationPreview,
  ConversationRow,
  MessageRow,
  ProfileCard,
  ReactionRow,
  SavedMessage,
} from '@/types';
import type { ConversationRole, ConversationType } from '@/types/supabase';
import type { ReactionEmoji } from '@/constants/chat';
import type { AuraTrait } from '@/constants/aura';

export const MESSAGES_PAGE = 40;

// --- Lista conversazioni (hub) ----------------------------------------------

/** Riga di chat_overview(): peer/last_message arrivano come jsonb dal server. */
interface OverviewRow {
  conversation_id: string;
  type: ConversationType;
  name: string | null;
  avatar_url: string | null;
  updated_at: string;
  muted_until: string | null;
  archived_at: string | null;
  pinned_at: string | null;
  cleared_at: string | null;
  hidden_at: string | null;
  my_last_read_at: string;
  peer: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    aura_score: number;
    aura_color: string | null;
    status_text: string | null;
  } | null;
  last_message: MessageRow | null;
  unread_count: number;
  streak: number | null;
}

/**
 * Lista dell'hub via RPC chat_overview() (CM8): una query server-side, unread
 * ESATTO. Filtro vista e ordinamento restano client (una cache, tre viste).
 */
export async function fetchConversations(
  _uid: string,
  filter: ConversationView = 'active',
): Promise<ConversationPreview[]> {
  const rows = await callRpc<OverviewRow[]>('chat_overview', {});

  const previews: ConversationPreview[] = (rows ?? []).map((r) => {
    const peer: ProfileCard | null = r.peer
      ? {
          id: r.peer.id,
          username: r.peer.username,
          displayName: r.peer.display_name,
          avatarUrl: r.peer.avatar_url,
          auraScore: r.peer.aura_score,
          auraColor: r.peer.aura_color,
          statusText: r.peer.status_text,
        }
      : null;
    const title =
      r.type === 'dm' ? peer?.displayName || peer?.username || 'Chat' : r.name || 'Gruppo';
    return {
      id: r.conversation_id,
      type: r.type,
      title,
      avatarUrl: r.type === 'dm' ? peer?.avatarUrl ?? null : r.avatar_url,
      lastMessage: r.last_message,
      unreadCount: r.unread_count,
      updatedAt: r.updated_at,
      streak: r.streak,
      peer,
      muted: !!r.muted_until && r.muted_until > new Date().toISOString(),
      archivedAt: r.archived_at,
      pinnedAt: r.pinned_at,
      hiddenAt: r.hidden_at,
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
  /** cleared_at della MIA membership: base del filtro "cancella cronologia". */
  myClearedAt: string | null;
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

  // CM8: niente last_read_at qui — le ricevute di lettura passano SOLO dalla
  // RPC get_read_receipts (enforcement server §6.4; il grant per-colonna
  // renderebbe comunque illeggibile la colonna).
  const { data: memData } = await supabase
    .from('conversation_members')
    .select('user_id, role, cleared_at')
    .eq('conversation_id', convId);
  const members = (memData ?? []) as unknown as {
    user_id: string;
    role: ConversationRole;
    cleared_at: string | null;
  }[];

  let peer: ProfileCard | null = null;
  let memberCards: ConversationMemberCard[] = [];
  if (c.type === 'dm') {
    const peerRow = members.find((m) => m.user_id !== uid);
    if (peerRow) {
      const cards = await fetchProfileCards([peerRow.user_id]);
      peer = cards.get(peerRow.user_id) ?? null;
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
    myClearedAt: members.find((m) => m.user_id === uid)?.cleared_at ?? null,
    streak,
    memberCount: members.length,
    members: memberCards,
  };
}

// --- Ricevute di lettura (CM8, §6.4) ------------------------------------------

/** Ricevuta di lettura di un membro (esclude sempre il chiamante). */
export interface ReadReceipt {
  userId: string;
  lastReadAt: string;
}

/**
 * Ricevute di lettura via RPC get_read_receipts: il SERVER applica membership
 * e reciprocità (se nascondo le mie spunte → lista vuota; chi le nasconde non
 * compare). Base della doppia spunta in DM e del "letto da N" nei gruppi.
 */
export async function fetchReadReceipts(convId: string): Promise<ReadReceipt[]> {
  const rows = await callRpc<{ user_id: string; last_read_at: string }[]>('get_read_receipts', {
    p_conv: convId,
  });
  return (rows ?? []).map((r) => ({ userId: r.user_id, lastReadAt: r.last_read_at }));
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

/** Esci da una conversazione (rimuove la propria membership). Se esce l'ultimo
 *  admin e restano membri, il server auto-promuove il più anziano (R-09). */
export const leaveConversation = (convId: string) =>
  callRpc('leave_conversation', { p_conv: convId });

/** Rinomina il gruppo / cambia avatar (solo admin, mai su DM). `avatarUrl` null
 *  rimuove l'immagine: passare SEMPRE il valore corrente se non cambia. */
export const updateConversationMeta = (
  convId: string,
  name: string,
  avatarUrl: string | null,
) => callRpc('update_conversation_meta', { p_conv: convId, p_name: name, p_avatar_url: avatarUrl });

/** Promuove un membro ad admin (solo admin; idempotente su già-admin). */
export const promoteConversationAdmin = (convId: string, userId: string) =>
  callRpc('promote_conversation_admin', { p_conv: convId, p_user: userId });

/**
 * Carica l'avatar del gruppo sul bucket pubblico `avatars`, nella cartella
 * dell'UPLOADER (`<uid>/group-…`): le policy storage esistenti consentono la
 * scrittura solo lì. L'URL pubblico va poi passato a updateConversationMeta.
 */
export async function uploadGroupAvatar(
  uid: string,
  convId: string,
  base64: string,
  mime: string,
): Promise<string> {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const path = `${uid}/group-${convId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, decodeBase64(base64), { contentType: mime, upsert: true });
  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

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

/**
 * Una pagina di messaggi (desc, più recenti prima). `before` = paginazione
 * indietro. I filtri "cancella cronologia" (created_at <= cleared_at) e "vocale
 * scaduto" (expires_at nel passato, prima del cron expire_content) sono applicati
 * LATO SERVER: filtrare lato client svuoterebbe le pagine rompendo la semantica
 * del cursore (pagina "piena" = potrebbero esserci messaggi più vecchi).
 */
export async function fetchMessagesPage(
  convId: string,
  before?: string,
  limit = MESSAGES_PAGE,
  clearedAt?: string | null,
): Promise<MessageRow[]> {
  let q = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (clearedAt) q = q.gt('created_at', clearedAt);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as MessageRow[];
}

/** Invia un messaggio di testo (il trigger forza sender/membership/created_at).
 *  `dropRef` (DM5, R-08): riferimento a un drop ("Rispondi in privato") — il
 *  trigger esige testo puro + can_see_drop del mittente; la bolla mostra la
 *  mini-card. Il body può essere vuoto (solo riferimento) → lo mandiamo null. */
export async function sendTextMessage(
  convId: string,
  body: string,
  replyTo?: string | null,
  dropRef?: string | null,
): Promise<MessageRow> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: convId,
      type: 'text',
      body: dropRef ? body.trim() || null : body,
      reply_to: replyTo ?? null,
      drop_ref: dropRef ?? null,
    } as never)
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as MessageRow;
}

/**
 * Inoltra un DROP in una conversazione come RIFERIMENTO (DM5, R-08): scrive un
 * messaggio di testo con `drop_ref` valorizzato, MAI una copia. Il trigger
 * verifica che il mittente veda il drop (`can_see_drop`); il lettore lo risolve
 * con la SUA di RLS (o vede "Drop non disponibile"). Niente file da copiare.
 */
export async function forwardDropReference(
  destConvId: string,
  dropId: string,
): Promise<MessageRow> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: destConvId, type: 'text', drop_ref: dropId } as never)
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

/**
 * Invia una foto (CM5, D3). `mediaPath` = PATH storage nel bucket privato
 * `chat-media` (non un URL): la visualizzazione lo firma alla lettura.
 * Le foto sono PERMANENTI: mai `expires_at` (il trigger lo rifiuterebbe).
 * La caption opzionale viaggia in `body` (cap 4096 come il testo).
 */
export async function sendMediaMessage(
  convId: string,
  mediaPath: string,
  caption?: string | null,
  replyTo?: string | null,
): Promise<MessageRow> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: convId,
      type: 'media',
      media_url: mediaPath,
      media_type: 'image',
      body: caption?.trim() || null,
      reply_to: replyTo ?? null,
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

/**
 * Modifica il testo del proprio messaggio (RC-05). Il trigger before-update
 * applica finestra 48h / solo testo / cap 4096 e timbra `edited_at`
 * (errori: edit_window_expired, cannot_edit_message, message_too_long).
 */
export async function editMessage(id: string, body: string): Promise<MessageRow> {
  const { data, error } = await supabase
    .from('messages')
    .update({ body } as never)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  const row = data as unknown as MessageRow;
  moderaMessaggio(row.id, body); // il testo modificato rientra in moderazione (CM8)
  return row;
}

/**
 * Modera un messaggio di testo in background (CM8): fire-and-forget verso la
 * Edge `moderate-text` (Perspective, degrada senza chiave). NON blocca né
 * rallenta l'invio — parte DOPO il successo e inghiotte ogni errore. La Edge
 * richiede il JWT: `functions.invoke` lo aggiunge dalla sessione corrente.
 * Solo per il testo: media senza caption e vocali non passano di qui.
 */
export function moderaMessaggio(messageId: string, text: string | null | undefined): void {
  const t = text?.trim();
  if (!t) return;
  void supabase.functions
    .invoke('moderate-text', {
      body: { text: t, target_type: 'message', target_id: messageId },
    })
    .catch(() => {});
}

/**
 * Inoltra un messaggio in un'altra conversazione (RC-06 + CM5): testo e FOTO;
 * i vocali non si inoltrano (effimeri, il trigger li rifiuta). Per le foto il
 * file viene COPIATO server-side nella destinazione (`copiaFotoInoltro`: la
 * RLS storage è path-based, il path dell'origine non sarebbe leggibile ai
 * destinatari) e la caption viaggia con la foto. `forwarded_from` referenzia
 * l'origine → intestazione "Inoltrato".
 */
export async function forwardMessage(
  destConvId: string,
  original: MessageRow,
  uid: string,
): Promise<MessageRow> {
  const isMedia = original.type === 'media' && !!original.media_url;
  const mediaPath = isMedia
    ? await copiaFotoInoltro(original.media_url as string, destConvId, uid)
    : null;
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: destConvId,
      type: isMedia ? 'media' : 'text',
      body: original.body,
      media_url: mediaPath,
      media_type: isMedia ? 'image' : null,
      forwarded_from: original.id,
    } as never)
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as MessageRow;
}

// --- Reazioni emoji (CM4, RC-07) ----------------------------------------------

/** Tutte le reazioni della conversazione (lista piatta; la UI raggruppa per
 *  messaggio). Volume basso a scala Televo: niente paginazione per ora. */
export async function fetchConversationReactions(convId: string): Promise<ReactionRow[]> {
  const { data, error } = await supabase
    .from('message_reactions')
    .select('*')
    .eq('conversation_id', convId);
  if (error) throw error;
  return (data ?? []) as unknown as ReactionRow[];
}

/** Reagisce a un messaggio (il trigger deriva user_id/conversation_id e valida
 *  membership/blocco; il CHECK limita al set curato REACTION_EMOJIS). */
export async function addReaction(messageId: string, emoji: ReactionEmoji): Promise<ReactionRow> {
  const { data, error } = await supabase
    .from('message_reactions')
    .insert({ message_id: messageId, emoji } as never)
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as ReactionRow;
}

/** Rimuove la PROPRIA reazione (RLS: delete solo delle proprie). */
export async function removeReaction(messageId: string, uid: string): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', uid);
  if (error) throw error;
}

// --- Ricerca full-text (CM4, RC-08) --------------------------------------------

/** Risultato di search_messages, in forma comoda per la UI. */
export interface MessageSearchResult {
  messageId: string;
  conversationId: string;
  body: string | null;
  createdAt: string;
  senderId: string;
  senderUsername: string | null;
  convType: ConversationType;
  convTitle: string;
}

/**
 * Ricerca full-text server-side (tsvector 'italian' + websearch): in-chat con
 * `convId`, globale con null. La RPC replica la visibilità della lista messaggi
 * (membership, cleared_at, hidden_at, deleted, effimeri scaduti).
 */
export async function searchMessages(
  query: string,
  convId: string | null,
  limit = 20,
  before?: string | null,
): Promise<MessageSearchResult[]> {
  const rows = await callRpc<
    {
      message_id: string;
      conversation_id: string;
      body: string | null;
      created_at: string;
      sender_id: string;
      sender_username: string | null;
      conv_type: ConversationType;
      conv_title: string;
    }[]
  >('search_messages', {
    p_query: query,
    p_conv: convId,
    p_limit: limit,
    p_before: before ?? null,
  });
  return (rows ?? []).map((r) => ({
    messageId: r.message_id,
    conversationId: r.conversation_id,
    body: r.body,
    createdAt: r.created_at,
    senderId: r.sender_id,
    senderUsername: r.sender_username,
    convType: r.conv_type,
    convTitle: r.conv_title,
  }));
}

// --- Segnalazione messaggio (S16 → moderazione) ---------------------------------

/** Segnala un messaggio ai moderatori (RPC file_report, target 'message'). */
export const reportMessage = (messageId: string, reason: string) =>
  callRpc('file_report', { p_target_type: 'message', p_target_id: messageId, p_reason: reason });

// --- Prop da messaggio (S16 → Aura) --------------------------------------------

/**
 * "Dai un prop" dal menu messaggio: insert diretta in `props` con
 * source_type='message' (grant per-colonna; il trigger applica anti-gaming:
 * unicità per contenuto, cap giornaliero, no self, no coppie bloccate).
 * L'Aura al destinatario la emette il DB — qui nessuna logica di punteggio.
 */
export async function giveMessageProp(
  recipientId: string,
  trait: AuraTrait,
  messageId: string,
): Promise<void> {
  const { error } = await supabase
    .from('props')
    .insert({
      recipient: recipientId,
      trait,
      source_type: 'message',
      source_id: messageId,
    } as never);
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

// =============================================================================
// Composer disabilitato (CM1 — §11.4): motivo calcolato da sanzioni e blocchi
// =============================================================================
/**
 * Ritorna il motivo per cui l'utente NON può scrivere nella conversazione
 * (undefined = libero): bannato, mutato (sanzione moderazione GLOBALE), oppure
 * blocco della coppia in DM. Se è il PEER ad aver bloccato, il testo resta
 * neutro: non riveliamo il blocco altrui (l'insert fallirebbe comunque a DB).
 */
export function getComposerDisabledReason(opts: {
  myMutedUntil?: string | null;
  myBannedAt?: string | null;
  isBlockedByPeer?: boolean;
  isPeerBlocked?: boolean;
}): string | undefined {
  if (opts.myBannedAt) {
    return 'Account sospeso';
  }
  if (opts.myMutedUntil && new Date(opts.myMutedUntil) > new Date()) {
    return `Sei silenziato fino alle ${timeHHmm(opts.myMutedUntil)}`;
  }
  if (opts.isPeerBlocked) {
    return 'Hai bloccato questo utente';
  }
  if (opts.isBlockedByPeer) {
    return 'Non puoi scrivere in questa conversazione';
  }
  return undefined;
}

/**
 * Legge lo stato che disabilita il composer: sanzioni proprie
 * (profiles.muted_until / banned_at) e, nelle DM, l'eventuale blocco della
 * coppia (friendships, coppia normalizzata user_id < friend_id).
 */
export async function fetchComposerDisabledReason(
  uid: string,
  peerId: string | null,
): Promise<string | null> {
  const { data: meData, error: meErr } = await supabase
    .from('profiles')
    .select('muted_until, banned_at')
    .eq('id', uid)
    .maybeSingle();
  if (meErr) throw meErr;
  const me = meData as unknown as { muted_until: string | null; banned_at: string | null } | null;

  let isPeerBlocked = false;
  let isBlockedByPeer = false;
  if (peerId) {
    const [a, b] = uid < peerId ? [uid, peerId] : [peerId, uid];
    const { data: frData, error: frErr } = await supabase
      .from('friendships')
      .select('status, blocked_by')
      .eq('user_id', a)
      .eq('friend_id', b)
      .maybeSingle();
    if (frErr) throw frErr;
    const fr = frData as unknown as { status: string; blocked_by: string | null } | null;
    if (fr?.status === 'blocked') {
      isPeerBlocked = fr.blocked_by === uid;
      isBlockedByPeer = !isPeerBlocked;
    }
  }

  return (
    getComposerDisabledReason({
      myMutedUntil: me?.muted_until,
      myBannedAt: me?.banned_at,
      isPeerBlocked,
      isBlockedByPeer,
    }) ?? null
  );
}

// Ri-esporta per comodità nei componenti.
export type { ConversationRow };
