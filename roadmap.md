# Televo — Roadmap & Stato del Progetto

> Documento di verità sullo stato di Televo. Backend **live**; frontend in
> costruzione. Aggiornare a ogni milestone. Compagno di `CLAUDE.md` (che resta la
> mappa del backend) e del piano fondante `vai-curried-canyon.md`.
>
> **Ultimo aggiornamento:** 2026-07-11 (**M12 Live: LM1 FATTO** — la Live sulla
> Mappa della Città, backend: **57 migrazioni** (57 = `live_map` via pooler).
> `map_events.live_id` (FK SET NULL + unique parziale attiva + check
> `map_events_single_source_chk`: room_id/live_id mai insieme), RPC
> `map_attach_live`/`map_detach_live` (specchio esatto delle versioni room:
> sessione M7 attiva + fix richiesti, masked-aware, title denormalizzato,
> fan-out `event_started`/`event_ended{removed:true}` con `live_id` nel
> payload), trigger `lives_map_close_events` (SOLO al passaggio a `ended`:
> Echo a **+3h** vs 12h stanze + fan-out `event_ended{removed:false}`; in
> `paused` il badge resta pieno), `map_snapshot` **v2** (verbatim+add: espone
> `live_id` negli events — il client naviga a `/live/[id]`). pgTAP
> **491/491** SUL REMOTO (+23 LM1) + smoke funzionale **22/22** rolled-back
> (guardie not_live_host/no_active_session/no_location/live_not_active/
> live_already_ended; amico vede nello snapshot, estraneo no; fan-out solo
> all'amico e UNA volta; pause→badge resta; end→Echo 3h; detach senza Echo;
> `map_stop_sharing`→sparizione istantanea). Tipi TS aggiornati (`live_id`
> in MapEventRaw/payload + 2 RPC), `tsc` pulito. Nessuna Edge nuova → coda
> deploy-owner invariata. ⚙️ Nota operativa: la **CLI supabase è tornata
> utilizzabile** (2.107.0, `supabase login` fatto) per `migration list` —
> pgTAP/smoke restano via pooler (niente Docker: `test db --linked` non gira);
> pgtap NON è installata sul remoto, lo script la crea DENTRO la transazione
> rolled-back. Prossimo: **LM2** (feed, fan-out, notifiche, Aura) su comando
> PO.)
>
> **Aggiornamento precedente:** 2026-07-09 notte (**M12 Live: LM0 FATTO** — enum +
> fondamenta dominio LIVE sul remoto: **56 migrazioni** (55–56 via pooler:
> `live_enums` + `live_foundation`), tabelle `lives`/`live_hosts`/`live_viewers`/
> `live_comments` con RLS + grant per-colonna (contatori PRIVATI a livello dati),
> `can_see_live` (L-3 unione host attivi; top_friends = solo cerchia host
> principale; kickati/rimossi/bloccati fuori), macchina a stati nel trigger
> (`ended` immutabile), tetto 4 host, rate-limit commenti 5/30s, 8 RPC base,
> `moderation_target_user` v3, realtime `live_comments`. pgTAP **468/468** SUL
> REMOTO + smoke funzionale **62/62** rolled-back (8 utenti sintetici). Tipi TS
> aggiornati, `tsc` pulito. Nessuna Edge nuova → coda deploy-owner invariata.
> Prossimo: **LM1** (mappa backend, badge LIVE) su comando PO. In giornata anche:
> M12 spec+piano ufficiale SCRITTO (`docs/live/live.md` Rev. 1, LM0–LM8,
> decisioni PO L-1..L-4) e M7 Mappa **MM9 implementato lato codice —
> MODULO MAPPA CHIUSO lato sviluppo (MM0–MM9)**. MM9 = Safe Zone UI + polish +
> chiusura. Editor Safe Zone dal **long-press** sulla mappa (centro dal punto,
> cerchio di anteprima live, nome a chip/testo, raggio a preset 100/200/350/500m —
> **QA-3 risolta verso i preset** per robustezza in-Modal e accessibilità); **lista
> Zone sicure** con elimina in `impostazioni/posizione.tsx` (legge dallo snapshot →
> funziona anche in Expo Go); **stati vuoto/errore** sulla mappa (copy della lente
> + banner "mappa non aggiornata"); **accessibilità** (ruoli/label su aure, bolle,
> cluster, "tu", chip, cestino zona; hitSlop). Nuovi file: `lib/geo.ts`
> (`cerchioGeoJSON`), `hooks/useSafeZones.ts`, `components/mappa/{ZonesLayer,
> SafeZoneEditor}.tsx`; +wrapper RPC `creaSafeZone`/`eliminaSafeZone` in `lib/map.ts`.
> Nessuna migrazione (RPC `map_set_safe_zone`/`map_delete_safe_zone` e `me.zones`
> nello snapshot erano già live da MM0/MM2). `docs/map/MANUAL-TESTING.md` scritto;
> `CLAUDE.md` §5/§6 aggiornati (**regola d'oro posizione QA-7**: friends-only,
> opt-in, auto-expiry, esatta di default + coarse su scelta Safe Zone). tsc/eslint
> verdi. ⏳ Resta la 1ª Dev Build EAS + verifica on-device 2 device del flusso Safe
> Zone/masking = azione owner)

---

## PARTE 1 — Stato attuale (cosa è FATTO)

### 1.1 Backend — ✅ LIVE e verificato

Progetto Supabase hosted `mmunnybytyfybncohkky` ("Televo Project"), org
`awwomlomjvuozfezspyq`, regione **eu-central-2**, Postgres 17.

| Area | Stato |
|------|-------|
| **42 migrazioni** (Fasi 0–8 + GDPR + onboarding + Aura v3 + chat 25–33 + hardening CM1 34–35 + chat modern CM4 36 + media hardening CM5 37 + CM7/CM8 38–42: contact_revoke, chat_overview, chat_receipts, chat_cleanup, grants_audit) | ✅ tutte applicate (le 38–42 via pooler: CLI bloccata da criterio app Windows, vedi nota) |
| 10 Edge Functions | ✅ deployate — ⚠️ coda deploy owner: `gdpr-export` v2 + `send-push` v2 (repo aggiornato, CLI 403 → serve l'account owner) |
| 3 Vault secrets (`edge_base_url`, `service_role_key`, `cron_secret`) | ✅ registrati il 2026-07-02 (`dispatch_push` attivo) |
| 209 invarianti pgTAP | ✅ 209/209 verdi SUL REMOTO (suite eseguita via pooler il 2026-07-04; pgtap creata DENTRO la transazione della suite, rollback) |
| 7 cron job pg_cron (`aura-recompute` ora **daily**; `expire_content` v4 pulisce anche i gruppi orfani) | ✅ attivi e verificati |
| Publication realtime (`messages`, `conversations`, `conversation_members`) | ✅ verificata server-side |
| **Grant minimi reali** (CM8): revoke all + re-grant esplicito su 39 tabelle, anon azzerato, default privileges di `postgres` revocati | ✅ smoke 22/22 (letture client intatte) |

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
  della dashboard OPPURE via **Deno + postgres.js sul pooler** (vedi script usati
  il 2026-07-02: `postgres.<ref>@aws-1-eu-central-2.pooler.supabase.com:5432`,
  password `SUPABASE_DB_PASSWORD` in `.env`) — quest'ultima via consente anche
  verifiche di catalogo e la registrazione dei Vault secrets senza dashboard.
- **NON rifare `db push`** delle migrazioni già applicate: `migration list` è la
  fonte di verità (tutte e 37 risultano live al 2026-07-03).
- ⚠️ Dal 2026-07-03 la **CLI supabase era bloccata** su questa macchina da un
  criterio di controllo applicazioni Windows. **Dal 2026-07-11 è tornata
  utilizzabile** (2.107.0, dopo `supabase login`): ok `migration list --linked`;
  `test db --linked` NON gira (richiede Docker, assente). Per pgTAP, smoke e
  applicazione migrazioni resta la via collaudata: **pooler** (Deno +
  postgres.js), registrando la versione in
  `supabase_migrations.schema_migrations`. Nota: **pgtap NON è installata sul
  remoto** — lo script della suite la crea DENTRO la transazione (il rollback
  finale la rimuove).

> ✅ **CM0 chiuso (2026-07-02)**: tutte le migrazioni (comprese Aura v3 e chat
> 25–33) risultano applicate al remoto; realtime publication, cron e Vault
> verificati; pgTAP 142/142 verdi sul remoto.
>
> ✅ **CM1 chiuso con audit (2026-07-02)**: la prima migrazione di hardening
> (`20260702120000`) aveva regressioni gravi (insert messaggi rotto, funzione
> `anonymize_user_data` esposta ad authenticated) — tutte corrette da
> `20260702130000_chat_hardening_fix.sql`. Dettagli nell'header della migrazione
> e nella checklist CM1 del piano chat.
>
> ⚠️ **Unico passo manuale rimasto**: `supabase functions deploy gdpr-export`
> dall'account owner (la CLI di questo ambiente riceve 403 dal management API).

### 1.2 Frontend — 🟢 Avvio + Auth/Onboarding completi

App in `mobile/`. Stack: Expo SDK 55 · React Native 0.84 (New Architecture) ·
TypeScript strict · Expo Router · NativeWind v4 · Zustand · TanStack Query ·
Reanimated v4 · LiveKit · **MapLibre** (`@maplibre/maplibre-react-native`, mappa M7 —
richiede Dev Build EAS) · **Skia** (`@shopify/react-native-skia`, aure mappa MM8) ·
**supercluster** (clustering mappa). Navigazione **file-based**.

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
### 💬 M5 — Social + Chat — ✅ COSTRUITA (CM0–CM8 completi; fatto lo smoke test(ufficiale))
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
- ✅ **CM0 fatto** (2026-07-02): DB remoto allineato, realtime/cron/Vault verificati,
  pgTAP 142/142 sul remoto.
- ✅ **CM1 fatto** (2026-07-02): 6 difetti chiusi (blocco↔DM, cleared_at in chat,
  vocali scaduti, hidden_at reset, presenza privacy-safe via `get_peer_presence`,
  composer disabilitato con motivo) + audit con migrazione correttiva
  `20260702130000`. Resta solo il deploy manuale di `gdpr-export`.
- ✅ **CM2 fatto** (2026-07-02): invio ottimistico (outbox pending/failed/retry,
  testo e vocali, offline-safe con flush alla riconnessione), banner offline,
  canale realtime globale hub + badge tab Messaggi, pill "nuovi messaggi",
  scroll-to-quoted con highlight, Copia, linkify, raggruppamento bolle, haptic.
  Da fare: smoke manuale su 2 device.
- ✅ **CM3 fatto** (2026-07-03, SOLO frontend — il backend era già live da CM1):
  presenza "online / ultimo accesso" nell'header DM (heartbeat `touch_presence`
  foreground + query `get_peer_presence` con privacy/reciprocità server-side),
  "sta scrivendo…" via broadcast sul canale per-conversazione esistente (DM e
  gruppi, throttle 2.5s + TTL 4s), S10 `messaggi/impostazioni.tsx` (toggle
  ultimo accesso/spunte con update ottimistico), gating client delle spunte ✓✓
  (§6.4, reciprocità). Da fare: smoke manuale su 2 device.
- ✅ **CM4 fatto** (2026-07-03): migrazione `20260703120000_chat_modern` LIVE
  (inoltro `forwarded_from`, `message_reactions` con set curato ❤️😂👍😮😢🔥,
  FTS italiano + `search_messages`, RPC gruppo + auto-promozione admin R-09,
  GDPR esteso alle reazioni; pgTAP 166/166 sul remoto + smoke runtime via
  pooler). Frontend: menu messaggio nuovo `MenuMessaggio` (reazioni, edit con
  banner+badge "modificato", inoltro con picker `chat/inoltra`, prop-da-messaggio,
  Info messaggio "letto da N", Segnala), selezione multipla con barra azioni,
  ricerca in-chat (contatore/frecce/salto) e globale (`cerca.tsx` ricostruita),
  rinomina/avatar gruppo + promozione admin in info. Niente push per le reazioni
  (anti-vanity, decisione utente). Da fare: smoke manuale su 2 device.
  ⚠️ Scoperta sistemica: DEFAULT PRIVILEGES del progetto concedono ALL su ogni
  nuova tabella (RLS = unico cancello reale) → audit rimandato a CM8.
- ✅ **CM5 fatto** (2026-07-03): foto in chat end-to-end. Backend: migrazione
  `20260703130000_chat_media_hardening` LIVE (validazione media nel trigger:
  media_url obbligatorio con prefisso `<conv>/<sender>/`, solo `image`, FOTO
  PERMANENTI — decisione utente; media immutabili in update con eccezione
  azzeramento GDPR; `process_account_deletion` azzera i media; inoltro esteso
  a testo+foto, vocali ancora vietati; pgTAP 177/177 sul remoto + smoke
  runtime 10 casi via pooler). Frontend: `lib/media.ts` (picker
  galleria/fotocamera, upload senza base64, signed URL cache, copia inoltro
  via `storage.copy`), outbox esteso al tipo `media` (upload prima
  dell'insert, offline-safe), anteprima+caption nel composer, `BollaMedia`
  (4:3, cacheKey=path), `ViewerMedia` (pinch/pan/doppio tap, RootView nel
  Modal), inoltro foto in menu/selezione, permessi camera in app.json.
  Da fare: smoke manuale su 2 device (incl. RLS cross-utente sul bucket).
- ✅ **CM6 fatto** (2026-07-04, SOLO frontend — il backend push era già live):
  `lib/expo-push.ts` riempito (permesso, token → RPC `register_device`, canale
  Android id `default`/"Messaggi" perché la Edge non manda `channelId`,
  soppressione banner se la chat è aperta, badge icona, `unregister_device`
  al logout prima del signOut), hook `useNotifiche.ts` (runtime push +
  tap→deep link con cold start e dedup SecureStore + banner contestuale
  nell'hub S1), `useUnreadTotale` condiviso tra badge tab e badge icona,
  plugin expo-notifications in app.json. Da fare: smoke su device reale
  (Expo Go iOS o dev build; Expo Go Android non supporta le push remote).
- ✅ **CM6.5 fatto** (2026-07-04, fuori piano originale — decisione utente):
  sistema DIALOGHI DARK. Primitive imperative `mostraMenu`/`conferma`/`avvisa`
  (`lib/dialoghi.ts`, store Zustand slot singolo) + `BottomSheet` (stub riempito,
  stili di MenuMessaggio) + `DialogHost` unico nel root: bottom sheet per
  menu/picker, card centrata per conferme/avvisi, "Annulla" sempre, tap
  fuori/back Android chiudono sempre, menu a 2 livelli senza modali impilati.
  TUTTI gli `Alert.alert` convertiti (hub, chat, info, importante, impostazioni,
  profilo, amici, nuovo-gruppo, inoltra, menu, welcome, HelpButton) + regola
  eslint anti-regressione. Restano nativi solo Share e permessi OS.
- ✅ **CM7 fatto** (2026-07-04): "I tuoi contatti su Televo" (S11, email-only).
  Backend: migrazione `20260705100000_contact_revoke` LIVE via pooler (RPC
  `revoke_contacts_sync`: revoca ATOMICA = delete hash propri + consenso
  revocato in una transazione); pgTAP 181/181 sul remoto + smoke runtime 9/9
  con JWT simulato (consent gate, minore invisibile a non-amico, bloccati
  esclusi, cap 1000, revoca). Regola di scopribilità CONFERMATA dal product
  owner (adulti opt-in trovabili da chiunque abbia la loro email; minori solo
  da amici). Frontend: `lib/contatti.ts` (solo email, SHA-256 client, batch
  500), `useContatti`, schermata `messaggi/contatti.tsx` a stati (opt-in GDPR →
  permesso OS con Linking.openSettings → sync → risultati con
  Aggiungi/Inviata/Messaggia → revoca in-page), ingressi da hub overflow e da
  Amici. Deps: expo-contacts + expo-crypto (ok in Expo Go). Da fare: smoke su
  device con 2 account con email in rubrica.
- ✅ **CM8 fatto** (2026-07-04) — **MODULO CHAT COMPLETO (CM0–CM8)**. Otto
  sotto-blocchi: `chat_overview()` (hub in 1 query, unread ESATTO), enforcement
  SERVER delle spunte (`get_read_receipts` + grant per-colonna: chiusi i
  compromessi CM3 e CM1; `expo_push_token` non più leggibile), lista bloccati
  in S10 + moderate-text sull'invio (fire-and-forget), `expire_content` v4
  (gruppi orfani; file bucket = debito: l'hosted vieta DELETE su
  storage.objects), audit grant/default privileges (39 tabelle a grant minimo
  reale, anon azzerato), Edge v2 in coda deploy owner (send-push: marcatura
  per-chunk + pruning token + badge; gdpr-export + message_reactions),
  StatoErrore ovunque (SRS §14), voice_thread chiuso (R-12),
  `docs/chat/MANUAL-TESTING.md` (16 sezioni). pgTAP 209/209 sul remoto.
  **Restano**: MANUAL-TESTING eseguito per intero su 2 device (smoke utente) +
  deploy owner di gdpr-export/send-push.
- **Prossimo (M5 chiusa salvo smoke)**: eseguire MANUAL-TESTING.md su 2 device;
  poi M4 (Stanze Live) o M6 (Drops) secondo priorità di prodotto.
- **Verifica:** DM solo tra amici, vocale che scade a 24h, streak con freeze +
  criteri di completamento per milestone in `docs/chat/IMPLEMENTATION-PLAN.md`.

### ☁️ M6 — Drops
Spec+piano ufficiale: `docs/media/drop.md` (Rev. 1, DM0–DM7). Drop = sistema di
post a 3 formati (foto/audio/testo), solo-amici, effimeri 24h + Ricordi privati,
contatori privati (anti-vanity a livello dati).
- ✅ **DM0 fatto** (2026-07-05, SOLO backend, invisibile al client): 4 migrazioni
  live via pooler (`drops_notify_enum`, `drops_v2`, `drops_interactions`,
  `drops_lifecycle`) → drop v2 (audio_seconds/stats_finali, audience solo-amici,
  path storage validati, bucket `drop-media`/`drop-audio`), `drop_comments`/
  `drop_likes`/`drop_saves`, RPC `drops_feed`/`drop_detail`/`save_drop`/
  `unsave_drop`, effimerità logica (`expire_content` v5 congela stats e non
  cancella più), coda `storage_cleanup_queue`, notifica `drop_comment`, GDPR
  esteso. pgTAP **262/262 sul remoto** + smoke funzionale (36/36). Tipi TS
  allineati (`tsc` pulito). Deploy Edge `storage-cleanup` → DM6.
- ✅ **DM6 fatto** (2026-07-06, backend/Edge): migrazione
  `20260706130000_storage_cleanup_cron` live via pooler (48ª) — `dispatch_storage_cleanup()`
  (specchio di `dispatch_push`: no-op se coda vuota o Vault assente) + cron
  `storage-cleanup-15min` (`*/15 * * * *`). Nuova Edge **`storage-cleanup`**
  (verify_jwt=false, x-cron-secret): batch ≤500 dalla coda → `storage.remove` con
  WHITELIST bucket (`drop-media`/`drop-audio`/`voice-messages`/`chat-media`) →
  dequeue delle righe risolte, retry naturale sui fallimenti. **`gdpr-export` v3**:
  aggiunte sezioni `drop_comments`/`drop_likes`/`drop_saves` (RC-08, art. 15).
  pgTAP **271/271 sul remoto** (+5 DM6) + smoke dispatch (coda vuota→0 HTTP, coda
  piena→1 HTTP verso l'endpoint giusto, rolled-back). ⚠️ **Coda deploy owner**
  (CLI 403): `storage-cleanup` (nuova) + `gdpr-export` v3, oltre a `send-push` v2.
- ✅ **DM7 fatto** (2026-07-06, chiusura modulo): **Drop del giorno** COSTRUITO
  (decisione product owner) — 2 migrazioni live via pooler (`drop_prompt_enum`
  49ª + `drop_prompt` 50ª): tabelle `drop_prompts` (24 temi curati IT) +
  `drop_prompt_of_day` (pick LRU, giorno `Europe/Rome`), invio semi-random
  pomeridiano ma **una-volta-al-giorno** (guard `send_after`/`notified_at`),
  broadcast set-based ai soli utenti attivi, RPC `drop_prompt_today()` per il
  banner del composer, 2 cron (`drop-prompt-pick-daily`, `drop-prompt-notify`),
  enum `notification_type += 'drop_prompt'`. Frontend: banner "Tema di oggi" in
  S2 (`useDropPromptOfDay`), deep link `drop_prompt` → composer. Polish:
  accessibilità (label/ruoli + hitSlop ≥44pt su footer card/reaction/CTA).
  `docs/media/MANUAL-TESTING.md` (sezioni 0–13). pgTAP **298/298 sul remoto**
  (+27 DM7) + smoke funzionale (broadcast=utenti attivi, secondo invio no-op,
  zero leak, rolled-back). Tipi TS allineati.
- ⬜ **Restano (esterni al codice):** **deploy owner** delle Edge in coda
  (`storage-cleanup`, `gdpr-export` v3, `send-push` v2 — CLI 403) + esecuzione
  di `docs/media/MANUAL-TESTING.md` su 2 device.
- ⚠️ **Nota lancio:** con la feature attiva, la **prima notifica "Tema di oggi"**
  parte automaticamente questo pomeriggio (ora di Roma) agli utenti attivi. Per
  rimandarla: `update public.drop_prompt_of_day set notified_at = now() where
  for_date = (now() at time zone 'Europe/Rome')::date;` oppure disattivare il
  cron `drop-prompt-notify`.
- **Verifica:** drop effimero 24h; reaction → prop all'autore; tema del giorno
  una-volta-al-giorno ai soli attivi.

### 🗺️ M7 — La Mappa della Città
Spec+piano ufficiale: `docs/map/map.md` (Rev. 1, milestone MM0–MM9). Mappa
solo-amici a tre stati (Live / Echo 12h / Last Seen 24h), posizione esatta di
default + Safe Zone opzionale, PostGIS + realtime inbox, MapLibre + OpenFreeMap
(niente Mapbox: nessun token) + Skia. **Richiede Dev Build EAS.** Sostituisce e
depreca la Mappa Vibe di Fase 5 (`vibe_map`/`live_presence`/geohash → drop in
MM1).
- ✅ **MM0 fatto** (2026-07-07): fondamenta backend. **51ª migrazione** live
  (`20260707120000_map_v2_foundation`, via pooler): **PostGIS 3.3.7** attivo
  (prima estensione "pesante"), tabelle `map_presence`/`map_events`/
  `map_safe_zones` (`extensions.geography(point,4326)`, GIST + unique parziale
  "una bolla live per stanza"), RLS senza policy sulle tabelle di posizione
  (lettura solo via RPC, arriva in MM2), helper `can_see_on_map`, trigger cap-2
  zone, **kill-switch atomico** (trigger su `profiles.share_location`) e 5 RPC di
  scrittura (`map_start_sharing`/`map_stop_sharing`/`map_publish_location` con
  masking+rate-limit 20s/`map_set_safe_zone`/`map_delete_safe_zone`). Masking Safe
  Zone PRIMA della persistenza (il punto esatto in-zona non tocca il disco). pgTAP
  **347/347** sul remoto (+49 MM0) + smoke funzionale 27/27 (rolled-back). Tipi TS
  aggiornati a mano; `tsc` pulito. Nessuna Edge nuova → coda deploy-owner invariata.
- ✅ **MM1 fatto** (2026-07-07): legacy Fase 5 deprecato in blocco. **52ª
  migrazione** live (`20260707130000_map_legacy_out`, via pooler, **ATOMICA**):
  `expire_content` **v6** (auto-expiry TTL di `map_presence`/`map_events` + cintura
  difensiva che chiude gli eventi `room_live` di stanze non più live → Echo 12h) e
  `process_account_deletion` **v6** (cancella `map_presence`/`map_events`/
  `map_safe_zones` dell'utente) ridefinite nella STESSA transazione del DROP di
  `vibe_map`/`live_presence`/`room_locations` e delle RPC geohash (`update_presence`/
  `clear_presence`/`set_room_location`) — la transazionalità è l'unica protezione
  del cron `expire-content` a 5 min (§13.4). `profiles.share_location` RESTA
  (kill-switch). Verificato: cron `expire-content` verde dopo il drop, pgTAP
  **353/353** sul remoto (+6 netto MM1), tipo `vibe_map` rimosso dai tipi TS
  (`tsc` pulito). Nessuna Edge nuova → coda deploy-owner invariata.
- ✅ **MM2 fatto** (2026-07-07): stanze sulla mappa + porta di lettura. **53ª
  migrazione** live (`20260707140000_map_rooms_snapshot`, via pooler): trigger
  `rooms_map_close_events_trg` (AFTER UPDATE OF status: una stanza che LASCIA
  `live` chiude i suoi `map_events` → `ended_at=now()`, Echo `+12h` — **via
  primaria**, la cintura difensiva in `expire_content` v6 resta la rete a 5 min);
  RPC `map_attach_room` (solo host di stanza live + sessione attiva con fix,
  bolla = posizione host masked-aware, title denormalizzato, idempotente
  sull'unique parziale) / `map_detach_room` (DELETE = revoca, niente Echo);
  **`map_snapshot()`** = LA porta di lettura, ritorna `{server_now, me, friends[],
  events[]}` con timestamp UTC GREZZI (stati Live/Echo/LastSeen derivati dal
  client) filtrata server-side da `can_see_on_map` → un estraneo non vede NULLA;
  lat/lng estratti da geography via cast `::extensions.geometry` + `st_x`/`st_y`.
  pgTAP **371/371** sul remoto (+18 MM2) + smoke funzionale **28/28** (rolled-back:
  attach visibile all'amico e non all'estraneo, detach→sparizione, fine stanza→
  Echo a +12h, masking nel snapshot, coppia bloccata invisibile, guardrail
  not_room_host/room_not_live/no_active_session). `expire_content()` verificato
  ancora verde col nuovo trigger. Tipi TS aggiornati a mano (`tsc` pulito).
  Nessuna Edge nuova → coda deploy-owner invariata.
- ✅ **MM3 fatto** (2026-07-08): realtime inbox privata + fan-out server-side.
  **54ª migrazione** live (`20260707150000_map_realtime`, via pooler). Verificato
  PRIMA sull'hosted (rischio §18.3): `realtime.send(payload,event,topic,private)`
  e `realtime.topic()` esistono; `realtime.messages` ha RLS attiva senza policy;
  `postgres` (owner delle funzioni definer) è **BYPASSRLS** e membro di
  `supabase_realtime_admin` → può scrivere in `realtime.messages` (fan-out) e
  creare policy; `authenticated` ha già SELECT sulla tabella. Contenuti: (1) policy
  **`map_inbox_select_own`** su `realtime.messages` (SELECT, authenticated) che lega
  `realtime.topic()` a `map:u:{auth.uid()}` → nessuno legge l'inbox altrui, nessuna
  policy INSERT ⇒ il client non può inviare broadcast; (2) helper interno
  **`map_fanout(owner,event,payload)`** che invia via `realtime.send()` alle inbox
  `map:u:{amico}` dei soli amici `accepted` (grafo letto al momento dell'invio →
  revoca/blocco = stop broadcast per costruzione); (3) fan-out cablato in
  `map_publish_location` (**presence** solo se primo fix / spostamento >~30m via
  `st_distance` / cambio masked), `map_stop_sharing` (**presence_removed** +
  **event_ended** removed), `map_attach_room` (**event_started** solo su insert
  reale), `map_detach_room` (**event_ended** removed), trigger
  `rooms_map_close_events` (**event_ended** removed=false = Echo +12h) e
  `profiles_map_kill_switch` (**presence_removed**). `realtime.send` auto-cattura gli
  errori come WARNING → un fan-out fallito non rompe mai l'azione utente (snapshot =
  verità). pgTAP **388/388** sul remoto (+17 MM3) + smoke funzionale **19/19**
  (rolled-back: presence/started/ended/Echo/removed vanno SOLO all'amico, mai a
  estraneo/bloccato; ricezione: l'owner legge la propria inbox, l'estraneo no).
  Nessun cron né Edge nuovi → coda deploy-owner invariata; nessuna nuova superficie
  client → tipi TS invariati.
- ✅ **MM4 fatto** (2026-07-08): GDPR + chiusura backend mappa. **Nessuna
  migrazione nuova** (lo schema/lifecycle/GDPR-deletion erano già completi:
  `process_account_deletion` v6 in MM1 cancella già le 3 tabelle mappa; l'enum
  `consent_type` ha già `'location'`). Contenuti: (1) **`gdpr-export` v4** —
  aggiunte le sezioni `map_presence`/`map_events`/`map_safe_zones` all'export art.
  15 (dati personali di posizione dell'utente; la geography passa dalla
  serializzazione nativa PostgREST → GeoJSON; il consenso posizione è già in
  `consents`); (2) **suite pgTAP consolidata** — blocco MM4 con l'invariante del
  consenso dedicato (`consent_type='location'`) e le 3 guardie di **hard-delete**
  (FK `map_*`→`profiles` ON DELETE CASCADE: la retention 30gg non lascia posizioni
  orfane). pgTAP **392/392** sul remoto (+4 MM4) + **smoke MM4 12/12** via pooler
  (rolled-back): consenso `location` registrato ed esportabile; le 3 SELECT
  dell'export restituiscono le righe dell'utente col masking Safe Zone; estraneo
  isolato; `process_account_deletion` svuota OGNI tabella mappa e anonimizza il
  profilo (consensi conservati come prova); `delete profiles` → cascade → zero
  righe orfane. Verificato che `service_role` (l'`adminClient` dell'export) legge le
  3 tabelle mappa (SELECT + REST 200). Nessun oggetto DB nuovo → tipi TS invariati.
  ⚠️ **Coda deploy owner** (CLI 403): `gdpr-export` passa a **v4** (supera la v3
  accodata in DM6), insieme a `storage-cleanup` e `send-push` v2.
- ✅ **MM5 fatto (codice)** (2026-07-08): mobile — mappa base dark. **Primo modulo
  nativo del progetto**: `@maplibre/maplibre-react-native@11.3.6` (peer OK: Expo 54 /
  React 19.1 / RN 0.81, New-Arch/Fabric) installato; `app.json` con plugin
  `@maplibre/maplibre-react-native` + `newArchEnabled: true`. Stile dark **custom** in
  `src/constants/mapStyle.ts` (`StyleSpecification` tipizzato = fork compatto dello
  stile OpenFreeMap "dark": source `openmaptiles`→`tiles.openfreemap.org/planet`,
  glyphs/sprite OpenFreeMap, palette da `theme.ts`, **zero POI/transit**, toponimi
  minimi, centro **Terni**). `src/components/mappa/MapSurface.tsx` (Map+Camera API
  v11: `mapStyle` / `initialViewState{center,zoom}`, north-up = rotate/pitch/compass
  off, attribuzione OSM overlay + info nativo, velo di carico in dissolvenza,
  StatoErrore + retry) caricata via **React.lazy** da `MapCanvas.tsx` con **guard
  Expo Go** (`Constants.appOwnership`) → in Expo Go pannello "serve Dev Build" e il
  modulo nativo NON viene mai valutato (resto app intatto). Ramo `map` full-height in
  `home.tsx` (pattern DropFeed, fuori dalla ScrollView); rimossi il vecchio
  ComingSoon "Mappa Vibe" e i file vuoti `AuraPin`/`BollaLive` (nuova spec: mai un
  pin). Verifica: `tsc`/`eslint` puliti + **bundle Metro (`expo export` android) OK**
  con maplibre incluso. ⏳ **Resta (azione owner)**: prima **Dev Build EAS**
  (`eas build --profile development`) + verifica on-device (pan/zoom fluidi 60fps).
- ✅ **MM6 fatto (codice)** (2026-07-08): mobile — opt-in gestuale + pipeline
  posizione. Nessuna migrazione (RPC MM0 già live). Scoperta chiave:
  `profiles.share_location` ha **default false** → il primo opt-in lo accende PRIMA
  di `map_start_sharing` (che esige `share_location=true`). `expo-location@19.0.8`
  (incluso in Expo Go: la pipeline è testabile anche senza Dev Build; la mappa
  MapLibre no). app.json: plugin `expo-location` (When-In-Use, no background/
  foreground-service), permesso **ACCESS_FINE_LOCATION** (posizione esatta di
  default), copy iOS aggiornata (via il plugin). Nuovi file: `lib/location.ts`
  (permesso/one-shot/watcher `Balanced` 25m·30s/haversine), `lib/map.ts` (wrapper
  `map_start_sharing`/`map_stop_sharing`/`map_publish_location` + persistenza sessione
  in SecureStore per il resume post-cold-start, §3), `store/mapStore.ts` (sessione/
  permesso/myCoords/problema), `hooks/useCondivisionePosizione.ts` = **hook UI**
  (avvia/estendi/spegni, consenso `location`, permesso, kill-switch master) + **runtime
  watcher** (montato in ChatRuntime, app-wide foreground): osserva SOLO con sessione
  attiva + permesso + foreground, publish con **throttling adattivo** (movimento ≥30m
  o heartbeat ~4.5min, sopra il rate-limit server 20s), auto-spegnimento alla scadenza
  (resta Last Seen), errori server "sessione finita" → azzera il client.
  Componenti mappa: `MeMarker` (puntino "tu" nativo `Marker` v11, tappabile — non
  l'Aura Skia, che è MM8), `MapPresenceControl` (pill stato/azione con countdown),
  `MapOnboarding` (consenso GDPR `record_consent('location')` + permesso OS, stato
  "negato"→Impostazioni), `ShareSheet` (durate 1/4/8h · gestione sessione), integrati
  in `MapSurface` (camera-follow sul primo fix + "centra su di me"). Kill-switch:
  schermata `app/(main)/impostazioni/posizione.tsx` (master toggle + "Spegni ora",
  raggiungibile anche in Expo Go) + voce menu + rotta. `mapErrorMessage` in errors.ts,
  `residuoCompatto` in datetime.ts, `ProfilePatch.share_location`. tsc/eslint/**bundle
  Metro (android)** verdi. ⏳ **Resta (azione owner)**: verifica on-device (riga
  presence sul DB via pooler dopo l'avvio, masking se in zona, battery in 1h foreground).
- ✅ **MM7 fatto (codice)** (2026-07-09): mobile — dati reali sulla mappa (snapshot +
  realtime). Nessuna migrazione (map_snapshot MM2 + inbox MM3 già live). Modello §13.3:
  **snapshot = verità** a `server_now`, **realtime = delta**; confluiscono nei dizionari
  amici/eventi dello store; stati Live/Echo/LastSeen **derivati client** su UTC calibrato
  (`clockOffsetMs`), mai fetchati. Nuovi file: `lib/map-realtime.ts` (**primo canale
  PRIVATO** del progetto: `channel('map:u:{uid}',{config:{private:true}})` + `realtime.
  setAuth()` prima del subscribe; 4 eventi broadcast `presence`/`presence_removed`/
  `event_started`/`event_ended`; solo ricezione), `hooks/useMappa.ts` (snapshot `useQuery`
  + merge delta nello store + **enrich refetch debounced** quando un delta riguarda un
  amico/evento sconosciuto = "comparire senza refresh" + refetch a foreground/riconnessione
  + **refetchInterval 3min in foreground** per la freshness di un amico FERMO — il backend
  non fa fan-out sotto ~30m, MM3), `components/mappa/MapPoints.tsx` (dot amici colore
  `aura_color` + bolle eventi con decadimento Echo; **funzionale, estetica finale = MM8**).
  Esteso `store/mapStore.ts` (dizionari `friends`/`events` normalizzati, `idrataSnapshot`
  full-replace, `applicaPresenza`/`rimuoviAmico`/`applicaEventoStart`/`chiudiEvento`/
  `rimuoviEvento`, selettori puri `statoAmico`/`statoEvento`/`fattoreEcho`/`amicoVisibile`/
  `nowCalibrato`) e `types/supabase.ts` (shape grezze snapshot + payload delta). Confine
  MM6↔MM7: lo snapshot non tocca `sessione`/`myCoords` (device-driven MM6). `useMappa()` +
  `<MapPoints/>` montati in `MapSurface` (solo con mappa aperta, Dev Build). tsc/eslint/
  **bundle Metro (android)** verdi. ⏳ **Resta (azione owner)**: verifica on-device 2 device
  amici (A accende→B lo vede senza refresh; A revoca→sparisce; stanza live→bolla; fine
  stanza→echo; estraneo→nulla).
- ✅ **MM8 fatto (codice)** (2026-07-09): mobile — **resa Aura definitiva (Skia) +
  clustering**. Nessuna migrazione (lo snapshot MM2 già restituisce `aura_color`).
  **DECISION GATE §13.5 risolto**: adottato DA SUBITO il fallback pre-approvato dal PO —
  **Marker MapLibre NATIVI (position-tracking) + mini-canvas Skia per-aura**, invece del
  canvas full-screen con proiezione per-frame. Motivo: elimina *per costruzione* il rischio
  n.1 (desync canvas↔camera: i Marker sono ancorati nativamente, zero proiezione JS);
  clustering cappa i punti visibili (~40) → nessun degrado "molti marker"; il gate on-device
  non è eseguibile da qui (Windows) → si sceglie il ramo provabilmente corretto. Il **respiro**
  NON ridisegna Skia per-frame: è transform Reanimated **nativo** su un wrapper (thread UI).
  Il **clustering** si ricalcola solo a gesto fermo (`onRegionDidChange`) + `onRegionIsChanging`
  throttlato 250ms → zero re-render durante il pan (Marker incollati). Nuovi pacchetti:
  `@shopify/react-native-skia@2.2.12` (via `expo install`) + `supercluster@8`/`@types`. Nuovi
  file: `lib/clustering.ts` (supercluster puro: indice friends, cluster per bbox/zoom, spiderfy
  a ventaglio con offset px per punti coincidenti, expansion-zoom per tap→zoom),
  `components/mappa/AuraGlyph.tsx` (primitiva Skia: bloom BlurMask + anello + core, STATICA),
  `AuraDot.tsx` (aura amico live/last-seen), `LiveRoomBubble.tsx`/`EchoBubble.tsx` (bolle stanza:
  pulse live / decadimento Echo **fucsia→viola→trasparente** continuo su UTC calibrato, rampa
  opacità su `MAP_TICK_MS`), `AuraLayer.tsx` (orchestratore: driver respiro/pulse condivisi,
  tick 30s, cluster/dot/bolle, tap→card, cluster→easeTo), `MapFriendCard.tsx` (bottom sheet:
  aura + tempo relativo calibrato + azioni Profilo/Messaggio via `get_or_create_dm`; join stanza
  differito → serve la UI Live M4). Aggiornati: `MapSurface` (viewport→clustering, selezione+card,
  `MapPoints`→`AuraLayer`), `MeMarker` (ora AuraGlyph, respiro quando accesa), `datetime.ts`
  (`tempoRelativoCalibrato` su epoch-ms UTC), `mapStore.ts` (`MAP_TICK_MS`). **Rimosso**
  `MapPoints.tsx` (grezzo MM7). Import Skia confinati sotto il lazy boundary di `MapSurface`
  (Expo Go intatto: `MapCanvas` non monta mai la superficie). tsc/eslint/**bundle Metro
  (android)** verdi. ⏳ **Resta (azione owner)**: la Dev Build EAS ora deve includere **anche
  Skia** (ricostruire); verifica on-device 60fps con ~50 punti + decadimento continuo + cluster
  non sovrapposti (chiusura del decision gate su device — se laggy, il fallback è già quello
  adottato).
- ✅ **1ª Dev Build FATTA + mappa+Skia VERIFICATE on-device (2026-07-09)**: build **locale**
  `expo run:android` (JDK 21 di Android Studio JBR; RN0.81 vuole 17 ma il 21 compila; prebuild
  `--clean` per autolinkare Skia/MapLibre/expo-location) → APK su device fisico (`BUILD
  SUCCESSFUL 1m30s`). ⚠️⚠️ **GOTCHA CRITICO MapLibre + Android New Architecture**: con la
  GLSurfaceView di **default** la mappa era **grigia/bianca** (overlay RN visibili ma la
  superficie GL NON composta → si vedeva lo sfondo chiaro della finestra dietro; *sia* lo stile
  dark *sia* un test rosso apparivano grigi). **FIX = `androidView="texture"` su `<Map>`**
  (TextureView compone in-hierarchy) → mappa dark OpenFreeMap + **AuraGlyph Skia** rendono
  perfettamente (Skia on-device confermato; aura "tu" blu che pulsa). Il log `Mbgl-HttpRequest
  ... Canceled` era la surface non pronta, non un blocco di rete. tsc/eslint puliti.
- ✅ **MM9 fatto (codice)** (2026-07-09): mobile — **Safe Zone UI + polish + chiusura
  modulo**. Nessuna migrazione (le RPC `map_set_safe_zone`/`map_delete_safe_zone` sono
  live da MM0 e lo snapshot `me.zones` estrae già lat/lng). **Editor Safe Zone dal
  long-press** su `<Map>` (`onLongPress` → `nativeEvent.lngLat`): centro sul punto
  premuto, camera-center + haptic, **cerchio di anteprima** che scala coi metri
  (`GeoJSONSource`+`Layer` fill/line, poligono da `lib/geo.ts`→`cerchioGeoJSON`), nome
  a chip suggerite (Casa/Lavoro/Palestra) o testo libero, raggio a **preset
  100/200/350/500m** (**QA-3 risolta verso i preset**, non lo slider: zero gesture
  in-Modal, targhe grandi, accessibile, e il cerchio live mostra la copertura); velo
  leggero così l'anteprima resta visibile. Salvataggio via RPC + invalida lo snapshot
  → il cerchio salvato (sobrio, **solo io lo vedo**) appare sulla mia mappa. Cap 2
  gate sul long-press (avviso "Zone al completo") oltre al server. **Lista Zone sicure**
  con elimina in `app/(main)/impostazioni/posizione.tsx` (via `useSafeZones`, che legge
  dallo snapshot condiviso → **funziona anche in Expo Go**, senza mappa nativa). **Stati
  vuoto/errore** in `MapSurface` (map.md §9): card "La tua lente sugli amici" quando non
  ci sono amici/eventi visibili (con hint del long-press) + banner "Mappa non aggiornata ·
  Tocca per riprovare" sull'errore snapshot; la mappa resta usabile. **Accessibilità**:
  ruoli/label su aure amici (nome + stato), bolle live/echo, cluster ("N amici vicini"),
  Aura "tu", chip e cestino zona; hitSlop ≥ area comoda. Nuovi file: `lib/geo.ts`,
  `hooks/useSafeZones.ts`, `components/mappa/{ZonesLayer,SafeZoneEditor}.tsx`; +wrapper
  `creaSafeZone`/`eliminaSafeZone` in `lib/map.ts`. `docs/map/MANUAL-TESTING.md` scritto
  (scenari 2-device, permessi, Safe Zone+masking via DB, fusi simulati, privacy DoD).
  `CLAUDE.md` §5 (Fase 5 → sostituita da M7) e §6 (**regola d'oro posizione QA-7**)
  aggiornati. tsc/eslint verdi. ⏳ **Resta (azione owner)**: verifica on-device 2 device
  del flusso Safe Zone (creazione → publish successivo mascherato: DB `map_presence.masked`
  + `location`=centro-zona; l'amico vede "In zona").
- **MODULO MAPPA (M7) CHIUSO lato sviluppo: MM0–MM4 backend + MM5–MM9 mobile.** ⏭️ Restano
  solo verifiche on-device (azione owner) e la coda deploy-owner Edge (`gdpr-export` v4).
- **Verifica:** solo amici visibili; opt-in gestuale revocabile all'istante;
  criteri per milestone in `docs/map/map.md`.

### 🔔 M8 — Notifiche push (in-app)
- ✅ `src/lib/expo-push.ts` + `src/hooks/useNotifiche.ts` + richiesta permessi:
  FATTI in CM6 (chat). Restano: `(tabs)/notifiche.tsx` (tab in-app su
  `notifications` + `read_at`), `NotificaRow`, deep link per prop/achievement,
  pruning token `DeviceNotRegistered` lato Edge.
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

### 🔴 M12 — Live (broadcast video personale)
Spec+piano ufficiale: `docs/live/live.md` (Rev. 1, milestone LM0–LM8; scritto
2026-07-09, decisioni PO L-1..L-4). Live = broadcast video in prima persona,
**solo-amici** (in Co-Live: unione degli amici degli host attivi), stati
espliciti `live/paused/ended` a DB, commenti effimeri moderati (Perspective +
auto-mute), report via sistema esistente (`moderation_target` esteso),
notifiche di avvio **a tutti gli amici di default** (decisione PO "stile
TikTok", toggle per abbassare), Aura `participation` a rendimenti decrescenti
per live qualificate (≥5 min, ≥1 spettatore reale), badge LIVE sulla mappa M7
(anello rosso + callout, decadimento 3h via pattern Echo, opt-in + masked-aware).
Dominio NUOVO `lives`/`live_hosts`/`live_viewers`/`live_comments` che **COESISTE**
con le Stanze audio (`rooms`, M4). Riuso massiccio: `can_see_live` su
`are_friends`/`is_blocked_pair`, `enqueue_notification`, `emit_aura` 1/n,
`map_events`+`map_fanout`+inbox `map:u:{uid}`, `livekit-token` estesa (mint=join),
pattern drop_comments per i commenti realtime. Nuove Edge: `live-kick`,
`livekit-webhook`; reti di sicurezza in `expire_content` v7 + GDPR v7/export v5.
**Richiede Dev Build** (SDK `@livekit/react-native`).
- ✅ **LM0 fatto** (2026-07-09): migrazioni 55–56 live via pooler
  (`20260709120000_live_enums`: +5 valori enum su moderation_target/
  notification_type/map_event_type · `20260709120100_live_foundation`).
  Dominio: tabelle `lives` (unique parziale host attivo, `livekit_room_name`
  dal trigger, `clip_consent` riservato) / `live_hosts` (tetto 4
  invited+active) / `live_viewers` (fonte viewer_count + registro kick +
  gancio 1:1 adulto-minore) / `live_comments` (testo ≤200, realtime
  postgres_changes+RLS). `can_see_live` = UNICO predicato (host/co-host active
  → sì; kickato/RIMOSSO → no, §0.4 risolto verso il meno aperto; bloccato con
  alcun host attivo → no; all_friends = unione amici host ATTIVI L-3;
  top_friends = solo cerchia host principale). Trigger: macchina a stati
  (`ended` immutabile e terminale, toggle fotografati all'avvio, timestamp
  forzati), cap 4, sync contatori (congelati a fine live), guardie commenti
  (stato live + comments_enabled + rate-limit 5/30s per live). 8 RPC base
  SECURITY DEFINER (create/pause/resume/end, invite/accept/remove cohost,
  live_leave — pause/resume distinguono `live_already_ended` da
  `invalid_transition`); contatori PRIVATI: viewer_count/peak_viewers FUORI
  dal grant select per-colonna. `moderation_target_user` v3 (verbatim+add).
  pgTAP 392→**468** (+76 LM0) verdi SUL REMOTO; smoke 62/62 rolled-back
  (visibilità/blocchi/kick/unione L-3/top_friends/cap/rate-limit/stati).
  Tipi TS a mano (+4 tabelle, +8 RPC, +5 alias) e `tsc` pulito. Nessuna Edge
  nuova → coda deploy-owner invariata.
- ✅ **LM1 fatto** (2026-07-11): migrazione 57 (`20260711120000_live_map`) via
  pooler. `map_events.live_id` (FK → lives ON DELETE SET NULL, unique parziale
  `(live_id) where ended_at is null`, check `map_events_single_source_chk`:
  una riga referenzia UN solo dominio — chiude il rischio annotato nel piano).
  RPC `map_attach_live`/`map_detach_live` = specchio delle versioni room
  (is_active_user, solo host principale, solo stato `live`, sessione M7
  attiva + posizione pubblicata, masked-aware, title denormalizzato,
  idempotenti; fan-out `event_started`/`event_ended{removed:true}` con
  `live_id` e `room_id:null` nel payload — il client M7 li parsa già).
  Trigger `lives_map_close_events`: SOLO al passaggio a `ended` (WHEN sul
  trigger: in `paused` il badge resta pieno) → Echo a **+3h** (vs 12h stanze)
  + fan-out `event_ended{removed:false}`. `map_snapshot` v2 verbatim+add
  (`live_id` negli events). Revoca istantanea gratis: `map_stop_sharing` e
  kill-switch cancellavano già TUTTI gli eventi dell'utente. pgTAP
  468→**491** (+23 LM1) verdi SUL REMOTO; smoke 22/22 rolled-back (guardie,
  snapshot amico sì/estraneo no, fan-out una-volta solo all'amico,
  pause/end/detach/stop_sharing, check constraint). Tipi TS (+`live_id` su
  MapEventRaw e payload inbox, +2 RPC), `tsc` pulito. Nessuna Edge nuova →
  coda deploy-owner invariata. Cintura difensiva cron per gli eventi
  `live_broadcast` orfani → arriva con `expire_content` v7 (LM3, da piano).
- ⬜ **LM2–LM4 backend** (feed/fan-out/notifiche/Aura → lifecycle+GDPR →
  Edge LiveKit); **LM5–LM8 mobile** (SDK+strato dati → composer+schermo live
  host/spettatore → home feed striscia+verticale → badge mappa +
  MANUAL-TESTING + chiusura). UNA milestone alla volta su comando PO.
- **Verifica:** criteri per milestone e Definition of Done in `docs/live/live.md`
  (§18–§20); QA aperte §22 (cap 8h, pausa 30 min, preview muta, soglie Aura).

### ♻️ Trasversale (continuo)
Componenti UI residui (`Badge`, `BottomSheet`) · font (Inter, Clash Display) ·
asset reali (icon/splash/logo anello) · stati loading/empty/error · accessibilità
· config **EAS Dev Build** (sblocca LiveKit/Maps) · testing.

### 🚀 Pre-lancio (Terni, settembre 2026)
Chiavi LiveKit · `PERSPECTIVE_API_KEY` · build EAS produzione ·
listing store · seed inviti scuole di Terni.

---

## Regole d'oro (sempre valide — sintesi `CLAUDE.md` §6)
Age-gate ≥16 · `birth_date` mai esposta · voce dei minori mai pubblica ·
posizione coarse/effimera/friends-only/opt-in · saldo reale gated 18+ lato DB ·
token LiveKit/Stripe firmati solo server-side · segreti mai nel client ·
mutazioni delicate via RPC/Edge (il client non scrive le tabelle di sistema) ·
commenti e UI in italiano.
