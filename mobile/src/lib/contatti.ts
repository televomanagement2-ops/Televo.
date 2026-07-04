// =============================================================================
// contatti.ts — rubrica → hash → match (CM7, D1: solo email).
// =============================================================================
// Privacy by design: la rubrica NON lascia mai il device in chiaro. Si leggono
// SOLO le email (niente numeri: decisione utente D1), si normalizzano
// (trim+lowercase, lo stesso schema del backend), se ne calcola lo SHA-256 e si
// mandano al server solo le impronte, a batch da 500 (cap server 1000 per
// chiamata). Tutte le RPC richiedono il consenso GDPR 'contacts_sync' attivo
// (gate server-side); la revoca è ATOMICA (revoke_contacts_sync: cancella gli
// hash propri E revoca il consenso in una transazione).

import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import { callRpc } from '@/lib/rpc';

/** Utente Televo trovato in rubrica (result set di match_contacts). */
export interface ContattoMatch {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

/** Batch inviati al server: metà del cap (1000) → payload contenuti. */
const BATCH = 500;

/** Chiede il permesso OS di lettura rubrica. */
export async function richiediPermessoRubrica(): Promise<boolean> {
  const { granted } = await Contacts.requestPermissionsAsync();
  return granted;
}

/** Normalizzazione IDENTICA a quella attesa dal backend (email lowercase). */
export function normalizzaEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** SHA-256 esadecimale dell'email normalizzata (lo schema hash del backend). */
export function hashEmail(email: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalizzaEmail(email));
}

/**
 * Legge la rubrica (SOLO il campo email), normalizza e deduplica.
 * Richiede il permesso OS già concesso.
 */
export async function leggiEmailRubrica(): Promise<string[]> {
  const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Emails] });
  const uniche = new Set<string>();
  for (const contatto of data) {
    for (const voce of contatto.emails ?? []) {
      if (!voce.email) continue;
      const email = normalizzaEmail(voce.email);
      if (email.includes('@')) uniche.add(email);
    }
  }
  return [...uniche];
}

/**
 * Registra l'impronta della PROPRIA email (così gli amici possono trovarmi).
 * No-op se l'email di sessione manca (account OAuth teorico): in quel caso il
 * match resta unidirezionale — io trovo gli altri, gli altri non trovano me.
 */
export async function registraMioHash(myEmail: string | null | undefined): Promise<void> {
  if (!myEmail) return;
  const hash = await hashEmail(myEmail);
  await callRpc('register_contact_hash', { p_kind: 'email', p_hash: hash });
}

/** match_contacts a batch, unione con dedup per userId. */
export async function matchRubrica(hashes: string[]): Promise<ContattoMatch[]> {
  const perId = new Map<string, ContattoMatch>();
  for (let i = 0; i < hashes.length; i += BATCH) {
    const rows = await callRpc<{ user_id: string; username: string; avatar_url: string | null }[]>(
      'match_contacts',
      { p_hashes: hashes.slice(i, i + BATCH) },
    );
    for (const r of rows ?? []) {
      perId.set(r.user_id, { userId: r.user_id, username: r.username, avatarUrl: r.avatar_url });
    }
  }
  return [...perId.values()];
}

/** Flusso completo post-consenso: mio hash → rubrica → hash → match. */
export async function sincronizzaContatti(
  myEmail: string | null | undefined,
): Promise<ContattoMatch[]> {
  await registraMioHash(myEmail);
  const emails = await leggiEmailRubrica();
  if (emails.length === 0) return [];
  const hashes = await Promise.all(emails.map(hashEmail));
  return matchRubrica(hashes);
}

/** Revoca ATOMICA: cancella gli hash propri e revoca il consenso (una RPC). */
export async function revocaContatti(): Promise<void> {
  await callRpc('revoke_contacts_sync', {});
}
