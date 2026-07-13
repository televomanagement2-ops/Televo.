// =============================================================================
// useNotifiche — servizi push della shell autenticata (CM6, RC-13; M13/P3).
// =============================================================================
// Tre hook:
// - usePushRuntime (ChatRuntime): handler foreground + registrazione token se
//   il permesso è GIÀ concesso + PRE-PROMPT del permesso al primo ingresso
//   nella shell (P3: è il percorso PRIMARIO — l'onboarding non chiede mai il
//   permesso) + ri-registrazione alla rotazione del token + badge icona =
//   somma unread (stessa fonte del badge tab, §8.5).
// - useNotificaTap (ChatRuntime): tap su una push → navigazione alla schermata
//   giusta, cold start incluso. Vive nella shell autenticata di proposito:
//   monta solo quando auth e navigazione sono pronte (niente race al boot).
// - usePushBanner (hub S1): banner "Attiva le notifiche" — da P3 è il percorso
//   SECONDARIO (resta per chi sceglie "Non ora" al pre-prompt).

import { useCallback, useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadTotale } from '@/hooks/useChat';
import {
  aggiornaBadgeApp,
  installNotificationHandler,
  registraTokenPush,
  richiediPermessoERegistra,
  statoPermessoPush,
  type PermessoPush,
} from '@/lib/expo-push';
import { conferma } from '@/lib/dialoghi';
import { dynamicRoutes, ROUTES } from '@/constants/routes';

// --- Runtime push (handler + token + badge + pre-prompt P3) ---------------------

// Flag persistente "pre-prompt già mostrato": UNA volta nella vita
// dell'installazione, qualunque sia stata la scelta (AUDIT-HARDENING §3.3).
const PREPROMPT_KEY = 'televo.push.preprompt_mostrato';

// Respiro dopo il primo frame della shell: il pre-prompt non deve coprire
// l'atterraggio in Home (né competere con lo slot-dialogo al mount).
const PREPROMPT_RITARDO_MS = 2000;

/**
 * Da montare UNA volta nella shell autenticata (ChatRuntime, che monta SOLO
 * post-onboarding). Se il permesso è già concesso ri-registra il token a ogni
 * avvio (last_seen fresco, riassegnazione dopo cambio account); se non è mai
 * stato chiesto, mostra il pre-prompt (P3). Il prompt OS si può chiedere UNA
 * sola volta: il pre-prompt lo protegge (il dialog di sistema parte solo su
 * "Attiva"); su 'denied' non si ri-chiede MAI (si rispetta la scelta).
 */
export function usePushRuntime(): void {
  const { session } = useAuth();
  const uid = session?.user.id;
  const unread = useUnreadTotale();

  useEffect(() => {
    if (!uid) return;
    installNotificationHandler();
    void (async () => {
      if ((await statoPermessoPush()) === 'granted') await registraTokenPush();
    })();
  }, [uid]);

  // P3: FCM/APNs possono ruotare il token in qualunque momento a app viva —
  // senza ri-registrazione il device torna irraggiungibile fino al prossimo
  // avvio. L'evento porta il token NATIVO: si ricava e registra quello Expo.
  useEffect(() => {
    if (!uid) return;
    const sub = Notifications.addPushTokenListener(() => {
      void (async () => {
        if ((await statoPermessoPush()) === 'granted') await registraTokenPush();
      })();
    });
    return () => sub.remove();
  }, [uid]);

  // P3: pre-prompt del permesso, ~2s dopo il primo frame della shell. È il fix
  // della root cause di P0 (il permesso era chiesto SOLO dal banner chiudibile
  // dell'hub Messaggi → devices vuota → nessuna push, di nessun tipo).
  useEffect(() => {
    if (!uid) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          // Solo se il prompt OS non è mai stato deciso e mai proposto da noi.
          if ((await statoPermessoPush()) !== 'undetermined') return;
          if (await SecureStore.getItemAsync(PREPROMPT_KEY)) return;
          await SecureStore.setItemAsync(PREPROMPT_KEY, '1');
          conferma({
            titolo: 'Attiva le notifiche',
            messaggio:
              'Ti avvisiamo per i messaggi, gli amici in live e le richieste di amicizia.',
            confermaLabel: 'Attiva',
            annullaLabel: 'Non ora',
            onConferma: () => {
              void richiediPermessoERegistra();
            },
          });
        } catch {
          // SecureStore indisponibile: nessun prompt ora, si ritenta a un
          // prossimo avvio (il banner dell'hub resta comunque disponibile).
        }
      })();
    }, PREPROMPT_RITARDO_MS);
    return () => clearTimeout(timer);
  }, [uid]);

  // Badge icona app: null = lista conversazioni non ancora caricata → non
  // azzerare un badge magari giusto; si aggiorna al primo dato reale.
  useEffect(() => {
    if (!uid || unread == null) return;
    void aggiornaBadgeApp(unread);
  }, [uid, unread]);
}

// --- Tap sulla notifica → deep link -------------------------------------------

// Ultima risposta gestita, persistita: su Android l'intent del tap è "sticky" e
// getLastNotificationResponseAsync può ripresentare la STESSA risposta a un
// riavvio successivo — senza dedup si riaprirebbe la chat dal nulla.
const ULTIMO_TAP_KEY = 'televo.push.ultimo_tap';

/** Rotta di destinazione per il payload della push (null = basta aprire l'app). */
function rottaPerNotifica(data: Record<string, unknown>): string | null {
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
  // M13/P6: "nuovo accesso al tuo account" → tab Notifiche della bottombar
  // (per ora placeholder: diventa la lista reale in P10; il deep link è già
  // quello giusto). Il banner sul device che ha appena fatto login è soppresso
  // a monte da installNotificationHandler.
  if (data.type === 'new_login') {
    return ROUTES.notifiche;
  }
  // prop / achievement: la tab Notifiche arriva con P10.
  return null;
}

export function useNotificaTap(): void {
  const router = useRouter();

  useEffect(() => {
    let attivo = true;

    const gestisci = (risposta: Notifications.NotificationResponse) => {
      SecureStore.setItemAsync(
        ULTIMO_TAP_KEY,
        risposta.notification.request.identifier,
      ).catch(() => {});
      const data = (risposta.notification.request.content.data ?? {}) as Record<string, unknown>;
      const rotta = rottaPerNotifica(data);
      // Deferita di un tick: mai navigare dentro il primissimo render della shell.
      if (rotta) setTimeout(() => router.push(rotta), 0);
    };

    // Tap ad app viva (background → foreground).
    const sub = Notifications.addNotificationResponseReceivedListener(gestisci);

    // Cold start: l'app è stata APERTA dal tap (con dedup, vedi sopra).
    void (async () => {
      try {
        const ultima = await Notifications.getLastNotificationResponseAsync();
        if (!attivo || !ultima) return;
        const giaGestita = await SecureStore.getItemAsync(ULTIMO_TAP_KEY).catch(() => null);
        if (giaGestita === ultima.notification.request.identifier) return;
        gestisci(ultima);
      } catch {
        // Runtime senza push (Expo Go Android): nessun cold start da gestire.
      }
    })();

    return () => {
      attivo = false;
      sub.remove();
    };
  }, [router]);
}

// --- Banner contestuale "Attiva le notifiche" (S1) -----------------------------

// Chiusura SOLO in memoria: se l'utente sceglie "non ora" il banner riappare
// alla prossima sessione (gentile ma non permanente). Una volta che il permesso
// di sistema è stato deciso (granted/denied), lo stato ≠ undetermined lo
// nasconde per sempre — nessun flag su disco da mantenere.
let bannerChiusoInSessione = false;

/**
 * Stato del banner contestuale del permesso (primo ingresso nell'hub):
 * `visibile` solo se il permesso non è mai stato chiesto e il banner non è
 * stato chiuso in questa sessione. `attiva` apre il dialog di sistema e, se
 * concesso, registra subito il token.
 */
export function usePushBanner() {
  const [stato, setStato] = useState<PermessoPush | null>(null);
  const [chiuso, setChiuso] = useState(bannerChiusoInSessione);

  useEffect(() => {
    void statoPermessoPush().then(setStato);
  }, []);

  const attiva = useCallback(async () => {
    await richiediPermessoERegistra();
    // Lo stato si rilegge dal sistema: "concesso ma token fallito" (Expo Go
    // Android) resta granted → il banner sparisce comunque, correttamente.
    setStato(await statoPermessoPush());
  }, []);

  const chiudi = useCallback(() => {
    bannerChiusoInSessione = true;
    setChiuso(true);
  }, []);

  return { visibile: stato === 'undetermined' && !chiuso, attiva, chiudi };
}
