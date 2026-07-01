# Televo — now.md: cosa manca per finire il frontend

> Mappa puntuale dello stato reale del mobile, verificata leggendo i file (non la
> roadmap a parole). OAuth Google/Facebook rimandato a fine progetto per scelta
> dell'utente (serve dominio/redirect pubblico) — non è nel percorso critico ora.
> Aggiornare questo file via via che si chiudono i blocchi.
>
> **Ultimo aggiornamento: 2026-07-01** — **Chat Milestone 1** fatta (STEP 0 tipi +
> M1a amicizie + M1b DM testo con realtime/spunte/unread/reply/soft-delete); dettaglio
> in **`docs/chat/roadmap-chat.md`**. Verificata tsc/eslint/export, da testare a runtime;
> micro-migrazione realtime da `db push` (vedi §M5). Prima: **Aura v3** riscritta lato
> backend (ricalcolo 0–100% a finestra mobile 7gg; vedi nota ⚠️ sotto). In precedenza
> (2026-06-30): Home design + fix bug + brand blu + login 2-intent + registrazione
> 2-step. M3 (Profilo + Aura) fatto (frontend da riadattare a v3).
>
> ✅ **Aura v3 — ALGORITMO RISCRITTO lato backend (2026-07-01).** Sostituito il
> modello v2 (ledger accumulato/decaduto, scala ~0–500) con un **ricalcolo
> deterministico a finestra mobile 7gg, output 0–100%**: statici (proof-of-human
> = ≥1 live, profilo completo, badge; cap 300) + dinamici (drop audio/media/testo,
> reazioni, minuti live con cap e rendimenti decrescenti; cap 700) − penalità
> (segnalazioni*50 + mute*25). Cron passato a **giornaliero** + notifiche
> `aura_upgrade`/`aura_downgrade` (±5%). Migrazioni `20260701000000_aura_v3_enums.sql`
> e `20260701000100_aura_v3.sql` (drops esteso col formato **media**). **Da
> `db push`are** sul remoto (vedi §3). `aura_events`/`props`/`emit_aura` restano
> (storico + colore tratti).
>
> ⚠️ **Dipendenze NON ancora riallineate** (deciso "solo Aura ora"): le milestone
> achievement (`aura_100/250/500`) e le classifiche (`leaderboard_*`) sono ancora
> sulla vecchia scala → su 0–100 `aura_250`/`aura_500` non scattano più, `aura_100`
> solo a 100%. Da sistemare in un round successivo. La resa visiva (AuraRing,
> AuraScore, classifiche) resta da rivedere (troppo gamification — vedi §1.4) e va
> riadattata alla scala 0–100% quando si fa il design vero.

---

## 0. Metodo di verifica usato

- Letti tutti i file in `mobile/app/**` e `mobile/src/**`.
- Contate le righe reali dei file feature (`src/components/{aura,stanze,chat,
  drops,mappa,notifiche}`, `src/hooks/*`, `src/store/{aura,stanze,chat}Store.ts`,
  `src/lib/{livekit,expo-push}.ts`): **tutti a 0 righe** → file scaffolded ma vuoti.
- Controllato `mobile/package.json`: **LiveKit e react-native-maps NON sono
  installati** (la roadmap li cita nello stack ma non sono dipendenze reali).
- `supabase migration list` non eseguibile da qui (CLI crasha su Windows in questo
  ambiente, `spawnSync ... UNKNOWN`) → stato migrazione 22 da verificare a mano in
  dashboard, non assumere.

---

## 1. Cosa è REALMENTE completo

### Backend — live + Aura v3 da pushare
21 migrazioni + 10 Edge Functions + 82 pgTAP su Supabase hosted. Vedi `CLAUDE.md`.
**Eccezione**: migrazione 22 (`20260629120000_onboarding_oauth.sql`) confermata
applicata (§3.1). **Nuove (2026-07-01, da `db push`):** migrazione 23
(`20260701000000_aura_v3_enums.sql`) + 24 (`20260701000100_aura_v3.sql`) = **Aura
v3** (vedi nota in cima). pgTAP esteso a **99 invarianti**. Nessuna nuova Edge
Function (la `aura-recompute` chiama solo `recompute_aura()`, ridefinita).

### Mobile — Bootstrap (M0)
`app/_layout.tsx`, `app/index.tsx`, `authStore`, `useAuth`, `queryClient`,
provider. App parte, redirige auth/main.

### Mobile — Auth/Onboarding (M1) — pixel-perfect sulla welcome, login a PASSWORD
- `welcome.tsx` ricostruita identica al mockup (logo immagine, 3 metodi
  Facebook/Google/Email, sfondo foto), vedi [[mobile-login-rebuild]].
- **Flusso email a password** (cambiato dall'OTP passwordless): `email.tsx` →
  `password.tsx` → Home/onboarding. Flusso unico: si tenta `signInWithPassword`;
  su credenziali invalide si propone di creare l'account (`signUpWithPassword`).
- **Recupero password via OTP**: "Password dimenticata?" in `password.tsx` invia
  l'OTP (`sendEmailOtp`) → `verifica.tsx` in modalità reset (`resetFlow`) →
  `nuova-password.tsx` (`updatePassword`) → Home/onboarding.
- `registrazione.tsx` (wizard: Invito → Username+Nome → Nascita ≥16 → Foto
  opzionale → Consensi), `invito.tsx` (prefill da deep link). **Verificato** che
  l'onboarding raccoglie username, nome, foto (preview, opzionale) ed età (≥16).
- `verifica.tsx` (OTP) ora serve SOLO il reset password (non più l'accesso).
- `telefono.tsx` esiste ma è **morto**: rotta non raggiungibile dalla UI, SMS non
  attivo lato backend — lasciato per una futura feature SMS.
- Google: codice presente (`signInWithProvider`, `@react-native-google-signin` **non
  installato** — verificare, vedi §2) ma **non attivabile finché non c'è dominio**
  (richiesto per redirect OAuth) → per scelta esplicita dell'utente, rimandato.
- Facebook: stesso discorso, stessa decisione.

### Mobile — Shell (M2) — FATTA: frame di navigazione reale
- **Bottom bar custom a 5 voci** (`(tabs)/_layout.tsx` + `BottomBar.tsx`):
  Home · Messaggi · **+** (crea, FAB accent centrale) · Notifiche · Menu.
- **Header Home** (`HomeHeader.tsx`): cerchio avatar a sinistra (→ `/profilo`),
  wordmark "televo" al centro, icona ricerca a destra (→ `/cerca`).
- **Barra categorie** (`CategoryBar.tsx` + `src/constants/feed.ts`): Discover
  (default) · Live · Map · Aura · Sport. **"Reels" RIMOSSO** (il concept non lo
  contempla). Resa a TESTO + underline viola sull'attiva (non più chip pill).
- **Home** (`home.tsx`): Discover = **feed design completo** (vedi §1.5);
  Sport = `ComingSoon` "Prossimamente" (nessun backend); Live/Map/Aura =
  `ComingSoon` (backend reale, da collegare in M4/M7).
- **Schermate bottom bar**: `messages`/`crea`/`notifiche` = `ComingSoon`; `menu`
  (hamburger) ha il profilo, le voci future e il **Logout reale** (`signOut`).
- **Rotte stack** (`(main)/profilo.tsx`, `cerca.tsx`): aperte dall'header, non tab.
- Verificato: `tsc --noEmit` pulito, `eslint .` 0 problemi. Tutto gira in Expo Go.

### 🟣 M3 — Profilo + Aura (proprio) — ✅ FATTO (logica), ⚠️ design da rivedere
**Scope**: solo profilo PROPRIO, completo. Profilo altrui (`/profilo/[id]`) e UI
per dare prop sono fuori scope (blocco successivo, riusano questi componenti).

- **Fix**: rimossa l'apertura del profilo dall'hamburger menu (voce tolta, card
  non premibile) — si apre SOLO dal cerchio avatar nell'header Home.
- **Tipi DB corretti** in `src/types/supabase.ts`: erano disallineati dalle
  migrazioni reali su `achievements`/`user_achievements` (chiavi sbagliate),
  `friendships` (mancava `blocked`/`blocked_by`), `drops` (`type`/`audio_url`,
  niente `deleted_at`), RPC amicizie (`p_target` non `target`, ritorno jsonb).
  Aggiunte `top_friends`, `leaderboard_character`, `leaderboard_school` (mancanti
  del tutto). Senza questo fix le query sarebbero fallite a runtime.
- **Hook scritti** (read-only via RLS, nessuna RPC nuova): `useProfilo.ts`
  (profilo+modifica, conteggio amici, drop attivi, cerchia stretta),
  `useAura.ts` (Aura composta da cache+snapshot, storico, prop ricevuti,
  posizione in classifica carattere/scuola), `useAchievement.ts` (catalogo +
  sbloccati + badge di livello).
- **Componenti scritti**: `AuraRing` (SVG+Reanimated, "respira", colore dal
  tratto dominante), `AuraScore`, `AuraBreakdown`, `Classifica`, `PropCard`,
  `AuraBadge`, `ui/Badge.tsx`.
- **Schermate**: `profilo.tsx` riscritto (Aura, conteggi Amici/Drop/Classifica —
  NIENTE follower, bio=`status_text`), nuove `profilo/modifica.tsx` (nome/
  username/bio/foto, upload avatar) e `profilo/aura.tsx` (grafico andamento +
  spiegazione concept).
- **Verificato**: `tsc --noEmit` 0 errori, `eslint .` 0 problemi, `expo export`
  (bundle Metro) completato senza errori — import e routing validi (incl.
  `profilo.tsx` + cartella `profilo/` che coesistono in Expo Router 6). **NON
  testato a runtime** con login reale su device/Expo Go — da fare prima di
  considerarlo chiuso al 100%.
- **⚠️ Nota di design aperta** (segnalata dall'utente 2026-06-30): la resa
  visiva dell'Aura è troppo "gamification" (numero score grande, progress bar
  "prossimo traguardo", badge "esclusivo", classifiche #N in evidenza) rispetto
  al concept di reputazione vivente/ambientale del brief. Va rivista la RESA
  quando si fa il design vero (meno enfasi numerica, più colore/movimento;
  classifiche in sezione secondaria, non subito sotto l'anello).
- **⚠️ Frontend Aura DA RIADATTARE a v3** (2026-07-01): gli hook (`useAura.ts`)
  e i componenti M3 sono stati scritti contro la **vecchia** scala (cache decaduta
  ~0–500, "prossimo traguardo" a 100/250/500). Con **Aura v3** il punteggio è una
  **percentuale 0–100** (`profiles.aura_score`) e c'è l'RPC `my_aura_percentage()`
  per il valore live. Il profilo va riallineato (anello = percentuale, niente
  milestone 250/500) nel round frontend dedicato.

### 🎨 Design Home (Discover) — ✅ FATTO (2026-06-30)
Pausa dalla roadmap per fare il **design completo della Home** sul mockup
`mobile/assets/images/homepage-goal.png` (feed sociale verticale a card grandi).
- **Header** (`HomeHeader.tsx`): wordmark **"Televo"** (era `televo`), avatar con
  anello viola di marca, ricerca. Larghezza ricerca ribilanciata (45) per centrare
  il wordmark con l'anello.
- **CategoryBar**: da chip pill → **testo + underline viola** sull'attiva.
- **Feed Discover** = mix di TUTTE le categorie (drop/live/map/aura/sport) come
  **card grandi sociali** con: header (avatar+✓+tempo+…), media GRIGIO placeholder
  con chip-tipo (`MediaPlaceholder`), rail azioni verticale (`FeedActionRail`:
  follow/like/commenti/share, no-op aptici), caption + hashtag viola + tag musica,
  dots (`FeedPaginationDots`). Una card **LIVE** in fondo (`FeedLiveCard`: badge
  LIVE, "Entra"). Dati STATICI in `src/constants/feedItems.ts` (forma-target per i
  dati reali). Componente unico `FeedCard` parametrico per `kind`.
- **BottomBar**: niente label, "+" = quadrato scuro bordato (non pill viola),
  puntino viola sotto la voce attiva (icona attiva bianca).
- **Crea (+)** (`crea.tsx` + `src/constants/createTypes.ts`): elenca TUTTI i tipi
  creabili derivati dal backend (Drop, Stanza Live, Media, Nota vocale, Dai Aura/
  prop, Gruppo/house) come **frame "presto"** — nessuna logica di creazione ancora.
- **"Reels" rimosso** ovunque (feed.ts, home.tsx, crea.tsx). `FeedSkeleton.tsx`
  resta in repo ma non più importato.
- **Verificato**: `tsc --noEmit` 0 errori, `eslint .` 0 problemi, `expo export`
  (bundle iOS 5.37 MB) OK. **Non ancora testato a runtime** su device/Expo Go.

### 🩹 Fix Home + Brand + Login — ✅ FATTO (2026-06-30, dopo test utente)
Secondo giro sul feedback dell'utente in Expo Go. **Supera alcune note del blocco
qui sopra** (il viola UI, l'anello avatar, i chip: vedi sotto lo stato vero).
- **BUG buco nero (Home)** risolto: il feed partiva a metà schermo. Causa:
  `flexGrow:1` + `gap` sul `contentContainerStyle` con un `Fragment` come unico
  figlio dello ScrollView. Fix: `FeedBody` ritorna un `<View style={{gap}}>` reale
  (`home.tsx`), niente `flexGrow`.
- **BUG triplo re-render all'avvio** risolto: da loggato si vedeva bianco →
  schermata "Hai un invito?" → Home. Causa: `useAuth.ts` spegneva `initializing`
  PRIMA di caricare il profilo (fetch differita) → istante con `isOnboarded=false`
  → redirect a `/registrazione`. Fix: `loadProfile` ora è awaitable e
  `setInitializing(false)` avviene SOLO dopo che il profilo è risolto.
- **Brand: via il viola dalla UI → BLU.** `theme.ts` era ancora `accent:#a78bfa`
  (viola) mentre `tailwind.config.js` era già blu: allineato a `#3b82f6/#60a5fa/
  #2563eb`. Tutti gli usi UI di `colors.viola` → `colors.accent` (CategoryBar,
  dots, BottomBar, ✓ verificato, `FEED_KIND_META`, alone del LoginBackground). Il
  **logo/wordmark resta viola→fucsia** (firma di marca: `LaunchRing`/`BrandLockup`/
  Aura intoccati). Vale anche per il login (bottoni/link già su `colors.accent`).
- **Home header**: wordmark ora è l'**immagine** `wordmark.jpg` (`BrandLockup`
  size 18), avatar **senza cerchio viola**; CategoryBar con scritte più
  piccole/eleganti e **"Map"** (non "Mappa").
- **BottomBar floating**: pillola glass scura staccata dai bordi, "+" quadrato in
  **glass grigio** (non più pill viola). Aggiunto `paddingBottom` nelle tab
  (home/messages/notifiche/crea/menu) per non finire sotto la barra.
- **Flow login corretto**: in `welcome.tsx` "Continua con email" = **registrazione**
  (`intent:'signup'`), "Accedi" = **accesso** (`intent:'signin'`). `password.tsx`
  rispetta l'intent (signup crea; signin accede, niente creazione silenziosa).
- **Registrazione 5→2 step, leggera/premium**: nuovi `StepProfilo` (invito+username+
  nome+nascita) e `StepFinalizza` (foto opz.+consensi→`complete_onboarding`),
  progresso discreto "1 di 2". Rimossi i vecchi `Step{Invito,Username,Nascita,Foto,
  Consensi,Dots,Notifiche,Layout}` (codice morto). Logica/RPC invariate.
- **Verificato**: `tsc`/`eslint` 0 problemi, `expo export` (bundle iOS) OK. Da
  testare a runtime in Expo Go (login reale + avvio già loggato).

---

## 2. Cosa manca — per ogni verticale (M4→M11)

Tutti i file sotto esistono già come **scheletro vuoto (0 righe)**: sono stub
creati ma da scrivere da zero, nessuna logica presente.

### 🔥 M4 — Stanze Live (secondo pilastro, Proof of Human)
- **Bloccante hard**: `LiveKit` SDK **non è una dipendenza installata**
  (`@livekit/react-native` assente da `package.json`) + serve **Development Build
  EAS** (non gira in Expo Go) + servono le chiavi `LIVEKIT_API_KEY`/`SECRET` lato
  Supabase (volutamente non configurate finché non si arriva a questo blocco).
- `src/lib/livekit.ts` — 0 righe.
- `app/.../stanza/[id].tsx`, `stanza/crea.tsx`, `(tabs)/live.tsx` — non esistono
  come file reali (solo placeholder).
- `src/components/stanze/{StanzaCard,BollaViva,Partecipante,VibeChain}.tsx` — 0 righe.
- `src/hooks/useStanze.ts`, `src/store/stanzeStore.ts` — 0 righe.

### 💬 M5 — Social + Chat — 🟡 IN CORSO (Milestone 1 fatta, 2026-07-01)
> Roadmap dettagliata e stato vivo: **`docs/chat/roadmap-chat.md`** (fonte di verità
> dello stato). Spec di prodotto: `docs/chat/SRS-chat.md`.
- **✅ STEP 0 — tipi riallineati** al DB reale in `src/types/supabase.ts`+`index.ts`
  (conversations `type/name/dm_key/updated_at`, messages `type/audio_url`, +
  `conversation_members/streaks/usage_daily`, firme RPC, notifications `type/payload`).
- **✅ M1a — UI amicizie**: `useAmici`, `amici/index.tsx`, `profilo/[id].tsx`, lib
  `rpc/social/errors`. Richiesta/accetta/rimuovi/blocca + ricerca utenti + apri DM.
- **✅ M1b — DM testo (walking skeleton)**: `useChat`, `chatStore`, `lib/chat`,
  `lib/chat-realtime`, `lib/datetime`, componenti `chat/*` (bolle, composer,
  separatori, riga lista), `chat/[id].tsx` + hub `messages.tsx` riscritto. Realtime,
  spunte, unread, reply, soft-delete. Verificati `tsc`/`eslint`/`expo export`; **da
  testare a runtime** in Expo Go con 2 account.
- **⏳ Prossimo**: M2 vocali effimeri (`expo-av` già installato), poi M3 gruppi.
- Stub ancora vuoti fuori chat: `StreakBadge` è stato riempito; restano da riempire
  in blocchi successivi le UI di drops/mappa/stanze/notifiche.

> **⚠️ Da `db push`**: nuova migrazione `20260701010000_chat_realtime.sql` (aggiunge
> messages/conversations/conversation_members alla publication `supabase_realtime`).
> Necessaria per il realtime live; senza, la chat funziona col refetch on-focus.

### ☁️ M6 — Drops
- `src/components/drops/{DropCard,DropFeed}.tsx` — 0 righe.
- `src/hooks/useDrops.ts` — 0 righe.
- Nessuna integrazione in home.

### 🗺️ M7 — Mappa Vibe
- **Bloccante hard**: `react-native-maps` **non installato**, serve **Mapbox/Google
  Maps token** + **Development Build EAS** (non gira in Expo Go).
- `app/.../mappa/index.tsx` — non esiste come file (solo tab placeholder).
- `src/components/mappa/{BollaLive,AuraPin}.tsx` — 0 righe.
- `src/hooks/useMappa.ts` — 0 righe. Vista backend `vibe_map` già pronta.

### 🔔 M8 — Notifiche push
- `src/lib/expo-push.ts` — 0 righe (RPC `register_device` da chiamare).
- `app/.../(tabs)/notifiche.tsx` — schermata reale con `ComingSoon` (frame pronto,
  dati e push da collegare).
- `src/components/notifiche/NotificaRow.tsx`, `src/hooks/useNotifiche.ts` — 0 righe.
- `expo-notifications` è installato ma non configurato/usato.
- Edge `send-push` già deployata e funzionante lato backend.

### 💎 M9 — Economia Vibes (simbolica)
- Nessun file UI esiste ancora (non scaffolded). Tip simbolici via Edge
  `process-tip` (già attiva e idempotente lato backend), saldo wallet da mostrare,
  gate 18+ già imposto a DB.

### 🛡️ M10 — Moderazione & Safety UI
- Nessun file UI esiste ancora. RPC `file_report`, block/unblock già pronte lato
  backend; manca solo il flow client.

### 📜 M11 — GDPR UI
- Nessun file UI esiste ancora. Consensi da agganciare in onboarding
  (`record_consent` — verificare se già chiamata in `StepConsensi.tsx`, da
  controllare), export/delete account da Edge `gdpr-export`/`gdpr-delete` in
  Impostazioni (Impostazioni stessa non esiste ancora come schermata).

### ♻️ Trasversale (mai iniziato)
- `src/components/ui/{Badge,BottomSheet}.tsx` — esistono ma **0 righe**.
- Font reali: solo Poppins bundlato finora; Inter/Clash Display citati in roadmap
  ma non verificati come assets presenti.
- Asset reali: icon/splash/adaptive-icon sono ancora **placeholder generici**, non
  branded.
- Stati loading/empty/error: assenti ovunque (nessun componente li gestisce).
- Accessibilità: non affrontata.
- **EAS Dev Build**: non configurato (`eas.json` da verificare/creare) — necessario
  per sbloccare LiveKit (M4) e Maps (M7), oltre che Google Sign-In nativo.
- Testing: nessun test scritto sul mobile (solo pgTAP lato backend).

---

## 3. Cose da verificare/sbloccare prima di proseguire

### 3.1 Migrazione 22 — ✅ CONFERMATA applicata (verificato 2026-06-30)
`20260629120000_onboarding_oauth.sql` è live sul DB remoto: `supabase migration
list` ha funzionato in questa sessione (smentito il crash `spawnSync UNKNOWN`
annotato qui in precedenza — quella nota era obsoleta) e locale/remoto combaciano
fino a questa migrazione inclusa. `complete_onboarding`/`check_invite`/
`create_invite` sono live. **Nessun `db push` necessario.**

### 3.1bis Migrazioni 23–24 (Aura v3) — ⏳ DA `db push`are (2026-07-01)
`20260701000000_aura_v3_enums.sql` (valori enum `aura_upgrade`/`aura_downgrade`,
commit a sé per il vincolo `ALTER TYPE ADD VALUE`) + `20260701000100_aura_v3.sql`
(drop `media`, helper `aura_static/dynamic/penalty_points` + `aura_percentage` +
`my_aura_percentage`, `recompute_aura()` v3, cron `aura-recompute-daily`). Passi:
1. `supabase db push` (applica 23 poi 24, in ordine).
2. `supabase test db` → pgTAP a **99** invarianti, tutte verdi.
3. `select * from cron.job` → deve esserci `aura-recompute-daily`, non più
   `-weekly`. Niente `functions deploy` (la Edge `aura-recompute` è invariata).
> ⚠️ Se al primo push Postgres segnala un errore (le v3 sono verificate per
> coerenza ma non applicate su Postgres reale — niente Docker locale), leggere il
> messaggio e correggere il file interessato.

### 3.2 Dipendenze mancanti da installare quando si apre il blocco
- M4: `@livekit/react-native` (o equivalente SDK ufficiale) + EAS Dev Build.
- M7: `react-native-maps` + token Mapbox/Google Maps + EAS Dev Build.
- Verificare se `@react-native-google-signin/google-signin` è davvero installato
  (la roadmap lo dà per fatto ma non risulta in `package.json` attuale — controllo
  rapido da fare prima di riattivare Google OAuth a fine progetto).

### 3.3 OAuth Google/Facebook — confermato rimandato
Per decisione esplicita dell'utente: serve un dominio (redirect URL pubblico
stabile) prima che abbia senso configurarli su Supabase dashboard + Google Cloud
Console + Meta for Developers. Il codice client (`signInWithProvider` in
`src/lib/auth.ts`) è già pronto e degrada con grazia — nessuna azione richiesta
finché non si arriva in fondo alla roadmap.

---

## 4. Piano: Home "tecnica" come frame, design dopo — ✅ FRAME FATTO

**Stato (2026-06-30)**: la Home "tecnica" (§4.1) è **fatta**, e ora anche **M3 —
Profilo + Aura** (§4.2) è fatto a livello di logica/dati (verificato tsc/eslint/
bundle; resta da testare a runtime e da rivedere la resa visiva dell'Aura, vedi
nota in §1.4). Il **prossimo blocco concreto è M5 — Social/Chat** oppure **M6 —
Drops** (§4.3), entrambi senza dipendenze native. Il design definitivo della Home
resta per la fine, quando tutti i pilastri esistono e si sa cosa mostrare.

**Approccio (storico, mantenuto)**: costruire la **Home SUBITO** come hub di
navigazione funzionante (non design-heavy), senza spendere ore su UI/UX. È il
frame dove piazzerai i pezzi di feature man mano che li finisci. **Design della
Home rimanda a dopo**, quando tutti i pilastri (Aura, Stanze, Chat, Drops,
Mappa) esistono — a quel punto saprai cosa mostrare e come.

**Perché funziona così:**
- Un utente che esce da onboarding atterra in Home e **DEVE poter navigare** verso
  Profilo / Live / Chat / Mappa / Notifiche. Se quelle schermste sono ancora
  placeholder, va bene, ma il frame di navigazione deve esistere.
- Costruisci Profilo (con Aura vero dentro), e la navigazione dalla Home già lo
  raggiunge — nessuna riscrittura di Home, la infili dentro il tab "Profilo" e
  basta.
- Quando arriva Aura vero, metti un preview dell'Aura ring nella Home se vuoi;
  quando arrivano Drops, metti una lista; quando arrivano Live, metti "live in
  corso" — ma il **frame di navigazione esiste già e non cambia**.
- Design della Home è l'ultimo passo: a quel punto sai che dentro ci metti, e lo
  fai bello una sola volta.

### 4.1 M2 reale — Home "tecnica" — ✅ FATTA
- `app/(main)/(tabs)/home.tsx` — header (avatar/profilo + "televo" + ricerca) +
  barra categorie (Discover/Reels/Live/Map/Aura/Sport) + corpo che cambia per
  categoria (Discover = scheletro; resto = `ComingSoon`).
- Bottom bar custom a 5 voci (`BottomBar.tsx`) con **+** centrale; rotte stack
  `profilo`/`cerca` dall'header; Logout reale nel menu.
- Nessuna query costosa, nessun dettaglio di design pesante — solo struttura
  navigabile, come da piano. Dati reali da collegare categoria per categoria.

### 4.2 M3 — Profilo + Aura — ✅ FATTO (logica/dati)
- Profilo proprio riscritto con `AuraRing` reale, breakdown, classifiche, prop
  ricevuti, traguardi — tutto collegato al DB via hook dedicati (vedi §1.4 per il
  dettaglio file-per-file).
- **Resta**: test a runtime su device/Expo Go con login reale; revisione della
  resa visiva dell'Aura (troppo gamification, vedi nota in cima al file).
- **Fuori scope qui, blocco successivo**: profilo altrui (`/profilo/[id]`), UI
  per dare un prop a un altro utente.

### 4.3 Ordine per gli altri blocchi (parallelo, nessun vincolo)
1. **M5 — Chat/Social**: tab Chat pronta, dentro navigazione a chat/[id]. Riusa
   l'amicizia mutua già a posto in `useProfilo.ts`/RPC backend.
2. **M6 — Drops**: piccolo, infila un feed nella Home o in una tab. Il conteggio
   drop attivi è già pronto (`useDropCount`).
3. **M8 — Notifiche**: `expo-notifications` cablato, tab notifiche popolare.
4. **EAS Dev Build** → **M4 Stanze Live** + **M7 Mappa** (dipendenze native).
5. **M9/M10/M11** (economia, moderazione, GDPR): bassa priorità.
6. **Design completo della Home** + **revisione design Aura** + **OAuth reale** +
   **asset branded** + **EAS prod**: tutto insieme a fine progetto.

### 4.4 Verifiche preliminari — ✅ FATTE
1. ~~Migrazione 22 live?~~ — confermato applicata (§3.1), nessuna azione.
2. Home "tecnica" scritta (§4.1) e il progetto
   ha il suo frame di navigazione stabile.

---

## 5. Nota sulla fonte di verità

`roadmap.md` (root) descrive lo stack come se LiveKit/Maps/Google-Signin fossero
già installati — **non lo sono**, verificato da `package.json`. Questo file
(`now.md`) riflette lo stato reale dei file al 2026-06-30; se diverge da
`roadmap.md` in futuro, fidarsi del codice (`ls`/`wc -l`/`grep`), non del testo
della roadmap, e poi aggiornare entrambi i documenti.
