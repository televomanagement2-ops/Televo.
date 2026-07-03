# Televo — Chat: Piano di Implementazione (roadmap ufficiale)

> **Questo documento è la roadmap ufficiale dello sviluppo del sistema Chat.**
> Nasce dall'analisi completa del progetto (2026-07-02): codice frontend, migrazioni
> backend, infrastruttura trasversale e revisione critica della SRS. La specifica
> funzionale è `docs/chat/SRS-chat.md` (Revisione 2): questo piano dice *in che
> ordine* e *come* realizzarla, milestone per milestone. Riferimento di completezza
> dichiarato dall'utente: **Telegram** (per maturità funzionale, NON per design —
> il design verrà rifatto in seguito).
>
> **Stato**: approvato. **Ultimo aggiornamento**: 2026-07-03.

---

## 0. Come usare questo documento

- Le milestone sono ordinate per **dipendenza tecnica**: si implementano in ordine
  (CM0 → CM8). Ogni milestone è abbastanza piccola da essere completata senza
  lasciare il progetto in uno stato rotto.
- Ogni milestone ha: obiettivo, dipendenze, componenti/file, rischi, checklist,
  criteri di completamento, test. Le checkbox si spuntano a lavoro fatto.
- I requisiti citati come `RC-xx` sono i "Requisiti di completezza moderna" della
  SRS Rev. 2 (§19); gli `R-xx` sono le decisioni chiuse della SRS (§17); le
  schermate `S1..S16` sono quelle della SRS (§5).
- Regole d'oro sempre valide: `CLAUDE.md` §6 e `roadmap.md` (safety minori, GDPR,
  RPC/Edge per le mutazioni delicate, commenti in italiano).

---

## 1. Stato attuale (fotografia verificata al 2026-07-02)

### 1.1 Backend — scritto e quasi completo, ma **in parte non ancora applicato al DB live**

Oltre alle 22 migrazioni già applicate (fasi 0–8 + GDPR + onboarding, quest'ultima
confermata live il 2026-06-30), esistono in locale **11 migrazioni non ancora
`db push`ate** sul progetto Supabase hosted (da confermare con `migration list` in
CM0):

| Migrazione | Contenuto | Copre |
|---|---|---|
| `20260701000000/000100_aura_v3*` | Aura v3 (0–100%, ricalcolo daily) | (fuori chat) |
| `20260701010000_chat_realtime` | publication realtime su `messages`, `conversations`, `conversation_members` | SRS §8.1 |
| `20260701020000_conversation_remove_member` | RPC `remove_conversation_member` | S13 |
| `20260701030000_chat_org` | `conversation_members.{muted_until, archived_at, pinned_at, cleared_at, hidden_at}` + RPC `set_conversation_mute` / `set_conversation_flag` / `clear_conversation_history`; trigger notify mute-aware | D4, §7.4, §9.3 |
| `20260701040000_saved_messages` | tabella `saved_messages` + RPC save/unsave | S7 |
| `20260701050000/050100_chat_media*` | enum `media`, `messages.{media_url, media_type}`, bucket `chat-media` + RLS | D3 |
| `20260701060000_chat_presence_privacy` | `profiles.{last_active_at, show_last_seen, show_read_receipts}` + RPC `touch_presence` | §3.12–3.13 |
| `20260701070000/070100_contact*` | consenso `contacts_sync`, `contact_hashes`, RPC `register_contact_hash` + `match_contacts` (minori scopribili solo da amici) | D1 |

pgTAP: 125 invarianti in `supabase/tests/rls_smoke.test.sql` (coprono anche le nuove).

**Manca del tutto nel backend** (nuovo lavoro, milestone CM1/CM4):
`edited_at` (l'edit oggi non è tracciato → indicatore "modificato" impossibile),
enforcement blocco↔DM esistente, cap lunghezza/rate-limit, azzeramento `hidden_at`
su nuovo messaggio, esposizione privacy-safe della presenza, `forwarded_from`,
`message_reactions`, ricerca full-text, RPC gestione gruppo (rinomina/avatar/promozione
admin), export GDPR esteso alle nuove tabelle chat.

### 1.2 Frontend — ~70% del perimetro SRS già implementato (commit `8edd022` + polish non committato)

**Esiste e funziona** (in Expo Go, salvo realtime che attende il push CM0):
- `(tabs)/messages.tsx` — hub S1: lista ordinata fissate→attività, badge unread,
  indicatori mute/pin/streak, long-press S16-bis (silenzia 8h/1sett/sempre, fissa,
  archivia, segna letto, elimina/esci), menu overflow (Nuovo gruppo, Importante).
- `chat/[id].tsx` — S2/S3: lista invertita paginata (40/pagina), separatori data,
  bolle testo/vocale, reply con citazione, spunte DM ✓/✓✓ da `last_read_at`,
  soft-delete, mark-read all'apertura e sui messaggi in arrivo, realtime
  per-conversazione, menu overflow (silenzia, cancella cronologia, elimina/esci).
- `chat/[id]/info.tsx` — S13: peer (DM) / membri con ruoli (gruppo), aggiungi/rimuovi
  membro (admin), esci.
- `chat/nuovo-gruppo.tsx` — S4. `messaggi/importante.tsx` — S7/S8/S9 (salvati,
  archiviati, silenziati con ripristino).
- DM dal profilo altrui: `useApriDm` → `get_or_create_dm` (`profilo/[id].tsx`).
- Vocali effimeri end-to-end: registrazione (`expo-av`) → upload bucket privato →
  player con signed URL lazy + cache 1h + badge 24h (`lib/audio.ts`, `PlayerVocale`).
- Data layer solido: `lib/chat.ts` (tutte le RPC D4), `lib/chat-realtime.ts`,
  `hooks/useChat.ts` (query key factory, infinite query, upsert realtime in cache),
  `chatStore` (bozze + reply per conversazione), tipi `supabase.ts` allineati al DB.

**Non esiste ancora nel frontend**: S10 (impostazioni privacy), S11 (contatti
rubrica), S12a/b (ricerca messaggi), presenza in header, typing, edit UI, media,
inoltro, reazioni, selezione multipla, copia, invio ottimistico, offline, realtime
dell'hub + badge tab, push client (`expo-push.ts` è vuoto), block/report in chat,
prop-da-messaggio, "letto da N" nei gruppi, scroll-to-quoted, pill "nuovi messaggi ↓".

### 1.3 Bug e difetti verificati (da correggere in CM1)

1. **`fetchMessagesPage` non filtra `cleared_at`** → "Cancella cronologia" nasconde i
   messaggi solo nell'hub, non dentro la chat aperta. Non filtra nemmeno i **vocali
   scaduti** (visibili tra la scadenza e il passaggio del cron `expire_content`).
2. **gdpr-export incompleto** (art. 15): non esporta `saved_messages`,
   `conversation_members`, `contact_hashes`, `consents`.
3. **`hidden_at` non si azzera mai**: la DM "eliminata" non riappare all'arrivo di un
   nuovo messaggio (SRS §7.5 lo richiede).
4. **Blocco non impedisce l'invio** nella DM esistente con coppia bloccata (safety —
   R-05).
5. **`last_active_at` leggibile raw da chiunque**: il grant SELECT su `profiles` copre
   tutta la riga → il toggle `show_last_seen` non è applicabile server-side così com'è.
6. **Composer non disabilitato per mutati/bannati** (§11.4): la prop `disabledReason`
   esiste ma nessuno la calcola (l'insert fallisce comunque per RLS, ma l'UX è muta).

### 1.4 Cosa NON toccare (già ottimo)

Pipeline audio completa (`lib/audio.ts` + `PlayerVocale`), `lib/chat-realtime.ts`,
`chatStore`, RPC organizzazione D4 lato backend, trigger/RLS core di `messages`,
`DataSeparatore`/`lib/datetime.ts` (niente `Intl`, compatibile Hermes), i fix UI non
committati (tastiera Android, larghezze bolle) — **da committare così come sono in CM0**.

---

## 2. Gap analysis sintetica (requisito → stato → milestone)

| Requisito (SRS Rev. 2) | Backend | Frontend | Milestone |
|---|---|---|---|
| DM/gruppi/house, messaggi testo | ✅ | ✅ | — |
| Vocali effimeri 24h | ✅ | ✅ | — |
| Reply / soft-delete / spunte DM | ✅ | ✅ | — |
| Organizzazione D4 (mute/pin/archivia/cancella/elimina) | ✅ scritto | ✅ | CM0 (push) |
| Realtime messaggi | ✅ scritto | ✅ per-conversazione | CM0 (push) |
| Cancella cronologia dentro la chat (bug) | ✅ | ❌ filtro mancante | CM1 |
| Blocco → stop invio in DM (R-05) | ❌ | ❌ | CM1 |
| Edit + indicatore "modificato" (RC-05) | ❌ `edited_at` | ❌ UI | CM1 (colonna) + CM4 (UI) |
| Composer disabilitato mutato/bannato (§11.4) | ✅ | ❌ | CM1 |
| GDPR export/delete estesi (RC-12) | ❌ | — | CM1 |
| Invio ottimistico + stati + retry (RC-01) | ✅ (basta) | ❌ | CM2 |
| Offline base (RC-02) | — | ❌ | CM2 |
| Realtime hub + badge tab (§8.5) | ✅ scritto | ❌ | CM2 |
| Micro-UX: pill nuovi msg, scroll-to-quoted, copia, linkify, raggruppamento (RC-10) | — | ❌ | CM2 |
| Presenza online/ultimo accesso privacy-safe (RC-04) | ⚠️ RPC da fare | ❌ | CM3 |
| Typing indicator (RC-03) | — (broadcast) | ❌ | CM3 |
| S10 impostazioni privacy | ✅ colonne | ❌ | CM3 |
| Inoltro + selezione multipla (RC-06) | ❌ | ❌ | CM4 |
| Reazioni emoji (RC-07, decisione utente: SÌ) | ❌ | ❌ | CM4 |
| Ricerca FTS in-chat + globale (RC-08) | ❌ | ❌ | CM4 |
| "Letto da N" gruppi + info messaggio (RC-09) | ✅ (derivabile) | ❌ | CM4 |
| Gestione gruppo: rinomina/avatar/promozione admin (R-09) | ❌ RPC | ❌ | CM4 |
| Prop-da-messaggio + Segnala nel menu (S16) | ✅ | ❌ | CM4 |
| Foto/media (D3) | ✅ scritto | ❌ | CM5 |
| Push client + deep link (RC-13) | ✅ | ❌ | CM6 |
| Contatti su Televo, email-only (D1) | ✅ scritto | ❌ | CM7 |
| Riepilogo conversazioni server-side (scala) | ❌ | scan 400 client | CM8 |
| Block/unblock UI, moderate-text su invio, cleanup gruppi orfani | ✅ | ❌ | CM8 |

---

## 3. Milestone

### CM0 — Fondazioni operative (allineare il DB live al codice)

**Obiettivo**: il DB remoto contiene tutte le migrazioni locali; il realtime chat
funziona end-to-end; il working tree è pulito.

**Dipendenze**: accesso CLI Supabase con l'account `televo.management2@gmail.com`
(`supabase login`). Nessuna dipendenza di codice.

**Componenti/file coinvolti**: nessun file nuovo. Eventuali fix alle migrazioni
`2026062912…`–`2026070107…` se Postgres reale segnala errori.

**Attività**:
1. Commit del WIP UI (fix tastiera/bolle/attach/drops — messaggio dedicato).
2. `supabase migration list` → confermare le migrazioni pendenti (attese: le 11
   `23–33`; la 22 onboarding risulta già applicata dal 2026-06-30).
3. `supabase db push` → applicarle. Al primo errore: leggere, correggere la
   migrazione interessata, ripetere (convenzione del progetto, CLAUDE.md §3).
4. pgTAP dal SQL Editor della dashboard (piano Free, niente psql): 125 invarianti.
5. Verifica realtime end-to-end: app aperta su una conversazione → INSERT di un
   messaggio dal SQL Editor → l'evento arriva in app senza refresh.
6. Verificare che i cron e i Vault secrets esistenti siano intatti.

**Rischi**:
- Le migrazioni chat non sono mai girate su Postgres reale (niente Docker locale):
  possibili errori di ordine/sintassi. Mitigazione: push incrementale + fix in corsa.
- `alter type … add value` non può convivere con usi nello stesso file: già gestito
  (enum spezzati in due migrazioni), ma verificare l'ordine di applicazione.
- Publication realtime: verificare che il piano Free non limiti i canali necessari.

**Checklist**:
- [x] WIP committato (`d5c1272`)
- [x] `migration list`: locale = remoto (nessuna pendente)
- [x] pgTAP: 142/142 verdi sul remoto (suite eseguita via pooler il 2026-07-02)
- [ ] Realtime: evento INSERT ricevuto in app (publication verificata server-side:
      `messages`, `conversations`, `conversation_members` — resta lo smoke su device)
- [x] Cron/Vault verificati (7 cron attivi; i 3 segreti push registrati in Vault
      il 2026-07-02: `edge_base_url`, `service_role_key`, `cron_secret`)

**Criteri di completamento**: tutte le checkbox; nessuna regressione su login/profilo.

**Test**: pgTAP (SQL Editor) + smoke manuale su device (Expo Go).

---

### CM1 — Correttezza & safety (consolidare l'esistente prima di costruire)

**Obiettivo**: chiudere i 6 difetti verificati (§1.3) e mettere in sicurezza le
fondamenta: da qui in poi si costruisce solo su base corretta.

**Dipendenze**: CM0.

**Backend** (nuova migrazione `YYYYMMDDHHMMSS_chat_hardening.sql` + edit Edge GDPR):
- `messages.edited_at timestamptz null` + trigger `messages_before_update`: se
  cambia `body` → `edited_at = now()`; rifiuta oltre la **finestra 48h** dall'invio
  (`edit_window_expired`), su messaggi non-testo o già cancellati.
- **Blocco↔DM (R-05)**: nel trigger before-insert, per le conversazioni `dm`,
  rifiutare l'invio se `is_blocked_pair(sender, peer)` (`blocked_pair`). La DM resta
  visibile (storia), ma nessuno dei due può scrivere.
- **Cap 4096 caratteri** su `body` (`message_too_long`) e **rate-limit** di base
  (es. >30 messaggi/60s per mittente → `rate_limited`; serve indice
  `messages(sender_id, created_at)`).
- **`hidden_at` auto-azzerato** su nuovo messaggio (nel trigger after-insert che già
  bumpa `updated_at`): la DM "eliminata" riappare (SRS §7.5).
- **Presenza privacy-safe (RC-04)**: RPC `get_peer_presence(p_user)` SECURITY DEFINER
  che ritorna `{online, last_active_at}` SOLO se entrambi hanno `show_last_seen = true`
  (reciprocità R-03) — e valutare la revoca del grant di colonna su
  `profiles.last_active_at` (attenzione: il grant oggi è su tutta la tabella; passare
  a grant per colonna è un cambio invasivo → in alternativa spostare il dato su una
  tabella dedicata in CM8; documentare la scelta nella migrazione).
- **GDPR (RC-12)**: `gdpr-export` esporta anche `saved_messages`,
  `conversation_members` (propri), `contact_hashes` (propri), `consents`;
  `process_account_deletion` cancella `contact_hashes`.
- pgTAP: nuove invarianti (edited_at, blocked_pair, cap, hidden_at reset, presenza).

**Frontend**:
- `lib/chat.ts` → `fetchMessagesPage`: filtro `cleared_at` (passato dal chiamante,
  già noto all'hub) e filtro client dei messaggi con `expires_at <= now()`.
- `chat/[id].tsx`: calcolo `disabledReason` dal proprio profilo
  (`muted_until`/`banned_at` → "Sei silenziato fino a …" / "Account sospeso") e dal
  blocco (peer bloccato → "Hai bloccato questo utente").
- `types/supabase.ts`: `edited_at`, nuove RPC. `lib/errors.ts`: nuovi codici
  (`blocked_pair`, `edit_window_expired`, `message_too_long`, `rate_limited`).

**Rischi**: la revoca del grant su `last_active_at` può rompere select esistenti →
scegliere l'approccio meno invasivo e testare il login/profilo; il rate-limit non
deve colpire l'uso legittimo (soglia larga).

**Checklist**:
- [x] Migrazione hardening applicata (push) + pgTAP estesi verdi (142/142 sul remoto)
      — ⚠️ la prima stesura (20260702120000) aveva regressioni gravi, corrette da
      `20260702130000_chat_hardening_fix.sql` (vedi header della migrazione)
- [x] Cancella cronologia funziona DENTRO la chat (filtro `cleared_at` lato server)
- [x] Vocale scaduto non visibile anche prima del cron (filtro `expires_at` lato server)
- [x] Invio rifiutato in DM bloccata (trigger `blocked_pair`) e composer disabilitato con motivo
- [x] Composer disabilitato per mutato/bannato con messaggio (`useComposerDisabledReason`)
- [x] DM nascosta riappare al nuovo messaggio (reset `hidden_at` per TUTTI i membri)
- [ ] Export GDPR contiene le nuove tabelle (codice pronto in `gdpr-export/index.ts`;
      il deploy CLI risponde 403 per privilegi account → deployare dall'account owner)
- [x] `tsc --noEmit` + `eslint` puliti

**Criteri di completamento**: i 6 difetti di §1.3 chiusi e coperti da test/pgTAP.

**Test**: pgTAP; manuale: blocco→invio, cancella cronologia, mute moderazione.

---

### CM2 — UX di invio moderna (optimistic, offline, realtime hub)

**Obiettivo**: la chat "sembra Telegram" nell'atto più frequente: scrivere e ricevere.
Zero nuovo backend.

**Dipendenze**: CM0 (realtime attivo), CM1 (fetch corretti). NPM:
`@react-native-community/netinfo`, `expo-clipboard`.

**Componenti/file**: `hooks/useChat.ts`, `lib/chat.ts`, `chat/[id].tsx`,
`BollaParlante.tsx`, `MessaggioRow.tsx`, `(tabs)/messages.tsx`, `BottomBar.tsx`,
nuovo `src/lib/rete.ts` (NetInfo → onlineManager TanStack), `chatStore.ts` (coda).

**Attività**:
- **Invio ottimistico (RC-01)**: bolla locale immediata con id temporaneo e stato
  `pending`; su successo sostituzione con la riga reale (dedup per id anche verso il
  realtime); su errore stato `failed` con azioni **Riprova / Elimina**. Vale per
  testo e vocali (upload incluso).
- **Offline base (RC-02)**: NetInfo cablato in `onlineManager`; banner "Sei offline"
  in S1/S2; i messaggi composti offline restano `pending` e partono alla
  riconnessione (coda in-sessione; persistenza su disco = non-obiettivo, documentato).
- **Realtime hub + badge tab (§8.5)**: subscription globale a `messages` INSERT
  (RLS filtra già per membership) montata nella shell → invalida la lista, aggiorna
  anteprime/unread live; badge numerico sulla tab Messaggi = somma unread delle
  conversazioni non silenziate/non archiviate.
- **Micro-professionalità (RC-10)**: pill "nuovi messaggi ↓" quando si è scrollati
  in alto e arriva un messaggio (niente scroll forzato); tap sulla citazione →
  scroll al messaggio originale con highlight; **Copia** nel menu messaggio;
  linkify degli URL nel testo; raggruppamento visivo bolle consecutive dello stesso
  mittente (<2 min); haptic sull'invio.

**Rischi**: dedup optimistic↔realtime (l'INSERT realtime del proprio messaggio arriva
anche al mittente → scartare per id già presente); scrollToIndex su liste invertite
paginate (fallback: fetch fino al messaggio citato); doppia subscription (hub +
conversazione) da tenere leggera (un solo canale globale nella shell).

**Checklist**:
- [x] Messaggio visibile immediatamente all'invio (anche offline, come pending)
      — outbox in `chatStore` + motore `lib/outbox.ts` (testo E vocali, upload incluso)
- [x] Errore di invio → stato failed con retry funzionante (tap o long-press → Riprova/Elimina;
      errori di rete restano pending, errori del server diventano failed col motivo IT)
- [x] Nessun messaggio duplicato con realtime attivo (temp rimosso PRIMA dell'upsert
      della riga reale; upsert con dedup per id su tutte le varianti di chiave)
- [x] Banner offline (S1+S2) + ripartenza coda alla riconnessione (flush sequenziale
      in `ChatRuntime`, ordine di enqueue preservato). Persistenza su disco = non-obiettivo.
- [x] Hub e badge tab si aggiornano senza aprire la chat (canale realtime globale
      `chat:hub` in `ChatRuntime`; badge = somma unread non silenziate/non archiviate)
- [x] Pill nuovi messaggi / scroll-to-quoted (con highlight e paginazione all'indietro)
      / copia / linkify / raggruppamento (<2 min) + haptic all'invio
- [x] `tsc` + `eslint` puliti

> Demo end-to-end su 2 device (criterio di completamento): da eseguire in Expo Go
> (smoke manuale utente); tutto il resto è verificato.

**Criteri di completamento**: demo end-to-end su 2 device: A scrive (anche in
aereo-mode e poi riconnette), B vede tutto live senza refresh manuali.

**Test**: manuale 2 device; unit sui reducer di coda/dedup se estratti puri.

---

### CM3 — Presenza, typing, privacy (S10)

**Obiettivo**: la chat "respira" (Proof of Human): online/ultimo accesso, "sta
scrivendo…", e i toggle privacy che li governano.

**Dipendenze**: CM1 (RPC `get_peer_presence`), CM0 (broadcast realtime).

**Componenti/file**: nuovo `app/(main)/messaggi/impostazioni.tsx` (S10), header di
`chat/[id].tsx`, `lib/chat-realtime.ts` (canale broadcast typing), nuovo hook
`usePresenza`, `routes.ts` (+rotta impostazioni), `Composer.tsx` (emissione typing).

**Attività**:
- **Heartbeat**: `touch_presence()` all'apertura app, al foreground e ogni ~60s
  mentre attiva (throttle; AppState già ascoltato in `lib/supabase.ts`).
- **Header DM**: "online" se `last_active_at` < 2 min, altrimenti "ultimo accesso
  alle HH:mm" — via `get_peer_presence` (reciprocità R-03); riga nascosta se non
  disponibile.
- **Typing (RC-03)**: evento broadcast `typing` sul canale della conversazione,
  throttle ~2.5s mentre si digita; UI "sta scrivendo…" con TTL 4s; nei gruppi
  "username sta scrivendo…". Nessuna persistenza.
- **S10**: toggle "Ultimo accesso" e "Spunte di lettura" (update colonne proprie su
  `profiles`, grant già presente) con spiegazione della reciprocità.
- **Gating spunte (§6.4)**: se `show_read_receipts` è off per me o per il peer →
  mostrare solo ✓ singola (presentazione client; `mark_conversation_read` continua
  per l'unread proprio). L'enforcement server (nascondere `last_read_at` altrui) è
  rimandato a CM8 e documentato come compromesso.

**Rischi**: consumo batteria/rete dell'heartbeat (throttle aggressivo, solo
foreground); typing spam sul canale (throttle + TTL); privacy minori (la presenza è
visibile solo dentro conversazioni esistenti, mai pubblica).

**Checklist**:
- [x] Online/ultimo accesso corretto nei due sensi (e sparisce se toggle off)
      — hook `usePresenza` (heartbeat foreground 60s + throttle 45s in ChatRuntime;
      query `get_peer_presence` con refetch 30s); privacy/reciprocità applicate
      DAL SERVER (RPC v2 di CM1), il client nasconde la riga sui null
- [x] "Sta scrivendo…" appare/scompare correttamente (DM e gruppo)
      — broadcast `typing` sul canale per-conversazione ESISTENTE (zero canali
      extra), throttle 2.5s emittente + TTL 4s ricevente; nei gruppi con username
      (">1 → N stanno scrivendo…"); sottotitolo header con priorità
      typing > presenza (DM) > "N membri" (gruppi)
- [x] S10 persiste i toggle e la reciprocità è rispettata
      — `messaggi/impostazioni.tsx` (via menu overflow hub), update ottimistico con
      rollback su `profiles` (ProfilePatch esteso, grant per-colonna già live);
      invalida presenza + header chat al salvataggio
- [x] Spunte nascoste quando i toggle sono off
      — gating client §6.4: doppia spunta solo se `show_read_receipts` è on per
      ENTRAMBI (mio da `useMyProfile`, peer da `peerShowsReadReceipts` nell'header);
      `mark_conversation_read` invariato (unread proprio). Enforcement server → CM8
- [x] `tsc` + `eslint` puliti (0 errori, 0 warning)

> Verifica su 2 device (criterio di completamento): da eseguire in Expo Go (smoke
> manuale utente, matrice toggle on/off × 2 utenti); tutto il resto è verificato.

**Criteri di completamento**: scenari sopra verificati su 2 device.

**Test**: manuale 2 device (matrice toggle on/off × 2 utenti).

---

### CM4 — Gestione moderna dei messaggi (edit, inoltro, reazioni, ricerca, gruppi)

**Obiettivo**: parità funzionale con le chat mature sulla manipolazione dei messaggi.

**Dipendenze**: CM1 (`edited_at`), CM2 (lista stabile con optimistic).

**Backend** (nuova migrazione `YYYYMMDDHHMMSS_chat_modern.sql`):
- `messages.forwarded_from uuid null references messages on delete set null`
  (+ grant insert). L'inoltro copia il contenuto e referenzia l'origine.
- **`message_reactions`** (decisione utente: SÌ): `(message_id, user_id, emoji,
  created_at)` PK `(message_id, user_id)`, emoji in un **set curato** (es. ❤️ 😂 👍
  😮 😢 🔥), RLS: select per membri della conversazione del messaggio, insert/delete
  solo proprie; publication realtime; nessun contatore fuori dalla conversazione
  (coerenza anti-vanity).
- **Ricerca FTS (RC-08)**: colonna generata `body_tsv` (`to_tsvector('italian', …)`)
  + indice GIN + RPC `search_messages(p_query, p_conv default null, p_limit)` che
  rispetta membership/cleared/deleted.
- **Gestione gruppo**: RPC `update_conversation_meta(p_conv, p_name, p_avatar_url)`
  (admin), `promote_conversation_admin(p_conv, p_user)` (admin); in
  `leave_conversation`, se esce l'ultimo admin → auto-promozione del membro più
  anziano (R-09).
- pgTAP per tutto il nuovo.

**Frontend**:
- **Edit (RC-05)**: menu S16 → il composer entra in modalità modifica → update
  `body`; badge "modificato" sulle bolle con `edited_at`.
- **Selezione multipla + inoltro (RC-06)**: long-press → selezione; barra azioni
  Copia / Inoltra / Elimina / Salva; picker della conversazione di destinazione;
  bolla inoltrata con intestazione "Inoltrato".
- **Reazioni (RC-07)**: long-press → barra emoji sopra il menu; chip reazioni sotto
  la bolla; toggle della propria; aggiornamento realtime.
- **"Letto da N" (RC-09)**: nei gruppi, voce "Info messaggio" nel menu → elenco di
  chi ha letto (derivato da `last_read_at` dei membri).
- **Prop-da-messaggio + Segnala (S16)**: "Dai un prop" (scelta tratto → insert
  `props` con `source_type='message'`) e "Segnala" (`file_report`).
- **Ricerca**: S12b dentro la chat (barra ricerca + navigazione tra i match via
  `search_messages`); sezione "Messaggi" nella ricerca globale (`cerca.tsx`).

**Rischi**: reazioni = superficie realtime in più (canale della conversazione già
esistente: riusarlo); FTS su citext/italian da validare con testi reali; inoltro di
vocali effimeri (vietarlo: il file scade — regola: inoltrabili solo testo/media).

**Checklist**:
- [x] Migrazione modern applicata (`20260703120000`, push al primo colpo) + pgTAP
      166/166 verdi SUL REMOTO + smoke runtime via pooler (search_messages eseguita
      con JWT simulato, reazione inserita col trigger, emoji fuori set rifiutata)
- [x] Edit entro 48h con badge "modificato" (banner matita nel composer, update
      diretto, realtime onUpdate già cablato); rifiuto oltre finestra → errore IT
- [x] Inoltro singolo (menu) e multiplo (selezione, cap 10 per il rate-limit) con
      intestazione "Inoltrato"; SOLO testo (vocali vietati dal trigger; media → CM5)
- [x] Reazioni: set curato ❤️😂👍😮😢🔥 (CHECK DB byte-identico alla costante
      client), 1 per utente (PK), toggle ottimistico delete+insert, chip sotto le
      bolle, realtime INSERT filtrato + DELETE con scoping client (compromesso
      documentato in migrazione). Niente notifiche/Aura (decisione utente)
- [x] Ricerca FTS in-chat (barra header, contatore i/N, frecce, salto+flash) e
      globale (cerca.tsx ricostruita: Persone + Messaggi → deep-link ?highlight=)
- [x] Rinomina gruppo/avatar (pannello admin in info) + promozione admin (scudo)
      + auto-promozione del più anziano server-side (leave_conversation v2)
- [x] Prop da messaggio (insert diretta, trait picker nel menu; 23505 → "già
      dato") e Segnala (file_report target message, 4 motivi) funzionanti
- [x] `tsc` + `eslint` puliti (0 errori, 0 warning)

> Verifica su 2 device (criterio di completamento): da eseguire in Expo Go (smoke
> manuale utente: reazioni live, edit, inoltro, ricerca con accenti); tutto il
> resto è verificato (pgTAP remoto + smoke runtime).
>
> ⚠️ Scoperta CM4 (sistemica, rimandata a CM8): il progetto hosted ha DEFAULT
> PRIVILEGES che concedono ALL ad anon/authenticated su OGNI nuova tabella — i
> grant espliciti delle migrazioni sono di fatto cosmetici e la RLS è l'unico
> cancello reale. Su `message_reactions` i privilegi sono stati revocati e
> ri-concessi al minimo (invariante pgTAP dedicata); l'audit delle altre tabelle
> è aggiunto a CM8.

**Criteri di completamento**: tutte le voci del menu messaggio della SRS S16 operative.

**Test**: pgTAP; manuale 2 device (reazioni/edit/inoltro); ricerca con accenti.

---

### CM5 — Foto/media (D3)

**Obiettivo**: inviare e vedere foto in chat, con la stessa cura dei vocali.

**Dipendenze**: CM0 (bucket `chat-media` live), CM2 (stati pending/failed riusati
per l'upload). `expo-image-picker` già installato.

**Componenti/file**: `Composer.tsx` (graffetta → picker), nuovo
`src/components/chat/BollaMedia.tsx` + `ViewerMedia.tsx` (full-screen, zoom),
`lib/chat.ts` (`sendMediaMessage`), nuovo `lib/media.ts` (upload + signed URL cache,
specchio di `audio.ts`).

**Attività**: picker (galleria/camera) con compressione (`quality`), upload su
`chat-media` (`<conv>/<uid>/<file>`), insert `type='media'` con `media_url`,
`media_type='image'`, caption opzionale in `body`; bolla thumbnail (aspect ratio,
altezza max); viewer full-screen con pinch-zoom; retry su upload fallito (nessun
messaggio fantasma: insert SOLO dopo upload riuscito — caso limite 7 della SRS §15);
anteprima "📷 Foto" nell'hub e nelle notifiche (già pronta lato backend).

**Rischi**: supabase-js non espone progress in upload RN → spinner senza percentuale
(accettato per MVP); memoria su immagini grandi (ridimensionare al picker); privacy
minori (bucket privato + RLS: MAI URL pubblici, solo signed URL).

**Checklist**:
- [ ] Invio foto da galleria e fotocamera con caption
- [ ] Thumbnail in bolla + viewer zoom (solo membri)
- [ ] Upload fallito → retry, nessun messaggio orfano
- [ ] Vocale/foto scaduti/cancellati gestiti nel viewer
- [ ] `tsc` + `eslint` puliti

**Criteri di completamento**: flusso foto end-to-end su 2 device, RLS verificata
(un non-membro con il path NON accede al file).

**Test**: manuale 2 device + tentativo di accesso cross-utente al bucket.

---

### CM6 — Push e deep link (RC-13)

**Obiettivo**: le notifiche push dei messaggi arrivano e aprono la chat giusta.

**Dipendenze**: CM0 (dispatch_push/Vault già live). Backend già completo
(trigger notify mute-aware + Edge `send-push`).

**Componenti/file**: `src/lib/expo-push.ts` (da riempire), `app/_layout.tsx`
(listener tap notifica), `(tabs)/messages.tsx` o shell (richiesta permesso
contestuale), `hooks/useNotifiche.ts` se utile.

**Attività**: permesso contestuale (primo ingresso nell'hub) con spiegazione;
`getExpoPushTokenAsync` (projectId) → RPC `register_device`; canale Android
"Messaggi"; tap sulla notifica → `router.push(chat(payload.conversation_id))`
(cold start incluso); handler foreground: sopprimere il banner se la conversazione è
già aperta; badge icona app (somma unread) via `setBadgeCountAsync`.

**Rischi**: **Expo Go Android non supporta più le push remote (SDK 53+)** → test
completo solo su Development Build o iOS; documentare e non bloccare la milestone
sul device Android in Go. Token invalidati → `unregister_device` al logout.

**Checklist**:
- [ ] Token registrato in `devices` al consenso
- [ ] Push ricevuta con app in background (dove il runtime lo consente)
- [ ] Tap → apre la conversazione corretta (anche da app chiusa)
- [ ] Nessuna notifica di sistema se la chat è già aperta in foreground
- [ ] Notifiche soppresse per conversazioni silenziate (verifica end-to-end)
- [ ] `tsc` + `eslint` puliti

**Criteri di completamento**: ciclo completo messaggio→push→tap→chat su almeno una
piattaforma reale.

**Test**: manuale (2 account, app in background); verifica `pushed_at` sul DB.

---

### CM7 — "I tuoi contatti su Televo" (D1 — solo email)

**Obiettivo**: S11 — trovare i contatti della rubrica già su Televo (match per
**hash email**; decisione utente: niente telefono per ora).

**Dipendenze**: CM0 (tabelle/RPC contatti live). NPM: `expo-contacts`, `expo-crypto`.

**Componenti/file**: nuovo `app/(main)/messaggi/contatti.tsx` (S11), nuovo
`src/lib/contatti.ts` (lettura rubrica → normalizzazione email → SHA-256 → batch),
`routes.ts`, hub S1 (ingresso "Trova i tuoi contatti").

**Attività**: schermata con spiegazione chiara + opt-in → `record_consent
('contacts_sync')` → al consenso, registra il PROPRIO hash email
(`register_contact_hash`) → lettura rubrica (`expo-contacts`, solo campo email) →
normalizza (trim/lowercase) → hash SHA-256 client → `match_contacts(hashes[])` a
batch (≤500) → lista risultati con "Aggiungi amico" / "Messaggia" (se già amici).
Stati: permesso negato (link a impostazioni OS), nessun match, loading. Revoca del
consenso: rimozione hash + stop matching.

**Rischi**: copertura del match per sola email limitata per la Gen Z (accettato:
telefono valutato in futuro); privacy: la rubrica NON lascia mai il device in chiaro
(solo hash); minori: già protetti server-side (scopribili solo da amici esistenti).

**Checklist**:
- [ ] Consenso registrato in `consents` (audit) e revocabile
- [ ] Rubrica processata a batch senza inviare dati in chiaro
- [ ] Match visibili con azioni amico/DM; bloccati esclusi
- [ ] Permesso negato/revocato gestito
- [ ] `tsc` + `eslint` puliti

**Criteri di completamento**: flusso completo con 2 account reali con email in
rubrica; verifica che un minore NON sia scopribile da un non-amico.

**Test**: manuale con account di test adulto/minore; controllo righe `contact_hashes`.

---

### CM8 — Rifiniture, scala e chiusura

**Obiettivo**: eliminare il tech-debt noto, completare la moderazione lato UI e
lasciare il modulo documentato e testabile.

**Dipendenze**: CM1–CM7 (contenuti da rifinire).

**Attività**:
- **RPC `chat_overview()`** server-side (lista conversazioni con ultimo messaggio +
  unread in una query) al posto dello scan client di 400 messaggi — misurare prima,
  applicare se serve.
- **Block/unblock UI completa**: da info DM + elenco bloccati in S10; enforcement
  server delle spunte/`last_read_at` se deciso (compromesso CM3).
- **moderate-text opzionale sull'invio** (fire-and-forget, degrada senza chiave).
- **Cron cleanup gruppi orfani** (0 membri) — R-16.
- **Audit grant vs default privileges** (scoperta CM4): il progetto hosted concede
  ALL ad anon/authenticated su ogni nuova tabella via DEFAULT PRIVILEGES → i grant
  espliciti delle migrazioni sono cosmetici, la RLS è l'unico cancello. Decidere:
  revoca sistematica per-tabella (come fatto per `message_reactions`) o revoca dei
  default a livello di schema; aggiungere invarianti pgTAP sui privilegi sensibili.
- **`voice_thread`**: unificazione definitiva con `audio` nell'UI (R-12) o semantica
  dedicata se emersa nel frattempo.
- **`docs/chat/MANUAL-TESTING.md`**: scenari end-to-end di tutto il modulo (per
  regression test manuali pre-lancio).
- Passata finale su stati loading/vuoto/errore di ogni schermata (SRS §14).

**Checklist**:
- [ ] Hub fluido con molte conversazioni (misura prima/dopo)
- [ ] Blocca/sblocca end-to-end dalla UI
- [ ] MANUAL-TESTING.md scritto e verificato una volta per intero
- [ ] Nessuno stato UI muto (loading/vuoto/errore ovunque)
- [ ] `tsc` + `eslint` puliti

**Criteri di completamento**: il modulo chat regge l'intero MANUAL-TESTING senza
sorprese; roadmap.md aggiornata (M5 chiusa).

---

## 4. Ordine e razionale

```
CM0 ──► CM1 ──► CM2 ──► CM3 ──► CM4 ──► CM5 ──► CM6 ──► CM7 ──► CM8
(live)  (fix)   (UX)   (vita)  (potenza) (media) (push) (rubrica) (chiusura)
```

- **CM0 sblocca tutto**: senza push delle migrazioni il realtime non esiste e ogni
  feature a valle degrada.
- **CM1 prima delle feature**: costruire sopra bug noti (cleared_at, blocco, GDPR)
  significherebbe rifattorizzare dopo — il piano minimizza il rework.
- **CM2 è il massimo valore percepito a costo minimo** (zero backend nuovo) e crea i
  pattern (pending/failed/dedup) riusati da media e inoltro.
- **CM3–CM4** aggiungono la "vita" (presenza/typing) e la "potenza" (edit/inoltro/
  reazioni/ricerca) — entrambe dipendono dalle fondamenta CM0–CM2.
- **CM5–CM7** sono verticali indipendenti, ordinati per valore/rischio: i media
  servono a tutti, le push richiedono device reale, la rubrica è la feature più
  sensibile (per ultima tra le nuove).
- **CM8** chiude tech-debt e documentazione: niente resta "da sistemare poi".

## 5. Rischi trasversali

| Rischio | Mitigazione |
|---|---|
| Prime migrazioni su Postgres reale | Push incrementale + fix in corsa (CM0) |
| Realtime su piano Free (limiti canali/connessioni) | 1 canale globale + 1 per conversazione aperta, cleanup rigoroso |
| Tipi mantenuti a mano (gen types = 403) | Ogni migrazione aggiorna `types/supabase.ts` nello stesso commit |
| Expo Go: push Android non supportate | Test push su iOS/dev build; non bloccare CM6 |
| Safety minori | Ogni milestone ripassa le regole d'oro (CLAUDE.md §6) prima del commit |
| Scope creep "Telegram-parity" | Le feature scartate sono elencate in SRS §19.3 — non rientrano senza decisione |

## 6. Convenzioni di implementazione (vincolanti)

- Migrazioni: `supabase/migrations/YYYYMMDDHHMMSS_dominio.sql`, header `=== … ===`
  con razionale in italiano; funzioni `security definer set search_path = ''`,
  schema-qualificate; RLS su ogni tabella nuova; grant espliciti; scritture di
  sistema solo service_role/SECURITY DEFINER; mutazioni complesse via RPC.
- Frontend: pattern hook `useChat.ts` (query key factory + throw + invalidate);
  errori mappati IT in `lib/errors.ts`; UI riusa il kit esistente; commenti in
  italiano; un commit per blocco logico.
- Ogni milestone termina con: `tsc --noEmit` pulito, `eslint` pulito, pgTAP verdi
  (se ha toccato il backend), aggiornamento di `roadmap.md`.

## 7. Definition of Done del modulo Chat

1. Tutte le milestone CM0–CM8 completate (checklist spuntate).
2. SRS Rev. 2 interamente coperta: ogni requisito ha implementazione o rinvio
   esplicito documentato (§19.3 scartati / differiti).
3. MANUAL-TESTING.md eseguito per intero su 2 device senza blocchi.
4. Regole d'oro rispettate (verifica finale dedicata: safety minori, GDPR, secrets).
