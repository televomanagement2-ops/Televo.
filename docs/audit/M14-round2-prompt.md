Ho appena verificato su device reale (Huawei + Redmi, entrambi con l'ultima
build EAS cloud preview — commit 2298aea, con google-services.json integrato
nel binario e FCM v1 service account key già caricata su expo.dev) i fix del
round M14 (V0-V7, commit 83ed1da→2298aea, "chiuso lato sviluppo"). 3 test su 5
sono ❌ nonostante il codice risultasse già corretto secondo il piano:

1. **Push non arriva MAI.** Il token ora si registra (google-services.json è
   presente, quindi niente più il crash silenzioso diagnosticato in V0). MA:
   nessuna notifica arriva end-to-end, e soprattutto l'app NON mostra MAI un
   pre-prompt esplicito per chiedere il permesso notifiche — ho dovuto
   attivarle a mano dalle impostazioni di sistema Android. Questo è un
   sintomo NUOVO, mai diagnosticato prima (V0 si fermava al file mancante).
   Verifica innanzitutto se il flusso di richiesta permesso via
   `mobile/src/lib/expo-push.ts` (`getExpoPushTokenAsync`) e il pre-prompt UI
   (introdotto in M13-P3, commit `2d4a48b`, "Push client: pre-prompt permesso
   + rotazione token + icona notifica") sono ancora cablati correttamente nel
   punto in cui l'utente fa login/apre l'app la prima volta — potrebbe essere
   un problema di ordine di boot (dopo V1/M14 boot offline-aware, forse la
   chiamata al pre-prompt non viene più raggiunta in certi path). Poi
   verifica via pooler (Deno+postgres.js, vedi memoria "Supabase pooler
   access") lo stato di `public.devices` per l'utente di test, `push_tickets`,
   `push_health` per capire se il token arriva lato server o si ferma prima.
   Usa adb logcat mentre riproduci il problema sul device per vedere errori
   reali (`adb logcat | grep -i -E "expo-notifications|firebase|fcm"`).

2. **Preview live nel feed ANCORA bianca.** V4 (commit e512a18,
   "Preview live nel feed: iscrizione esplicita alla camera dell'host (fix
   riquadro bianco Android)") ha modificato `LiveFeedPage.tsx` con
   `adaptiveStream:false` + `autoSubscribe:false` + `setSubscribed(true)`
   sulla sola camera dell'host — ma il sintomo persiste identico su device
   reale. Il fix teorico non ha funzionato. Serve diagnostica reale:
   aggiungi temporaneamente log su `RoomEvent.TrackSubscribed`,
   `publication.isSubscribed`, dimensioni traccia video nel componente di
   preview, riproduci sul device (Huawei o Redmi, con una live reale attiva
   dall'altro telefono) e leggi i log con `adb logcat` o Metro per capire se
   i frame video non arrivano mai (problema di subscription) o arrivano ma
   non vengono compositati (problema di rendering/zOrder SurfaceView). La
   candidata "zOrder esplicito sul VideoTrack" elencata come opzione 1 nel
   piano originale (`C:\Users\telev\.claude\plans\leggi-attentamente-il-file-ancient-adleman.md`,
   sezione V4) non è mai stata provata — solo l'opzione 2 (bypass
   ViewPortDetector) è stata implementata, e non basta.

3. **Co-Live non fa MAI split-screen.** Dopo che il co-host accetta l'invito,
   si vede SOLO il video dell'host principale, sia sul telefono dell'host che
   su quello dello spettatore. V5 (commit eddd256, debounce refetch su
   RoomEvent) e V6 (commit f356066, migrazione
   `supabase/migrations/20260715130000_live_detail_cohost.sql`, contatori +
   "Lascia il Co-Live" per il co-host) erano stati validati SOLO via smoke
   pooler sintetico (3 ruoli, transazione rolled-back) — mai su LiveKit reale
   fino ad oggi. Sospetti da verificare in ordine:
   - `live_detail()` v2 ritorna davvero `hosts` con la shape che il client
     si aspetta in produzione (non solo nello smoke)? Controlla via pooler
     con un utente reale in una live reale.
   - Il debounce refetch in `useLive.ts` (agganciato a
     `RoomEvent.ParticipantConnected`/`Disconnected`/`TrackPublished`/
     `TrackUnpublished`) scatta davvero quando il co-host si connette alla
     Room LiveKit? Aggiungi log temporanei sugli event handler.
   - `LiveSurface.tsx` (`cellaStyle`, logica `api.riquadri`) — la griglia
     dipende da `detail.hosts`: se il refetch avviene ma il campo non
     aggiorna `hosts` (es. cache React Query non invalidata correttamente),
     lo split-screen non comparirà mai pur con dati freschi lato server.
   Riproduci con i due device reali (uno host, uno che accetta invito
   co-host) e usa Metro/adb logcat per tracciare l'intero flusso invito →
   accept → RoomEvent → refetch → render.

Contesto operativo:
- Repo: `c:\Users\telev\Desktop\televo`, mobile in `mobile/`.
- Build attuale sui device: EAS cloud preview, build id
  `1a1c22c2-e8af-4f15-84f1-1e90d6c4835f`, APK scaricato in
  `%TEMP%\televo-preview.apk`, installato via `adb install` su entrambi
  Huawei (`LCL0218407005149`) e Redmi (`9d421c1b`) — verifica con
  `adb devices` quali sono ancora collegati.
- `mobile/app.config.js` (NUOVO in questo round) interpola
  `process.env.GOOGLE_SERVICES_JSON` sopra `app.json` — necessario per le
  build EAS cloud, che leggono il file da una EAS file environment variable
  (`GOOGLE_SERVICES_JSON`, già creata su `eas env:create`, scope project) dato
  che `mobile/google-services.json` è in `.gitignore` e mai committato. Se
  serve un'altra build cloud, il comando è semplicemente
  `npx eas-cli build --platform android --profile preview --non-interactive`
  dalla cartella `mobile/` — NON usare `--local` (non supportato su Windows
  per Android). Assicurati che `mobile/.easignore` esista ancora (esclude
  node_modules/android/ios) altrimenti l'upload torna a essere >1GB.
- pgTAP sul remoto è a 569/569 (nessuna migrazione nuova prevista per questo
  round finché non emerge un bug lato dati, non solo lato client).
- Il piano originale M14 completo è ancora leggibile in
  `C:\Users\telev\.claude\plans\leggi-attentamente-il-file-ancient-adleman.md`
  (utile per V4/V5/V6 come riferimento di cosa è stato tentato).
- Le memorie di progetto rilevanti: `m14-fix-verifica.md` (contesto V0-V7) e
  la nuova `m14-verifica-device-2.md` (questa verifica). Leggile a inizio
  sessione.

Voglio che tu indaghi le 3 cause root con diagnostica reale su device (non
solo lettura di codice) e poi implementi i fix, un problema alla volta,
committando separatamente come nel resto del progetto (un commit per
blocco). Non fermarti a proporre teorie — riproduci, osserva i log, conferma
la causa, poi correggi.
