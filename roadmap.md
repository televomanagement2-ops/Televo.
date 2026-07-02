# Televo — Roadmap & Stato del Progetto

> Documento di verità sullo stato di Televo. Backend **live**; frontend in
> costruzione. Aggiornare a ogni milestone. Compagno di `CLAUDE.md` (che resta la
> mappa del backend) e del piano fondante `vai-curried-canyon.md`.
>
> **Ultimo aggiornamento:** 2026-07-02

---

## PARTE 1 — Stato attuale (cosa è FATTO)

### 1.1 Backend — ✅ LIVE e verificato

Progetto Supabase hosted `mmunnybytyfybncohkky` ("Televo Project"), org
`awwomlomjvuozfezspyq`, regione **eu-central-2**, Postgres 17.

| Area | Stato |
|------|-------|
| 22 migrazioni (Fasi 0–8 + GDPR + onboarding, confermata live il 2026-06-30) | ✅ applicate (`migration list`: locale = remoto) |
| Migrazioni 23–33 (Aura v3 23–24, **chat 25–33**: realtime, org D4, salvati, media D3, presenza/privacy, contatti D1) | ⏳ scritte in locale, **da `db push`** — milestone **CM0** del piano chat (`docs/chat/IMPLEMENTATION-PLAN.md`) |
| 10 Edge Functions | ✅ deployate (Aura v3 non ne aggiunge) |
| 3 Vault secrets (`edge_base_url`, `service_role_key`, `cron_secret`) | ✅ impostati |
| 99 invarianti pgTAP | ✅ 82 passate + 13 nuove (Aura v3) da eseguire |
| 7 cron job pg_cron (`aura-recompute` ora **daily**) | ✅ attivi |

**Domini coperti dal backend** (dettaglio in `CLAUDE.md` §4): identità + inviti +
age-gate ≥16 · Aura v2 (props, decadimento half-life 14gg, classifiche) · Stanze
Live + token LiveKit · Social/amicizie + conversazioni + messaggi vocali effimeri
· streak · drops · Mappa Vibe (friends-only) · notifiche + achievement ·
moderazione + safety · economia Vibes (simbolica attiva, Stripe inerte) · GDPR.

**Volutamente NON configurato** (degrada con grazia, si attiva quando servirà):
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / WS URL — necessari per le Stanze Live
- `PERSPECTIVE_API_KEY` — moderazione AI (senza: revisione umana)
- `STRIPE_*` — economia reale (lancio 2027)

**Note operative apprese:**
- Il progetto Televo è su un account Supabase distinto: serve `supabase login`
  con `televo.management2@gmail.com` perché la CLI lo veda.
- Piano **Free** → `supabase gen types` e alcune API management danno 403. I tipi
  TS del DB sono quindi **mantenuti a mano** in `mobile/src/types/supabase.ts`.
- Niente Docker locale, niente `psql` → i test pgTAP girano dal **SQL Editor**
  della dashboard (prefissando `create extension … pgtap` + `set search_path`).
- **NON rifare `db push`** per le 21 migrazioni originali: è tutto già applicato.

> ✅ **Migrazione 22 (onboarding) applicata** — confermata live il 2026-06-30
> (RPC `complete_onboarding`/`check_invite`/`create_invite` funzionanti).
>
> ⚠️ **Migrazioni 23–33 in attesa di push** (Aura v3 + tutte le migrazioni chat:
> realtime publication, organizzazione D4, salvati, media D3, presenza/privacy,
> contatti D1). Si applicano nella milestone **CM0** del piano chat
> (`docs/chat/IMPLEMENTATION-PLAN.md`), con verifica pgTAP e fix in corsa.
> Senza il push, il **realtime della chat non funziona**. Nessuna nuova Edge
> Function richiesta.

### 1.2 Frontend — 🟢 Avvio + Auth/Onboarding completi

App in `mobile/`. Stack: Expo SDK 55 · React Native 0.84 (New Architecture) ·
TypeScript strict · Expo Router · NativeWind v4 · Zustand · TanStack Query ·
Reanimated v4 · LiveKit · react-native-maps. Navigazione **file-based**.

**✅ Fatto — 14 file riempiti:**

*Config progetto:* `package.json`, `tsconfig.json` (strict + alias `@/`),
`app.json` (permessi micro/posizione, plugin LiveKit, splash dark),
`babel.config.js`, `metro.config.js`, `tailwind.config.js`, `global.css`,
`.env.example`, `.gitignore`.

*Design system (`src/constants/`):*
- `theme.ts` — colori (dark `#04030a` + accento viola→fucsia), spacing, radius,
  `motion` (durate breath/pulse per animazioni organiche), `glow`.
- `aura.ts` — tratti e colori **fedeli a `vibe_color()` del DB**, etichette IT,
  tratti delle classifiche, milestone (100/250/500), half-life.
- `routes.ts` — route tipizzate (statiche + costruttori dinamici).

*Data layer:*
- `src/lib/supabase.ts` — client singleton, sessione persistita in **SecureStore**
  (Keychain/Keystore), auto-refresh legato all'AppState.
- `src/types/supabase.ts` — tipi `Database` fedeli alle migrazioni (mantenuti a
  mano finché il piano Free blocca `gen types`).
- `src/types/index.ts` — modelli di dominio per la UI (ProfileCard, AuraProfile,
  ConversationPreview, RoomCard, …).

**✅ Fatto in questo round — Avvio (M0) + Auth/Onboarding (M1):**
- **Dipendenze installate** (`npm install` con `.npmrc` `legacy-peer-deps=true`),
  `+ expo-linear-gradient`, `@react-native-google-signin/google-signin`,
  `react-native-worklets` (richiesto da Reanimated v4 → babel usa
  `react-native-worklets/plugin`), `ajv@8` fissato (l'hoisting di `ajv@6` di
  eslint rompeva il config-plugin di expo-router). Aggiunto `eslint.config.js`
  (flat config) e asset placeholder in `assets/images/`.
- **Bootstrap**: `app/_layout.tsx` (provider + listener auth + deep link invito),
  `app/index.tsx` (launch animato → gating), `queryClient`, `authStore`,
  `onboardingStore`, `useAuth`, `lib/auth.ts`.
- **Brand**: anello neon SOLO al launch (`LaunchRing`/`AppLaunch`), wordmark.
- **UI**: `Button` (gradiente+haptic), `Input` (label fluttuante), `OtpInput`,
  `SafeScreen`, `Placeholder`.
- **Auth**: `(auth)/splash` (welcome), `login` (email OTP + Google), wizard
  `registrazione` con step Invito → Nascita(≥16) → Email → OTP → Username →
  Consensi(finalize) → Notifiche; path Google salta email/OTP. `invito.tsx`
  precompila il codice da deep link.
- **Shell placeholder**: `(main)` guard + tab bar dark minimale + home "sei dentro".
- **Verificato**: `tsc --noEmit` pulito, `eslint` 0 problemi, bundle Metro OK
  (1746 moduli). Rimosse le cartelle route vuote in conflitto (chat/mappa-detail/
  profilo-detail/stanza): si ricreeranno con le rispettive feature.

**⬜ Restano vuoti (feature future):** componenti `src/components/{aura,chat,drops,
mappa,notifiche,stanze}`, hook `src/hooks/*`, store `auraStore/chatStore/stanzeStore`,
`src/lib/{livekit,expo-push}.ts`, `src/components/aura/AuraRing.tsx` (anello
reputazione di M3, diverso dall'anello di launch).

**⚠️ Per il test end-to-end servono:** (1) `supabase db push` della migrazione 22;
(2) credenziali Google Cloud + provider Google su Supabase + template email OTP
col token; (3) un **Development Build EAS** per Google nativo/LiveKit/Maps (non
girano in Expo Go — lì si testa il path **email/OTP**).

---

## PARTE 2 — Roadmap (come proseguire)

Milestone in ordine di dipendenza. **M0–M2 sono bloccanti** (l'app deve avviarsi e
autenticare prima di tutto). Da M3 in poi sono verticali di feature, ordinati per
priorità di prodotto: **Aura** e **Stanze Live** sono i due pilastri, vengono prima.

### ✅ M0 — App avviabile (bootstrap) — FATTO
*Obiettivo: `expo start` parte, provider in piedi, redirect auth/main.*
- `npm install` in `mobile/`.
- `app/_layout.tsx` — root: `QueryClientProvider`, `GestureHandlerRootView`,
  `SafeAreaProvider`, `Stack`, caricamento font, gestione splash, `global.css`.
- `app/index.tsx` — redirect: sessione presente → `(main)`, altrimenti `(auth)`.
- `src/store/authStore.ts` — Zustand: `session`, `user`, `profile`, `loading`.
- `src/hooks/useAuth.ts` — `onAuthStateChange`, `signIn`, `signUp`, `signOut`.
- `src/lib/queryClient.ts` — istanza TanStack Query.
- Asset placeholder (`icon.png`, `splash.png`, `adaptive-icon.png`).
- **Verifica:** l'app parte e mostra lo splash/redirect senza crash.

### ✅ M1 — Auth flow (invite-only + age-gate) — FATTO (login a PASSWORD)
*Obiettivo: un utente con codice invito valido e ≥16 anni crea l'account.*
> **Aggiornamento 2026-06-30**: il login email è passato da OTP passwordless a
> **email → password**. Flusso unico in `password.tsx`: si tenta l'accesso
> (`signInWithPassword`); su credenziali invalide si propone di creare l'account
> (`signUpWithPassword`). **Recupero password via OTP**: "Password dimenticata?"
> invia il codice (`sendEmailOtp`) → `verifica.tsx` in modalità reset
> (`resetFlow`) → `nuova-password.tsx` (`updateUser({password})`). L'OTP resta
> quindi vivo solo come canale di reset. Google/Facebook rimandati (serve dominio).
> **Onboarding differito** (RPC `complete_onboarding`) raccoglie username, nome,
> foto (preview, opzionale) ed età (≥16); invito **school-free** via `check_invite`.
- `(auth)/_layout.tsx`, `welcome.tsx`, `email.tsx`, `password.tsx`,
  `nuova-password.tsx`, `verifica.tsx` (solo reset), `invito.tsx` (prefill da deep
  link), `registrazione.tsx` (wizard a step). `telefono.tsx` resta morto (SMS off).
- Componenti UI minimi: `Button`/`GlassButton`, `Input`, `OtpInput`, `SafeScreen`.
- **Verifica:** invito reale → profilo creato; birth_date <16 → bloccato dal
  trigger DB; login utente esistente OK; reset password via OTP OK.

### ✅ M2 — Shell + Home — FATTO (frame tecnico + design completo Discover)
*Obiettivo: la tab bar naviga; la home è l'hub.*
> Frame di navigazione reale + **design completo della Home (Discover)** fatto in
> anticipo sul mockup `assets/images/homepage-goal.png` (2026-06-30, pausa dalla
> roadmap su richiesta utente). Le altre categorie restano `ComingSoon`.
- `(main)/_layout.tsx`, `(main)/(tabs)/_layout.tsx` con **bottom bar custom**
  (`BottomBar.tsx`) a 5 voci: Home · Messaggi · **+** (crea, quadrato scuro
  centrale) · Notifiche · Menu. Solo icone (niente label), puntino viola sull'attiva.
  `(tabs)/home.tsx` con `HomeHeader` (avatar+anello→profilo, wordmark "Televo",
  ricerca) + `CategoryBar` testuale con underline viola (Discover/Live/Map/Aura/
  Sport — **"Reels" rimosso**).
- **Discover = feed design completo**: card grandi sociali (`FeedCard` +
  `MediaPlaceholder`/`FeedActionRail`/`FeedPaginationDots`) come MIX di tutti i
  tipi (drop/live/map/aura/sport), media grigio placeholder, dati statici in
  `src/constants/feedItems.ts`; card LIVE in fondo (`FeedLiveCard`). Sport/Live/
  Map/Aura come categorie → `ComingSoon` (dati reali in M4/M7).
- **Crea (+)**: `crea.tsx` + `src/constants/createTypes.ts` elencano TUTTI i tipi
  creabili dal backend (Drop, Stanza Live, Media, Nota vocale, Dai Aura, Gruppo)
  come frame "presto" — nessuna logica di creazione ancora.
- Schermate: `messages`/`notifiche` = `ComingSoon`; `menu` con Logout reale;
  rotte stack `profilo`/`cerca` dall'header. Componenti UI: `Card`, `Avatar`.
- **Verifica:** `tsc`/`eslint` puliti, `expo export` (bundle iOS) OK; gira in Expo
  Go. I dati reali del feed si collegano nelle milestone successive (M4/M6/M7).

### 🟣 M3 — Profilo + Aura (il fossato) — ✅ FATTO (logica), ⚠️ design da rivedere
*Obiettivo: l'anello Aura vivo e le classifiche.*
- `AuraRing.tsx` (SVG + Reanimated, "respiro", colore dal tratto dominante),
  `AuraScore.tsx`, `AuraBreakdown.tsx`, `Classifica.tsx` (per carattere + per
  scuola), `PropCard.tsx`, `AuraBadge.tsx` — tutti scritti.
- `profilo.tsx` (proprio, completo), `profilo/modifica.tsx`, `profilo/aura.tsx`
  (grafico da `aura_snapshots`). Scope solo profilo PROPRIO: `profilo/[id]`
  (altrui) e `profilo/achievement.tsx` (vista dedicata) restano per dopo.
- `src/hooks/useAura.ts`, `useProfilo.ts`, `useAchievement.ts` — scritti, niente
  `auraStore.ts` (TanStack Query basta, nessuno stato condiviso necessario).
- Corretti in corsa diversi disallineamenti tra `src/types/supabase.ts` (tipi a
  mano) e le migrazioni reali (achievements, friendships, drops, RPC amicizie) —
  senza il fix le query sarebbero fallite a runtime.
- **Verificato**: `tsc --noEmit`/`eslint` puliti, bundle Metro esportato senza
  errori. **Non ancora testato a runtime** con login reale su device.
- **⚠️ Resa visiva da rivedere**: score numerico grande, progress bar "prossimo
  traguardo", badge "esclusivo", classifiche #N in evidenza — troppo gamification
  rispetto al concept di reputazione vivente. La logica dati resta valida.
- **✅ ALGORITMO AURA v3 RISCRITTO** (backend, 2026-07-01): sostituito il modello
  v2 (ledger decaduto, ~0–500) con **ricalcolo deterministico a finestra mobile
  7gg, 0–100%** — statici (proof-of-human=≥1 live, profilo completo, badge; cap
  300) + dinamici (drop audio/media/testo, reazioni, minuti live con cap e
  rendimenti decrescenti; cap 700) − penalità (segnalazioni*50 + mute*25). Cron
  **giornaliero** + notifiche `aura_upgrade`/`aura_downgrade` (±5%). Drop esteso col
  formato **media**. Migrazioni 23–24 (`aura_v3_enums` + `aura_v3`), **da `db
  push`are** (vedi `now.md` §3.1bis). `aura_events`/`props` restano (storico +
  colore tratti). **Frontend M3 da riadattare** alla scala 0–100 (hook `useAura.ts`
  e milestone) in un round dedicato; milestone achievement e classifiche non ancora
  riallineate (deciso "solo Aura ora").

### 🔥 M4 — Stanze Live (Proof of Human)
*Obiettivo: audio live reale.* **Richiede LiveKit keys + Development Build.**
- `src/lib/livekit.ts` (connessione; token da Edge `livekit-token`).
- `stanza/[id].tsx` (audio, palco, partecipanti), `stanza/crea.tsx`,
  `(tabs)/live.tsx` (in corso + Spotlight).
- Componenti: `StanzaCard`, `BollaViva`, `Partecipante`, `VibeChain`.
- `src/hooks/useStanze.ts`, `src/store/stanzeStore.ts`.
- **Verifica:** join stanza, audio bidirezionale, sali sul palco.

### 💬 M5 — Social + Chat — 🟡 IN CORSO (~70% costruito, roadmap dedicata)
*Obiettivo: sistema chat completo, maturità funzionale livello Telegram.*
> **Aggiornamento 2026-07-02**: la chat ha ora una **roadmap ufficiale dedicata**:
> `docs/chat/IMPLEMENTATION-PLAN.md` (milestone CM0–CM8), basata sulla specifica
> `docs/chat/SRS-chat.md` **Rev. 2** (tutte le decisioni chiuse; nuovi requisiti di
> completezza RC-01…RC-13: optimistic send, offline, typing, presenza, edit,
> inoltro, reazioni, ricerca FTS, push, contatti email-only).
- **Già costruito**: hub Messaggi (S1), conversazione DM/gruppo (testo + vocali
  effimeri 24h, reply, spunte DM, soft-delete, realtime per-conversazione), info/
  membri, nuovo gruppo, Salvati/Archiviati/Silenziati, mute/pin/archivia/elimina,
  streak badge, bozze; amicizie UI + DM da profilo (`useApriDm`).
- **Backend chat scritto** (migrazioni 25–33) ma **in attesa di `db push`** → CM0.
- **Prossimo**: CM0 (push + realtime live) → CM1 (fix correttezza/safety) → CM2
  (optimistic/offline/realtime hub) → … → CM8. Dettagli, rischi e checklist nel
  piano dedicato.
- **Verifica:** DM solo tra amici, vocale che scade a 24h, streak con freeze +
  criteri di completamento per milestone in `docs/chat/IMPLEMENTATION-PLAN.md`.

### ☁️ M6 — Drops
- `DropCard`, `DropFeed`; integrazione in home/tab; `src/hooks/useDrops.ts`.
- **Verifica:** drop effimero 24h; reaction → prop all'autore.

### 🗺️ M7 — Mappa Vibe
*Obiettivo: live e Aura amici sulla mappa.* **Richiede Mapbox token + Dev Build.**
- `(tabs)/mappa.tsx` + `mappa/index.tsx` (react-native-maps, dark), `BollaLive`,
  `AuraPin`; `src/hooks/useMappa.ts` (view `vibe_map`); opt-in `share_location`.
- **Verifica:** solo amici visibili; posizione coarse, opt-in revocabile.

### 🔔 M8 — Notifiche push
- `src/lib/expo-push.ts` (RPC `register_device`), `(tabs)/notifiche.tsx`,
  `NotificaRow`, `src/hooks/useNotifiche.ts`; richiesta permessi.
- **Verifica:** push ricevuta (Edge `send-push` già deployata).

### 💎 M9 — Economia Vibes (simbolica)
- Tip simbolici nelle live (Edge `process-tip`), saldo wallet, gate 18+ (minori
  solo simbolico).
- **Verifica:** tip simbolico atomico e idempotente.

### 🛡️ M10 — Moderazione & Safety UI
- Flow report (RPC `file_report`), block/unblock, `moderate-text` sui messaggi.
- **Verifica:** report inviato; block nasconde i contenuti.

### 📜 M11 — GDPR UI
- Consensi in onboarding (`record_consent`); impostazioni: export
  (`gdpr-export`), elimina account (`gdpr-delete`).
- **Verifica:** export scarica i dati; delete anonimizza subito.

### ♻️ Trasversale (continuo)
Componenti UI residui (`Badge`, `BottomSheet`) · font (Inter, Clash Display) ·
asset reali (icon/splash/logo anello) · stati loading/empty/error · accessibilità
· config **EAS Dev Build** (sblocca LiveKit/Maps) · testing.

### 🚀 Pre-lancio (Terni, settembre 2026)
Chiavi LiveKit · token Mapbox · `PERSPECTIVE_API_KEY` · build EAS produzione ·
listing store · seed inviti scuole di Terni.

---

## Regole d'oro (sempre valide — sintesi `CLAUDE.md` §6)
Age-gate ≥16 · `birth_date` mai esposta · voce dei minori mai pubblica ·
posizione coarse/effimera/friends-only/opt-in · saldo reale gated 18+ lato DB ·
token LiveKit/Stripe firmati solo server-side · segreti mai nel client ·
mutazioni delicate via RPC/Edge (il client non scrive le tabelle di sistema) ·
commenti e UI in italiano.
