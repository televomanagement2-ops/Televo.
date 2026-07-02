// =============================================================================
// errors.ts — mappa i codici-stringa sollevati dalle RPC (amicizie, chat,
// moderazione) in messaggi utente in italiano. Le RPC sollevano `... : <codice>`;
// riusiamo authErrorCode per estrarlo. Fallback generico, mai stringa vuota.
// =============================================================================

import { authErrorCode } from '@/lib/auth';

const MESSAGES: Record<string, string> = {
  // Amicizie
  not_friends: 'Potete scrivervi solo se siete amici.',
  already_friends: 'Siete già amici.',
  pending: 'Richiesta già inviata, in attesa di risposta.',
  // Neutro: può arrivare anche al bloccato, il blocco altrui non va rivelato.
  blocked: 'Non è possibile completare questa operazione.',
  invalid_target: 'Utente non valido.',
  target_not_found: 'Utente non trovato.',
  no_pending_request: 'Nessuna richiesta da accettare.',
  cannot_accept_own_request: 'Non puoi accettare la tua stessa richiesta.',
  not_blocked: 'Questo utente non è bloccato.',
  not_blocker: 'Non puoi sbloccare questo utente.',
  user_not_active: 'Account non attivo.',
  // Conversazioni / messaggi
  not_conv_member: 'Non fai parte di questa conversazione.',
  not_admin: 'Solo un admin può farlo.',
  cannot_add_to_dm: 'Non puoi aggiungere membri a una chat 1:1.',
  cannot_remove_from_dm: 'Non puoi gestire i membri di una chat 1:1.',
  use_leave_conversation: 'Per uscire dal gruppo usa "Esci".',
  not_allowed: 'Operazione non consentita.',
  conversation_not_found: 'Conversazione non trovata.',
  use_get_or_create_dm: 'Usa la chat diretta per i messaggi 1:1.',
  invalid_reply_to: 'Il messaggio a cui rispondi non è valido.',
  invalid_expiry: 'Scadenza del vocale non valida.',
  message_not_found: 'Messaggio non trovato.',
  // Blocco e invio (CM1) — neutro: lo vede anche il bloccato (es. outbox);
  // chi ha bloccato ha già la spiegazione nel composer disabilitato.
  blocked_pair: 'Non è possibile inviare il messaggio.',
  message_too_long: 'Il messaggio è troppo lungo (max 4096 caratteri).',
  rate_limited: 'Stai scrivendo troppo velocemente. Aspetta un secondo.',
  edit_window_expired: 'Puoi editare solo nei primi 48h dal messaggio.',
  cannot_edit_message: 'Questo messaggio non può essere editato.',
  // Moderazione (CM1)
  user_muted: 'Sei silenziato fino a un certo orario. Torna dopo.',
  user_banned: 'Il tuo account è stato sospeso.',
  // Organizzazione chat (D4)
  invalid_flag: 'Azione non riconosciuta.',
  invalid_mute: 'Durata del silenzia non valida.',
  // Rubrica (D1)
  consent_required: 'Serve il consenso alla sincronizzazione dei contatti.',
  invalid_kind: 'Tipo di contatto non valido.',
  invalid_hash: 'Contatto non valido.',
  too_many_hashes: 'Troppi contatti insieme: riprova a blocchi.',
  // Sessione
  not_authenticated: 'Sessione scaduta, riprova ad accedere.',
};

/** Messaggio utente in italiano per un errore RPC/Supabase (fallback generico). */
export function chatErrorMessage(error: unknown): string {
  const code = authErrorCode(error);
  return MESSAGES[code] ?? 'Qualcosa è andato storto. Riprova.';
}
