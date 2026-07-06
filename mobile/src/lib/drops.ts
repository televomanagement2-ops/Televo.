// =============================================================================
// drops.ts — dati e storage del dominio Drops (M6). Specchio di chat.ts +
// audio.ts + media.ts, adattato al modello "post" effimero (docs/media/drop.md).
// =============================================================================
// I file dei drop vivono in DUE bucket PRIVATI dedicati (R-06): `drop-media`
// (foto, 15 MB) e `drop-audio` (vocali, 25 MB, condiviso coi commenti vocali).
// Path convenzionale <drop_id>/<author_id>/<file> (il trigger valida il
// prefisso, la RLS storage dà lettura via can_see_drop). L'ID del drop è
// generato dal CLIENT (R-03) così i file si caricano PRIMA dell'insert.
// In `drops.audio_url`/`media_url` salviamo il PATH, non un URL: si firma un
// URL temporaneo solo a chi può vedere il drop (DM2 in poi).

import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { callRpc } from '@/lib/rpc';
import type {
  DropCommentWithAuthor,
  DropFeedRow,
  DropLiker,
  DropPromptOfDay,
  DropReactionTrait,
  DropType,
  MemoryRow,
  SavedDropRow,
} from '@/types/supabase';

const BUCKET_MEDIA = 'drop-media';
const BUCKET_AUDIO = 'drop-audio';
// TTL dell'URL firmato: 1h (come chat). Rifirma al bisogno con 60s di margine.
const SIGNED_TTL_SECONDS = 60 * 60;

/** ID del drop generato dal client (R-03): uuid v4, serve al path pre-insert. */
export function nuovoDropId(): string {
  return Crypto.randomUUID();
}

// -----------------------------------------------------------------------------
// Cache dei tag di React Query (RC del §6): invalidazione mirata per area.
// DM1 usa solo `feed` (invalidata dopo la pubblicazione); le altre sono già qui
// per DM2–DM4 così le chiavi restano coerenti in tutto il dominio.
// -----------------------------------------------------------------------------
export const dropKeys = {
  all: ['drops'] as const,
  feed: () => [...dropKeys.all, 'feed'] as const,
  detail: (id: string) => [...dropKeys.all, 'detail', id] as const,
  comments: (id: string) => [...dropKeys.all, 'comments', id] as const,
  saved: () => [...dropKeys.all, 'saved'] as const,
  memories: () => [...dropKeys.all, 'memories'] as const,
  prompt: () => [...dropKeys.all, 'prompt'] as const, // DM7: tema del giorno (§16.2)
};

// --- Upload dei file (PRIMA dell'insert, path <dropId>/<uid>/…) ---------------

/** Estensione file dal MIME (whitelist bucket drop-media: png/jpeg/webp). */
function extDaMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Carica la foto del drop sul bucket privato e restituisce il PATH storage
 * (`<dropId>/<uid>/foto_<ts>.<ext>`) da salvare in `drops.media_url`. Gli errori
 * dello Storage vengono normalizzati in codici-stringa per `dropErrorMessage`.
 */
export async function uploadDropFoto(
  dropId: string,
  uid: string,
  localUri: string,
  mimeType: string,
): Promise<string> {
  const buffer = await fetch(localUri).then((r) => r.arrayBuffer());
  const path = `${dropId}/${uid}/foto_${Date.now()}.${extDaMime(mimeType)}`;
  const { error } = await supabase.storage
    .from(BUCKET_MEDIA)
    .upload(path, buffer, { contentType: mimeType });
  if (error) {
    if (/exceeded the maximum allowed size/i.test(error.message)) throw new Error('media_too_large');
    if (/mime type .* is not supported/i.test(error.message)) throw new Error('invalid_media_type');
    throw error;
  }
  return path;
}

/**
 * Carica il vocale del drop sul bucket privato e restituisce il PATH storage
 * (`<dropId>/<uid>/drop_<ts>.m4a`). Prefisso file `drop_` (i commenti vocali
 * useranno `commento_` sullo stesso bucket). I byte si leggono con
 * fetch()+arrayBuffer(), come i vocali chat (nessuna dipendenza extra).
 */
export async function uploadDropAudio(
  dropId: string,
  uid: string,
  localUri: string,
): Promise<string> {
  const buffer = await fetch(localUri).then((r) => r.arrayBuffer());
  const path = `${dropId}/${uid}/drop_${Date.now()}.m4a`;
  const { error } = await supabase.storage
    .from(BUCKET_AUDIO)
    .upload(path, buffer, { contentType: 'audio/mp4' });
  if (error) {
    if (/exceeded the maximum allowed size/i.test(error.message)) throw new Error('audio_too_large');
    throw error;
  }
  return path;
}

// --- Insert del drop (il trigger forza autore/created/expires 24h) ------------

export interface NuovoDrop {
  id: string;
  type: DropType;
  /** Testo (type text) o caption opzionale (media/audio). */
  body: string | null;
  /** PATH storage del vocale (solo type audio). */
  audioUrl: string | null;
  /** Durata del vocale in secondi 1–300 (solo type audio). */
  audioSeconds: number | null;
  /** PATH storage della foto (solo type media). */
  mediaUrl: string | null;
}

/**
 * Inserisce un drop. Il client passa SOLO i campi del grant (id, type, body,
 * audio_url, media_url, audio_seconds, audience); il trigger forza author_id,
 * created_at, expires_at (=+24h) e azzera stats_finali. Audience è sempre
 * 'friends' (R-02: la "scuola" è uscita dal progetto). Ritorna la riga creata.
 */
export async function insertDrop(d: NuovoDrop): Promise<{ id: string; created_at: string }> {
  const { data, error } = await supabase
    .from('drops')
    .insert({
      id: d.id,
      type: d.type,
      body: d.body,
      audio_url: d.audioUrl,
      media_url: d.mediaUrl,
      audio_seconds: d.audioSeconds,
      audience: 'friends',
    } as never)
    .select('id, created_at')
    .single();
  if (error) throw error;
  return data as unknown as { id: string; created_at: string };
}

/**
 * Modera in background il testo/caption di un drop (§9): fire-and-forget verso
 * la Edge `moderate-text` (Perspective, degrada senza chiave). NON blocca la
 * pubblicazione — parte DOPO l'insert e inghiotte ogni errore. Le foto senza
 * caption e i vocali non passano di qui (Perspective è solo testo).
 */
export function moderaDrop(dropId: string, text: string | null | undefined): void {
  const t = text?.trim();
  if (!t) return;
  void supabase.functions
    .invoke('moderate-text', { body: { text: t, target_type: 'drop', target_id: dropId } })
    .catch(() => {});
}

// --- URL firmati (per DM2+: feed, dettaglio, Ricordi) -------------------------

// Cache in-memory dei signed URL per bucket: path → { url, scadenza(ms) }.
const signedCacheMedia = new Map<string, { url: string; expiresAt: number }>();
const signedCacheAudio = new Map<string, { url: string; expiresAt: number }>();

async function signedUrl(
  bucket: string,
  cache: Map<string, { url: string; expiresAt: number }>,
  path: string,
): Promise<string> {
  const cached = cache.get(path);
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error) throw error;
  cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_TTL_SECONDS * 1000 });
  return data.signedUrl;
}

/** URL firmato temporaneo per una foto di drop (bucket privato). */
export const signedUrlDropFoto = (path: string) => signedUrl(BUCKET_MEDIA, signedCacheMedia, path);
/** URL firmato temporaneo per un vocale di drop (bucket privato). */
export const signedUrlDropAudio = (path: string) => signedUrl(BUCKET_AUDIO, signedCacheAudio, path);

// --- Feed (DM2): lettura paginata keyset via RPC drops_feed --------------------

/** Pagina del feed drops (RC-03: keyset, mai OFFSET). ~20 come da spec. */
export const FEED_PAGE = 20;

/** Cursore keyset del feed: l'ultima riga della pagina precedente (created_at, id).
 *  null = prima pagina. Le RPC ordinano `created_at desc, id desc`. */
export interface DropFeedCursor {
  before: string;
  beforeId: string;
}

/**
 * Una pagina del feed. Il predicato di visibilità (amici ∨ autore, drop vivi) e
 * i contatori privati (solo per l'autore) sono enforced NELLA RPC (R-04): il
 * client non filtra né conta nulla. Ritorna righe già pronte per la card.
 */
export async function fetchDropsFeed(cursor: DropFeedCursor | null): Promise<DropFeedRow[]> {
  return callRpc<DropFeedRow[]>('drops_feed', {
    p_before: cursor?.before ?? null,
    p_before_id: cursor?.beforeId ?? null,
    p_limit: FEED_PAGE,
  });
}

// --- Interazioni leggere (DM2): like · salvataggio · reaction-tratto -----------
// Like e reaction sono toggle DIRETTI sulle tabelle (grant per-colonna, il
// trigger forza user_id e valida can_see_drop/drop vivo); il salvataggio passa
// SEMPRE da RPC (R-14: l'autore vede il numero, mai chi). Zero Aura su like
// (R-13); la reaction-tratto invece diventa un prop → Aura (pipeline esistente).

/** Mette/toglie il like (♥) a un drop. Idempotente per natura (PK drop,user). */
export async function setDropLike(dropId: string, on: boolean): Promise<void> {
  if (on) {
    const { error } = await supabase.from('drop_likes').insert({ drop_id: dropId } as never);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('drop_likes').delete().eq('drop_id', dropId);
    if (error) throw error;
  }
}

/** Salva/rimuove dai segnalibri (🔖) via RPC (segnalibro effimero, D-1). */
export async function setDropSave(dropId: string, on: boolean): Promise<void> {
  await callRpc(on ? 'save_drop' : 'unsave_drop', { p_drop: dropId });
}

/** Dà/toglie una reaction-tratto (gesto forte → prop → Aura). Una riga per tratto. */
export async function setDropReaction(
  dropId: string,
  trait: DropReactionTrait,
  on: boolean,
): Promise<void> {
  if (on) {
    const { error } = await supabase
      .from('drop_reactions')
      .insert({ drop_id: dropId, trait } as never);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('drop_reactions')
      .delete()
      .eq('drop_id', dropId)
      .eq('trait', trait);
    if (error) throw error;
  }
}

// =============================================================================
// Dettaglio (S3, DM3): drop singolo + commenti testo/vocali (1 livello reply).
// =============================================================================
// Il dettaglio riusa la RPC `drop_detail` (stessa shape del feed: contatori solo
// per l'autore, R-04). I commenti sono CONTENUTO: query diretta con RLS
// (`can_see_drop`), autore embeddato via FK PostgREST. Volume basso a scala
// Televo (un drop vive 24h): lista piatta senza paginazione — la UI costruisce
// l'albero a 1 livello. Il vocale del commento sta nello stesso bucket privato
// `drop-audio` dei drop vocali, con prefisso file `commento_` (R-06).

/**
 * Il drop singolo (hero di S3) via RPC `drop_detail`. Ritorna null se il drop è
 * scaduto o non visibile al chiamante — identico nei due casi (non riveliamo se
 * esiste, §S3). I contatori privati arrivano valorizzati SOLO se sei l'autore.
 */
export async function fetchDropDetail(dropId: string): Promise<DropFeedRow | null> {
  const rows = await callRpc<DropFeedRow[]>('drop_detail', { p_drop: dropId });
  return rows[0] ?? null;
}

// --- Tema del giorno (DM7, §16.2) --------------------------------------------
// Lettura via RPC SECURITY DEFINER (le tabelle drop_prompts/drop_prompt_of_day
// sono di sistema). Ritorna null se oggi non c'è tema: il banner semplicemente
// non compare. È solo uno SPUNTO informativo, mai contenuto del drop.
export async function fetchDropPromptToday(): Promise<DropPromptOfDay | null> {
  return callRpc<DropPromptOfDay | null>('drop_prompt_today', {});
}

// Select dei commenti con l'autore embeddato (FK esplicita: disambigua l'unico
// riferimento a profiles ed è robusta a futuri FK aggiuntivi).
const COMMENT_SELECT =
  'id, drop_id, author_id, parent_id, type, body, audio_url, audio_seconds, created_at,' +
  ' author:profiles!drop_comments_author_id_fkey(id, username, display_name, avatar_url)';

/**
 * Tutti i commenti di un drop (lista piatta, ordine cronologico asc). La RLS
 * (`can_see_drop`) filtra: un non-amico non riceve nulla. La UI raggruppa in
 * top-level + reply (1 livello). Alla scadenza le righe vengono cancellate dal
 * sistema (D-1), quindi qui non arrivano mai commenti di Ricordi.
 */
export async function fetchDropComments(dropId: string): Promise<DropCommentWithAuthor[]> {
  const { data, error } = await supabase
    .from('drop_comments')
    .select(COMMENT_SELECT)
    .eq('drop_id', dropId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DropCommentWithAuthor[];
}

export interface NuovoCommento {
  dropId: string;
  /** Reply a un commento top-level dello STESSO drop (profondità max 1). */
  parentId: string | null;
  type: 'text' | 'audio';
  /** Testo del commento (type text, ≤1000). */
  body: string | null;
  /** PATH storage del vocale (type audio, prefisso commento_). */
  audioUrl: string | null;
  /** Durata del vocale 1–120 (type audio). */
  audioSeconds: number | null;
}

/**
 * Inserisce un commento. Il trigger forza author_id/created_at e valida
 * sanzioni/visibilità/vita del drop/coerenza formato/profondità/rate-limit.
 * Ritorna la riga creata con l'autore embeddato (per l'upsert ottimistico).
 */
export async function insertDropComment(c: NuovoCommento): Promise<DropCommentWithAuthor> {
  const { data, error } = await supabase
    .from('drop_comments')
    .insert({
      drop_id: c.dropId,
      parent_id: c.parentId,
      type: c.type,
      body: c.body,
      audio_url: c.audioUrl,
      audio_seconds: c.audioSeconds,
    } as never)
    .select(COMMENT_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as DropCommentWithAuthor;
}

/**
 * Elimina un commento. La RLS lo consente all'autore del commento E all'autore
 * del drop (che governa il proprio spazio, safety §9). Cancellare un top-level
 * porta via le sue reply (FK cascade).
 */
export async function deleteDropComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('drop_comments').delete().eq('id', commentId);
  if (error) throw error;
}

/** Segnala un drop ai moderatori (RPC file_report, target 'drop' — già live). */
export const reportDrop = (dropId: string, reason: string) =>
  callRpc('file_report', { p_target_type: 'drop', p_target_id: dropId, p_reason: reason });

/** Segnala un commento ai moderatori (RPC file_report, target 'drop_comment'). */
export const reportDropComment = (commentId: string, reason: string) =>
  callRpc('file_report', {
    p_target_type: 'drop_comment',
    p_target_id: commentId,
    p_reason: reason,
  });

/**
 * Carica il vocale di un commento sul bucket privato `drop-audio` e restituisce
 * il PATH (`<dropId>/<uid>/commento_<ts>.m4a`). Prefisso `commento_` (i drop
 * vocali usano `drop_`): il trigger esige il prefisso `<dropId>/<uid>/`.
 */
export async function uploadDropCommentAudio(
  dropId: string,
  uid: string,
  localUri: string,
): Promise<string> {
  const buffer = await fetch(localUri).then((r) => r.arrayBuffer());
  const path = `${dropId}/${uid}/commento_${Date.now()}.m4a`;
  const { error } = await supabase.storage
    .from(BUCKET_AUDIO)
    .upload(path, buffer, { contentType: 'audio/mp4' });
  if (error) {
    if (/exceeded the maximum allowed size/i.test(error.message)) throw new Error('audio_too_large');
    throw error;
  }
  return path;
}

/**
 * Modera in background il testo di un commento (§9): fire-and-forget verso
 * `moderate-text` (Perspective, degrada senza chiave). Solo commenti testuali.
 */
export function moderaDropComment(commentId: string, text: string | null | undefined): void {
  const t = text?.trim();
  if (!t) return;
  void supabase.functions
    .invoke('moderate-text', { body: { text: t, target_type: 'drop_comment', target_id: commentId } })
    .catch(() => {});
}

/**
 * Chi ha messo like al mio drop (StatistichePrivate, R-04). La RLS di
 * `drop_likes` mostra le righe solo a se stessi ∨ all'autore del drop: per un
 * non-autore questa query torna al più il proprio like. Usata SOLO per l'autore.
 */
export async function fetchDropLikers(dropId: string): Promise<DropLiker[]> {
  const { data, error } = await supabase
    .from('drop_likes')
    .select('user_id, created_at, user:profiles!drop_likes_user_id_fkey(id, username, display_name, avatar_url)')
    .eq('drop_id', dropId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DropLiker[];
}

// =============================================================================
// DM4 — gesti leggeri e archivio privato: eliminazione, Salvati (S4), Ricordi (S5).
// =============================================================================

/**
 * Elimina un drop (eliminazione anticipata §5.4 o Ricordo §S5). SOLO l'autore
 * (RLS `drops_delete_own`), in qualunque momento — anche da Ricordo scaduto. La
 * FK cascade porta via le interazioni residue; il trigger after-delete accoda i
 * file (foto/vocale) alla coda di pulizia storage. Sparisce subito per tutti.
 */
export async function deleteDrop(dropId: string): Promise<void> {
  const { error } = await supabase.from('drops').delete().eq('id', dropId);
  if (error) throw error;
}

/** Colonne del drop embeddato nel segnalibro (S4): l'essenziale per la riga. */
const SAVED_DROP_SELECT =
  'drop_id, created_at,' +
  ' drop:drops!drop_saves_drop_id_fkey(' +
  'id, author_id, type, body, audio_url, media_url, audio_seconds, expires_at, created_at,' +
  ' author:profiles!drops_author_id_fkey(id, username, display_name, avatar_url))';

/**
 * I miei segnalibri (S4). La RLS `drop_saves_select_own` limita alle mie righe;
 * il drop embeddato passa dalla RLS di `drops` (`can_see_drop`) → se scaduto o
 * di un ex-amico arriva `null` e la UI mostra "non disponibile". I salvataggi di
 * drop scaduti sono già stati cancellati dal sistema (D-1): qui quasi sempre vivi.
 */
export async function fetchSavedDrops(): Promise<SavedDropRow[]> {
  const { data, error } = await supabase
    .from('drop_saves')
    .select(SAVED_DROP_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SavedDropRow[];
}

/** Pagina dei Ricordi (S5): stessa cardinalità del feed, keyset desc. */
export const MEMORIES_PAGE = 24;

/** Cursore keyset dei Ricordi: (created_at, id) dell'ultima riga. null = prima pagina. */
export interface MemoryCursor {
  before: string;
  beforeId: string;
}

/**
 * I miei Ricordi (S5): i miei drop SCADUTI (`author_id = me ∧ expires_at < now`).
 * La RLS di `drops` (author ∨ amico-su-drop-vivo) da sola garantisce che, filtrando
 * `expires_at < now`, tornino SOLO i propri drop scaduti; il filtro esplicito su
 * `author_id` aggancia l'indice `(author_id, created_at desc)`. Keyset (created_at
 * desc, id desc) — retention illimitata (R-10), mai OFFSET. `stats_finali` congelate.
 */
export async function fetchMemories(uid: string, cursor: MemoryCursor | null): Promise<MemoryRow[]> {
  let q = supabase
    .from('drops')
    .select('id, type, body, audio_url, media_url, audio_seconds, expires_at, created_at, stats_finali')
    .eq('author_id', uid)
    .lt('expires_at', new Date().toISOString());
  if (cursor) {
    // Keyset composito: created_at < before OR (created_at = before AND id < beforeId).
    q = q.or(`created_at.lt.${cursor.before},and(created_at.eq.${cursor.before},id.lt.${cursor.beforeId})`);
  }
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MEMORIES_PAGE);
  if (error) throw error;
  return (data ?? []) as unknown as MemoryRow[];
}
