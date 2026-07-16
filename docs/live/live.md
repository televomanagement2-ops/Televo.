# Televo — Live (M12): Specifica di prodotto & Piano di implementazione

> **Rev. 2 — 2026-07-16.** Decisioni di prodotto **L-1..L-4 validate dal product
> owner** (2026-07-09, sessione di pianificazione). Questo è il documento
> ufficiale della milestone **M12 — Live**: Parte I = specifica di prodotto (cosa
> costruiamo e perché), Parte II = piano di implementazione a milestone (come lo
> costruiamo). Compagno di `CLAUDE.md` (mappa backend), `roadmap.md` (stato
> progetto) e dei documenti gemelli `docs/chat/SRS-chat.md`,
> `docs/chat/IMPLEMENTATION-PLAN.md`, `docs/media/drop.md`, `docs/map/map.md`,
> di cui ricalca formato e convenzioni. Lingua: italiano, come tutto il
> progetto.
>
> ⚠️ **EMENDATO da M15 — Rework Live** (`docs/live/live-rework.md`, decisioni
> RW-1..RW-5 del PO 2026-07-15): contatori `viewer_count`/`like_count`
> PUBBLICI ai visibili (eccezione a R-04 limitata alle live), like stile
> TikTok (§6-bis), striscia con terminate <24h → profilo, ranking del feed a
> engagement, segno di fine feed. I punti emendati sono marcati `(M15)` nel
> testo; per il razionale completo vale live-rework.md.

---

## Contesto — perché questo documento

Il PO ha consegnato il master plan "LIVE + MAPPA (stato live)": la **Live** è il
broadcast video personale — un utente (o fino a 4 host in Co-Live) trasmette in
prima persona, in tempo reale, ai propri amici. Nasce dal profilo della persona
(non da un topic), parte da un composer **camera-first** (stile
Instagram/Snapchat, non un form), vive nella Home (striscia orizzontale + feed
verticale stile TikTok) e può apparire sulla **Mappa della Città** (M7) come
anello rosso + callout "LIVE" sull'avatar dell'amico.

La Live è distinta dalle **Stanze Live audio** (`rooms`, Fase 3): quelle sono
stanze per topic con speaker/listener; la Live è la trasmissione della persona.
I due domini **coesistono** (L-2). È il tassello più diretto di **Proof of
Human**: video in prima persona, ora, non falsificabile.

### Decisioni di prodotto vincolanti (product owner, 2026-07-09)

| # | Domanda | Decisione |
|---|---------|-----------|
| L-1 | Perimetro visibilità | **Solo amici accettati.** Niente amici-di-amici; il concetto "scuola" è già stato rimosso dal progetto (decisione PO 2026-07-05). Il feed a due livelli del master plan diventa: prima Top Friends, poi gli altri amici. |
| L-2 | Rapporto con le Stanze Live audio (`rooms`) | **Coesistono.** `lives` è un dominio NUOVO e parallelo; `rooms` non si tocca. |
| L-3 | Pubblico in Co-Live | **Unione degli amici degli host attivi**: uno spettatore deve essere amico accettato di ALMENO UNO degli host in camera e non bloccato da nessuno di loro. |
| L-4 | Notifica di avvio | **Sempre a tutti gli amici, stile TikTok** → `notify_mode` default `all`. Il toggle resta nel composer per abbassare a `top_friends` / `none`. |

### Correzioni al master plan originale (obsoleto rispetto al repo)

- **Mappa**: lo stack è **MapLibre + OpenFreeMap + Skia** (M7 già costruita,
  Q-1 di map.md), NON "React Native Maps + Mapbox GL" come scritto nel master
  plan (che precede M7). Nessun sistema nuovo: si estende M7.
- **"Stessa scuola / amici-di-amici"**: rimossi (L-1).
- **`live_reports` NON si crea**: si riusa il sistema report esistente
  (`reports` + `file_report`) estendendo l'enum `moderation_target` con
  `live` e `live_comment` — stesso principio ("stesso principio già applicato
  al resto dello schema"), meno superficie, coda di revisione già pronta.
- **Realtime commenti**: il pattern provato del repo è postgres_changes + RLS
  (`drop_comments`), non un sistema nuovo.

> ⚠️ **Nota trasversale (L-4)**: la decisione "notifica sempre a tutti gli
> amici" SUPERA la riga del master plan "default basso rumore — mai notificare
> tutti di default". È una scelta esplicita del PO (2026-07-09): la notifica di
> avvio live è il motore di Proof of Human (spettatori veri, subito). Restano
> le mitigazioni anti-rumore: una sola notifica per live (mai su
> pausa/ripresa), guardia anti-spam 10 minuti per host, il toggle per
> abbassare, e NESSUNA notifica per commenti/spettatori.

### Decisioni architetturali dettate dal master plan (vincolanti)

- **Principio guida**: nessuna live o contenuto visibile fuori dalla rete
  verificata (= amici accettati, L-1). In caso di conflitto in implementazione:
  fermarsi e chiedere, mai risolvere verso "più aperto".
- **Stati espliciti a DB**: `live | paused | ended` come enum, non inferenza
  client. `paused` è uno stato visivo chiaro ("Live in pausa"), non uno schermo
  nero.
- **Campo `clip_consent boolean default false`** riservato sin d'ora sulla
  tabella (Momenti Salienti, Fase 2) — nessuna migration dopo.
- **Stack fisso**: LiveKit Cloud (token firmati server-side), Supabase
  Realtime, Postgres+RLS, Edge Functions Deno, Perspective API, pg_cron
  (nessuno scheduler esterno), Reanimated.
- **NO moderazione AI su flussi video/audio** (costi/minuto insostenibili nel
  budget attuale ~€50–150/mese): sicurezza sui flussi = report reattivo + coda
  umana. Da rivalutare in fase successiva, non risolvere ora con soluzioni
  improvvisate.
- **NO blocco tecnico automatico live 1:1 adulto-minore** ora; lasciare il
  gancio naturale nello schema se emerge senza refactor (emerge: v. §14.1,
  `live_viewers`).

---

# PARTE I — SPECIFICA DI PRODOTTO

## 0. Meta

### 0.1 Scopo
Definire **il prodotto** Live: uno sviluppatore deve poter costruire l'intero
dominio leggendo questo documento e il codice esistente. La Parte I non
contiene migrazioni né codice: definisce comportamenti, dati, permessi e casi
limite. La Parte II li traduce in milestone tecniche.

### 0.2 Ambito

**In scope (M12):** avvio camera-first con titolo e riga toggle · stati
live/paused/ended espliciti · Co-Live fino a 4 host (invito amici) ·
spettatori con join/leave/kick · commenti effimeri con moderazione Perspective
· report su live e singolo commento · notifiche di avvio (default tutti gli
amici, L-4) · Aura participation per l'host (rendimenti decrescenti) · Home:
striscia orizzontale + feed verticale paged · Mappa: anello rosso + callout
LIVE con decadimento 3h post-fine · lifecycle server (webhook LiveKit, reti di
sicurezza cron) · GDPR (export/delete) · prompt "live vuota".

**Differito (decisione esplicita futura):** clip automatiche / Momenti
Salienti (Fase 2; `clip_consent` riservato) · blocco tecnico 1:1 adulto-minore
(gancio pronto) · moderazione AI video/audio · regali/monetizzazione in live
(economia 2027) · co-watching / inviti in-app alla live oltre la notifica ·
registrazione/replay.

**Fuori scope:** live pubbliche a sconosciuti (anti-principio) · ranking "per
te" fuori dal grafo · feed infinito di live passate.

> **Emendamento M15 (PO 2026-07-15).** Due voci del fuori-scope originale sono
> state SUPERATE, con perimetro esatto:
> - *"contatori pubblici di spettatori/like"* → da M15 `viewer_count` e
>   `like_count` sono **pubblici a chi può vedere la live** (eccezione
>   esplicita a R-04, LIMITATA alle live). NON si abroga R-04: `peak_viewers`
>   resta privato (host/co-host), la lista nominativa spettatori + kick resta
>   solo dell'host principale, e i **drops restano intoccati** (contatori
>   privati).
> - *"le live finite spariscono: nessun archivio"* → precisata: escono dal
>   feed verticale (nessun replay, nessun archivio) ma restano **24h come
>   segnaposto nella striscia** — un cerchio spento che apre il PROFILO
>   dell'amico (RW-1a), mai la live.
> In scope da M15 anche i **like stile TikTok** (§6-bis), il ranking a
> engagement e il segno di fine feed (§7).

### 0.3 Fonti
Master plan PO "LIVE + MAPPA (stato live)" (2026-07-09) · `CLAUDE.md` §1
(pilastri) e §6 (regole d'oro) · `20260628120000_rooms.sql` (dominio stanze,
NON si tocca; pattern trigger/lifecycle) · `supabase/functions/livekit-token/`
(mint token) · `20260707120000..150000_map_*.sql` (map_events, attach/detach,
fan-out inbox, snapshot) · `20260628190000_moderation.sql` +
`20260705150300_drops_lifecycle.sql` (report polimorfici, pattern
verbatim+add di `moderation_target_user`) · `20260628180000_notifications.sql`
(fan-out set-based) · `20260628155100_aura_helpers.sql` +
`20260628160500_drops.sql` (participation 1/n) ·
`20260705150200_drops_interactions.sql` (commenti + publication + rate-limit)
· pattern client `mobile/src/lib/map-realtime.ts`, `chat-realtime.ts`,
`dialoghi.ts` · `mobile/src/components/mappa/*` (AuraGlyph, LiveRoomBubble,
EchoBubble, mapStore) · `mobile/src/components/drops/DropFeed.tsx` +
`mobile/app/(main)/drop/nuovo.tsx` (pattern feed/composer) ·
`mobile/src/components/feed/FeedLiveCard.tsx` (estetica LIVE rossa già
approvata).

### 0.4 Glossario
- **Live**: sessione di broadcast video personale, legata all'identità
  dell'host. Una riga in `lives`, una stanza LiveKit dedicata
  (`live_<uuid>`).
- **Host (principale)**: chi avvia la live. Unico a poter mettere in pausa,
  terminare, invitare/rimuovere co-host, kickare spettatori.
- **Co-host**: amico invitato dall'host che pubblica audio/video nella stessa
  live (max 4 host totali).
- **Spettatore**: amico di almeno un host attivo che guarda (solo subscribe).
- **Kick**: rimozione forzata di uno spettatore (o co-host) — perde visibilità
  e non può rientrare.
- **Stato live/paused/ended**: macchina a stati esplicita a DB (§2).
- **Badge mappa**: anello rosso + callout "LIVE" sull'avatar dell'host nella
  Mappa della Città; dopo la fine decade in 3h (pattern Echo di M7).
- **Inbox privata utente**: il topic realtime `map:u:{user_id}` di M7 —
  storicamente "map", di fatto l'inbox privata per-utente del progetto; M12 vi
  aggiunge gli eventi live.
- **Spettatore reale**: riga in `live_viewers` (join effettivo via token), base
  per ordinamento feed e criterio Aura.

### 0.5 Convenzioni
Come tutto il repo: migrazioni con header `=== … ===` e razionale in italiano;
funzioni `security definer set search_path = ''` schema-qualificate; RLS su
ogni tabella; grant espliciti con revoke SEMPRE da `public`+`anon`+
`authenticated` prima del grant mirato (default privileges, lezione CM8);
mutazioni via RPC; errori come stringhe-codice; pgTAP esteso con `plan(N)`
aggiornato ed eseguito SUL REMOTO via pooler (CLI bloccata); le guardie pgTAP
`prosrc` leggono anche i commenti dei body → mai citare token legacy nei
commenti; tipi TS a mano in `mobile/src/types/supabase.ts`; UI e commenti in
italiano.

## 1. Visione — la Live nei tre pilastri

La Live è il broadcast personale dentro la cerchia: *guardami, sono io, ora*.
Non è un palco pubblico, non è una TV, non è un talent per sconosciuti.

- **Proof of Human** — il video in prima persona, in diretta, è la prova umana
  più forte del prodotto: non si falsifica, non si programma, non si
  impagina. Le notifiche di avvio a tutti gli amici (L-4) esistono per portare
  **persone vere davanti a persone vere**, subito.
- **Aura** — fare una live con spettatori reali è partecipazione autentica:
  premiata con `participation` a rendimenti decrescenti (come i drop — la
  qualità, non il volume). Guardare NON dà Aura (premiare la visione =
  incentivare watch-time). I commenti tossici costano (`toxicity` via
  moderazione). Sulla mappa l'anello rosso si sovrappone all'anello Aura: la
  live è uno stato, l'Aura resta l'identità.
- **Anti-doomscroll** — le live finite **escono dal feed** (nessun archivio,
  nessun replay; da M15 restano 24h come segnaposto in striscia → profilo,
  §0.2); il feed verticale mostra solo dirette in corso dentro il grafo — è
  FINITO quando finiscono le live (segno di fine, M15/RW-5) e onestamente
  vuoto quando non c'è nessuno (nessun riempitivo algoritmico); il prompt
  "live vuota" spinge a chiudere invece di lasciar marcire una diretta morta.
  (I contatori 👁/❤ pubblici sono un'eccezione deliberata del PO, M15 §0.2 —
  limitata alle live, mai estesa a drops o profili.)

### 1.1 Attori
- **Host**: avvia dalla propria camera, controlla tutto (pausa, fine, inviti,
  kick); resta l'unico a vedere la LISTA nominativa degli spettatori (il
  NUMERO da M15 è pubblico ai visibili, RW-4).
- **Co-host**: pubblica nella live dell'host; può andarsene; non controlla la
  live.
- **Spettatore (amico)**: guarda, commenta (se abilitato), può silenziare
  localmente e segnalare.
- **Non-amico / bloccato / kickato**: non vede NULLA — né nel feed, né sulla
  mappa, né via realtime, né via token.
- **Sistema**: webhook LiveKit (riconciliazione), cron `expire-content` (reti
  di sicurezza), moderazione via `is_active_user()`.

### 1.2 Vincoli non negoziabili (regole d'oro applicate alla Live)
- Visibilità SOLO amici accettati (unione degli host in Co-Live, L-3), filtrata
  da un unico predicato server-side (`can_see_live`); coppie bloccate escluse
  OVUNQUE (RLS, feed, fan-out, token, commenti).
- Token LiveKit firmati SOLO server-side (Edge); `canPublish` solo per host e
  co-host attivi; spettatori subscribe-only.
- `is_active_user()` su ogni percorso di scrittura: mute/ban bloccano
  creazione live, commenti e inviti (unico punto di enforcement, Fase 7).
- Video dei minori mai persistito in v1 (nessuna registrazione, nessun bucket:
  il flusso vive solo in LiveKit); niente posizione nella live — il badge
  mappa passa dal sistema M7 (opt-in, masked-aware, revoca istantanea).
- Solo `timestamptz` UTC; stati derivati client con clock calibrato
  (`server_now`, pattern M7 §8).
- Contatori (EMENDATO da M15, PO 2026-07-15): `viewer_count` e `like_count`
  sono PUBBLICI a chi può vedere la live — eccezione esplicita a R-04
  limitata alle live. Restano privati: `peak_viewers` (host e co-host attivi,
  M14/V6) e la lista nominativa spettatori + kick (solo host principale); i
  drops restano a contatori privati. Il feed usa `viewer_count` come ranking
  (§7) e come pezzo del cursore keyset (supera AH-2 per le sole live).

## 2. Stati di una Live (macchina a stati)

Enum esplicito a DB: `live_status = ('live','paused','ended')`. Il trigger
`lives_before_write` è l'unico arbitro delle transizioni.

| Da → A | Chi | Effetti |
|--------|-----|---------|
| (creazione) → `live` | host via `create_live` | `started_at = now()`; notifiche (una volta sola); fan-out `live_started`; attach mappa best-effort se `show_on_map` |
| `live` → `paused` | host via `pause_live` | `paused_at = now()`; fan-out `live_status`; NESSUNA nuova notifica; l'evento mappa RESTA aperto (spec 2.3) |
| `paused` → `live` | host via `resume_live` | `paused_at = null`; fan-out `live_status`; NESSUNA nuova notifica |
| `live`/`paused` → `ended` | host via `end_live`, webhook `room_finished`, reti di sicurezza cron, deletion GDPR | `ended_at = now()`, STATO FINALE E IMMUTABILE; fan-out `live_ended`; evento mappa → Echo 3h; premio Aura se qualificata |

- Non esiste `scheduled`: la live è camera-first, nasce già in diretta.
- `ended` è terminale: ogni update successivo è rifiutato dal trigger.
- **Una sola live attiva per host** (unique parziale su `host_id where
  ended_at is null`); tentativo doppio → errore `live_already_active`.
- In `paused` gli spettatori restano connessi e vedono "Live in pausa" (stato
  visivo chiaro, non uno schermo nero che sembra un bug); il client host smette
  di pubblicare le tracce (unpublish), la stanza LiveKit resta viva.

## 3. Avvio — composer camera-first

Flusso: tap su **+** nella bottombar → menu tipi di contenuto (`MenuCrea`, la
voce "Live" sostituisce l'attuale placeholder disabilitato) → **fotocamera a
schermo intero** (preview immediata via traccia locale LiveKit, non un form) →
riga compatta di toggle a icona + campo **titolo (obbligatorio, 1–80)** →
bottone **"Avvia Live"**.

| Toggle | Default | Note |
|--------|---------|------|
| Co-Live on/off | Off | se acceso: selezione rapida amici da invitare (max 3 aggiuntivi, tetto 4 host totali) |
| Commenti on/off | On | `comments_enabled` |
| Mostra sulla mappa | **Off** (opt-in esplicito) | richiede sessione posizione M7 attiva; senza, si avvia comunque (`map_attached:false`) e il client lo dice con un hint |
| Chi può vedere | Tutti gli amici | alternativa: solo Top Friends (cerchia 1–8 esistente) |
| Notifica | **Tutti gli amici** (L-4) | abbassabile a Top Friends / Nessuna |

- `clip_consent` NON compare in UI (campo riservato, sempre `false` in v1).
- In pausa/ripresa i toggle non sono rieditabili in v1 (fotografano l'avvio);
  eccezione: i co-host si invitano anche a live in corso.
- Permessi OS: camera+microfono richiesti all'ingresso nel composer; negati →
  stato spiegato + `Linking.openSettings` (pattern contatti CM7).

## 4. Co-Live (fino a 4 host)

- L'host invita **amici** (`are_friends`, non bloccati, `is_active_user`) come
  co-host: dal composer o durante la diretta. Notifica `live_cohost_invite`
  al singolo invitato.
- L'invito va **accettato** (`live_accept_cohost`): finché è `invited` conta
  nel tetto 4 ma non pubblica; l'host può revocarlo.
- Il co-host attivo pubblica audio/video (`canPublish` nel token), può
  **andarsene** da solo (`left`), può essere **rimosso** dall'host
  (`removed` + disconnessione media immediata via Edge `live-kick`).
- **Pubblico = unione degli amici degli host ATTIVI** (L-3): quando B accetta,
  gli amici di B (non bloccati da nessun host) vedono la live nel feed e
  possono entrare. Quando B esce/viene rimosso, i suoi amici non-amici di A
  perdono la visibilità (predicato rivalutato ovunque; per chi sta già
  guardando vale il caso limite §12.4).
- Eccezione voluta: con `visibility = 'top_friends'` il pubblico resta SOLO la
  cerchia Top Friends dell'host PRINCIPALE (l'intimità è una scelta di chi
  apre la live; l'unione vale solo per `all_friends`).
- Il co-host non è "in live" ai fini della mappa: l'anello rosso appartiene a
  chi è host principale di una live in stato `live` (spec 2.1: "non conta
  essere spettatore o co-host passivo").

## 5. Spettatori

- **Entrare**: dal feed, dalla striscia, dalla notifica o dalla mappa → il
  client chiede il token alla Edge (`livekit-token` con `live_id`): il mint
  **è** il join (upsert in `live_viewers`) — una chiamata sola, e ogni
  ricontrollo di visibilità passa da lì.
- **Uscire**: `live_leave` (best-effort; il webhook LiveKit riconcilia i
  disconnessi silenziosi).
- **Kick**: l'host apre la lista spettatori (partecipanti LiveKit) → "Rimuovi"
  → Edge `live-kick`: marca `kicked_at` a DB POI `removeParticipant` su
  LiveKit (media tagliato subito). Il kickato non rientra (il predicato
  `can_see_live` e il token lo rifiutano) e non commenta più.
- **Volume locale**: mute lato client, non tocca il microfono dell'host.
- **Revalidation**: il client spettatore ri-esegue `live_detail` ogni ~60s;
  su `not_visible`/`ended` si disconnette (copre blocco/rimozione amicizia a
  metà live, §12.4).
- Da M15 (RW-4) il NUMERO di spettatori è pubblico a tutti i visibili: pilla
  👁 in stanza per tutti (conteggio client-side dai partecipanti LiveKit,
  istantaneo; lo spettatore aggiunge sé stesso — non è tra i remoti) e
  `viewer_count` nel feed/detail. La LISTA nominativa col kick resta SOLO
  dell'host principale; `peak_viewers` resta privato di host e co-host attivi.

## 6. Commenti (effimeri, moderati)

- Campo commento: pillola semi-trasparente in basso a sinistra, placeholder
  "Commenta..."; tap → overlay vetro smerigliato (blur), tastiera; invio →
  il messaggio appare nella colonna commenti in basso a sinistra per tutti.
- **Fade-out client-side** dopo alcuni secondi (i vecchi messaggi sfumano per
  non sporcare lo schermo). Il fade è SOLO visivo: la riga resta a DB per la
  finestra di moderazione.
- Regole server (trigger, specchio `drop_comments`): autore forzato
  `auth.uid()`, `is_active_user`, `can_see_live`, `comments_enabled`, stato
  `live` (in pausa non si commenta), solo testo ≤200 caratteri, **rate-limit
  5 commenti / 30s** per utente per live.
- **Moderazione in tempo reale**: dopo l'insert il client chiama
  fire-and-forget `moderate-text` (`target_type='live_comment'`) → Perspective
  → `enqueue_moderation`: severità ≥0.9 = **auto-mute 30 min** del commentatore
  (`is_active_user` blocca i suoi commenti OVUNQUE, gratis) + Aura `toxicity`.
  Senza `PERSPECTIVE_API_KEY` degrada con grazia (coda umana).
- **Realtime**: `live_comments` in pubblicazione `supabase_realtime`
  (postgres_changes + RLS `can_see_live`) — pattern provato di drop_comments.
- **Retention**: i commenti vivono fino a **24h dopo la fine della live**, poi
  `expire_content` li elimina (gli excerpt dei segnalati sopravvivono in
  `moderation_queue`). Nessuna notifica per i commenti (l'host è in diretta).

## 6-bis. Like stile TikTok (M15/RW-3)

- **UX** (schermo `/live/[id]`, host E spettatori): **double-tap ovunque sul
  video** → cuore NEL punto del tap che sale/scala/sfuma (~900ms, jitter) +
  **bottone cuore** nel rail dei controlli. Like **illimitati, non-toggle**
  (ogni tap = +1). **Contatore totale ❤** in pilla accanto alla 👁, visibile
  a TUTTI i visibili (RW-3b), sale in realtime quando chiunque lika. I cuori
  sono SOLO locali (RW-3a): dei like altrui si vede solo il contatore. In
  pausa non si lika (gesto/bottone spenti + il trigger rifiuta, specchio dei
  commenti). Nella preview del feed i like NON esistono.
- **Meccanica dati — batching**: un tap NON è un insert. Il client accumula e
  scarica lotti su `live_likes` con flush ogni **800ms** (`count` 1..50 per
  riga; flush finale best-effort all'unmount); rate-limit server **15
  insert/10s** per (live, utente) — le due cifre sono ACCOPPIATE (chi ne
  cambia una cambia l'altra; commenti gemelli nel trigger SQL e in
  `useLiveLikes`). `lives.like_count` è incrementato a delta dal sync-trigger
  SOLO su INSERT (purge/delete NON decrementano: totale storico monotòno,
  come `peak_viewers`); il display client è monotòno (baseline snapshot +
  delta realtime altrui + tap propri in optimistic, mai regressioni).
- **Arbitro server** (`live_likes_before_insert`, specchio dichiarato dei
  commenti): autore/created_at forzati, `is_active_user`, live esistente,
  stato `live`, `can_see_live`, `count between 1 and 50`, rate-limit. Errori
  come codici-stringa; il client scarta il lotto IN SILENZIO (niente retry).
- **Cosa i like NON fanno**: niente Aura (QA-1 di live-rework.md — mai
  sommare like grezzi illimitati), niente notifiche, niente moderazione (non
  hanno contenuto), niente lista "chi ha messo like" in UI.
- **Retention & GDPR**: righe `live_likes` purgate a 24h dalla fine (stesso
  blocco di commenti/viewers in `expire_content`); `like_count` sopravvive
  come **aggregato anonimo** e muore coi 30 giorni della riga `lives`;
  `process_account_deletion` v8 cancella le righe proprie; `gdpr-export` v6
  le esporta (art. 15).

## 7. Home — striscia + feed verticale

Nella **categoria `live` della Home** (già in `FEED_CATEGORIES`, oggi
`ComingSoon`), ramo full-height fuori dalla ScrollView (pattern DropFeed/Map).

**A. Striscia orizzontale in alto** — scroll orizzontale di cerchi, SOLO amici
(L-1), in due metà (M15/RW-1):
1. le live **ATTIVE**: foto profilo + **anello rosso pulsante**
   (`colors.danger`, pulse `motion.pulse`) + etichetta "LIVE"; tap → apre la
   live; stesso ordine del feed verticale;
2. le live **TERMINATE da <24h**: anello statico grigio (`colors.faint`, MAI
   rosso né pulse), avatar spento, etichetta "FINITA"; tap → **PROFILO
   dell'amico** (RW-1a: non esiste replay); spariscono a 24h esatte da
   `ended_at` (filtro client su clock calibrato); un host con live attiva
   vince sul proprio segnaposto; la propria terminata non appare. Porta di
   lettura dedicata `lives_strip()` (§15.2); le terminate NON entrano MAI nel
   feed verticale.

**B. Feed verticale sotto, stile TikTok** — `FlatList pagingEnabled`, una live
a schermo per volta come **preview video reale** (connessione subscribe-only
alla SOLA pagina visibile, disconnessione allo scroll — budget LiveKit, §12.15;
audio mutato in preview, tap per entrare nello schermo spettatore completo,
QA-3; pilla 👁 statica col `viewer_count`, QA-2 di live-rework.md). Ordine
server-side (M15/RW-2, tutto dentro il grafo del viewer):
1. live di **Top Friends** del viewer (Best Friends SEMPRE primi);
2. TUTTE le altre per **engagement = SOLO spettatori concorrenti**
   (`viewer_count` desc); recenza e id come tie-break. L'**Aura è USCITA dal
   ranking** (resta nel payload per l'anello colore in UI).

Mai un ranking che pesca fuori dal grafo. Quando le pagine finiscono
(`has_more=false`), l'ultima "pagina" è un **segno di fine** (`FineFeedLive`,
gemello di SeiInPari dei drops — M15/RW-5), alto esattamente una pagina: il
paging snappa pulito e su quella pagina NESSUNA preview è connessa (budget
R-3 gratis). Feed vuoto = stato onesto ("Nessun amico è in live ora") con CTA
ad avviarne una — niente riempitivi (con la striscia sopra, se esistono
terminate).

L'aggiornamento è **realtime**: gli eventi `live_started`/`live_ended`
sull'inbox privata patchano striscia e feed senza polling; `lives_feed` è la
verità a mount/foreground (pattern snapshot+delta di M7).

## 8. Mappa — stato live degli amici (estende M7)

- **Anello rosso** attorno all'avatar sulla mappa = l'amico è **host
  principale** di una live in stato `live` ORA (non `paused`, non spettatore,
  non co-host). Colore di default = anello Aura settimanale esistente (nessun
  sistema colore nuovo).
- **Callout "LIVE"**: fumetto con punta (balloon), icona + testo "LIVE",
  **persistente** sopra l'avatar per tutta la durata dello stato live —
  visibile scorrendo la mappa, non solo al tap.
- **Dopo la fine**: badge + anello rosso restano **3 ore** da `ended_at`, poi
  decadono (client-side, identico meccanismo `fattoreEcho` di M7 — che è
  già parametrico su `ended_at → visibility_expires_at`, quindi il TTL 3h è
  gratis). In `paused` il badge resta pieno e il countdown NON parte.
- **Meccanica**: riuso integrale di `map_events` con `event_type =
  'live_broadcast'` + colonna `live_id` — attach/detach/chiusura specchiano
  le stanze (M7 §5). Il badge esiste SOLO se: `show_on_map = true` (opt-in
  esplicito) E l'host ha una sessione di condivisione M7 attiva con posizione
  pubblicata (masked-aware: la Safe Zone maschera anche il badge live).
- **Revoca**: `map_stop_sharing` e il kill-switch `share_location` già
  cancellano TUTTI i `map_events` dell'utente → il badge live sparisce
  all'istante, la live continua (mappa e live sono ortogonali).
- Tap sul badge/avatar → card amico esistente (`MapFriendCard`) estesa con
  azione "Guarda la live".

## 9. Notifiche

- **`live_started`** — all'avvio, set-based (`insert … select`), destinatari
  secondo `notify_mode`: `all` (default, L-4) = tutti gli amici accettati non
  bloccati; `top_friends` = cerchia 1–8; `none` = nessuno. UNA sola volta per
  live (mai su pausa/ripresa). **Guardia anti-spam**: niente nuova notifica se
  il destinatario ha già una `live_started` non letta dello stesso host da
  <10 min (pattern dedup di `drop_comments_after_insert_notify`) — copre
  l'host che avvia/chiude ripetutamente.
- **`live_cohost_invite`** — al singolo amico invitato.
- **MAI** notifiche per: commenti, spettatori entrati/usciti, fine live,
  kick. Il push viaggia sull'infrastruttura esistente (`enqueue_notification`
  → `dispatch_push` → `send-push`), zero pezzi nuovi.

## 10. Aura

- **Host**: al passaggio a `ended`, se la live è **qualificata** — durata
  ≥5 minuti E ≥1 spettatore reale distinto (righe `live_viewers`) — emette
  `participation` con **rendimenti decrescenti**: `round(1.0 / n, 3)` dove
  `n` = live qualificate dell'host chiuse oggi (formula identica ai drop).
  Anti-gaming: live vuote da 10 secondi non valgono nulla; farmare live
  ripetute rende `1/n`.
- **Co-host e spettatori**: NIENTE. Premiare la visione = incentivare
  watch-time (anti-pilastro); il co-host viene premiato quando sarà lui ad
  aprire la sua live.
- **Tossicità**: commenti oltre soglia → Aura `toxicity` negativa via
  moderazione esistente (nessun meccanismo nuovo).
- I badge/achievement NON toccano l'Aura (layer separato, Fase 6); un
  achievement "prima live" è un'estensione naturale ma NON in scope M12.
- **I like (M15) NON toccano l'Aura**: un like non è un prop (nessun tratto,
  nessun anti-gaming possibile su volumi illimitati) — questione aperta QA-1
  di live-rework.md per un eventuale segnale futuro anti-gaming.

## 11. Anti-abuso, safety, moderazione

- **Report**: `file_report('live', live_id, reason)` per la live/host;
  `file_report('live_comment', comment_id, reason)` per il singolo commento.
  Tutto il downstream esiste già: `moderation_queue`, revisione umana,
  `take_moderation_action` (warn/mute/ban), audit.
- **Perspective sui commenti** in tempo reale (§6). NESSUNA moderazione AI
  sui flussi video/audio (fuori scope esplicito, v. Contesto).
- **Ban/mute dell'host a live attiva** (azione moderatore o auto-mute):
  `expire_content` force-enda le live il cui host non passa più
  `is_active_user()` — latenza ≤5 min, accettata per l'MVP.
- **Kick ≠ block**: il kick vale per QUELLA live; il blocco (`block_user`
  esistente) taglia la relazione ovunque. Il kick non notifica.
- **Rate-limit**: commenti 5/30s; creazione live protetta dall'unicità
  attiva + frizione naturale del flusso camera.
- **Titolo**: max 80 caratteri, niente Perspective in v1 (il report copre;
  costo/beneficio annotato in QA-5).

## 12. Catalogo casi limite

1. **Host crasha / app uccisa** → LiveKit svuota la stanza → webhook
   `room_finished` chiude la live server-side; rete di sicurezza finale: cap
   durata 8h in `expire_content` (QA-1).
2. **Pausa dimenticata** → auto-end dopo 30 min di `paused` ininterrotta
   (`expire_content`, QA-2). Telefonata in arrivo = il client mette in pausa
   automaticamente (interruzione audio OS) e riprende alla fine.
3. **Kick** → `kicked_at` blocca `can_see_live` (feed, commenti, RLS, token)
   E `removeParticipant` taglia il media immediatamente. Rientro impossibile.
4. **Blocco / rimozione amicizia DURANTE la live** → visibilità DB revocata
   subito (commenti, token, feed, fan-out); la subscription LiveKit già
   attiva può sopravvivere fino alla revalidation del client (~60s, §5) o
   alla scadenza token (1h). Gap residuo (client malevolo che ignora la
   revalidation, fino a fine live): documentato e ACCETTATO per l'MVP.
5. **Doppia live stesso host** → unique parziale → `live_already_active`.
6. **Co-host invitato che non accetta mai** → resta `invited`: conta nel
   tetto 4, non pubblica; l'host lo revoca; le righe muoiono con la live.
7. **Co-host già in un'altra live** → nessun vincolo DB in v1 (fisicamente
   non pubblicherà in due stanze); annotato, non bloccato.
8. **Commenti in pausa** → rifiutati dal trigger (stato `live` richiesto).
9. **Report su live/commento già purgato** → la riga può non esserci più, ma
   l'excerpt in `moderation_queue` (scritto al momento della segnalazione o
   della moderazione automatica) sopravvive alla purge.
10. **Host bannato/mutato in diretta** (incl. auto-mute Perspective ≥0.9 su un
    SUO commento) → force-end ≤5 min via `expire_content`.
11. **`map_stop_sharing` / kill-switch a metà live** → l'evento mappa è
    cancellato (`removed:true`), il badge sparisce all'istante, la live
    continua normalmente.
12. **`show_on_map=true` ma nessuna sessione posizione** → l'attach è saltato
    senza errore (`map_attached:false`); il client mostra un hint ("attiva la
    posizione per apparire sulla mappa").
13. **Token scaduto (TTL 1h) su live lunga** → la connessione attiva
    sopravvive; ogni reconnect richiede un token nuovo = ricontrollo completo
    di visibilità/kick.
14. **Cancellazione account (GDPR) con live attiva** → `process_account_
    deletion` v7 la termina e cancella le righe; la stanza LiveKit muore da
    sola (empty timeout / webhook).
15. **Budget LiveKit (free 50k min partecipante/mese)** → ogni preview del
    feed è una connessione subscriber: si connette SOLO la pagina visibile,
    disconnessione immediata allo scroll, audio mutato. Scala Terni ok;
    monitorare la dashboard LiveKit (rischio trasversale R-3).
16. **Expo Go** → superficie Live gated come `MapCanvas`
    (`Constants.appOwnership === 'expo'` → "La Live richiede la Dev Build");
    il resto dell'app continua a funzionare.
17. **Clock del device sballato** → stati e decadimento 3h derivati con
    offset `server_now` (pattern M7 §8), sia sulla mappa sia nel feed.
18. **Tutti gli host se ne vanno ma la stanza non è chiusa** → webhook
    `room_finished` (empty timeout LiveKit) → end server-side.
19. **Spettatore entra durante la pausa** → consentito (token joinable in
    `paused`): vede subito "Live in pausa" — comportamento voluto (restare in
    attesa è previsto dalla spec).
20. **Live vuota prolungata** → prompt gentile all'host, SOLO client (timer:
    0 spettatori per ~3 min): "Nessuno sta guardando — continua o termina?"
    con le due opzioni chiare.

## 13. Permessi & privacy (matrice)

| Azione / Vista | Host | Co-host attivo | Amico (visibile) | Non-amico | Bloccato / Kickato |
|---|---|---|---|---|---|
| Vedere la live (feed/striscia/mappa/realtime) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Entrare come spettatore (token) | — | — | ✅ | ❌ | ❌ |
| Pubblicare audio/video (`canPublish`) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Commentare | ✅ | ✅ | ✅ (se abilitati, stato `live`) | ❌ | ❌ |
| Inviare like (solo stato `live` — M15/RW-3) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Pausa / riprendi / termina | ✅ | ❌ | ❌ | ❌ | ❌ |
| Invitare / rimuovere co-host, kick | ✅ | ❌ | ❌ | ❌ | ❌ |
| Vedere `viewer_count` / `like_count` (pille, feed, detail — M15/RW-4) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Vedere `peak_viewers` | ✅ | ✅ (M14/V6) | ❌ | ❌ | ❌ |
| Lista nominativa spettatori + kick | ✅ (solo host principale) | ❌ | ❌ | ❌ | ❌ |
| Vedere il cerchio "terminata" in striscia (<24h — M15/RW-1) | — (propria esclusa) | ✅ | ✅ | ❌ | ❌ |
| Segnalare live / commento | — | ✅ | ✅ | ❌ | ❌ |
| Scrivere le tabelle live direttamente | ❌ | ❌ | ❌ | ❌ | ❌ (solo RPC/definer; eccezioni trigger-arbitrate: `live_comments` su `(live_id, body)`, `live_likes` su `(live_id, count)`) |
| Utente `deleted_at` / mutato / bannato | non crea/commenta | idem | lettura ok | — | — |

Con `visibility='top_friends'`: la colonna "Amico (visibile)" vale solo per i
Top Friends dell'host principale (§4).

## 14. Mappatura capacità backend: ESISTE vs GAP

**ESISTE (si riusa, non si riscrive):**
- `are_friends`, `is_blocked_pair`, `top_friends` (Fase 4) · `is_active_user`
  (Fase 7).
- Sistema report COMPLETO: `reports`, `file_report`, `moderation_queue`,
  `enqueue_moderation` (auto-mute ≥0.9), `take_moderation_action`,
  `moderation_target_user` (pattern verbatim+add già usato per drop_comment).
- Edge `moderate-text` (Perspective, degradazione con grazia) — da estendere
  di un valore.
- Edge `livekit-token` (mint server-side, env `LIVEKIT_*`) — da estendere con
  il ramo live.
- Notifiche: `enqueue_notification`, fan-out set-based, dedup 10 min,
  `dispatch_push`/`send-push`.
- Aura: `emit_aura`, enum `participation`, formula `1/n` (drops).
- Mappa M7 al completo: `map_events` (enum `map_event_type` progettato
  estensibile), attach/detach pattern, trigger di chiusura, `map_snapshot()`
  (events già generico), `map_fanout` + inbox `map:u:{uid}` + policy,
  kill-switch, `fattoreEcho` client parametrico.
- Cron: `expire-content` 5 min (NESSUN job nuovo).
- Client: `map-realtime.ts` (inbox), `chat-realtime.ts`, DropFeed
  (full-height feed), composer drops, `dialoghi.ts`, `StatoErrore`,
  `FeedLiveCard` (estetica LIVE), `AuraGlyph`/`AuraDot`/`LiveRoomBubble`/
  `EchoBubble`, clock calibrato, pooler per migrazioni/pgTAP.

**GAP (da costruire in M12):**
- 3 valori enum su tipi esistenti + 3 tipi nuovi (§14.1).
- Tabelle `lives` / `live_hosts` / `live_viewers` / `live_comments` + helper
  `can_see_live` + trigger.
- 10 RPC (§14.2) + helper `live_fanout`.
- Colonna `map_events.live_id` + `map_attach_live`/`map_detach_live` + trigger
  di chiusura 3h.
- `expire_content` v7 · `process_account_deletion` v7 · `gdpr-export` v5.
- Edge: ramo live in `livekit-token`, `live-kick`, `livekit-webhook` (nuove),
  un valore in `moderate-text`.
- Mobile: TUTTO il dominio live (SDK LiveKit RN + Dev Build, composer, schermi
  host/spettatore, feed, striscia, badge mappa, store, lib, tipi).

## 15. Architettura

### 15.1 Schema dati

**Migrazione enum SEPARATA** (`…_live_enums.sql`, PRIMA del dominio —
`alter type … add value` non può stare nella stessa transazione che usa il
valore, convenzione `*_enum.sql` del repo):
- `public.moderation_target` + `'live'`, `'live_comment'`
- `public.notification_type` + `'live_started'`, `'live_cohost_invite'`
- `public.map_event_type` + `'live_broadcast'`

**Tipi nuovi** (nella migrazione dominio): `public.live_status =
('live','paused','ended')` · `public.live_visibility =
('all_friends','top_friends')` · `public.live_notify_mode =
('none','top_friends','all')`.

**`lives`** — 1 riga per broadcast:

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `uuid` PK `default gen_random_uuid()` | |
| `host_id` | `uuid not null` → `profiles on delete cascade` | host principale |
| `title` | `text not null check (length(title) between 1 and 80)` | obbligatorio |
| `status` | `public.live_status not null default 'live'` | macchina a stati §2 |
| `livekit_room_name` | `text not null unique` | trigger: `'live_' \|\| gen_random_uuid()` — mai scelto dal client |
| `visibility` | `public.live_visibility not null default 'all_friends'` | |
| `comments_enabled` | `boolean not null default true` | |
| `show_on_map` | `boolean not null default false` | opt-in esplicito |
| `notify_mode` | `public.live_notify_mode not null default 'all'` | L-4 |
| `clip_consent` | `boolean not null default false` | riservato Fase 2, inerte |
| `started_at` | `timestamptz not null default now()` | |
| `paused_at` | `timestamptz` | valorizzato SOLO mentre in pausa |
| `ended_at` | `timestamptz` | NULL = attiva; stato finale |
| `viewer_count` | `int not null default 0` | sync-trigger da `live_viewers` (attivi); da M15 PUBBLICO ai visibili (grant per-colonna) |
| `peak_viewers` | `int not null default 0` | massimo storico; resta PRIVATO (fuori dal grant) |
| `like_count` | `int not null default 0` | M15: sync-trigger da `live_likes` SOLO su INSERT (totale storico, mai decrementato); pubblico ai visibili |
| `created_at` | `timestamptz not null default now()` | |

Indici: **unique parziale `(host_id) where ended_at is null`** (una live attiva
per host) · btree(`status`) · btree(`host_id`).

**`live_hosts`** — host principale + co-host (tetto 4):

| Colonna | Tipo | Note |
|---|---|---|
| `live_id` | `uuid not null` → `lives on delete cascade` | PK (live_id, user_id) |
| `user_id` | `uuid not null` → `profiles on delete cascade` | |
| `role` | `text not null check (role in ('host','cohost'))` | |
| `status` | `text not null default 'invited' check (status in ('invited','active','left','removed'))` | l'host principale nasce `active` |
| `invited_at` | `timestamptz not null default now()` | |
| `joined_at` / `left_at` | `timestamptz` | |

Trigger cap: `count(*) where status in ('invited','active') ≤ 4` per live.

**`live_viewers`** — spettatori reali + registro kick:

| Colonna | Tipo | Note |
|---|---|---|
| `live_id` | `uuid not null` → `lives on delete cascade` | PK (live_id, user_id) |
| `user_id` | `uuid not null` → `profiles on delete cascade` | |
| `joined_at` | `timestamptz not null default now()` | |
| `left_at` | `timestamptz` | NULL = dentro; riconciliato dal webhook |
| `kicked_at` / `kicked_by` | `timestamptz` / `uuid` | kick = visibilità revocata per QUESTA live |

È insieme: fonte del `viewer_count` (sync-trigger), criterio "spettatori
reali" per feed e Aura, registro kick (negato in `can_see_live` E nel token),
e **gancio naturale** per il futuro blocco 1:1 adulto-minore (basterà un
predicato su `is_adult` in `can_see_live`/token — nessun refactor).

**`live_comments`**:

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `uuid` PK | |
| `live_id` | `uuid not null` → `lives on delete cascade` | |
| `author_id` | `uuid not null` → `profiles on delete cascade` | forzato dal trigger |
| `body` | `text not null check (length(body) between 1 and 200)` | solo testo, niente reply |
| `created_at` | `timestamptz not null default now()` | |

Indice btree(`live_id`, `created_at`). **In pubblicazione
`supabase_realtime`** (postgres_changes + RLS). Trigger before-insert: §6.

**`live_likes`** (M15/LR0, migrazione 69) — una riga = un LOTTO di like:

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `uuid` PK `default gen_random_uuid()` | |
| `live_id` | `uuid not null` → `lives on delete cascade` | |
| `user_id` | `uuid not null` → `profiles on delete cascade` | forzato dal trigger |
| `count` | `integer not null check (count between 1 and 50)` | tap nel lotto (batching client 800ms) |
| `created_at` | `timestamptz not null default now()` | forzato dal trigger |

Indici: btree(`live_id`, `created_at`) (finestra rate-limit + purge) ·
btree(`user_id`) (GDPR). **In pubblicazione `supabase_realtime`**
(postgres_changes + RLS `can_see_live`). Trigger: `live_likes_before_insert`
(arbitro, §6-bis) + `sync_live_like_count` AFTER INSERT (delta su
`lives.like_count`, salta le `ended`). Grant: `insert (live_id, count)` a
authenticated (`user_id` FUORI dal grant) + select; niente update/delete.

**Helper** `public.can_see_live(p_live uuid, p_viewer uuid)` (stable,
definer) — l'UNICO predicato di visibilità, riusato da RLS, RPC, token,
commenti, fan-out:
1. host o co-host `active` → true;
2. altrimenti: NON kickato (`live_viewers.kicked_at is null` o riga assente)
   E nessun `is_blocked_pair` con alcun host attivo E:
   - `visibility='all_friends'` → `are_friends` con ≥1 host attivo (L-3);
   - `visibility='top_friends'` → presente nei `top_friends` dell'host
     PRINCIPALE (e amico).

**RLS e grant** (tutte le tabelle con `enable row level security`, revoke
SEMPRE da `public`+`anon`+`authenticated` prima dei grant):
- `lives`: select policy `lives_select_visible` via `can_see_live` (serve a
  client, commenti e postgres_changes); **NESSUN insert/update/delete
  client** — solo RPC (troppi effetti collaterali: notifiche, fan-out, mappa).
- `live_hosts`, `live_viewers`: select limitata (host della live vede tutto;
  l'utente vede le proprie righe); mutazioni solo RPC/definer.
- `live_comments`: select via `can_see_live`; insert diretta consentita
  (grant su `live_id, body`) col trigger che valida tutto — pattern
  drop_comments.

### 15.2 RPC (tutte SECURITY DEFINER, search_path='', errori stringhe-codice, grant solo authenticated)

- **`create_live(p_title text, p_visibility public.live_visibility default 'all_friends', p_comments_enabled boolean default true, p_show_on_map boolean default false, p_notify_mode public.live_notify_mode default 'all') returns jsonb`** —
  guardie: autenticato, `is_active_user`, nessuna live attiva
  (`live_already_active`), titolo valido. Effetti atomici: insert `lives` +
  riga `live_hosts` (host, active) + notifiche set-based `live_started`
  secondo `notify_mode` (con guardia dedup 10 min) + fan-out `live_started` +
  se `p_show_on_map`: attach mappa best-effort (senza sessione/posizione NON
  fallisce). Ritorna `{live_id, livekit_room_name, map_attached}`.
- **`pause_live(p_live uuid)`** / **`resume_live(p_live uuid)`** — solo host
  principale; transizioni §2; fan-out `live_status`.
- **`end_live(p_live uuid)`** — solo host principale; stato finale; fan-out
  `live_ended`; il trigger di stato chiude l'evento mappa (+3h) e assegna
  l'Aura se qualificata.
- **`live_invite_cohost(p_live uuid, p_user uuid)`** — solo host; invitato
  amico, attivo, non bloccato; tetto 4 (`cohost_cap_reached`); notifica
  `live_cohost_invite`.
- **`live_accept_cohost(p_live uuid)`** — l'invitato: `invited → active`,
  `joined_at`; da qui il suo grafo entra nel pubblico (L-3) e il suo token
  ottiene `canPublish`.
- **`live_remove_cohost(p_live uuid, p_user uuid)`** — solo host: `removed`
  (revoca invito o rimozione attiva; il taglio media immediato è compito
  della Edge `live-kick`).
- **`live_leave(p_live uuid)`** — spettatore: `left_at = now()`; co-host
  attivo: `status='left'` (best-effort, il webhook riconcilia).
- **`lives_feed(p_top boolean, p_viewers integer, p_before timestamptz,
  p_before_id uuid, p_limit integer) returns jsonb`** — la porta di lettura
  del feed, **v3** (M13/P8 = paginata keyset; M15/LR1 = ranking a
  engagement): live attive (`live`/`paused`) visibili al chiamante
  (`can_see_live`), con identità host, title, status, started_at, flag
  `is_top_friend` e `viewer_count` (pubblico da M15, anche nel cursore);
  ordinamento `is_top desc, viewer_count desc, started_at desc, id desc`
  (Best Friends SEMPRE primi, poi engagement = solo spettatori concorrenti;
  l'Aura è fuori dal ranking). Keyset QUATERNARIO (tutti i cursor-param o
  nessuno); `rpc('lives_feed', {})` = prima pagina (tutti default). Il
  cursore è instabile sotto churn di viewer_count: duplicati/salti accettati
  (dedup client + reconcile 60s).
- **`live_detail(p_live uuid) returns jsonb`** — dettaglio + revalidation,
  **v3** (M14/V6 + M15/LR1): live, host attivi, flag chiamante
  (`is_host`,`is_cohost`,`can_comment`); `viewer_count` e `like_count` nel
  jsonb `live` di base (TUTTI i visibili, RW-4); il blocco condizionale
  host/co-host attivo consegna il SOLO `peak_viewers`; errore `not_visible`
  se `can_see_live` è falso → il client si disconnette.
- **`lives_strip() returns jsonb`** (M15/LR2, migrazione 71) — la porta della
  seconda metà della striscia: live TERMINATE da <24h visibili al chiamante
  (`can_see_live` funziona anche su `ended`: le righe `live_hosts` restano;
  kickati/bloccati esclusi), `{server_now, ended:[{live_id, ended_at,
  host{…}}]}`, `ended_at desc`, cap 20, la propria esclusa. NIENTE aura né
  contatori nel payload. INVARIANTE dichiarata: la finestra 24h COINCIDE con
  la purge di `live_viewers` (registro kick) in `expire_content` — le due
  durate si muovono insieme, o i kickati rientrano in striscia.
- Interne (revoke totale, nessun grant): `live_fanout(p_live, p_event,
  p_payload)` (§15.4) e la funzione di premio Aura richiamata dal trigger.

### 15.3 Edge Functions

- **`livekit-token` ESTESA** (stessa funzione: stessa env, stessa logica di
  base — niente duplicazione): body `{room_id}` XOR `{live_id}`. Ramo live:
  profilo attivo → live esistente e joinable (`live`/`paused`; `ended` → 409
  `live_not_joinable`) → ruolo: host/co-host `active` = `canPublish:true`;
  altrimenti `can_see_live` e non kickato = subscribe-only (403 `forbidden`
  in caso contrario). **Il mint FA il join**: upsert `live_viewers`
  (admin client) con reset di `left_at` — una sola chiamata client, e il
  rientro post-kick muore qui. Token: identity = user_id, room =
  `livekit_room_name`, TTL 1h. Risposta invariata `{token, ws_url, room,
  identity, can_publish}`.
- **`live-kick`** (nuova, verify_jwt=true): body `{live_id, user_id,
  scope: 'viewer'|'cohost'}`; solo host principale; scrive `kicked_at` /
  `status='removed'` via admin POI `RoomServiceClient.removeParticipant`
  (livekit-server-sdk) — DB prima, media dopo: se la seconda fallisce il
  predicato ha già chiuso, il retry è idempotente.
- **`livekit-webhook`** (nuova, verify_jwt=false): endpoint per i webhook di
  LiveKit Cloud, **firma verificata con `WebhookReceiver`** (stessa API
  key/secret — NON x-cron-secret: l'auth è di LiveKit). Eventi gestiti:
  `participant_left` → riconcilia `left_at` dello spettatore/co-host caduto;
  `room_finished` → end della live server-side (idempotente se già `ended`).
  Ignora stanze non-`live_*`. Config del webhook nella dashboard LiveKit
  Cloud = azione owner (annotata in coda deploy).
- **`moderate-text` ESTESA**: `'live_comment'` (e `'live'`) aggiunti
  all'array dei target ammessi. Nessun'altra modifica: Perspective, soglie e
  degradazione restano identiche.
- Registrazioni in `config.toml`: `[functions.live-kick]` verify_jwt=true,
  `[functions.livekit-webhook]` verify_jwt=false.

### 15.4 Realtime

- **Segnale "amico in live"** (striscia, feed, mappa): si RIUSA l'**inbox
  privata utente** di M7 (topic `map:u:{uid}`, policy
  `map_inbox_select_own`, subscription client già esistente — il prefisso
  `map:` è storico, il canale è di fatto l'inbox privata del progetto).
  Nuovo helper **`live_fanout(p_live, p_event, p_payload)`**: `realtime.send`
  agli amici degli host ATTIVI (dedup, filtro `visibility`, blocchi esclusi
  per costruzione — il grafo è letto al momento dell'invio, come
  `map_fanout`). Eventi: `live_started {live_id, host, title, visibility}` ·
  `live_status {live_id, status}` · `live_ended {live_id}`. Best-effort come
  `realtime.send` (errori → WARNING).
- **Commenti**: postgres_changes su `live_comments` (pubblicazione + RLS
  `can_see_live`) — pattern drop_comments provato; canale per-live
  sottoscritto solo dentro lo schermo spettatore/host.
- **Like (M15)**: postgres_changes INSERT su `live_likes` come SECONDO
  listener sullo STESSO canale client `live:{liveId}` dei commenti (un
  canale, un socket, UN solo subscribe per schermo — `subscribeLiveRealtime`);
  volume bounded dal batching (≤15 lotti/10s per utente attivo). NESSUN
  evento inbox nuovo, NESSUN fan-out `live_fanout` per i like. La striscia
  delle terminate non ha canali propri: `live_ended` (già gestito) invalida
  la query strip, il refetch 60s copre i force-end del cron.
- **Contatore spettatori in stanza**: dagli eventi participant di LiveKit
  lato client (istantaneo, zero costo); il `viewer_count` a DB serve solo
  all'ordinamento feed e al prompt live-vuota.
- **Lo snapshot è la verità, il realtime è delta**: `lives_feed` a
  mount/foreground, eventi inbox come patch (pattern M7 §13.3).

### 15.5 Ciclo di vita & cron

- **`expire_content` v7** (⚠️ REGOLA ANTI-REGRESSIONE: corpo v6 VERBATIM +
  soli blocchi live in coda; stessa migrazione = stessa transazione, vincolo
  MM1): force-end live `live` con `started_at < now() − 8h` (cap durata,
  QA-1) · force-end live `paused` con `paused_at < now() − 30 min` (QA-2) ·
  force-end live attive il cui host NON passa `is_active_user()` (ban/mute
  moderatore) · purge `live_comments` e `live_viewers` di live `ended` da
  >24h · delete righe `lives` `ended` da >30 giorni (minimizzazione; le
  righe `live_hosts` cascano) · **cintura difensiva mappa**: `map_events`
  `live_broadcast` con `ended_at is null` ma live non più attiva → chiusura
  +3h (specchio della cintura rooms). Cadenza: cron `expire-content`
  esistente (5 min) — **nessun job nuovo**. Evoluzioni: **v8** (M13/P7,
  riconciliazione anti-drift di `viewer_count`) e **v9** (M15/LR3, migrazione
  72: purge `live_likes` nello stesso blocco 24h di commenti/viewers — le
  righe a 30 giorni cascano già con `lives`; `like_count` NON viene toccato,
  totale storico).
- **Trigger `lives_map_close_events`** (via primaria, specchio
  `rooms_map_close_events`): `status → 'ended'` ⇒ sugli eventi collegati
  `ended_at = now()`, `visibility_expires_at = now() + interval '3 hours'`,
  fan-out `event_ended {removed:false}`. In `paused` NON scatta (il badge
  resta, spec §8).
- **Trigger premio Aura**: after-update su `status='ended'` → se qualificata
  (§10) `emit_aura(host,'participation', round(1.0/n,3), 'live', live_id)`.
- **`process_account_deletion` v7** (verbatim v6 + add): end + DELETE delle
  `lives` proprie (cascade su hosts/viewers/comments), delete dei propri
  `live_comments` / `live_viewers` / `live_hosts` su live altrui. Le righe
  `map_events` dell'utente sono già cancellate dal blocco mappa v6. **v8**
  (M15/LR3): + delete delle righe `live_likes` proprie — `lives.like_count`
  resta (aggregato anonimo non riconducibile all'interessato, muore coi 30
  giorni della riga `lives`).
- **GDPR — `gdpr-export` v5** (art. 15): sezioni `lives` (proprie),
  `live_comments` (scritti), `live_viewers` e `live_hosts` (proprie righe).
  **v6** (M15/LR3): + sezione `live_likes` (le proprie righe). Si accoda alla
  coda deploy-owner.
- **Consenso**: NESSUN nuovo tipo di consenso GDPR — trasmettere è un atto
  volontario e puntuale dell'utente (come postare un drop), non un
  trattamento passivo/continuativo come la posizione (che il consenso ce
  l'ha). I permessi OS camera/microfono restano il gate tecnico.

### 15.6 Client RN (`mobile/`)

- **SDK**: `@livekit/react-native` + `@livekit/react-native-webrtc` +
  `@livekit/react-native-expo-plugin` (config plugin in `app.json`) →
  richiede **Dev Build EAS** (già in uso per la mappa M7; Expo Go → guard
  "La Live richiede la Dev Build", pattern `MapCanvas`). `registerGlobals()`
  all'avvio del modulo live. Permessi: stringhe camera/mic già presenti in
  `app.json` (aggiornare la description camera per citare la live).
- **Ingresso creazione**: `MenuCrea` → voce "Live" (oggi `enabled:false` in
  `constants/createTypes.ts`) → rotta `/live/nuovo`: preview camera full
  screen da traccia locale LiveKit (NESSUNA dipendenza expo-camera in più),
  riga toggle §3, titolo, "Avvia Live" → `create_live` → token → publish →
  rotta `/live/[id]` in modalità host.
- **Schermo live `/live/[id]`** (host e spettatore, stessa rotta, ruolo dal
  token/detail): video full-screen (`VideoView`), overlay commenti in basso
  a sinistra (blur + fade-out Reanimated), pillola commento, controlli host
  (mic, camera, pausa/riprendi con unpublish tracce, co-host sheet, lista
  spettatori con kick, termina), controlli spettatore (volume locale,
  segnala live/commento via `dialoghi.ts`), stato "Live in pausa",
  revalidation `live_detail` 60s, prompt live-vuota (timer host).
- **Home**: ramo `category==='live'` in `home.tsx` sostituisce `ComingSoon`
  con superficie full-height (pattern DropFeed): striscia orizzontale
  (`LiveStripAvatar`: avatar + anello rosso pulsante `colors.danger`,
  `motion.pulse`) + `FlatList pagingEnabled` verticale, connessione
  subscribe-only alla sola pagina visibile (viewability), audio mutato in
  preview, tap → `/live/[id]`.
- **Mappa** (estensione M7, file esistenti): `mapStore` indicizza gli eventi
  `live_broadcast` per `user_id`; `AuraDot` con nuova prop → `AuraGlyph`
  disegna un **anello esterno rosso** (`colors.danger`) quando l'amico ha un
  evento live attivo, con pulse; **callout balloon "LIVE"** persistente
  sopra il marker (variante rossa di `LiveRoomBubble`); evento senza punto
  amico visibile → bolla rossa standalone (riuso `EchoBubble`-like); dopo
  `ended` dissolvenza 3h via `fattoreEcho` (già parametrico). Card amico:
  azione "Guarda la live".
- **Stato**: `src/store/liveStore.ts` (Zustand: live attive per id/host,
  clock offset condiviso) + TanStack Query (`lives_feed`, `live_detail`);
  handler nuovi (`live_started`/`live_status`/`live_ended`) registrati nella
  subscription inbox esistente (`map-realtime.ts` esteso, un solo canale).
- **Niente outbox**: la live è intrinsecamente online; errori →
  `StatoErrore`/`dialoghi`, mai retry in coda.

### 15.7 Alternative considerate e SCARTATE (con motivo)

| Alternativa | Perché scartata |
|---|---|
| **Estendere `rooms` con format 'broadcast'** | Stati (`scheduled/cancelled` vs `paused`), ruoli (speaker/listener vs cohost/viewer) e visibilità (`public/private` vs grafo amici) divergono troppo: schema ibrido fragile. Domini paralleli (L-2). |
| **Deprecare `rooms`** | Dominio già live sul remoto, cuore Proof of Human, la mappa lo supporta. Nessun guadagno (L-2). |
| **Tabella `live_reports` dedicata (master plan §4)** | Il sistema report polimorfico esiste già con coda e azioni: due enum value e un branch in `moderation_target_user` bastano. |
| **Edge `live-token` separata** | Duplicherebbe env, CORS, controlli profilo di `livekit-token` per lo stesso SDK; un ramo `live_id` è più piccolo e mantiene UN punto di mint. |
| **Topic realtime nuovo `live:u:{uid}`** | Una policy + un canale client in più per zero benefici: l'inbox privata M7 esiste già ed è per-utente, non per-dominio. |
| **Broadcast per-live per i commenti** | Richiederebbe una receive-policy nuova su `realtime.messages` con query di visibilità; postgres_changes + RLS è il pattern provato (drop_comments) alla scala di una live tra amici. |
| **Notifiche "amico in live" via polling client** | Anti-pattern: l'inbox realtime esiste; il polling resta solo come refetch a mount/foreground. |
| **Conteggio spettatori via webhook/DB in tempo reale** | Latenza e carico inutili: dentro la stanza il dato vive già negli eventi participant di LiveKit; il DB serve solo a feed/prompt. |
| **Aura anche agli spettatori / per minuto di visione** | Watch-time = anti-pilastro. Premiata solo la creazione qualificata, a rendimenti decrescenti. |
| **Moderazione AI dei flussi video/audio** | Costo per minuto insostenibile ora (budget ~€50–150/mese); report + coda umana per l'MVP (scope esplicito del PO). |
| **Registrazione/replay delle live** | Anti-doomscroll: la live è presenza, non contenuto d'archivio. `clip_consent` resta il gancio per la Fase 2 (Momenti Salienti). |
| **expo-camera per la preview del composer** | La traccia locale LiveKit fa da preview senza dipendenze native aggiuntive. |

---

# PARTE II — PIANO DI IMPLEMENTAZIONE

## 16. Come usare questo piano

- **UNA milestone alla volta**, su comando esplicito del PO ("implementa lo
  step LMx"). Ogni milestone è testabile in isolamento e lascia il sistema
  coerente (mai stati intermedi rotti sul remoto).
- Ordine per dipendenza reale: enums+dominio (LM0) → mappa backend (LM1) →
  feed/fan-out/notifiche/Aura (LM2) → lifecycle+GDPR (LM3) → Edge LiveKit
  (LM4) → mobile fondamenta (LM5) → composer+schermo live (LM6) → home feed
  (LM7) → mappa mobile+chiusura (LM8). LM0–LM4 backend puro; LM5–LM8
  frontend.
- **Convenzioni comuni a ogni step backend**: migrazione
  `supabase/migrations/YYYYMMDDHHMMSS_live_*.sql` con header `=== … ===` e
  razionale in italiano; funzioni definer schema-qualificate; revoke SEMPRE
  da `public`+`anon`+`authenticated` poi grant mirato; applicazione via
  **pooler** (Deno + postgres.js — la CLI è bloccata) con registrazione in
  `supabase_migrations.schema_migrations`; pgTAP esteso in
  `supabase/tests/rls_smoke.test.sql` con `plan(N)` aggiornato e suite
  eseguita SUL REMOTO; smoke funzionale via pooler (impersonazione
  `request.jwt.claims` + `set local role authenticated`); tipi TS aggiornati
  A MANO in `mobile/src/types/supabase.ts` + `tsc --noEmit` pulito.

## 17. Stato attuale (fotografia al 2026-07-09)

- Backend: 54 migrazioni live sul remoto, pgTAP 392/392; dominio `rooms`
  live e intoccato; mappa M7 (MM0–MM4) completa con inbox realtime; coda
  deploy-owner Edge: `storage-cleanup`, `gdpr-export` v4, `send-push` v2.
- Mobile: Expo SDK 54; Dev Build EAS in uso per mappa/Skia; LiveKit e SDK
  video NON installati; categoria `live` in Home = `ComingSoon`; voce
  "Stanza Live" nel MenuCrea disabilitata; `FeedLiveCard` placeholder
  statico con estetica LIVE rossa già approvata.
- M6 Drops: DM0–DM7 nel working tree (ultimo commit `3313425 drop system`).

## 18. Milestone

### LM0 — Enum + fondamenta dominio

- **Obiettivo**: tutti i valori enum in pancia; tabelle `lives` /
  `live_hosts` / `live_viewers` / `live_comments` con RLS/grant (§15.1);
  helper `can_see_live`; trigger (`lives_before_write` macchina a stati,
  cap 4 host, sync `viewer_count`/`peak_viewers`, guardie commenti con
  rate-limit 5/30s); RPC di scrittura in versione **base** (senza
  notifiche/fan-out/mappa, aggiunti per redefinizione in LM2 — pattern
  staged di M7): `create_live`, `pause_live`, `resume_live`, `end_live`,
  `live_invite_cohost`, `live_accept_cohost`, `live_remove_cohost`,
  `live_leave`; `live_comments` in pubblicazione realtime;
  `moderation_target_user` v3 (verbatim + branch `live`/`live_comment`).
- **Dipendenze**: esistenti: `are_friends`, `is_blocked_pair`,
  `is_active_user`, `top_friends`, pubblicazione `supabase_realtime`.
- **File**: 2 migrazioni nuove (`…_live_enums.sql`, `…_live_foundation.sql`);
  pgTAP.
- **Done when**: migrazioni live via pooler; pgTAP verdi SUL REMOTO —
  invarianti nuove: enum value presenti; unique live attiva per host;
  transizioni illegali rifiutate (`ended` immutabile, `paused→paused`);
  tetto 4 host; `can_see_live` nega non-amici/bloccati/kickati e applica
  top_friends al solo host principale; commenti rifiutati se
  `comments_enabled=false` / stato `paused` / oltre rate-limit; nessuna
  scrittura client diretta su `lives`; grant/revoke contract; smoke pooler
  (host crea → amico vede via RLS, estraneo no).
- **Rischi**: complessità di `can_see_live` (unione host attivi) —
  scriverla per prima e testarla a tappeto; ricordare la regola prosrc
  (niente token legacy nei commenti dei body).

### LM1 — Mappa backend (badge LIVE)

- **Obiettivo**: colonna `map_events.live_id` (→ `lives on delete set
  null`) + unique parziale `(live_id) where ended_at is null`; RPC
  `map_attach_live` / `map_detach_live` (specchio esatto delle versioni
  room: sessione attiva + posizione richieste, masked-aware, title
  denormalizzato, fan-out `event_started`/`event_ended{removed:true}`);
  trigger `lives_map_close_events` (`ended` ⇒ chiusura evento con
  `visibility_expires_at = now() + 3h` + fan-out `event_ended
  {removed:false}`; `paused` non fa nulla).
- **Dipendenze**: LM0; M7 MM0–MM3 (tabelle, `map_fanout`, trigger pattern).
- **File**: 1 migrazione (`…_live_map.sql`); pgTAP.
- **Done when**: smoke pooler: host con sessione mappa attiva crea live con
  attach → evento nello snapshot dell'amico e NON dell'estraneo; end →
  `visibility_expires_at ≈ ended_at + 3h` (vs 12h stanze); pause → evento
  ancora aperto; detach → sparito senza Echo; `map_stop_sharing` →
  cancellato. pgTAP verdi.
- **Rischi**: doppia unique parziale (room_id, live_id) sulla stessa
  tabella — verificare che gli insert valorizzino solo la colonna del
  proprio tipo; coerenza dei payload fan-out con quelli room (il client M7
  li parsa già).

### LM2 — Feed, fan-out, notifiche, Aura

- **Obiettivo**: helper `live_fanout` (§15.4); redefinizione **verbatim +
  add** delle RPC LM0: `create_live` v2 (notifiche set-based per
  `notify_mode` con dedup 10 min + fan-out `live_started` + attach mappa
  best-effort), `pause_live`/`resume_live` v2 (fan-out `live_status`),
  `end_live` v2 (fan-out `live_ended`); trigger premio Aura su `ended`
  (criterio §10, formula `1/n`); RPC di lettura `lives_feed` e
  `live_detail` (anti-vanity: `viewer_count` solo host — poi SUPERATO da
  M14/V6 per il co-host e da M15/RW-4 per tutti i visibili, v. §0.2).
- **Dipendenze**: LM0, LM1 (l'attach esiste); esistenti:
  `enqueue_notification`, `emit_aura`, `map_fanout` pattern.
- **File**: 1 migrazione (`…_live_social.sql`); pgTAP.
- **Done when**: smoke pooler con 3 utenti (host, amico, top friend):
  create con `notify_mode='all'` → notifica a entrambi; `top_friends` →
  solo al top; `none` → nessuna; seconda create ravvicinata → dedup;
  amico riceve `live_started` sulla propria inbox (`set_config
  realtime.topic`); end di live qualificata → evento aura `participation`
  con delta `1.0` poi `0.5`; live 10 secondi senza spettatori → NESSUN
  premio; `lives_feed` ordina top friend prima; `live_detail` nega
  `viewer_count` al non-host e ritorna `not_visible` al bloccato. pgTAP.
- **Rischi**: fan-out = amici×eventi (mitigato: eventi live sono rari
  rispetto ai publish posizione; stesso debito di scala consapevole di M7);
  redefinizioni verbatim — copiare i body per intero, mai riscriverli.

### LM3 — Lifecycle & GDPR

- **Obiettivo**: `expire_content` **v7** e `process_account_deletion`
  **v7** ridefiniti NELLA STESSA migrazione (vincolo di transazionalità
  MM1) con i blocchi live di §15.5; `gdpr-export` **v5** (sezioni live) in
  repo → coda deploy owner.
- **Dipendenze**: LM0–LM2 (tutte le tabelle e il trigger mappa esistono).
- **File**: 1 migrazione (`…_live_lifecycle.sql`);
  `supabase/functions/gdpr-export/index.ts`; pgTAP.
- **Done when**: cron `expire-content` gira pulito dopo il deploy
  (`cron.job_run_details` via pooler); smoke: live `paused` retrodatata
  31 min → force-end; live con host bannato → force-end; commenti di live
  finita 25h fa → spariti; export contiene le sezioni nuove (query
  testata); delete account termina e rimuove tutto (pgTAP). pgTAP verdi.
- **Rischi**: v7 verbatim su v6 (funzioni ormai lunghe — massima cura);
  coda deploy-owner che si allunga ancora (evidenziare in roadmap).

### LM4 — Edge LiveKit

- **Obiettivo**: `livekit-token` estesa col ramo `live_id` (mint = join,
  §15.3); nuove `live-kick` e `livekit-webhook` (firma WebhookReceiver);
  `moderate-text` estesa (`live_comment`, `live`); registrazioni
  `config.toml`.
- **Dipendenze**: LM0–LM3; env `LIVEKIT_*` già configurate (Fase 3);
  azione owner: configurare l'URL del webhook nella dashboard LiveKit
  Cloud + deploy delle funzioni (si accoda alla coda owner).
- **File**: `supabase/functions/livekit-token/index.ts` (esteso),
  `supabase/functions/live-kick/index.ts`,
  `supabase/functions/livekit-webhook/index.ts`,
  `supabase/functions/moderate-text/index.ts` (1 riga), `config.toml`.
- **Done when**: test locali della logica (guardie: ended → 409, kickato →
  403, cohost `invited` senza publish, upsert viewer al mint); revisione
  del flusso firma webhook contro livekit-server-sdk@2; funzioni in coda
  deploy con istruzioni owner scritte in roadmap.
- **Rischi**: il webhook LiveKit non è testabile end-to-end senza deploy
  (mitigazione: handler idempotenti + reti di sicurezza cron già attive da
  LM3 — il sistema funziona anche SENZA webhook, solo più lento a
  chiudere); versioni SDK Deno (`npm:livekit-server-sdk@2` già in uso).

### LM5 — Mobile: fondamenta LiveKit

- **Obiettivo**: SDK installato e funzionante su Dev Build; strato dati
  completo: `src/lib/live.ts` (wrapper RPC + fetch token), tipi in
  `src/types/supabase.ts`, `src/store/liveStore.ts`, handler
  `live_started`/`live_status`/`live_ended` nell'inbox esistente
  (`map-realtime.ts` esteso); guard Expo Go.
- **Dipendenze**: LM0–LM4 (backend completo); pacchetti
  `@livekit/react-native`, `@livekit/react-native-webrtc`,
  `@livekit/react-native-expo-plugin`; nuova build EAS di sviluppo.
- **File**: `mobile/package.json`, `mobile/app.json` (plugin + description
  camera aggiornata), `src/lib/live.ts`, `src/store/liveStore.ts`,
  `src/lib/map-realtime.ts`, `src/types/supabase.ts`.
- **Done when**: su device (dev build) una stanza di prova si connette e
  mostra video locale (schermo di test temporaneo o log); eventi inbox
  ricevuti e riflessi nello store; in Expo Go nessun crash (guard);
  `tsc`/`eslint` puliti.
- **Rischi**: compatibilità New Architecture/Fabric di
  react-native-webrtc (verificare versioni consigliate dal plugin Expo di
  LiveKit PRIMA di installare); tempi di build EAS.

### LM6 — Mobile: composer + schermo live

- **Obiettivo**: flusso completo host e spettatore. Voce "Live" attiva nel
  `MenuCrea` (`createTypes.ts`); rotta `/live/nuovo` (preview camera da
  traccia locale, riga toggle §3, titolo, permessi OS, "Avvia Live");
  rotta `/live/[id]`: host (mic/camera toggle, pausa/riprendi con
  unpublish, sheet co-host da lista amici, lista spettatori con kick,
  termina, prompt live-vuota 3 min) e spettatore (VideoView, overlay
  commenti blur+fade, pillola commento con invio+moderate-text
  fire-and-forget, stato "Live in pausa", volume locale, segnala
  live/commento, revalidation 60s).
- **Dipendenze**: LM5; `dialoghi.ts`, `BottomSheet`, `useAmici` esistenti.
- **File**: `mobile/app/(main)/live/nuovo.tsx`, `mobile/app/(main)/live/[id].tsx`,
  `src/components/live/*` (ComposerToggles, CommentiOverlay,
  CommentInput, ListaSpettatori, CoHostSheet, StatoPausa),
  `src/hooks/useLive.ts`, `src/constants/{createTypes,routes}.ts`.
- **Done when**: 2 device: A avvia (con titolo e toggle) → B (amico) entra
  dalla notifica → vede il video, commenta, il commento appare a entrambi
  e sfuma; A mette in pausa → B vede "Live in pausa"; A kicka B → B fuori
  e non rientra; A termina → B espulso con stato pulito; `tsc`/`eslint`
  puliti.
- **Rischi**: gestione tracce in pausa (unpublish/republish); interruzioni
  audio OS (telefonate); UX overlay tastiera+blur su Android.

### LM7 — Mobile: home feed

- **Obiettivo**: la categoria `live` della Home diventa reale: striscia
  orizzontale (`LiveStripAvatar` con anello rosso pulsante) + feed
  verticale `pagingEnabled` con preview video subscribe-only della sola
  pagina visibile (viewability callback, disconnect allo scroll, audio
  muto), ordine server (`lives_feed`), patch realtime dagli eventi inbox,
  stato vuoto onesto con CTA, `FeedLiveCard` placeholder rimossa.
- **Dipendenze**: LM5–LM6.
- **File**: `mobile/app/(main)/(tabs)/home.tsx` (ramo full-height),
  `src/components/live/{LiveStrip,LiveFeed,LiveFeedPage}.tsx`,
  `src/hooks/useLivesFeed.ts`; rimozione `FeedLiveCard` dal ramo discover.
- **Done when**: 2 device: B apre la Home → striscia e feed mostrano la
  live di A senza refresh (realtime); scroll tra 2 live → una sola
  connessione attiva per volta (verifica dashboard LiveKit); fine live →
  scompare dal feed; feed vuoto corretto.
- **Rischi**: budget minuti (R-3) — la disciplina "solo pagina visibile" è
  il requisito di accettazione, non un'ottimizzazione; jank allo swipe tra
  connessioni (pre-warm della successiva SOLO se il budget lo consente,
  QA-3).

### LM8 — Mobile: mappa + chiusura modulo

- **Obiettivo**: badge LIVE sulla mappa: `mapStore` indicizza eventi
  `live_broadcast` per host; `AuraGlyph` prop anello esterno rosso +
  pulse; callout balloon "LIVE" persistente (variante rossa di
  `LiveRoomBubble`); bolla standalone se l'amico non ha punto visibile;
  dissolvenza 3h via `fattoreEcho`; card amico con "Guarda la live".
  Chiusura: `docs/live/MANUAL-TESTING.md` (scenari 2 device: avvio, co-live,
  kick, blocco a metà live, pausa>30min, badge mappa e decadimento
  simulato, Expo Go guard); aggiornamento `CLAUDE.md` §4/§5/§6 (dominio
  M12, Edge nuove, regole d'oro live) e `roadmap.md`; memoria di progetto.
- **Dipendenze**: LM1 (backend badge), LM5–LM7.
- **File**: `src/components/mappa/{AuraGlyph,AuraDot,AuraLayer,MapFriendCard}.tsx`,
  nuovo `src/components/mappa/LiveBadge.tsx`, `src/store/mapStore.ts`;
  documenti.
- **Done when**: 2 device: A avvia con "Mostra sulla mappa" e sessione
  posizione attiva → B vede anello rosso + callout sull'avatar di A; pausa
  → badge resta; fine → dissolvenza (verificata con expiry retrodatato);
  Safe Zone attiva → badge al centro-zona; MANUAL-TESTING scritto;
  `tsc`/`eslint` puliti; documenti aggiornati.
- **Rischi**: affollamento visivo anello Aura + anello rosso + callout
  (iterare col PO sul risultato reale); z-order marker MapLibre.

## 19. Ordine e razionale

```
LM0 ──► LM1 ──► LM2 ──► LM3 ──► LM4 ──► LM5 ──► LM6 ──► LM7 ──► LM8
enums   mappa   feed+   cron+   Edge    SDK+    schermi feed    mappa+
+domini backend fanout  GDPR    LiveKit dati    live    Home    chiusura
        └──────── backend puro ───────┘ └──────── frontend ─────────┘
```

Backend-first come M6/M7: LM0–LM4 sono invisibili al client e lasciano il
remoto coerente a ogni passo; il webhook (LM4) arriva DOPO le reti di
sicurezza cron (LM3), così il sistema è corretto anche se il deploy owner
tarda. Il frontend parte solo a contratto dati stabile.

## 20. Definition of Done — modulo Live

- Un estraneo/bloccato/kickato non vede NULLA (feed, RLS, realtime, token,
  commenti, mappa): provato da pgTAP + smoke 2 utenti.
- Stati `live/paused/ended` solo a DB con transizioni validate; nessuna
  live orfana possibile (webhook + cap 8h + pausa 30 min).
- Notifica di avvio: default tutti gli amici (L-4), una sola per live,
  dedup 10 min; zero notifiche da commenti/spettatori.
- Contatori mai esposti a non-host; Aura solo per live qualificate a
  rendimenti decrescenti.
- Badge mappa: opt-in, masked-aware, revoca istantanea, decadimento 3h
  client-side su UTC calibrato.
- Commenti moderati (Perspective + coda umana), purgati a 24h dalla fine;
  report su live e commento funzionanti end-to-end.
- GDPR: export v5 e delete v7 coprono ogni tabella live; pgTAP verdi sul
  remoto; MANUAL-TESTING eseguito su 2 device.

## 21. Rischi trasversali

1. **R-1 — SDK LiveKit RN su Expo/Fabric** (LM5): primo modulo WebRTC del
   progetto; verificare matrice versioni plugin/SDK prima di installare.
2. **R-2 — Webhook non testabile prima del deploy owner** (LM4): mitigato
   dall'idempotenza e dalle reti di sicurezza cron (il sistema degrada a
   "più lento", mai a "rotto").
3. **R-3 — Budget LiveKit free tier** (50k min partecipante/mese): feed
   preview disciplinato (una connessione), monitoraggio dashboard; a
   crescita, valutare preview su thumbnail statiche.
4. **R-4 — Gap revoca media a metà live** (§12.4): finestra revalidation
   60s / token 1h accettata per l'MVP; da rivalutare con LiveKit
   participant permissions dinamiche in futuro.
5. **R-5 — Coda deploy-owner Edge** che si allunga (gdpr-export v5,
   livekit-token, live-kick, livekit-webhook, moderate-text) + config
   webhook su dashboard LiveKit: fuori dal controllo di questo ambiente,
   tracciata in roadmap.
6. **R-6 — Doppio anello sulla mappa** (Aura + rosso): rischio estetico,
   iterazione col PO su device reale in LM8.

## 22. Questioni aperte (richiedono input del product owner)

1. **QA-1 — Cap durata live**: proposta 8h hard (rete di sicurezza, non
   limite UX). Validare.
2. **QA-2 — Auto-end della pausa**: proposta 30 min di `paused`
   ininterrotta. Validare.
3. **QA-3 — Preview del feed verticale**: proposta audio MUTATO in preview
   (tap per entrare con audio) + nessun pre-warm della pagina successiva
   (budget). Validare.
4. **QA-4 — Criterio Aura**: proposta "≥5 min E ≥1 spettatore reale".
   Validare soglie.
5. **QA-5 — Moderazione del titolo**: v1 senza Perspective sul titolo (80
   char, coperto dai report). Validare o estendere.
6. **QA-6 — Timer prompt "live vuota"**: proposta 3 minuti a 0 spettatori.
   Validare.

## Revision history

| Rev | Data | Cosa |
|-----|------|------|
| 1 | 2026-07-09 | Prima stesura: specifica completa + piano LM0–LM8. Decisioni L-1..L-4 validate dal PO in sessione (incl. override notifiche "sempre a tutti, stile TikTok"). |
| 2 | 2026-07-16 | **Emendamenti M15 — Rework Live** (`docs/live/live-rework.md`, RW-1..RW-5 del PO 2026-07-15): contatori `viewer_count`/`like_count` pubblici ai visibili (eccezione a R-04 limitata alle live; `peak_viewers` e lista/kick privati, drops intoccati) — §0.2/§1/§1.2/§5/§13; nuova §6-bis (like TikTok: batching 800ms ↔ rate-limit 15/10s, realtime sul canale condiviso, purge 24h, GDPR); §7 riscritta (striscia con terminate <24h → profilo, ranking a engagement, fine feed); §15.1 (`like_count` + tabella `live_likes`), §15.2 (`lives_feed` v3, `live_detail` v3, `lives_strip`), §15.4 (secondo listener like), §15.5 (`expire_content` v9, `process_account_deletion` v8, `gdpr-export` v6). Migrazioni 69–72. |
