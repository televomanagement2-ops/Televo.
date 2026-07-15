// =============================================================================
// useNotifiche — servizi push della shell autenticata (CM6, RC-13; M13/P3).
// =============================================================================
// Tre hook:
// - usePushRuntime (ChatRuntime): handler foreground + registrazione token se
//   il permesso è GIÀ concesso (all'avvio E al ritorno in foreground, M14R2) +
//   PRE-PROMPT del permesso all'ingresso nella shell (P3: è il percorso
//   PRIMARIO — l'onboarding non chiede mai il permesso; si ripropone con
//   cadenza ≥24h finché il permesso resta da decidere, M14R2/F3) +
//   ri-registrazione alla rotazione del token + badge icona = somma unread
//   (stessa fonte del badge tab, §8.5).
// - useNotificaTap (ChatRuntime): tap su una push → navigazione alla schermata
//   giusta, cold start incluso. Vive nella shell autenticata di proposito:
//   monta solo quando auth e navigazione sono pronte (niente race al boot).
// - usePushBanner (hub S1): banner "Attiva le notifiche" — da P3 è il percorso
//   SECONDARIO (resta per chi sceglie "Non ora" al pre-prompt).

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadTotale } from '@/hooks/useChat';
import { notificheKeys, useNotificheUnread } from '@/hooks/useNotificheTab';
import {
  aggiornaBadgeApp,
  installNotificationHandler,
  registraTokenPush,
  richiediPermessoERegistra,
  statoPermessoPush,
  tokenPushRegistrato,
  type PermessoPush,
} from '@/lib/expo-push';
import { conferma, useDialoghiStore } from '@/lib/dialoghi';
import { subscribeNotificheAll } from '@/lib/notifiche-realtime';
import { rottaPerNotifica } from '@/lib/notifiche-rotte';

// --- Runtime push (handler + token + badge + pre-prompt P3) ---------------------

// Ultima proposta del pre-prompt (timestamp ms persistito). M14R2/F3: finché
// il permesso di sistema resta DA DECIDERE ('undetermined'), il pre-prompt si
// ripropone con cadenza gentile — mai più spesso del cooldown. Un timestamp,
// non un flag: un flag "per sempre" si brucia anche quando il dialogo non
// viene mai visto (slot-dialogo rimpiazzato) e SecureStore sopravvive a
// upgrade e backup di Android — sui device del PO il prompt non riappariva
// più in nessuna build. Su 'denied' non si chiede comunque MAI (scelta fatta).
const PREPROMPT_TS_KEY = 'televo.push.preprompt_ultimo';
const PREPROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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
  const { uid } = useAuth();
  const queryClient = useQueryClient();
  const unreadChat = useUnreadTotale();
  const unreadNotifiche = useNotificheUnread();

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
          // Solo finché il prompt OS resta da decidere, e non più spesso del
          // cooldown. M14R3: se lo slot-dialogo è già occupato NON si brucia
          // il giro (il timestamp si scrive prima di mostrare: rimpiazzare un
          // altro dialogo — o esserne rimpiazzati — costerebbe 24h di attesa
          // per un prompt mai visto); si riproverà al prossimo ingresso.
          if ((await statoPermessoPush()) !== 'undetermined') return;
          if (useDialoghiStore.getState().dialogo != null) return;
          const ultimo = Number(await SecureStore.getItemAsync(PREPROMPT_TS_KEY)) || 0;
          if (Date.now() - ultimo < PREPROMPT_COOLDOWN_MS) return;
          await SecureStore.setItemAsync(PREPROMPT_TS_KEY, String(Date.now()));
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

  // M14R2/F3: chi attiva le notifiche A MANO dalle impostazioni di sistema
  // torna nell'app con permesso concesso ma token mai registrato — prima
  // serviva un riavvio. Al ritorno in foreground, se manca la registrazione
  // di sessione e il permesso ora c'è, il token si registra subito.
  useEffect(() => {
    if (!uid) return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active' || tokenPushRegistrato()) return;
      void (async () => {
        if ((await statoPermessoPush()) === 'granted') await registraTokenPush();
      })();
    });
    return () => sub.remove();
  }, [uid]);

  // P10: una push arrivata in FOREGROUND aggiorna subito ledger e badge della
  // tab Notifiche (in background ci pensano il refetch al focus e il campo
  // badge della Edge).
  useEffect(() => {
    if (!uid) return;
    const sub = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: notificheKeys.radice(uid) });
    });
    return () => sub.remove();
  }, [uid, queryClient]);

  // M14R2/F5: il canale realtime del ledger è la fonte PRIMARIA del badge
  // campanella — vive anche senza permesso notifiche e senza push consegnate
  // (il listener push qui sopra resta come cintura per il payload di sistema).
  useEffect(() => {
    if (!uid) return;
    return subscribeNotificheAll(uid, () => {
      void queryClient.invalidateQueries({ queryKey: notificheKeys.radice(uid) });
    });
  }, [uid, queryClient]);

  // Badge icona app = unread chat + unread notifiche (§7/§8.5). null = fonte
  // non ancora caricata → non azzerare un badge magari giusto; si aggiorna al
  // primo dato reale di ENTRAMBE. Nota: la Edge send-push calcola il proprio
  // `badge` come unread del SOLO ledger (message incluse) — divergenza
  // annotata, riallineabile lato Edge (P4).
  useEffect(() => {
    if (!uid || unreadChat == null || unreadNotifiche == null) return;
    void aggiornaBadgeApp(unreadChat + unreadNotifiche);
  }, [uid, unreadChat, unreadNotifiche]);
}

// --- Tap sulla notifica → deep link -------------------------------------------

// Ultima risposta gestita, persistita: su Android l'intent del tap è "sticky" e
// getLastNotificationResponseAsync può ripresentare la STESSA risposta a un
// riavvio successivo — senza dedup si riaprirebbe la chat dal nulla.
const ULTIMO_TAP_KEY = 'televo.push.ultimo_tap';

// P10: la mappa type→rotta vive in lib/notifiche-rotte.ts, condivisa con le
// righe della tab Notifiche (stesso shape: { type, ...payload }).

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
