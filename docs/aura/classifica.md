# Televo — Classifica Aura (M16): Specifica di prodotto & Piano di implementazione

> **Rev. 1 — 2026-07-16.** Decisioni di prodotto **AC-1..AC-5 validate dal
> product owner** (2026-07-16, sessione di pianificazione). Questo è il
> documento ufficiale della milestone **M16 — Classifica Aura**: Parte I =
> specifica di prodotto (cosa costruiamo e perché), Parte II = piano di
> implementazione a milestone (come lo costruiamo). Compagno di `CLAUDE.md`
> (mappa backend), `roadmap.md` (stato progetto) e dei documenti gemelli
> `docs/live/live.md`, `docs/live/live-rework.md`, `docs/media/drop.md`,
> `docs/map/map.md`, `docs/chat/IMPLEMENTATION-PLAN.md`, di cui ricalca
> formato e convenzioni. Lingua: italiano, come tutto il progetto.

---

## Contesto — perché questo documento

Il tab **Aura** della Home (`mobile/app/(main)/(tabs)/home.tsx`, ramo `'aura'`
di `FeedBody`) mostra oggi il placeholder «La tua Aura arriva presto». Il PO
vuole trasformarlo nella **Classifica Aura**: la classifica degli utenti con
l'Aura più alta, **visibile SOLO tra amici**, con un podio (2° a sinistra, 1°
al centro rialzato, 3° a destra), la lista ordinata di tutti gli altri, il
pulsante per aprire la chat con ogni amico, un menu ⋮ con l'opzione per
essere/non essere in classifica, e la condivisione della **propria** posizione
come immagine pronta per gli altri social — con una parte pensata per
convertire chi Televo non ce l'ha ancora.

Il motore è già tutto in piedi: l'**Aura v3**
(`20260701000100_aura_v3.sql`) fa di `profiles.aura_score` la **percentuale
0–100** ricalcolata ogni notte dal cron `aura-recompute-daily` (03:00 UTC),
con `aura_color` dal tratto dominante della settimana. Entrambe le colonne
sono già nel grant SELECT per-colonna di `profiles`
(`20260705140000_grants_audit.sql`): la classifica **non espone dati nuovi**,
è scoping di prodotto sopra dati già leggibili. Mancano quattro cose: la
porta di lettura solo-amici, il flag di visibilità, il tracciamento del rank
per le notifiche retention, e la generazione dell'immagine condivisibile.

### Decisioni di prodotto vincolanti (product owner, 2026-07-16)

| # | Domanda | Decisione |
|---|---------|-----------|
| AC-1 | Dove vive la classifica e chi la vede | **Solo amici accettati, inline nel tab Aura della Home.** Partecipanti = io + i miei amici a mutuo consenso; mai globale, mai amici-di-amici. Resa a tutta altezza nel ramo `'aura'` (pattern DropFeed/MapCanvas/LiveFeed). |
| AC-2 | Semantica dell'opt-out | **Reciproco.** Chi si toglie dalla classifica NON appare a nessuno E NON vede più la classifica dei suoi amici (stato dedicato con CTA di rientro). Enforcement **server-side** (RPC + cron), mai solo UI. |
| AC-3 | Struttura della pagina | **Podio 2/1/3** con scritte 1°/2°/3° sugli scalini, avatar nel cerchio dell'Aura (come nel profilo) e **nome** (display name, non username) sotto; linea separatrice; **lista** degli altri con numero di posizione, avatar+anello e pulsante chat. Share della **propria** posizione. |
| AC-4 | Notifiche retention | **Tre**: recap settimanale (broadcast dosato, stile «tema del giorno»), «sei entrato nel podio», e «un amico ti ha superato» **SOLO se eri nel podio** (old_rank ≤ 3 e perdi almeno una posizione). |
| AC-5 | CTA della card condivisa (app non negli store) | **URL configurabile**: una costante di config (`INVITE_URL`) — al lancio si sostituisce con i link store senza toccare altro codice. La card contiene **SOLO i dati del mittente**: mai nomi, volti o rank degli amici. |

### L'eccezione anti-vanity (R-04) — perimetro esatto

Una classifica visibile è, formalmente, una meccanica comparativa: va
dichiarata come **eccezione consapevole e datata** alla regola anti-vanity
R-04, come M15 fece per i contatori delle live. Perimetro:

- **Cosa si mostra**: la posizione relativa tra amici basata su `aura_score`
  — che è **reputazione di qualità** (gentilezza, presenza, contributo, con
  decadimento e penalità), NON follower, NON like, NON volumi. È il pilastro
  Aura reso sociale, non un vanity-count.
- **A chi**: solo al grafo amici a mutuo consenso di ciascun utente. La
  classifica di A e quella di B sono INSIEMI DIVERSI: non esiste una
  classifica globale, un rank assoluto, né visibilità fuori dal grafo.
- **Uscita garantita**: opt-out reciproco a un tap, enforced a DB (§2.3).
- **Cosa NON cambia**: i **drops restano a contatori privati** (R-04 lì è
  intatta, come dichiarato da M15); nessun contatore nuovo diventa pubblico;
  le notifiche di sorpasso sono **anonime** (§7.2) e rarefatte.

### Decisioni architetturali vincolanti

- **Principio guida**: nessun dato di classifica visibile fuori dalla rete
  verificata (amici accettati). In caso di conflitto in implementazione:
  fermarsi e chiedere, mai risolvere verso "più aperto".
- **La classifica LEGGE l'Aura, non la scrive**: nessun evento
  `aura_events` nuovo, nessun peso nuovo, nessun trigger su `emit_aura`.
  Guardare la classifica, condividerla o vincerla NON dà Aura (anti-gaming:
  un loop classifica→Aura→classifica sarebbe una macchina d'ansia).
- **Stack fisso**: Postgres+RLS, RPC SECURITY DEFINER, pg_cron (nessuno
  scheduler esterno), pipeline notifiche esistente
  (`enqueue`/`dispatch_push`/`send-push`), Expo RN con TanStack Query.
- **Un'unica porta di lettura** (`aura_leaderboard`): RLS, UI e notifiche
  derivano tutte dagli stessi filtri di partecipazione — mai duplicare il
  predicato in punti diversi con logiche divergenti.
- **Il flag di visibilità NON è leggibile da terzi** (fuori dal grant
  SELECT): un estraneo non deve poter enumerare chi si nasconde (§13.1).

---

# PARTE I — SPECIFICA DI PRODOTTO

## 0. Meta

### 0.1 Scopo
Definire **il prodotto** Classifica Aura: uno sviluppatore deve poter
costruire l'intero modulo leggendo questo documento e il codice esistente.
La Parte I non contiene migrazioni né codice: definisce comportamenti, dati,
permessi e casi limite. La Parte II li traduce in milestone tecniche.

### 0.2 Ambito

**In scope (M16):** porta di lettura `aura_leaderboard` solo-amici · flag
`show_in_leaderboard` con opt-out reciproco · UI inline nel tab Aura (podio
2/1/3 + lista + menu ⋮) · pulsante DM per riga · share card 9:16 con dati
propri e `INVITE_URL` configurabile · notifiche `aura_recap` /
`aura_podio` / `aura_sorpasso` con snapshot giornaliero del rank · deep link
notifiche → tab Aura · lifecycle (purge snapshot) e GDPR (export/delete) ·
bonifica opportunistica della UI school-rank legacy (scuola fuori dal
progetto, PO 2026-07-05).

**Differito (decisione esplicita futura):** classifiche per carattere
(Most Kind / Best Humor…) nella stessa pagina — il dato esiste
(`leaderboard_character`), la UI arriverà in un round dedicato · storicità
("eri 2° la settimana scorsa", grafici di rank) · badge/achievement legati
al podio · condivisione con confronto a due ("io vs amico", richiederebbe
consenso di entrambi) · QR code sulla share card.

**Fuori scope:** classifica globale o per città (anti-principio) · rank
visibile sul profilo altrui (il rank è personale: ha senso solo dentro la
classifica di chi guarda) · monetizzazione del rank · leghe/promozioni
stile Duolingo (meccanica d'ansia).

### 0.3 Fonti
- Richiesta e decisioni PO 2026-07-16 (AC-1..AC-5, questa sessione).
- `20260701000100_aura_v3.sql` — Aura % (statico+dinamico−penalità, cap
  0–100), `recompute_aura()` v3, cron `aura-recompute-daily` 03:00 UTC.
- `20260628160000_social_friendships.sql` — coppia normalizzata,
  `are_friends`, enumerazione canonica degli amici accettati.
- `20260705150200_drops_interactions.sql` (`drops_feed`) e
  `20260713150000_lives_feed_paginato.sql` (`lives_feed` v2→v3) — pattern
  porta di lettura (definer, envelope jsonb, grant/revoke contract).
- `20260706140100_drop_prompt.sql` — broadcast dosato (guardia atomica,
  insert set-based, finestra UTC che copre Roma CET/CEST).
- `20260716120300_live_likes_lifecycle.sql` — regola verbatim+add per
  `expire_content` / `process_account_deletion`.
- Mobile: `home.tsx` (catena tutta-altezza), `AuraAvatarRing.tsx`,
  `useAmici.ts` (`useApriDm`), `BottomSheet.tsx`/`MenuMessaggio.tsx`,
  `notifiche-rotte.ts`, `constants/theme.ts` e `constants/aura.ts`.

### 0.4 Glossario
- **Partecipante**: utente che compare in una classifica — io + i miei
  amici accettati, filtrati per attività e visibilità (§2.1).
- **Rank**: posizione 1-based di un utente **nella PROPRIA classifica**
  (tra i propri amici). È personale: lo stesso utente ha rank diversi
  nelle classifiche di amici diversi.
- **Listed / non listed**: stato del flag `show_in_leaderboard` (default
  true). Non listed = fuori da tutte le classifiche E senza accesso alla
  propria (reciprocità, AC-2).
- **Snapshot di rank**: fotografia giornaliera `(user_id, computed_on,
  rank, friends_total, aura_score)` usata SOLO dal motore notifiche.
- **Card**: l'immagine 9:16 generata per la condivisione esterna.

### 0.5 Convenzioni
Come i documenti gemelli: `§n` = rimando interno; grassetto = vincolo;
MAIUSCOLO = enfasi normativa; date ISO; codici decisione `AC-n`, questioni
aperte `QA-n`. Copy UI in italiano, caldo e diretto.

## 1. Visione — la classifica nei tre pilastri

- **Proof of Human**: la classifica mostra persone vere del proprio grafo,
  con il nome e il volto, ordinate da un punteggio che sale SOLO con
  presenza e qualità reali (props, live qualificate, costanza). Non
  esistono bot in classifica perché non esistono bot nel grafo.
- **Aura**: è la vetrina naturale del pilastro — l'anello che ognuno vede
  sul proprio profilo diventa confrontabile nel posto giusto: la cerchia
  di amici veri. La domanda che genera è «come si alza l'Aura?» → la
  risposta è comportamento sano (gentilezza, presenza), non grinding.
- **Anti-doomscroll**: la pagina è **finita per costruzione** (i tuoi
  amici sono decine, non un feed infinito), si aggiorna **una volta al
  giorno** (niente refresh compulsivo: il numero non cambia se la guardi
  di più), le notifiche sono dosate (una a settimana + eventi di podio
  rari) e l'uscita è a un tap.

### 1.1 Attori
- **Utente listed** (default): vede la classifica, appare a tutti i suoi
  amici listed, riceve le notifiche retention.
- **Utente non listed**: non appare, non vede, non riceve (§2.3).
- **Amico**: partecipa alla mia classifica se accettato, attivo e listed.
- **Server**: calcola l'Aura (invariato), fotografa i rank ogni notte,
  invia le notifiche. Il client non calcola MAI un rank da solo.

### 1.2 Vincoli non negoziabili (regole d'oro applicate alla classifica)
- Visibilità SOLO amici accettati, via l'unica porta `aura_leaderboard`.
- Opt-out reciproco enforced a DB (RPC + cron), mai solo client.
- Il flag `show_in_leaderboard` non è leggibile da terzi (fuori dal
  grant SELECT di `profiles`).
- La card condivisa — unico artefatto che ESCE dall'app — contiene solo
  i dati del mittente (AC-5). Mai identità di amici in artefatti esterni.
- Nessuna posizione/geodato in tutto il modulo.
- La classifica non scrive Aura (§8) e non introduce contatori pubblici
  nuovi oltre al rank tra amici (eccezione R-04 perimetrata sopra).
- Notifiche di sorpasso ANONIME e solo per chi era nel podio (AC-4).

## 2. La classifica

### 2.1 Partecipanti
La classifica di un utente U contiene **U stesso + i suoi amici con
`friendships.status = 'accepted'`** (enumerazione canonica del repo, la
stessa di `map_fanout`/`can_see_live`), filtrati così:

- `deleted_at is null` — i cancellati/anonimizzati non esistono più;
- `banned_at is null` — i bannati escono (coerente con la loro uscita da
  ogni superficie di prodotto);
- `show_in_leaderboard = true` — i non listed non appaiono (AC-2);
- i **mutati RESTANO**: il mute blocca la *creazione* di contenuti
  (`is_active_user`), non la presenza — l'eventuale tossicità è già
  scontata dal punteggio (penalità Aura v3). Toglierli dalla classifica
  sarebbe una seconda pena e un segnale pubblico della sanzione.
- Coppie bloccate: impossibili per costruzione tra righe `accepted` (la
  riga normalizzata passa a `blocked`) — invariante da asserire in pgTAP,
  non da ri-filtrare.

### 2.2 Ordinamento e pari merito
Ordinamento: **`aura_score` decrescente**, pari merito risolto per
**anzianità su Televo** (`profiles.created_at` crescente), poi `id` come
spareggio finale deterministico. Il rank è `row_number()` (1, 2, 3, …
sempre sequenziale): il podio ha tre scalini fisici, due «primi» non ci
stanno — e la storia di prodotto è raccontabile: *a parità di Aura conta
da quanto sei su Televo*. L'ordine è totale e stabile: due refetch nello
stesso giorno danno la stessa classifica.

### 2.3 Opt-out reciproco (AC-2)
Il flag è `profiles.show_in_leaderboard` (default `true`). Tre cancelli,
tutti server-side:

1. **Cancello chiamante**: se chi chiama `aura_leaderboard` è non listed,
   la RPC risponde `{ listed: false }` senza righe. Non è un errore (le
   stringhe-codice restano per auth/abusi): è uno stato di prodotto.
2. **Cancello righe**: i non listed non compaiono MAI nelle righe di
   nessuno (filtro nel predicato dei partecipanti).
3. **Cancello notifiche**: il motore notturno (§7) esclude i non listed
   sia come destinatari sia come partecipanti al calcolo del rank altrui.

Il rientro è simmetrico: flip del flag → alla prossima lettura si è
dentro. Nessuna quarantena, nessun costo. Copy UI della reciprocità
(sempre visibile accanto al toggle): *«Se ti nascondi, sparisci dalla
classifica dei tuoi amici e non vedrai la loro.»*

### 2.4 Freschezza dei dati
`aura_score` è ricalcolato UNA volta al giorno (`aura-recompute-daily`,
03:00 UTC): la classifica è **naturalmente giornaliera**. La UI lo dice
(«Si aggiorna ogni giorno») invece di fingere il realtime. Il
pull-to-refresh e il refetch al focus servono a raccogliere variazioni di
*composizione* (nuovi amici, opt-in/out), non di punteggio. Nessun canale
realtime: sarebbe complessità per un dato che cambia una volta al giorno
(§13.6).

## 3. Podio

- Tre colonne: **2° a sinistra, 1° al centro, 3° a destra**; lo scalino
  del 1° è più alto (podio letterale). Su ogni scalino la scritta
  **`1°` / `2°` / `3°`**.
- Sopra ogni scalino: l'avatar dell'utente dentro l'**anello Aura**
  (`AuraAvatarRing`, lo stesso del profilo: arco proporzionale alla %,
  scala rosso→oro, brand viola→fucsia al 100%). Il 1° è più grande e
  «respira» (glow animato); 2° e 3° sono `still` (statici — budget
  animazioni, una sola per pagina).
- Sotto l'avatar: il **nome** (`display_name`, fallback `username` —
  convenzione `displayName || username` del repo), una riga, troncato con
  ellissi; sotto il nome la **percentuale Aura** nel colore
  `auraRingColor(percent)`.
- Tap su un utente del podio → profilo (`/profilo/[id]`; il proprio →
  `/profilo`).
- **Slot mancanti** (meno di 3 partecipanti): lo scalino resta, il
  cerchio è un placeholder tratteggiato vuoto — il layout non collassa
  mai (§10.2).
- Sotto il podio: **linea separatrice orizzontale** (`colors.border`),
  poi la lista (§4).

## 4. Lista

Dal 4° posto in giù (il podio NON si ripete in lista), una riga per
partecipante:

- **Sinistra**: il numero di posizione (`4°`, `5°`, …), colonna a
  larghezza fissa, font tabulare.
- **Avatar** con anello Aura (`AuraAvatarRing` in modalità `still` —
  obbligatoria in lista per le performance) + **nome** (`displayName ||
  username`) e sotto `@username` in `colors.muted`.
- **Destra**: il pulsante **chat** (icona bolla): apre/crea la DM con
  quell'amico — pattern esatto del profilo (`useApriDm().mutate(id, {
  onSuccess: convId => router.push(dynamicRoutes.chat(convId)) })`).
  Legale per costruzione: ogni riga è un amico accettato, e
  `get_or_create_dm` esige `are_friends`.
- **La propria riga**: evidenziata (bordo/sfondo `colors.elevated`),
  chat nascosta e sostituita dall'icona **condividi** (§6). Se il
  proprio rank è oltre le righe caricate (cap difensivo, §13.2), la
  propria posizione resta comunque visibile: l'envelope porta sempre
  `me.rank`.
- Tap sulla riga (fuori dai pulsanti) → profilo dell'amico.
- La lista è una `FlatList` con il podio+separatore come
  `ListHeaderComponent`, pull-to-refresh, e la caption «Si aggiorna ogni
  giorno» come footer.

## 5. Menu ⋮ e impostazione visibilità

- In alto a destra della sezione: **tre puntini verticali**
  (`ellipsis-vertical`), nel header row della pagina (pattern back/
  titolo/icona del repo — qui senza back: la pagina vive nel tab).
- Il tap apre un **bottom sheet scuro** (`Modal transparent` +
  `BottomSheet`, template `MenuMessaggio`/`ShareSheet`) con due voci:
  1. **«Mostra la mia posizione in classifica»** — `Switch` legato a
     `show_in_leaderboard`, con il copy della reciprocità (§2.3) come
     sottotitolo. Flip → update ottimistico + refetch.
  2. **«Condividi la tua posizione»** — avvia il flusso card (§6).
     Disabilitata se non listed o senza dati.
- Stato **non listed** (il chiamante si è nascosto): al posto della
  classifica, schermata dedicata — icona occhio sbarrato, titolo «Sei
  fuori dalla classifica», il copy della reciprocità, CTA primaria
  **«Rientra in classifica»** (flip del flag + refetch). Il menu ⋮ resta
  raggiungibile e coerente (switch off).
- Stato **vuoto** (listed ma 0 partecipanti oltre a me): «La classifica
  Aura si accende con gli amici» + CTA verso `/amici` (§10.1).

## 6. Condivisione — la card social

### 6.1 Contenuto della card (INVARIANTE: solo dati propri)
La card è l'unico artefatto del modulo che **esce dall'app** (WhatsApp,
Instagram, ovunque): contiene ESCLUSIVAMENTE dati del mittente —

- wordmark Televo (gradiente brand viola→fucsia, l'UNICO posto dove il
  brand gradient è ammesso fuori dal logo, coerente col design system);
- avatar del mittente nell'anello Aura (arco statico, nessuna animazione
  nello snapshot);
- **nome** + `@username`;
- la **percentuale Aura** grande, nel colore `auraRingColor(percent)`;
- il badge di posizione: **«N° tra i miei amici»** (omesso se
  `friends_total < 2`: «1° su 1» è ridicolo);
- il claim: *«La mia Aura su Televo. Non follower, non like.»*;
- il **blocco conversione**: *«Televo arriva a Terni — solo su invito»*
  + `INVITE_URL` (AC-5).

**MAI** nella card: nomi/volti/rank di amici, numero di amici come lista
identificabile, posizione geografica, screenshot della classifica.
`friends_total` come numero nudo nel badge («3° tra i miei amici») è
dato proprio: ammesso.

### 6.2 Formato e generazione
- Formato **9:16** (storie Instagram/TikTok/stato WhatsApp — la
  superficie di distribuzione Gen Z), layout logico 360×640 catturato a
  **1080×1920** PNG. Il quadrato si ritaglia bene DA un 9:16, non
  viceversa.
- Generazione client-side: la card è un componente RN **off-screen**
  (assoluto fuori viewport, `collapsable={false}`) montato on-demand,
  catturato con **`react-native-view-shot`** (`captureRef(..., {
  format:'png', width:1080, height:1920, result:'tmpfile' })`) e
  condiviso con **`expo-sharing`** (`Sharing.shareAsync(uri)`).
- **Fallback** se `Sharing.isAvailableAsync()` è falso o la cattura
  fallisce: `Share.share` testuale (pattern `profilo.tsx`): *«Sono N°
  nella classifica Aura dei miei amici su Televo — ${INVITE_URL}»*.
- Dipendenze **native nuove** (`react-native-view-shot`,
  `expo-sharing`) → serve una **nuova Dev Build EAS** (l'app è già
  Dev-Build-only: LiveKit/MapLibre/Skia). Milestone dedicata (AC4) con
  gate esplicito.

### 6.3 CTA di conversione e `INVITE_URL`
Nuovo `mobile/src/constants/config.ts`:
`export const INVITE_URL = 'https://televo.app';` (o il valore che il PO
sceglierà). UNICA fonte per ogni link outbound: al lancio si sostituisce
con gli store link (o un link dinamico landing→store) **senza toccare
altro codice**. Finché l'app non è sugli store il link punta alla
presenza web/waitlist: mai scrivere oggi un link Play Store morto
(alternativa scartata, §13.6).

### Punti d'ingresso dello share
1. icona condividi sulla **propria riga** in lista (o accanto al proprio
   slot se si è nel podio);
2. voce nel **menu ⋮** (§5).
Niente auto-suggerimento post-notifica podio (sobrietà anti-vanity,
QA-5).

## 7. Notifiche retention

Tutte viaggiano sulla pipeline esistente (`notifications` →
`dispatch_push` → Edge `send-push`): nessun pezzo nuovo di consegna. Tre
tipi nuovi nell'enum `notification_type` (migrazione enum separata):
`aura_podio`, `aura_sorpasso`, `aura_recap`.

Il motore è lo **snapshot giornaliero dei rank** (§13.1/§13.3): ogni
notte, DOPO il ricalcolo Aura, il cron `aura-rank-daily` fotografa il
rank personale di ogni utente listed e lo confronta col giorno prima.

### 7.1 `aura_podio` — «sei entrato nel podio»
- Condizione: `old_rank > 3 AND new_rank <= 3` (ieri fuori, oggi dentro).
- Primo snapshot assoluto di un utente ⇒ NESSUNA notifica (niente spam
  al day-one del modulo o al primo amico).
- Soglia: `friends_total >= 4` — con 3 o meno partecipanti il podio è
  "tutti sul podio" e la notifica non significa nulla (QA-3).
- Copy: titolo **«Sei sul podio Aura 🏆»**, body **«Ora sei N° tra i
  tuoi amici.»**, payload `{rank, old_rank}`.

### 7.2 `aura_sorpasso` — «un amico ti ha superato» (solo ex-podio)
- Condizione ESATTA (AC-4): `old_rank <= 3 AND new_rank > old_rank` —
  eri nel podio e hai perso almeno una posizione (anche restando nel
  podio: 1°→2° notifica; 4°→7° NO).
- Il sorpassante è **ANONIMO**: «un amico», mai il nome. Tre ragioni:
  (a) anti-ansia tra minori — un nome crea rivalità 1:1, il pilastro
  vieta meccaniche d'ansia; (b) con più sorpassi simultanei il "colpevole"
  è ambiguo; (c) niente identità di terzi nel ledger notifiche del
  destinatario. (QA-1 per conferma PO.)
- Mutuamente esclusiva con `aura_podio` per costruzione (una richiede
  old>3, l'altra old≤3).
- Stessa soglia `friends_total >= 4`.
- Copy: titolo **«Un amico ti ha superato»**, body **«Sei sceso al N°
  posto nella classifica Aura.»**, payload `{rank, old_rank}`.
- Dedup del repo su entrambe: `not exists (… stesso type e read_at is
  null …)` — mai accumulare copie non lette dello stesso tipo.

### 7.3 `aura_recap` — il recap settimanale (broadcast dosato)
- **Domenica pomeriggio/sera** (finestra semi-random 17:00–19:30
  Europe/Rome — il momento "si riparte lunedì"; QA-6), UNA volta a
  settimana, clone strutturale di `notify_drop_prompt`: riga di dosaggio
  settimanale con `send_after` semi-random, cron a tick (`*/15 15-19 * *
  0` UTC, finestra che copre Roma sia in CEST sia in CET), **guardia
  atomica** anti-doppio invio, insert **set-based**.
- Destinatari: utenti attivi (`is_active_user`), non cancellati, listed,
  con `friends_total >= 3` nello snapshot di oggi (con 1 solo amico il
  recap è rumore; QA-2). Inviato a tutti gli eleggibili ogni settimana,
  anche senza variazione di rank (QA-4).
- Copy: titolo **«La classifica Aura è pronta ✨»**, body **«Sei N° tra
  i tuoi amici questa settimana.»**, payload `{rank, friends_total}`.

### 7.4 Deep link
Tutte e tre le notifiche aprono la Home **sul tab Aura**: nuovo param
`?categoria=aura` sulla route home (validato contro `FeedCategoryKey`,
consumato una volta) + helper `dynamicRoutes.homeCategoria(cat)`; ramo
nuovo in `rottaPerNotifica` per i tre tipi. Un utente che si è nascosto
DOPO l'invio atterra sullo stato «Sei fuori dalla classifica» — coerente
(§10.16).

## 8. Aura — invariata (la classifica LEGGE, non scrive)

Nessun cambiamento al motore: niente eventi nuovi, niente pesi nuovi,
`recompute_aura()` intoccata. Il modulo consuma `aura_score`/`aura_color`
e basta. In particolare: condividere la card NON dà Aura (sarebbe
l'incentivo sbagliato: spam esterno per punti interni).

## 9. Anti-abuso, safety, privacy

- **Minori**: nessun dato nuovo esposto; il perimetro è il grafo amici
  già verificato; la card esterna contiene solo dati del mittente
  (l'unico che ha scelto di esporsi); il sorpassante è anonimo.
- **Enumerazione dell'opt-out**: il flag è fuori dal grant SELECT — un
  non-amico non può interrogare chi si nasconde. Un amico può *dedurre*
  l'assenza dalla classifica: è il comportamento voluto (l'assenza È
  l'opt-out), ma non c'è una API che lo confermi.
- **Anti-gaming**: il rank deriva da `aura_score`, che ha già le sue
  difese (props unici, cap giornalieri, rendimenti decrescenti,
  decadimento, penalità). La classifica non aggiunge superfici di gaming
  perché non scrive nulla.
- **Anti-ansia**: aggiornamento giornaliero dichiarato, notifiche
  rarefatte e a soglia, sorpasso solo ex-podio e anonimo, opt-out
  reciproco a un tap, pagina finita senza scroll infinito.
- **Sanzioni**: bannati fuori (come ovunque), mutati dentro (§2.1 — il
  mute non è pubblico e non deve diventarlo tramite la classifica).

## 10. Catalogo casi limite

1. **0 partecipanti oltre a me** → stato vuoto: «La classifica Aura si
   accende con gli amici» + CTA verso `/amici`. Share nascosto («1° su
   1» non esiste).
2. **1–2 partecipanti oltre a me** → podio parziale: scalini sempre
   presenti, slot vuoti tratteggiati; lista vuota; notifiche soppresse
   dalle soglie (§7).
3. **Pari merito** → spareggio anzianità (`created_at asc, id asc`):
   ranghi sempre 1,2,3…, ordine stabile tra refetch (§2.2).
4. **Tutti a 0%** → classifica valida ordinata per anzianità; il podio
   mostra 0% e archi minimi (l'anello a 0% ha l'arco minimo, non
   scompare — comportamento nativo di `AuraAvatarRing`).
5. **Chiamante non listed** → envelope `{listed:false}` → stato dedicato
   con CTA di rientro (§5).
6. **Un amico si nasconde a metà sessione** → resta nella cache fino al
   prossimo refetch (focus/pull-to-refresh): innocuo, il dato era
   legittimo quando letto.
7. **Cancellati/bannati** → esclusi server-side; **mutati inclusi**
   (§2.1).
8. **Coppie bloccate** → impossibili tra `accepted` (riga normalizzata):
   invariante pgTAP, non filtro.
9. **Avatar mancante** → fallback iniziale del componente `Avatar`
   dentro l'anello.
10. **Nomi lunghi** → `numberOfLines={1}` + larghezze massime sulle
    colonne del podio; l'ellissi non sposta gli scalini.
11. **Offline** → `statoSchermo`/`VistaStato` con eventuale cache
    (pattern del repo); pull-to-refresh riprova.
12. **Freschezza** → punteggi fermi fino alle 03:00 UTC; la caption lo
    dichiara; il refetch raccoglie solo variazioni di composizione
    (§2.4).
13. **Io nel podio** → normale: il mio slot è evidenziato, lo share
    parte da lì.
14. **Lista molto lunga** → cap difensivo 200 righe + `has_more`; la
    propria posizione resta visibile via `me.rank` nell'envelope anche
    oltre il cap (§13.2).
15. **Chat sulla propria riga** → nascosta, sostituita da condividi
    (§4).
16. **Tap su notifica da non listed** (nascosto dopo l'invio) → deep
    link → stato «Sei fuori dalla classifica»: coerente, nessun errore.
17. **Cron 03:30 vs ricalcolo 03:00** → a scala invite-only il ricalcolo
    chiude in secondi; l'upsert dello snapshot è idempotente per giorno
    (riesecuzione sicura). Rischio monitorato in AC1.
18. **Primo snapshot assoluto** → nessun diff ⇒ nessuna notifica
    podio/sorpasso (§7.1): il modulo parte in silenzio.

## 11. Permessi & privacy (matrice)

| Dato | Io | Amico accettato | Non-amico | Note |
|------|-----|------------------|-----------|------|
| `aura_score`/`aura_color` di un profilo | ✅ | ✅ | ✅ (invariato) | già nel grant SELECT pre-M16; la classifica non lo cambia |
| La MIA classifica (righe ordinate) | ✅ se listed | — (ognuno ha la sua) | ❌ | unica porta: `aura_leaderboard` |
| Presenza di X nella mia classifica | ✅ se X listed | — | ❌ | assenza = opt-out o non-amicizia, indistinguibili |
| Flag `show_in_leaderboard` di X | solo il mio (via envelope `listed`) | ❌ | ❌ | fuori dal grant SELECT |
| Il MIO rank | ✅ (`me.rank`) | ❌ (il mio rank non esiste nella sua classifica: ha il suo) | ❌ | il rank è personale |
| `aura_rank_snapshots` | ❌ (tabella di sistema) | ❌ | ❌ | RLS senza policy + revoke; solo cron/GDPR |
| Card condivisa | dati SOLO miei | riceve ciò che condivido | idem | AC-5, §6.1 |
| Notifiche `aura_*` | ✅ (ledger owner-only) | ❌ | ❌ | sorpassante anonimo |

## 12. Mappatura capacità backend: ESISTE vs GAP

**ESISTE (si riusa, non si tocca):**
- Aura v3: `aura_score` 0–100 + `aura_color` su `profiles`, ricalcolo
  giornaliero, grant SELECT per-colonna.
- Grafo: `friendships` normalizzata, `are_friends`, enumerazione
  canonica; `get_or_create_dm` per il pulsante chat.
- Notifiche: `enqueue_notification`, `dispatch_push` + Edge `send-push`,
  realtime badge, pattern broadcast dosato (`notify_drop_prompt`) e
  pattern enum-in-migrazione-separata.
- Lifecycle: `expire_content` v9, `process_account_deletion` v8,
  `gdpr-export` v6, cron `expire-content` 5 min.
- Mobile: `AuraAvatarRing`, `Avatar`, `BottomSheet`, `Button`,
  `VistaStato`/`statoSchermo`, `useAmici`/`useApriDm`, `callRpc`,
  `notifiche-rotte.ts` + `useNotificaTap`, tema e token.

**GAP (si costruisce in M16):**
- Flag `profiles.show_in_leaderboard` + grant update per-colonna.
- RPC `aura_leaderboard()` (unica porta di lettura).
- `aura_rank_snapshots` + `aura_recap_of_week` + `aura_rank_daily()` +
  `notify_aura_recap()` + 2 cron + 3 valori enum.
- `expire_content` v10, `process_account_deletion` v9, `gdpr-export` v7.
- Mobile: componenti classifica, hook, share card (+2 dipendenze native
  → build EAS), `INVITE_URL`, param `?categoria=` sulla Home, rami
  deep-link.

## 13. Architettura

### 13.1 Schema dati

**`profiles` — colonna nuova**

```sql
alter table public.profiles
  add column if not exists show_in_leaderboard boolean not null default true;
```

- Naming inglese, coerente con la famiglia preferenze esistente
  (`share_location`, `show_last_seen`, `show_read_receipts`).
- `grant update (show_in_leaderboard)` a `authenticated` (aggiunta alla
  lista per-colonna; RLS `profiles_update_own` già limita alla propria
  riga). **NON aggiunta al grant SELECT**: lo stato proprio viaggia come
  `listed` nell'envelope della RPC; `.update()` senza `.select()`
  funziona senza grant di lettura (return=minimal). Nessun setter RPC:
  il flag non ha side-effect da orchestrare (precedente
  `show_last_seen`).

**`aura_rank_snapshots` — fotografia giornaliera (tabella di sistema)**

| Colonna | Tipo | Note |
|---------|------|------|
| `user_id` | `uuid not null references public.profiles on delete cascade` | |
| `computed_on` | `date not null` | giorno del calcolo (UTC) |
| `rank` | `integer not null` | posizione tra i PROPRI amici visibili |
| `friends_total` | `integer not null` | partecipanti, me incluso |
| `aura_score` | `numeric not null` | punteggio fotografato (recap/export) |
| | | **PK** `(user_id, computed_on)` |

RLS attiva **senza policy** + `revoke all` da `anon, authenticated`
(pattern `drop_prompts`): il client non la legge MAI (il rank vivo arriva
da `aura_leaderboard`); la usano solo cron e GDPR. Retention **14
giorni** (il diff usa solo ieri; minimizzazione, §13.4). Solo utenti
listed vi compaiono.

**`aura_recap_of_week` — dosaggio del recap (tabella di sistema)**

| Colonna | Tipo | Note |
|---------|------|------|
| `for_week` | `date primary key` | il lunedì ISO della settimana |
| `send_after` | `timestamptz not null` | orario semi-random 17:00–19:30 Roma |
| `notified_at` | `timestamptz` | guardia atomica anti-doppio invio |

Clone strutturale di `drop_prompt_of_day`; stessa disciplina RLS/revoke.

**Enum** (migrazione separata, vincolo `ADD VALUE`):
`notification_type` + `'aura_podio'`, `'aura_sorpasso'`, `'aura_recap'`.

### 13.2 RPC (SECURITY DEFINER, search_path='', grant solo authenticated)

**`aura_leaderboard() returns jsonb`** — plpgsql, `stable`. Zero
parametri, **niente paginazione**: i partecipanti sono io + i miei amici
(decine a scala invite-only Terni); un keyset comprerebbe nulla e
costerebbe cursori instabili (i rank cambiano ogni notte). Cap difensivo
`limit 200` + `has_more` contro grafi patologici; `me` calcolato PRIMA
del cap (posizione propria sempre presente).

```jsonc
// envelope
{
  "server_now": "…",
  "listed": true,                    // false ⇒ SOLO {server_now, listed}
  "friends_total": 12,               // partecipanti, me incluso
  "me":   { "rank": 4, "aura_score": 61.5, "aura_color": "#FF6B9D" },
  "rows": [ { "rank": 1, "id": "…", "username": "…",
              "display_name": "…", "avatar_url": "…",
              "aura_score": 88.2, "aura_color": "…", "is_me": false }, … ],
  "has_more": false
}
```

Logica: guardia `auth.uid()` (`raise exception 'not_authenticated'`) →
cancello chiamante (§2.3: non listed ⇒ envelope corto) → CTE partecipanti
(io + enumerazione canonica amici, filtri §2.1) → `row_number() over
(order by aura_score desc, created_at asc, id asc)` → envelope.
Grant/revoke contract obbligatorio: `revoke all … from public, anon,
authenticated;` poi `grant execute … to authenticated;` (default
privileges hosted, lezione CM8).

### 13.3 Cron & funzioni di sistema (nessun grant client)

**`aura_rank_daily()`** — cron **`aura-rank-daily`, `30 3 * * *`** (03:30
UTC, dopo `aura-recompute-daily` delle 03:00). Un'unica passata
set-based:

1. CTE `edges` (amicizie accepted in entrambe le direzioni) × CTE
   `participants` (filtri §2.1) → per ogni owner listed:
   `row_number() over (partition by owner order by aura_score desc,
   created_at asc, id asc)` → **upsert** in `aura_rank_snapshots`
   (`on conflict (user_id, computed_on) do update`) — idempotente per
   giorno, riesecuzione sicura.
2. Diff con lo snapshot più recente a `computed_on < current_date`
   (lateral): enqueue set-based (pattern `notify_drop_prompt`) di
   `aura_podio` e `aura_sorpasso` secondo §7.1/§7.2, con soglie
   (`friends_total >= 4`), dedup non-letti, destinatari attivi e listed.
   Primo snapshot assoluto ⇒ nessun diff ⇒ nessuna notifica.

**`notify_aura_recap()`** — cron **`aura-recap-weekly`,
`*/15 15-19 * * 0`** (tick domenicali; la finestra UTC 15–19 copre
17:00–19:30 Roma in CEST e CET; la funzione si auto-gata su
`send_after`). Struttura verbatim di `notify_drop_prompt`: assicura la
riga di `aura_recap_of_week` per la settimana corrente (con `send_after`
semi-random, calcolato una volta) → esce se non è l'ora o già inviato →
**guardia atomica** (`update … set notified_at = now() where … and
notified_at is null; if not found then return;`) → insert set-based ai
destinatari eleggibili (§7.3) con rank e `friends_total` dallo snapshot
di oggi.

Entrambe: `security definer set search_path=''`, revoke esplicito da
`public, anon, authenticated`, NESSUN grant (girano come owner via cron).
Disciplina prosrc: niente token legacy nei commenti dei body (le guardie
pgTAP leggono anche i commenti).

### 13.4 Lifecycle & GDPR

- **`expire_content` v10** — corpo **v9 VERBATIM**
  (`20260716120300_live_likes_lifecycle.sql`) + un blocco:
  `delete from public.aura_rank_snapshots where computed_on <
  current_date - 14;` e purge delle righe `aura_recap_of_week` più
  vecchie di 60 giorni. Stessa migrazione = stessa transazione (il cron
  ogni 5 min non vede stati intermedi). Nessun job nuovo per la purge.
- **`process_account_deletion` v9** — corpo **v8 VERBATIM** + `delete
  from public.aura_rank_snapshots where user_id = p_user;` (art. 17,
  cancellazione immediata; la FK cascade coprirebbe comunque
  l'hard-delete a 30 giorni). Proprietà utile: gli snapshot degli ALTRI
  non citano l'utente (il rank è un intero personale, senza riferimenti
  incrociati) — niente da riscrivere altrove.
- **`gdpr-export` v7** (repo Edge) — art. 15: sezione nuova
  `aura_rank_snapshots` (righe proprie) + il valore del flag
  `show_in_leaderboard` nella sezione profilo. Si accoda alla coda
  deploy-owner esistente.

### 13.5 Client RN (`mobile/`)

- **Home** (`app/(main)/(tabs)/home.tsx`): `'aura'` entra nella catena a
  tutta altezza accanto a drops/map/live (`category === 'aura' ?
  <ClassificaAura/> : …`); il case di `FeedBody` diventa `return null`
  come gli altri collegati. Puro JS + `react-native-svg`: nessun guard
  nativo, gira anche in Expo Go. Param `?categoria=` letto con
  `useLocalSearchParams`, validato contro `FeedCategoryKey`, applicato
  una sola volta per evento di navigazione.
- **Componenti** (nuova cartella
  `mobile/src/components/aura/classifica/`):
  - `ClassificaAura.tsx` — container: header (titolo + kebab ⋮),
    `FlatList` (podio+separatore come header, righe, caption footer),
    pull-to-refresh, stati via `statoSchermo`/`VistaStato` + i due stati
    dedicati (vuoto / non listed).
  - `PodioAura.tsx` — §3. Riuso diretto di `AuraAvatarRing`
    (`percent`, `size`, `still`) attorno ad `Avatar`.
  - `RigaClassifica.tsx` — §4 (anello SEMPRE `still` in lista).
  - `MenuClassifica.tsx` — §5 (`Modal` + `BottomSheet`).
  - `StatoNonVisibile.tsx` — stato opt-out con CTA di rientro.
  - `ShareCardClassifica.tsx` — §6, off-screen 360×640.
- **Data layer**: `mobile/src/hooks/useClassificaAura.ts` —
  `auraKeys.classifica = ['aura', uid, 'classifica']`;
  `callRpc<ClassificaAuraEnvelope>('aura_leaderboard', {})`; refetch al
  focus del tab. Mutation `useClassificaVisibile`:
  `supabase.from('profiles').update({ show_in_leaderboard })` SENZA
  `.select()` (il flag non ha grant di lettura), ottimistica su
  `listed`, invalidazione della classifica. Hook
  `useCondividiClassifica`: monta la card → `captureRef` →
  `Sharing.shareAsync` → fallback `Share.share`. Tipi A MANO in
  `mobile/src/types/supabase.ts`.
- **Config**: `mobile/src/constants/config.ts` con `INVITE_URL` (§6.3).
- **Routing/notifiche**: `dynamicRoutes.homeCategoria(cat)` in
  `constants/routes.ts`; ramo in `lib/notifiche-rotte.ts` per
  `aura_podio | aura_sorpasso | aura_recap` →
  `homeCategoria('aura')` (consumato da `useNotificaTap` e
  `NotificaRow` senza altre modifiche).

### 13.6 Alternative considerate e SCARTATE (con motivo)

- **Ordinamento client-side** (`useAmici` + sort locale): l'opt-out
  sarebbe solo cosmetico (un client modificato ignorerebbe il filtro) e
  il predicato dei partecipanti vivrebbe in due posti (UI e cron) con
  deriva garantita. La porta unica server-side è l'unica reciprocità
  vera.
- **Keyset pagination sulla RPC**: i partecipanti sono il grafo amici
  (decine); i rank cambiano ogni notte ⇒ cursori instabili; costo >
  beneficio. Cap difensivo + `me` sticky bastano.
- **`rank()` (competition ranking, 1-1-3)**: due «primi» non stanno su
  un podio a tre scalini; il tie-break di anzianità è deterministico e
  raccontabile. `row_number()` vince.
- **Flag nel grant SELECT di `profiles`**: permetterebbe a chiunque
  (anche non-amici) di enumerare chi si nasconde. Fuori dal grant; lo
  stato proprio viaggia nell'envelope.
- **Tabella `user_settings` dedicata**: il repo ha già la famiglia di
  flag su `profiles` (`share_location`, `show_last_seen`, …); una
  tabella nuova per un boolean è ingegneria inutile.
- **Skia `makeImageSnapshot` per la card** (dep già presente): la card è
  typography/layout-heavy — in RN+SVG si costruisce gratis con i
  componenti esistenti e `captureRef` la fotografa; rifarla a primitive
  Skia dietro il guard nativo stile `AuraGlyph` è lavoro extra senza
  beneficio. `react-native-view-shot` + `expo-sharing` vincono (costo:
  una build EAS, già nel flusso del progetto).
- **Store link placeholder oggi**: link morto in giro per i social prima
  del lancio = prima impressione bruciata. URL configurabile (AC-5).
- **Notifica di sorpasso nominativa**: rivalità 1:1 tra minori,
  ambiguità con sorpassi multipli, identità di terzi nel ledger del
  destinatario. Anonima (§7.2).
- **Realtime sulla classifica** (postgres_changes su `profiles`): il
  dato cambia una volta al giorno; un canale realtime per questo è
  rumore architetturale. Refetch al focus + pull-to-refresh.
- **Notifica di sorpasso per tutti** (non solo podio): ansiogena e
  frequente a metà classifica, dove le posizioni ballano di più. Il PO
  ha deciso: solo ex-podio (AC-4).

---

# PARTE II — PIANO DI IMPLEMENTAZIONE

## 14. Come usare questo piano

- **UNA milestone alla volta**, su comando esplicito del PO («implementa
  lo step ACx»). Ogni milestone è testabile in isolamento e lascia il
  sistema coerente (mai stati intermedi rotti sul remoto).
- Ordine per dipendenza reale: flag+porta di lettura (AC0) → snapshot+
  notifiche (AC1) → lifecycle+GDPR (AC2) → UI classifica (AC3) → share
  card (AC4) → deep link (AC5) → docs+chiusura (AC6). AC0–AC2 backend
  puro; AC3–AC5 frontend; AC6 trasversale.
- **Convenzioni comuni a ogni step backend**: migrazione
  `supabase/migrations/YYYYMMDDHHMMSS_aura_classifica*.sql` con header
  `=== … ===` e razionale in italiano; funzioni definer
  schema-qualificate; revoke SEMPRE da `public`+`anon`+`authenticated`
  poi grant mirato; applicazione via **pooler** (Deno + postgres.js — la
  CLI è bloccata) con registrazione in
  `supabase_migrations.schema_migrations`; pgTAP esteso in
  `supabase/tests/rls_smoke.test.sql` con `plan(N)` aggiornato (oggi
  **622**) e suite eseguita SUL REMOTO; smoke funzionale via pooler
  (impersonazione `request.jwt.claims` + `set local role
  authenticated`); tipi TS aggiornati A MANO in
  `mobile/src/types/supabase.ts` + `tsc --noEmit` pulito.
- **Convenzioni comuni a ogni step mobile**: tsc + eslint verdi; copy in
  italiano; token da `constants/theme.ts`; nessun import nativo fuori
  dai guard esistenti.

## 15. Stato attuale (fotografia al 2026-07-16)

- Backend: **72 migrazioni live** sul remoto (ultima
  `20260716120300_live_likes_lifecycle.sql`, M15), pgTAP **622/622**;
  Aura v3 in produzione con ricalcolo giornaliero; pipeline notifiche
  completa (`dispatch_push` + `send-push`, push confermato funzionante
  su device reale da M14R2); coda deploy-owner Edge: `send-push` v4,
  `gdpr-export` v6 (M15).
- Mobile: Expo SDK 54, **Dev Build EAS** (LiveKit/MapLibre/Skia; build
  con bundle M15 già in coda da M14); tab `aura` in Home = `ComingSoon`;
  `AuraAvatarRing`/`Avatar`/`BottomSheet`/`useApriDm`/`VistaStato`
  pronti al riuso; nessuna dipendenza di cattura/condivisione immagini
  installata.
- Legacy noto: `useMyRank`/`useSchoolRank` (hook su viste globali) e la
  UI school-rank in `profilo/aura.tsx` — la scuola è fuori dal progetto
  (PO 2026-07-05): bonifica UI in AC6; la vista materializzata
  `leaderboard_school` resta al suo posto (bonifica backend = round
  futuro, fuori scope M16).

## 16. Milestone

### AC0 — Backend: flag visibilità + porta di lettura

- **Obiettivo**: colonna `profiles.show_in_leaderboard` (default true,
  nel grant UPDATE per-colonna, FUORI dal grant SELECT) + RPC
  `aura_leaderboard()` completa (§13.2: envelope, cancello chiamante,
  filtri partecipanti §2.1, ordinamento §2.2, cap 200 + `me` sticky,
  grant/revoke contract).
- **Dipendenze**: solo esistenti — `friendships`, grant per-colonna
  `profiles`, pattern `lives_feed`/`drops_feed`.
- **File**: 1 migrazione nuova (`…_aura_classifica.sql`, la 73ª); pgTAP.
- **Done when**: migrazione live via pooler; pgTAP verdi SUL REMOTO —
  invarianti nuove: colonna presente con default true; asimmetria grant
  (UPDATE sì, SELECT no) verificata; `has_function` + coppia
  grant/revoke su `aura_leaderboard`; guardie prosrc
  (`show_in_leaderboard`, `friendships`, `row_number`); smoke pooler:
  A+B amici ⇒ A vede B con rank coerente; B flip flag ⇒ envelope di B
  `listed:false` E B assente dalle righe di A; estraneo non vede nulla
  di A; anonimo ⇒ `not_authenticated`; pari merito ordinato per
  `created_at`.
- **Rischi**: dimenticare il revoke default-privileges (lezione CM8);
  determinismo del tie-break tra refetch (testarlo con due utenti a
  pari punteggio); il cancello chiamante va PRIMA di ogni join (mai
  costruire righe per poi scartarle).

### AC1 — Backend: rank snapshot + notifiche retention

- **Obiettivo**: valori enum `aura_podio`/`aura_sorpasso`/`aura_recap`;
  tabelle di sistema `aura_rank_snapshots` + `aura_recap_of_week`
  (§13.1); `aura_rank_daily()` (upsert set-based + diff + notifiche
  §7.1/§7.2 con soglie, dedup, sorpassante anonimo);
  `notify_aura_recap()` (clone dosato di `notify_drop_prompt`, §7.3);
  cron `aura-rank-daily` (`30 3 * * *`) e `aura-recap-weekly`
  (`*/15 15-19 * * 0`).
- **Dipendenze**: AC0 (il flag filtra i partecipanti); esistenti:
  `enqueue`/`dispatch_push`, `is_active_user`, template
  `notify_drop_prompt`.
- **File**: 2 migrazioni nuove (`…_aura_classifica_notifiche_enum.sql`,
  `…_aura_classifica_notifiche.sql` — enum in transazione separata,
  vincolo ADD VALUE); pgTAP.
- **Done when**: migrazioni live via pooler; pgTAP verdi — invarianti:
  enum presenti; RLS-senza-policy + revoke sulle due tabelle; cron.job
  presenti; guardie prosrc (guardia atomica nel recap, condizioni
  old/new nel diff). Smoke pooler con snapshot seminati: rank 4→3 ⇒
  `aura_podio`; 2→3 ⇒ `aura_sorpasso`; 2→2 ⇒ nulla; 5→6 ⇒ nulla (non
  era podio); `friends_total`=3 ⇒ nulla (soglia); non listed ⇒ né riga
  né notifica; doppia esecuzione di `aura_rank_daily()` nello stesso
  giorno ⇒ idempotente; doppio tick del recap ⇒ UN solo invio (guardia
  atomica).
- **Rischi**: correttezza della window `partition by owner` (rank
  personale ≠ rank globale — è l'errore più probabile: testare con
  grafi asimmetrici A-B, B-C senza A-C); deriva della finestra
  UTC/Roma sul cron domenicale (finestra 15–19 UTC scelta per coprire
  CET e CEST); disciplina prosrc nei commenti dei body.

### AC2 — Backend: lifecycle & GDPR

- **Obiettivo**: `expire_content` **v10** e `process_account_deletion`
  **v9** (corpi ultima versione VERBATIM + soli blocchi nuovi, stessa
  migrazione = stessa transazione, §13.4); `gdpr-export` **v7** nel
  repo (sezione `aura_rank_snapshots` + flag nel profilo).
- **Dipendenze**: AC1 (le tabelle esistono).
- **File**: 1 migrazione nuova (`…_aura_classifica_lifecycle.sql`);
  `supabase/functions/gdpr-export/index.ts`; pgTAP.
- **Done when**: migrazione live; smoke pooler: snapshot retrodatato di
  15 giorni sparisce con `expire_content()`; `process_account_deletion`
  su utente di test cancella i suoi snapshot subito; pgTAP verdi
  (guardie prosrc v10/v9: il blocco nuovo c'è, i token delle versioni
  precedenti restano); export v7 verificato con query via pooler
  (service_role legge la sezione). Roadmap: coda deploy-owner
  aggiornata (v7 si somma a `send-push` v4 + `gdpr-export` v6→v7).
- **Rischi**: la regola verbatim+add (copiare il corpo INTERO
  dell'ultima versione in vigore, MAI riscriverlo — e attenzione a
  partire dalla versione giusta: v9/v8, non precedenti); coda
  deploy-owner che si allunga.

### AC3 — Mobile: classifica (podio + lista + menu + stati)

- **Obiettivo**: tab Aura collegato ai dati reali — `'aura'` nella
  catena tutta-altezza di `home.tsx`; componenti `ClassificaAura` /
  `PodioAura` / `RigaClassifica` / `MenuClassifica` /
  `StatoNonVisibile`; hook `useClassificaAura` + `useClassificaVisibile`
  (§13.5); pulsante DM per riga; tutti gli stati (caricamento / errore /
  offline / vuoto / non listed); copy italiano.
- **Dipendenze**: AC0 live sul remoto; esistenti: `AuraAvatarRing`,
  `Avatar`, `BottomSheet`, `useApriDm`, `VistaStato`, `callRpc`.
- **File**: `home.tsx`; `mobile/src/components/aura/classifica/*`
  (nuovi); `mobile/src/hooks/useClassificaAura.ts` (nuovo);
  `mobile/src/types/supabase.ts`.
- **Done when**: su 2 device (A e B amici): A e B vedono il PROPRIO
  ordine coerente col punteggio; B si nasconde dal menu ⋮ ⇒ B vede lo
  stato dedicato E sparisce dalla lista di A al refetch; B rientra
  dalla CTA ⇒ riappare; pulsante chat dalla riga di B apre la DM
  giusta; podio parziale con 2 partecipanti renderizza gli slot
  tratteggiati; nomi lunghi non rompono il podio; tsc/eslint verdi
  (funziona anche in Expo Go: nessuna dipendenza nativa nuova in
  questo step).
- **Rischi**: layout del podio su schermi stretti (larghezze massime +
  ellissi da subito); performance degli anelli in lista (`still`
  OBBLIGATORIO sulle righe, un solo anello animato per pagina — il 1°);
  update ottimistico del flag da riconciliare con `listed`
  dell'envelope al refetch.

### AC4 — Mobile: share card (+ dipendenze native + build EAS)

- **Obiettivo**: `react-native-view-shot` + `expo-sharing` installate;
  `constants/config.ts` con `INVITE_URL`; `ShareCardClassifica`
  (9:16, §6.1–6.2, invariante solo-dati-propri) +
  `useCondividiClassifica` (cattura → shareAsync → fallback testuale);
  punti d'ingresso: propria riga + menu ⋮.
- **Dipendenze**: AC3; **nuova Dev Build EAS** (gate esplicito: le due
  dipendenze sono native — possono salire sulla build già in coda da
  M14/M15 se ancora aperta, altrimenti build dedicata).
- **File**: `mobile/package.json`; `mobile/src/constants/config.ts`
  (nuovo); `ShareCardClassifica.tsx` + `useCondividiClassifica.ts`
  (nuovi); ritocchi a `RigaClassifica`/`MenuClassifica`.
- **Done when**: su Dev Build: lo share produce un PNG 1080×1920 che si
  apre nel target di condivisione (WhatsApp/Instagram); **leak-check**
  con classifica popolata: nella card NESSUN dato di amici (nome,
  avatar, rank altrui); l'URL viene da `INVITE_URL`; il fallback
  testuale scatta se la condivisione file non è disponibile; in Expo Go
  la voce share degrada senza crash (guard sul modulo); tsc/eslint
  verdi.
- **Rischi**: cattura di `react-native-svg` in `view-shot` su Android
  (verificare che l'anello compaia nello snapshot; ripiego: arco
  pre-rasterizzato nella sola card); tempi della build EAS (non blocca
  AC5–AC6, che non dipendono dalla card).

### AC5 — Mobile: deep link notifiche + param categoria Home

- **Obiettivo**: param `?categoria=` sulla Home (validato contro
  `FeedCategoryKey`, consumato una volta per evento di navigazione);
  `dynamicRoutes.homeCategoria(cat)`; rami `aura_podio` /
  `aura_sorpasso` / `aura_recap` in `rottaPerNotifica`.
- **Dipendenze**: AC1 (i tipi esistono a DB), AC3 (la destinazione
  esiste).
- **File**: `mobile/src/lib/notifiche-rotte.ts`;
  `mobile/src/constants/routes.ts`; `home.tsx`.
- **Done when**: notifica `aura_podio` seminata via pooler → tap (app
  viva E cold start) apre la Home sul tab Aura; stesso tap da utente
  non listed atterra sullo stato dedicato; param invalido ignorato
  (resta `discover`); il param non «riscatta» la categoria a ogni
  ri-focus del tab; tsc/eslint verdi.
- **Rischi**: doppia applicazione del param al re-render (consumarlo
  con un ref/flag per evento, non con un effect nudo su ogni change).

### AC6 — Docs, testing manuale, bonifica, chiusura

- **Obiettivo**: `docs/aura/MANUAL-TESTING.md` (scenari 2-device:
  reciprocità end-to-end, podio parziale, pari merito, notifiche
  seminate + deep link, leak-check della card, offline); `CLAUDE.md` §4
  (voce M16) §5 (2 cron nuovi + `gdpr-export` v7) §6 (eccezione R-04
  della classifica, datata e perimetrata); `roadmap.md` (voce M16 nel
  formato standard); memoria di progetto; **bonifica opportunistica**:
  rimozione `useMyRank`/`useSchoolRank` e della UI school-rank
  (`Classifica.tsx`) da `profilo/aura.tsx` (scuola fuori dal progetto,
  PO 2026-07-05 — SOLO lato UI: la vista materializzata resta, round
  futuro).
- **Dipendenze**: AC0–AC5.
- **File**: i docs sopra; `mobile/src/hooks/useAura.ts`;
  `mobile/app/(main)/profilo/aura.tsx`;
  `mobile/src/components/aura/Classifica.tsx` (rimozione o
  svuotamento).
- **Done when**: docs coerenti col costruito; MANUAL-TESTING eseguibile
  passo-passo; nessun riferimento residuo a `leaderboard_school` nel
  codice mobile; tsc/eslint/pgTAP verdi; commit di chiusura modulo.
- **Rischi**: scope creep della bonifica (fermarsi alla UI); dimenticare
  l'aggiornamento della coda deploy-owner in roadmap.

## 17. Ordine e razionale

`AC0 → AC1 → AC2 → AC3 → AC4 → AC5 → AC6`.

- AC0 per primo: la porta di lettura è il contratto di TUTTO il modulo
  (UI e notifiche derivano dai suoi filtri); il flag deve nascere
  insieme alla RPC (mai una finestra in cui la classifica esiste senza
  opt-out).
- AC1 dopo AC0: il motore notifiche riusa il predicato dei partecipanti.
- AC2 chiude il backend: nessuna tabella nuova resta senza lifecycle e
  GDPR nemmeno per un giorno.
- AC3 prima di AC4/AC5: la pagina è il valore; share e deep link la
  presuppongono. AC4 è isolata perché ha il gate build EAS (l'unico
  passo con dipendenze native); AC5 è piccola e indipendente da AC4.
- AC6 sigilla: docs, testing, bonifica.

## 18. Definition of Done — modulo Classifica Aura

- Un utente vede la classifica dei SOLI suoi amici, ordinata per Aura,
  con podio 2/1/3, lista numerata, chat per riga e la propria posizione
  sempre visibile.
- L'opt-out dal menu ⋮ è reciproco, istantaneo lato prodotto, ed
  enforced a DB (RPC + cron): nessuna via client-side per aggirarlo.
- La card condivisa contiene solo i dati del mittente + `INVITE_URL`
  configurabile; nessun dato di terzi lascia mai l'app.
- Le tre notifiche retention arrivano secondo le regole AC-4 (recap
  dosato settimanale; podio; sorpasso solo ex-podio, anonimo), con
  soglie e dedup; il tap atterra sul tab Aura.
- Lifecycle e GDPR coprono le tabelle nuove (purge 14gg, delete
  immediato, export v7).
- pgTAP verdi sul remoto con `plan(N)` aggiornato; tsc/eslint verdi;
  MANUAL-TESTING eseguito su 2 device; CLAUDE.md/roadmap allineati.

## 19. Rischi trasversali

- **Percezione del ranking** (prodotto): anche perimetrata, una
  classifica può generare confronto tossico. Mitigazioni già nel
  design: giornaliera, solo-amici, opt-out reciproco a un tap, sorpasso
  anonimo e raro, niente storicità pubblica. Da monitorare al lancio
  con il PO (Terni è il banco di prova).
- **Coerenza porta-unica**: se in futuro un'altra superficie mostrasse
  rank (es. profilo), DEVE passare da `aura_leaderboard` o dal suo
  predicato — mai un secondo predicato di partecipazione.
- **Coda deploy-owner**: `gdpr-export` v7 si somma a una coda già
  esistente (`send-push` v4, v6) — serve la sessione owner
  (`supabase login` televo.management2) prima del lancio.
- **Build EAS**: AC4 dipende da una build nuova; pianificarla insieme
  alle build già in coda per non moltiplicare i giri.
- **Scala**: tutte le query sono set-based e il grafo è invite-only;
  se il progetto esce da Terni, rivedere il cap 200 e il costo di
  `aura_rank_daily` (oggi: secondi).

## 20. Questioni aperte (richiedono input del product owner)

- **QA-1 — Sorpassante anonimo**: il design propone «un amico ti ha
  superato» senza nome (anti-ansia, §7.2). Validare.
- **QA-2 — Soglia recap**: proposta `friends_total >= 3` per ricevere
  il recap settimanale (con un solo amico è rumore). Validare o
  alzare/abbassare.
- **QA-3 — Soglia podio/sorpasso**: proposta `friends_total >= 4` (il
  podio significa qualcosa solo se qualcuno ne resta fuori). Validare.
- **QA-4 — Recap a tutti gli eleggibili** ogni settimana, anche senza
  variazione di rank (motore di retention), o solo a chi è
  salito/sceso? Proposta: a tutti. Validare.
- **QA-5 — Share auto-suggerito** dopo la notifica di podio (banner
  «condividi il tuo podio»)? Proposta: NO — sobrietà anti-vanity; i
  punti d'ingresso restano riga propria + menu. Validare.
- **QA-6 — Orario del recap**: proposta domenica 17:00–19:30
  Europe/Rome (semi-random). Validare giorno e finestra.
- **QA-7 — Valore iniziale di `INVITE_URL`**: quale URL usare oggi
  (landing? waitlist? placeholder brand)? Serve il valore dal PO prima
  di AC4.

## Revision history

| Rev | Data | Cosa |
|-----|------|------|
| 1 | 2026-07-16 | Prima stesura: decisioni AC-1..AC-5 del PO (opt-out reciproco, inline nel tab Aura, URL configurabile, notifiche recap+podio+sorpasso-solo-podio), eccezione R-04 perimetrata, architettura completa (flag, `aura_leaderboard`, snapshot+cron, share card view-shot, deep link), piano AC0–AC6, QA-1..QA-7. |
