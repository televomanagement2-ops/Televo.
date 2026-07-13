// =============================================================================
// auth.ts — wrapper sulle operazioni di autenticazione/onboarding.
// =============================================================================
// Centralizza le chiamate a Supabase Auth + le RPC di onboarding, così le
// schermate restano "stupide". Tutte le mutazioni delicate (età, invito,
// username, birth_date) passano dalla RPC complete_onboarding (atomica, lato DB).
//
// Email = accesso/registrazione con PASSWORD (signInWithPassword / signUp). Il
// canale OTP (signInWithOtp → verifyOtp) resta vivo SOLO come recupero password:
// si verifica il codice e poi si imposta la nuova password (updateUser). Tutto
// gira in Expo Go. Google/Facebook usano l'OAuth di Supabase (da abilitare).

import { decode as decodeBase64 } from 'base64-arraybuffer';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import type { ProfileRow } from '@/types';

// Chiude la sessione del browser se l'app viene riaperta a metà OAuth.
WebBrowser.maybeCompleteAuthSession();

const normEmail = (email: string) => email.trim().toLowerCase();

/**
 * Helper RPC. In postgrest-js 2.108 l'inferenza dei generici di `rpc()` non
 * aggancia gli Args con i tipi `Database` scritti a mano (Args resta `never`).
 * Isoliamo QUI il cast e lanciamo gli errori: la firma pubblica delle funzioni
 * sotto resta comunque tipizzata.
 */
async function callRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw error;
  return data as T;
}

// --- Email OTP passwordless --------------------------------------------------

/** Invia il codice OTP a 6 cifre all'email (crea l'utente se non esiste). */
export async function sendEmailOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: normEmail(email),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Verifica il codice OTP: alla riuscita la sessione è attiva. */
export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: normEmail(email),
    token: token.trim(),
    type: 'email',
  });
  if (error) throw error;
}

// --- Email + password --------------------------------------------------------
// La password è gestita interamente da Supabase Auth (hash/storage server-side):
// il nostro DB non la tocca mai. signUp crea l'utente → il trigger handle_new_user
// genera lo scheletro profilo (age_verified=false → onboarding). signIn accede a
// un account esistente. Il recupero password usa il canale OTP (vedi più sotto).

/** Accede con email + password a un account ESISTENTE. */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: normEmail(email),
    password,
  });
  if (error) throw error;
}

/** Crea un NUOVO account con email + password (poi prosegue con l'onboarding). */
export async function signUpWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email: normEmail(email),
    password,
  });
  if (error) throw error;
}

/** Imposta una nuova password per l'utente CON SESSIONE attiva (post-OTP reset). */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

// --- OAuth (Google / Facebook) via Supabase + browser ------------------------
// Funziona in Expo Go: apriamo il flow OAuth di Supabase in un browser di sistema
// (expo-web-browser) e, al ritorno sul deep link, raccogliamo i token. Con la
// config di default (flow "implicit") i token arrivano nel fragment dell'URL;
// gestiamo anche il fallback PKCE (?code=) per robustezza.
//
// REQUISITO BACKEND: i provider vanno ABILITATI nella dashboard Supabase
// (Authentication → Providers: Google / Facebook, con Client ID/Secret) e l'URL
// di redirect va aggiunto tra i "Redirect URLs" consentiti. Senza, Supabase
// risponde "provider is not enabled" e mostriamo un messaggio gentile.

export type OAuthProvider = 'google' | 'facebook';

/** Parse "a=1&b=2" → { a: '1', b: '2' } senza dipendere da URLSearchParams. */
function parseKeyValues(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of s.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = eq >= 0 ? part.slice(0, eq) : part;
    const v = eq >= 0 ? part.slice(eq + 1) : '';
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export async function signInWithProvider(provider: OAuthProvider): Promise<void> {
  const redirectTo = Linking.createURL('auth-callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('oauth_no_url');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !('url' in result) || !result.url) {
    // L'utente ha chiuso/annullato il browser: non è un errore "vero".
    throw new Error('oauth_cancelled');
  }

  const returned = result.url;

  // Flow implicito (default): access_token/refresh_token nel fragment (#...).
  const fragment = returned.split('#')[1] ?? '';
  const frag = parseKeyValues(fragment);
  if (frag.access_token && frag.refresh_token) {
    const { error: sessErr } = await supabase.auth.setSession({
      access_token: frag.access_token,
      refresh_token: frag.refresh_token,
    });
    if (sessErr) throw sessErr;
    return;
  }

  // Fallback PKCE: token via ?code=... da scambiare.
  const query = returned.split('?')[1]?.split('#')[0] ?? '';
  const code = parseKeyValues(query).code;
  if (code) {
    const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
    if (exErr) throw exErr;
    return;
  }

  throw new Error('oauth_no_token');
}

// --- Inviti ------------------------------------------------------------------

export interface InviteCheck {
  valid: boolean;
  reason: string | null;
}

/** Valida un codice invito SENZA consumarlo (callabile anche prima del login). */
export async function checkInvite(code: string): Promise<InviteCheck> {
  return callRpc<InviteCheck>('check_invite', { p_code: code.trim() });
}

// --- Profilo / onboarding ----------------------------------------------------

/**
 * Colonne di `profiles` leggibili dal client. Il grant SELECT è PER-COLONNA
 * (grants_audit CM8): `expo_push_token` e `last_active_at` sono escluse per
 * privacy, quindi `select('*')` fallirebbe con "permission denied" (Postgres
 * blocca prima della RLS). Ogni lettura di `profiles` deve usare questa lista
 * (o un sottoinsieme, come CARD_COLS in lib/social.ts) — MAI `*`.
 */
export const PROFILE_COLS =
  'id, username, display_name, age_verified, avatar_url, audio_bio_url, ' +
  'status_text, customization, interests, school_id, aura_score, aura_color, ' +
  'share_location, show_last_seen, show_read_receipts, muted_until, banned_at, ' +
  'created_at, updated_at, deleted_at';

/** Carica il profilo dell'utente corrente (null se non esiste ancora). */
export async function fetchMyProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  // Cast isolato: la riga selezionata è ProfileRow SENZA le 2 colonne non
  // grantate (mai lette dall'app: push token via register_device, presenza via
  // RPC get_peer_presence). Il tipo resta ProfileRow per non propagare un Omit.
  return data as unknown as ProfileRow | null;
}

/** True se lo username è libero (lowercase, case-insensitive lato DB). */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data == null;
}

export interface CompleteOnboardingInput {
  username: string;
  displayName: string | null;
  birthDate: string; // YYYY-MM-DD
  inviteCode: string;
}

/** Finalizza l'account (età + username + birth_date + redeem invito, atomico). */
export async function completeOnboarding(input: CompleteOnboardingInput): Promise<void> {
  await callRpc('complete_onboarding', {
    p_username: input.username.trim().toLowerCase(),
    p_display_name: input.displayName,
    p_birth_date: input.birthDate,
    p_invite_code: input.inviteCode.trim(),
  });
}

/** Registra un consenso GDPR (privacy/tos). */
export async function recordConsent(kind: string, granted: boolean): Promise<void> {
  // PostgREST risolve le RPC per NOME di argomento: i parametri della funzione
  // record_consent sono p_type/p_granted (vedi migrazione gdpr), non kind/granted.
  await callRpc('record_consent', { p_type: kind, p_granted: granted });
}

// --- Foto profilo (facoltativa) ----------------------------------------------
// Upload sul bucket pubblico `avatars`, cartella per-utente (`<uid>/...`): le
// policy storage (avatars_insert_own/_update_own) consentono la scrittura solo
// nella propria cartella. Poi si scrive `profiles.avatar_url` (campo utente).

/** Carica l'immagine (base64) su Storage e restituisce l'URL pubblico. */
export async function uploadAvatar(
  userId: string,
  base64: string,
  mime: string,
): Promise<string> {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/avatar_${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, decodeBase64(base64), { contentType: mime, upsert: true });
  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

/** Imposta l'URL dell'avatar sul proprio profilo. */
export async function setAvatarUrl(userId: string, url: string): Promise<void> {
  // Cast isolato qui: come per le RPC, l'inferenza dei generici di postgrest-js
  // non aggancia gli Update ai tipi `Database` scritti a mano (risolve a `never`).
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: url } as never)
    .eq('id', userId);
  if (error) throw error;
}

// --- Telefono OTP ------------------------------------------------------------
// Codice OTP via SMS. REQUISITO BACKEND: provider SMS attivo (es. Twilio) e
// `[auth.sms] enable_signup = true`. Finché l'SMS è spento lato Supabase, `send`
// fallisce con grazia e la schermata mostra il messaggio (vedi authErrorMessage).

/** Invia un OTP via SMS al numero in formato E.164 (es. +39…). */
export async function sendPhoneOtp(phoneE164: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164 });
  if (error) throw error;
}

/** Verifica l'OTP SMS: alla riuscita la sessione è attiva. */
export async function verifyPhoneOtp(phoneE164: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    phone: phoneE164,
    token: token.trim(),
    type: 'sms',
  });
  if (error) throw error;
}

// --- Logout ------------------------------------------------------------------
// M13/P5 (audit §5.1): scope 'local' — il logout chiude SOLO la sessione di
// questo device. Il default di supabase-js è 'global' e revoca i refresh token
// di TUTTI i device dell'utente: era la causa del sintomo "il login sul secondo
// telefono sgancia il primo". Il flag di modulo permette a useAuthListener di
// distinguere il SIGNED_OUT scelto dall'utente dalla revoca SUBITA (sessione
// scaduta/revocata altrove → dialog, non kick silenzioso).

let logoutVolontario = false;

/**
 * True se il SIGNED_OUT in corso nasce da un signOut esplicito di questo
 * device. Si consuma alla lettura (il prossimo SIGNED_OUT riparte da false).
 */
export function consumaLogoutVolontario(): boolean {
  const volontario = logoutVolontario;
  logoutVolontario = false;
  return volontario;
}

export async function signOut(): Promise<void> {
  logoutVolontario = true;
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (e) {
    logoutVolontario = false;
    throw e;
  }
  // Google disattivato in questa build: nessuna sessione nativa da chiudere.
}

// --- Mappa errori → messaggi IT ---------------------------------------------

/** True se l'errore è "credenziali non valide" (email sconosciuta o pwd errata). */
export function isInvalidCredentials(error: unknown): boolean {
  const raw = ((error as { message?: string })?.message ?? String(error)).toLowerCase();
  return raw.includes('invalid login credentials');
}

/** True se in fase di registrazione l'email risulta già registrata. */
export function isUserAlreadyRegistered(error: unknown): boolean {
  const raw = ((error as { message?: string })?.message ?? String(error)).toLowerCase();
  return raw.includes('user already registered') || raw.includes('already been registered');
}

/** Estrae il codice-stringa da un errore RPC/Supabase (es. 'age_below_minimum'). */
export function authErrorCode(error: unknown): string {
  const msg = (error as { message?: string })?.message ?? String(error);
  // Le RPC sollevano `... : <codice>`; teniamo l'ultima parola-codice.
  return msg.replace(/^.*:\s*/, '').trim();
}

/** Messaggio utente in italiano per i codici noti. Stringa vuota = silenzioso. */
export function authErrorMessage(error: unknown): string {
  const raw = ((error as { message?: string })?.message ?? String(error)).toLowerCase();
  const code = authErrorCode(error);

  // Casi riconosciuti dal testo del messaggio Supabase (più robusti dello switch).
  if (raw.includes('provider is not enabled') || raw.includes('unsupported provider')) {
    return 'Questo accesso non è ancora attivo. Per ora usa l’email.';
  }
  if (raw.includes('sms') || raw.includes('phone')) {
    return 'L’accesso via SMS non è ancora attivo. Per ora usa l’email.';
  }
  // Password: messaggi di Supabase Auth (gauntlet di casi noti).
  if (raw.includes('invalid login credentials')) {
    return 'Email o password non corretti.';
  }
  if (raw.includes('user already registered') || raw.includes('already been registered')) {
    return 'Esiste già un account con questa email. Inserisci la password per accedere.';
  }
  if (raw.includes('password should be at least') || raw.includes('weak') || code === 'weak_password') {
    return 'La password deve avere almeno 8 caratteri.';
  }
  if (raw.includes('email not confirmed')) {
    return 'Devi confermare l’email prima di accedere. Controlla la posta.';
  }
  if (raw.includes('rate limit') || raw.includes('too many')) {
    return 'Troppi tentativi. Riprova tra un minuto.';
  }

  switch (code) {
    case 'oauth_cancelled':
      return ''; // l'utente ha annullato: nessun messaggio d'errore.
    case 'oauth_no_token':
    case 'oauth_no_url':
      return 'Accesso non completato. Riprova.';
    case 'missing_code':
    case 'invite_invalid':
      return 'Codice invito non valido.';
    case 'invite_expired':
      return 'Questo invito è scaduto.';
    case 'invite_exhausted':
      return 'Questo invito è già stato usato.';
    case 'age_below_minimum':
      return 'Devi avere almeno 16 anni per usare Televo.';
    case 'username_invalid':
      return 'Username non valido (3–20 caratteri: lettere minuscole, numeri, _ o .).';
    case 'username_taken':
      return 'Questo username è già preso.';
    case 'not_authenticated':
      return 'Sessione scaduta, riprova.';
    case 'invite_budget_exhausted':
      return 'Hai finito i tuoi inviti per ora.';
    case 'Invalid login credentials':
    case 'Token has expired or is invalid':
      return 'Codice non valido o scaduto. Richiedine uno nuovo.';
    default:
      return 'Qualcosa è andato storto. Riprova.';
  }
}
