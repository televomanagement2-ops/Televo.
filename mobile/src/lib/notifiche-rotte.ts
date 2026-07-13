// =============================================================================
// notifiche-rotte.ts — payload notifica → rotta di destinazione (M13/P10).
// =============================================================================
// UNICA mappa type→rotta, condivisa dal tap sulle PUSH (useNotificaTap) e
// dalle righe della tab Notifiche (NotificaRow). La push viaggia con
// `data = { type, notification_id, ...payload }` (Edge send-push); la riga del
// ledger si normalizza allo stesso shape con `{ type: riga.type, ...payload }`.
// Estratta da useNotifiche (P10) per riuso senza dipendenze da hook.

import { dynamicRoutes, ROUTES } from '@/constants/routes';

/** Rotta di destinazione per il payload della notifica (null = basta aprire l'app). */
export function rottaPerNotifica(data: Record<string, unknown>): string | null {
  if (data.type === 'message' && typeof data.conversation_id === 'string') {
    return dynamicRoutes.chat(data.conversation_id);
  }
  // M6/DM5: commento/reply su un mio drop → dettaglio S3 (payload {drop_id, comment_id}).
  if (data.type === 'drop_comment' && typeof data.drop_id === 'string') {
    return dynamicRoutes.drop(data.drop_id);
  }
  // DM7 (§16.2): "tema del giorno" → composer (S2), che mostra il tema in banner.
  if (data.type === 'drop_prompt') {
    return ROUTES.dropNuovo;
  }
  if (data.type === 'friend_request' || data.type === 'friend_accepted') {
    return ROUTES.amici;
  }
  // M12 (LM6): "amico in diretta" / invito co-host → schermo live (payload
  // {live_id, host_id} da create_live/live_invite_cohost). Se nel frattempo la
  // live è finita, lo schermo mostra lo stato pulito "live terminata".
  if (
    (data.type === 'live_started' || data.type === 'live_cohost_invite') &&
    typeof data.live_id === 'string'
  ) {
    return dynamicRoutes.live(data.live_id);
  }
  // P10: un prop ricevuto e i movimenti dell'Aura si leggono nel dettaglio
  // Aura del proprio profilo (M3).
  if (data.type === 'prop' || data.type === 'aura_upgrade' || data.type === 'aura_downgrade') {
    return ROUTES.profiloAura;
  }
  // P10: i badge vivono nel profilo (la vista dedicata /profilo/achievement
  // non è ancora costruita: la rotta esiste solo in ROUTES).
  if (data.type === 'achievement') {
    return ROUTES.profilo;
  }
  // M13/P6: "nuovo accesso al tuo account" → tab Notifiche della bottombar.
  // Il banner sul device che ha appena fatto login è soppresso a monte da
  // installNotificationHandler.
  if (data.type === 'new_login') {
    return ROUTES.notifiche;
  }
  return null;
}
