# Televo — Roadmap & Stato del Progetto

> Documento di verità sullo stato di Televo. Backend **live**; frontend in
> costruzione. Aggiornare a ogni milestone. Compagno di `CLAUDE.md` (che resta la
> mappa del backend) e del piano fondante `vai-curried-canyon.md`.
>
> **Ultimo aggiornamento:** 2026-06-29

---

## PARTE 1 — Stato attuale (cosa è FATTO)

### 1.1 Backend — ✅ LIVE e verificato

Progetto Supabase hosted `mmunnybytyfybncohkky` ("Televo Project"), org
`awwomlomjvuozfezspyq`, regione **eu-central-2**, Postgres 17.

| Area | Stato |
|------|-------|
| 21 migrazioni (Fasi 0–8 + GDPR) | ✅ applicate (`migration list`: locale = remoto) |
| 10 Edge Functions | ✅ deployate |
| 3 Vault secrets (`edge_base_url`, `service_role_key`, `cron_secret`) | ✅ impostati |
| 82 invarianti pgTAP | ✅ tutte passate |
| 7 cron job pg_cron | ✅ attivi |

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

> ⚠️ **Migrazione 22 in attesa di push.** Per l'onboarding/login (vedi §1.2) è
> stata aggiunta `20260629120000_onboarding_oauth.sql`: onboarding differito
> (`handle_new_user` ridotto a scheletro), RPC `complete_onboarding`,
> `check_invite`, `create_invite`, e `invites.school_id` reso nullable
> (inviti school-free). **Va applicata al DB live** con un `supabase db push`
> (solo questa nuova migrazione; le 21 esistenti restano). Senza, il flusso di
> registrazione non funziona end-to-end. Nessuna nuova Edge Function.

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

### ✅ M1 — Auth flow (invite-only + age-gate) — FATTO (con scelte aggiornate)
*Obiettivo: un utente con codice invito valido e ≥16 anni crea l'account.*
> Realizzato con: **email OTP passwordless** (niente password) + **Google nativo**;
> **onboarding differito** (RPC `complete_onboarding`); invito **school-free**
> validato prima via `check_invite`. Anello neon **solo al launch**, onboarding
> con wordmark "Televo" (no anello). Vedi piano
> `~/.claude/plans/allora-vedi-tutte-queste-imperative-fairy.md`.
- `(auth)/_layout.tsx`, `splash.tsx` (welcome), `invito.tsx` (prefill da deep
  link), `registrazione.tsx` (wizard a step), `login.tsx`.
- Componenti UI minimi: `Button`, `Input`, `OtpInput`, `SafeScreen`.
- **Verifica:** invito reale → profilo creato; birth_date <16 → bloccato dal
  trigger DB; login utente esistente OK.

### 🟢 M2 — Shell + Home
*Obiettivo: la tab bar naviga; la home è l'hub.*
- `(main)/_layout.tsx`, `(main)/(tabs)/_layout.tsx` (bottom tab bar custom dark),
  `(tabs)/home.tsx`.
- Componenti UI: `Card`, `Avatar`, `LoadingSpinner`.
- **Verifica:** swap fra le 5 tab; la home carica dati reali.

### 🟣 M3 — Profilo + Aura (il fossato)
*Obiettivo: l'anello Aura vivo e le classifiche.*
- `AuraRing.tsx` (SVG + Reanimated, "respiro", colore dal tratto dominante),
  `AuraScore.tsx`, `Classifica.tsx` (per carattere + per scuola), `PropCard.tsx`.
- `(tabs)/profilo.tsx`, `profilo/[id].tsx`, `profilo/modifica.tsx`,
  `profilo/aura.tsx` (grafico da `aura_snapshots`), `profilo/achievement.tsx`.
- `src/hooks/useAura.ts`, `useProfilo.ts`; `src/store/auraStore.ts`.
- **Verifica:** anello col colore reale, classifiche dalle leaderboard, dare un
  prop muove l'Aura.

### 🔥 M4 — Stanze Live (Proof of Human)
*Obiettivo: audio live reale.* **Richiede LiveKit keys + Development Build.**
- `src/lib/livekit.ts` (connessione; token da Edge `livekit-token`).
- `stanza/[id].tsx` (audio, palco, partecipanti), `stanza/crea.tsx`,
  `(tabs)/live.tsx` (in corso + Spotlight).
- Componenti: `StanzaCard`, `BollaViva`, `Partecipante`, `VibeChain`.
- `src/hooks/useStanze.ts`, `src/store/stanzeStore.ts`.
- **Verifica:** join stanza, audio bidirezionale, sali sul palco.

### 💬 M5 — Social + Chat
*Obiettivo: amicizie e DM (testo + vocali effimeri) con streak.*
- Amicizie UI (RPC `send`/`accept`/`remove`, Top Friends).
- `chat/index.tsx` (lista), `chat/[id].tsx` (conversazione); Realtime sui messaggi.
- Componenti: `MessaggioRow`, `BollaParlante` (vocale), `StreakBadge`.
- `src/hooks/useChat.ts`, `src/store/chatStore.ts`.
- **Verifica:** DM solo tra amici, vocale che scade a 24h, streak con freeze.

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
