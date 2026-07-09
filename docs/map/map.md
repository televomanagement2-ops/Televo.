# Televo — La Mappa della Città (M7): Specifica di prodotto & Piano di implementazione

> **Rev. 1 — 2026-07-07.** Decisioni di prodotto **Q-1..Q-4 validate dal product
> owner** (2026-07-07), decisioni architetturali di base dettate dal PO nella
> stessa sessione. Questo è il documento ufficiale della milestone **M7 — La
> Mappa della Città**: Parte I = specifica di prodotto (cosa costruiamo e
> perché), Parte II = piano di implementazione a milestone (come lo costruiamo).
> Compagno di `CLAUDE.md` (mappa backend), `roadmap.md` (stato progetto) e dei
> documenti gemelli `docs/chat/SRS-chat.md`, `docs/chat/IMPLEMENTATION-PLAN.md`,
> `docs/media/drop.md`, di cui ricalca formato e convenzioni. Lingua: italiano,
> come tutto il progetto.

---

## Contesto — perché questo documento

La mappa nasce nel backend Fase 5 (`20260628170000_map.sql`) come "Mappa Vibe":
posizione **coarse** (geohash ~5km), presenza effimera 15 minuti, view
`vibe_map`. Quel modello **non è mai stato esposto a un client** (il frontend
M7 non fu costruito) e il product owner lo ha ridefinito da zero. Con M7 la
mappa diventa **La Mappa della Città**: una lente scura, matura, in stile
cartografia militare / data-viz, che mostra **solo gli amici** (reciproci
confermati) come **Aure** luminose e le **Stanze Live** come bolle — mai
sconosciuti, mai pin colorati, mai numeri.

Il cambio concettuale chiave: la mappa è **memoria di attività recente**, non
solo presenza live. Non deve MAI essere vuota: un punto vive in tre stati —
**Live** (ora), **Echo** (evento appena finito, che decade visivamente), **Last
Seen** (ultima posizione nota). Il **decadimento è l'elemento di design**.

La feature vive nella **categoria "Map" della Home** (già presente nella
CategoryBar, oggi `ComingSoon`) e **sostituisce integralmente** la Mappa Vibe
di Fase 5, che viene deprecata.

### Decisioni di prodotto vincolanti (product owner, 2026-07-07)

| # | Domanda | Decisione |
|---|---------|-----------|
| Q-1 | Libreria mappa | **MapLibre** (`@maplibre/maplibre-react-native`) + tile vettoriali **OpenFreeMap** (gratis, nessun token, stile dark 100% custom). Richiede Dev Build EAS — già in roadmap perché M4/LiveKit lo esige comunque. |
| Q-2 | Durata Echo (default) | **12h** da `ended_at`. La colonna `visibility_expires_at` resta per-riga (configurabile in futuro). |
| Q-3 | Last Seen TTL | **24h** dall'ultimo aggiornamento di posizione, poi il cron pulisce la riga. |
| Q-4 | Legacy Fase 5 | **Deprecare subito**: drop di `vibe_map` / `live_presence` / `room_locations` / RPC geohash nella stessa wave, con `expire_content` v6 e `process_account_deletion` v6 ridefiniti nella STESSA migrazione. |

### Decisioni architetturali dettate dal PO (vincolanti, non rinegoziabili)

- **Privacy & amici**: strettamente solo amici reciproci confermati. MAI
  sconosciuti.
- **Tre stati visivi**: Live (aura piena, breathing veloce) · Echo (6–12h, con
  titolo e "2h fa", decadimento graduale fucsia→viola→trasparente) · Last Seen.
- **Dati**: Postgres + **PostGIS**, `geography(Point, 4326)`, indice GIST;
  tabella di riferimento `map_events`; **nessuno storico persistente** di
  posizione (solo ultima posizione/eventi con auto-expiry via pg_cron).
- **Realtime**: presenza effimera via Supabase Realtime, **non polling**;
  canali popolati **server-side dal grafo di amicizia**.
- **RLS obbligatoria**: la mappa legge SOLO tramite RPC che filtra per amicizia
  reciproca lato server. Mai esporre la tabella grezza al client.
- **Fusi orari**: tutti i timestamp in **UTC** (`timestamptz`, mai `timestamp`);
  conversione al fuso locale ESCLUSIVAMENTE lato client al rendering. Nessun
  calcolo di durata/expiry sull'ora locale del device.
- **Batteria**: provider a basso consumo, soglia di movimento adattiva
  (~20–50m), invio 30–60s in movimento e diradato da fermo, solo foreground
  (background = eventuale estensione opt-in futura).
- **Rendering**: Aure su thread grafico via **react-native-skia** / Reanimated
  (canvas, non marker RN singoli); clustering spaziale (supercluster) con
  offset radiale allo zoom.
- **Privacy di default**: posizione **esatta** (coerente con Proof of Human);
  **Safe Zone opzionale** (1–2 zone dove si appare "in zona"), scelta
  dell'utente e disattivabile — non un default paternalistico; opt-in
  **gestuale** integrato nell'Aura (tap sull'anello per N ore, auto-expiry);
  revoca/cancellazione **istantanea**.

> ⚠️ **Nota trasversale**: la decisione "posizione esatta di default" cambia la
> regola d'oro di `CLAUDE.md` §6 ("posizione sempre coarse"). La nuova
> formulazione — *posizione friends-only, opt-in, auto-expiry; esatta di
> default, coarse su scelta (Safe Zone)* — va scritta in CLAUDE.md in MM9
> (testo esatto da confermare col PO, QA-7).

---

# PARTE I — SPECIFICA DI PRODOTTO

## 0. Meta

### 0.1 Scopo
Definire **il prodotto** Mappa della Città: uno sviluppatore deve poter
costruire l'intero dominio leggendo questo documento e il codice esistente. La
Parte I non contiene migrazioni né codice: definisce comportamenti, dati,
permessi e casi limite. La Parte II li traduce in milestone tecniche.

### 0.2 Ambito

**In scope (M7):** mappa dark full-height nella categoria Map della Home ·
stati Live/Echo/Last Seen · opt-in gestuale con durate e auto-expiry · revoca
istantanea + kill-switch · Safe Zone (1–2, mascheramento server-side) · bolle
Stanze Live (host opt-in) con Echo automatico a fine stanza · clustering ·
realtime (inbox privata, fan-out server-side) · snapshot RPC · cleanup cron ·
deprecazione legacy Fase 5 · GDPR (consenso, export, delete) · pipeline
posizione foreground a basso consumo · resa Aure Skia con breathing e
decadimento.

**Differito (decisione esplicita futura):** condivisione in background
(significant-location-change, permesso "Sempre") · eventi manuali senza stanza
· stanze dove un amico è solo partecipante · notifica "amico in live vicino" ·
plausibility check anti-spoofing.

**Fuori scope:** heatmap/luoghi popolari (feed di scoperta = anti-pilastro) ·
storico spostamenti · condivisione con non-amici · geofencing notifiche ·
qualsiasi contatore visibile.

### 0.3 Fonti
`CLAUDE.md` §1 (pilastri) e §6 (regole d'oro) · migrazione legacy
`20260628170000_map.sql` (da deprecare) · `20260628160000_social_friendships.sql`
(`are_friends`, `is_blocked_pair`) · `20260628120000_rooms.sql` (ciclo di vita
stanze) · `20260628210000_gdpr.sql` (`record_consent`,
`process_account_deletion`) · `20260705150300_drops_lifecycle.sql`
(`expire_content` v5, regola anti-regressione) · pattern client
`mobile/src/lib/chat-realtime.ts`, `drops-realtime.ts`, `lib/dialoghi.ts` ·
`mobile/src/constants/{theme,aura,feed}.ts` · `app/(main)/(tabs)/home.tsx`
(ramo full-height DropFeed).

### 0.4 Glossario
- **Aura (sulla mappa)**: la resa visiva di un amico — anello/alone cromatico
  breathing, colore dal tratto dominante (fedele a `vibe_color()` /
  `constants/aura.ts`). Mai un pin.
- **Sessione di condivisione**: finestra opt-in (N ore) in cui l'utente è
  visibile sulla mappa. Auto-expiry servita da `sharing_until`.
- **Live (persona)**: sessione attiva + posizione fresca (< 10 min).
- **Live (evento)**: stanza live messa in mappa dall'host, `ended_at IS NULL`.
- **Echo**: evento terminato, visibile fino a `ended_at + 12h`, con decadimento
  visivo continuo.
- **Last Seen**: ultima posizione nota (sessione scaduta o posizione non
  fresca), visibile fino a 24h dall'ultimo aggiornamento.
- **Safe Zone**: zona personale (centro+raggio) dentro la quale si appare al
  centro-zona con etichetta ("In zona · Casa") invece che al punto esatto.
- **Masking**: la sostituzione punto-esatto → centro-zona. Avviene SERVER-SIDE
  prima della persistenza.
- **Inbox realtime**: il topic privato `map:u:{user_id}` su cui un utente
  riceve i delta dei propri amici (fan-out server-side).
- **Freshness**: recenza dell'ultimo aggiornamento; soglia Live = 10 min.

### 0.5 Convenzioni
Come tutto il repo: migrazioni con header `=== … ===` e razionale in italiano;
funzioni `security definer set search_path = ''` schema-qualificate; RLS su
ogni tabella; grant espliciti con revoke SEMPRE da `public`+`anon`+
`authenticated` prima del grant mirato (default privileges, lezione CM8);
mutazioni via RPC; errori come stringhe-codice; pgTAP esteso con `plan(N)`
aggiornato ed eseguito SUL REMOTO via pooler (CLI bloccata); tipi TS a mano in
`mobile/src/types/supabase.ts`; UI e commenti in italiano.

## 1. Visione — la Mappa nei tre pilastri

La Mappa della Città è la **lente sulla propria cerchia intima**: dove sono, o
sono stati di recente, gli amici veri. Non è una feature di scoperta, non è un
feed, non è un gioco.

- **Proof of Human** — la posizione esatta di default è una dichiarazione: *sei
  tu, davvero, lì*. Le bolle delle Stanze Live sono presenza umana verificabile
  nel momento e nel luogo. Niente posizioni finte, niente profili fake: solo
  amici reciproci confermati.
- **Aura** — l'anello cromatico È il linguaggio visivo della mappa: colore dal
  tratto dominante della settimana, breathing dallo stato (veloce = live,
  lento/spento = memoria). La mappa non mostra MAI numeri: mostra qualità di
  presenza.
- **Anti-doomscroll** — la mappa è **uno sguardo, non una permanenza**: vedi
  chi c'è, esci, vivi. Il decadimento visivo degli Echo comunica "è già
  successo, la vita è altrove". Nessun contenuto infinito da scorrere, nessuna
  notifica generata dalla mappa, nessuna meccanica d'ansia.

Cosa la distingue da ogni "friends map" esistente: (a) è **memoria di attività
recente** — non è mai vuota, perché Live, Echo e Last Seen coprono la giornata;
(b) il **decadimento è l'elemento di design** — fucsia pieno → viola spento →
trasparente, un orologio visivo senza cifre; (c) estetica **cartografia
militare / data-viz** — base scura neutra, zero POI, zero clutter: gli unici
elementi luminosi sono le Aure e le bolle Live.

### 1.1 Attori
- **Io (owner)**: decide se/quando accendersi, per quanto, con quale
  granularità (esatta o Safe Zone). Vede se stesso e tutti gli amici visibili.
- **Amico (viewer)**: vede il mio punto/echo/last-seen SOLO se siamo amici
  accettati e non bloccati.
- **Estraneo / non-amico / bloccato**: non vede NULLA, in nessuno stato.
- **Sistema**: cron di pulizia, trigger di fan-out, moderazione via
  `is_active_user()` (mute/ban bloccano anche la pubblicazione di posizione).

### 1.2 Vincoli non negoziabili (regole d'oro applicate alla mappa)
- Lettura SOLO via RPC filtrata server-side (`are_friends` +
  `is_blocked_pair`); le tabelle mappa NON hanno select policy per il client.
- Nessuno storico di posizione: solo l'ULTIMA posizione + eventi, tutto con
  auto-expiry.
- Masking Safe Zone PRIMA della persistenza: il punto esatto dentro una zona
  non tocca mai il disco.
- Opt-in esplicito con consenso GDPR registrato; revoca istantanea =
  cancellazione fisica della riga.
- Solo `timestamptz` (UTC); localizzazione solo al rendering client.
- La mappa non genera Aura, push né contatori: è pura vista.

## 2. I tre stati di un punto

Gli stati sono **derivati CLIENT-SIDE dai soli timestamp UTC** restituiti dal
server (il server non calcola "stati": restituisce fatti + timestamp; il client
li interpreta con un clock calibrato, v. §8).

| Stato | Condizione (UTC) | Resa visiva |
|-------|------------------|-------------|
| **Live (persona)** | `sharing_until > now` E `updated_at > now − 10 min` | Aura piena, breathing veloce |
| **Live (evento)** | `map_events.ended_at IS NULL` | Bolla stanza con titolo, breathing veloce; tap → dettaglio/join |
| **Echo** | `ended_at` valorizzato E `visibility_expires_at > now` | Bolla con titolo ("Aperitivo al Parco") + "2h fa"; decadimento continuo |
| **Last Seen** | presenza con `updated_at ≤ now − 10 min` (o sessione scaduta), entro 24h dall'ultimo update | Aura spenta/dimmed + "visto Xh fa" |

**Decadimento Echo** (il cuore visivo): `fattore = (visibility_expires_at − now)
/ (visibility_expires_at − ended_at)`, calcolato su **millisecondi UTC** →
mappa 1→0 su opacità/saturazione (fucsia pieno → viola spento → trasparente).
Con Echo a 12h il decadimento copre l'intera finestra.

**Transizioni** (tutte client-side, senza refetch):
- Live → Last Seen: allo scadere della freshness (10 min) o di
  `sharing_until`, il punto si spegne da solo.
- Live (evento) → Echo: quando arriva `event_ended` via realtime (o al
  refetch), la bolla inizia a decadere.
- Echo → nulla: a `visibility_expires_at` il fattore tocca 0 e il punto
  scompare; il cron cancella la riga.
- Last Seen → nulla: a 24h dall'ultimo update il cron cancella la riga (il
  client la nasconde comunque oltre soglia).

## 3. Opt-in gestuale (accensione dell'Aura sulla mappa)

- **Default: invisibile.** Nessuna riga di presenza = non esisto sulla mappa.
  Non serve un "Ghost Mode" per sparire: sparire è lo stato naturale.
- **Accensione**: tap sulla **propria aura** in mappa (bolla "tu", spenta, con
  hint) → sheet con durate **1h / 4h / 8h** (cap server 12h) → l'aura si
  accende per N ore con **auto-expiry**. Countdown discreto visibile solo a sé.
  Niente toggle burocratici nei menu: il gesto È l'opt-in.
- **Prima attivazione assoluta**: sheet di consenso (GDPR, `record_consent`) →
  richiesta permesso OS (When-In-Use) → attivazione. Permesso negato → stato
  spiegato + `Linking.openSettings` (pattern già usato in contatti CM7).
- **Rinnovo**: tap sull'aura accesa → estendi/riduci durata (riscrive
  `sharing_until`).
- **Revoca istantanea**: tap sull'aura accesa → "Spegni ora" → la riga di
  presenza è **CANCELLATA** (non nascosta), gli eventuali eventi live propri
  vengono rimossi (niente Echo), e gli amici ricevono `presence_removed` in
  realtime. Distinzione voluta: **spegnere esplicitamente = sparire del tutto**
  (nemmeno Last Seen); **scadenza naturale = resta il Last Seen** per 24h.
- **Kill-switch master**: `profiles.share_location` nelle impostazioni; se OFF
  ogni RPC di pubblicazione rifiuta (`location_sharing_off`) e l'eventuale
  presenza viene cancellata.

**Edge case**: app uccisa a metà sessione → la sessione resta valida ma senza
update la freshness scade (→ Last Seen) e a 24h il cron pulisce; riapertura
in-sessione → la pipeline riparte da sola. Permesso OS revocato dalle
impostazioni di sistema a sessione attiva → al prossimo foreground il watcher
fallisce, il client mostra lo stato e offre lo spegnimento.

## 4. Safe Zone (1–2 zone personali, opzionali, MAI default)

- L'utente definisce fino a **2** zone: label (es. "Casa", "Lavoro"), centro,
  raggio **100–500m** (default 200m). Quando la posizione reale cade in una
  zona, sulla mappa appare **il centro della zona** con etichetta
  "In zona · Casa" al posto del punto esatto.
- **Il mascheramento avviene SERVER-SIDE nella RPC di pubblicazione**
  (`ST_DWithin` → si persiste GIÀ il centro-zona + `masked = true` +
  `zone_label`): la posizione esatta dentro una Safe Zone **non tocca mai il
  disco**. Questo è GDPR-by-design, non una promessa di UI.
- Vale anche per la posizione delle **stanze** messe in mappa dall'host (la
  bolla usa la posizione dell'host, masked-aware).
- È una scelta dell'utente, disattivabile in ogni momento — non un default
  paternalistico (decisione PO).

**Edge case**: zona creata mentre si è già dentro → maschera dal publish
successivo (≤60s); zone sovrapposte → vince la più vicina al punto reale;
delete zona → dal publish successivo torna il punto esatto; zona che copre il
punto di un Echo già emesso → l'Echo NON viene riscritto (fotografa il momento
della pubblicazione).

## 5. Stanze Live sulla mappa (bolle)

- L'host di una stanza **live** può metterla in mappa (opt-in per-stanza, RPC
  `map_attach_room`): posizione = posizione corrente dell'host (masked-aware),
  titolo = titolo stanza **denormalizzato** (l'Echo sopravvive alla stanza).
  `map_detach_room` la toglie subito (DELETE, niente Echo: il detach è una
  revoca).
- Quando la stanza **finisce naturalmente** (trigger su `rooms.status →
  ended`, con cintura difensiva nel cron): `ended_at = now()`,
  `visibility_expires_at = ended_at + 12h` → la bolla diventa **Echo**
  automaticamente e inizia a decadere.
- Una sola bolla live per stanza (vincolo dati: unique parziale su `room_id
  where ended_at is null`).
- v1: solo stanze di cui un amico è **HOST**. Le stanze dove un amico è solo
  partecipante sono una questione aperta post-M4 (QA-5).

## 6. Clustering e resa visiva

- **Base cartografica**: tile vettoriali OpenFreeMap con stile JSON forkato:
  palette allineata a `theme.ts` (base `#04030a`), toponimi minimi, POI e
  transit rimossi, attribution OSM obbligatoria. La mappa è uno sfondo neutro:
  non compete mai con le Aure.
- **Aure**: canvas Skia sovrapposto (dettagli in §13.5). Colore dal tratto
  dominante (`constants/aura.ts`, fedele a `vibe_color()`); breathing con le
  durate `motion` di `theme.ts` (veloce = Live, assente = Last Seen).
- **Clustering**: aure vicine a zoom bassi si **fondono** (supercluster lato
  client) in un'aura aggregata — dimensione proporzionale al numero, **MAI
  cifre in vista**; allo zoom-in il cluster si apre con **offset radiale**
  (spiderfy). Mai ammassi di pixel. Cap dei punti renderizzati
  simultaneamente: ~40 (il clustering lo garantisce).
- **Tap su un punto** → card bottom-sheet (riuso `lib/dialoghi.ts`): identità
  minima + anello aura + tempo relativo ("2h fa") + azioni (profilo · messaggio
  · join stanza se live).

## 7. Anti-abuso e limiti

- **Rate-limit server** sul publish: min 20s tra scritture (no-op silenzioso
  sotto soglia).
- **Bounds** lat/lng validati server-side.
- **`is_active_user()` richiesto**: mute/ban bloccano anche la pubblicazione
  di posizione (unico punto di enforcement, coerente con Fase 7).
- **Coppie bloccate** escluse OVUNQUE: snapshot E fan-out realtime.
- La mappa **non genera** Aura, notifiche push né contatori: è pura vista
  (eccezione futura possibile: "amico in live vicino" — fuori scope v1).
- Spoofing GPS (mock location): fuori scope v1; eventuale plausibility check
  (velocità implausibile tra publish) annotato come estensione futura.
- Moderazione: la mappa non crea contenuti segnalabili; il blocco via profilo
  e il report della stanza (esistente) coprono i casi.

## 8. Fusi orari e clock (vincolo globale)

- SOLO `timestamptz`. Ogni calcolo di durata/expiry/decadimento avviene su UTC
  (server) o su epoch-ms UTC (client). **Mai** aritmetica sull'ora locale del
  device.
- La localizzazione ("2h fa", "visto ieri") è ESCLUSIVAMENTE resa client via
  `Intl.RelativeTimeFormat('it')` (nativo su Hermes, zero librerie).
- **Calibrazione clock**: `map_snapshot()` restituisce anche `server_now`; il
  client calcola l'offset `server_now − Date.now()` e lo applica a ogni
  derivazione di stato/decadimento → un device con orologio sballato mostra
  comunque stati e decadimenti corretti. Funziona identico da Terni a Rio, per
  chi guarda e per chi è guardato.

## 9. Stati vuoti, freddo, offline

- **Nessun amico visibile** → mappa comunque bella: base scura sulla propria
  città + la propria aura (spenta con CTA di accensione, o accesa) + copy che
  spiega la lente ("Qui vedrai i tuoi amici, quando accendono la loro Aura").
- **Permesso OS negato** → mappa consultabile comunque (vedere gli amici non
  richiede la propria posizione); la propria accensione mostra lo stato
  spiegato + link impostazioni.
- **Offline**: la posizione è effimera per natura → NIENTE outbox: i publish
  falliti si saltano (il prossimo riuscito aggiorna tutto). Lo snapshot usa la
  cache TanStack Query; banner offline come in chat.
- **Errori**: `StatoErrore` uniforme (SRS chat §14) su snapshot/realtime.

## 10. Permessi & privacy (matrice)

| Azione / Vista | Io | Amico | Non-amico | Bloccato | Note |
|---|---|---|---|---|---|
| Vedere il mio punto (Live/Last Seen) | ✅ | ✅ | ❌ | ❌ | via `map_snapshot` + inbox |
| Vedere i miei Echo (eventi finiti) | ✅ | ✅ | ❌ | ❌ | fino a `visibility_expires_at` |
| Vedere posizione esatta vs "in zona" | esatta | come pubblicata | — | — | masking a monte, uguale per tutti i viewer |
| Sapere che ho una Safe Zone / dove | ✅ | ❌ | ❌ | ❌ | il viewer vede solo "In zona · label" |
| Accendere/spegnere la mia aura | ✅ | ❌ | ❌ | ❌ | RPC owner-only |
| Mettere in mappa una mia stanza live | ✅ (host) | ❌ | ❌ | ❌ | `map_attach_room` |
| Leggere le tabelle mappa direttamente | ❌ | ❌ | ❌ | ❌ | nessuna select policy: solo RPC |
| Sottoscrivere l'inbox realtime altrui | ❌ | ❌ | ❌ | ❌ | policy topic su `realtime.messages` |
| Utente `deleted_at` / mutato / bannato | — | non visibile / non pubblica | — | — | filtri snapshot + `is_active_user` |

## 11. Catalogo casi limite

1. **Sessione scade con mappa aperta** → transizione Live→Last Seen derivata
   client-side alla soglia, senza refetch.
2. **Amico revoca ("Spegni ora")** → `presence_removed` realtime → rimozione
   immediata dal client; nessun Last Seen residuo.
3. **Amicizia rimossa / blocco a sessione attiva** → sparisce al prossimo
   snapshot E il fan-out smette subito (il grafo è letto a ogni invio).
4. **Utente cancellato (GDPR)** → righe mappa rimosse da
   `process_account_deletion`; escluso comunque dallo snapshot
   (`deleted_at is null`).
5. **Due device stesso utente** → una sola riga presence (PK user_id): last
   writer wins; la sessione è condivisa tra i device.
6. **App uccisa / crash a metà sessione** → v. §3: Last Seen a scadenza
   freshness, pulizia a 24h.
7. **Permesso OS revocato da impostazioni** → watcher fallisce al foreground;
   stato spiegato; la presenza esistente segue il ciclo naturale.
8. **Zona creata mentre si è dentro** → maschera dal publish successivo
   (≤60s, finestra dichiarata accettabile).
9. **Stanza rinominata dopo l'attach** → l'Echo mostra il titolo denormalizzato
   al momento dell'attach (fotografa il momento, accettato).
10. **Stanza cancellata (FK `on delete set null`)** → l'evento sopravvive come
    Echo con titolo denormalizzato; il tap non offre più il join.
11. **Clock del device sballato** → offset da `server_now` (§8): stati e
    decadimenti restano corretti.
12. **Publish più frequente del rate-limit** (GPS jitter, doppio timer) →
    no-op server, nessun errore utente.
13. **Posizione fuori bounds / NaN** → RPC rifiuta (`invalid_location`).
14. **Cambio fuso del viewer in viaggio** → nessun effetto: tutto è epoch UTC,
    la resa relativa usa il locale corrente.
15. **Utente mutato/bannato prova a pubblicare** → `is_active_user()` false →
    RPC rifiuta; la lettura resta consentita (coerente con Fase 7).

## 12. Mappatura capacità backend: ESISTE vs GAP

**ESISTE (si riusa, non si riscrive):**
- `are_friends(a,b)`, `is_blocked_pair(a,b)` (friendships Fase 4).
- `is_active_user()` (enforcement mute/ban, Fase 7).
- `record_consent` + `consents` (GDPR) · `log_audit`.
- `rooms` + ciclo di vita status (`live`/`ended`) + cron `expire-content` 5 min.
- `profiles.share_location` (kill-switch, riusato con la nuova semantica).
- Colori/tratti Aura: `vibe_color()` DB + `constants/aura.ts` client.
- Pattern client: `chat-realtime.ts` (canali + reconnect), `dialoghi.ts`
  (sheet/conferme), ramo full-height in `home.tsx` (DropFeed), TanStack Query +
  Zustand, `StatoErrore`.
- Flusso operativo: pooler (Deno + postgres.js) per migrazioni/pgTAP/smoke.

**GAP (da costruire in M7):**
- Estensione **PostGIS** (prima estensione "pesante" del progetto).
- Tabelle `map_presence` / `map_events` / `map_safe_zones` + enum
  `map_event_type` + helper `can_see_on_map`.
- 8 RPC (`map_start_sharing`, `map_stop_sharing`, `map_publish_location`,
  `map_set_safe_zone`, `map_delete_safe_zone`, `map_attach_room`,
  `map_detach_room`, `map_snapshot`).
- **Primo uso nel progetto di `realtime.send()`** (broadcast-from-database) +
  policy su `realtime.messages` per topic privati.
- Trigger `rooms → map_events` (chiusura eventi).
- `expire_content` v6 · `process_account_deletion` v6 · `gdpr-export` v4.
- **Deprecazione legacy**: drop `vibe_map`, `live_presence`, `room_locations`,
  `update_presence`, `clear_presence`, `set_room_location`.
- Mobile: TUTTO (Dev Build EAS, MapLibre, expo-location, Skia, supercluster,
  componenti/hook/store/lib mappa).

## 13. Architettura

### 13.1 Schema dati (PostGIS)

- `create extension if not exists postgis with schema extensions` — su Supabase
  hosted tipi e funzioni vanno **schema-qualificati** (`extensions.geography`,
  `extensions.st_dwithin`, `extensions.st_distance`, …) per la convenzione
  `search_path = ''`.
- Enum `public.map_event_type` — v1: `('room_live')`, estensibile (eventi
  manuali futuri = nuovo valore, QA-4).

**`map_presence`** — 1 riga per utente = sessione + Last Seen:

| Colonna | Tipo | Note |
|---|---|---|
| `user_id` | `uuid` PK → `profiles on delete cascade` | |
| `location` | `extensions.geography(point,4326)` NULL | null finché non arriva il primo publish della sessione |
| `masked` | `boolean not null default false` | true se snappata a Safe Zone |
| `zone_label` | `text` | es. "Casa"; solo se masked |
| `sharing_until` | `timestamptz not null` | fine sessione opt-in (cap 12h) |
| `updated_at` | `timestamptz` | ultimo publish = "last seen at" |
| `visibility_expires_at` | `timestamptz` | `updated_at + 24h`, ricalcolato a ogni publish |

Indici: GIST(`location`), btree(`visibility_expires_at`).

**`map_events`** — eventi georiferiti (v1: stanze live):

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `uuid` PK `default gen_random_uuid()` | |
| `user_id` | `uuid not null` → profiles | host/autore |
| `room_id` | `uuid` → `rooms on delete set null` | l'Echo sopravvive alla stanza |
| `event_type` | `public.map_event_type not null` | v1: `room_live` |
| `title` | `text not null` | denormalizzato dal titolo stanza |
| `location` | `extensions.geography(point,4326) not null` | posizione host all'attach, masked-aware |
| `masked` / `zone_label` | come sopra | |
| `started_at` | `timestamptz not null default now()` | |
| `ended_at` | `timestamptz` | NULL = live |
| `visibility_expires_at` | `timestamptz` | set alla chiusura: `ended_at + 12h` |

Indici: GIST(`location`), btree(`user_id`), btree(`visibility_expires_at`),
**unique parziale** su `room_id where ended_at is null` (una sola bolla live
per stanza).

**`map_safe_zones`**:

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid not null` → profiles | |
| `label` | `text not null` | es. "Casa" |
| `center` | `extensions.geography(point,4326) not null` | |
| `radius_m` | `int not null default 200 check (radius_m between 100 and 500)` | |
| `created_at` | `timestamptz not null default now()` | |

Indice btree(`user_id`). Cap **2 per utente** (guardia nel trigger E nella RPC).

**RLS e grant** — tutte e tre le tabelle con `enable row level security`:
- `map_presence` e `map_events`: **NESSUNA policy select per authenticated**
  (pattern `audit_log`) — lettura SOLO via RPC; `revoke all … from public,
  anon, authenticated` (regola default-privileges CM8).
- `map_safe_zones`: select owner-only (`user_id = (select auth.uid())`),
  mutazioni solo via RPC.

**Helper** `public.can_see_on_map(p_owner uuid, p_viewer uuid)` (stable,
definer): `p_owner = p_viewer OR (are_friends(p_owner, p_viewer) AND NOT
is_blocked_pair(p_owner, p_viewer))`.

### 13.2 RPC (tutte SECURITY DEFINER, search_path='', errori stringhe-codice, grant solo authenticated)

- **`map_start_sharing(p_hours int)`** — valida 1..12; esige
  `is_active_user()` e `profiles.share_location = true`; upsert riga
  `map_presence` con `sharing_until = now() + make_interval(hours => p_hours)`
  (se la riga esiste da un Last Seen precedente: aggiorna solo la sessione,
  conserva la posizione). Il consenso GDPR è registrato dal client PRIMA della
  prima attivazione (`record_consent`).
- **`map_stop_sharing()`** — revoca istantanea: DELETE riga presence + DELETE
  degli eventi live propri (`ended_at is null`) + fan-out `presence_removed`
  (e `event_ended` con flag rimozione) alle inbox amici.
- **`map_publish_location(p_lat double precision, p_lng double precision)`** —
  guardie: autenticato, `is_active_user()`, sessione attiva
  (`sharing_until > now()`), kill-switch, bounds (lat ∈ [−90,90], lng ∈
  [−180,180]); **rate-limit**: no-op se `updated_at > now() − interval '20
  seconds'`; **masking Safe Zone**: se `ST_DWithin(punto, zona.center,
  zona.radius_m)` per una zona dell'utente → persiste il **centro-zona** più
  vicino + `masked=true` + `zone_label`; update riga (`updated_at = now()`,
  `visibility_expires_at = now() + interval '24 hours'`); **fan-out realtime
  SOLO se** spostamento > ~30m dal punto precedente (`ST_Distance`) o cambio
  stato masked. Ritorna `{ok, masked}`.
- **`map_set_safe_zone(p_label text, p_lat, p_lng, p_radius_m int)`** /
  **`map_delete_safe_zone(p_id uuid)`** — CRUD con cap 2 e validazioni.
- **`map_attach_room(p_room uuid)`** — solo host di stanza `status='live'`
  (pattern del vecchio `set_room_location`); richiede sessione di condivisione
  attiva (la posizione della bolla è quella dell'host, masked-aware); insert
  `map_events` (`room_live`, title denormalizzato). **`map_detach_room(p_room
  uuid)`** — DELETE dell'evento live (niente Echo: è una revoca).
- **`map_snapshot()` returns jsonb** — LA porta di lettura. Restituisce
  `{server_now, me, friends[], events[]}`:
  - `me`: stato sessione propria (sharing_until, masked, zone_label,
    updated_at) + proprie zone;
  - `friends[]`: per ogni amico visibile (filtri: `can_see_on_map`,
    `deleted_at is null`, `visibility_expires_at > now()`): identità minima
    (user_id, username, display_name, avatar_url), **aura** (colore/tratto per
    l'anello), lat/lng, masked/zone_label, timestamp GREZZI UTC (updated_at,
    sharing_until, visibility_expires_at);
  - `events[]`: eventi live+echo degli amici (id, user_id, room_id, title,
    lat/lng, masked/zone_label, started_at, ended_at, visibility_expires_at).
  - Gli stati Live/Echo/LastSeen li deriva il CLIENT. Niente parametro bbox in
    v1 (scala ≤150 amici: snapshot completo, il client fa fit-to-bounds).

### 13.3 Realtime (non-polling) — modello "inbox"

- **Deviazione motivata** dall'indicazione originaria "canali
  `friends:{user_id}`": con N amici il client dovrebbe tenere N sottoscrizioni
  (oltre ~100 canali il client Realtime soffre, e ogni cambio del grafo
  richiederebbe join/leave). Modello scelto: **UNA inbox privata per utente**,
  topic `map:u:{user_id}`. Chi pubblica fa fan-out **server-side** alle inbox
  dei propri amici via **`realtime.send()`** (broadcast-from-database) dentro
  RPC/trigger — il grafo di amicizia è letto AL MOMENTO dell'invio → revoca
  amicizia = stop broadcast per costruzione. Il client sottoscrive UN canale,
  solo mentre la mappa è montata. La sostanza dell'indicazione PO (canali
  popolati server-side dal grafo) è preservata; cambia solo la topologia.
- **Autorizzazione**: canali `private: true` + policy su `realtime.messages`
  (select per authenticated: `using (realtime.topic() = 'map:u:' || (select
  auth.uid())::text)`) → nessuno può sottoscrivere l'inbox altrui.
- **Eventi**: `presence` (upsert punto amico) · `presence_removed` ·
  `event_started` · `event_ended`. Payload minimo: id/kind, lat/lng,
  masked/zone_label, timestamp UTC. Mai dati sensibili oltre il necessario.
- **Lo snapshot è la verità, il realtime è delta**: refetch a mount e a ogni
  ritorno in foreground (pattern `chat-realtime.ts` / `drops-realtime.ts`).

### 13.4 Ciclo di vita & cron

- **`expire_content` v6** (⚠️ REGOLA ANTI-REGRESSIONE: corpo v5 VERBATIM, con
  REPLACE del solo blocco mappa): delete `map_presence` con
  `visibility_expires_at < now()`; delete `map_events` con
  `visibility_expires_at < now()`; **cintura difensiva**: eventi `room_live`
  con stanza non più live e `ended_at is null` → chiusura (il trigger su
  `rooms` è la via primaria); RIMOZIONE dei blocchi legacy
  (`live_presence`/`room_locations`). Cadenza: cron `expire-content` esistente
  (5 min) — **nessun job nuovo**.
- **`process_account_deletion` v6** (verbatim + add/replace): delete
  `map_presence` / `map_events` / `map_safe_zones` dell'utente; i rami legacy
  `live_presence`/`room_locations` SPARISCONO (tabelle droppate).
- ⚠️ **Vincolo di ordinamento critico**: la migrazione che droppa le tabelle
  legacy DEVE ridefinire `expire_content` e `process_account_deletion` **nella
  stessa transazione**, altrimenti il cron a 5 minuti esplode sul riferimento
  mancante. MAI splittare in due migrazioni.
- **GDPR**: `gdpr-export` **v4** (sezioni `map_presence`/`map_events`/
  `map_safe_zones`, art. 15) — si accoda alla coda deploy-owner esistente
  (`storage-cleanup`, `gdpr-export` v3, `send-push` v2; CLI 403).

### 13.5 Client RN (`mobile/`) — flusso, stato, rendering, batteria

- **Mappa base**: `@maplibre/maplibre-react-native` + tile vettoriali
  **OpenFreeMap** (base `https://tiles.openfreemap.org/styles/dark`, fork del
  JSON in asset locale: palette `#04030a` da `theme.ts`, toponimi minimi,
  POI/transit rimossi, attribution OSM obbligatoria). **Richiede Dev Build
  EAS** (già necessario per M4/LiveKit — Expo Go resta valido per il resto
  dell'app).
- **Ingresso**: Home → categoria **Map** → ramo full-height in
  `app/(main)/(tabs)/home.tsx`, STESSO pattern del ramo `drops`/DropFeed
  (fuori dalla ScrollView: evita il conflitto gesture pan-mappa vs scroll).
- **Pipeline posizione** (`expo-location`, SOLO foreground in v1):
  `watchPositionAsync(Accuracy.Balanced, distanceInterval ≈ 25m, timeInterval
  30s)`; publish 30–60s in movimento, **heartbeat ~4–5 min da fermo**
  (mantiene la freshness "Live" a costo minimo); watcher attivo solo con
  sessione attiva + app in foreground (AppState); stop immediato a
  revoca/scadenza. Background (significant-location-change / permesso
  "Sempre") = estensione differita esplicita, NON v1 (QA-1).
- **Stato**: `src/store/mapStore.ts` (Zustand: stato sessione propria,
  dizionario punti amici/eventi, offset clock) + TanStack Query per lo
  snapshot; merge dei delta realtime nello store; derivazione
  Live/Echo/LastSeen con **selettori puri su epoch-ms UTC** calibrati
  (`server_now`).
- **Rendering Aure** (decisione PO: canvas, non marker): **canvas Skia
  full-screen** (`@shopify/react-native-skia`) sovrapposto alla mappa;
  proiezione geo→schermo alimentata dai callback continui della camera
  MapLibre verso shared values Reanimated; breathing con le durate `motion` di
  `theme.ts`; decadimento Echo = interpolazione sul fattore UTC. Clustering:
  `supercluster` sui punti in store, spiderfy radiale allo zoom-in.
  **⚠️ Decision gate dichiarato (MM8)**: se il sync canvas↔camera risulta
  percettibilmente laggy su device durante pan/zoom veloci → fallback a
  **MarkerView nativi** di MapLibre (position-tracking nativo) contenenti
  mini-canvas Skia per-aura; col cap ~40 punti visibili il degrado "molti
  marker" non si verifica.
- **Tempo relativo**: `Intl.RelativeTimeFormat('it')` nativo (Hermes) — zero
  librerie extra, zero ora locale nei calcoli.

### 13.6 Alternative considerate e SCARTATE (con motivo)

| Alternativa | Perché scartata |
|---|---|
| **react-native-maps** | In Expo Go solo iOS/Apple Maps SENZA stile custom → estetica data-viz impossibile; Android richiede comunque Dev Build + billing Google (Q-1). |
| **Mapbox (@rnmapbox/maps)** | Ottimo ma token + costi oltre il free tier; MapLibre+OpenFreeMap dà lo stesso controllo a costo zero (Q-1). |
| **Canali realtime per-amico (`friends:{user_id}`)** | N sottoscrizioni per client, limiti canali, join/leave a ogni cambio grafo. Sostituito dal modello inbox (§13.3). |
| **postgres_changes con RLS sulle tabelle mappa** (pattern chat) | Valuta le policy per OGNI subscriber a OGNI update ad alta frequenza, e obbligherebbe una select policy su tabelle che vogliamo NON leggibili. |
| **Realtime Presence (feature dei canali)** | Traccia "chi è connesso al canale", non trasporta posizioni con memoria/Echo; inadatto come fonte dati. |
| **Masking Safe Zone in lettura** (persistere il punto esatto, mascherare nello snapshot) | Il punto esatto vivrebbe su disco dentro la zona → contrario al GDPR-by-design. Masking PRIMA della persistenza. |
| **Geohash/coarse di default** (modello Fase 5) | Contraddice Proof of Human ("sei tu, davvero, lì") e la decisione PO; la coarseness sopravvive come SCELTA (Safe Zone). |
| **Storico posizioni append-only** | Contro filosofia + GDPR: si tiene SOLO l'ultima posizione + eventi con auto-expiry. |
| **Polling dello snapshot** | Né live né efficiente; resta solo come refetch a mount/foreground. |
| **Tabella eventi scritta dal client** | Ogni mutazione passa da RPC definer (convenzione repo): il client non scrive MAI le tabelle mappa. |

---

# PARTE II — PIANO DI IMPLEMENTAZIONE

## 14. Come usare questo piano

- **UNA milestone alla volta**, su comando esplicito del PO ("implementa lo
  step MMx"). Ogni milestone è testabile in isolamento e lascia il sistema
  coerente (mai stati intermedi rotti sul remoto).
- Ordine per dipendenza reale: PostGIS+schema (MM0) → legacy out+lifecycle
  (MM1) → eventi+snapshot (MM2) → realtime (MM3) → GDPR/chiusura backend (MM4)
  → mobile base (MM5) → opt-in+posizione (MM6) → dati reali (MM7) → resa Aura
  (MM8) → Safe Zone UI+polish (MM9). MM0–MM4 sono backend puro (invisibili al
  client); MM5–MM9 frontend.
- **Convenzioni comuni a ogni step backend**: migrazione
  `supabase/migrations/YYYYMMDDHHMMSS_map_*.sql` con header `=== … ===` e
  razionale in italiano; funzioni definer schema-qualificate; revoke SEMPRE da
  `public`+`anon`+`authenticated` poi grant mirato; applicazione via **pooler**
  (Deno + postgres.js — la CLI è bloccata su questa macchina) con registrazione
  in `supabase_migrations.schema_migrations`; pgTAP esteso in
  `supabase/tests/rls_smoke.test.sql` con `plan(N)` aggiornato e suite eseguita
  SUL REMOTO; tipi TS aggiornati A MANO in `mobile/src/types/supabase.ts` +
  `tsc --noEmit` pulito.

## 15. Stato attuale (fotografia al 2026-07-07)

- Backend: 50 migrazioni live, pgTAP 298/298 sul remoto; legacy mappa Fase 5
  live ma inutilizzato da qualsiasi client; coda deploy-owner Edge:
  `storage-cleanup`, `gdpr-export` v3, `send-push` v2.
- Mobile: Expo SDK 54 in Expo Go; NESSUNA libreria mappa/posizione/Skia
  installata; `expo-dev-client` presente ma mai usato per una build; categoria
  Map = `ComingSoon`.

## 16. Milestone

### MM0 — Fondamenta backend (schema + scrittura)

- **Obiettivo**: PostGIS attivo; tabelle `map_presence` / `map_events` /
  `map_safe_zones` con RLS/grant (§13.1); helper `can_see_on_map`; RPC di
  scrittura `map_start_sharing` / `map_stop_sharing` / `map_publish_location`
  (masking + rate-limit) / `map_set_safe_zone` / `map_delete_safe_zone`.
- **Dipendenze**: estensione `postgis` (allowlisted su Supabase hosted);
  esistenti: `are_friends`, `is_blocked_pair`, `is_active_user`,
  `record_consent`.
- **File**: 1 migrazione nuova (`…_map_v2_foundation.sql`); pgTAP.
- **Done when**: migrazione live via pooler; pgTAP verdi SUL REMOTO —
  invarianti nuove: niente select diretta per authenticated/anon sulle
  tabelle; masking persiste il centro-zona (mai il punto esatto in-zona);
  rate-limit 20s; cap 2 zone; publish rifiutato senza sessione / con
  `share_location=false` / da utente mutato; smoke funzionale via pooler.
- **Rischi**: verbosità ST_* schema-qualificate (`extensions.st_dwithin`);
  cast geography↔geometry; PostGIS è la prima estensione "pesante" del
  progetto (verificare versione disponibile sull'hosted PRIMA di scrivere la
  migrazione).

### MM1 — Legacy out + ciclo di vita

- **Obiettivo**: drop ATOMICO di `vibe_map` / `live_presence` /
  `room_locations` e delle RPC geohash (`update_presence`, `clear_presence`,
  `set_room_location`); `expire_content` **v6** e `process_account_deletion`
  **v6** ridefiniti NELLA STESSA migrazione (vincolo §13.4);
  `profiles.share_location` RESTA (kill-switch, nuova semantica).
- **Dipendenze**: MM0 (le v6 puliscono le tabelle nuove).
- **File**: 1 migrazione (`…_map_legacy_out.sql`); pgTAP (guardie prosrc
  aggiornate, invarianti legacy rimosse, `plan(N)` ricalcolato).
- **Done when**: cron `expire-content` gira senza errori dopo il drop
  (verificare `cron.job_run_details` via pooler); pgTAP verdi.
- **Rischi**: il cron a 5 min tocca le funzioni durante il deploy → la
  transazionalità della migrazione è l'unica protezione: MAI splittare in due
  migrazioni.

### MM2 — Stanze sulla mappa + snapshot di lettura

- **Obiettivo**: RPC `map_attach_room` / `map_detach_room`; trigger su `rooms`
  (status→ended ⇒ `ended_at` + `visibility_expires_at = ended_at + 12h` sugli
  eventi collegati); RPC **`map_snapshot()`** completa (persone + eventi +
  aura + timestamp UTC grezzi + `server_now`).
- **Dipendenze**: MM0, MM1.
- **File**: 1 migrazione (`…_map_rooms_snapshot.sql`); pgTAP (snapshot non
  mostra non-amici/bloccati/deleted; echo con expiry corretto; unique live per
  stanza; detach = DELETE senza echo).
- **Done when**: smoke via pooler: attach → evento live nello snapshot
  dell'amico e NON dell'estraneo; end stanza → echo; detach → sparito.
- **Rischi**: title denormalizzato vs rinomina stanza (accettato: l'Echo
  fotografa il momento).

### MM3 — Realtime inbox (fan-out server-side)

- **Obiettivo**: policy su `realtime.messages` per topic privati
  `map:u:{uid}`; fan-out `realtime.send()` da publish/attach/end/stop verso le
  inbox degli amici; soglia di movimento ~30m sul publish.
- **Dipendenze**: MM0–MM2; disponibilità `realtime.send` sull'hosted (primo
  uso nel progetto: VERIFICARE prima via pooler).
- **File**: 1 migrazione (`…_map_realtime.sql`); pgTAP (un utente NON legge
  l'inbox altrui; fan-out esclude bloccati/non-amici).
- **Done when**: smoke con 2 JWT (pooler/client JS): l'amico riceve
  `presence` / `presence_removed` / `event_*` sulla propria inbox; l'estraneo
  non riesce a sottoscrivere il topic altrui.
- **Rischi**: versione/disponibilità `realtime.send`; costo fan-out =
  amici×publish (mitigato da soglia movimento + rate-limit; scala Terni ok,
  rivalutare a ~10k utenti — annotato come debito di scala consapevole).

### MM4 — GDPR + chiusura backend

- **Obiettivo**: `gdpr-export` **v4** (sezioni map) in repo → coda deploy
  owner; verifica del flusso consenso (`record_consent` con tipo dedicato alla
  posizione); suite pgTAP consolidata; smoke backend end-to-end via pooler.
- **Dipendenze**: MM0–MM3.
- **File**: `supabase/functions/gdpr-export/index.ts`; pgTAP.
- **Done when**: export contiene le sezioni nuove (test locale della query);
  delete account rimuove ogni riga mappa (pgTAP); documentazione coda deploy
  aggiornata in `roadmap.md`.
- **Rischi**: coda deploy owner che si allunga (4 Edge in attesa) —
  evidenziarlo in roadmap.

### MM5 — Mobile: Dev Build + mappa base dark

- **Obiettivo**: prima build EAS di sviluppo del progetto; MapLibre montato
  con stile dark custom; schermo Map full-height nella Home.
- **Dipendenze esterne**: account Expo/EAS (`eas build --profile
  development`); pacchetti `@maplibre/maplibre-react-native` (+ config plugin);
  tile OpenFreeMap (nessun token). Sblocca anche M4/LiveKit.
- **File**: `mobile/app.json` (plugin), `mobile/package.json`; ramo `map` in
  `app/(main)/(tabs)/home.tsx` (pattern DropFeed full-height);
  `src/components/mappa/MapCanvas.tsx`; stile in `src/constants/mapStyle.ts`
  (o asset JSON); attribution OSM.
- **Done when**: su device (dev build) la categoria Map mostra la mappa scura
  fluida (pan/zoom 60fps), palette coerente con `theme.ts`, zero POI;
  `tsc`/`eslint` puliti; il resto dell'app continua a girare in Expo Go.
- **Rischi**: primo dev build del progetto (setup EAS, tempi di build);
  compatibilità New Architecture di maplibre-react-native (verificare la
  versione); dimensione dello stile JSON.

### MM6 — Mobile: opt-in gestuale + pipeline posizione

- **Obiettivo**: tap sulla propria aura → sheet durate (1/4/8h) → consenso
  (prima volta) + permesso OS → `map_start_sharing` + watcher `expo-location`
  foreground con throttling adattivo → `map_publish_location`; revoca
  istantanea; kill-switch in impostazioni.
- **Dipendenze**: MM0 (RPC), MM5; pacchetto `expo-location`; permessi in
  `app.json` (stringhe posizione già presenti: verificare).
- **File**: `src/lib/location.ts`, `src/hooks/useCondivisionePosizione.ts`,
  `src/store/mapStore.ts`, `src/components/mappa/ShareSheet.tsx` +
  `MapOnboarding.tsx`; riuso `lib/dialoghi.ts` (CM6.5) per sheet/conferme.
- **Done when**: su device: attiva → riga presence sul DB (verifica pooler)
  con masking se in zona; spegni → riga sparita; permesso negato → stato
  spiegato; battery drain accettabile in 1h di foreground.
- **Rischi**: tuning del throttling (20–50m, da testare in strada); edge case
  AppState (foreground/background rapidi).

### MM7 — Mobile: dati reali sulla mappa (snapshot + realtime)

- **Obiettivo**: `map_snapshot` via TanStack Query + inbox realtime
  (`map:u:{me}`) → merge nello store → punti amici/eventi renderizzati in
  forma FUNZIONALE (dot semplici, senza estetica finale); derivazione stati
  Live/Echo/LastSeen client-side su UTC calibrato (`server_now`).
- **Dipendenze**: MM2–MM3, MM5–MM6.
- **File**: `src/hooks/useMappa.ts`, `src/lib/map-realtime.ts` (pattern
  `chat-realtime.ts`), estensione `mapStore.ts`; `src/types/supabase.ts`.
- **Done when**: 2 device amici: A si accende → B lo vede comparire senza
  refresh; A revoca → sparisce subito; stanza live → bolla; fine stanza →
  echo; estraneo non vede nulla.
- **Rischi**: riconciliazione snapshot/delta (ordine eventi); reconnect del
  canale (riusare la strategia della chat).

### MM8 — Mobile: resa Aura definitiva (Skia) + clustering

- **Obiettivo**: canvas Skia full-screen con aure breathing (colori da
  `constants/aura.ts`), decadimento Echo continuo, Last Seen dimmed,
  clustering supercluster + spiderfy, card dettaglio amico/evento (tap →
  bottom sheet con "2h fa" via Intl; azioni: profilo · messaggio · join
  stanza).
- **Dipendenze**: MM7; pacchetti `@shopify/react-native-skia`, `supercluster`
  (+ `@types/supercluster`).
- **File**: `src/components/mappa/AuraLayer.tsx`, `AuraDot.tsx`,
  `EchoBubble.tsx`, `LiveRoomBubble.tsx`, `MapFriendCard.tsx`;
  `src/lib/clustering.ts`.
- **Done when**: 50 punti simulati fluidi (60fps pan/zoom) su device medio;
  decadimento visivamente continuo; cluster mai sovrapposti; **decision gate
  superato** (sync canvas↔camera ok; altrimenti fallback MarkerView applicato
  e documentato).
- **Rischi**: IL rischio tecnico principale della feature — sync
  proiezione/camera (mitigazione: gate esplicito con fallback già progettato,
  §13.5).

### MM9 — Safe Zone UI + polish + chiusura

- **Obiettivo**: editor Safe Zone (long-press sulla mappa → cerchio + label +
  raggio; lista in impostazioni; max 2); stati vuoti/errore (`StatoErrore`,
  SRS chat §14); accessibilità (label/ruoli, hitSlop ≥44pt);
  `docs/map/MANUAL-TESTING.md` (scenari 2-device, permessi, fusi orari
  simulati); aggiornamento `CLAUDE.md` §4/§6 (nuova regola d'oro posizione,
  QA-7) e `roadmap.md` (M7 → stato).
- **Dipendenze**: MM6–MM8.
- **File**: `src/components/mappa/SafeZoneEditor.tsx`, rotta impostazioni;
  documenti.
- **Done when**: zona creata → publish successivo mascherato (verifica DB);
  MANUAL-TESTING scritto; `tsc`/`eslint` puliti; documenti aggiornati.
- **Rischi**: UX del raggio su mappa (slider vs pinch) — decidere in corsa
  (QA-3).

## 17. Definition of Done — modulo Mappa

- Un estraneo non vede NULLA (snapshot, realtime, tabelle, storage): provato da
  pgTAP + smoke 2 utenti.
- Opt-in gestuale con auto-expiry; revoca istantanea = sparizione fisica; la
  posizione esatta in Safe Zone non è MAI persistita.
- Tre stati derivati solo da timestamp UTC; decadimento continuo; "2h fa"
  corretto su fusi diversi (test simulato).
- Nessun polling: inbox realtime + refetch a mount/foreground.
- Legacy Fase 5 rimosso; cron e GDPR (export/delete) coprono le tabelle nuove;
  pgTAP verdi sul remoto; MANUAL-TESTING eseguito su 2 device.

## 18. Rischi trasversali

1. **Sync canvas Skia ↔ camera mappa** (MM8) — il rischio tecnico n.1;
   mitigato dal decision gate con fallback MarkerView.
2. **Primo Dev Build EAS del progetto** (MM5) — sblocca anche M4, ma è un
   passaggio di ambiente nuovo (provisioning, tempi).
3. **`realtime.send` mai usato nel progetto** (MM3) — verificare
   disponibilità sull'hosted PRIMA di progettare la migrazione nel dettaglio.
4. **Batteria** (MM6) — il tuning delle soglie è empirico: va testato
   camminando, non solo al simulatore.
5. **Costo fan-out a scala** (>10k utenti) — accettato consapevolmente per il
   lancio Terni; rivalutare con dati reali (batch, coalescing, presence-aware
   fan-out).
6. **Coda deploy-owner Edge** che si allunga (4 funzioni) — richiede
   l'account owner, fuori dal controllo di questo ambiente.

## 19. Questioni aperte (richiedono input del product owner)

1. **QA-1 — Semantica "Ghost Mode"**: (a) pausa di invisibilità temporanea
   mentre si continua a vedere gli altri — di fatto già coperta dal modello
   opt-in (default invisibile), quindi probabilmente inutile; (b) condivisione
   in BACKGROUND temporizzata (significant-location-change, permesso "Sempre",
   review store più severa) — proposta: differita post-v1. Da chiarire cosa
   intendevi.
2. **QA-2 — Durate preset opt-in**: proposta 1h / 4h / 8h (cap server 12h).
   Validare.
3. **QA-3 — Raggio Safe Zone**: fisso 200m o scelto dall'utente (slider
   100–500m, default 200)? Proposta: slider.
4. **QA-4 — Eventi manuali senza stanza** ("Aperitivo al Parco" creato a mano,
   senza Live): v1 copre solo le stanze; estensione naturale futura (nuovo
   `event_type` + composer). Decidere se/quando.
5. **QA-5 — Stanze dove un amico è solo partecipante** (non host): mostrarle
   come bolla? Da decidere dopo M4 (serve la lista partecipanti reale).
6. **QA-6 — Soglia freshness "Live"** (proposta 10 min) e heartbeat da fermo
   (4–5 min): da validare sul campo in MM6.
7. **QA-7 — Riformulazione regola d'oro CLAUDE.md §6**: da "posizione sempre
   coarse" a "posizione friends-only, opt-in, auto-expiry; esatta di default,
   coarse su scelta (Safe Zone)" — confermare il testo esatto in MM9.

## Revision history

| Rev | Data | Cosa |
|-----|------|------|
| 1 | 2026-07-07 | Prima stesura: specifica completa + piano MM0–MM9. Decisioni Q-1..Q-4 validate dal PO in sessione. |
