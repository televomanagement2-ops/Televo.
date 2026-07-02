# Televo — Sistema Chat — Specifica Funzionale Completa (SRS)

> **Documento di specifica.** Questa è la Software Requirements Specification (SRS)
> del sistema di Chat di Televo. Ricostruisce il 100% dei requisiti (espliciti +
> impliciti) a partire da due schizzi ad alto livello e li mappa con precisione sul
> backend Supabase già live, segnalando ogni gap che richiede nuovo backend.
> Obiettivo: uno sviluppatore deve poter costruire l'intera chat leggendo solo questo
> documento. Questa fase **non** contiene codice, migrazioni o API: definisce il
> prodotto. L'implementazione tecnica verrà pianificata dopo la validazione.
>
> **Stato**: **Revisione 2 — validata** (2026-07-02). La Rev. 2 fotografa lo stato
> reale del codice (backend chat quasi completo, frontend ~70%), chiude tutte le
> decisioni aperte (§17), aggiunge i **Requisiti di completezza moderna** (§19,
> riferimento: Telegram per maturità funzionale, non per design) e rimanda
> l'esecuzione a `docs/chat/IMPLEMENTATION-PLAN.md` (roadmap ufficiale CM0–CM8).
> Vedi Revision history in fondo.

---

## Context (perché esiste questo documento)

Televo è un social mobile-first per Gen Z (16+), lancio invite-only a Terni
(settembre 2026), costruito su tre pilastri: **Proof of Human**, **Aura**
(reputazione vivente), **Anti-doomscroll by design**. Il backend è **live** su
Supabase hosted e copre già gran parte del dominio chat (conversazioni, messaggi,
vocali effimeri, streak, amicizie, notifiche, moderazione).

> **Aggiornamento Rev. 2 (2026-07-02)**: lo stato descritto sotto ("tab Messaggi =
> ComingSoon, stub vuoti") era vero alla Rev. 1 ed è **superato**. Oggi: (a) il
> backend chat è quasi completo — 9 migrazioni dedicate (realtime publication,
> organizzazione D4, salvati, media D3, presenza/privacy, contatti D1) sono scritte
> in locale ma **non ancora applicate al DB live** (milestone CM0); (b) il frontend
> copre ~70% di questa SRS: hub S1, conversazione S2/S3 (testo + vocali effimeri,
> reply, spunte DM, soft-delete, realtime per-conversazione), S4, S7/S8/S9, S13.
> La fotografia completa e i difetti noti sono in
> `docs/chat/IMPLEMENTATION-PLAN.md` §1.

L'utente ha fornito due schizzi ad alto livello del sistema chat (Sketch 1 = hub
Messaggi; Sketch 2 = schermata conversazione). L'obiettivo di questo documento è
**estrarre il 100% dei requisiti** (espliciti + impliciti) e ricostruire l'intero
sistema chat che logicamente sta dietro agli schizzi, mappandolo con precisione sul
backend esistente e segnalando ogni **gap** che richiede nuovo backend. Il fine: uno
sviluppatore deve poter costruire l'intera chat leggendo solo questo documento.
Priorità dichiarata dall'utente: **prima la cosa che funziona**, il design fine dopo;
massima coerenza del sistema.

### Decisioni di scope confermate dall'utente (input diretto)

| # | Domanda | Decisione |
|---|---------|-----------|
| D1 | "I tuoi contatti su Televo" | **Rubrica del telefono**: match address-book ↔ utenti Televo. Richiede NUOVO backend (matching per numero/email) + `expo-contacts`. Il telefono era stato rimosso dall'auth: va reintrodotto un dato di contatto per il match. |
| D2 | Chiamata audio (☎ header chat) | **Differita** (come Stanze Live): dipende da LiveKit + Development Build. Requisito documentato ma marcato *differito*; pulsante visibile ma disabilitato/"presto". |
| D3 | Tipi di messaggio | **Testo + vocali effimeri + foto/media**. I media (immagini/file) richiedono NUOVO backend (colonna media + bucket storage + RLS). |
| D4 | Funzioni organizzative (Silenzia, Archivia, Salvati, Cancella cronologia, Elimina chat, toggle ultimo accesso/spunte) | **Requisiti completi con persistenza server-side** (multi-device). Per ognuna si specifica la nuova tabella/colonna backend necessaria. |
| D5 *(Rev. 2)* | Reazioni emoji ai messaggi | **SÌ** (decisione utente 2026-07-02): set curato di emoji, 1 reazione per utente per messaggio, visibili solo ai membri della conversazione (nessun contatore pubblico → coerente con l'anti-vanity). Il **prop** resta il gesto "forte" separato che alimenta l'Aura. Nuovo backend `message_reactions` (§19 RC-07). |
| D6 *(Rev. 2)* | Identificatore per il match rubrica (chiude R-01) | **Solo hash EMAIL per ora**: l'email esiste già per ogni account, zero attrito. Il telefono NON viene reintrodotto (valutabile in futuro). Il backend `match_contacts` supporta già entrambi i tipi di hash. |
| D7 *(Rev. 2)* | Applicazione migrazioni pendenti al DB live | Le 11 migrazioni locali non ancora `db push`ate (Aura v3 23–24 + chat 25–33; la 22 onboarding è già live) vengono applicate da Claude nella milestone **CM0** con verifica pgTAP e fix in corsa. |

---

## 0. Meta

### 0.1 Scopo
Definire in modo esaustivo il comportamento funzionale del sistema Chat di Televo:
schermate, elementi, stati, flussi, dati letti/scritti, dipendenze, permessi, casi
limite, relazioni con il backend e con gli altri domini (Aura, amicizie, moderazione,
notifiche, streak). NON è un documento di design visivo né di architettura tecnica.

### 0.2 Ambito
- **In scope (costruibile ora, gira in Expo Go)**: hub Messaggi, DM 1:1, chat di
  gruppo, chat "house" (scuola), invio/lettura messaggi testo, note vocali effimere,
  reply, soft-delete, spunte di lettura, unread/badge, realtime, streak, ricerca,
  organizzazione chat (silenzia/archivia/salvati/cancella cronologia/elimina),
  impostazioni privacy (ultimo accesso, spunte), segnalazione/blocco, dai-prop da
  messaggio, notifiche push, foto/media (con estensione backend).
- **Differito** (richiede Dev Build / dipendenze native / chiavi): chiamata audio 1:1
  (LiveKit), "cambia sfondo" (indicato dall'utente "non implementare per ora"),
  moderazione AI testo (Perspective, degrada con grazia).
- **Fuori scope**: design visivo definitivo, animazioni fini, temi.

### 0.3 Fonti
1. **Sketch 1** — hub "Messaggi" (organizzazione, Drops preview, elenco messaggi,
   contatti su Televo, permessi Contatti/Notifiche).
2. **Sketch 2** — schermata "CHAT" (header con back/username/ultimo accesso/☎/ⓘ,
   menu overflow, separatori data, bolle con orario, vocali, allegati).
3. **Backend** (migrazioni verificate): `160100_conversations`, `160200_messages`,
   `160300_streaks`, `160000_social_friendships`, `180000_notifications`,
   `190000_moderation`, `170000_map` (presence).
4. **Frontend** (`mobile/`): pattern dati (`useProfilo`, `useAura`), tipi
   (`types/supabase.ts`, `types/index.ts`), UI riusabile, navigazione.

### 0.4 Pubblico
Sviluppatori mobile e backend Televo; l'utente (product owner) per validazione.

### 0.5 Glossario
- **Conversazione**: contenitore di messaggi. Tipi: `dm` (1:1), `group` (gruppo tra
  amici), `house` (comunità di scuola).
- **DM**: conversazione 1:1, ammessa **solo tra amici accettati**, una sola per coppia.
- **Membro / Admin**: `conversation_members.role ∈ {member, admin}`.
- **Vocale effimero**: messaggio audio con `expires_at` ≤ 24h.
- **Ultimo accesso**: "last seen" dell'utente — **oggi non esiste nel backend** (gap).
- **Spunte di lettura**: indicatore "letto" basato su `conversation_members.last_read_at`.
- **Streak**: giorni consecutivi di attività *per conversazione*, con "freeze".
- **Prop**: riconoscimento peer-to-peer che alimenta l'Aura; può partire da un messaggio.
- **Drop**: contenuto effimero 24h (dominio separato); nell'hub compaiono come preview.
- **Rubrica / Contatti su Televo**: match tra address-book del telefono e utenti Televo.

### 0.6 Convenzioni
Codice e commenti **in italiano**. TypeScript strict, alias `@/`. Mutazioni delicate
via RPC/Edge (il client non scrive tabelle di sistema). Safety minori e GDPR sono
requisiti di prodotto (§10, §11).

---

## 1. Panoramica del sistema e contesto

### 1.1 La chat nei tre pilastri
- **Proof of Human**: la chat privilegia presenza reale — vocali (voce vera, effimera),
  streak sane, niente vetrine. La voce dei minori **non è mai pubblica**.
- **Aura**: le interazioni in chat alimentano la reputazione — accettare amicizie
  (`welcoming`), dare prop da un messaggio (`kindness` al donatore), streak/consistenza;
  la tossicità (moderazione) la abbassa. La chat **non** ha vanity-count.
- **Anti-doomscroll**: niente feed infinito nella chat; i vocali scadono (24h);
  l'uso compulsivo (`record_session` > 3h) abbassa l'Aura. Le streak non puniscono.

### 1.2 Attori (ruoli)
| Attore | Descrizione | Capacità chiave |
|--------|-------------|-----------------|
| Utente autenticato | Sessione valida + onboarding completo (`age_verified`) | Vede le proprie conversazioni, invia messaggi |
| Amico | Coppia `friendships.status = accepted` | Può aprire DM, essere aggiunto a gruppi |
| Membro conversazione | Riga in `conversation_members` | Legge/scrive nella conversazione |
| Admin gruppo/house | `role = admin` | Aggiunge membri, (gestione gruppo) |
| Utente bloccato/che blocca | `friendships.status = blocked` | Non può creare nuove DM con la controparte |
| Utente mutato (moderazione) | `profiles.muted_until > now()` | Può leggere, **non** inviare |
| Utente bannato | `profiles.banned_at not null` | Può leggere, **non** inviare |
| Moderatore | `is_moderator()` | Segnalazioni, azioni di moderazione |
| Sistema | Trigger/cron/Edge | Notifiche, streak, expire, Aura |

### 1.3 Vincoli non-negoziabili (safety minori + GDPR)
- Age-gate ≥16 (già imposto). DM **solo tra amici accettati**.
- Voce dei minori **mai pubblica**: bucket `voice-messages` privato, RLS path-based
  (`<conversation_id>/<user_id>/<file>`), accesso ai soli membri.
- Media (foto) — quando aggiunti — devono seguire lo stesso principio (bucket privato,
  RLS per membri).
- Segreti/chiavi mai nel client. Mutazioni via RPC/Edge.

### 1.4 Dipendenze native e ambiente
- **Gira in Expo Go** (in scope ora): testo, vocali (registrazione con `expo-av`
  installato), realtime, tutta l'organizzazione, foto/media (con `expo-image-picker`
  da installare).
- **Richiede Development Build EAS**: chiamata audio (LiveKit — **differita**).
- **Richiede permesso runtime**: Contatti (`expo-contacts` da installare),
  Notifiche (`expo-notifications` installato).

---

## 2. Discrepanze BACKEND ↔ FRONTEND — ✅ RISOLTA (Rev. 2)

La precondizione della Rev. 1 (tipi `mobile/src/types/supabase.ts` divergenti dal DB:
`kind`/`title`/`media_url`, RPC con firme sbagliate, `conversation_members` assente) è
stata **completamente risolta**: i tipi sono oggi allineati alle migrazioni reali
(colonne `type`/`name`/`audio_url`+`media_url`, RPC `jsonb {ok,…}`, tabelle
`conversation_members`, `streaks`, `saved_messages` tipizzate). Resta valida la regola
operativa qui sotto.

> **Nota**: il progetto è su piano Supabase Free → `supabase gen types` dà 403, quindi
> i tipi si mantengono **a mano**. Ogni nuova colonna/tabella backend introdotta da
> questo documento va riflessa a mano in `types/supabase.ts`.

---

## 3. Modello dati di prodotto (mappato al backend)

Per ogni entità: com'è vista dal prodotto, dove vive nel backend, e i campi NUOVI
richiesti dalle decisioni D1–D4.

> **Nota Rev. 2**: i campi/tabelle marcati "NUOVO" in questa sezione sono stati nel
> frattempo **implementati** (migrazioni del 2026-07-01: `chat_org`,
> `saved_messages`, `chat_media`, `chat_presence_privacy`, `contact_match` — in
> attesa di `db push`, milestone CM0). Lo stato aggiornato è nella tabella §16.
> Restano da creare solo: `edited_at`, `forwarded_from`, `message_reactions`, FTS
> (§19).

### 3.1 Conversation
- Backend: `conversations(id, type, name, topic, avatar_url, dm_key, created_by,
  created_at, updated_at)`.
- Prodotto: una chat. `type=dm` → titolo/avatar derivati dal *peer*; `group/house` →
  `name`/`avatar_url` propri.
- Ordinamento lista: per `updated_at desc` (bumpato da ogni messaggio via trigger).
- NUOVO (D4): nessun campo nuovo sulla conversazione stessa (mute/archive/pin/cleared
  sono **per-utente** → vanno su `conversation_members`, §3.2).

### 3.2 ConversationMember
- Backend: `conversation_members(conversation_id, user_id, role[admin|member],
  joined_at, last_read_at)`.
- Prodotto: relazione utente↔conversazione; `last_read_at` è la base di unread e spunte.
- NUOVO (D4), per-utente e per-conversazione:
  - `muted_until timestamptz null` — silenzia (sopprime notifiche/badge sonoro).
  - `archived_at timestamptz null` — archiviata (fuori dalla lista principale).
  - `pinned_at timestamptz null` — chat fissata in cima (vedi §17 R-07: da confermare).
  - `cleared_at timestamptz null` — "cancella cronologia": nascondi i messaggi con
    `created_at ≤ cleared_at` **solo per questo utente**.
  - `hidden_at timestamptz null` — "elimina chat" per DM (nasconde la conversazione
    dalla lista senza distruggere i dati dell'altro; vedi §7.5).

### 3.3 Message
- Backend: `messages(id, conversation_id, sender_id, type, body, audio_url, reply_to,
  expires_at, created_at, deleted_at)`. Trigger forza `sender_id`, membership, expiry
  (≤24h), reply-to stessa conversazione; bump `updated_at`; streak; notifica.
- Grant insert: `(conversation_id, type, body, audio_url, reply_to, expires_at)`.
- Grant update: `(body, deleted_at)` → edit del proprio testo + soft-delete.
- NUOVO (D3, foto/media): `media_url text null` + `media_type text null` (es.
  `image`) su `messages`, oppure tabella `message_attachments(message_id, url,
  mime, width, height, size)`. Aggiungere `media` all'enum `message_type` o usare
  `type='media'`. Nuovo bucket storage `chat-media` con RLS analoga a `voice-messages`.
  Aggiornare grant insert per includere le nuove colonne. (Da progettare in fase impl.)

### 3.4 Attachment / Media (NUOVO — D3)
- Foto e (opzionale) file. Bucket privato `chat-media`, path
  `<conversation_id>/<user_id>/<file>`, RLS: read = membri, write = propria cartella +
  membro, delete = proprietario (specchio di `voice-messages`).

### 3.5 VoiceNote (vocale effimero)
- È un `message` con `type ∈ {audio, voice_thread}`, `audio_url` valorizzato,
  `expires_at ≤ now()+24h`. File nel bucket `voice-messages`.
- `voice_thread` = interpretazione: "vocale drop-in" effimero (thread di voce). Da
  confermare la differenza semantica con `audio` (§17 R-12).
- Cleanup: `expire_content()` (cron 5 min) elimina/oscura gli scaduti.

### 3.6 ReadState & spunte
- `conversation_members.last_read_at`. Un messaggio `m` è "letto" dall'altro se
  `peer.last_read_at ≥ m.created_at`. In DM → doppia spunta; in gruppo → "letto da N".
- `mark_conversation_read(p_conv)` aggiorna `last_read_at = now()`.

### 3.7 Streak
- `streaks(conversation_id PK, current_streak, longest_streak, last_activity_date,
  freezes_available[0..2], updated_at)`. `touch_streak` chiamato da trigger su ogni
  messaggio. Freeze salvano la striscia; reset senza penalità. Bonus freeze ogni 7gg.
- `usage_daily(user_id, day, active_seconds, compulsive_flagged)` + `record_session`.

### 3.8 Friendship / Block
- `friendships(user_id<friend_id, requested_by, status[pending|accepted|blocked],
  blocked_by, ...)`. RPC: `send/accept/remove_friend`, `block/unblock_user`. Helper
  `are_friends`, `is_blocked_pair`. `top_friends` (cerchia 1–8).
- Effetto su chat: DM ammessa solo se `are_friends`. Blocco **non** cancella DM
  esistenti (gap comportamentale, §7.5 / §17 R-05).

### 3.9 Contact match (NUOVO — D1)
- Obiettivo: "I tuoi contatti su Televo" = intersezione address-book ↔ utenti Televo.
- Richiede: (a) reintrodurre un identificatore di contatto (telefono e/o email) sul
  profilo/riservato; (b) `expo-contacts` per leggere la rubrica; (c) matching lato
  server con **hash** privacy-safe (mai inviare rubrica in chiaro; mai esporre chi è
  su Televo a chi non lo conosce). Tabella nuova ipotizzata: `contact_hashes(user_id,
  phone_hash/email_hash)`; RPC `match_contacts(hashes[])`. Vincoli minori e GDPR forti
  (§10.1, §17 R-01). **Feature nuova e sensibile: massima cautela.**

### 3.10 Notification
- `notifications(user_id, type[friend_request|friend_accepted|message|prop|achievement],
  title, body, payload, read_at, pushed_at, created_at)`; `devices`. Trigger
  `messages_after_insert_notify` accoda per tutti i membri tranne il mittente.
  `dispatch_push` (cron 1 min) → Edge `send-push`.
- NUOVO (D4 mute): il trigger di notifica messaggi deve diventare **mute-aware**
  (non accodare/non pushare ai membri con `muted_until > now()`), §9.3.

### 3.11 Saved / Archive / Mute / Pin / Cleared (NUOVO — D4)
- **Messaggi salvati**: tabella nuova `saved_messages(user_id, message_id, created_at)`
  (bookmark personale, cross-conversazione). RLS owner-only. Vista "Importante →
  Salvati".
- **Archiviati / Silenziati / Fissate / Cancella cronologia / Elimina**: campi su
  `conversation_members` (§3.2).

### 3.12 Settings (privacy chat)
- **Toggle ultimo accesso** e **toggle spunte di lettura**: preferenze utente. NUOVO
  backend: colonne su `profiles` (o tabella `user_settings`): `show_last_seen boolean`,
  `show_read_receipts boolean`. Semantica di reciprocità (se lo nascondi non lo vedi)
  da confermare (§17 R-03). "Ultimo accesso" richiede inoltre l'infrastruttura di
  presenza (§3.13), oggi assente.

### 3.13 Presenza / "ultimo accesso" (NUOVO — gap)
- **Non esiste** un "online"/"last seen" persistente. `live_presence` è effimero
  (15 min, geohash, opt-in, friends-only, per la Mappa). `devices.last_seen` è ora di
  registrazione device.
- Per implementare "ultimo accesso" serve NUOVO: `profiles.last_active_at` aggiornato
  su azioni (o heartbeat), con rispetto del toggle privacy (§3.12) e safety minori.
  Alternativa MVP: mostrare stato "online ora" solo via Realtime presence (canale),
  senza persistere storico. Da confermare (§17 R-02).

---

## 4. Architettura dell'informazione e navigazione

### 4.1 Gerarchia schermate
```
(main) [guard: autenticato + onboarded]
├─ (tabs)
│  ├─ messages           → S1  Hub Messaggi (lista chat)         [TAB]
│  ├─ notifiche          → (M8) tab notifiche
│  └─ … (home, crea, menu)
├─ chat/[id]             → S2/S3  Conversazione (DM o gruppo)     [STACK]
├─ chat/nuovo-gruppo     → S4  Creazione gruppo                  [STACK]
├─ chat/[id]/info        → S13 Info conversazione / membri       [STACK]
├─ chat/[id]/cerca       → S12b Ricerca dentro la chat           [STACK]
├─ messaggi/importante   → S6→S7/S8/S9 (Salvati/Archiviati/Silenziati) [STACK]
├─ messaggi/impostazioni → S10 Impostazioni chat                 [STACK]
├─ messaggi/contatti     → S11 Contatti su Televo (rubrica)      [STACK]
└─ cerca (esistente)     → S12a Ricerca globale (riuso)          [STACK]
```
Coerente con il pattern esistente: le **tab** sono hub, i **dettagli** sono rotte stack
sopra le tab (come `profilo`, `cerca`). `dynamicRoutes.chat(id)` esiste già.

### 4.2 Grafo di navigazione (come si raggiunge cosa)
- **Hub Messaggi (S1)**: dalla BottomBar (tab "messages").
- **Conversazione (S2/S3)**: tap su una riga della lista (S1) → `router.push(chat(id))`;
  oppure da "Contatti su Televo" (S11) → `get_or_create_dm` → push; oppure da profilo
  utente ("Messaggia") → DM; oppure da notifica push (deep link `payload.conversation_id`).
- **Nuovo gruppo (S4)**: da menu overflow hub (S6 → "Nuovo gruppo").
- **Importante (S7/S8/S9)**: da menu overflow hub (S6 → "Importante").
- **Impostazioni chat (S10)**: da menu overflow hub (S6 → "Impostazioni").
- **Info conversazione (S13)**: dall'header chat (icona ⓘ).
- **Ricerca nella chat (S12b)**: da menu overflow chat (S5 → "Cerca").
- **Menu contestuale messaggio (S16)**: long-press su una bolla.

### 4.3 Uscite (back)
Ogni schermata stack ha back (`router.back()`), pattern header come `cerca.tsx`.

---

## 5. Specifica schermata per schermata

> Formato per ogni elemento: **cos'è**, **perché esiste**, **interazioni**, **dati
> letti**, **dati scritti/backend**, **stati**, **permessi**, **casi limite**.

### S1 — Hub "Messaggi" (lista chat) — *da Sketch 1*
**Rotta**: `(main)/(tabs)/messages.tsx` (sostituisce l'attuale ComingSoon).
**Scopo**: punto d'ingresso a tutte le conversazioni + organizzazione + scoperta.

**Regioni (dall'alto):**
1. **Header** — titolo/wordmark "Televo" + **icona ricerca** (→ S12a) + **icona menu
   overflow** (⋮/kebab → S6). *(Nello sketch "Televo :" con la graffa è il menu di
   organizzazione.)*
2. **Drops strip** — *da Sketch 1 "Drops (previews con formato piccolo)"*. Striscia
   orizzontale di preview drop (avatar + username), formato piccolo (stile "storie").
   - Perché esiste: portare la scoperta effimera dentro l'hub sociale.
   - Interazioni: tap su una preview → apre il drop (dominio Drops, M6). **M6 non è
     costruito** → in questa fase la striscia è un **placeholder** o si nasconde se
     vuota (§17 R-08). Dati: `drops` audience friends/school (backend esiste).
3. **Sezione "Messaggi"** — *da Sketch 1 "(elenco contatti + messaggi)"*. Lista delle
   conversazioni dell'utente, ordinata per `updated_at desc`.
   - Ogni **riga conversazione** mostra: avatar (peer per DM / gruppo), titolo (nome
     peer per DM, `name` per gruppo), **anteprima ultimo messaggio** (testo troncato o
     "🎙️ Vocale" / "📷 Foto"), **orario** ultimo messaggio, **badge unread** (conteggio),
     indicatori: **silenziata** (icona mute), **fissata** (pin), **streak** (🔥 se attiva).
   - Interazioni: tap → apre conversazione (S2/S3); **long-press** → azioni rapide
     (Silenzia/Archivia/Fissa/Elimina, vedi §5 S16-bis / menu contestuale conversazione).
4. **Sezione "I tuoi contatti su Televo"** — *da Sketch 1* (D1 = rubrica). Elenco degli
   amici/contatti con cui iniziare una chat (dettaglio in S11; qui può comparire un
   ingresso "Trova i tuoi contatti" o una lista rapida).

**Dati letti (backend)**: `conversations` (membro, via RLS) + `conversation_members`
(role, last_read_at, muted/archived/pinned) + ultimo `messages` per conversazione +
conteggio unread (messaggi con `created_at > last_read_at` non propri) + `streaks` +
profili peer. Filtri client: escludere archiviate (vanno in S8) e `hidden_at`.
**Dati scritti**: nessuno diretto (le azioni passano da S16-bis / RPC).
**Stati**: loading (skeleton, riuso `FeedSkeleton`); vuoto ("Nessuna chat ancora —
inizia da un amico", CTA → S11); errore (retry).
**Permessi**: nessuno per la lista; **Notifiche** e **Contatti** richiesti
contestualmente (§10). **Realtime**: sottoscrizione per aggiornare anteprime/unread in
tempo reale (§8).
**Casi limite**: conversazione senza messaggi (appena creata DM) → mostrare comunque la
riga con "Nessun messaggio"; peer con account cancellato/anonimizzato (GDPR) → mostrare
"Utente non disponibile"; conversazione con solo messaggi scaduti/cancellati → anteprima
"Messaggio non più disponibile".

**Menu overflow dell'hub (S6)** — *da Sketch 1, la graffa "Televo :"*:
- **Nuovo gruppo** → S4.
- **Importante** → sotto-hub con **Messaggi salvati** (S7), **Archiviati** (S8),
  **Silenziati** (S9).
- **Impostazioni** → S10 (ultimo accesso, spunte lettura, …).

### S2 — Conversazione DM (dettaglio) — *da Sketch 2*
**Rotta**: `(main)/chat/[id].tsx`.
**Scopo**: leggere e inviare messaggi in una DM.

**Header** (*da Sketch 2: "← ① username [ultimo accesso] ☎ ⓘ?"*):
- **← Back** → `router.back()` (torna a S1).
- **Avatar + Username** del peer → tap apre S13 (info) o profilo peer (`profilo/[id]`).
- **Ultimo accesso** (sotto il nome): "online" / "ultimo accesso alle …". **Gap**:
  richiede §3.13 (nuovo). Rispetta il toggle privacy (§3.12). Se non disponibile →
  nascondere la riga.
- **☎ Chiamata** (audio): **DIFFERITA (D2)**. Pulsante visibile ma disabilitato/"presto"
  (LiveKit + Dev Build).
- **ⓘ Info / menu (⋮)** → apre S13 (info) e/o menu overflow chat (S5).

**Menu overflow chat (S5)** — *da Sketch 2, la graffa*:
- **Silenzia** → set `conversation_members.muted_until` (toggle; scelte durata: 8h/1
  settimana/sempre — §17 R-06). Sopprime notifiche (§9.3).
- **Cerca** (nella chat) → S12b.
- **Cambia sfondo** → **DIFFERITO** ("non implementare per ora" — annotazione utente).
- **Cancella cronologia** → set `cleared_at = now()` (nasconde i messaggi precedenti
  **solo per me**). Conferma distruttiva. *(Sketch: "ora?" = da quale momento; MVP = tutta.)*
- **Elimina chat** → per DM: `hidden_at = now()` (nasconde dalla lista; ricompare se
  arriva un nuovo messaggio, §7.5); conferma distruttiva. *(Semantica DM vs gruppo, §7.5.)*
- (Impliciti coerenti) **Blocca utente** e **Segnala** → §11 (di norma nel menu chat/info).

**Corpo messaggi** (*da Sketch 2: "DATA MESSAGGI", bolle "messaggio + orario", ①…④
vocale, allegati*):
- **Separatori data** ("Oggi", "Ieri", data) tra gruppi di messaggi per giorno.
- **Bolle messaggio**: allineamento a destra (miei) / sinistra (peer). Contengono:
  contenuto (testo / vocale player / foto), **orario** (`created_at`), **spunte di
  lettura** sui miei (singola=inviato, doppia=letto quando `peer.last_read_at ≥
  created_at`), indicatore "modificato" se editato, indicatore "risposta a" se `reply_to`.
- **Tipi contenuto** (D3): **testo** (①), **vocale** (④, player con durata/waveform,
  badge "effimero 24h" se `expires_at`), **foto/media** (thumbnail → viewer S14c).
- **Reply-to**: bolla mostra citazione del messaggio citato; tap → scrolla all'originale.
- **Messaggio cancellato** (soft-delete): il mittente vede il proprio come "eliminato";
  gli altri non lo vedono (RLS). Placeholder "Messaggio eliminato" opzionale.
- **Long-press bolla** → menu contestuale messaggio (S16).
- Paginazione infinita all'indietro (§8.3); auto-scroll all'ultimo all'apertura e su
  nuovo messaggio se sei in fondo.

**Composer** (barra in basso) — *implicito ma necessario*:
- Campo testo multilinea; **invio** (→ insert `messages` type text).
- **Microfono**: registra vocale (`expo-av`) → upload bucket `voice-messages` →
  insert `messages` type audio con `expires_at`. Stati: idle/registrando/anteprima/invio.
- **Allegato** (D3): apre picker (`expo-image-picker`) → upload `chat-media` → insert
  media. Stati upload (progress, errore, retry).
- **Barra risposta**: se stai rispondendo, mostra citazione + X per annullare.

**Dati letti**: `messages` (RLS membro, non cancellati o miei), `conversation_members`
(peer `last_read_at` per spunte), `streaks` (badge), profilo peer.
**Dati scritti / backend**: insert `messages`; `mark_conversation_read(p_conv)`
all'apertura e a ogni nuovo messaggio visto; upload storage; `touch_streak`
(automatico via trigger); notifiche (automatico); prop da messaggio (S16, opzionale).
**Stati**: loading (skeleton bolle); vuoto ("Nessun messaggio — scrivi per primo");
errore fetch (retry); errore invio (bolla con stato "non inviato" + retry/optimistic).
**Permessi**: membro della conversazione (RLS); mittente **attivo** (`is_active_user`)
per inviare — se mutato/bannato il composer è disabilitato con avviso (§11.4);
Microfono (permesso OS) per vocali; Foto/Media (permesso OS) per allegati.
**Casi limite**: DM con non-più-amico (rimosso/bloccato dopo la creazione) → la DM resta
ma **non puoi creare nuova**; l'invio in DM con blocco attivo va gestito (§17 R-05);
vocale scaduto mentre sei in chat → sparisce/oscura; messaggio in arrivo mentre scrolli
in alto → non forzare lo scroll, mostra "nuovo messaggio ↓".

### S3 — Conversazione di gruppo / house (differenze rispetto a S2)
- Header: avatar/`name` del gruppo (o composito); tap → S13 con **elenco membri**.
- Bolle: mostrano **nome mittente** sopra il testo (multi-utente); spunte = "letto da N".
- Menu overflow aggiunge: **Aggiungi membri** (solo admin → `add_conversation_member`:
  group=amici, house=amici o **stessa scuola**), **Esci dal gruppo** (`leave_conversation`).
- "Elimina chat" per gruppo = **esci** (non nascondi): semantica diversa dal DM (§7.5).
- Casi limite: ultimo membro che esce; admin che esce (passaggio ruolo? §17 R-09);
  aggiunta di non-idoneo → RPC solleva `not_allowed`.

### S4 — Nuovo gruppo (creazione) — *da Sketch 1 "nuovo gruppo"*
**Rotta**: `(main)/chat/nuovo-gruppo.tsx`.
**Flusso**: (1) scegli tipo (`group` tra amici / `house` per scuola) — o default group;
(2) seleziona membri da **lista amici** (per house anche compagni di scuola); (3) nome
(opzionale) + avatar (opzionale); (4) crea → `create_group_conversation(p_type, p_name,
p_members[])` → push su S3 con `conversation_id` restituito.
**Dati letti**: amici accettati (`friendships`), eventualmente compagni di scuola
(`profiles.school_id`). **Scritti**: RPC crea conversazione + membri (creatore admin).
**Stati**: selezione vuota (crea comunque solo-me? §17 R-10); errore RPC.
**Permessi**: creatore **attivo** (`is_active_user`). **Casi limite**: membri non amici
ignorati/skippati dalla RPC; nome vuoto → salvato NULL (titolo derivato dai membri).

### S5 — Menu overflow chat → vedi S2 (elenco voci sopra).
### S6 — Menu overflow hub → vedi S1 (Nuovo gruppo / Importante / Impostazioni).

### S7 — Importante → **Messaggi salvati**
Lista dei messaggi che l'utente ha **salvato** (bookmark), cross-conversazione, più
recenti in cima. Ogni riga: contenuto + conversazione d'origine + tap → apre la chat allo
specifico messaggio. **Backend NUOVO** (`saved_messages`, §3.11). Azione "Salva"/"Rimuovi"
da S16. Stati: vuoto/loading/errore. Permessi: owner-only.

### S8 — Importante → **Archiviati**
Lista delle conversazioni con `archived_at not null`. Riaprendone una / ricevendo un
nuovo messaggio → torna attiva (de-archivia, §17 R-11). Azione da S1 long-press o da qui.
Backend NUOVO (`conversation_members.archived_at`). Stati/permessi come S1.

### S9 — Importante → **Silenziati**
Lista delle conversazioni con `muted_until > now()`. Da qui si può togliere il silenzio.
Backend NUOVO (`conversation_members.muted_until`). Nota: silenziare **non** archivia.

### S10 — Impostazioni chat — *da Sketch 1 "Impostaz. → ultimo accesso, spunte lettura"*
**Rotta**: `(main)/messaggi/impostazioni.tsx`. Toggle:
- **Ultimo accesso** (`show_last_seen`) — mostra/nascondi il tuo ultimo accesso;
  reciprocità da confermare (§17 R-03). Dipende da §3.13.
- **Spunte di lettura** (`show_read_receipts`) — se off, non invii conferme di lettura
  (e non le ricevi, se reciproco). Impatta le spunte in S2/S3 (§6.4).
- (Impliciti coerenti, §13) permessi Notifiche/Contatti, gestione blocchi, privacy DM.
**Backend NUOVO**: colonne su profiles/`user_settings`. **Scritti**: update settings.

### S11 — I tuoi contatti su Televo (rubrica) — *da Sketch 1* (D1)
**Rotta**: `(main)/messaggi/contatti.tsx`. **Scopo**: trovare persone della propria
rubrica già su Televo per iniziare una chat.
**Flusso**: richiesta **permesso Contatti** (spiegazione + opt-in) → lettura rubrica
(`expo-contacts`) → **hash** locale di numeri/email → `match_contacts(hashes[])` (RPC
NUOVA) → lista di utenti Televo corrispondenti. Da ogni riga: "Aggiungi amico"
(`send_friend_request`) e/o "Messaggia" (`get_or_create_dm`, solo se già amici).
**Backend NUOVO** (§3.9): identificatore contatto + tabella hash + RPC match.
**Privacy/safety (critico)**: rubrica mai inviata in chiaro; mai rivelare a X che Y è su
Televo senza consenso; minori (§10.1, §17 R-01). **Stati**: permesso negato (spiega e
offri impostazioni OS); nessun match ("Nessun contatto su Televo ancora"); loading.
**Casi limite**: permesso revocato a runtime; rubrica enorme (batch/paginazione hashing);
duplicati; utenti bloccati esclusi.

### S12 — Ricerca
- **S12a — Ricerca globale (hub)**: riuso della rotta esistente `cerca`. Cerca
  conversazioni (per nome/peer), messaggi (full-text, §17 R-13), utenti (per username,
  RPC ricerca NUOVA se serve). Dall'header di S1 (icona ricerca).
- **S12b — Ricerca nella chat** (*da Sketch 2 "Q cerca"*): cerca testo dentro la
  conversazione corrente; risultati evidenziati; naviga tra i match. MVP client-side
  sui messaggi caricati; per storico lungo serve ricerca server (§17 R-13).

### S13 — Info conversazione / membri (icona ⓘ)
DM: profilo peer, azioni (Messaggia già aperto, Aggiungi/Rimuovi amico, **Blocca**,
**Segnala**), toggle silenzia, media condivisi (opzionale). Gruppo/house: `name`/avatar,
**elenco membri** con ruolo, **Aggiungi membri** (admin), **Esci**, silenzia, segnala.
**Dati**: `conversation_members` + profili. **Scritti**: RPC amicizia/blocco/leave/mute.

### S14 — Composer, registrazione vocale, viewer media
- **S14a Composer testo**: input + invio; disabilitato se mutato/bannato (§11.4).
- **S14b Registrazione vocale**: press-and-hold o tap-to-record (§17 R-14); anteprima,
  invia/annulla; upload `voice-messages`; `expires_at ≤ 24h`; player con durata.
- **S14c Viewer media**: apertura foto a schermo intero (zoom); download/salva
  (opzionale). Solo membri (RLS storage).

### S15 — Drops strip (hub) → vedi S1 regione 2 (placeholder finché M6).

### S16 — Menu contestuale messaggio (long-press bolla)
Voci: **Rispondi** (imposta `reply_to`), **Copia** (testo), **Salva/Rimuovi dai
salvati** (§3.11), **Elimina** (solo miei → soft-delete `deleted_at`), **Modifica**
(solo miei, solo testo → update `body`, indicatore "modificato"), **Dai un prop**
(peer, `source_type='message'`, `source_id=message_id` → Aura), **Segnala**
(`file_report` target `message`). Casi limite: non puoi rispondere a messaggio scaduto/
cancellato; edit solo entro finestra? (§17 R-15); prop soggetto a unicità/cap (backend).

### S16-bis — Menu contestuale conversazione (long-press riga in S1)
Voci: **Silenzia/Riattiva**, **Archivia/Ripristina**, **Fissa/Sblocca** (§17 R-07),
**Segna come letto** (`mark_conversation_read`), **Elimina** (DM: `hidden_at`; gruppo:
esci). Backend NUOVO per mute/archive/pin.

---

## 6. Ciclo di vita e stati dei MESSAGGI

### 6.1 Diagramma stati
`composing → (optimistic) pending/sending → sent → [read] → [edited] → [deleted]`
e, per i vocali, `→ expired` (24h). Non esiste "delivered" separato nel backend (vedi 6.3).

### 6.2 Invio (optimistic)
1. Utente invia → si crea una bolla locale "pending" (id temporaneo).
2. Insert `messages` (trigger forza sender/created_at/membership/expiry/reply).
3. Su successo → sostituisci con la riga reale (id definitivo). Su errore → stato
   "non inviato" + retry. (Pattern mutation come `useProfilo`: throw + invalidate.)

### 6.3 Delivery vs Read
- **Read**: unica conferma reale = `last_read_at` del peer ≥ `created_at`. In DM →
  doppia spunta; in gruppo → "letto da N/M".
- **Delivered**: il backend **non** traccia consegna per-device. Opzioni: (a) trattare
  "inviato con successo" = singola spunta; (b) non mostrare "consegnato". MVP: singola
  spunta = inviato al server, doppia = letto. (§17 R-04)

### 6.4 Spunte & privacy
Se `show_read_receipts = off` per un utente, non si aggiorna/non si espone la lettura
verso gli altri (e, se reciproco, non vedi le loro). Implica che `mark_conversation_read`
resti per l'unread locale ma la spunta non venga mostrata al peer (logica di
presentazione + eventuale gating server, §17 R-03).

### 6.5 Timestamp & separatori
Orario per messaggio (`created_at`, formato locale HH:mm). Separatori data per giorno
("Oggi"/"Ieri"/data). Raggruppamento visivo di messaggi consecutivi dello stesso mittente.

### 6.6 Reply / Edit / Delete
- Reply: `reply_to` valido nella stessa conversazione (trigger). UI mostra citazione.
- Edit: solo `body`, solo miei (grant + RLS). Indicatore "modificato".
- Delete: soft (`deleted_at`); il mittente continua a vedere il proprio; gli altri no.

### 6.7 Effimeri (vocali, 24h)
`expires_at` clampato a 24h dal trigger. Alla scadenza `expire_content()` li rimuove;
UI li nasconde. Countdown/badge "effimero" opzionale.

---

## 7. Ciclo di vita e stati delle CONVERSAZIONI

### 7.1 Creazione
- DM: `get_or_create_dm(p_other)` (idempotente; una per coppia via `dm_key`; richiede
  `are_friends`). Ritorna `{conversation_id, created}`.
- Gruppo/house: `create_group_conversation(...)` (creatore admin).

### 7.2 Attività & ordinamento
`updated_at` bumpato da ogni messaggio → lista ordinata per attività recente.

### 7.3 Unread
Conteggio = messaggi con `created_at > last_read_at` e `sender_id ≠ me` e non cancellati
e (se `cleared_at`) `created_at > cleared_at`. `mark_conversation_read` azzera.

### 7.4 Silenzia / Archivia / Fissa / Cancella cronologia (NUOVO, per-utente)
- Silenzia: `muted_until` → sopprime notifiche/badge sonoro; la chat resta in lista
  (compare in S9). Archivia: `archived_at` → esce dalla lista principale (S8). Fissa:
  `pinned_at` → in cima (§17 R-07). Cancella cronologia: `cleared_at` → nasconde messaggi
  precedenti solo per me.

### 7.5 Uscita / Eliminazione
- **DM "Elimina chat"**: `hidden_at` (soft, per-utente) — nasconde dalla lista; **non**
  distrugge i messaggi (l'altro li vede ancora); riappare se arriva nuovo messaggio.
  In alternativa `leave_conversation` (esce davvero, ma per DM non puoi rientrare).
  Decisione preferita: `hidden_at`. (§17 R-05: cosa fare in combinazione col blocco.)
- **Gruppo "Esci"**: `leave_conversation(p_conv)` (rimuove membership). Ultimo membro:
  la conversazione resta orfana (cleanup? §17 R-16). Admin che esce: §17 R-09.

### 7.6 Blocco
`block_user` imposta `status=blocked`, rimuove da `top_friends`; **non** cancella DM
esistenti (gap). Effetto desiderato in chat da definire (nascondere DM? impedire invio?
§17 R-05).

---

## 8. Real-time e sincronizzazione

### 8.1 Realtime
Sottoscrizione Supabase Realtime su `messages` (filtro per `conversation_id` in S2/S3) e
su aggiornamenti che toccano la lista (nuovi messaggi → aggiorna anteprima/unread/ordine
in S1). Il client Realtime **non è ancora usato** nel progetto → va abilitato.

### 8.2 Optimistic updates
Invio ottimistico (§6.2). Riconciliazione con l'evento realtime (dedup per id).

### 8.3 Paginazione & ordinamento
Messaggi: pagina all'indietro per `created_at desc` (indice
`messages_conv_created_idx`), page size ~30–50. Lista chat: per `updated_at desc`,
paginata se molte.

### 8.4 Sync alla riconnessione
Al ritorno online / foreground: rifetch della finestra visibile, colma i gap (messaggi
arrivati offline), riapplica `mark_conversation_read` se la chat è aperta.

### 8.5 Unread & badge tab
Badge numerico sulla tab "Messaggi" (BottomBar) = somma unread delle conversazioni non
silenziate/non archiviate. Aggiornato via realtime.

---

## 9. Notifiche, badge, unread

### 9.1 Push
Trigger `messages_after_insert_notify` accoda notifica `message` a tutti i membri tranne
il mittente (title = nome mittente [+ nome gruppo], body = preview 120 char o "🎙️
Messaggio vocale", payload `{conversation_id, sender_id, message_id}`). `dispatch_push`
(cron 1 min) → Edge `send-push` (Expo). Deep link: tap → apre `chat/[conversation_id]`.

### 9.2 In-app
Tab Notifiche (M8) mostra le notifiche; qui rilevano i tipi `message`,
`friend_request`, `friend_accepted`, `prop`. `read_at` per lette.

### 9.3 Mute-aware (NUOVO — D4)
Il trigger di notifica deve **non** accodare/pushare ai membri con `muted_until > now()`
(oppure marcare la notifica come silenziosa). Richiede modifica backend del trigger.

### 9.4 Foto/vocale nel body notifica
Body: "📷 Foto" / "🎙️ Messaggio vocale" quando non c'è testo (estende la logica esistente).

---

## 10. Permessi e privacy

### 10.1 Permesso Contatti (rubrica) — NUOVO (D1)
Richiesto in S11 con spiegazione chiara e opt-in. Rubrica mai in chiaro al server (hash).
Safety minori: non esporre presenza su Televo a estranei; conformità GDPR (consenso
registrato via `record_consent`). Revoca a runtime gestita. **Alto rischio → §17 R-01.**

### 10.2 Permesso Notifiche
`expo-notifications` + `register_device(token, platform)`. Richiesto contestualmente
(prima notifica utile). Gestione negazione.

### 10.3 Toggle privacy
Ultimo accesso e spunte di lettura (§3.12, §6.4, §17 R-03).

### 10.4 Safety minori (sempre)
DM solo tra amici; vocali/media dei minori mai pubblici (bucket privati + RLS
path-based); invio bloccato per mutati/bannati.

---

## 11. Moderazione e safety in chat

### 11.1 Segnala
`file_report(target_type, target_id, reason, details)` con `target_type ∈
{user, message}` (da chat: segnala un messaggio o l'utente). Una segnalazione per
(reporter, target). Da S16 (messaggio) e S13 (utente).

### 11.2 Blocca / Sblocca
`block_user` / `unblock_user`. Effetto su DM esistenti da definire (§7.6, §17 R-05).

### 11.3 Utente mutato / bannato
`is_active_user()` (age_verified & !deleted & !banned & mute-scaduto). Se falso → insert
messaggi bloccato da RLS.

### 11.4 UX per mittente non attivo
Se mutato/bannato: composer disabilitato con messaggio ("Sei stato silenziato fino a
…"). Può ancora leggere.

### 11.5 Moderazione AI testo — DIFFERITA
Edge `moderate-text` (Perspective) degrada con grazia senza chiave. Integrazione
opzionale sull'invio (scan → `enqueue_moderation`).

---

## 12. Aura e streak in chat

- **Amicizia accettata** → `welcoming +3` a entrambi (rilevante perché la DM nasce
  dall'amicizia).
- **Dai un prop da un messaggio** (S16) → Aura al destinatario sul tratto + `kindness
  +0.5` al donatore; `source_type='message'`. Soggetto a unicità/cap anti-gaming.
- **Streak per conversazione**: `touch_streak` su ogni messaggio; freeze; reset senza
  penalità; badge 🔥 in S1/S2 (`StreakBadge` stub da riempire).
- **Sessione/uso**: `record_session(seconds)` (clamp 4h) → `consistency +1` (5min–3h,
  cron) / `compulsive_use -2` (>3h). La chat contribuisce ai secondi attivi.
- **Nessuna Aura** dal semplice invio di un messaggio (per design).

---

## 13. Impostazioni e preferenze (enumerazione)
- Ultimo accesso (on/off) — NUOVO.
- Spunte di lettura (on/off) — NUOVO.
- Notifiche (permesso OS + eventuale on/off in-app globale) — NUOVO on/off in-app.
- Contatti (permesso OS + "trova contatti") — NUOVO.
- Silenzia per-conversazione (durata) — NUOVO.
- Blocchi: elenco utenti bloccati + sblocca (da settings o profilo) — backend esiste.
- Privacy DM (chi può scrivermi = solo amici, già imposto a DB).

---

## 14. Stati trasversali
Per **ogni** schermata: **loading** (skeleton/spinner — `FeedSkeleton`, `LoadingSpinner`
da riempire), **vuoto** (messaggio + CTA — `ComingSoon`/`Placeholder`), **errore**
(messaggio IT + retry; mapping errori come `authErrorMessage`), **offline** (banner +
coda invii), **retry** (invii/upload falliti). Nessuno stato deve lasciare la UI muta.

---

## 15. Catalogo casi limite (estratto, esaustivo in impl.)
1. DM con ex-amico (rimosso dopo la creazione): chat visibile, nuova DM non creabile.
2. Blocco reciproco con DM esistente (§17 R-05).
3. Peer con account anonimizzato/cancellato (GDPR): "Utente non disponibile".
4. Vocale scaduto durante la visualizzazione: sparisce/oscura.
5. Messaggio inviato offline: coda + invio alla riconnessione + ordinamento corretto.
6. Race su `get_or_create_dm` (doppio tap): idempotente (unique `dm_key`).
7. Upload media/vocale fallito a metà: retry, nessun messaggio fantasma.
8. Gruppo: aggiunta di non-idoneo → RPC `not_allowed`; UI gestisce l'errore.
9. Ultimo membro esce da gruppo (§17 R-16). Admin esce (§17 R-09).
10. Mute scade mentre la chat è aperta: notifiche riprendono.
11. `cleared_at` poi nuovo messaggio: la chat riappare con solo i nuovi.
12. Reply a messaggio poi cancellato/scaduto: citazione "non disponibile".
13. Messaggi molto lunghi / solo emoji / link (preview link? §17 R-17).
14. Rubrica enorme in S11: hashing a batch, paginazione.
15. Permesso Contatti/Notifiche revocato a runtime.
16. Realtime disconnesso a lungo: sync gap-fill.
17. Fuso orario / cambio giorno per i separatori data.

---

## 16. Mappatura capacità backend: ESISTE vs GAP *(aggiornata Rev. 2)*

> Quasi tutti i "NUOVO backend" della Rev. 1 sono stati **scritti** (migrazioni del
> 2026-07-01, in attesa di `db push` — milestone CM0). I gap residui veri sono i
> requisiti di completezza moderna (§19), pianificati in CM1/CM4.

| Requisito | Backend | Note / milestone |
|-----------|---------|------------------|
| DM 1:1 tra amici | ✅ `get_or_create_dm`, `dm_key`, RLS | — |
| Gruppo / house | ✅ `create_group_conversation`, `add/remove_conversation_member` | rinomina/avatar/promozione admin → CM4 |
| Lista chat + ordinamento | ✅ `updated_at` + campi organizzazione | — |
| Messaggi testo | ✅ insert/RLS/trigger | cap 4096 + rate-limit → CM1 |
| Vocali effimeri | ✅ bucket `voice-messages`, clamp 24h | — |
| Foto/media (D3) | ✅ **FATTO** `chat_media` (enum, colonne, bucket, RLS, grant) | UI → CM5 |
| Reply / soft-delete | ✅ | — |
| Edit | ⚠️ grant update(body) senza `edited_at` | **GAP**: colonna + finestra 48h → CM1 (RC-05) |
| Spunte di lettura | ✅ `last_read_at` | gating privacy client → CM3; enforcement server → CM8 |
| Unread / badge | ✅ derivabile | riepilogo server-side (scala) → CM8 |
| Streak | ✅ | — |
| Notifiche push messaggi | ✅ trigger **già mute-aware** + `dispatch_push` + Edge | client push → CM6 |
| Silenzia / Archivia / Fissa / Cancella cronologia / Elimina (D4) | ✅ **FATTO** `chat_org` (5 campi + 3 RPC) | riapparizione `hidden_at` su nuovo msg → CM1 |
| Messaggi salvati | ✅ **FATTO** `saved_messages` + RPC | — |
| Realtime | ✅ **FATTO** `chat_realtime` (publication su 3 tabelle) | attivo dopo CM0 |
| Ultimo accesso | ✅ **FATTO** `profiles.last_active_at` + `touch_presence` | esposizione privacy-safe (RPC) → CM1; UI → CM3 |
| Toggle ultimo accesso / spunte | ✅ **FATTO** `show_last_seen`, `show_read_receipts` su profiles | UI S10 → CM3 |
| Contatti su Televo (D1) | ✅ **FATTO** `contact_hashes` + `match_contacts` (minori solo da amici) | email-only (D6); UI S11 → CM7 |
| Ricerca messaggi (storico) | ❌ | **GAP**: FTS italian + `search_messages` → CM4 (RC-08) |
| Inoltro | ❌ | **GAP**: `forwarded_from` → CM4 (RC-06) |
| Reazioni emoji (D5) | ❌ | **GAP**: `message_reactions` → CM4 (RC-07) |
| Segnala / blocca | ✅ `file_report`, `block/unblock_user` | blocco→stop invio DM → CM1 (R-05); UI → CM4/CM8 |
| Dai prop da messaggio | ✅ props (`source_type='message'`) | UI → CM4 |
| GDPR export/delete su tabelle chat nuove | ⚠️ incompleto | **GAP** → CM1 (RC-12) |
| Chiamata audio | Edge livekit-token esiste | **DIFFERITA** (D2: Dev Build) |
| Cambia sfondo | — | **DIFFERITA** (non implementare ora) |
| Moderazione AI testo | Edge `moderate-text` (degrada) | integrazione opzionale → CM8 |
| Drops strip nell'hub | `drops` backend esiste | nascosta finché il dominio Drops non è costruito (R-08) |

---

## 17. Decisioni — TUTTE CHIUSE (Rev. 2, 2026-07-02)

Molte erano già state decise *di fatto* dall'implementazione; le altre sono chiuse
qui con motivazione. Nessuna decisione resta aperta.

- **R-01 (Rubrica/Contatti)** → **CHIUSA (D6)**: match per **hash EMAIL** (SHA-256
  client-side, mai rubrica in chiaro); telefono NON reintrodotto per ora. Le regole
  minori sono già enforced nel backend `match_contacts`: adulti scopribili da
  chiunque abbia il loro hash, **minori scopribili solo da amici esistenti**.
  Consenso `contacts_sync` registrato/revocabile via `record_consent`. → CM7.
- **R-02 (Ultimo accesso)** → **CHIUSA**: si persiste `profiles.last_active_at`
  (già in DB) aggiornato da `touch_presence()` con heartbeat throttled solo in
  foreground (impatto batteria minimo). "Online" = attività < 2 min (resa client).
- **R-03 (Reciprocità toggle)** → **CHIUSA: SÌ**, stile WhatsApp/Telegram: chi
  nasconde ultimo accesso/spunte non vede quelli altrui. È la semantica che gli
  utenti già conoscono e disincentiva l'opt-out "gratis". → CM1 (RPC) + CM3 (UI).
- **R-04 (Delivery receipts)** → **CHIUSA**: solo **inviato (✓) / letto (✓✓)**.
  Il backend non traccia la consegna per-device e il valore aggiunto non giustifica
  l'infrastruttura. (Già implementato così.)
- **R-05 (Blocco ↔ DM esistenti)** → **CHIUSA**: il blocco **impedisce l'invio a
  entrambi** nella DM esistente (trigger backend, CM1); la conversazione resta
  visibile (la storia non si riscrive); nuova DM non creabile (già enforced).
  Composer disabilitato con motivo. Safety-first: nessun contatto forzato.
- **R-06 (Durate silenzia)** → **CHIUSA**: 8 ore / 1 settimana / per sempre.
  (Già implementato.)
- **R-07 (Chat fissate)** → **CHIUSA: SÌ** (`pinned_at`, già implementato).
- **R-08 (Drops nell'hub)** → **CHIUSA**: striscia **nascosta** finché il dominio
  Drops non è costruito — niente placeholder morto nell'hub.
- **R-09 (Admin che esce)** → **CHIUSA**: se esce l'ultimo admin, **auto-promozione
  del membro più anziano** (per `joined_at`); in più RPC esplicita
  `promote_conversation_admin` per il passaggio volontario. → CM4.
- **R-10 (Gruppo senza membri iniziali)** → **CHIUSA: consentito** (crea con soli
  te + aggiungi dopo — già implementato).
- **R-11 (De-archiviazione)** → **CHIUSA (stile Telegram)**: una chat **archiviata
  resta archiviata** al nuovo messaggio (mostra badge unread in S8) — l'archivio è
  una scelta deliberata. Invece la DM **eliminata** (`hidden_at`) **riappare** al
  nuovo messaggio (trigger CM1): eliminare non è ignorare per sempre.
- **R-12 (`voice_thread` vs `audio`)** → **CHIUSA**: **unificati** — nessuna
  differenza di prodotto emersa; la UI tratta entrambi da vocale, l'enum resta per
  compatibilità. Rivalutare solo se le Stanze introdurranno thread vocali (CM8).
- **R-13 (Ricerca storico)** → **CHIUSA: full-text server** (tsvector `italian` +
  GIN + RPC `search_messages`) — la ricerca client sui soli messaggi caricati non
  regge la promessa di completezza. → CM4 (RC-08).
- **R-14 (Registrazione vocale)** → **CHIUSA: tap-to-record/stop** con anteprima
  (già implementato); press-and-hold eventuale polish futuro.
- **R-15 (Finestra edit)** → **CHIUSA: 48 ore** (Telegram-like), solo messaggi di
  testo propri; indicatore "modificato" **sempre** visibile (trasparenza). Richiede
  `edited_at` (CM1) + UI (CM4).
- **R-16 (Gruppo orfano)** → **CHIUSA**: cleanup **differito** via cron dedicato
  (CM8); non bloccante, nessun dato sensibile esposto nel frattempo.
- **R-17 (Preview link)** → **CHIUSA**: ora solo **linkify** (URL tappabili, CM2);
  le card di anteprima sono differite (fetch di URL esterni = superficie privacy +
  effort non giustificato per l'MVP).
- **R-18 (Cancella cronologia "ora?")** → **CHIUSA**: MVP = tutta la cronologia
  (`cleared_at = now()`); "da un momento specifico" differito (nessuna richiesta
  d'uso concreta).

---

## 18. Appendici

### A. Enum e valori (backend reale)
- `conversation_type`: `dm | group | house`.
- `message_type`: `text | audio | voice_thread` (+ `media` da aggiungere, D3).
- `friendship status`: `pending | accepted | blocked`.
- `notification type`: `friend_request | friend_accepted | message | prop | achievement`.
- `report target_type`: `user | room | message | drop`.
- `conversation_members.role`: `admin | member`.

### B. Firme RPC reali (backend) — da usare/allineare
- `get_or_create_dm(p_other uuid) → jsonb {ok, conversation_id, created}`.
- `create_group_conversation(p_type conversation_type, p_name text, p_members uuid[]='{}') → jsonb {ok, conversation_id}`.
- `add_conversation_member(p_conv uuid, p_user uuid) → jsonb {ok}` (admin only).
- `leave_conversation(p_conv uuid) → jsonb {ok}`.
- `mark_conversation_read(p_conv uuid) → jsonb {ok}`.
- `is_conv_member(p_conv, uid) → bool`, `is_conv_admin(p_conv, uid) → bool`.
- `record_session(p_seconds int) → jsonb {ok, active_seconds}`.
- `send_friend_request / accept_friend_request / remove_friend / block_user /
  unblock_user (uuid) → jsonb`.
- `file_report(p_target_type, p_target_id, p_reason, p_details) → jsonb {ok, report_id}`.
- `register_device(p_token text, p_platform text='ios') → jsonb {ok}`.
- `enqueue_notification(uuid, notification_type, text, text='null', jsonb='{}')`.

### C. Convenzioni frontend da riusare
- Pattern hook: query key factory + `useQuery` (enabled su uid, initialData) + `useMutation`
  (throw + invalidate + refresh) come in `useProfilo.ts`/`useAura.ts`.
- Errori: sempre `throw`; mapping IT (stile `authErrorMessage`).
- Sessione: `useAuth()` → `session.user.id`.
- UI riusabile: `Avatar`, `Card`, `Button`, `Input`, `Badge`, `ComingSoon`,
  `FeedSkeleton`, `SafeScreen`, `GlassSurface`. Stub da riempire: `BottomSheet`,
  `LoadingSpinner`, `chat/{BollaParlante, MessaggioRow, StreakBadge}`, `useChat`,
  `chatStore`.
- Rotte: `dynamicRoutes.chat(id)` esiste; aggiungere le rotte stack di §4.1.
- Tema: `colors/spacing/radius/fontSize/motion` da `constants/theme.ts` (accent blu;
  viola/fucsia solo brand).

### D. Interpretazione degli sketch (mappatura elemento → requisito)
- **Sketch 1**: "Permessi: Contatti, notifiche" → §10.1/10.2. "Organizzazione: nuovo
  gruppo / Importante {salvati, archiviati, silenziati} / Impostaz. {ultimo accesso,
  spunte lettura}" → S6/S7/S8/S9/S10. "Drops (previews formato piccolo)" → S15.
  "Messaggi (elenco contatti + messaggi)" → S1 sezione lista. "I tuoi contatti su
  Televo" → S11.
- **Sketch 2**: "← username [ultimo accesso] ☎ ⓘ?" → header S2. Menu graffa
  "Silenzia / Cerca / Cambia sfondo (non implementare per ora) / Cancella cronologia
  (ora?) / Elimina chat" → S5. "DATA MESSAGGI" → separatori data (§6.5). "messaggio +
  orario" → bolle con orario. "① … ④ vocale, allegati" → tipi contenuto testo/vocale/
  media (§S2 corpo, D3).

---

## 19. Requisiti di completezza moderna (Rev. 2)

> **Perché questa sezione.** L'utente ha fissato il riferimento di qualità: il
> sistema chat finale deve *sentirsi* maturo e completo come **Telegram / WhatsApp /
> Instagram Direct** — riferimento di **completezza funzionale**, non di design (il
> design verrà rifatto). La revisione critica (2026-07-02) ha confrontato la Rev. 1
> con quel livello: questi sono i requisiti mancanti, ognuno con la sua motivazione.
> Niente feature "perché sì": ciò che è stato valutato e scartato è in §19.3.

### 19.1 Requisiti nuovi o promossi (RC-01…RC-13)

- **RC-01 — Stati di invio, optimistic, retry.** Ogni messaggio inviato appare
  **immediatamente** come `pending`, poi `sent` (✓) o `failed` con **Riprova/Elimina**.
  Dedup con l'evento realtime. *Motivo*: è la differenza percepita tra una chat
  "vera" e una demo; già abbozzato in §6.2, qui diventa requisito con stati espliciti.
- **RC-02 — Offline di base.** Rilevazione connettività (NetInfo → onlineManager),
  banner "Sei offline", messaggi composti offline in coda `pending` che partono alla
  riconnessione (coda in-sessione; persistenza su disco fuori scope, documentato).
  *Motivo*: mobile-first + scuola = rete instabile; §14 lo citava senza requisiti.
- **RC-03 — Typing indicator** ("sta scrivendo…"). Via Supabase Realtime **broadcast**
  (throttle ~2.5s, TTL 4s, nessuna tabella, nessuna persistenza); nei gruppi con
  username. *Motivo*: presenza umana percepibile in tempo reale — è letteralmente il
  pilastro Proof of Human applicato alla chat; standard in ogni chat matura.
- **RC-04 — Presenza online/ultimo accesso privacy-safe.** Heartbeat `touch_presence`
  (solo foreground, throttled); esposizione SOLO via RPC `get_peer_presence` che
  applica `show_last_seen` + reciprocità (R-03); la colonna raw non deve restare
  leggibile da chiunque. *Motivo*: header S2 la richiede; la privacy dei minori vieta
  di esporla senza gate server.
- **RC-05 — Edit tracciato.** `messages.edited_at` + finestra **48h** + indicatore
  "modificato" sempre visibile (R-15). *Motivo*: l'edit non tracciato è un buco di
  trasparenza (si può riscrivere la storia di nascosto) — inaccettabile in un
  prodotto per minori.
- **RC-06 — Inoltro + selezione multipla.** `forwarded_from` + intestazione
  "Inoltrato"; selezione multipla con Copia/Inoltra/Elimina/Salva. I **vocali
  effimeri non sono inoltrabili** (il file scade: l'effimero resta effimero).
  *Motivo*: gestione moderna dei messaggi; l'inoltro tracciato è anche un segnale di
  moderazione (provenienza).
- **RC-07 — Reazioni emoji (D5).** Tabella `message_reactions` (1 per utente per
  messaggio, set curato es. ❤️ 😂 👍 😮 😢 🔥), realtime, visibili **solo dentro la
  conversazione** — nessun contatore pubblico, nessun leaderboard. *Motivo*:
  riconoscimento leggero a costo sociale zero; il **prop** resta il gesto forte che
  alimenta l'Aura (i due livelli non si cannibalizzano).
- **RC-08 — Ricerca messaggi server (FTS).** `to_tsvector('italian')` + GIN + RPC
  `search_messages` (rispetta membership/cleared/deleted); UI in-chat (S12b) e
  globale (S12a). *Motivo*: R-13 chiusa lato server — la ricerca solo sui messaggi
  caricati tradisce l'aspettativa appena la chat ha storia.
- **RC-09 — "Letto da N" nei gruppi + Info messaggio.** Derivato dai `last_read_at`
  dei membri; voce "Info" nel menu del proprio messaggio. *Motivo*: le spunte solo-DM
  lasciano i gruppi senza feedback di lettura.
- **RC-10 — Micro-professionalità.** Pill "nuovi messaggi ↓" (mai scroll forzato,
  già §S2), tap sulla citazione → scroll al messaggio originale, raggruppamento
  bolle consecutive (<2 min), **Copia**, linkify URL, haptic all'invio. *Motivo*:
  sono i dettagli che, sommati, fanno dire "è una chat seria"; erano sparsi nella
  Rev. 1, qui diventano requisiti espliciti.
- **RC-11 — Hardening safety dell'invio.** Blocco→stop invio in DM (R-05), cap
  **4096 caratteri**, rate-limit di base (>30 msg/60s → rifiuto), composer
  disabilitato con motivo per mutati/bannati (§11.4). *Motivo*: anti-abuso a costo
  quasi nullo, coerente con la safety minori.
- **RC-12 — GDPR completo sulle nuove tabelle.** `gdpr-export` include
  `saved_messages`, `conversation_members`, `contact_hashes`, `consents`; la
  cancellazione account elimina `contact_hashes`. *Motivo*: l'art. 15/17 copre TUTTI
  i dati personali — le tabelle nate dopo l'Edge GDPR erano rimaste fuori (difetto
  verificato).
- **RC-13 — Push end-to-end lato client.** `register_device`, canale Android, tap →
  deep link `chat/[id]` (anche da app chiusa), soppressione del banner se la chat è
  già aperta, badge tab/app (§8.5, §9). *Motivo*: il backend push è completo e
  mute-aware; senza client resta lettera morta.

### 19.2 Mappa RC → milestone
CM1: RC-04 (RPC), RC-05 (colonna), RC-11, RC-12 · CM2: RC-01, RC-02, RC-10 ·
CM3: RC-03, RC-04 (UI) · CM4: RC-05 (UI), RC-06, RC-07, RC-08, RC-09 · CM6: RC-13.
Dettagli in `docs/chat/IMPLEMENTATION-PLAN.md`.

### 19.3 Valutato e SCARTATO (con motivo — non rientra senza nuova decisione)
- **Crittografia E2E**: in conflitto con la moderazione obbligatoria per un social di
  minori (i report devono poter essere verificati); fuori scope MVP.
- **Messaggi programmati / sondaggi / sticker & GIF / videomessaggi / canali
  broadcast**: superficie enorme, nessun legame con i tre pilastri; Telegram-parity
  non significa Telegram-clone.
- **@menzioni nei gruppi**: rimandata — i gruppi Televo sono piccoli (amici/scuola),
  il valore è basso finché non esistono gruppi grandi.
- **Card di anteprima link**: fetch di URL esterni = superficie privacy/sicurezza;
  per ora solo linkify (R-17).
- **Delivered receipts per-device**: costo infrastrutturale senza valore percepito
  aggiuntivo rispetto a ✓/✓✓ (R-04).
- **Multi-account**: non pertinente a un social identità-centrico invite-only.

---

## Prossimi passi (Rev. 2)
La validazione della Rev. 1 e la revisione critica sono **completate**. L'esecuzione
segue `docs/chat/IMPLEMENTATION-PLAN.md` (milestone CM0–CM8): questo documento
resta la **fonte di verità funzionale** e va aggiornato se una milestone cambia un
requisito.

---

## Revision history
- **Rev. 1** (2026-07-01) — prima stesura dagli sketch: requisiti S1–S16, decisioni
  D1–D4, gap backend §16, 18 decisioni aperte §17.
- **Rev. 2** (2026-07-02) — revisione critica post-analisi del codice: §2 risolta
  (tipi allineati); §16 aggiornata allo stato reale (backend D1/D3/D4/presenza già
  scritto, in attesa di push); §17 tutte le decisioni CHIUSE; nuove decisioni D5
  (reazioni: sì), D6 (rubrica: solo email), D7 (push migrazioni in CM0); nuova §19
  "Requisiti di completezza moderna" (RC-01…RC-13 + scartati); esecuzione delegata a
  IMPLEMENTATION-PLAN.md.
