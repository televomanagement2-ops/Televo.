# Televo — Drops (M6): Specifica di prodotto & Piano di implementazione

> **Rev. 1 — 2026-07-05.** Decisioni di prodotto **D-1..D-5 validate dal product
> owner** (2026-07-05). Questo è il documento ufficiale della milestone **M6 —
> Drops**: Parte I = specifica di prodotto (cosa costruiamo e perché), Parte II =
> piano di implementazione a milestone (come lo costruiamo). Compagno di
> `CLAUDE.md` (mappa backend), `roadmap.md` (stato progetto) e dei documenti
> chat (`docs/chat/SRS-chat.md`, `docs/chat/IMPLEMENTATION-PLAN.md`), di cui
> ricalca formato e convenzioni. Lingua: italiano, come tutto il progetto.

---

## Contesto — perché questo documento

I drop nascono nel backend Fase 4 come "momenti effimeri" minimali: testo o
audio, visibili 24h ad amici/scuola, con reaction-di-carattere che diventano
props. Con M6 i drop diventano **il sistema di post di Televo**, a tre formati:

- **Foto** (stile BeReal) — il momento visivo, autentico, non patinato;
- **Audio** — veri e propri **post vocali**, la feature distintiva di un social
  costruito sulla voce (richiestissima dal pubblico Gen Z);
- **Testo** — post di solo testo, con la densità di discussione di Reddit
  (ma NON il suo threading, né la sua permanenza).

Attorno al contenuto arriva l'interazione completa: **commenti** (testo e
vocali), **like**, **salvataggi**, menu ⋯ (inoltra, segnala, elimina…), un
**feed** dedicato, **notifiche** e un archivio privato dell'autore (**Ricordi**).
Tutto senza tradire i tre pilastri: il sistema è progettato perché l'effimerità,
l'anti-vanity e la safety dei minori siano **enforced a livello dati**, non
promesse di UI.

### Decisioni di prodotto vincolanti (product owner, 2026-07-05)

| # | Domanda | Decisione |
|---|---------|-----------|
| D-1 | I drop restano effimeri con commenti/salvataggi? | **Sì, 24h per TUTTO**: drop e interazioni muoiono insieme. "Salva" = segnalibro che vive finché vive il drop. L'autore conserva i propri drop scaduti in un archivio **privato** ("Ricordi", stile BeReal Memories). |
| D-2 | Come si conciliano i like col pilastro anti-vanity? | **Contatori privati**: tutti gli amici possono mettere like/commentare, ma i **numeri li vede solo l'autore**. Nessuna cifra pubblica, mai. |
| D-3 | Che audience hanno i drop? | **SOLO AMICI.** Il concetto "scuola" **esce dal progetto** (deprecare `audience='school'`). Televo è friends-centrica: ogni drop è visibile ai soli amici accettati dell'autore. |
| D-4 | Come sono fatti i commenti? | **Testo + vocali**, lista piatta con **1 solo livello di reply** (reply a un commento, niente thread infiniti). |
| D-5 | Requisiti non funzionali? | Sistema **ottimizzato, scalabile, best practice 2026** per fluidità, storage e costi — progettato come un vero sistema complesso funzionante, non un MVP di facciata. |

> ⚠️ **Nota trasversale su D-3**: la deprecazione della "scuola" è una novità di
> prodotto che va oltre i drop (classifiche per scuola, conversazioni `house`,
> onboarding). Questo documento la applica **al dominio drops**; la bonifica
> degli altri domini è fuori scope e andrà pianificata a parte.

---

# PARTE I — SPECIFICA DI PRODOTTO

## 0. Meta

### 0.1 Scopo
Definire **il prodotto** Drops: uno sviluppatore deve poter costruire l'intero
dominio leggendo questo documento e il codice esistente. La Parte I non contiene
migrazioni né codice: definisce comportamenti, dati, permessi e casi limite. La
Parte II li traduce in milestone tecniche.

### 0.2 Ambito

**In scope (M6):** drop foto/audio/testo · feed amici · dettaglio con commenti
(testo+vocali, 1 livello di reply) · like · reaction-tratto (esistenti, invariate)
· salvataggi · Ricordi + statistiche private dell'autore · menu ⋯ (salva,
inoltra, rispondi in privato, segnala, elimina) · inoltro in chat come
riferimento · notifiche `drop_comment` · realtime sui commenti · cleanup storage
· GDPR esteso · reazione vocale rapida · stato "Sei in pari ✓".

**Differito (decisione esplicita futura):** Drop del giorno (prompt curato,
§16.2) · audience "Cerchia" (top friends) · catena di drop · Ricordi
ri-condivisibili (§16.3).

**Fuori scope:** contatori pubblici · feed di scoperta non-amici · threading
annidato · dual-camera simultanea stile BeReal · video · vibe check
(§16.4, tutti con motivo).

### 0.3 Fonti
`CLAUDE.md` §1 (pilastri) e §6 (regole d'oro) · migrazioni
`20260628160500_drops.sql`, `20260701000100_aura_v3.sql`,
`20260628190000_moderation.sql`, `20260705130000_chat_cleanup.sql`,
`20260705140000_grants_audit.sql` · pattern chat `20260703120000_chat_modern.sql`
e `20260703130000_chat_media_hardening.sql` · `docs/chat/SRS-chat.md` (formato e
precedenti di prodotto, in particolare RC-07 reazioni anti-vanity e D3 foto).

### 0.4 Glossario

| Termine | Significato |
|---------|-------------|
| **Drop** | Post effimero (24h) a formato foto, audio o testo, visibile ai soli amici dell'autore. |
| **Ricordo** | Un drop scaduto, visibile **solo al suo autore**, per sempre (finché non lo elimina). |
| **Like** | Gesto leggero (♥): niente Aura, niente notifica, contatore privato. |
| **Reaction-tratto** | Gesto forte esistente (gentile/divertente/accogliente/utile): diventa un **prop** e alimenta l'Aura dell'autore. |
| **Segnalibro** | Un salvataggio: vive finché vive il drop, muore con lui. |
| **Statistiche private** | I numeri (like, commenti, salvataggi, reaction per tratto) visibili **solo all'autore**; alla scadenza vengono congelati in uno snapshot (`stats_finali`). |
| **Riferimento in chat** | L'inoltro di un drop in una conversazione: un puntatore, mai una copia. |
| **Effimerità logica** | Alla scadenza il drop sparisce per tutti tranne l'autore; le interazioni vengono cancellate; la riga sopravvive come Ricordo. |

### 0.5 Convenzioni
`D-x` = decisioni di scope (tabella sopra) · `R-xx` = decisioni di
prodotto/architettura CHIUSE (§14) · `RC-xx` = requisiti di completezza (§15) ·
`S0..S7` = schermate/overlay di **questo** documento (§4; non confondere con le
S-n della SRS chat) · `DM0..DM7` = milestone della Parte II. Codici errore backend =
stringhe-codice (`drop_expired`, `rate_limited`…), mappate in italiano dal
client (`lib/errors.ts`).

---

## 1. I Drops nei tre pilastri

### 1.1 Perché i drop esistono così

1. **Proof of Human** — il drop è il momento *vero* di una persona vera: la
   foto senza filtri, la voce registrata ora, il pensiero scritto di getto. Il
   formato audio è il più "umano" dei tre ed è trattato come primario (l'Aura
   v3 già lo premia di più: 20 pt contro 15).
2. **Aura** — pubblicare alimenta `participation` a rendimenti decrescenti
   (1/n nel giorno: premiata la costanza, non il volume). Le reaction-tratto
   ricevute alimentano i tratti di carattere. **I like NO**: sono un gesto
   leggero senza peso reputazionale, così l'Aura resta non-gamabile (R-05, R-13).
3. **Anti-doomscroll** — il feed è **naturalmente finito**: amici × 24h. Quando
   finisce, finisce — e lo celebriamo ("Sei in pari ✓", §16.1). Niente
   contatori pubblici, niente realtime ansiogeno sul feed, niente autoplay
   infinito. L'effimerità toglie l'ansia da prestazione: domani è un altro giorno.

### 1.2 Attori

| Attore | Può |
|--------|-----|
| **Autore** | Creare drop (3 formati), vederli per sempre (Ricordi), vedere i numeri e chi ha messo like, rimuovere commenti dal proprio drop, eliminare il drop in anticipo. |
| **Amico dell'autore** | Vedere il drop per 24h, commentare (testo/vocale, reply 1 livello), like, reaction-tratto, salvare, inoltrare in chat, rispondere in privato, segnalare. |
| **Non-amico** | **Niente.** Il drop non esiste, per lui: né nel feed, né via deep link, né via inoltro, né nei file storage. |
| **Utente mutato/bannato** | Vede ma non crea (enforcement esistente `is_active_user()` nei trigger). |
| **Moderatore** | Riceve segnalazioni (`file_report` target `drop` / `drop_comment`), agisce con la pipeline esistente (warn/mute/ban → Aura toxicity + audit). |
| **Sistema** | Scade i drop (cron), congela le statistiche, cancella le interazioni, accoda i file alla pulizia, notifica i commenti. |

### 1.3 Vincoli non negoziabili (regole d'oro applicate ai drop)

- **Foto e voce dei minori MAI pubbliche**: bucket privati dedicati
  (`drop-media`, `drop-audio`), lettura concessa dalla policy storage **solo a
  chi può vedere il drop** (`can_see_drop`). Nessun URL pubblico, solo signed URL.
- **Niente vanity-count**: i numeri sono privati dell'autore, **a livello
  dati** (RLS + RPC), non solo nascosti dalla UI (R-04).
- **Niente posizione** sui drop (decisione storica confermata).
- **Mutazioni delicate via RPC/trigger** SECURITY DEFINER; il client non scrive
  mai campi di sistema. Scrittura ledger (Aura, audit) solo lato server.
- **Moderazione sempre possibile**: contenuti segnalabili, testo passato a
  `moderate-text` (degrada con grazia senza chiave), l'autore può ripulire il
  proprio spazio, `is_active_user()` blocca la creazione ai sanzionati.
- **GDPR**: export completo delle nuove tabelle, delete che cancella contenuti
  E file (via coda cleanup).

---

## 2. Modello dati di prodotto

> Mappatura concettuale → §13 per ESISTE vs GAP, Parte II per il DDL esatto.

### 2.1 Drop
Un drop ha: autore, **formato** (`text` | `audio` | `media`), corpo testuale
(`body`: il testo per i drop testo, la **caption** opzionale per foto/audio —
R-11), file (`media_url` per le foto, `audio_url` + `audio_seconds` per i
vocali), audience (**solo `friends`** — R-02), `expires_at` (= creazione + 24h,
forzato dal server), `created_at`, e `stats_finali` (snapshot scritto dal
sistema alla scadenza — R-01). Limiti: testo ≤ 2000 caratteri, caption ≤ 280,
audio 1–300 secondi, foto ≤ 15 MB (png/jpeg/webp), audio ≤ 25 MB.
**L'id è generato dal client** (R-03): serve per caricare i file su path
`<drop_id>/<author_id>/…` *prima* dell'insert (outbox ottimistico), con il
trigger che valida il prefisso — nessun riferimento a file altrui è possibile.

### 2.2 Commento
Appartiene a un drop vivo. Formati: `text` (≤ 1000 caratteri) o `audio`
(1–120 secondi, stesso bucket audio del drop, prefisso file `commento_`).
`parent_id` opzionale = reply **a un commento top-level dello stesso drop**
(profondità massima 1, enforced dal trigger — R-07). Niente edit (R-12): un
contenuto che vive < 24h si cancella e si riscrive. L'autore del commento può
cancellarlo; **anche l'autore del drop può** (ripulisce il proprio spazio —
safety). La cancellazione di un top-level porta via le sue reply. I commenti
sono **contenuto**, non contatore: chi vede il drop li legge e partecipa; ciò
che resta privato è la **cifra aggregata** (R-04).

### 2.3 Like
Coppia (drop, utente), idempotente per natura (PK), toggle. Zero Aura, zero
notifiche, zero realtime. **Chi** ha messo like lo vede solo l'autore del drop
(e ognuno vede il proprio); il **numero** lo vede solo l'autore (R-04, R-05).

### 2.4 Reaction-tratto (esistente, invariata)
`drop_reactions(drop, utente, tratto ∈ kindness/humor/welcoming/contribution)` →
il trigger la trasforma in **prop** all'autore (pipeline dedup/cap 20/gg/Aura
già live). È il "gesto forte": tap lungo, costa un'intenzione, pesa sulla
reputazione. Coesiste col like (R-05); la gerarchia dei gesti è fissata in S6.

### 2.5 Salvataggio
Coppia (utente, drop) creata/rimossa via RPC. È un **segnalibro**, non un
archivio: muore con la scadenza del drop (D-1). L'autore del drop vede **solo
il numero** dei salvataggi, mai chi (R-14 — salvare è più intimo di un like).

### 2.6 Ricordo
Non è una tabella: è **il drop stesso dopo la scadenza** (R-01). La RLS
esistente già consente all'autore di vedere i propri drop scaduti; le policy
storage nuove fanno lo stesso per i file. L'autore li sfoglia in `profilo/
ricordi`, con le `stats_finali` congelate; può eliminarli quando vuole
(retention illimitata — R-10).

### 2.7 Riferimento in chat
L'inoltro scrive nel messaggio un puntatore `drop_ref` al drop (R-08). Il
destinatario lo risolve con la **propria** RLS: se non è amico dell'autore o il
drop è scaduto vede "Drop non disponibile". Mai una copia: l'effimero resta
effimero e i permessi restano dell'autore.

### 2.8 Statistiche finali
Snapshot JSON scritto **solo dal sistema** alla scadenza:
`{"likes":n,"comments":n,"saves":n,"reactions":{"humor":n,…}}`. Permette di
cancellare le righe di interazione (igiene dati + costo storage ~zero) senza
perdere la gratificazione privata dell'autore nei Ricordi.

### 2.9 Coda di pulizia storage
Tabella di servizio (`storage_cleanup_queue`) alimentata dai trigger di
cancellazione: l'hosted **vieta** la DELETE SQL su `storage.objects`, quindi i
file vengono rimossi da una Edge Function dedicata (`storage-cleanup`, service
role + Storage API, cron). Sana anche il debito già documentato della chat
(vocali scaduti, media azzerati dal GDPR) — R-09.

---

## 3. Architettura dell'informazione e navigazione

### 3.1 Rotte nuove

```
(main)/
  drop/
    [id].tsx          ← S3 dettaglio drop + commenti (deep link)
    nuovo.tsx         ← S2 composer, ?tipo=foto|audio|testo
    salvati.tsx       ← S4 i miei segnalibri
  profilo/
    ricordi.tsx       ← S5 archivio privato + statistiche
```

`routes.ts`: aggiungere le rotte statiche (`ROUTES.dropNuovo`, `ROUTES.dropSalvati`,
`ROUTES.ricordi`) e il costruttore dinamico `dynamicRoutes.drop(id)`.

### 3.2 Ingressi

| Da | Come |
|----|------|
| **Home** | categoria `drops` della `CategoryBar` → S1 (oggi è `ComingSoon`). |
| **Crea (+)** | **decisione product owner**: il pulsante **+** centrale della bottom bar NON naviga più a una schermata-frame ma **apre un menu** pulito e organizzato (bottom sheet dark, stile sistema dialoghi CM6.5) con i tipi creabili; le voci Drop — **Foto · Audio · Testo** — sono in testa e attive, le altre (Stanza Live, Gruppo…) restano "presto". Scelta voce → S2 col formato preselezionato. `crea.tsx`/`createTypes.ts` si evolvono di conseguenza (DM1). |
| **Notifica** | tap su `drop_comment` → deep link S3 (pattern CM6, cold start incluso). |
| **Chat** | tap su un drop inoltrato (`BollaDropRef`, S7) → S3 se visibile. |
| **Profilo proprio** | voce "Ricordi" → S5; "Salvati" → S4 (ingresso anche dall'hub Salvati esistente, a discrezione del round UI). |

Back: sempre pop dello stack (convenzione app); S3 aperta da deep link con
stack freddo torna alla Home.

---

## 4. Specifica schermata per schermata

> Formato: **Rotta** · Scopo · Regioni/interazioni · Dati letti · Dati scritti ·
> Stati · Permessi · Casi limite. I componenti citati sono i file di
> `mobile/src/components/drops/` da costruire (Parte II).

### S0 — Menu di creazione (+) *(overlay, non rotta)*

**Scopo**: dal pulsante **+** centrale della bottom bar si crea *tutto*, in due
tap. È l'ingresso primario alla creazione dei drop (decisione product owner).

**Comportamento**: tap sul + → bottom sheet dark (riuso del linguaggio visivo
del sistema dialoghi CM6.5, ma componente dedicato `MenuCrea` con righe
icona+titolo+sottotitolo, non semplice `mostraMenu`): in testa la sezione
**Drop** con le tre voci attive — **📷 Foto** ("Un momento vero, sparisce in
24h") · **🎙️ Audio** ("Di' la tua con la voce") · **✍️ Testo** ("Un pensiero al
volo") — sotto, le altre voci esistenti (Stanza Live, Dai Aura, Gruppo…) con
badge "presto" finché non costruite. Tap su una voce Drop → chiude il menu →
apre S2 con `?tipo=` preselezionato. Tap fuori/back → chiude (convenzioni
CM6.5). La tab `crea.tsx` a schermo pieno viene sostituita da questo menu
(il tab button intercetta il tap e apre il sheet invece di navigare).

**Stati/casi limite**: utente mutato/bannato → le voci Drop restano tappabili
ma S2 mostra composer disabilitato con motivo (coerenza col composer chat);
offline → si può comunque comporre (l'outbox pubblicherà alla riconnessione).

### S1 — Feed Drops (Home, categoria "Drops")

**Rotta**: `(main)/(tabs)/home.tsx`, categoria `drops` (sostituisce il
`ComingSoon` attuale).

**Scopo**: il flusso dei momenti degli amici nelle ultime 24h. Finito per
design: si arriva in fondo e si è "in pari".

**Regioni/interazioni**:
- Lista verticale di `DropCard` (componente `DropFeed`, FlatList paginata).
  Ogni card: header (Avatar + display_name + tempo relativo "2h fa" + menu ⋯),
  corpo per formato — **foto**: immagine 4:5 (tap → viewer full-screen, riuso
  `ViewerMedia`), caption sotto; **audio**: player prominente (play/pausa,
  progress bar, durata da `audio_seconds` senza scaricare il file), caption;
  **testo**: corpo tipografico denso, troncato a ~8 righe con "mostra tutto" —
  footer: azioni ♥ (like toggle), 💬 (apre S3), 🔖 (salva toggle), senza NESSUN
  numero se il drop non è mio; se è mio, i contatori privati inline.
- Gesti: tap card/💬 → S3 · doppio tap sul corpo → like (haptic) · long-press
  sul ♥ → barra reaction-tratto (gesto forte, S6) · **press-and-hold sul
  microfono in card → reazione vocale rapida ≤ 10s** (§16.1, commento audio
  senza aprire il dettaglio) · pull-to-refresh.
- Fine lista: blocco **"Sei in pari ✓"** — micro-celebrazione + CTA reali
  ("Manda un vocale a un amico", "Crea un drop"), niente contenuti riciclati.
- Header categoria: pulsante "＋ Drop" → S0/S2.
- I drop dell'utente compaiono nel feed in testa alla propria giornata (con
  contatori privati visibili), inclusi quelli pending dall'outbox (spinner).

**Dati letti**: RPC `drops_feed(p_before, p_before_id, p_limit)` via
`useInfiniteQuery` (keyset su `created_at desc, id desc`); signed URL da cache
(`lib/drops.ts`, TTL 1h) con **prefetch della pagina successiva**; stato
personale per card (`mio_like`, `mio_salvataggio`, `mie_reactions`,
`ha_commenti` — booleano, MAI cifra).

**Dati scritti**: like/save toggle (mutazioni ottimistiche), reaction-tratto
(insert `drop_reactions`), commento vocale rapido (insert `drop_comments`).

**Stati**: loading (skeleton card) · vuoto ("Ancora nessun drop dai tuoi amici
— sii il primo") · errore (`StatoErrore` con retry) · offline (banner, cache
TanStack ancora consultabile) · fine lista ("Sei in pari ✓").

**Permessi**: la RPC filtra `are_friends ∨ author`; nessun dato di non-amici
può arrivare al client.

**Casi limite**: drop scaduto tra fetch e tap → S3 risponde `drop_expired` e la
card sparisce al refetch · refresh mentre l'outbox ha un drop pending → la card
ottimistica resta in testa · amico rimosso dopo il fetch → interazioni rifiutate
dal server (`drop_not_visible`), card via al refetch.

### S2 — Composer (nuovo drop)

**Rotta**: `(main)/drop/nuovo.tsx`, param `?tipo=foto|audio|testo`
(preselezione da S0; switch interno a 3 tab).

**Scopo**: creare un drop in meno di 30 secondi, offline-safe.

**Regioni/interazioni**:
- **Foto**: riuso `scegliFotoDaGalleria()` / `scattaFoto()` (`lib/media.ts`,
  quality 0.7, no EXIF) → anteprima 4:5 + campo caption (≤ 280).
- **Audio**: riuso `avviaRegistrazione()`/`fermaRegistrazione()`
  (`lib/audio.ts`, m4a HIGH_QUALITY): stato idle → recording (timer, max
  300s, stop automatico) → preview (riascolto, "Rifai", caption) — stessa UX a
  tre stati del composer vocale chat.
- **Testo**: input multiriga ≤ 2000 con contatore; tipografia grande stile
  "post", non "messaggio".
- Footer fisso: audience (badge informativo "Amici" — unica opzione, R-02) +
  "Scade tra 24h" + bottone **Pubblica**.
- Pubblica → enqueue nell'outbox drop (id uuid generato client, upload file
  PRIMA dell'insert), chiusura immediata della schermata, card ottimistica in
  S1. Fallimento server → card in stato `failed` con Riprova/Elimina (pattern
  outbox chat). Testo/caption passati a `moderate-text` fire-and-forget.

**Dati letti**: solo bozza locale (store `dropStore`, sopravvive alla chiusura
accidentale della schermata).

**Dati scritti**: upload su `drop-media`/`drop-audio` path
`<drop_id>/<author_id>/…` → `insert drops {id, type, body, media_url|audio_url,
audio_seconds}`.

**Stati**: permesso galleria/fotocamera/microfono negato (schermata di
spiegazione + `Linking.openSettings`, pattern CM7) · upload in corso ·
offline (l'item resta `pending`, flush automatico alla riconnessione) ·
errori server mappati (`rate_limited` → "Hai già condiviso molto oggi: torna
domani ✨", `drop_too_long`, `caption_too_long`, `invalid_audio_duration`…).

**Permessi**: `is_active_user()` lato server (mutato/bannato → il composer
mostra il motivo e disabilita Pubblica, come il composer chat).

**Casi limite**: app uccisa dopo l'upload ma prima dell'insert → file orfano
(debito dichiarato R-09; l'outbox NON persiste su disco, come in chat) ·
doppio tap su Pubblica → guardia `inVolo` (pattern outbox) · 21° drop del
giorno → `rate_limited`.

### S3 — Dettaglio drop + commenti

**Rotta**: `(main)/drop/[id].tsx` (deep link da notifiche e da S7).

**Scopo**: il luogo della conversazione attorno a un momento. È l'unico posto
col realtime.

**Regioni/interazioni**:
- Hero: il drop a piena larghezza (foto tap→zoom; audio player grande; testo
  completo) + header autore + menu ⋯ (S6).
- **Per l'autore**: pannello statistiche private (`StatistichePrivate`): numeri
  live di like (con lista di CHI), commenti, salvataggi (solo numero, R-14),
  reaction per tratto. Nessun altro le vede, nemmeno parzialmente.
- Lista commenti: top-level in ordine cronologico (asc), reply indentate di 1
  livello sotto il proprio parent ("Rispondi" su ogni top-level). Commento
  vocale = player inline compatto (durata da `audio_seconds`).
- Composer commento in basso: testo (≤ 1000) + tasto mic (hold-to-record ≤
  120s, preview → invia). Reply mode con banner "Rispondi a…" (pattern chat).
- Long-press su un commento → menu: Rispondi · Copia (testo) · Segnala ·
  Elimina (se mio **o se il drop è mio**).

**Dati letti**: RPC `drop_detail(p_drop)` (stessa shape del feed, contatori
solo se autore) + query commenti con RLS: pagina top-level (`parent_id is
null`, keyset asc) + fetch reply per gli id in pagina; embedding autore via FK
`profiles` (pattern PostgREST della chat).

**Dati scritti**: insert `drop_comments` (ottimistico con outbox commenti:
pending/failed/retry) · delete commento · like/save/reaction come S1.

**Stati**: loading · `drop_expired`/`drop_not_visible` → schermata "Questo drop
non è più disponibile" (identica nei due casi: non riveliamo se il drop esiste)
· offline (commenti in coda) · lista commenti vuota ("Rompi il ghiaccio — anche
con la voce 🎙️").

**Permessi**: `can_see_drop` ovunque (RLS commenti inclusa). L'autore del drop
vede tutto; l'amico vede contenuti ma zero cifre aggregate.

**Casi limite**: il drop scade CON la schermata aperta → le mutazioni tornano
`drop_expired`, banner "scaduto" e composer disabilitato · reply a una reply →
`reply_depth_exceeded` (la UI non lo permette, il server lo rifiuta comunque) ·
reply a commento di un altro drop → `invalid_parent` · commento su drop di un
ex-amico → `drop_not_visible` · 11 commenti in un minuto → `rate_limited`.

### S4 — Salvati

**Rotta**: `(main)/drop/salvati.tsx`.

**Scopo**: i segnalibri vivi. Promemoria esplicito dell'effimerità.

**Regioni/interazioni**: lista compatta (thumbnail/estratto + autore + **tempo
rimanente** "scade tra 3h") → tap → S3 · swipe/menu → Rimuovi dai salvati ·
header: "I salvataggi vivono quanto il drop: max 24h".

**Dati letti**: `drop_saves` dell'utente con embedding del drop (RLS) — i
salvati di drop scaduti sono già stati cancellati dal sistema.

**Dati scritti**: `unsave_drop`.

**Stati**: vuoto ("Niente in dispensa — i drop salvati vivono qui per 24h") ·
loading/errore standard.

**Casi limite**: drop salvato che scade mentre la lista è aperta → tap →
"non disponibile", riga via al refetch.

### S5 — Ricordi (archivio privato dell'autore)

**Rotta**: `(main)/profilo/ricordi.tsx` (ingresso dal profilo proprio).

**Scopo**: la memoria privata (stile BeReal Memories): rivivere i propri
momenti e le statistiche finali, senza vetrina.

**Regioni/interazioni**: griglia/timeline per giorno (`RicordiGrid`):
thumbnail foto, glifo audio con durata, estratto testo · tap → vista Ricordo:
il contenuto + `stats_finali` ("Il tuo drop ha fatto compagnia a: ♥ 12 · 💬 5 ·
🔖 2 · 😂 4") · menu ⋯ → Elimina definitivamente (conferma `conferma()` —
rimuove riga + file via coda cleanup).

**Dati letti**: query diretta `drops where author_id = me and expires_at <
now()` (la RLS lo consente già oggi), keyset desc; signed URL on-demand.

**Dati scritti**: delete drop (Ricordo).

**Stati**: vuoto ("I tuoi drop scaduti riposano qui, visibili solo a te") ·
loading/errore standard.

**Permessi**: SOLO autore — RLS `author_id = uid` sui drop scaduti + policy
storage `can_see_drop` (che per l'autore è sempre vera).

**Casi limite**: Ricordo con file già ripulito da un bug/cleanup → placeholder
"file non più disponibile" (la riga e le stats restano) · eliminazione durante
offline → mutazione in coda TanStack standard (non serve outbox).

### S6 — Menu ⋯ e gerarchia dei gesti (overlay, non rotta)

**Scopo**: tutte le azioni secondarie, via `lib/dialoghi.ts` (`mostraMenu` —
MAI `Alert.alert`, regola eslint esistente).

**Menu del drop (⋯ sulla card / nel dettaglio)**:
- Drop di un amico: **Salva/Rimuovi dai salvati** · **Inoltra in chat** (S7) ·
  **Rispondi in privato** (apre la DM con riferimento precompilato, §16.1) ·
  **Dai Aura** (secondo livello: i 4 tratti — stessa via del long-press ♥) ·
  **Segnala** (secondo livello: motivi `REPORT_REASONS` esistenti →
  `file_report('drop', id, motivo)`) — pattern menu a 2 livelli di CM6.5.
- Drop mio: **Statistiche** (scroll al pannello) · **Inoltra in chat** ·
  **Elimina** (distruttiva, `conferma()`: "Sparirà subito anche per i tuoi
  amici").

**Gerarchia dei gesti (R-05, da fissare in UI una volta sola)**:
- **Tap ♥ / doppio tap** = like. Leggero, reversibile, privato, zero conseguenze.
- **Long-press su ♥** = barra reaction-tratto (gentile 💛 / divertente 😂 /
  accogliente 🤗 / utile 🧠). Forte: diventa un **prop**, alimenta l'Aura,
  notificato dalla pipeline props esistente. Haptic più marcato.
- **Press-and-hold sul mic** = reazione vocale rapida (commento audio ≤ 10s).

### S7 — Drop inoltrato in chat (`BollaDropRef`)

**Scopo**: portare un momento dentro una conversazione senza copiarlo.

**Comportamento**: il messaggio inoltrato è un messaggio di testo con
`drop_ref` valorizzato; la bolla lo risolve a schermo con `drop_detail`:
- **Risolvibile** → mini-card: formato + autore + anteprima (thumb per le foto,
  glifo+durata per l'audio, estratto per il testo) + "Scade tra Xh". Tap → S3.
- **Non risolvibile** (scaduto, autore non amico del lettore, drop eliminato,
  utente cancellato) → bolla neutra "**Drop non disponibile**" — identica in
  tutti i casi (non riveliamo quale).

**Permessi**: la risoluzione avviene con la RLS del **lettore**: inoltrare non
estende mai la visibilità (R-08).

**Casi limite**: inoltro a un gruppo con membri non-amici dell'autore → ognuno
risolve per sé (alcuni vedono la card, altri "non disponibile") · `drop_ref`
che punta a un drop eliminato → `on delete set null`, la bolla degrada a "non
disponibile".

---

## 5. Ciclo di vita del drop

### 5.1 Creazione (ottimistica, offline-safe — RC-01)
1. Il client genera `dropId` (uuid) e accoda nell'outbox drop (`dropStore` +
   `lib/drops-outbox.ts`, specchio 1:1 dell'outbox chat).
2. Upload del file (se foto/audio) su path `<dropId>/<uid>/…` — **prima**
   dell'insert.
3. `insert drops {id: dropId, …}` → il trigger valida formato, path, limiti,
   rate-limit, `is_active_user`; forza autore/created/expires.
4. Card ottimistica in S1; errore di rete → `pending` + flush a riconnessione
   (`onRiconnessione`); errore server → `failed` con Riprova/Elimina.
5. After-insert (esistente): Aura `participation` 1/n + achievement `first_drop`.

### 5.2 Vita (0–24h)
Visibile agli amici (feed, dettaglio, inoltri risolvibili); interazioni aperte;
l'autore vede le statistiche live.

### 5.3 Scadenza (effimerità logica — R-01)
Il cron `expire_content` (ogni 5 min), per i drop con `expires_at < now()` e
`stats_finali is null`:
1. **congela** le statistiche in `stats_finali` (idempotente);
2. **cancella le interazioni**: commenti (con file audio → coda cleanup), like,
   salvataggi, reaction (i props/Aura già emessi restano nel ledger — è già
   così oggi);
3. **NON cancella la riga** del drop: per gli amici sparisce (RLS
   `expires_at > now()`), per l'autore diventa un Ricordo.

Percezione utente: il drop sparisce dal feed al primo refetch; le azioni su un
drop appena scaduto ricevono `drop_expired` (mappato con gentilezza).

### 5.4 Eliminazione anticipata
Solo l'autore, in qualunque momento (anche da Ricordo): delete della riga →
FK cascade sulle interazioni residue + trigger after-delete accoda i file alla
pulizia. Sparisce subito per tutti.

### 5.5 GDPR
- **Export** (art. 15): la Edge `gdpr-export` include già i drops; da estendere
  a commenti, like, salvataggi dell'utente (DM6).
- **Delete** (art. 17): `process_account_deletion` già cancella i drops
  dell'utente (cascade sulle interazioni); da estendere a commenti/like/salvati
  lasciati **su drop altrui**; i file finiscono in coda cleanup via trigger.

---

## 6. Realtime e sincronizzazione

- **Feed (S1): NESSUN realtime.** Pull-to-refresh + refetch on focus. Scelta
  deliberata anti-doomscroll (il feed non "cresce sotto i pollici") e di
  batteria/costi.
- **Dettaglio (S3): realtime SOLO a schermata aperta** — un canale
  `postgres_changes` per-drop (filter `drop_id=eq.X`) su `drop_comments`
  (INSERT/DELETE), chiuso all'unmount (pattern `subscribeConversation`). La RLS
  filtra i sottoscrittori. Nota da CM4: i DELETE realtime espongono la sola PK
  — nessun contenuto.
- **Like/salvataggi: niente realtime** (contatori privati: il live-ticking è
  esattamente l'ansia che non vogliamo; l'autore vede i numeri aggiornarsi al
  refetch/focus).
- Cache: TanStack Query con `dropKeys` factory; invalidation mirata per
  feed/detail/comments/saved/memories; mutazioni ottimistiche
  onMutate/onError/onSuccess (modello `useToggleReaction`).

---

## 7. Notifiche

| Evento | Notifica | Motivo |
|--------|----------|--------|
| Commento sul mio drop | ✅ `drop_comment` — "«Ale» ha commentato il tuo drop" | La conversazione è il valore. |
| Reply a un mio commento | ✅ `drop_comment` all'autore del commento padre (e all'autore del drop se diverso, dedup) | Continuità di conversazione. |
| Like | ❌ MAI | Gesto leggero: notificarlo lo trasformerebbe in slot machine (R-15). |
| Salvataggio | ❌ MAI | Privato per natura (R-14). |
| Reaction-tratto | (già coperta) arriva come notifica `prop` dalla pipeline esistente | Nessun doppione. |

Regole: **mai numeri nel testo** ("ha commentato", non "3 nuovi commenti") ·
dedup anti-spam: niente nuova notifica `drop_comment` se ne esiste una non
letta per lo stesso drop creata negli ultimi 10 minuti · mai notificare se
stessi · payload `{drop_id, comment_id}` → deep link S3 · consegna push via
pipeline esistente (`enqueue_notification` → `dispatch_push` → Edge
`send-push`), nessun nuovo canale.

---

## 8. Permessi & privacy (matrice)

| Cosa | Autore | Amico | Non-amico | Note |
|------|:------:|:-----:|:---------:|------|
| Drop vivo (contenuto + file) | ✅ | ✅ | ❌ | RLS `drops_select_visible` v2 + policy storage `can_see_drop`. |
| Drop scaduto (Ricordo) | ✅ | ❌ | ❌ | La riga resta, la RLS la nasconde ai non-autori. |
| Commenti (contenuto) | ✅ | ✅ | ❌ | Sono contenuto: chi vede il drop partecipa. |
| **Numero** commenti | ✅ | ❌ (solo `ha_commenti` bool) | ❌ | RPC valorizza i count solo per l'autore. |
| **Numero** like + CHI | ✅ | ❌ (vede solo il proprio) | ❌ | RLS `drop_likes`: riga visibile a se stessi ∨ autore del drop. |
| **Numero** salvataggi | ✅ (solo numero, mai chi) | ❌ | ❌ | R-14; RLS `drop_saves` select_own + count in RPC. |
| Reaction-tratto | ✅ (aggregate per tratto) | vede le proprie | ❌ | Il prop generato segue le regole props esistenti. |
| `stats_finali` | ✅ | ❌ | ❌ | La riga scaduta è visibile solo all'autore. |
| Eliminare un commento | ✅ (qualsiasi, sul proprio drop) | ✅ (solo il proprio) | — | Safety: l'autore governa il proprio spazio. |

Principio: **l'anti-vanity è enforced a livello dati** (R-04). Un non-autore
non può ottenere i numeri nemmeno interrogando PostgREST direttamente: le RLS
non gli mostrano le righe da contare e la RPC non valorizza i campi.

---

## 9. Moderazione & safety

- **Segnalazione**: `file_report('drop' | 'drop_comment', id, motivo)` — il
  target `drop` esiste già nel backend live; `drop_comment` è nuovo (enum +
  ramo in `moderation_target_user`). Motivi: i `REPORT_REASONS` esistenti.
- **Testo → AI**: body/caption dei drop e commenti testuali passati a
  `moderate-text` fire-and-forget dal client (pattern CM8): Perspective scrive
  in `moderation_queue`, auto-mute soft sopra soglia critica, degrada con
  grazia senza chiave.
- **Foto: nessuna AI in M6** (Perspective è solo testo). Mitigazioni: audience
  ristretta ai soli amici accettati (niente viralità), segnalazione a un tap,
  coda umana, auto-sanzioni della pipeline. **Debito dichiarato**: valutare una
  Edge di image-moderation (vision API) post-lancio.
- **Sanzioni**: `mute`/`ban` bloccano la creazione (drop E commenti) via
  `is_active_user()` nei trigger — unico punto di enforcement esistente; la
  lettura resta. Azioni confermate → Aura `toxicity` + `audit_log` (pipeline
  esistente, nessuna modifica).
- **Spazio dell'autore**: l'autore del drop può rimuovere qualunque commento
  dal proprio drop (S3) — la moderazione distribuita più efficace per un social
  di adolescenti.
- **Rate-limit server**: 20 drop/24h per autore, 10 commenti/60s — anti-spam
  puro (l'anti-farming reputazionale lo fa già l'Aura).

---

## 10. Aura (invariata in M6 — R-13)

| Segnale | Effetto Aura | Stato |
|---------|--------------|-------|
| Pubblicare un drop | `participation` a rendimenti decrescenti (1/n nel giorno) | ✅ live (trigger) |
| Drop nel punteggio v3 | audio 20 pt (cap 140) · media/testo 15 pt (cap 105), finestra 7gg | ✅ live |
| Reaction-tratto ricevute | scaglioni 10×5 + 20×2 + 20×1 (cap 150) + prop sul tratto | ✅ live |
| Profilo completo | richiede ≥ 1 drop (tra le altre cose) | ✅ live |
| **Like** (dare/ricevere) | **ZERO** | by design |
| **Commenti** (dare/ricevere) | **ZERO in M6** | R-13: rivalutare i commenti vocali come segnale in una futura Aura v4, con dati reali anti-farming |

Nessuna modifica alle funzioni Aura v3: M6 non tocca
`aura_static_points`/`aura_dynamic_points`/`recompute_aura`.

---

## 11. Catalogo casi limite

1. **Drop scade durante l'interazione** → ogni mutazione risponde
   `drop_expired`; UI: banner + refetch. Il commento ottimistico fallisce con
   messaggio gentile.
2. **Reply a una reply** → `reply_depth_exceeded` (UI non lo offre, server
   rifiuta comunque).
3. **Reply a un commento di un altro drop** → `invalid_parent`.
4. **Inoltro a chi non è amico dell'autore** → bolla "Drop non disponibile"
   (risoluzione con RLS del lettore, R-08).
5. **Amicizia rimossa dopo like/salvataggio** → le righe restano ma il drop
   sparisce (RLS); alla scadenza il sistema le cancella comunque.
6. **Blocco tra autore e commentatore** → il blocco rimuove l'amicizia
   (`block_user` esistente): il drop sparisce per il bloccato.
7. **Upload riuscito, insert mai avvenuto** (app uccisa) → file orfano nel
   bucket: non referenziato, non leggibile da terzi (policy), ripulito da uno
   sweep periodico dedicato (debito documentato, R-09).
8. **Doppio like concorrente** → PK viola su insert; il toggle client è
   idempotente per natura (insert/delete).
9. **21° drop del giorno / 11° commento al minuto** → `rate_limited`.
10. **Drop eliminato mentre qualcuno ha S3 aperta** → il canale realtime è sui
    commenti, non emette nulla per il delete della riga drop: la prossima
    mutazione fallisce con `drop_not_visible`, banner e uscita.
11. **Commento vocale su drop che scade durante la registrazione** → insert
    rifiutata (`drop_expired`), la preview resta scartabile.
12. **Utente GDPR-cancellato** → i suoi drop spariscono (delete esistente); i
    suoi commenti su drop altrui vengono cancellati (DM0); "Drop non
    disponibile" per i riferimenti in chat.
13. **Autore mutato con drop vivi** → i drop restano visibili (la sanzione
    blocca la creazione, non la lettura — coerente con la chat).
14. **Orologio client sballato** → tutti i tempi (`expires_at`, "scade tra")
    derivano dal dato server; il client mostra tempo relativo, mai calcoli
    locali di scadenza.
15. **Stessa foto in due drop** → path diversi (id drop diverso): nessuna
    dedup, nessun problema.

---

## 12. Stati trasversali

Ogni schermata implementa i 5 stati canonici (SRS chat §14, componenti
esistenti): **loading** (skeleton dedicato per il feed) · **vuoto** (copy
dedicata per schermata, vedi S1–S5) · **errore** (`StatoErrore` con retry) ·
**offline** (banner esistente + outbox pending; lettura dalla cache) ·
**successo/idle**. Gli errori server sono stringhe-codice mappate in
`lib/errors.ts` (`dropErrorMessage()`): mai stack trace all'utente, sempre
italiano, sempre un'azione suggerita.

---

## 13. Mappatura capacità backend: ESISTE vs GAP

| Requisito | Backend | Frontend | Milestone |
|-----------|:-------:|:--------:|:---------:|
| Drop 3 formati (text/audio/media) | ✅ live (`drops` + check aura_v3) | ❌ | DM1 |
| Visibilità solo-amici | ⚠️ c'è ma col ramo school da rimuovere (`can_see_drop`, policy) | ❌ | DM0 |
| Caption per foto/audio (`body`) | ⚠️ colonna c'è, mancano limiti/validazione | ❌ | DM0/DM1 |
| Durata audio (`audio_seconds`) | ❌ | ❌ | DM0/DM1 |
| Validazione path storage + bucket dedicati | ❌ (`audio_url`/`media_url` liberi, nessun bucket drops) | ❌ | DM0 |
| Reaction-tratto → props → Aura | ✅ live (`drop_reactions`) | ❌ | DM2/DM4 |
| Aura participation + punti v3 + `first_drop` | ✅ live | — | — |
| Commenti (testo+vocali, reply 1 livello) | ❌ | ❌ | DM0/DM3 |
| Like (contatore privato) | ❌ | ❌ | DM0/DM4 |
| Salvataggi (segnalibro effimero) | ❌ | ❌ | DM0/DM4 |
| Ricordi + `stats_finali` | ❌ (oggi `expire_content` CANCELLA i drop) | ❌ | DM0/DM4 |
| Feed RPC con contatori privati | ❌ | ❌ | DM0/DM2 |
| Notifiche `drop_comment` | ❌ (enum non ha tipi drop) | ❌ | DM0/DM5 |
| Inoltro in chat (`drop_ref`) | ❌ | ❌ | DM5 |
| Segnala drop | ✅ live (`file_report` target `drop`) | ❌ | DM4 |
| Segnala commento | ❌ (target `drop_comment` nuovo) | ❌ | DM0/DM3 |
| Realtime commenti | ❌ (publication da estendere) | ❌ | DM0/DM3 |
| Cleanup file storage | ❌ (debito noto: DELETE su storage.objects vietata) | — | DM0/DM6 |
| GDPR export/delete esteso | ⚠️ drops sì, interazioni no | — | DM0/DM6 |
| Menu di creazione dal + (S0) | — | ❌ (`crea.tsx` è una schermata-frame) | DM1 |
| pgTAP invarianti drops v2 | ⚠️ plan(209) senza le novità | — | DM0 |
| Tipi TS (`drop_comments`, `drop_likes`, `drop_saves`, RPC) | — | ❌ (`drop_reactions` nemmeno modellata) | DM0 |

---

## 14. Decisioni — TUTTE CHIUSE

**R-01 (Effimerità logica, non fisica)** → **CHIUSA**: alla scadenza
`expire_content` NON cancella più la riga di `drops`: congela `stats_finali`,
cancella le interazioni e lascia la riga visibile al solo autore (la RLS
esistente già distingue autore/altri su `expires_at`). *Motivo*: i "Ricordi"
arrivano gratis — zero tabelle nuove, zero copie di file, zero migrazione dati;
l'effimerità percepita resta identica. → DM0.

**R-02 (Audience solo amici, scuola deprecata)** → **CHIUSA**: `audience`
resta come colonna ma il CHECK si restringe a `('friends')`; il ramo school
sparisce da `can_see_drop` e dalla policy select; le righe esistenti vengono
aggiornate prima del nuovo constraint. *Motivo*: decisione D-3 del product
owner; tenere la colonna lascia il punto di estensione per una futura audience
`circle` senza nuove migrazioni di colonna. → DM0.

**R-03 (Id del drop generato dal client)** → **CHIUSA**: grant insert include
`id`; il trigger fa `coalesce(new.id, gen_random_uuid())`. *Motivo*: l'outbox
carica i file PRIMA dell'insert su path `<drop_id>/<author_id>/…` e il trigger
valida il prefisso (pattern `chat_media_hardening`): senza id client-side il
path non potrebbe esistere prima della riga. Rischi mitigati: collisione = PK
violata; il prefisso lega comunque id→autore. → DM0.

**R-04 (Contatori privati enforced a livello dati)** → **CHIUSA**: i numeri
viaggiano SOLO dentro `drops_feed`/`drop_detail` (SECURITY DEFINER) che li
valorizza esclusivamente per `author_id = uid`; la RLS di `drop_likes` mostra
le righe solo a se stessi ∨ autore; `drop_saves` solo a se stessi. I commenti
sono contenuto (leggibili da chi vede il drop) ma nessuna cifra aggregata è
esposta a non-autori. *Motivo*: D-2; l'anti-vanity di UI si aggira, quello di
RLS no. → DM0.

**R-05 (Like ≠ reaction-tratto, coesistono)** → **CHIUSA**: `drop_likes` è un
gesto leggero (zero Aura, zero notifiche, zero props); `drop_reactions` resta
invariata come gesto forte (→ prop → Aura). Gerarchia UI fissata in S6.
*Motivo*: stessa architettura a due livelli già decisa per la chat (reazioni
emoji leggere vs prop); l'Aura resta non-farmabile coi tap. → DM0/DM4.

**R-06 (Bucket dedicati, lettura via can_see_drop)** → **CHIUSA**: bucket
privati `drop-media` (15 MB, immagini) e `drop-audio` (25 MB, audio, condiviso
da drop vocali e commenti vocali con prefissi file `drop_`/`commento_`), policy
di lettura `can_see_drop(path[1]::uuid, auth.uid())`, scrittura/delete
`path[2] = uid`. *Motivo*: la visibilità di un file coincide SEMPRE con quella
del drop (vale anche per i Ricordi: per l'autore `can_see_drop` è sempre vera);
una sola policy per bucket. → DM0.

**R-07 (Commenti flat + 1 livello)** → **CHIUSA**: `parent_id` self-FK; il
trigger rifiuta reply-di-reply (`reply_depth_exceeded`) e parent di altro drop
(`invalid_parent`). *Motivo*: D-4; la densità di Reddit senza la sua UX
d'albero, ingestibile su mobile e su contenuti che vivono 24h. → DM0.

**R-08 (Inoltro = riferimento, mai copia)** → **CHIUSA**:
`messages.drop_ref uuid references drops(id) on delete set null`; risoluzione
con la RLS del lettore. *Motivo*: inoltrare non deve estendere la visibilità
né far sopravvivere il contenuto alla scadenza; zero duplicazione storage.
→ DM5.

**R-09 (Pulizia storage event-driven)** → **CHIUSA**: `storage_cleanup_queue`
alimentata dai trigger di cancellazione + Edge `storage-cleanup` (service_role
+ Storage API, cron 15 min). *Motivo*: l'hosted vieta la DELETE SQL su
`storage.objects` (verificato in CM8); la coda evita listing-scan costosi e
sana anche il debito chat. Debito residuo dichiarato: file orfani da
upload-senza-insert (nessun evento DB) → sweep dedicato futuro. → DM0/DM6.

**R-10 (Retention Ricordi illimitata)** → **CHIUSA**: i Ricordi restano
finché l'autore non li elimina (BeReal-style); eliminazione libera, anche
massiva in futuro. *Motivo*: il valore emotivo dell'archivio privato cresce
col tempo; il costo storage è mitigato da quality 0.7 e m4a (≈0,3–1 MB/drop) e
rivalutabile con dati reali (cap 12 mesi possibile in seguito). → DM4.

**R-11 (Caption = `body` riusato)** → **CHIUSA**: nessuna colonna nuova; il
trigger impone testo ≤ 2000 per `text` e caption ≤ 280 per `media`/`audio`.
*Motivo*: stessa scelta della chat (caption nel `body` del messaggio media);
meno superficie, stessa espressività. → DM0.

**R-12 (Niente edit sui contenuti effimeri)** → **CHIUSA**: né drop né
commenti si modificano; si elimina e si rifà. *Motivo*: un contenuto che vive
< 24h non giustifica il costo di edited_at/finestre/UI; coerente con "le
caption non si editano" di CM5. → sempre.

**R-13 (Like e commenti NON emettono Aura in M6)** → **CHIUSA**: nessun
`emit_aura` su like/commenti; restano participation (pubblicare) e
reaction-tratto (ricevere). *Motivo*: anti-farming — commenti e like sono
gratuiti e ripetibili, il peso reputazionale renderebbe banale il gaming;
rivalutare i commenti vocali come segnale in una Aura v4 con dati reali. → DM0.

**R-14 (Salvataggi: solo il numero, mai chi)** → **CHIUSA**: l'autore vede il
count dei salvataggi ma non l'elenco degli utenti. *Motivo*: salvare è più
intimo di un like (è "per me", non "per te"); esporre chi salva creerebbe
imbarazzo sociale e disincentiverebbe l'uso. → DM0.

**R-15 (Notifiche: solo drop_comment, senza numeri, dedup 10 min)** →
**CHIUSA**: come §7. *Motivo*: la conversazione merita l'interruzione, i
gesti leggeri no; i numeri nelle notifiche sono vanity travestita. → DM0/DM5.

**R-16 (Creazione dal + della bottom bar via menu)** → **CHIUSA**: il pulsante
+ apre un bottom sheet pulito (S0) con le voci Drop in testa; la
schermata-frame `crea.tsx` si evolve in questo menu. *Motivo*: decisione
product owner (2026-07-05) — creare deve costare due tap dal posto dove il
pollice già si trova; il menu scala con i futuri tipi creabili. → DM1.

---

## 15. Requisiti di completezza (best practice 2026 — D-5)

**RC-01 — Pubblicazione ottimistica e offline-safe.** Outbox drop dedicato
(specchio dell'outbox chat CM2): id client, upload prima dell'insert,
pending/failed/retry, flush automatico alla riconnessione, guardia anti doppio
invio. *Motivo*: su mobile la rete è uno stato, non un errore.

**RC-02 — Contatori privati non ottenibili dal client.** Vietato che un
non-autore possa contare like/salvataggi via PostgREST (`count`, `select`):
le RLS non gli mostrano le righe; la RPC non valorizza i campi. Invariante
pgTAP dedicata. *Motivo*: D-2 a prova di client ostile.

**RC-03 — Feed finito con paginazione keyset.** `drops_feed` pagina su
`(created_at, id)` (mai OFFSET), indice dedicato, pagina ~20; il client
prefetcha la pagina successiva e le signed URL della pagina visibile.
*Motivo*: fluidità percepita e costi lineari; il feed amici×24h resta bounded
by design.

**RC-04 — Realtime solo dove serve.** Un canale per-drop sui commenti, vivo
solo con S3 aperta; feed e contatori senza realtime. *Motivo*: batteria, costi
Supabase Realtime, anti-ansia.

**RC-05 — Deep link completi.** `drop_comment` → S3 anche a freddo (cold
start), con dedup del tap (pattern CM6). *Motivo*: la notifica è un contratto:
se la tocchi, arrivi.

**RC-06 — Rate-limit server.** 20 drop/24h, 10 commenti/60s, enforced nei
trigger (`rate_limited`). *Motivo*: anti-spam anche con client compromesso;
i limiti UX li racconta con gentilezza.

**RC-07 — Cleanup storage garantito.** Ogni cancellazione di riga con file
(drop, commento vocale, GDPR) accoda il path; la Edge `storage-cleanup` li
rimuove a batch. Vale anche per i domini chat (debito CM8 sanato). *Motivo*:
D-5 — i byte orfani sono costi e dati personali che restano.

**RC-08 — GDPR completo.** Export: drops + commenti + like + salvataggi.
Delete: tutto ciò che l'utente ha creato, anche su drop altrui, file inclusi.
*Motivo*: obbligo di legge, art. 15/17.

**RC-09 — pgTAP con guardie anti-regressione.** Oltre a RLS/grant/policy delle
tabelle nuove: guardia che `can_see_drop` NON contenga più `school`; guardia
che `expire_content` NON contenga `delete from public.drops`; `security
definer` + `search_path=''` su tutte le RPC nuove. *Motivo*: le due semantiche
cambiate (audience, scadenza) sono i punti dove una regressione farebbe più
male.

**RC-10 — Tipi TS a mano allineati.** Ogni milestone backend aggiorna
`types/supabase.ts` nello stesso commit (3 tabelle nuove, colonne drops, 4
RPC, 2 enum estesi, `messages.drop_ref`; `drop_reactions` va modellata — oggi
manca del tutto). *Motivo*: il piano Free blocca `gen types`; i tipi mentiti
sono bug a runtime (lezione M3).

---

## 16. Feature UX aggiuntive (brainstorm con giudizio)

### 16.1 Incluse in M6 (costo marginale ~zero, valore alto)

| Feature | Meccanica | Perché |
|---------|-----------|--------|
| **Reazione vocale rapida** | Press-and-hold sul mic della card → commento audio ≤ 10s senza aprire il dettaglio (riusa `drop_comments` type audio) | La voce come gesto primario: rispondere a un momento con la voce è il DNA di Televo. Costo: solo UI. |
| **"Sei in pari ✓"** | Fine feed celebrata (micro-animazione + copy) + CTA reali (manda un vocale, crea un drop) | L'anti-doomscroll reso VISIBILE e gratificante invece che frustrante. Costo: un componente. |
| **Statistiche private dell'autore** | Pannello live in S3 (chi ha messo like, reaction per tratto, numeri) + `stats_finali` congelate nei Ricordi | Tutta la gratificazione, zero vetrina: il dopamine-hit resta personale. Costo: già nel modello dati. |
| **Rispondi in privato** | Dal menu ⋯ → apre la DM con l'autore con riferimento al drop precompilato (`get_or_create_dm` + `drop_ref`) | Friends-centrico: sposta la conversazione nell'intimità della chat, dove Televo è già forte. Costo: riuso quasi totale. |

### 16.2 Differita con decisione esplicita del product owner

**Drop del giorno** (prompt curato): tabella `drop_prompts` (testi in italiano,
curati), pick giornaliero via cron, banner nel composer ("Il tema di oggi:
…"), notifica `drop_prompt` a orario semi-random nel pomeriggio. Dà il "perché
proprio ora" di BeReal senza la sua ansia da timer (rispondere è opzionale e
non scade). Prevista come DM7 opzionale: **decidere prima di costruirla** (è
l'unica feature che manda una notifica non richiesta: va dosata).

### 16.3 Valutato e RIMANDATO (buone, non ora)

- **Audience "Cerchia"** (`audience='circle'` = solo i `top_friends` 1–8, già
  a DB): intimità granulare; rimandata perché la colonna è già pronta a
  riceverla e la UI top-friends non esiste ancora.
- **Catena di drop** ("passa il microfono": un drop audio invita 1 amico a
  continuare): potente per il PoH ma rischia pressione sociale — da testare
  dopo il lancio con utenti veri.
- **Ricordi ri-condivisibili** ("un anno fa…" → ripubblica come nuovo drop
  24h): coerente coi pilastri, ha senso solo quando esisteranno Ricordi
  vecchi di mesi.

### 16.4 Valutato e SCARTATO (con motivo)

- **Contatori pubblici / leaderboard dei drop**: contraddizione frontale del
  pilastro anti-vanity (D-2). Non se ne riparla.
- **Feed di scoperta non-amici**: rompe il modello friends-only (D-3) e la
  safety dei minori (contenuti di 16enni a sconosciuti). No.
- **Threading annidato stile Reddit**: UX d'albero ingestibile su mobile, in
  conflitto con l'effimerità (le grandi discussioni hanno bisogno di tempo).
- **Dual-camera simultanea stile BeReal**: expo-camera non espone capture
  simultanea front+back affidabile; richiederebbe Dev Build + librerie native
  dedicate per un guadagno di autenticità che la foto singola già dà. Fuori.
- **Video**: costi storage/moderazione di un altro ordine di grandezza; la
  voce è la scommessa identitaria di Televo, il video la diluirebbe.
- **Vibe check** (mood 1-tap sull'avatar): ridondante con `status_text` e con
  il colore Aura che già raccontano "come sto".
- **Streak sui drop**: la streak esiste già in chat; duplicarla sui drop
  trasformerebbe la pubblicazione in obbligo quotidiano (anti-pilastro 3).

---

# PARTE II — PIANO DI IMPLEMENTAZIONE

## 17. Come usare questo piano

- **Una milestone alla volta**, completa di verifica, come per la chat
  (CM0–CM8). Un commit per blocco, messaggio `M6-DMx — titolo`.
- Prima di ogni milestone: **ri-verificare lo stato reale** (migrazioni via
  `schema_migrations`, non memoria; file via lettura, non ricordo).
- Le migrazioni si applicano **via pooler** (Deno + postgres.js — la CLI
  supabase è bloccata su questa macchina da criterio Windows), ricordando di
  registrare la versione in `supabase_migrations.schema_migrations` (script
  collaudato `apply_migration.ts`).
- Convenzioni vincolanti ereditate (CLAUDE.md §6 + CM8): migrazioni con header
  `=== ===` e razionale in italiano · funzioni `security definer set
  search_path = ''` schema-qualificate · RLS su ogni tabella, policy
  `<tabella>_<azione>_<scope>`, predicati `(select auth.uid())` · **revoke all
  + grant minimo per-colonna** su ogni tabella nuova (i DEFAULT PRIVILEGES
  dell'hosted concedono ALL: senza revoke esplicito i grant sono cosmetici) ·
  trigger che forzano i campi di sistema · mutazioni sensibili via RPC ·
  funzioni trigger modificate col metodo **"verbatim + add"** (si riparte dal
  corpo live e si aggiunge, mai riscrivere da zero) · pgTAP aggiornato con
  `plan(N)` corretto · `tsc --noEmit` + `eslint` puliti a ogni milestone
  frontend · niente `Alert.alert` (sistema dialoghi CM6.5).

## 18. Stato attuale (fotografia al 2026-07-05)

**Backend live** (42 migrazioni, pgTAP 209/209 sul remoto): `drops` a 3 formati
con reactions→props, Aura v3, moderazione target `drop`, `expire_content` v4
che CANCELLA i drop scaduti, grants CM8, nessuna tabella
commenti/like/salvataggi, nessun bucket drops, nessuna notifica drop, nessuna
RPC feed. **Mobile**: dominio drops greenfield (`DropCard.tsx`, `DropFeed.tsx`,
`useDrops.ts` vuoti; nessuna rotta; `drop_reactions` assente dai tipi TS);
pattern collaudati da riusare: outbox chat, `lib/media.ts`, `lib/audio.ts`
(expo-av), `ViewerMedia`, dialoghi dark, `useToggleReaction`,
`useInfiniteQuery`, realtime per-entità, `useDropCount` (già filtra
`expires_at`: compatibile con R-01). **In coda deploy owner** (prerequisito
esterno, non bloccante per DM0–DM5): `gdpr-export` v2 e `send-push` v2.

## 19. Gap analysis sintetica

La tabella §13 è la fonte; in sintesi le dipendenze dure:

```
DM0 (fondamenta DB+storage+RPC)  ← tutto il resto dipende da qui
  ├─→ DM1 (menu + + composer + outbox)
  │     └─→ DM2 (feed + card)
  │           └─→ DM3 (dettaglio + commenti + realtime)
  │                 └─→ DM4 (like, salvati, Ricordi, menu ⋯)
  │                       └─→ DM5 (notifiche client + inoltro)
  ├─→ DM6 (Edge storage-cleanup + GDPR)      [parallelizzabile da DM1 in poi]
  └─→ DM7 (rifiniture + Drop del giorno? + MANUAL-TESTING)
```

L'ordine DM1→DM5 segue il funnel utente (creo → vedo → converso → gestisco →
vengo richiamato); DM6 è indipendente dal client e può correre in parallelo;
DM7 chiude.

## 20. Milestone

### DM0 — Fondamenta backend (nessun frontend)

**Obiettivo**: tutto il nuovo modello dati live sul remoto, coperto da pgTAP,
senza che il client esistente si accorga di nulla.

**Dipendenze**: nessuna.

**Backend — 4 migrazioni nell'ordine** (nomi indicativi, timestamp reali alla
stesura):

1. `..._drops_notify_enum.sql` — SOLO estensioni enum (vincolo Postgres: ADD
   VALUE in transazione separata dall'uso, pattern già rodato):
   `alter type public.notification_type add value if not exists 'drop_comment';`
   `alter type public.moderation_target add value if not exists 'drop_comment';`
2. `..._drops_v2.sql` — il drop "post":
   - `alter table drops add column audio_seconds integer, add column
     stats_finali jsonb;`
   - audience: `update drops set audience='friends' where audience='school';`
     → drop del check esistente → `check (audience in ('friends'))`.
   - `can_see_drop` v2 (senza ramo school: autore ∨ `are_friends`) — stessa
     firma, `create or replace`.
   - Policy `drops_select_visible` v2 (drop + recreate, senza school).
   - Trigger `drops_before_insert` v3 (**verbatim+add** sul corpo live):
     id client (`coalesce(new.id, ...)`), path obbligatori
     `<id>/<author_id>/…` per audio/media (`invalid_audio_path`/
     `invalid_media_path`), campi incrociati vietati (`invalid_drop_fields`),
     `audio_seconds` obbligatoria 1–300 per audio (`invalid_audio_duration`),
     body ≤ 2000 su text (`drop_too_long`), caption ≤ 280 su media/audio
     (`caption_too_long`), rate-limit 20/24h (`rate_limited`).
   - Grant: `revoke insert on drops from authenticated;` → `grant insert (id,
     type, body, audio_url, media_url, audio_seconds, audience)`.
     `stats_finali` NON nel grant (solo sistema).
   - Indice `drops_author_created_idx (author_id, created_at desc)`.
   - Bucket via SQL (pattern `chat_media`): `drop-media` (privato, 15 MB,
     png/jpeg/webp) e `drop-audio` (privato, 25 MB, audio/*); policy storage:
     `drop_media_read_visible` / `drop_audio_read_visible` = path[1] uuid ∧
     `can_see_drop(path[1]::uuid, (select auth.uid()))`; `*_write_own` e
     `*_delete_own` = path[2] = uid.
   - RPC lettura SECURITY DEFINER (precedente: `chat_overview`):
     `drops_feed(p_before timestamptz default null, p_before_id uuid default
     null, p_limit int default 20)` — righe: colonne drop + `author jsonb`
     (id/username/display_name/avatar_url/aura_score/aura_color) + stato
     personale (`mio_like`, `mio_salvataggio`, `mie_reactions text[]`,
     `ha_commenti bool`) + contatori (`like_count`, `comment_count`,
     `save_count`, `reaction_counts jsonb`) valorizzati SOLO se `author_id =
     uid`; filtro `(are_friends ∨ author) and expires_at > now()`; keyset
     `created_at desc, id desc`; limit clampato ≤ 50. E `drop_detail(p_drop
     uuid)` con la stessa shape. Revoke from public + grant execute
     authenticated.
3. `..._drops_interactions.sql` — le interazioni:
   - `drop_comments` (schema §2.2: PK uuid, drop_id FK cascade, author_id,
     parent_id self-FK cascade, type text|audio, body, audio_url,
     audio_seconds, created_at; indici `(drop_id, created_at)`, `(author_id)`,
     parziale su parent_id). Trigger before-insert: forza autore/created,
     `is_active_user`, `can_see_drop` (`drop_not_visible`), drop vivo
     (`drop_expired`), coerenza formato (`empty_comment`/`missing_audio`/
     `invalid_comment_fields`/`comment_too_long`), path (`invalid_audio_path`),
     profondità 1 + stesso drop (`reply_depth_exceeded`/`invalid_parent`),
     rate-limit 10/60s. RLS: `drop_comments_select_visible` (can_see_drop),
     `drop_comments_insert_own`, `drop_comments_delete_own_or_drop_author`.
     Grant: select · insert (drop_id, parent_id, type, body, audio_url,
     audio_seconds) · delete. NIENTE update.
   - `drop_likes` (PK (drop_id, user_id), created_at). Trigger before-insert:
     forza user, can_see_drop, drop vivo, is_active_user. RLS:
     `drop_likes_select_own_or_author` (uid = user_id ∨ uid = autore del
     drop), `drop_likes_insert_own`, `drop_likes_delete_own`. Grant: select ·
     insert (drop_id) · delete. Toggle diretto, niente RPC.
   - `drop_saves` (PK (user_id, drop_id), created_at, indice `(user_id,
     created_at desc)`). Mutazioni SOLO via RPC definer `save_drop(p_drop)` /
     `unsave_drop(p_drop)` (controllo can_see_drop + drop vivo). RLS:
     `drop_saves_select_own`. Grant: solo select.
   - Revoke all + grant minimi espliciti su tutte e tre (convenzione CM8).
4. `..._drops_lifecycle.sql` — vita, morte e notifiche:
   - `expire_content` v5 (**verbatim+add** sulla v4): il blocco drops diventa —
     per i drop scaduti con `stats_finali is null`: (a) scrivi `stats_finali`
     aggregando like/commenti/salvataggi/reactions; (b) delete interazioni
     (comments → i file audio finiscono in coda via trigger; likes; saves;
     reactions); (c) **rimuovere il `delete from public.drops`**. Idempotente e
     O(nuovi-scaduti).
   - `storage_cleanup_queue (id bigint generated always as identity primary
     key, bucket text not null, path text not null, created_at timestamptz
     default now())`: RLS attiva SENZA policy (pattern audit_log), nessun
     grant a authenticated. Trigger after-delete: su `drops` (audio_url/
     media_url), su `drop_comments` (audio_url), su `messages` (audio_url dei
     vocali hard-deleted dal cron — sana il debito chat); enqueue anche
     nell'update di azzeramento GDPR dei media chat.
   - Trigger `drop_comments_after_insert_notify`: notifica `drop_comment`
     all'autore del drop (top-level) e all'autore del parent (reply), dedup,
     mai a se stessi, anti-spam 10 min (skip se esiste notifica non letta
     recente per lo stesso drop), titolo senza numeri, payload
     `{drop_id, comment_id}` — via `enqueue_notification` esistente.
   - `moderation_target_user` v2 (verbatim+add): ramo `'drop_comment'` →
     author_id del commento.
   - `process_account_deletion` v5 (verbatim+add): `delete from drop_comments
     where author_id = p_user` + `drop_likes`/`drop_saves` where user_id.
   - `alter publication supabase_realtime add table public.drop_comments;`
     (guardia idempotente).

**Backend — extra**: estendere `supabase/tests/rls_smoke.test.sql` (`plan(N)`
da 209 a ~245): esistenza/RLS/policy/grant delle 3 tabelle + coda; colonne
nuove di drops; check audience solo friends; guardie prosrc (`can_see_drop`
senza `school`, `expire_content` senza `delete from public.drops`, trigger
con i nuovi codici errore); `security definer` + `search_path` su
`drops_feed`/`drop_detail`/`save_drop`/`unsave_drop`; bucket e policy storage;
enum estesi. Suite eseguita **sul remoto via pooler** (pgtap in-transazione,
rollback — metodo collaudato CM8).

**Frontend**: SOLO `types/supabase.ts` (colonne drops, 3 tabelle nuove —
inclusa `drop_reactions` mai modellata —, 4 RPC, enum estesi) — nessun
comportamento nuovo.

**Rischi**: la migrazione 2 tocca policy/trigger live (ordine: update righe →
constraint; drop policy → recreate) · la semantica expire cambia per i drop
esistenti scaduti-ma-non-ancora-cancellati (il primo run scriverà stats_finali
"vuote" per drop vecchi: accettabile) · `drops_feed` deve replicare ESATTAMENTE
il predicato RLS (guardia pgTAP, lezione `chat_overview`).

**Checklist**:
- [ ] 4 migrazioni applicate via pooler + registrate in `schema_migrations`
- [ ] pgTAP ~245/245 verdi SUL REMOTO
- [ ] Smoke SQL via pooler: insert drop 3 formati con path validi/invalidi,
      commento+reply+reply-di-reply (rifiutata), like, save via RPC, scadenza
      simulata (update expires_at) → stats_finali scritte, interazioni sparite,
      riga viva; feed con 2 utenti (contatori null per il non-autore)
- [ ] `types/supabase.ts` allineato; `tsc --noEmit` pulito

**Criteri di completamento**: backend completo e invisibile al client attuale
(nessuna schermata esistente degrada).

### DM1 — Menu +, composer, creazione ottimistica

**Obiettivo**: da due tap sul + a un drop pubblicato nei 3 formati,
offline-safe.

**Dipendenze**: DM0.

**Frontend**: `MenuCrea` (S0, bottom sheet dal +; `crea.tsx`/`createTypes.ts`
evoluti: voci drop attive, altre "presto") · `drop/nuovo.tsx` (S2, 3 tab
formato, riuso media.ts/audio.ts, permessi con spiegazione) · `lib/drops.ts`
(upload path `<dropId>/<uid>/`, signed URL cache TTL 1h, `dropErrorMessage`) ·
`dropStore` + `lib/drops-outbox.ts` (specchio outbox chat: pending/failed/
retry/flush) · rotte in `routes.ts` · moderate-text fire-and-forget su
body/caption · badge "Scade tra 24h" e audience "Amici" fissa.

**Rischi**: doppia pubblicazione (guardia `inVolo`); upload grossi su rete
lenta (UI di progresso onesta); permessi OS negati (pattern CM7).

**Checklist**:
- [ ] Drop foto/audio/testo pubblicati da device reale, file nel bucket col
      path atteso
- [ ] Offline: pubblica → pending → riconnessione → flush automatico
- [ ] `rate_limited` e errori di validazione mappati in italiano
- [ ] `tsc` + `eslint` puliti

**Criteri**: creare è fluido, fallire è recuperabile, niente riga fantasma.

**Test**: manuale 2 formati media su iOS+Android (Expo Go), testo ovunque;
verifica path storage dal dashboard.

### DM2 — Feed & card

**Obiettivo**: la categoria Drops della Home è viva.

**Dipendenze**: DM1 (per vedere qualcosa di vero).

**Frontend**: `useDrops.ts` (`dropKeys`, `useDropsFeed` con `useInfiniteQuery`
keyset + prefetch pagina successiva) · `DropCard` (3 varianti; contatori
privati inline SOLO su drop propri; azioni ♥/💬/🔖; doppio tap like; long-press
reaction-tratto; hold-mic reazione vocale [stub fino a DM3]) · `DropFeed`
(FlatList, pull-to-refresh, skeleton, vuoto, `StatoErrore`) · "Sei in pari ✓"
· integrazione `home.tsx` (via `ComingSoon`) · riuso `ViewerMedia` per zoom
foto · player audio card (durata da `audio_seconds`, lazy signed URL al play).

**Rischi**: jank su liste miste media/audio (memo per variante, `expo-image`
cacheKey=path, niente layout animato per riga); signed URL scadute a
metà-scroll (cache TTL con margine, refresh on error).

**Checklist**:
- [ ] Amico vede il drop entro un pull-to-refresh; non-amico MAI
- [ ] NESSUN numero visibile su drop altrui (verifica visiva con 2 account)
- [ ] 60fps percepiti su lista da 30+ card miste
- [ ] `tsc` + `eslint` puliti

**Criteri**: il feed racconta le ultime 24h degli amici e FINISCE.

**Test**: 2 account amici + 1 estraneo; drop dei 3 formati; scroll fino a
"Sei in pari ✓".

### DM3 — Dettaglio & commenti (testo + voce)

**Obiettivo**: la conversazione attorno al drop, realtime, nei due formati.

**Dipendenze**: DM2.

**Frontend**: `drop/[id].tsx` (S3: hero + commenti + composer) ·
`useDropComments` (top-level keyset asc + fetch reply, embedding profiles) ·
outbox commenti (testo subito, vocale con upload-first) · `CommentoRow` +
player vocale compatto · reply mode 1 livello · `drops-realtime.ts`
(`subscribeDropComments`, mount/unmount con la schermata) · reazione vocale
rapida dalla card (S1) ora attiva · menu commento (Rispondi/Copia/Segnala/
Elimina) con `file_report('drop_comment', …)` · `StatistichePrivate` (dati
live da `drop_detail`) per l'autore.

**Rischi**: ordinamento commenti con realtime + ottimismo (dedup per id,
inserimento in coda cache); registrazione audio mentre un altro player suona
(pausa globale, pattern chat).

**Checklist**:
- [ ] Commento testo e vocale end-to-end tra 2 device, realtime < 2s
- [ ] Reply-di-reply impossibile da UI E rifiutata dal server
- [ ] Autore del drop elimina un commento altrui; l'autore del commento il suo
- [ ] Drop scaduto con schermata aperta → composer disabilitato con motivo
- [ ] `tsc` + `eslint` puliti

**Criteri**: S3 completa; il commento vocale è indistinguibile per qualità dal
vocale chat.

**Test**: 2 device; include segnalazione commento (verificare riga in
`reports` dal dashboard).

### DM4 — Like, salvati, Ricordi, menu ⋯

**Obiettivo**: tutti i gesti leggeri e l'archivio privato.

**Dipendenze**: DM3.

**Frontend**: `useToggleLike`/`useToggleSave` (mutazioni ottimistiche modello
`useToggleReaction`, rollback su errore) · `MenuDrop` (S6 via `mostraMenu`, 2
livelli per Dai Aura/Segnala) · `drop/salvati.tsx` (S4, tempo rimanente) ·
`profilo/ricordi.tsx` (S5, `RicordiGrid` + vista Ricordo con `stats_finali`) ·
eliminazione anticipata con `conferma()` · ingressi dal profilo.

**Rischi**: doppio gesto ♥ (tap vs long-press) da calibrare (delay/haptic);
cache incoerente dopo elimina (invalidation feed+detail+saved+memories).

**Checklist**:
- [ ] Like/save ottimistici con rollback verificato (aereo a metà tap)
- [ ] Contatori live visibili SOLO all'autore (2 account)
- [ ] Ricordo consultabile dopo scadenza simulata; elimina definitivo pulisce
      (riga + coda storage)
- [ ] Segnala drop → riga in `reports`
- [ ] `tsc` + `eslint` puliti

**Criteri**: l'autore ha la sua stanza dei ricordi; gli amici hanno gesti
senza numeri.

**Test**: scadenza simulata via pooler (update expires_at) + flusso completo
su 2 device.

### DM5 — Notifiche & inoltro in chat

**Obiettivo**: il drop entra nelle conversazioni; i commenti richiamano.

**Dipendenze**: DM3 (commenti), DM0 (notifiche server già attive).

**Backend** (micro-migrazione `..._drops_forward.sql`): `alter table messages
add column drop_ref uuid references drops(id) on delete set null;` + trigger
`messages_before_insert` v5 (**verbatim+add**): se `drop_ref` presente → type
'text', vietato con media/audio/reply/forward, nessun requisito di visibilità
lato mittente oltre can_see_drop (chi inoltra deve vederlo:
`drop_not_visible`) · grant insert esteso con `drop_ref` · pgTAP +3/4
invarianti · tipi TS.

**Frontend**: voce Inoltra nel `MenuDrop` → riuso `chat/inoltra.tsx`
(forwardDraft esteso al caso drop) · `BollaDropRef` in chat (risoluzione via
`drop_detail`, fallback "Drop non disponibile" identico per tutti i casi) ·
Rispondi in privato (DM + drop_ref precompilato) · deep link `drop_comment` →
S3 in `useNotifiche.ts` (`rottaPerNotifica` + cold start) · banner in-app se
S3 di quel drop è già aperta (soppressione, pattern chat).

**Rischi**: bolla che risolve N drop in una lista messaggi (cache per id,
niente waterfall); notifica su drop già scaduto al tap → S3 gestisce
`drop_expired`.

**Checklist**:
- [ ] Inoltro a DM/gruppo; destinatario non-amico dell'autore vede "non
      disponibile"
- [ ] Tap notifica commento → S3 (app aperta, background, cold start)
- [ ] Rispondi in privato apre la DM giusta con riferimento
- [ ] `tsc` + `eslint` puliti

**Criteri**: il riferimento non estende MAI la visibilità (verificato con 3
account).

**Test**: matrice 3 account (autore, amico, estraneo) × (inoltro, notifica,
risposta privata).

### DM6 — Cleanup storage & GDPR (parallelizzabile da DM1)

**Obiettivo**: nessun byte orfano, GDPR completo.

**Dipendenze**: DM0.

**Backend/Edge**: nuova Edge **`storage-cleanup`** (verify_jwt=false,
`x-cron-secret`, pattern `send-push`): preleva batch ≤ 500 dalla coda,
`storage.from(bucket).remove(paths)` con service_role, cancella le righe
riuscite, logga le fallite (retry naturale al giro dopo) · registrazione in
`config.toml` · cron pg_cron→pg_net ogni 15 min (Vault già configurato,
pattern `dispatch_push`; migrazione `..._storage_cleanup_cron.sql`) ·
`gdpr-export` v3: sezioni `drop_comments`, `drop_likes`, `drop_saves` (drops
già presente) — si accoda al deploy owner già pendente di
`gdpr-export`/`send-push`.

**Rischi**: la Edge non deve MAI cancellare path fuori dai bucket attesi
(whitelist bucket) · deploy Edge richiede l'account owner (CLI 403): coda
deploy documentata come per CM8.

**Checklist**:
- [ ] Elimina drop con foto → file sparito dal bucket entro un ciclo
- [ ] Vocali chat scaduti (debito CM8) ripuliti dalla stessa pipeline
- [ ] Export GDPR contiene le nuove sezioni (dopo deploy owner)
- [ ] Delete account: contenuti drops spariti ovunque, file in coda → rimossi

**Criteri**: il ciclo di vita dei BYTE coincide finalmente con quello dei dati.

**Test**: end-to-end via pooler + dashboard storage; simulare coda con path
inesistente (la Edge non si blocca).

### DM7 — Rifiniture, hardening, testing manuale

**Obiettivo**: chiusura del modulo con qualità da lancio.

**Dipendenze**: DM1–DM6.

**Contenuti**: decisione product owner su **Drop del giorno** (se sì: migrazione
`drop_prompts` + enum `drop_prompt` + cron pick + banner S2 + notifica; se no:
resta in §16.2) · micro-UX (haptic coerenti, skeleton, transizioni, copy
italiana rivista) · audit accessibilità base (target ≥ 44pt, contrasti) ·
pgTAP finale + smoke completo via pooler · **`docs/media/MANUAL-TESTING.md`**
(stile chat: prerequisiti 2 device + account A/B/C, sezioni per S0–S7,
scadenza simulata, matrice permessi, GDPR) · aggiornamento `roadmap.md` §M6 e
`CLAUDE.md` §4 (nuovo dominio) a modulo chiuso.

**Criteri di completamento (Definition of Done del modulo, §21)**.

## 21. Definition of Done — modulo Drops

- [ ] Le 5 decisioni D-1..D-5 sono osservabili nel prodotto reale (non solo
      dichiarate).
- [ ] Un non-autore non può ottenere alcun contatore, né da UI né da API
      (invariante pgTAP + verifica manuale con 2 account).
- [ ] Un non-amico non vede MAI nulla: righe, file, riferimenti, notifiche.
- [ ] pgTAP verde sul remoto con le guardie anti-regressione (school, expire).
- [ ] Drop e commenti nei 3/2 formati end-to-end su 2 device reali, offline
      incluso.
- [ ] Scadenza: feed pulito, Ricordi vivi, interazioni cancellate, file
      rimossi dalla pipeline cleanup.
- [ ] GDPR: export con le nuove sezioni, delete completo (dopo deploy owner).
- [ ] `MANUAL-TESTING.md` eseguito per intero.
- [ ] `roadmap.md` e `CLAUDE.md` aggiornati a modulo chiuso.

## 22. Rischi trasversali

| Rischio | Mitigazione |
|---------|-------------|
| Crescita storage dei Ricordi (retention illimitata R-10) | quality 0.7 + m4a; elimina libera; rivalutare cap con dati reali post-lancio. |
| Moderazione foto senza AI | Superficie solo-amici; report a un tap; coda umana; Edge vision post-lancio (debito dichiarato). |
| File orfani da upload-senza-insert | Non leggibili da terzi (policy); sweep dedicato futuro (debito R-09); volumi attesi minimi. |
| Semantica `expire_content` cambiata | Guardie pgTAP (`prosrc`); consumatori verificati (`useDropCount` filtra già expires_at; Aura è a finestra 7gg). |
| Doppio gesto ♥ tap/long-press | Calibrazione haptic + delay; spiegazione una-tantum al primo long-press. |
| Tipi TS a mano | RC-10: aggiornamento nello stesso commit della migrazione, checklist per milestone. |
| Id client-side | PK + formato uuid + prefisso path che lega id→autore (R-03). |
| RPC feed disallineata dalla RLS | Predicato identico a `can_see_drop`/policy + invariante pgTAP (lezione `chat_overview`). |
| CLI supabase bloccata | Pipeline pooler collaudata (migrazioni + pgTAP + smoke); Edge deploy = coda owner documentata. |

---

## Revision history

| Rev. | Data | Cosa |
|------|------|------|
| 1 | 2026-07-05 | Prima stesura completa: decisioni D-1..D-5 validate dal product owner (effimerità 24h + Ricordi privati, contatori privati, solo-amici con scuola deprecata, commenti testo+vocali 1 livello, best practice 2026); aggiunta in corsa la decisione R-16 (creazione dal + della bottom bar via menu). Parte I (S0–S7, R-01..R-16, RC-01..RC-10) + Parte II (DM0–DM7). |
