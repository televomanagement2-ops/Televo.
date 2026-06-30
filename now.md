# Televo — now.md: cosa manca per finire il frontend

> Mappa puntuale dello stato reale del mobile, verificata leggendo i file (non la
> roadmap a parole). OAuth Google/Facebook rimandato a fine progetto per scelta
> dell'utente (serve dominio/redirect pubblico) — non è nel percorso critico ora.
> Aggiornare questo file via via che si chiudono i blocchi.

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

### Backend — live, invariato
21 migrazioni + 10 Edge Functions + 82 pgTAP su Supabase hosted. Vedi `CLAUDE.md`.
**Eccezione**: migrazione 22 (`20260629120000_onboarding_oauth.sql`) scritta in
locale, **stato push non verificabile da qui** — va controllata a mano (vedi §3.1).

### Mobile — Bootstrap (M0)
`app/_layout.tsx`, `app/index.tsx`, `authStore`, `useAuth`, `queryClient`,
provider. App parte, redirige auth/main.

### Mobile — Auth/Onboarding (M1) — pixel-perfect sulla welcome
- `welcome.tsx` ricostruita identica al mockup (logo immagine, 3 metodi
  Facebook/Google/Email, sfondo foto), vedi [[mobile-login-rebuild]].
- `email.tsx`, `verifica.tsx` (OTP), `registrazione.tsx` (wizard: Invito → Nascita
  ≥16 → Username → Consensi → Notifiche), `invito.tsx` (prefill da deep link).
- `telefono.tsx` esiste ma è **morto**: rotta non raggiungibile dalla UI (bottone
  rimosso), nessuna chiamata reale a SMS OTP.
- Google: codice presente (`signInWithProvider`, `@react-native-google-signin` **non
  installato** — verificare, vedi §2) ma **non attivabile finché non c'è dominio**
  (richiesto per redirect OAuth) → per scelta esplicita dell'utente, rimandato.
- Facebook: stesso discorso, stessa decisione.

### Mobile — Shell (M2) — SOLO scheletro, non "fatto"
- Tab bar 5 voci esiste (`(tabs)/_layout.tsx`): Home / Live / Mappa / Notifiche /
  Profilo.
- **Home**: placeholder reale minimo — solo "Sei dentro @username" + bottone
  logout. Nessun dato, nessun hub.
- **Live, Mappa, Notifiche, Profilo**: tab che renderizzano tutte lo stesso
  `<Placeholder />` generico ("Prossimamente"). Zero contenuto.

---

## 2. Cosa manca — per ogni verticale (M3→M11)

Tutti i file sotto esistono già come **scheletro vuoto (0 righe)**: sono stub
creati ma da scrivere da zero, nessuna logica presente.

### 🟣 M3 — Profilo + Aura (prossimo blocco logico, è un pilastro)
- `src/components/aura/{AuraRing,AuraScore,Classifica,PropCard}.tsx` — 0 righe.
- `app/(main)/(tabs)/profilo.tsx`, `profilo/[id].tsx`, `profilo/modifica.tsx`,
  `profilo/aura.tsx`, `profilo/achievement.tsx` — le rotte `profilo/*` **non
  esistono nemmeno come file** (solo il tab placeholder).
- `src/hooks/useAura.ts`, `useProfilo.ts`, `src/store/auraStore.ts` — 0 righe.
- Dipende da: query su `aura_score`, `aura_color`, `character_breakdown`,
  classifiche (`leaderboard_*`), `props` — tutto già esposto dal backend, solo da
  collegare.

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

### 💬 M5 — Social + Chat
- `app/.../chat/index.tsx`, `chat/[id].tsx` — non esistono come file.
- `src/components/chat/{BollaParlante,MessaggioRow,StreakBadge}.tsx` — 0 righe.
- `src/hooks/useChat.ts`, `src/store/chatStore.ts` — 0 righe.
- UI amicizie (richiesta/accetta/rimuovi/blocca) — assente, anche se le RPC backend
  esistono già (`send_friend_request` ecc.).
- Vocali effimeri richiedono `expo-av`/registrazione audio — `expo-av` è installato
  ma non ancora usato in nessun componente chat.

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
- `app/.../(tabs)/notifiche.tsx` — solo placeholder.
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

### 3.1 Migrazione 22 — stato sconosciuto da qui
`20260629120000_onboarding_oauth.sql` è scritta e committata in locale, ma la CLI
Supabase crasha in questo ambiente (`migration list` → `spawnSync UNKNOWN` su
Windows). **Verificare a mano dalla dashboard** (Database → Migrations, o
`SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC
LIMIT 3;` nel SQL Editor) se è già applicata. Senza, **l'onboarding non funziona
end-to-end** (RPC `complete_onboarding`/`check_invite` mancanti sul DB live).

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

## 4. Nuovo piano: Home "tecnica" come frame, design dopo

**Approccio**: costruire la **Home SUBITO** come hub di navigazione funzionante
(non design-heavy), senza spendere ore su UI/UX. È il frame dove piazzerai i
pezzi di feature man mano che li finisci. **Design della Home rimanda a dopo**,
quando tutti i pilastri (Aura, Stanze, Chat, Drops, Mappa) esistono — a quel
punto saprai cosa mostrare e come.

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

### 4.1 M2 reale — Home "tecnica" (subito, ore, non giorni)
- `app/(main)/(tabs)/home.tsx` — **non placeholder**, ma "vuota di contenuto
  sensato": mostra solo il wordmark + greeting + bottoni di navigazione verso le
  altre tab (oppure card placeholder "Aura (presto)", "Live in corso (presto)",
  ecc.). Lo scopo **non è farla bella**, è farla **navigabile**.
- Nessuna query costosa, nessun Reanimated, nessun dettaglio di design — solo
  struttura e testo.

### 4.2 M3 — Profilo + Aura (prossimo blocco concreto)
- Dentro `app/(main)/(tabs)/profilo.tsx` metti il vero `AuraRing`, le classifiche,
  i prop ricevuti — una volta pronto, lo navighiamo dalla Home con un tap,
  finito.
- `src/components/aura/{AuraRing,Classifica,PropCard}.tsx` — componenti veri.
- `src/hooks/useAura.ts`, `src/store/auraStore.ts` — dati veri da DB.

### 4.3 Ordine per gli altri blocchi (parallelo, nessun vincolo)
1. **M5 — Chat/Social**: tab Chat pronta, dentro navigazione a chat/[id].
2. **M6 — Drops**: piccolo, infila un feed nella Home o in una tab.
3. **M8 — Notifiche**: `expo-notifications` cablato, tab notifiche popolare.
4. **EAS Dev Build** → **M4 Stanze Live** + **M7 Mappa** (dipendenze native).
5. **M9/M10/M11** (economia, moderazione, GDPR): bassa priorità.
6. **Design completo della Home** + **OAuth reale** + **asset branded** + **EAS
   prod**: tutto insieme a fine progetto.

### 4.4 Verifiche preliminari (prima di toccare Home)
1. **Migrazione 22 live?** — Controllare in Supabase dashboard se
   `complete_onboarding` / `check_invite` sono applicate. Senza, l'onboarding
   attuale non chiude end-to-end (vedi §3.1).
2. Una volta confermato, **Home "tecnica" si scrive in poche ore** e il progetto
   ha il suo frame di navigazione stabile.

---

## 5. Nota sulla fonte di verità

`roadmap.md` (root) descrive lo stack come se LiveKit/Maps/Google-Signin fossero
già installati — **non lo sono**, verificato da `package.json`. Questo file
(`now.md`) riflette lo stato reale dei file al 2026-06-30; se diverge da
`roadmap.md` in futuro, fidarsi del codice (`ls`/`wc -l`/`grep`), non del testo
della roadmap, e poi aggiornare entrambi i documenti.
