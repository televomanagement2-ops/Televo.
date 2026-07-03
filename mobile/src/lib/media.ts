// =============================================================================
// media.ts — scelta, upload e visualizzazione delle foto in chat (CM5, D3).
// =============================================================================
// Specchio di `audio.ts`: le foto stanno nel bucket PRIVATO `chat-media` (le
// immagini dei minori non sono mai pubbliche), quindi in `messages.media_url`
// salviamo il PATH storage (`<conv>/<uid>/<file>`) e firmiamo URL temporanei
// solo per i membri della conversazione (RLS path-based).
// Le foto sono PERMANENTI (decisione 2026-07-03): mai `expires_at`.
// NIENTE base64 dal picker (foto fino a 15 MB: i byte si leggono con
// fetch()+arrayBuffer() come per i vocali); `quality: 0.7` ricodifica in JPEG
// (copre anche gli HEIC di iOS, fuori dalla whitelist MIME del bucket).

import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

const BUCKET = 'chat-media';
// TTL dell'URL firmato: 1h (come i vocali). Rifirma al bisogno con margine.
const SIGNED_TTL_SECONDS = 60 * 60;

// --- Scelta della foto (galleria / fotocamera) -------------------------------

export interface FotoScelta {
  uri: string;
  mimeType: string;
}

/** Opzioni comuni: niente crop forzato, compressione a monte, niente exif. */
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  quality: 0.7,
  exif: false,
};

function toFotoScelta(res: ImagePicker.ImagePickerResult): FotoScelta | null {
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset?.uri) return null;
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' };
}

/**
 * Apre la galleria. Ritorna null se l'utente annulla; lancia
 * `permesso_galleria_negato` se il permesso OS manca (il chiamante mostra
 * l'invito alle impostazioni).
 */
export async function scegliFotoDaGalleria(): Promise<FotoScelta | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('permesso_galleria_negato');
  return toFotoScelta(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
}

/** Apre la fotocamera. Stessa semantica di `scegliFotoDaGalleria`. */
export async function scattaFoto(): Promise<FotoScelta | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('permesso_fotocamera_negato');
  return toFotoScelta(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
}

// --- Upload ------------------------------------------------------------------

/** Estensione file dal MIME (whitelist del bucket: png/jpeg/webp). */
function extDaMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Carica la foto sul bucket privato e restituisce il PATH storage
 * (`<conv>/<uid>/foto_<ts>.<ext>`) da salvare in `messages.media_url`.
 * Gli errori dello Storage vengono mappati in codici-stringa per `errors.ts`.
 */
export async function uploadFoto(
  conversationId: string,
  uid: string,
  localUri: string,
  mimeType: string,
): Promise<string> {
  const buffer = await fetch(localUri).then((r) => r.arrayBuffer());
  const path = `${conversationId}/${uid}/foto_${Date.now()}.${extDaMime(mimeType)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimeType });
  if (error) {
    // Lo Storage non usa i nostri codici: normalizziamo i casi noti in IT.
    if (/exceeded the maximum allowed size/i.test(error.message)) {
      throw new Error('media_too_large');
    }
    if (/mime type .* is not supported/i.test(error.message)) {
      throw new Error('invalid_media_type');
    }
    throw error;
  }
  return path;
}

// --- URL firmato (thumbnail + viewer) ----------------------------------------

// Cache in-memory dei signed URL: path → { url, scadenza(ms) }. Condivisa tra
// bolla e viewer; rifirma con 60s di margine (specchio di signedUrlVocale).
const signedCache = new Map<string, { url: string; expiresAt: number }>();

/** URL firmato temporaneo per mostrare una foto (bucket privato). */
export async function signedUrlFoto(path: string): Promise<string> {
  const cached = signedCache.get(path);
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error) throw error;
  const url = data.signedUrl;
  signedCache.set(path, { url, expiresAt: Date.now() + SIGNED_TTL_SECONDS * 1000 });
  return url;
}

// --- Inoltro (copia server-side) ----------------------------------------------

/**
 * Copia il file di una foto nella conversazione di destinazione (inoltro).
 * La copia avviene SUL SERVER via Storage API: la RLS fa da doppio cancello
 * (SELECT sull'origine = membro; INSERT su `<destConv>/<uid>/…` = propria
 * cartella) e il trigger DB esige il prefisso della destinazione. Il file
 * copiato vive nella conversazione di destinazione: stessa semantica
 * dell'inoltro testo (sopravvive a cancellazioni/GDPR dell'origine).
 */
export async function copiaFotoInoltro(
  srcPath: string,
  destConvId: string,
  uid: string,
): Promise<string> {
  const ext = srcPath.split('.').pop() ?? 'jpg';
  const dest = `${destConvId}/${uid}/foto_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).copy(srcPath, dest);
  if (error) throw error;
  return dest;
}
