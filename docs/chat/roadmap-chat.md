# Televo — Roadmap Chat (stato vivo)

> **Documento vivo** dell'implementazione del sistema Chat. Non è la spec (quella è
> `SRS-chat.md`, fonte di verità del PRODOTTO) né il piano (`.claude/plans/…`): qui
> si traccia **cosa è FATTO e cosa MANCA**, aggiornato blocco per blocco. Fonte di
> verità dello stato = il **codice** (`mobile/`, `supabase/`). Convenzione come
> `now.md`/`roadmap.md`: italiano, date assolute.
>
> **Ultimo aggiornamento: 2026-07-01** — completati **STEP 0 (tipi)** + **Milestone 1**
> (Amicizie + DM testo con realtime) + **M2 (Note vocali effimere)** + **M3 (Gruppi/house)**.
> Verificati `tsc`/`eslint`/`expo export` puliti. **Non ancora testati a runtime** in Expo Go
> (passo utente: M3 richiede **3 account**). Due micro-migrazioni sono **da `db push`are**: la
> `chat_realtime` (M1) e la nuova `conversation_remove_member` (M3, rimozione forzata admin);
> vedi le rispettive §Backend. Il resto di M3 usa RPC già live.
>
> **➕ Blocco BACKEND MODELLO DATI §3 (D1–D4) — SCRITTO, da `db push`are.** Anticipato
> l'intero modello dati della SRS §3 (organizzazione chat, salvati, foto/media, presenza/
> privacy, rubrica) PRIMA della fase UI, per avere un backend consistente. 7 nuove
> migrazioni + tipi + pgTAP (`plan(125)`). La UII (menu S5/S16-bis, sotto-hub Importante,
> impostazioni, composer allegati…) arriva DOPO, riprendendo M5/M6/M7. Vedi §"Backend
> modello dati §3". ⚠️ Il blocco rubrica (E) è **sensibile (minori/GDPR)**: 3 decisioni di
> policy da confermare prima del rilascio.

---

## Legenda
✅ fatto e verificato (tsc/eslint/export) · 🧪 da testare a runtime · ⏳ da fare · 🔒 differito

---

## ✅ STEP 0 — Riallineamento tipi (precondizione)
Allineati `mobile/src/types/supabase.ts` e `types/index.ts` al DB reale (le query
avrebbero fallito a runtime coi tipi vecchi):
- `conversations`: `kind`→`type`, `title`→`name`, +`topic/avatar_url/dm_key/updated_at`, via `school_id`.
- `messages`: `kind`→`type`, `media_url`→`audio_url`; +tabelle `conversation_members`, `streaks`, `usage_daily`.
- `notifications`: `kind`→`type`, `data`→`payload`. `devices`: +`last_seen`.
- Firme RPC allineate: `get_or_create_dm(p_other)→jsonb`, `create_group_conversation(p_type,p_name,p_members)`,
  `add_conversation_member(p_conv,p_user)`, `leave/mark_conversation_read(p_conv)→jsonb`,
  `register_device(p_token,p_platform)`, `record_session`, `unregister_device`,
  `file_report(p_target_type,p_target_id,p_reason,p_details)`. RPC amicizia già corrette.
- `ConversationPreview` riallineata; nuovi alias Row in `types/index.ts`.

## ✅ Milestone 1a — UI Amicizie (prerequisito della DM) 🧪
La DM esiste solo tra amici accettati: prima non c'era UI amicizie, ora sì.
- `src/lib/rpc.ts` — `callRpc` condiviso (cast isolato postgrest).
- `src/lib/social.ts` — RPC amicizia (send/accept/remove/block/unblock), `openDm`, ricerca utenti, card profilo.
- `src/lib/errors.ts` — `chatErrorMessage` (codici RPC → IT).
- `src/hooks/useAmici.ts` — lista amici, richieste in/out, relazione, ricerca, mutazioni, `useApriDm`.
- `app/(main)/amici/index.tsx` — hub amici: ricerca, richieste ricevute/inviate, lista amici.
- `app/(main)/profilo/[id].tsx` — profilo altrui con azione contestuale (aggiungi/accetta/messaggia/blocca).
- Ingressi: voce "Amici" nel menu + conteggio "Amici" del profilo pressabile → `/amici`.

## ✅ Milestone 1b — DM testo (walking skeleton) 🧪
Il cuore: conversazione DM testo, realtime, spunte, unread, reply, soft-delete.
- `src/lib/chat.ts` — lista conversazioni (assemblata client-side), header, messaggi paginati, invio, soft-delete, `markConversationRead`, `previewText`.
- `src/lib/chat-realtime.ts` — sottoscrizione `postgres_changes` (messages INSERT/UPDATE + conversation_members UPDATE per spunte).
- `src/store/chatStore.ts` — bozze + reply per conversazione (Zustand).
- `src/hooks/useChat.ts` — `useConversations`, `useConversationHeader`, `useMessages` (infinite), `useSendMessage`, `useDeleteMessage`, `useMarkRead`, `useConversationRealtime`.
- Componenti: `chat/{BollaParlante,MessaggioRow,DataSeparatore,Composer,ConversazioneRow,StreakBadge}.tsx`, `ui/LoadingSpinner.tsx`.
- Rotte: `app/(main)/chat/[id].tsx` (conversazione, FlatList invertita) + hub `(tabs)/messages.tsx` riscritto.
- `src/lib/datetime.ts` — formattazione date/ore IT (no Intl, Hermes-safe).
- Decisioni applicate: spunte singola=inviato/doppia=letto; reply+soft-delete via long-press; nessun optimistic-temp (invio via riga di ritorno + dedup realtime).

### Backend — DA `db push`are
- `supabase/migrations/20260701010000_chat_realtime.sql` — aggiunge `messages`, `conversations`,
  `conversation_members` alla publication `supabase_realtime` (idempotente). **Serve per il realtime
  live**; finché non è pushata la chat funziona col refetch on-focus (nessun crash). La RLS continua a
  filtrare cosa ogni utente riceve.
- (Preesistenti, indipendenti: aura v3 `2026070100000{0,100}` restano "da push" come da `now.md`.)

### 🧪 Test a runtime da fare (Expo Go, 2 account amici)
1. Da profilo/ricerca → aggiungi amico → l'altro accetta (richieste in/out).
2. Da profilo amico → "Messaggia" → si apre/crea la DM.
3. Scambio messaggi: compaiono in tempo reale (dopo push migrazione realtime), orari, separatori data.
4. Spunte: singola all'invio, doppia quando l'altro apre; unread azzerato all'apertura; badge nella lista.
5. Long-press: Rispondi (citazione nel composer + nella bolla), Elimina (i miei → "Messaggio eliminato").
6. Lista chat ordinata per ultimo messaggio; stato vuoto/caricamento/errore.

### Note / limiti noti (da rifinire dopo)
- **Unread**: calcolato su una finestra di 400 messaggi recenti (ampiamente sufficiente all'MVP; una
  vista/RPC dedicata è ottimizzazione futura per storici lunghi — SRS §8.5).
- **Modifica messaggio**: rimandata (ora solo reply + elimina). Copia messaggio: rimandata (evita dep clipboard).
- **Gruppi**: la lista/apertura funziona ma senza nomi mittente per bolla → completati in M3.
- **Realtime hub**: la lista si aggiorna al focus + su evento della chat aperta; riordino live pieno dopo.

---


## ✅ M2 — Note vocali effimere 🧪
Registra un vocale in chat, riascoltalo in anteprima, invialo; l'altro lo riceve in
realtime e lo riproduce; scade dopo 24h. Nessun nuovo backend (il bucket privato
`voice-messages`, i grant e il trigger `expires_at≤24h` esistevano già).
- `src/lib/audio.ts` — permesso microfono, registra (`expo-av`, preset HIGH_QUALITY → `.m4a`),
  ferma (uri + durata), `uploadVocale` (byte via `fetch().arrayBuffer()` → bucket, ritorna il
  PATH), `signedUrlVocale` (URL firmato con cache 1h — bucket PRIVATO, niente URL pubblico).
- `src/lib/chat.ts` — `sendAudioMessage` (insert `type=audio`, `audio_url=path`, `expires_at=+24h`).
- `src/hooks/useChat.ts` — `useSendAudioMessage` (stesso pattern di `useSendMessage`).
- `src/components/chat/PlayerVocale.tsx` — player bolla: play/pausa, durata mm:ss, barra di
  avanzamento, badge "24h"; caricamento LAZY (firma+Sound al primo play); fallback "Vocale non
  più disponibile" se scaduto/rimosso; cleanup Sound su unmount.
- `src/components/chat/BollaParlante.tsx` — lo stub testuale "🎙️ Vocale" ora rende `PlayerVocale`.
- `src/components/chat/Composer.tsx` — microfono (idle) + tre modalità: idle / recording (timer +
  stop) / preview (riascolta → annulla/invia). Mutato/bannato resta disabilitato anche per i vocali.
- `app/(main)/chat/[id].tsx` — orchestrazione: stato registrazione/anteprima locale (non nello
  store), timer 1s, handler start/stop/discard/play/send, cleanup su uscita.
- Decisioni applicate: **tap-to-record** (SRS R-14); **player con durata** (no waveform);
  formato **`.m4a`/`audio/mp4`** (nella whitelist MIME del bucket); path privato + **signed URL**
  (mai `getPublicUrl`, che vale solo per `avatars` pubblico).

### 🧪 Test a runtime da fare (Expo Go, 2 account amici)
1. In una DM → tap microfono → registra ~5s → stop → anteprima → play (si sente) → Invia.
2. La bolla vocale compare con play/durata; sull'altro account arriva in realtime e si riproduce.
3. Anteprima nella lista chat = "🎙️ Vocale"; unread/ordinamento invariati.
4. Rispondi a un vocale (long-press) e Elimina (i miei → "Messaggio eliminato").
5. (Se possibile) scadenza 24h → il vocale sparisce; permesso microfono negato → alert, niente crash.

### Note / limiti noti
- Signed URL con TTL 1h + cache in-memory; niente waveform reale (barra lineare).
- Player senza stop-degli-altri concorrenti (ogni bolla gestisce il proprio Sound) — accettabile MVP.
- Registrazione su **iOS Simulator non supportata** da expo-av: testare su device reale/Expo Go.

## ✅ M3 — Gruppi/house 🧪
Crea un gruppo tra amici, apri la conversazione, vedi **chi ha scritto** ogni bolla,
gestisci i membri dalla schermata Info (aggiungi/rimuovi da admin, esci). Le RPC di
creazione/aggiunta/uscita esistevano già; l'unico buco backend (rimozione forzata di un
altro membro) è colmato da **una micro-migrazione** — DA `db push`are (vedi §Backend M3).
- `src/lib/chat.ts` — `ConversationHeader.members` (ruolo+profilo per group/house),
  `fetchGroupSenders` (mappa `sender_id→profilo` per i nomi nelle bolle), wrapper RPC:
  `createGroupConversation`, `addConversationMember`, `removeConversationMember`, `leaveConversation`.
- `src/hooks/useChat.ts` — `useConversationSenders` (key `senders`, enabled solo sui gruppi),
  `useCreateGroup`, `useAddMember`, `useRemoveMember`, `useLeaveConversation` (throw + invalidate).
- `app/(main)/chat/[id].tsx` — **FIX**: il nome sopra le bolle ora viene dal **mittente reale**
  (`senders.get(m.sender_id)`), non più dal peer della DM (era sbagliato con 3+ membri); anche la
  citazione (reply) usa il mittente giusto; l'icona ⓘ apre la schermata Info.
- `app/(main)/chat/nuovo-gruppo.tsx` (NUOVO) — nome opzionale + selezione multipla dalla lista amici
  (`useAmici`) → `create_group_conversation` → `router.replace` sulla chat creata.
- `app/(main)/chat/[id]/info.tsx` (NUOVO) — **DM**: profilo peer + streak + n. membri (blocca/segnala
  restano a M8). **Group/house**: lista membri con ruolo; da admin "Aggiungi membri" (amici non ancora
  nel gruppo) e "rimuovi" per membro; "Esci dal gruppo" per tutti.
- `app/(main)/(tabs)/messages.tsx` — ingresso "Nuovo gruppo" (header ✎ + riga in cima alla lista).
- `src/constants/routes.ts` — `ROUTES.nuovoGruppo`, `dynamicRoutes.chatInfo(id)`.
- Decisioni applicate: MVP crea solo `group` (house rimandata; il backend regge già entrambi);
  Info DM **minimale**; **rimozione forzata** inclusa (scelta utente) via nuova RPC admin-only.

### Backend — DA `db push`are (M3)
- `supabase/migrations/20260701020000_conversation_remove_member.sql` — `remove_conversation_member(
  p_conv, p_user)` SECURITY DEFINER: solo admin, non per DM (`cannot_remove_from_dm`), l'admin non si
  rimuove da sé (`use_leave_conversation` → usare `leave_conversation`); `delete` idempotente.
- `supabase/tests/rls_smoke.test.sql` — `plan(99)`→`plan(100)` + asserzione `has_function`.
- `src/types/supabase.ts` (+firma RPC) e `src/lib/errors.ts` (+`cannot_remove_from_dm`,
  `use_leave_conversation`) allineati.

### 🧪 Test a runtime da fare (Expo Go, 3 account amici A/B/C)
1. `supabase db push` (applica remove-member) + `supabase test db` (pgTAP verde, plan 100).
2. A → ✎/"Nuovo gruppo" → seleziona B e C → crea → si apre la chat (titolo = nome/"Gruppo").
3. A/B/C scrivono → sopra ogni bolla altrui compare il **nome giusto** del mittente; reply cita bene.
4. ⓘ → Info: lista membri con ruoli. A (admin) aggiunge D e rimuove C → C non vede più il gruppo (al
   focus). B (non admin) non vede i controlli admin. B → "Esci" → sparisce dalla sua lista.
5. DM invariata: ⓘ mostra profilo peer + streak; testo/vocali/spunte senza regressioni.

### Note / limiti noti
- **House**: creazione solo `group` in UI (backend pronto per house; toggle scuola in un blocco futuro).
- **Admin che esce / gruppo orfano**: nessun passaggio automatico del ruolo, conversazione senza membri
  resta orfana (SRS R-09/R-16, fuori M3).
- **Realtime membri**: add/remove aggiornano via invalidazione delle mutazioni + refetch on-focus per
  gli altri (INSERT/DELETE su `conversation_members` non sottoscritti — accettabile MVP).

## ✅ Backend modello dati §3 (D1–D4) — SCRITTO, da `db push`are
Anticipato l'intero modello dati della SRS §3 in 7 migrazioni additive (colonne
nullable, tabelle nuove, RPC SECURITY DEFINER) — nessuna regressione su M1–M3 (le
query attuali non selezionano le colonne nuove). **NESSUNA UI in questo blocco.**

- **A — `20260701030000_chat_org.sql` (D4 organizzazione).** Su `conversation_members`:
  `muted_until/archived_at/pinned_at/cleared_at/hidden_at` (per-utente). RPC
  `set_conversation_mute`, `set_conversation_flag` (whitelist archived/pinned/hidden,
  niente SQL dinamico), `clear_conversation_history`. **Ridefinisce** il trigger
  `messages_after_insert_notify` → ora **mute-aware** (non notifica i membri che hanno
  silenziato). ⚠️ `conversation_members.muted_until` è distinto da `profiles.muted_until`
  (mute globale di moderazione).
- **B — `20260701040000_saved_messages.sql` (D4 salvati).** Tabella `saved_messages`
  owner-only (RLS) + RPC `save_message`/`unsave_message` (salvi solo msg di tue conv).
- **C — `20260701050000_chat_media_enum.sql` + `..050100_chat_media.sql` (D3 foto).**
  Enum `message_type` +`media`; `messages.media_url/media_type`; bucket privato
  `chat-media` (specchio di `voice-messages`, RLS path `<conv>/<uid>/<file>`, membri-read).
  Grant insert esteso. (Enum in file separato per il vincolo Postgres.)
- **D — `20260701060000_chat_presence_privacy.sql` (§3.12–3.13).** `profiles.last_active_at`
  (scritto solo da RPC `touch_presence`), `show_last_seen`/`show_read_receipts` (default
  true, grant update per-colonna). Visibilità/reciprocità = enforcement di presentazione
  lato client (stile WhatsApp), gating server più stretto = affinamento futuro.
- **E — `20260701070000_contact_consent_enum.sql` + `..070100_contact_match.sql` (D1
  rubrica — SENSIBILE).** Enum `consent_type` +`contacts_sync`. Tabella `contact_hashes`
  (opt-in, solo HASH, RLS senza select → accesso solo via RPC). `register_contact_hash`
  (richiede consenso), `match_contacts(hashes[])` (cap 1000; **un minore appare solo agli
  amici**, un adulto opt-in a chi ha il suo contatto; niente coppie in blocco).
  🔴 **Da confermare prima del rilascio (isolabile/rimandabile senza toccare A–D):**
  (1) hash phone e/o email; (2) regola esatta di scopribilità minori; (3) pepe server-side.

Tipi (`mobile/src/types/supabase.ts`), errori IT (`mobile/src/lib/errors.ts`) e pgTAP
(`rls_smoke.test.sql`, `plan(100)`→`plan(125)`) allineati a mano.

### Backend — DA `db push`are (§3)
`supabase db push` applica A→E in ordine (timestamp 20260701030000→070100). Poi
`supabase test db` (pgTAP verde, plan 125). Al primo errore Postgres: leggere e correggere
la migrazione interessata (previsto — CLAUDE.md §3). Le migrazioni preesistenti "da push"
(`aura_v3`, `chat_realtime`, `conversation_remove_member`) restano tali.

## ⏳ Cosa manca (prossimi blocchi)

> **Nota:** il **backend** di M5/M6/M7(privacy+presenza)/M10 è ora SCRITTO (vedi §"Backend
> modello dati §3", da `db push`are). Di questi blocchi resta solo la **fase UI + client**.

- **M4 — Notifiche push**: `expo-notifications` → `register_device`, deep link → `chat/[id]`, tab notifiche,
  badge unread sulla tab. Backend trigger già pronto.
- ~~**M5 — Organizzazione chat (UI)**~~ ✅ **FATTO 🧪** — *backend blocco A/B §3, `db push`ato*.
  `lib/chat.ts`: `fetchConversations(view)` filtra archived/hidden e ordina pinned-first, rispetta
  `cleared_at` nell'unread; wrapper RPC organizzazione + `fetchSavedMessages`. `useChat.ts`:
  `useConversationOrg` (mute/flag/clear), `useSaveMessage`, `useSavedMessages`, `useConversations(view)`.
  UI: menu contestuale conv su long-press (S16-bis: silenzia con durata/fissa/archivia/segna letto/
  elimina→DM hidden, gruppo leave) + indicatori mute/pin in `ConversazioneRow`; menu overflow hub
  (S6→Importante); menu overflow chat (S5: silenzia/cancella cronologia/elimina) in `chat/[id]`; azione
  "Salva" nel menu messaggio (S16); nuovo schermo `messaggi/importante.tsx` con 3 tab (Salvati S7/
  Archiviati S8/Silenziati S9). `Card` estesa con `onLongPress`. tsc/eslint/expo export puliti.
- **M6 — Foto/media (UI)** — *backend fatto (blocco C §3)*: `expo-image-picker` (installato) → upload
  `chat-media` (signed URL come i vocali) → insert `type='media'`; bolla thumbnail + viewer S14c.
- **M7 — Presenza + privacy (UI)** — *backend fatto (blocco D §3)*: heartbeat `touch_presence` in foreground,
  header "ultimo accesso" rispettando `show_last_seen`; `messaggi/impostazioni.tsx` con i due toggle;
  presentazione spunte gated su `show_read_receipts`.
- **M8 — Moderazione/safety in chat**: segnala (`file_report`), blocca da Info, composer disabilitato per
  mutati/bannati; effetto blocco su DM.
- **M9 — Rifiniture**: ricerca globale/in-chat, prop da messaggio (Aura), Drops strip nell'hub.
- **M10 — Contatti da rubrica (UI, ULTIMA FASE)** — *schema fatto (blocco E §3, SENSIBILE)*: prima
  confermare le 3 decisioni di policy (§blocco E); poi `expo-contacts` (da installare) → hashing locale →
  `register_contact_hash`/`match_contacts` → schermata `messaggi/contatti.tsx`. Cautela minori/GDPR.

## 🔒 Differiti (fuori dall'arco chat)
- Chiamata audio 1:1 (LiveKit + EAS Dev Build) · Moderazione AI testo (Perspective) · Cambia sfondo.

---

## Verifica per ogni blocco
`npx tsc --noEmit` + `npx eslint .` + `npx expo export` puliti; poi runtime in Expo Go (2 account).
Per i blocchi con nuovo backend: `supabase db push` + `supabase test db` (pgTAP), aggiornando `plan(N)`.
