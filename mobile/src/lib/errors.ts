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
  edit_window_expired: 'Puoi modificare solo nelle prime 48 ore dal messaggio.',
  cannot_edit_message: 'Questo messaggio non può essere modificato.',
  // Inoltro (CM4 + CM5: testo e foto; i vocali restano vietati — effimeri)
  invalid_forward: 'Il messaggio da inoltrare non è più disponibile.',
  cannot_forward_type: 'I vocali non si possono inoltrare.',
  // Riferimento a un drop in chat (DM5: inoltro / "Rispondi in privato")
  drop_not_visible: 'Questo drop non è più disponibile.',
  invalid_drop_ref: 'Questo drop non si può condividere qui.',
  // Media (CM5)
  media_url_required: 'Foto mancante, riprova a inviarla.',
  invalid_media_type: 'Formato immagine non supportato (usa JPEG, PNG o WebP).',
  invalid_media_path: 'Immagine non valida.',
  media_cannot_expire: 'Le foto non hanno scadenza.',
  invalid_media_fields: 'Messaggio non valido.',
  media_too_large: 'La foto è troppo grande (max 15 MB).',
  permesso_galleria_negato: 'Per allegare foto consenti l’accesso alla galleria nelle impostazioni.',
  permesso_fotocamera_negato: 'Per scattare foto consenti l’accesso alla fotocamera nelle impostazioni.',
  // Gestione gruppo (CM4)
  cannot_edit_dm: 'Le chat 1:1 non si possono modificare.',
  invalid_name: 'Il nome del gruppo deve avere da 1 a 80 caratteri.',
  invalid_avatar_url: 'Immagine del gruppo non valida.',
  target_not_member: 'Questo utente non fa parte del gruppo.',
  // Props (CM4: "Dai un prop" da un messaggio)
  cannot_prop_self: 'Non puoi dare un prop a te stesso.',
  recipient_not_found: 'Utente non trovato.',
  daily_prop_limit: 'Hai raggiunto il limite di prop di oggi. Torna domani!',
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

// =============================================================================
// Drops (M6) — codici sollevati dai trigger di `drops`/interazioni e dallo
// Storage. Mappa DEDICATA (copy "post" ≠ copy chat): `rate_limited` qui parla di
// drop, non di messaggi. Fallback allo stesso testo generico.
// =============================================================================
const DROP_MESSAGES: Record<string, string> = {
  // Creazione drop (trigger drops_before_insert)
  user_not_active: 'Il tuo account non può pubblicare in questo momento.',
  empty_drop: 'Scrivi qualcosa prima di pubblicare.',
  drop_too_long: 'Il testo è troppo lungo (max 2000 caratteri).',
  caption_too_long: 'La didascalia è troppo lunga (max 280 caratteri).',
  missing_audio: 'Registra un vocale prima di pubblicare.',
  missing_media: 'Scegli una foto prima di pubblicare.',
  invalid_audio_duration: 'Il vocale deve durare tra 1 e 300 secondi.',
  invalid_audio_path: 'Vocale non valido, riprova a registrarlo.',
  invalid_media_path: 'Foto non valida, riprova a sceglierla.',
  invalid_drop_fields: 'Drop non valido.',
  rate_limited: 'Hai già condiviso molto oggi: torna domani ✨',
  // Storage (upload foto/audio del drop, normalizzati in media.ts/drops.ts)
  media_too_large: 'La foto è troppo grande (max 15 MB).',
  invalid_media_type: 'Formato immagine non supportato (usa JPEG, PNG o WebP).',
  audio_too_large: 'Il vocale è troppo grande (max 25 MB).',
  // Interazioni (commenti/like/salvataggi — usati da DM3/DM4)
  drop_expired: 'Questo drop è scaduto.',
  drop_not_visible: 'Questo drop non è più disponibile.',
  // Commenti (trigger drop_comments_before_insert — DM3)
  empty_comment: 'Scrivi qualcosa prima di commentare.',
  comment_too_long: 'Il commento è troppo lungo (max 1000 caratteri).',
  invalid_comment_fields: 'Commento non valido.',
  invalid_parent: 'Il commento a cui rispondi non è più disponibile.',
  reply_depth_exceeded: 'Puoi rispondere solo a un commento, non a una risposta.',
  // Permessi OS (sollevati da media.ts/audio.ts)
  permesso_galleria_negato: 'Per condividere una foto consenti l’accesso alla galleria nelle impostazioni.',
  permesso_fotocamera_negato: 'Per scattare una foto consenti l’accesso alla fotocamera nelle impostazioni.',
  permesso_microfono_negato: 'Per registrare un vocale consenti l’accesso al microfono nelle impostazioni.',
};

/** Messaggio utente in italiano per un errore del dominio Drops (fallback generico). */
export function dropErrorMessage(error: unknown): string {
  const code = authErrorCode(error);
  return DROP_MESSAGES[code] ?? 'Qualcosa è andato storto. Riprova.';
}

/**
 * Variante per l'insert diretta in `props`: la violazione dell'indice unico
 * (giver, recipient, tratto, contenuto) arriva come codice SQL 23505, non come
 * codice-stringa — qui (e solo qui) 23505 significa "prop già dato".
 */
export function propErrorMessage(error: unknown): string {
  if ((error as { code?: string })?.code === '23505') {
    return 'Hai già dato questo prop per questo messaggio.';
  }
  return chatErrorMessage(error);
}
