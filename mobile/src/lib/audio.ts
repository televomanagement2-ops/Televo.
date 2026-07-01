// =============================================================================
// audio.ts — registrazione, upload e riproduzione dei vocali effimeri (M2).
// =============================================================================
// Isola l'integrazione con expo-av e lo Storage dalla UI. I vocali stanno nel
// bucket PRIVATO `voice-messages` (la voce dei minori non è mai pubblica): quindi
// NON esiste un URL pubblico — in `messages.audio_url` salviamo il PATH storage e
// firmiamo un URL temporaneo (createSignedUrl) solo al momento della riproduzione,
// per i soli membri della conversazione (RLS path-based `<conv>/<uid>/<file>`).
// Registriamo in `.m4a` (audio/mp4): è nella whitelist MIME del bucket e leggero.

import { Audio } from 'expo-av';
import { supabase } from '@/lib/supabase';

const BUCKET = 'voice-messages';
// TTL dell'URL firmato: 1h. Riproduzioni oltre l'ora rifirmano al play successivo.
const SIGNED_TTL_SECONDS = 60 * 60;

// --- Permesso microfono ------------------------------------------------------

/** Chiede (o verifica) il permesso microfono e prepara la modalità audio. */
export async function richiediPermessoMic(): Promise<boolean> {
  const { granted } = await Audio.requestPermissionsAsync();
  if (!granted) return false;
  // iOS: consenti la registrazione e la riproduzione anche in modalità silenziosa.
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  return true;
}

// --- Registrazione -----------------------------------------------------------

/** Avvia una nuova registrazione (preset HIGH_QUALITY → .m4a su iOS/Android). */
export async function avviaRegistrazione(): Promise<Audio.Recording> {
  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY,
  );
  return recording;
}

export interface RegistrazioneFinita {
  uri: string;
  durationMillis: number;
}

/** Ferma la registrazione e restituisce URI locale + durata. */
export async function fermaRegistrazione(
  recording: Audio.Recording,
): Promise<RegistrazioneFinita> {
  const status = await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  // Ripristina la modalità audio (registrazione off) dopo lo stop.
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
  if (!uri) throw new Error('recording_no_uri');
  return { uri, durationMillis: status.durationMillis ?? 0 };
}

// --- Upload ------------------------------------------------------------------

/**
 * Carica il file locale sul bucket privato e restituisce il PATH storage
 * (`<conv>/<uid>/<file>.m4a`) da salvare in `messages.audio_url`.
 * I byte si leggono con fetch()+arrayBuffer(): funziona su URI `file://` in RN,
 * senza dipendenze aggiuntive (expo-file-system non serve).
 */
export async function uploadVocale(
  conversationId: string,
  uid: string,
  localUri: string,
): Promise<string> {
  const buffer = await fetch(localUri).then((r) => r.arrayBuffer());
  const path = `${conversationId}/${uid}/vocale_${Date.now()}.m4a`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'audio/mp4' });
  if (error) throw error;
  return path;
}

// --- Riproduzione (URL firmato) ---------------------------------------------

// Cache in-memory dei signed URL: path → { url, scadenza(ms) }. Evita di rifirmare
// a ogni play nello stesso minuto. Rifirma quando manca poco alla scadenza.
const signedCache = new Map<string, { url: string; expiresAt: number }>();

/** URL firmato temporaneo per riprodurre un vocale (bucket privato). */
export async function signedUrlVocale(path: string): Promise<string> {
  const cached = signedCache.get(path);
  // Rifirma con 60s di margine prima della scadenza reale.
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error) throw error;
  const url = data.signedUrl;
  signedCache.set(path, { url, expiresAt: Date.now() + SIGNED_TTL_SECONDS * 1000 });
  return url;
}
