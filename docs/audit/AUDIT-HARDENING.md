# Televo — Audit tecnico & Hardening UX (M13): Mappatura & Piano di implementazione

> **Rev. 1 — 2026-07-13.** Decisioni di prodotto **AH-1..AH-5 validate dal
> product owner** (2026-07-13, sessione di audit). Questo è il documento
> ufficiale della milestone **M13 — Hardening**: Parte I = mappatura tecnica
> completa dei problemi verificati (con file:riga e design dei fix), Parte II
> = piano di implementazione a PUNTI (P0–P11). Compagno di `CLAUDE.md` (mappa
> backend), `roadmap.md` (stato progetto) e dei documenti gemelli
> `docs/chat/IMPLEMENTATION-PLAN.md`, `docs/media/drop.md`, `docs/map/map.md`,
> `docs/live/live.md`, di cui ricalca formato e convenzioni. Lingua: italiano.

---

## Contesto — perché questo documento

Il PO ha eseguito un **audit manuale dell'app** (Dev Build su device reale,
2026-07-13) e ha riportato sintomi precisi. Obiettivo dichiarato del round:
portare **ciò che già esiste** al livello di maturità tecnica/UX di
Telegram/Instagram — **solo tecnica e UX, NON design** — senza rompere l'app.
Un'esplorazione sistematica (3 indagini parallele su mobile, backend e
mismatch documentali, più review diretta dei file portanti) ha verificato ogni
sintomo e ne ha identificato la causa con riferimenti file:riga.

### Sintomi riportati dal PO (verbatim, riformulati)

1. Aprendo una schermata (soprattutto le live degli amici) compare **subito il
   bottone con la freccia di refresh** invece di una rotellina di caricamento;
   ogni schermata che carica dovrebbe mostrare uno spinner.
2. **Le notifiche push NON arrivano** — né dalle live degli amici, né da altro.
3. Tempi di caricamento talvolta **non ottimizzati**.
4. **Chat da offline**: apri una chat → caricamento → fallimento. Dovrebbe
   mostrare l'ultimo stato noto (scorribile), come WhatsApp.
5. **Commenti in live**: la tastiera non solleva l'input (l'utente non vede
   cosa scrive); i commenti visibili in basso a sinistra sono troppo pochi —
   devono essere **~7 visibili** prima che il più vecchio scorra via.
6. **Multi-device**: il login su un secondo dispositivo fa scadere la sessione
   sul primo. Non deve succedere; in più va inviata una notifica push
   ("un nuovo accesso è stato effettuato vicino a…") elencata anche nella
   tab Notifiche della bottombar.
7. **`lives_feed()` limitata a ~150 amici senza paginazione** (live.md §15.2)
   — da scalare a illimitato.
8. **`sync_live_viewer_count()`** fa un `COUNT(*)` completo su `live_viewers`
   a ogni join/leave/kick → lock contention sulla riga `lives`; da rivedere
   verso un contatore incrementale.
9. Più tutto ciò che l'audit trova di simile ("ci saranno sicuramente cose
   che non ho detto").

### Decisioni di prodotto vincolanti (product owner, 2026-07-13)

| # | Domanda | Decisione |
|---|---------|-----------|
| AH-1 | Tab Notifiche (oggi placeholder ComingSoon, verticale M8) | **SÌ, si costruisce in questo round** — unica eccezione allo scope "niente verticali nuove": serve per elencare le notifiche nella bottombar (requisito 6). |
| AH-2 | Ordinamento di `lives_feed` paginata (il cursore non può esporre i contatori, R-04) | **Top Friends + recenza**: due blocchi (prima le live dei Top Friends del viewer, poi gli altri amici), dentro ogni blocco `started_at desc, id desc`. L'ordinamento per viewer_count/aura si perde: trade-off accettato. |
| AH-3 | Posizione nella notifica "nuovo accesso" | **Città stimata dall'IP** via servizio geo esterno, best-effort (l'IP NON viene persistito); se il lookup fallisce degrada al testo generico. |
| AH-4 | Outbox chat su disco | **SÌ**: la coda di invio sopravvive alla chiusura dell'app. Testo sempre; vocali/foto con verifica di esistenza del file locale al riavvio (assente → stato `fallito` con retry). |
| AH-5 | Chat offline | Requisito ribadito: chat aperta OFFLINE **scorribile** con gli ultimi messaggi noti (parità WhatsApp) — è il cuore di P2. |

### Scope ESCLUSO (decisione PO, 2026-07-13)

Verticali non ancora costruite — **NON si toccano in questo round**: Economia
Vibes (M9), GDPR UI (M11), Stanze audio M4 frontend, Moderazione & Safety UI
(M10), Profilo/Aura M3 (già sistemato a parte), contenuti reali del feed
Discover, login Google/SMS, pagina aiuto.

---

# PARTE I — MAPPATURA TECNICA

## 0. Meta

### 0.1 Scopo
Uno sviluppatore deve poter eseguire l'intero round leggendo questo documento
e il codice. La Parte I definisce ogni problema (sintomo → causa verificata →
design del fix, con alternative scartate); la Parte II li traduce in punti
implementabili uno alla volta.

### 0.2 Fonti
Audit PO 2026-07-13 · `mobile/src/lib/{queryClient,rete,livekit,expo-push,
outbox,chat,chat-cache,auth,supabase}.ts` · `mobile/src/hooks/{useChat,
useNotifiche,useAuth,useLive,useLivesFeed}.ts` · `mobile/src/components/live/
{CommentInput,CommentiOverlay,LiveFeed,LiveStrip}.tsx` · `mobile/src/components/
ui/{StatoErrore,LoadingSpinner}.tsx` · `mobile/app/_layout.tsx`,
`app/(main)/live/[id].tsx`, `app/(main)/(tabs)/{home,messages,notifiche}.tsx` ·
`supabase/migrations/20260628180000_notifications.sql`,
`20260709120100_live_foundation.sql`, `20260711130000_live_social.sql`,
`20260711140000_live_lifecycle.sql`, `20260705150200_drops_interactions.sql` ·
`supabase/functions/{send-push,livekit-token,live-kick,livekit-webhook}/` ·
`supabase/config.toml` · `supabase/tests/rls_smoke.test.sql` (`plan(537)`) ·
`roadmap.md`, `docs/*/MANUAL-TESTING.md`.

### 0.3 Convenzioni (vincolanti, come tutto il repo)
- Migrazioni `YYYYMMDDHHMMSS_dominio.sql` con header `=== … ===` e razionale
  in italiano; funzioni `security definer set search_path = ''`
  schema-qualificate; RLS su ogni tabella; **revoke SEMPRE da
  `public`+`anon`+`authenticated` prima dei grant mirati**; enum in migrazione
  SEPARATA dal primo uso; ridefinizioni di funzioni condivise
  (`expire_content`, `dispatch_push`) **verbatim + add** (diff = solo aggiunta).
- Applicazione via **pooler** (Deno + postgres.js — la CLI è bloccata) con
  registrazione in `supabase_migrations.schema_migrations`; pgTAP esteso in
  `supabase/tests/rls_smoke.test.sql` con `plan(N)` aggiornato (oggi
  **`plan(537)`**, riga 8) ed eseguito SUL REMOTO; **le guardie prosrc leggono
  anche i COMMENTI dei body → mai citare l'approccio legacy nei commenti**.
- Tipi TS a mano in `mobile/src/types/supabase.ts` nello stesso commit dei
  cambi backend; `tsc --noEmit` + `eslint` puliti a fine punto; un commit per
  punto; dialoghi SOLO via `src/lib/dialoghi.ts` (mai `Alert.alert`); errori
  mappati in italiano in `lib/errors.ts`.

---

## 1. Loading & stati di caricamento (sintomo 1 e 3)

### 1.1 Il sintomo e la catena causale
Il "bottone con la freccia" è `StatoErrore`
(`mobile/src/components/ui/StatoErrore.tsx:19-27` — icona
`cloud-offline-outline` + "Riprova"). Gli screen hanno l'ordine dei rami
CORRETTO (loading prima di errore: `messages.tsx:110-114`,
`chat/[id].tsx:992-1006`, `DropFeed.tsx:242-245`, `LiveFeed.tsx:99-108`, …).
Il problema sono i **presupposti**:

**A1 — `onlineManager` non cablato al boot.** Il wiring NetInfo→TanStack
esiste (`mobile/src/lib/rete.ts:16-26`, `initRete()`) ma è invocato SOLO
dentro `useChatRuntime()` (`mobile/src/hooks/useChat.ts:666-668`), montato da
`<ChatRuntime/>` nella shell autenticata. Fino ad allora TanStack crede di
essere sempre online: una query lanciata senza rete NON viene messa in pausa,
parte, fallisce quasi subito, fa 1 retry veloce e va in `isError` → freccia
in ~1 secondo.

**A2 — QueryClient minimale, zero persistenza.**
`mobile/src/lib/queryClient.ts:9-20` (verbatim):
```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});
```
Mancano `gcTime`, `retryDelay`, `refetchOnReconnect`; non esiste ALCUNA
persistenza della cache (nessun AsyncStorage/MMKV installato — commento
esplicito "non introduciamo AsyncStorage" in `lib/map.ts:100`). Ogni cold
start riparte da cache vuota: niente dati da mostrare mentre si carica.

**A3 — Fallback `Suspense` neri.** I chunk lazy LiveKit hanno come fallback
una `View` vuota nera: `app/(main)/live/[id].tsx:28` e
`app/(main)/(tabs)/home.tsx:48`. In più `dopoBootstrapLiveKit()`
(`lib/livekit.ts:60-65`) fa `await inizializzaLiveKit()` PRIMA dell'`import()`
→ il buco nero dura ancora di più. Sequenza reale aprendo una live: **nero
(chunk+bootstrap) → spinner (fase `connessione` di `useLiveSession`) →
video/errore**. Il primo tratto è il difetto.

**A4 — Refetch al focus bloccanti.** `useFocusEffect(() => refetch())` su hub
(`messages.tsx:49-53`) e LiveFeed (`LiveFeed.tsx:53-59`): a ogni focus si
rifetcha; se offline → errore.

**A5 — Manca il pattern maturo** (stale-while-revalidate): dati in cache →
mostrarli SEMPRE (refresh silenzioso in background); spinner SOLO senza dati;
`StatoErrore` SOLO con errore E senza dati; stato **offline** dedicato quando
non c'è rete e non c'è cache.

### 1.2 Design del fix (→ P1)

1. `initRete()` chiamata al mount del RootLayout (`app/_layout.tsx`), prima di
   ogni query; resta (idempotente) anche in `useChatRuntime`.
2. Nuovi default QueryClient: `retry: 2` con `retryDelay` esponenziale
   (1s/2s, cap 5s), `gcTime: 48h` (prerequisito della persistenza P2),
   `refetchOnReconnect: 'always'`; `staleTime 30s` e mutazioni `retry: 0`
   invariati; `networkMode` resta `'online'` (ora corretto perché
   l'onlineManager è cablato dal boot).
3. Helper condiviso `src/lib/query-ui.ts` → `statoSchermo(query, online)`:

| Condizione | Stato reso |
|---|---|
| `query.data` presente (anche stale) | `'dati'` — render + refresh silenzioso |
| nessun dato, `isPending` o `fetchStatus==='paused'`, online | `'caricamento'` — `LoadingSpinner` |
| nessun dato, offline | `'offline'` — variante offline di `StatoErrore` |
| nessun dato, `isError`, online | `'errore'` — `StatoErrore` con Riprova |

   ⚠️ Con le query in pausa offline `isLoading` è `false` ma `isPending` è
   `true`: usare SEMPRE l'helper, mai ragionare a mano nei singoli screen.
4. Applicazione ai ~18 screen che usano `StatoErrore` (hub messaggi, chat,
   DropFeed, LiveFeed, drop/[id], cerca, importante, impostazioni, contatti,
   info gruppo, nuovo-gruppo, inoltra, posizione, profilo, …).
5. `StatoErrore.tsx`: nuova variante `offline` (icona + "Sei offline" + Riprova).
6. Fallback `Suspense` → `LoadingSpinner` (in P11 insieme al pre-warm).

---

## 2. Chat offline WhatsApp-like (sintomo 4, AH-4/AH-5)

### 2.1 Architettura attuale (verificata)
- **Hub**: RPC `chat_overview()` in una query (`lib/chat.ts:63-108`), hook
  `useConversations` (`useChat.ts:72-80`).
- **Messaggi**: `useInfiniteQuery` (`useChat.ts:157-167`) su
  `fetchMessagesPage` (40/pagina, keyset su `created_at`), **gated su
  `header.myClearedAt`** (`useChat.ts:160-161`) → i messaggi partono solo dopo
  l'header (waterfall, v. §8).
- **Realtime**: canale per-conversazione (`useChat.ts:512-591`) + canale
  globale `subscribeMessagesAll` nella shell (`useChat.ts:672-675`).
- **Outbox di invio**: completa e robusta (`lib/outbox.ts` + `chatStore`,
  pending/failed/retry, flush sequenziale alla riconnessione) ma dichiarata
  **in-sessione** (`chatStore.ts:8-9`): l'app chiusa perde la coda.
- **Nessuna persistenza dei dati ricevuti**: cold start offline = cache vuota
  → `StatoErrore` ovunque. È l'esatto sintomo 4.

**Nota portante (verificata)**: gli URL firmati dei media NON vivono nelle
query TanStack — messaggi e drop memorizzano i *path* storage e la firma
avviene on-demand al render con cache di modulo (`lib/media.ts:105`,
`lib/drops.ts:167`, `lib/audio.ts:85`). Persistere la cache è quindi SICURO
senza esclusioni complicate: offline si legge il testo, i media si firmano al
ritorno online.

### 2.2 Design del fix (→ P2)

**Stack**: `react-native-mmkv` (storage nativo sincrono; Dev Build già in uso;
**guard Expo Go** con `require` in try/catch → fallback senza persistenza,
pattern guard LiveKit/MapCanvas) + `@tanstack/react-query-persist-client` +
`@tanstack/query-sync-storage-persister` (persister sincrono → restore al boot
senza flash di vuoto).

**Provider**: `PersistQueryClientProvider` al posto di `QueryClientProvider`
in `app/_layout.tsx:63`; `maxAge: 48h` (= `gcTime` P1, obbligatorio: se
`gcTime < maxAge` l'eviction svuota lo stato deidratato); `buster` = costante
manuale da bumpare a ogni cambio di shape dei dati + versione app.

**Whitelist** via `dehydrateOptions.shouldDehydrateQuery` (chiavi verificate in
`chat-cache.ts:14` e nei query key factory):

| Persistere | Chiave | Note |
|---|---|---|
| ✅ Hub conversazioni | `['chat', uid, 'conversations', …]` | l'hub offline |
| ✅ Header conversazione | `['chat','header',convId]` | serve anche a sbloccare i messaggi |
| ✅ Messaggi | `['chat','messages',convId,…]` | **trim alle prime 2 pagine (~80 msg)** nel serialize del persister |
| ✅ Reazioni | `['chat','reactions',convId]` | |
| ✅ Profilo + top friends | `['profilo', uid]`, top-friends | |
| ✅ Drops feed | `dropKeys.feed()` | |
| ✅ Amici | `['amici', uid, 'list']` | |
| ✅ Notifiche (post-P10) | `['notifiche', uid, …]` prima pagina | |
| ❌ Live feed, mappa | — | contenuto real-time/deperibile |
| ❌ Search, receipts, presence, composer-block | — | volatile |

**Idratazione vs realtime**: i dati ripristinati sono subito stale
(`staleTime 30s`) → refetch al primo mount online; gli upsert realtime
(`upsertMessage` via `setQueriesData`, `chat-cache.ts:40`) operano sulla cache
ripristinata senza conflitto. La chiave messaggi include `clearedAt`
(`useChat.ts:159`): il restore ripristina la variante giusta perché anche
l'header è persistito.

**Outbox su disco (AH-4)**: `zustand/persist` con storage MMKV su `chatStore`;
al flush di vocali/foto, `FileSystem.getInfoAsync` sul file locale → assente =
item `fallito` (UI di retry esistente, nessun messaggio fantasma).

**Logout/cambio account**: `persister.removeClient()` + `queryClient.clear()`
agganciati al `reset()` di `useAuth.ts:82-89` — NESSUN residuo cross-account
(vincolo privacy: dati di un account non sopravvivono al cambio utente).

---

## 3. Push notifications (sintomo 2)

### 3.1 La pipeline end-to-end (con i punti di rottura)

```
trigger DB ──► public.notifications ──► dispatch_push() [cron 1 min]
                                             │  legge Vault: edge_base_url,
                                             │  service_role_key, cron_secret
                                             │  ⚠️ SE MANCANO → NO-OP SILENZIOSO
                                             ▼
                                    Edge send-push (x-cron-secret)
                                             │  batch 500 pushed_at is null
                                             │  utenti senza device → marcati
                                             │  pushed SENZA inviare (silenzioso)
                                             ▼
                                    Expo Push API (chunk 100)
                                             │  ⚠️ legge solo i TICKET,
                                             │  MAI le RECEIPT → InvalidCredentials
                                             │  (FCM/APNs) INVISIBILE
                                             ▼
                                        device (token da register_device)
                                             ⚠️ il permesso è chiesto SOLO dal
                                             banner chiudibile nell'hub Messaggi
```

- **Trigger**: tutti i tipi verificati corretti — incluso `live_started`
  (insert set-based dentro `create_live` v2,
  `20260711130000_live_social.sql:134-157`, dedup 10 min su non-lette dello
  stesso host, filtro `can_see_live`, `notify_mode`).
- **`dispatch_push()`** (`20260628180000_notifications.sql:256-291`): se uno
  dei 3 segreti Vault manca → `return` senza errore, senza log, senza traccia
  (righe 277-279). Le notifiche si accumulano con `pushed_at is null` per
  sempre, invisibilmente.
- **Edge `send-push` v2** (`functions/send-push/index.ts`): guardia
  `CRON_SECRET` env (righe 54-57 — se assente sul deploy → 401 a ogni run);
  batch `.is('pushed_at', null).limit(500)`; utenti senza righe `devices` →
  notifica marcata pushed e scartata in silenzio (righe 107-110); ispeziona i
  **ticket** (risposta sincrona) per `DeviceNotRegistered` (prune token,
  righe 166-172) ma **NON fetcha mai le receipt asincrone**
  (`getReceipts`) → gli errori a livello receipt (`InvalidCredentials` per
  credenziali FCM v1/APNs mal configurate nel progetto Expo,
  `MessageRateExceeded`, `MessageTooBig`) sono invisibili: i ticket dicono ok
  e sul device non arriva nulla.
- **Client** (`lib/expo-push.ts` + `hooks/useNotifiche.ts`): infrastruttura
  completa e corretta (projectId in `app.json:100-102`, canale Android
  `default` importanza MAX creato prima del token, `register_device` upsert,
  handler foreground con soppressione contestuale, deep link tap con dedup
  cold-start). MA la **richiesta di permesso esiste in UN SOLO punto**: il
  banner chiudibile dell'hub Messaggi (`useNotifiche.ts:155-160`,
  `messages.tsx:91-108`). Se l'utente non entra mai nella tab Messaggi o
  chiude il banner → il permesso non viene MAI chiesto → nessun token →
  `devices` vuota → **niente push, di nessun tipo**. È la candidata causa #1,
  coerente col sintomo "non arriva nulla, da niente".

### 3.2 Inventario completo dei punti di rottura (ordine di diagnosi, → P0)

| # | Rottura | Come si vede |
|---|---------|--------------|
| 1 | Permesso mai chiesto / token mai registrato (client) | `select * from public.devices` VUOTA |
| 2 | Segreti Vault assenti → no-op silenzioso | `vault.decrypted_secrets` senza i 3 nomi; arretrato `pushed_at is null` che cresce |
| 3 | `CRON_SECRET` env assente/diverso sulla Edge | `net._http_response` pieno di 401 |
| 4 | Credenziali FCM v1 / APNs assenti nel progetto EAS `4087043e-…` | SOLO dalle receipt Expo (oggi mai lette) o dashboard EAS |
| 5 | Cron non schedulato / pg_cron / pg_net | `cron.job` + `cron.job_run_details` |
| 6 | Edge `send-push` non deployata / vecchia | dashboard funzioni |
| 7 | `net.http_post` fallisce (fire-and-forget, la risposta non è letta) | `net._http_response` |

### 3.3 Design dei fix
- **P0 — diagnosi** prima di ogni codice (checklist §12/P0): stabilisce se
  P3/P4 sono "fix della root cause" o "hardening".
- **P3 — client**: pre-prompt al primo ingresso nella shell autenticata
  (post-onboarding, ~2s dal primo frame, UNA volta via flag SecureStore) con
  `conferma()` di `dialoghi.ts` ("Attiva le notifiche — ti avvisiamo per
  messaggi, amici in live e richieste di amicizia") → su "Attiva"
  `richiediPermessoERegistra()`. Il pre-prompt protegge il prompt OS (che si
  può chiedere una sola volta); mai ri-chiedere se `denied`; il banner hub
  resta come percorso secondario. In più: `Notifications.addPushTokenListener`
  in `usePushRuntime` (ri-registrazione alla rotazione del token) e icona
  notifica monocromatica 96×96 in `app.json` (oggi solo `color` blu fuori
  brand → icona Android grigia di default).
- **P4 — server**: receipt Expo + osservabilità. Tabelle `push_tickets`
  (`ticket_id` pk, `notification_id`, `expo_push_token`, `created_at`) e
  `push_health` (`key` pk, `value` jsonb, `updated_at`) — RLS attiva, ZERO
  policy, revoke espliciti, nessun grant (scrive solo service_role, pattern
  `invites`). `send-push` v3: salva i ticket id (la risposta Expo è allineata
  per indice, già sfruttato alle righe 152-159); a ogni run controlla le
  receipt dei ticket più vecchi di 15 min (batch ≤300, endpoint
  `getReceipts`): `ok` → delete ticket; `DeviceNotRegistered` → prune device;
  `InvalidCredentials`/altro → `push_health` + `console.error`; ticket >24h →
  prune. Scrive `send_push_last_run` {processed, sent, marked, pruned,
  receipts_checked, receipt_errors}. `dispatch_push()` ridefinita con UNICA
  aggiunta: upsert `push_health('dispatch_skipped_no_secrets')` nel ramo
  segreti assenti — il no-op resta ma **diventa osservabile**. La marcatura
  per-chunk della v2 NON cambia (receipts additivi).

---

## 4. Schermo Live — tastiera e commenti (sintomo 5)

### 4.1 D1 — La tastiera copre l'input (Android)
`mobile/src/components/live/CommentInput.tsx:67-73`: l'overlay di scrittura è
un `<Modal transparent>` con dentro:
```tsx
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
  style={styles.avoiding}
  pointerEvents="box-none"
>
```
Su Android `behavior` è `undefined` → nessuna compensazione; e dentro un
`Modal` RN Android il resize automatico della finestra non è affidabile →
**la tastiera copre l'input** (il sintomo). Su iOS `padding` funziona.

**Fix (→ P9)**: **eliminare il Modal**. L'overlay diventa un layer assoluto
nell'albero dello schermo live (zIndex sopra i controlli, backdrop `Pressable`
che chiude); la barra input è traslata con Reanimated
**`useAnimatedKeyboard`** → `transform: translateY(-keyboard.height)`:
controllo esplicito, identico su iOS e Android, niente `behavior` ambiguo.
BlurView, invio, moderazione fire-and-forget e gestione errori inline
invariati; `pointerEvents='box-none'` preservato (i gesti dello schermo live
non vanno rubati). Alternativa scartata: KAV `behavior="padding"` come
`chat/[id].tsx:987-990` — dentro/attorno a un Modal trasparente Android resta
inaffidabile.

### 4.2 D2 — Commenti visibili: da 4-a-tempo a ~7-a-scorrimento
`mobile/src/components/live/CommentiOverlay.tsx`:
```ts
const MAX_VISIBILI = 4;    // riga 19
const VISIBILE_MS = 10_000; // riga 21 — ogni riga sparisce dopo 10s
```
Oggi: colonna di `Animated.View` (FadeInDown/FadeOut/LinearTransition), cap 4
righe, **sparizione a tempo** per riga (`setTimeout`, righe 63-66), nessuno
scroll. Con un flusso lento resta ~1 commento a schermo (la percezione del
PO). Requisito: **~7 visibili**, il più vecchio esce quando ne entra uno
nuovo, non a tempo.

**Fix (→ P9)**: da colonna a **FlatList `inverted`** con viewport ad altezza
cap (~35-40% dello schermo ≈ 7 righe); auto-scroll al più nuovo (inverted →
offset 0); **rimozione del timeout 10s** (i vecchi escono scorrendo e restano
raggiungibili scrollando, fino al cap memoria `MAX_COMMENTI=50` di
`useLive.ts:631` che resta invariato); dissolvenza visiva dei più vecchi con
gradiente in cima (polish, non logica); `FadeInDown` in ingresso e long-press
per segnalare invariati.

---

## 5. Sessioni multi-device & notifica "nuovo accesso" (sintomo 6)

### 5.1 Perché il primo device viene sganciato
- **Nulla nel repo revoca sessioni**: nessun trigger/funzione tocca
  `auth.sessions`/`auth.refresh_tokens`; `config.toml` non ha (né può avere)
  un single-session per user; `[auth.sessions]` è commentato.
- **La causa client verificata**: `signOut()` di supabase-js ha scope
  **`global` di default** → il logout su UN device revoca i refresh token di
  TUTTI i device (`useAuth.ts:82-89` chiama `supabase.auth.signOut()` senza
  scope). Il flusso tipico "esco ed entro con lo stesso account sul secondo
  device" uccide la sessione del primo. Vettore secondario: reuse-detection
  della rotazione refresh token (GoTrue) su sessioni clonate.
- Il device sganciato riceve `SIGNED_OUT` e viene **kickato in silenzio** al
  login (`useAuth.ts:58-61` non discrimina gli eventi) — UX da sistemare.

**Fix (→ P5)**: `supabase.auth.signOut({ scope: 'local' })` + flag di modulo
`logoutVolontario`; su `SIGNED_OUT` non volontario → `avvisa('Sessione
scaduta', 'Accedi di nuovo per continuare.')` via `dialoghi.ts` (il redirect
avviene già via store). Check owner (da P0): dashboard Authentication →
Sessions senza enforcement single-session. `rimuoviTokenPush()` al logout
resta (corretto: il device smette di ricevere push).

### 5.2 Notifica "nuovo accesso" (nuova, → P6)
- **Enum** (migrazione separata): `notification_type + 'new_login'` (pattern
  `20260709120000_live_enums.sql`).
- **RPC** `enqueue_login_alert(p_user uuid, p_install_id text, p_device_label
  text, p_city text)` — SECURITY DEFINER, eseguibile **SOLO da service_role**
  (revoke totale + grant mirato; `enqueue_notification` non è direttamente
  eseguibile da service_role → serve il wrapper). Anti-spam: skip se esiste
  già una `new_login` con lo stesso `payload->>'install_id'` per lo stesso
  utente da <1h. Poi `enqueue_notification(p_user, 'new_login', 'Nuovo accesso
  al tuo account', 'Da ' || p_device_label || coalesce(' · vicino a '||p_city,
  ''), jsonb {install_id, city})` → viaggia sulla pipeline push esistente,
  zero pezzi nuovi a valle.
- **Edge `login-alert`** (nuova, `verify_jwt=true`, registrata in
  `config.toml`): uid dal JWT (`userClient`); IP dal primo hop di
  `x-forwarded-for`; **geo best-effort**: `https://ipwho.is/{ip}` senza
  chiave, timeout 1200 ms → `city` o `null` (la notifica esce COMUNQUE senza
  città — nessuna dipendenza dura da terzi; AH-3); **l'IP non viene
  persistito da nessuna parte**; poi `adminClient.rpc('enqueue_login_alert')`.
- **Mobile**: `install_id` persistente per installazione (SecureStore +
  `expo-crypto` randomUUID); chiamata **fire-and-forget** alla Edge dopo login
  con password riuscito (NON su restore sessione, NON su `TOKEN_REFRESHED` —
  il `getSession()` iniziale non emette `SIGNED_IN`); **soppressione del
  banner sul device che ha appena fatto login** in
  `installNotificationHandler` (`data.type==='new_login' && data.install_id
  === mioInstallId` → suppress); `rottaPerNotifica['new_login']` → tab
  Notifiche; tipi TS aggiornati nello stesso commit.

---

## 6. Debiti di scala backend (sintomi 7 e 8 — i due warning di roadmap.md:3-4)

### 6.1 F1 — `lives_feed()` paginata keyset (→ P8)
Stato attuale (`20260711130000_live_social.sql:415-468`, firma zero-arg righe
418/555-558): il "~150 amici" è un limite di DESIGN (commento riga 415-416),
**non esiste alcun `LIMIT`**; visibilità con `can_see_live` per riga; due
`exists` correlati su `top_friends` duplicati (flag JSON + chiave sort);
ordinamento `is_top desc, vc desc, aura desc nulls last, started_at desc`
calcolato in `jsonb_agg`. Un cursore su quell'ordinamento esporrebbe
`viewer_count`/`aura` → **violerebbe R-04** (anti-vanity) anche solo nel
cursore.

**Design (AH-2, modello `drops_feed`
`20260705150200_drops_interactions.sql:279-323`)**:
- Ordinamento: `is_top desc, started_at desc, id desc` (due blocchi: Top
  Friends del viewer → resto degli amici; dentro ogni blocco recenza).
- Nuova firma: `lives_feed(p_top boolean default null, p_before timestamptz
  default null, p_before_id uuid default null, p_limit int default 10)`,
  cap `least(coalesce(p_limit,10), 20)`; predicato cursore composito su
  `(is_top::int, started_at, id)` valutato sull'ordinamento desc.
- **Il cursore è interamente derivabile dal client dall'ultima riga ricevuta**
  (`is_top_friend`, `started_at`, `live_id` sono già nel payload di ogni item)
  → zero campi nuovi esposti, R-04 rispettata anche nel cursore.
- Output: `{server_now, lives, has_more}` (shape item invariata).
- Migrazione: `drop function public.lives_feed();` + create nuova firma +
  revoke/grant espliciti. La chiamata client esistente `rpc('lives_feed', {})`
  resta compatibile (default). ⚠️ pgTAP: riscrivere la guardia
  `has_function_privilege(… 'public.lives_feed()' …)` (firma zero-arg, righe
  ~1769-1771) e la guardia prosrc che esige `viewer_count`/`aura_score`
  (~1776-1780) per la nuova firma/ordinamento.
- Client: `useLivesFeed` → load-more con `onEndReached` in `LiveFeed`
  (append allo store `ordine`); la striscia usa la sola prima pagina.
- ⚠️ **`map_snapshot()` è anch'essa unbounded** (friends + events senza LIMIT,
  `20260711120000_live_map.sql:194-307`): FLAG in roadmap, fuori scope in
  questo round (stessa assunzione ≤150 amici, nessun sintomo riportato).

### 6.2 F2 — `sync_live_viewer_count()` incrementale (→ P7)
Stato attuale (`20260709120100_live_foundation.sql:299-324`, verbatim la parte
portante):
```sql
select count(*) into v_count
from public.live_viewers v
where v.live_id = v_live and v.left_at is null and v.kicked_at is null;

update public.lives l
set viewer_count = v_count,
    peak_viewers = greatest(l.peak_viewers, v_count)
where l.id = v_live and l.status <> 'ended';
```
Un unico trigger `after insert or update or delete … for each row` SENZA
`WHEN` → COUNT(*) completo + UPDATE (row-lock su `lives`) a OGNI evento riga,
inclusi gli update no-op (re-upsert del mint token) e le DELETE della purge
24h/GDPR (dove l'UPDATE è no-op ma il COUNT gira comunque). Sotto concorrenza
il ricalcolo è anche **raceabile** (due transazioni contano lo stesso valore e
scrivono contatori stantii). Punti di fuoco attuali: mint `livekit-token`
(upsert join), `live_leave`, webhook `participant_left`, `live-kick`, purge
`expire_content`, GDPR delete.

**Design**:
- Funzione a **delta**: `attivo(r) := r.left_at is null and r.kicked_at is
  null`; `delta := attivo(NEW)::int − attivo(OLD)::int` (INSERT: OLD=0;
  DELETE: NEW=0); `delta = 0 → return`; poi
  `update public.lives set viewer_count = greatest(0, viewer_count + delta),
  peak_viewers = case when delta > 0 then greatest(peak_viewers,
  viewer_count + delta) else peak_viewers end
  where id = v_live and status <> 'ended'`.
  L'incremento sotto row-lock è atomico e corretto sotto concorrenza; il
  `where status <> 'ended'` continua a saltare la purge delle live finite.
  ⚠️ Nei commenti del body MAI citare l'approccio legacy (guardie prosrc); i
  token che le guardie esistenti esigono (`peak_viewers`, `greatest`,
  `kicked_at is null`, righe ~1414-1418 di rls_smoke) restano naturalmente.
- **Tre trigger** sulla stessa funzione, con `WHEN`: INSERT (`when (new.left_at
  is null and new.kicked_at is null)`), UPDATE (`when (old.left_at is distinct
  from new.left_at or old.kicked_at is distinct from new.kicked_at)`), DELETE
  (senza WHEN — il delta interno filtra). Aggiornare i test pgTAP sul nome del
  trigger (righe ~1411-1413).
- **Indice parziale** `live_viewers(live_id) where left_at is null and
  kicked_at is null` (per la riconciliazione e i path attivi).
- **Riconciliazione anti-drift**: `expire_content` **v8 = v7 VERBATIM + blocco
  in coda** (regola anti-regressione MM1): per le live `status in
  ('live','paused')`, riallinea `viewer_count` al conteggio reale quando
  diverge (heal ≤5 min via cron `expire-content` esistente — nessun job
  nuovo). `peak_viewers` non si riconcilia (monotòno).

---

## 7. Tab Notifiche in-app (AH-1, → P10)

Stato: `(tabs)/notifiche.tsx` è un placeholder `ComingSoon`
("Le notifiche arrivano presto"); **`NotificaRow.tsx` esiste ma è VUOTO (0
byte)**; il client non legge MAI la tabella `notifications`; il badge tab
deriva solo dagli unread chat (`useUnreadTotale`, `useChat.ts:89-95`).

Backend GIÀ PRONTO, **nessuna migrazione**: RLS `notifications_select_own` +
`notifications_update_own` (owner-only), `grant update (read_at)` per-colonna
(`20260628180000_notifications.sql:296-328`, riconfermato in
`20260705140000_grants_audit.sql:136`), indici
`notifications_user_created_idx (user_id, created_at desc)` e
`notifications_unread_idx (user_id) where read_at is null` (righe 55-57).

**Design**:
- `useNotificheTab`: `useInfiniteQuery ['notifiche', uid, 'list']`, select
  diretto `id,type,title,body,payload,read_at,created_at` con keyset
  `created_at desc, id desc`, pagina 30; query unread = head count su
  `read_at is null`.
- Schermata: lista + pull-to-refresh + stati P1 (`statoSchermo`); refetch on
  focus; **mark-all-read all'apertura del tab** (semantica Instagram: aprire
  il tab azzera il badge) = UN solo `UPDATE notifications SET read_at = now()
  WHERE read_at IS NULL` diretto via RLS+grant (nessuna RPC necessaria).
- `NotificaRow.tsx` (da scrivere): icona per tipo, titolo/body, tempo
  relativo (`lib/datetime.ts`, niente Intl), dot unread, onPress → deep link.
  Estrarre `rottaPerNotifica` da `useNotifiche.ts:65-91` in
  `src/lib/notifiche-rotte.ts` (riuso senza dipendenze da hook) ed estenderla
  per `prop` / `achievement` / `new_login`.
- **Semantica dei tipi** (decisa in sessione, coerente Instagram): la lista
  MOSTRA tutti i tipi TRANNE `message` (i DM vivono già nell'hub Messaggi);
  il mark-all-read copre TUTTE le righe, incluse le `message` (che servono
  solo al push) — così il contatore unread del ledger resta coerente col
  campo `badge` calcolato dalla Edge `send-push`.
- **Badge**: tab Notifiche = unread ledger non-message; badge icona app =
  unread chat + unread notifiche (allineare `aggiornaBadgeApp`; la divergenza
  col campo `badge` della Edge è annotata e riallineabile in P4).
- Whitelist persistenza P2: prima pagina del ledger.

---

## 8. Performance & igiene (sintomo 3 + trovati dall'audit)

| # | Problema | Fix (→ P11 salvo diversa indicazione) |
|---|----------|----------------------------------------|
| H1 | Waterfall apertura chat: `useMessages` gated su `header.myClearedAt`; l'overview ha già `cleared_at` ma lo scarta nel mapping (`chat.ts:42` vs `:83-97`) | Mappare `cleared_at` in `ConversationPreview` e seedare `clearedAt` dalla cache overview quando l'header è pending → messaggi partono subito (stessa chiave = nessun refetch doppio) |
| H2 | Zero prefetch alla navigazione | `prefetchQuery` su press: hub → header+prima pagina messaggi; LiveStrip/feed → `live_detail` |
| H3 | Primo ingresso live = buco nero (chunk+bootstrap LiveKit) | Pre-warm dopo il mount della Home: `InteractionManager.runAfterInteractions(() => { void inizializzaLiveKit(); void import('@/components/live/LiveFeed'); })` dietro guard disponibilità; fallback `Suspense` → `LoadingSpinner` |
| H4 | Receipts/reactions/senders/presence = query separate all'apertura chat | Mitigato da H1/H2; accorpamento server-side NON in scope (annotare) |
| H5 | `upsertMessage` rimappa tutte le pagine per messaggio realtime (`chat-cache.ts:39-53`) | Accettabile oggi; annotare come ottimizzazione futura |
| H6 | Docs stale: prereq `docs/live/MANUAL-TESTING.md` e `docs/media/MANUAL-TESTING.md` citano la coda deploy owner svuotata il 2026-07-12 | Aggiornare i prereq |
| H7 | `roadmap.md:3-4`: i 2 warning di scala | Chiusi da P7/P8; aggiornare |
| H8 | `app.json`: niente icona notifica (Android mostra glifo grigio default), `color #3b82f6` fuori brand | P3 |
| H9 | `expo-updates` assente (nessun OTA), `profiles.expo_push_token` colonna legacy morta (i token vivono in `devices`), `map_snapshot` unbounded | SOLO annotazioni in roadmap (nessuna azione questo round) |

---

## 9. Alternative considerate e SCARTATE (con motivo)

| Alternativa | Perché scartata |
|---|---|
| Persistenza con AsyncStorage invece di MMKV | Persister asincrono → flash di vuoto al boot prima del restore; MMKV è sincrono e già compatibile con la Dev Build in uso |
| Persistere TUTTA la cache query (no whitelist) | Blob illimitato, dati volatili (presence, search, live) senza valore offline, rischio residui; la whitelist è il contratto esplicito |
| SQLite locale per la chat offline | Potenza superiore ma doppia fonte di verità con TanStack Query; la persist-client copre il requisito AH-5 con una frazione della complessità |
| Cursore opaco per `lives_feed` con vc/aura dentro (base64/jsonb) | Leaka i contatori (decodificabile) → viola R-04; respinta |
| Offset-pagination per `lives_feed` preservando l'ordinamento vanity | Pagine instabili (le live nascono/muoiono), costo O(offset); respinta |
| Ordinamento solo-recenza per `lives_feed` | Perde il tier Top Friends, che è requisito di spec (live.md §7); respinta |
| KAV `behavior="padding"` dentro il Modal per l'input commenti | Il resize dentro Modal trasparente Android è inaffidabile; `useAnimatedKeyboard` senza Modal è deterministico |
| Notifica new_login costruita client-side sul device che RICEVE | Il client non può sapere degli altri login; DEVE nascere server-side dal login stesso |
| Geo lato client (GPS) per "vicino a…" | Sproporzionato e privacy-invasivo; l'IP best-effort server-side non tocca i permessi posizione M7 |
| RPC dedicata per mark-all-read notifiche | Non serve: `grant update (read_at)` + RLS owner-only rendono l'UPDATE diretto sicuro e atomico |
| Contatore viewer via advisory lock / tabella contatori separata | Il delta sotto row-lock su `lives` è già atomico; complessità senza guadagno alla scala prevista |

---

# PARTE II — PIANO DI IMPLEMENTAZIONE

## 10. Come usare questo piano

- **UN punto alla volta, su comando esplicito del PO** ("implementa P3").
  Ogni punto è testabile in isolamento e lascia il sistema coerente (mai
  stati intermedi rotti sul remoto).
- Ordine consigliato = numerico: P0 (diagnosi) → P1→P2 (fondamenta UX
  offline) → P3→P4 (push) → P5→P6 (sessioni) → P7→P8 (scala backend) → P9
  (live UX) → P10 (tab Notifiche) → P11 (polish+docs). **P7/P8/P9 sono
  indipendenti da P1–P6** e anticipabili a scelta del PO.
- Convenzioni comuni a ogni punto: §0.3. Ogni punto termina con `tsc
  --noEmit` + `eslint` puliti, pgTAP verdi SUL REMOTO se ha toccato il
  backend, aggiornamento di `roadmap.md`, un commit.

## 11. Stato attuale (fotografia al 2026-07-13)

- Backend: ~60 migrazioni live sul remoto; pgTAP `plan(537)`; TUTTE le Edge
  deployate (coda owner drenata il 2026-07-12); secrets LiveKit caricati e
  webhook registrato (2026-07-12, M12 verificato end-to-end su device);
  `PERSPECTIVE_API_KEY` assente (moderazione degrada a coda umana);
  segreti Vault push registrati secondo `roadmap.md:109` (2026-07-02) — **da
  RIVERIFICARE in P0** (il no-op di `dispatch_push` è silenzioso).
- Mobile: Expo SDK 54, Dev Build EAS (LiveKit/MapLibre/Skia), Expo Go
  supportato con guard sulle superfici native. Moduli completi: chat
  (CM0–CM8), drops (DM0–DM7), mappa (MM0–MM9), live (LM0–LM8).
- Git: `main` pulito, ultimo commit `681f07a` (fix bootstrap LiveKit).

## 12. Milestone

### P0 — Diagnosi live push + sessioni (read-only, NESSUN codice)

- **Obiettivo**: stabilire PERCHÉ "non arriva nulla" prima di scrivere fix;
  verificare l'ipotesi single-session. Decide se P3/P4 sono "fix root cause"
  o "hardening".
- **Attività (via pooler, runbook collaudato)**:
  1. `select name from vault.decrypted_secrets where name in
     ('edge_base_url','service_role_key','cron_secret')` → se mancano:
     `dispatch_push` è il no-op silenzioso (§3.1).
  2. `select count(*), min(created_at) from public.notifications where
     pushed_at is null` → arretrato che cresce = dispatch/Edge rotti; zero
     arretrato con `pushed_at` valorizzati = pipeline "funziona" ma nessun
     device riceve.
  3. `select user_id, platform, last_seen from public.devices` → **VUOTA =
     root cause client confermata** (il permesso non è mai stato chiesto).
  4. `select jobname, schedule from cron.job where jobname =
     'dispatch-push-minutely'` + ultimi 20 `cron.job_run_details`.
  5. `select status_code, content, created from net._http_response order by
     created desc limit 20` → 401 = `CRON_SECRET` disallineato; 5xx = crash
     Edge.
- **Attività (owner, dashboard)**: credenziali push EAS del progetto
  `4087043e-ef5a-4d73-907d-f98615c28f94` (FCM v1 service account Android,
  APNs key iOS) — senza, i ticket Expo tornano `InvalidCredentials`, oggi
  invisibili; versione deployata di `send-push`; **Authentication → Sessions:
  single-session OFF** (ipotesi alternativa per il sintomo 6).
- **Done when**: esiti annotati (roadmap.md o nota di commit) e priorità
  P3/P4 confermata.

### P1 — Rete al boot + QueryClient maturo + pattern SWR (mobile)

- **Obiettivo**: mai più "freccia refresh" istantanea; §1.2 al completo.
- **File**: `app/_layout.tsx` (initRete al mount), `src/lib/queryClient.ts`
  (retry 2 + backoff, gcTime 48h, refetchOnReconnect 'always'), nuovo
  `src/lib/query-ui.ts` (`statoSchermo`), `src/components/ui/StatoErrore.tsx`
  (variante offline), i ~18 screen che usano `StatoErrore`.
- **Rischi**: default app-wide — le mutazioni restano `retry: 0`; usare
  SEMPRE `statoSchermo` (trappola `isLoading` vs `isPending` con query in
  pausa).
- **Done when**: aereo-mode a freddo → nessuna freccia immediata, stati
  offline corretti; ritorno online → refetch automatico; `tsc`+`eslint`
  puliti.

### P2 — Persistenza cache offline + outbox su disco (mobile)

- **Obiettivo**: AH-4 + AH-5 — cold start offline con hub popolato e chat
  scorribile; coda di invio che sopravvive alla chiusura. Design completo §2.2.
- **Dipendenze**: P1 (gcTime 48h ≥ maxAge). NPM: `react-native-mmkv`,
  `@tanstack/react-query-persist-client`,
  `@tanstack/query-sync-storage-persister`.
- **File**: `app/_layout.tsx` (PersistQueryClientProvider), nuovo
  `src/lib/persistenza.ts` (storage MMKV + guard Expo Go + persister +
  whitelist), `src/store/chatStore.ts` (zustand persist), `lib/outbox.ts`
  (verifica file al flush), `hooks/useAuth.ts` (clear al logout).
- **Rischi**: dimensione blob (trim 2 pagine + whitelist stretta); cambio
  shape → bumpare `buster`; residui cross-account (clear obbligatorio al
  reset); Dev Build necessaria (in Expo Go degrada senza persistenza).
- **Done when**: aereo a freddo → hub e chat leggibili/scorribili con banner
  offline; messaggi scritti offline + app chiusa → ripartono al riavvio
  online; cambio account → zero residui; realtime/optimistic invariati.

### P3 — Push client: permesso alla shell + rotazione token (mobile)

- **Obiettivo**: il permesso viene chiesto a TUTTI gli utenti (pre-prompt
  §3.3); token sempre fresco.
- **File**: `hooks/useNotifiche.ts` (pre-prompt in `usePushRuntime` + flag
  SecureStore + `addPushTokenListener`), `app.json` (icona notifica 96×96
  monocromatica + `color` brand), asset icona (azione owner/designer).
- **Rischi**: mai mostrare il pre-prompt durante l'onboarding; mai
  ri-chiedere se `denied`; il banner hub resta come fallback.
- **Done when**: fresh install → pre-prompt → prompt OS → riga in `devices`
  (verifica pooler) → push reale ricevuta (dipende da P0/P4 per le
  credenziali).

### P4 — Push server: receipt Expo + osservabilità (backend+Edge, deploy owner)

- **Obiettivo**: gli errori di consegna smettono di essere invisibili (§3.3).
- **File**: migrazione `…_push_receipts.sql` (`push_tickets`, `push_health`,
  `dispatch_push` ridefinita verbatim+add col marker
  `dispatch_skipped_no_secrets`), `supabase/functions/send-push/index.ts`
  (v3: salva ticket, fase receipt >15 min, prune, `send_push_last_run`),
  pgTAP +~10 (tabelle, RLS attiva, zero policy, privilegi negati, prosrc).
- **Owner**: migrazione via pooler; **deploy `send-push`**.
- **Rischi**: crash tra invio e insert ticket = receipt persa (accettato,
  prune 24h); la marcatura per-chunk v2 NON va toccata.
- **Done when**: `push_tickets` si popola e si svuota nei run successivi;
  `push_health.send_push_last_run` aggiornata ogni minuto; token morto
  simulato → device eliminato; pgTAP verdi sul remoto.

### P5 — Sessioni multi-device (mobile + check owner)

- **Obiettivo**: §5.1 — logout locale, SIGNED_OUT gestito con grazia.
- **File**: `src/lib/auth.ts` (`signOut({scope:'local'})` + flag
  `logoutVolontario`), `src/hooks/useAuth.ts` (dialog "Sessione scaduta" su
  SIGNED_OUT non volontario).
- **Owner**: conferma dashboard (da P0) nessun single-session enforcement.
- **Done when**: login su B non sgancia A; logout su A non sgancia B;
  sessione revocata → dialog, non kick silenzioso.

### P6 — Notifica "nuovo accesso" (misto, deploy owner)

- **Obiettivo**: §5.2 al completo (AH-3).
- **File**: 2 migrazioni (`…_login_alert_enum.sql`, `…_login_alert.sql`),
  nuova Edge `supabase/functions/login-alert/index.ts` + `config.toml`,
  mobile: `src/lib/install-id.ts` (nuovo), `src/lib/auth.ts` (fire-and-forget
  post-login), `src/lib/expo-push.ts` (soppressione banner own-device),
  `src/lib/notifiche-rotte.ts`/`useNotifiche.ts` (rotta `new_login`),
  `types/supabase.ts`; pgTAP +~6 (enum, funzione, privilegi, prosrc dedup 1h).
- **Owner**: migrazioni via pooler; **deploy Edge `login-alert`**.
- **Rischi**: il lookup geo NON deve mai bloccare (timeout stretto, catch
  totale); la chiamata client è fire-and-forget (il login non deve rallentare).
- **Done when**: login da B → riga ledger + push su A, NIENTE banner su B;
  secondo login <1h stesso install_id → nessuna nuova riga; IP mai persistito.

### P7 — `sync_live_viewer_count` incrementale + riconciliazione (backend)

- **Obiettivo**: §6.2 al completo — delta atomico, trigger con WHEN, indice
  parziale, heal in `expire_content` v8.
- **File**: migrazione unica `…_live_viewer_count_incrementale.sql`; pgTAP
  (+~6: tre trigger presenti, prosrc `delta`/`greatest(0`, guardie v7 di
  `expire_content` che DEVONO restare verdi — righe ~520-527, 613-620,
  1070-1075 — + nuova guardia sul blocco riconciliazione; aggiornare
  ~1411-1418).
- **Rischi**: il vincolo **v8 = v7 VERBATIM + coda** è il punto più delicato
  (diff testuale = solo aggiunta); mai citare l'approccio legacy nei commenti.
- **Done when**: smoke pooler join/leave/kick/purge → contatore coerente e
  mai negativo, `peak_viewers` monotòno; drift artificiale → sanato al run
  successivo del cron; pgTAP verdi sul remoto.

### P8 — `lives_feed()` paginata keyset (misto)

- **Obiettivo**: §6.1 al completo (AH-2) — feed illimitato, R-04 intatta.
- **File**: migrazione `…_lives_feed_paginato.sql` (drop firma zero-arg +
  create nuova + revoke/grant); pgTAP (riscrivere guardie ~1769-1780);
  mobile: `hooks/useLivesFeed.ts` (cursore + load-more), `components/live/
  LiveFeed.tsx` (`onEndReached`), `store/liveStore.ts` (append `ordine`),
  `types/supabase.ts`.
- **Rischi**: compatibilità della chiamata esistente (default = prima
  pagina); dedup client su append (id già presente); la striscia resta sulla
  prima pagina.
- **Done when**: smoke pooler con >10 live simulate → 2 pagine coerenti senza
  duplicati/salti; load-more funzionante on-device; pgTAP verdi.

### P9 — Live UX: tastiera + overlay commenti (mobile)

- **Obiettivo**: §4.1 + §4.2 (sintomo 5 al completo).
- **File**: `src/components/live/CommentInput.tsx` (via il Modal,
  `useAnimatedKeyboard`), `src/components/live/CommentiOverlay.tsx` (FlatList
  inverted ~7 righe, via il timeout 10s, gradiente), `LiveSurface.tsx`
  (integrazione layer).
- **Rischi**: `pointerEvents` (non rubare gesti allo schermo live); verifica
  su Android fisico (Dev Build), incluse le interazioni con
  `softwareKeyboardLayoutMode`.
- **Done when**: su Android fisico la tastiera non copre mai l'input e si
  vede ciò che si scrive; 10 commenti rapidi → ~7 visibili, i vecchi escono
  scorrendo e restano raggiungibili fino al cap 50.

### P10 — Tab Notifiche reale (mobile, AH-1)

- **Obiettivo**: §7 al completo. Nessuna migrazione.
- **File**: `(tabs)/notifiche.tsx` (via ComingSoon), nuovo
  `src/hooks/useNotificheTab.ts`, `src/components/notifiche/NotificaRow.tsx`
  (da scrivere, oggi 0 byte), nuovo `src/lib/notifiche-rotte.ts` (estrazione
  da `useNotifiche.ts:65-91` + tipi nuovi), `BottomBar` (badge tab),
  `src/lib/expo-push.ts` (`aggiornaBadgeApp` = chat + notifiche),
  whitelist P2.
- **Rischi**: doppio conteggio message (risolto dalla semantica §7: lista
  senza `message`, mark-all su tutto); mark-all al focus non deve flashare la
  lista (update ottimistico del dot).
- **Done when**: notifiche reali listate con deep link funzionanti (prop,
  achievement, friend, live, drop, new_login); badge tab+icona coerenti;
  mark-all al focus; offline mostra l'ultima lista nota (P2).

### P11 — Performance polish + pulizia docs (mobile+docs)

- **Obiettivo**: §8 al completo (H1-H3 codice; H4-H9 note/docs).
- **File**: `lib/chat.ts` (mappare `cleared_at` in `ConversationPreview`),
  `chat/[id].tsx` (seed `clearedAt`), hub + LiveStrip/LiveFeed (prefetch su
  press), `home.tsx` (pre-warm chunk + spinner fallback), `live/[id].tsx`
  (spinner fallback), `docs/live/MANUAL-TESTING.md` +
  `docs/media/MANUAL-TESTING.md` (prereq aggiornati), `roadmap.md` (chiudere
  i warning riga 3-4, annotare H9).
- **Done when**: apertura chat/live percettibilmente più rapida (messaggi
  partono senza attendere l'header; prima live senza buco nero); docs
  allineati; `tsc`+`eslint` puliti.

## 13. Ordine e razionale

```
P0 ──► P1 ──► P2 ──► P3 ──► P4 ──► P5 ──► P6 ──► P7 ──► P8 ──► P9 ──► P10 ──► P11
diagn  rete   cache  push   push   sess.  new    viewer feed   live   tab     polish
       +SWR   +outbox client server local  login  count  keyset UX     notif.  +docs
       └── fondamenta UX ──┘└── push ──┘└─ sessioni ─┘└─ scala BE ─┘
```

- **P0 prima di tutto**: senza diagnosi, i fix push rischiano di non toccare
  la root cause reale.
- **P1→P2 sono le fondamenta**: quasi ogni sintomo UX (1, 3, 4) passa da lì;
  P2 dipende tecnicamente da P1 (gcTime ≥ maxAge).
- **P3/P4** chiudono il sintomo 2 dai due lati (client e server).
- **P5/P6** chiudono il sintomo 6 (prima il comportamento, poi la notifica).
- **P7/P8/P9 sono indipendenti da P1–P6** e anticipabili se il PO vuole
  partire dal backend.
- **P10** arriva dopo P2/P6 così la tab nasce già persistita e col tipo
  `new_login` esistente (ma può essere anticipata: degrada senza).
- **P11 ultimo**: rifiniture su fondamenta stabili + chiusura documentale.

## 14. Rischi trasversali

1. **R-1 — Default TanStack app-wide** (P1/P2): retry/gcTime/persistenza
   cambiano il comportamento di TUTTE le query; mitigazione: whitelist
   esplicita, `buster`, smoke aereo-mode su hub/chat/drops/live/mappa.
2. **R-2 — verbatim+add su funzioni condivise** (P4 `dispatch_push`, P7
   `expire_content` v8): diff testuale = solo aggiunta; le guardie pgTAP
   esistenti fanno da rete.
3. **R-3 — Guardie prosrc**: leggono anche i commenti; mai citare token o
   approcci legacy nei body nuovi.
4. **R-4 — Deploy owner** (P4 send-push, P6 login-alert): il codice va in
   repo e in coda deploy; il sistema resta coerente anche PRIMA del deploy
   (dispatch invariato; login-alert è additiva).
5. **R-5 — Dipendenze native nuove** (P2 MMKV): richiede nuova Dev Build EAS;
   guard Expo Go obbligatoria; verificare la matrice versioni con Expo 54
   PRIMA di installare (lezione LM5).
6. **R-6 — Servizio geo esterno** (P6): best-effort con timeout stretto e
   catch totale; il login NON deve mai dipendere da terzi.
7. **R-7 — Done-when on-device**: come per M6/M7/M12, la verifica finale su
   2 device fisici è azione owner; ogni punto la elenca nel proprio
   "Done when".

## 15. Definition of Done — round M13

1. Aereo-mode a freddo: hub e chat leggibili e scorribili (AH-5), zero
   "frecce refresh" immediate, stati offline espliciti ovunque.
2. Push end-to-end: fresh install → pre-prompt → token in `devices` → push
   ricevuta per messaggi, live_started, friend request, new_login; errori di
   consegna osservabili in `push_health`.
3. Multi-device: login/logout incrociati su 2 device senza sganci; notifica
   "nuovo accesso" nel ledger + push, con città best-effort.
4. Live: commenti scrivibili con tastiera visibile su Android; ~7 commenti
   visibili a scorrimento; feed live paginato oltre 150 amici senza esporre
   contatori; viewer_count incrementale coerente sotto churn.
5. Tab Notifiche reale con deep link e badge coerenti.
6. pgTAP verdi SUL REMOTO a ogni punto backend (`plan(N)` aggiornato);
   `tsc --noEmit` + `eslint` puliti a ogni punto; `roadmap.md` e i
   MANUAL-TESTING toccati aggiornati; un commit per punto.

---

# APPENDICE — M14: Fix dell'audit di verifica (2026-07-15)

Il PO ha rieseguito la checklist dell'app dopo M13 (Dev Build Android reale):
la maggior parte dei test è verde, con 5 problemi residui ❌. Round correttivo
**M14 (V0–V7)**, decisioni PO: **VF-1** co-host = dashboard quasi-host
(contatore + "Lascia il Co-Live"; fine/kick/inviti solo host principale) ·
**VF-2** preview bianca = solo area video, solo Android · **VF-3** offline
cold start = Home con cache, mai la login.

| Sintomo ❌ | Causa verificata | Fix |
|---|---|---|
| Cold start offline → login page | Token scaduto + zero rete: `getSession()` → null (falso logout: il refresh token in SecureStore è vivo); `SIGNED_OUT` spurio distruggeva anche la cache MMKV | **V1** (83ed1da): `identita-locale.ts` {uid, onboarded} → shell in modalità offline (uid per le queryKey → cache P2 a schermo); SIGNED_OUT offline ignorato; hook su `useAuth().uid` |
| Push: non arriva NULLA | **`devices` quasi vuota**: manca `google-services.json` (+`android.googleServicesFile`) → su Android `getExpoPushTokenAsync` lancia e il catch tace → token MAI registrato → Edge marca `sent: 0`. Diagnosi V0 via pooler: receipt dei 2 ticket = `ok` (niente InvalidCredentials); Vault/cron/Edge v3/login-alert tutti operativi | **V0** (diagnosi) + **azioni owner** sotto. Il fix è di CONFIGURAZIONE, non di codice |
| `push_tickets` si riempie e resta | Starvation: `dispatch_push` partiva solo con notifiche da spingere → la fase receipt della Edge non girava mai a backlog vuoto | **V2** (99620e1): dispatch_push v4, gate esteso a `push_tickets` — migrazione 65 LIVE, pgTAP 568 |
| Schermo in standby in live | `expo-keep-awake` mai usato | **V3** (0227bc8): `useKeepAwake()` in LiveSurface (tutti i ruoli) + composer; dipendenza esplicita, nessuna build nuova |
| Preview live bianca (Android) | adaptiveStream lega il download del video alla visibilità dell'elemento; nel pager il rilevamento può non scattare → stream in pausa → SurfaceView senza frame | **V4** (e512a18): Room preview senza adaptiveStream/autoSubscribe + iscrizione esplicita alla SOLA camera dell'host (banda ↓, R-3 intatta) |
| Co-Live "non fa niente" | La griglia (che ESISTE: 2 = sopra/sotto, 3-4 = quadranti) dipende da `detail.hosts`, aggiornata solo dalla revalidation 60s | **V5** (eddd256): revalida debounced 400ms su ParticipantConnected/Disconnected → split-screen entro ~2s. **V6** (f356066): dashboard quasi-host (VF-1) — `live_detail` v2 (contatori a host O co-host attivo, R-04 intatta: mai agli spettatori; migrazione 66 LIVE, pgTAP 569, smoke 3 ruoli) + pillola occhi al co-host + "Lascia il Co-Live" (RPC `live_leave` → riconnessione da spettatore) |

**Azioni OWNER (la root cause push è qui):**
1. Firebase console → progetto con app Android package `app.televo.mobile` →
   scaricare `google-services.json` in `mobile/` + aggiungere
   `"googleServicesFile": "./google-services.json"` in `app.json` → android.
2. expo.dev → progetto `4087043e-…` → Credentials → caricare la **FCM v1
   service account key** dello stesso progetto Firebase (APNs quando si
   testerà iOS).
3. **Nuova Dev Build EAS** (google-services.json entra col prebuild — gli
   altri fix M14 non la richiedono).
4. Smoke finale 2 device: checklist PO + `docs/live/MANUAL-TESTING.md` §13.

# APPENDICE — M14 round 2: le cause vere dietro i 3 ❌ residui (2026-07-15)

Seconda verifica on-device del PO (Huawei + Redmi, build EAS preview
`1a1c22c2` con `google-services.json` a bordo): 3 test su 5 ancora ❌
nonostante V0–V7, più un quarto sintomo (badge campanella mai spawnate).
Round **M14R2 (F0–F6)**: questa volta la diagnosi è su DATI REALI — ledger di
produzione via pooler, invio diretto alle API push di Expo, evidenza degli
screenshot del PO — non su lettura di codice. Tutte e quattro le cause sono
risultate DIVERSE dalle ipotesi del round precedente.

| Sintomo ❌ | Causa VERIFICATA | Fix |
|---|---|---|
| Push: token ora registrati, ma non arriva NULLA | **Ticket Expo = `InvalidCredentials`** ("Unable to retrieve the FCM server key for the recipient's app"), riprodotto con invio diretto ai 2 token reali di `devices`: per `app.televo.mobile` Expo non trova NESSUNA credenziale FCM sul progetto `4087043e` — la chiave o non è stata caricata dove serve, o è di un altro progetto Firebase. Aggravante di codice: la Edge v3 ignorava i ticket `error` ≠ DeviceNotRegistered → run "sent" con zero consegne, `receipts_checked` sempre 0, errore invisibile | **F4** (19f18b5): send-push v4 — errori di ticket in `push_health.send_push_ticket_errors` + `ticket_errors` nella run (deploy = owner). La CONSEGNA si sblocca solo con l'azione owner 1 |
| Pre-prompt del permesso mai mostrato | Il flag "una volta nella vita" su SecureStore sopravvive a upgrade/backup Android e si brucia anche quando il dialogo non viene mai visto (slot-dialogo a rimpiazzo) → sui device del PO il prompt non riappariva in NESSUNA build. (Su Android ≤12 il permesso è concesso di default: lì un prompt non esiste proprio) | **F3** (613e3d0): timestamp + cadenza — il pre-prompt si ripropone (≥24h) finché il permesso resta `undetermined`; su `denied` mai. In più il token si registra al ritorno in FOREGROUND: attivazione manuale dalle impostazioni → operativa senza riavvio |
| Preview feed ANCORA bianca | La traccia ERA sottoscritta (V4 aveva risolto quella metà: overlay renderizzato, niente fallback avatar): il guasto restante è il **compositing** — la SurfaceView dentro la FlatList paginata su Fabric non apre il buco e si vede lo sfondo FINESTRA, bianco perché `app.json` non aveva un `backgroundColor` root | **F2** (e2de7a0): `zOrder={1}` (media overlay, l'opzione 1 del piano mai provata) + `removeClippedSubviews={false}` sul pager + sfondo finestra `#04030a` (quest'ultimo attivo dalla prossima build) |
| Co-Live: split-screen MAI, co-host senza controlli publisher | **Race accettazione→webhook**, letta nel ledger di produzione: in OGNI prova la riga `live_hosts` passava ad `active` e ~350ms dopo a `left`. L'accettazione impone la riconnessione (token publisher nuovo): il `participant_left` del VECCHIO collegamento da spettatore retrocedeva il co-host appena attivato, e il mint successivo nasceva `canPublish=false` (screenshot: pillola occhi + "Lascia il Co-Live" presenti, mic/camera assenti) | **F1** (b441998): trigger `live_cohost_reconnect_guard` (migrazione 67 LIVE) — nei primi 60s dal join la transizione active→left appartiene solo alla scelta dell'utente (`live_leave`); la riconciliazione di servizio è ignorata. Smoke 3 scenari rolled-back + pgTAP 574 |
| Badge campanella mai spawnate (bottombar) | La query unread della tab Notifiche non aveva segnali di refresh: l'unica invalidazione era la push ricevuta in foreground — che non arriva (vedi sopra). Il badge chat invece ha il canale realtime | **F5** (ae201a7): `notifications` nella publication `supabase_realtime` (migrazione 68 LIVE, RLS owner-only come filtro) + canale `notifiche:hub` in usePushRuntime che invalida badge+lista a ogni INSERT. pgTAP 575 |

**Azioni OWNER (la consegna push si sblocca SOLO qui):**
1. **expo.dev → progetto `4087043e-…` → Credentials → Android →
   `app.televo.mobile` → "FCM V1 service account key"** (sezione Push
   Notifications / Service Credentials): caricare la chiave JSON generata dal
   progetto Firebase **`televo-project`** (lo stesso del
   `google-services.json` in build: project number 738493204828) da Project
   settings → Service accounts → Generate new private key. ⚠️ NON è lo slot
   "Google Service Account Key" usato per EAS Submit: serve proprio quello
   etichettato FCM V1. L'errore attuale dice che Expo non trova alcuna chiave
   per l'app — se una chiave risulta già caricata lì, va rifatta dal progetto
   Firebase giusto.
2. Verifica IMMEDIATA senza device (2 min): rieseguire l'invio di prova alle
   API Expo (script del round: `scratchpad/test-push.ts`, o Expo push tool
   sul dashboard) → il ticket deve tornare `ok` e la receipt `ok`; poi una
   push reale deve suonare sul device.
3. Deploy Edge **`send-push` v4** (F4). Il CLI su questo account risponde 403:
   serve `supabase login` con l'account owner.
4. **Nuova build EAS preview** per portare a bordo i fix mobile F2/F3/F5 (il
   bundle JS è impacchettato nel binario della preview) + lo sfondo finestra
   scuro. Comando invariato: `npx eas-cli build --platform android --profile
   preview --non-interactive` da `mobile/`.
5. Riesecuzione checklist PO sui 2 device: split-screen entro ~2s
   dall'accettazione (e controlli publisher visibili al co-host), preview feed
   col video, pre-prompt notifiche al primo avvio (o entro 24h), badge
   campanella che spawna a notifica ricevuta, push end-to-end.

## Revision history

| Rev | Data | Cosa |
|-----|------|------|
| 1 | 2026-07-13 | Prima stesura: mappatura completa (audit PO + 3 indagini + review) e piano P0–P11. Decisioni AH-1..AH-5 validate dal PO in sessione. |
| 2 | 2026-07-15 | Appendice M14 — fix dell'audit di verifica (V0–V7): diagnosi push conclusiva (root cause google-services.json), boot offline, dispatch_push v4, keep-awake, preview feed, Co-Live griglia immediata + dashboard quasi-host (VF-1..VF-3). |
| 3 | 2026-07-15 | Appendice M14 round 2 (F0–F6) — diagnosi su dati reali dei 3 ❌ residui + badge campanella: FCM `InvalidCredentials` al ticket (owner), race accettazione→webhook Co-Live (migrazione 67), compositing SurfaceView nel pager (zOrder/clipping), pre-prompt a cadenza, ledger notifiche realtime (migrazione 68). |
