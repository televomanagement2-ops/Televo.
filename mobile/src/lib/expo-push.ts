// =============================================================================
// expo-push.ts — lato client delle notifiche push (CM6, RC-13).
// =============================================================================
// Il backend è già completo: i trigger accodano in `notifications`, pg_cron →
// dispatch_push → Edge `send-push` invia via Expo ai token in `devices`. Qui
// vive SOLO il lato device: permesso, token (RPC register/unregister_device),
// canale Android, soppressione del banner quando la chat è già a schermo e
// badge dell'icona. Tutto degrada con grazia: in Expo Go Android (SDK 53+) le
// push remote non esistono → il token fallisce in silenzio e l'app prosegue.

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { getInstallId, installIdNoto } from '@/lib/install-id';
import { callRpc } from '@/lib/rpc';
import { colors } from '@/constants/theme';

export type PermessoPush = 'granted' | 'denied' | 'undetermined';

// Stato di modulo: il token registrato in questa sessione (per l'unregister al
// logout) e la conversazione attualmente a schermo (per la soppressione).
let tokenRegistrato: string | null = null;
let conversazioneAperta: string | null = null;
let dropAperto: string | null = null;
let handlerInstallato = false;

/**
 * La chat attualmente a schermo: le push della SUA conversazione non mostrano
 * banner né suono (l'utente le sta già leggendo). null = nessuna chat aperta.
 * Settata da chat/[id] su focus/blur.
 */
export function setConversazioneAperta(convId: string | null): void {
  conversazioneAperta = convId;
}

/**
 * Il drop attualmente a schermo (dettaglio S3): le push `drop_comment` di QUEL
 * drop non mostrano banner né suono (l'utente sta già leggendo i commenti, e il
 * realtime li aggiorna live). null = nessun drop aperto. Settata da drop/[id].
 */
export function setDropAperto(dropId: string | null): void {
  dropAperto = dropId;
}

/**
 * Handler delle notifiche ricevute ad APP IN FOREGROUND (in background è il
 * sistema a presentarle, l'handler non viene chiamato). Sopprime il banner se
 * il messaggio appartiene alla conversazione aperta. Il badge non lo tocca la
 * singola push: lo governa l'app (somma unread, vedi aggiornaBadgeApp).
 */
export function installNotificationHandler(): void {
  if (handlerInstallato) return;
  handlerInstallato = true;
  // P6: scalda la cache dell'install id per il confronto sincrono qui sotto.
  void getInstallId();
  Notifications.setNotificationHandler({
    handleNotification: async (notifica) => {
      const data = (notifica.request.content.data ?? {}) as Record<string, unknown>;
      const stessaChat =
        data.type === 'message' &&
        typeof data.conversation_id === 'string' &&
        data.conversation_id === conversazioneAperta;
      // DM5: commento sul drop già aperto → niente banner (lo vedo in realtime).
      const stessoDrop =
        data.type === 'drop_comment' &&
        typeof data.drop_id === 'string' &&
        data.drop_id === dropAperto;
      // P6: il "nuovo accesso" serve agli ALTRI device — il device che ha
      // appena fatto login non vede il banner del proprio accesso.
      const mioAccesso =
        data.type === 'new_login' &&
        typeof data.install_id === 'string' &&
        data.install_id === installIdNoto();
      const sopprimi = stessaChat || stessoDrop || mioAccesso;
      return {
        shouldShowBanner: !sopprimi,
        shouldShowList: !sopprimi,
        shouldPlaySound: !sopprimi,
        shouldSetBadge: false,
      };
    },
  });
}

/**
 * Stato del permesso notifiche del sistema (errore ⇒ 'denied': non insistere).
 *
 * M14R3: NON fidarsi dello `status` nativo. Su Android 13+ il modulo expo
 * (NotificationPermissionsModule.kt) risponde 'denied' anche a permesso MAI
 * richiesto — prima del primo consenso areNotificationsEnabled() è false e
 * quel false schiaccia lo status — quindi 'undetermined' non arrivava mai al
 * JS e il pre-prompt non appariva su NESSUNA installazione fresca. La verità
 * chiedibile è `canAskAgain`: finché il dialog di sistema si può mostrare per
 * noi è 'undetermined' (Android concede fino a due dialog: dopo UN rifiuto si
 * può ancora ri-chiedere, con la nostra cadenza gentile); 'denied' resta solo
 * lo stato definitivo — dialog non più mostrabile — e lì non si insiste MAI.
 */
export async function statoPermessoPush(): Promise<PermessoPush> {
  try {
    const permesso = await Notifications.getPermissionsAsync();
    if (permesso.granted) return 'granted';
    return permesso.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

// La Edge send-push non specifica `channelId`: su Android le push atterrano sul
// canale con id "default". Lo creiamo NOI, col nome giusto e priorità alta
// (heads-up), così non nasce il canale anonimo di sistema. Cambiare la Edge non
// è possibile oggi (il deploy functions richiede l'account owner).
async function creaCanaleAndroid(): Promise<void> {
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Messaggi',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: colors.accent,
  });
}

/** true se il token è già stato registrato in QUESTA sessione dell'app (guardia
 *  per i ri-controlli al foreground: niente RPC ripetute a ogni ritorno). */
export function tokenPushRegistrato(): boolean {
  return tokenRegistrato != null;
}

/**
 * Ottiene il token push Expo e lo registra in `devices` (upsert server-side:
 * al re-login il token passa al nuovo utente). Presuppone il permesso GIÀ
 * concesso. Ritorna false quando il runtime non supporta le push (simulatore,
 * Expo Go Android SDK 53+, servizi Google assenti): l'app prosegue senza.
 */
export async function registraTokenPush(): Promise<boolean> {
  if (!Device.isDevice) return false;
  try {
    if (Platform.OS === 'android') await creaCanaleAndroid();
    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await callRpc('register_device', { p_token: token, p_platform: Platform.OS });
    tokenRegistrato = token;
    return true;
  } catch (e) {
    // Runtime senza push remote: non è un errore dell'utente, solo log dev.
    console.warn('[push] registrazione token non riuscita:', e);
    return false;
  }
}

/** Chiede il permesso (dialog di sistema) e, se concesso, registra il token.
 *  Anche qui fede al flag `granted`, non allo `status` (vedi statoPermessoPush). */
export async function richiediPermessoERegistra(): Promise<boolean> {
  try {
    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return false;
  } catch {
    return false;
  }
  return registraTokenPush();
}

/**
 * Al logout: il token smette di appartenere a questo utente. Da chiamare PRIMA
 * di auth.signOut (la RPC richiede la sessione). Best-effort: se fallisce
 * (offline), il prossimo register_device di chi accede su questo device
 * riassegna comunque il token — nessuna push all'utente sbagliato dopo un
 * nuovo login. Azzera anche il badge dell'icona.
 */
export async function rimuoviTokenPush(): Promise<void> {
  await aggiornaBadgeApp(0);
  if (!tokenRegistrato) return;
  const token = tokenRegistrato;
  tokenRegistrato = null;
  try {
    await callRpc('unregister_device', { p_token: token });
  } catch {
    // Vedi sopra: il token verrà riassegnato al prossimo login.
  }
}

/**
 * Badge sull'icona dell'app = somma degli unread (best-effort: iOS lo mostra
 * sempre, Android dipende dal launcher; senza permesso la chiamata fallisce
 * in silenzio). Ad app chiusa il valore resta l'ultimo calcolato: la Edge non
 * manda `badge` nelle push (limite noto, annotato nel piano).
 */
export async function aggiornaBadgeApp(unread: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, unread));
  } catch {
    // Piattaforma o permesso senza supporto badge: non è un errore.
  }
}
