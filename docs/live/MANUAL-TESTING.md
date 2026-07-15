# Televo — Live (M12): MANUAL TESTING (regression pre-lancio)

> Scenari end-to-end dell'intero modulo Live (M12, milestone LM0–LM8). Da
> eseguire per intero prima del lancio e dopo ogni modifica trasversale.
> Spuntare a mano; ogni scenario indica **Passi / Atteso / Device / Rif.** (la
> sezione di `docs/live/live.md`).
>
> **Prerequisiti**
> - **2 device fisici con Dev Build EAS che includa LiveKit/WebRTC** (oltre a
>   MapLibre/Skia — la build va rigenerata dopo LM5): account distinti **A** e
>   **B**, **amici reciproci accettati**; **C** = terzo account **non amico**
>   (test di privacy); per la §6 serve anche **D** = amico di B ma NON di A.
>   Idealmente B è nei **Top Friends** di A (serve per notifiche/ordinamento).
> - **Secrets LiveKit configurati** sul progetto Supabase (`LIVEKIT_API_KEY`,
>   `LIVEKIT_API_SECRET`, `LIVEKIT_WS_URL`) e **URL del webhook** registrato
>   nella dashboard LiveKit Cloud
>   (`https://<ref>.supabase.co/functions/v1/livekit-webhook`) — **fatti il
>   2026-07-12** (M12 verificato end-to-end su device); ricontrollare solo se
>   il progetto LiveKit è cambiato. Senza webhook il lifecycle degrada a "più
>   lento" (reti cron LM3): i test 8.4/8.5 lo richiedono.
> - `PERSPECTIVE_API_KEY` opzionale: senza, il test 5.6 degrada a "in coda di
>   revisione umana" (comportamento comunque da verificare).
> - **Accesso DB in sola lettura** via pooler (Deno + postgres.js, runbook del
>   progetto) per le verifiche server-side (`lives`, `live_viewers`,
>   `live_comments`, `map_events`, `aura_events`, `notifications`) e per le
>   simulazioni retrodatate (8.x, 9.6).
> - Stati e decadimenti derivano dal **clock calibrato** su `server_now`: un
>   device con orologio sballato deve mostrare comunque stati corretti (§12.17).

---

## 1. Guard & ingresso (LM5–LM7)
1.1 **Expo Go** — Apri in Expo Go: Home → categoria Live, `+` → Live. Atteso:
    pannello "La Live richiede la Dev Build" su entrambe le superfici, nessun
    redbox, il resto dell'app funziona. [§12.16]
1.2 **Voce MenuCrea** — Su Dev Build: `+` nella bottombar. Atteso: voce "Live"
    ATTIVA (niente placeholder) → apre `/live/nuovo`. [§3]

## 2. Avvio — composer camera-first (LM6)
2.1 **Permessi negati** — Prima apertura con camera/mic negati. Atteso: stato
    spiegato + "Apri impostazioni" (`Linking.openSettings`), nessun crash. [§3]
2.2 **Preview immediata** — Permessi concessi. Atteso: fotocamera full-screen
    (traccia locale, NON un form), flip fronte/retro funzionante. [§3]
2.3 **Titolo obbligatorio** — Prova ad avviare senza titolo. Atteso: bloccato;
    con 81 caratteri: bloccato (1–80). [§3, §11]
2.4 **Toggle** — Verifica la riga: Co-Live (off), Commenti (on), Mappa (OFF,
    opt-in), Visibilità (Tutti gli amici), Notifica (Tutti — L-4). [§3]
2.5 **Avvia** — "Avvia Live". Atteso: transizione a `/live/[id]` in modalità
    host, video pubblicato. DB: riga `lives` con `status='live'`,
    `livekit_room_name` = `live_<uuid>` (mai scelto dal client). [§2, §15.1]
2.6 **Doppia live** — Con la live attiva, riapri il composer e riavvia.
    Atteso: rientro nella live attiva (bonifica `live_already_active`), MAI
    due live dello stesso host. [§2, §12.5]
2.7 **Mappa senza sessione** — Toggle "Mostra sulla mappa" ON ma posizione M7
    spenta. Atteso: la live parte comunque + hint "attiva la posizione…"
    (`map_attached:false`). [§12.12]

## 3. Notifiche di avvio (LM2)
3.1 **Default: tutti gli amici** — A avvia con notifica "Tutti". Atteso: push
    `live_started` a B (e agli altri amici), tap → schermo spettatore. [§9, L-4]
3.2 **Top Friends / Nessuna** — A termina e riavvia con "Top Friends": push
    SOLO alla cerchia; con "Nessuna": zero push. [§9]
3.3 **Dedup anti-spam** — A avvia, chiude ed entro 10 minuti riavvia. Atteso:
    B NON riceve una seconda `live_started` (guardia 10 min). [§9]
3.4 **Mai rumore** — Durante la live: commenti, join/leave spettatori, pausa,
    ripresa, fine, kick. Atteso: NESSUNA notifica aggiuntiva. [§9]

## 4. Home — striscia + feed verticale (LM7)
4.1 **Compare senza refresh** — B è sulla Home (categoria Live) quando A
    avvia. Atteso: entro pochi secondi la live di A appare in striscia e feed
    SENZA refresh (delta `live_started` sull'inbox privata). [§7]
4.2 **Una sola connessione** — Con 2+ live nel feed, B scorre le pagine.
    Atteso: preview video solo della pagina visibile, audio muto; dashboard
    LiveKit: al più UNA connessione subscriber per B. [§7B, §12.15, R-3]
4.3 **Pausa nel feed** — A mette in pausa. Atteso: su B la pagina mostra
    "Live in pausa" (nessuna connessione attiva), striscia con etichetta
    PAUSA e anello fermo. [§2]
4.4 **Fine → sparisce** — A termina. Atteso: la live sparisce da striscia e
    feed di B (nessun archivio). [§1, §7]
4.5 **Vuoto onesto** — Nessun amico in live. Atteso: "Nessun amico è in live
    ora" + CTA "Avvia una live" — nessun riempitivo. [§7]
4.6 **Privacy** — C apre la Home. Atteso: la live di A NON esiste (né feed,
    né striscia). DB: `lives_feed()` di C vuota. [§13]

## 5. Schermo spettatore + commenti (LM6)
5.1 **Join** — B entra dal feed (o dalla notifica). Atteso: video full-screen
    di A; DB: riga `live_viewers` (il mint È il join). [§5, §15.3]
5.2 **Contatore agli host attivi** — Atteso: A vede il numero di spettatori;
    B (spettatore) NON vede alcun contatore (anti-vanity). Il co-host ATTIVO
    invece lo vede (dashboard quasi-host, M14/V6 — scenario 6.7). [§1.2, §13]
5.3 **Commenti realtime** — B commenta. Atteso: il commento appare a entrambi
    in basso a sinistra; con flusso fitto ne restano **~7 visibili** e i più
    vecchi ESCONO SCORRENDO (restano raggiungibili scrollando la colonna, fino
    al cap 50 in memoria; la riga resta a DB). [§6, M13/P9]
5.3b **Tastiera (Android fisico)** — B tocca "Commenta...". Atteso: la barra
    input resta SOPRA la tastiera (si vede ciò che si scrive); tap fuori o
    back hardware chiudono il composer, NON lo schermo live. [M13/P9]
5.4 **Rate-limit** — B invia 6 commenti in <30s. Atteso: il 6° rifiutato con
    messaggio inline (5/30s). [§6]
5.5 **Commenti off / pausa** — A avvia con commenti OFF: pillola assente/
    disabilitata per B. In pausa: commento rifiutato dal trigger. [§6, §12.8]
5.6 **Moderazione** — B invia un commento tossico (o simula severità ≥0.9).
    Atteso con Perspective: auto-mute 30 min di B (i suoi commenti muoiono
    ovunque) + Aura `toxicity`; senza chiave: riga in `moderation_queue`
    (revisione umana), nessun crash. [§6, §11]
5.7 **Report** — B: long-press su un commento → segnala; flag → segnala la
    live. DB: righe `reports` con target `live_comment` / `live`. [§11]
5.8 **Pausa/ripresa** — A mette in pausa: B vede "Live in pausa" (non schermo
    nero), tracce unpublished. A riprende: video torna. Spettatore che entra
    DURANTE la pausa: ammesso, vede subito lo stato. [§2, §12.19]
5.9 **Prompt live vuota** — A resta senza spettatori ~3 min. Atteso: prompt
    gentile "Nessuno sta guardando — continua o termina?". [§12.20, QA-6]

## 6. Co-Live (LM6) — richiede D (amico di B, non di A)
6.1 **Invito** — A invita B come co-host (dal composer o in diretta). Atteso:
    push `live_cohost_invite` a B + banner "Accetta invito". [§4]
6.2 **Accettazione** — B accetta. Atteso: B pubblica video (griglia 2: uno
    sopra, uno sotto; 3-4 host = quadranti), token con `canPublish`; DB:
    `live_hosts` di B → `active`. Lo split-screen compare **entro ~2s** su A,
    su B E su ogni spettatore (revalida sul churn dei partecipanti, M14/V5 —
    non serve aspettare il giro dei 60s). [§4, M14/V5]
6.3 **Unione dei pubblici (L-3)** — Con B co-host attivo, D apre la Home.
    Atteso: D VEDE la live (amico di B) e può entrare; prima dell'accept non
    la vedeva. [§4, L-3]
6.4 **Uscita/rimozione** — B esce (o A lo rimuove). Atteso: B torna
    spettatore/fuori; la griglia si restringe entro ~2s per tutti (M14/V5);
    D perde la visibilità al più tardi alla revalidation (~60s). [§4, §12.4]
6.5 **Tetto 4** — A prova a invitare un 4° co-host oltre il tetto. Atteso:
    errore `cohost_cap_reached`. [§4]
6.6 **Eccezione top_friends** — A avvia con visibilità "Top Friends" e B
    co-host. Atteso: il pubblico resta la SOLA cerchia di A (D non vede
    nulla anche se amico di B). [§4]
6.7 **Dashboard quasi-host (M14/V6)** — B co-host attivo. Atteso: B vede la
    pillola occhi col numero di spettatori (NON tappabile: la lista col kick
    resta ad A); B NON ha pausa/fine/inviti/kick. Lo spettatore continua a
    non vedere alcun contatore (R-04). [VF-1]
6.8 **Lascia il Co-Live (M14/V6)** — B tocca il controllo exit → conferma.
    Atteso: B torna spettatore SENZA uscire dalla live (riconnessione
    automatica, video suo giù dalla griglia entro ~2s per tutti); DB:
    `live_hosts` di B → `left`; A può reinvitarlo (re-invito su riga `left`).
    [VF-1, §4]

## 7. Kick & blocco a metà live (LM0/LM4)
7.1 **Kick** — A apre la lista spettatori → rimuove B. Atteso: media tagliato
    subito (Edge: DB prima, `removeParticipant` dopo), B vede stato neutro
    "non più disponibile"; B NON rientra (mint → 403) e non commenta più.
    Il kick NON notifica. [§5, §12.3]
7.2 **Blocco durante la live** — B guarda; A blocca B (o B rimuove
    l'amicizia). Atteso: feed/commenti/token revocati subito; lo stream già
    aperto muore alla revalidation ~60s (`not_visible` → disconnect). Gap
    documentato e accettato per l'MVP. [§12.4, R-4]

## 8. Lifecycle & reti di sicurezza (LM3–LM4) — verifiche via pooler
8.1 **Pausa dimenticata** — Retrodata `paused_at` di 31 min sul DB (o attendi).
    Atteso: al giro di `expire-content` (≤5 min) la live è `ended`. [§12.2, QA-2]
8.2 **Cap 8h** — Retrodata `started_at` di 8h+. Atteso: force-end al giro
    successivo. [§12.1, QA-1]
8.3 **Host sanzionato** — Un moderatore muta/banna A a live attiva. Atteso:
    force-end ≤5 min; A non può avviarne altre finché sanzionato. [§11, §12.10]
8.4 **Crash dell'host** — Uccidi l'app di A in diretta. Atteso: LiveKit svuota
    la stanza → webhook `room_finished` → live `ended` server-side (senza
    webhook: la chiude comunque il cap 8h). [§12.1]
8.5 **Disconnessioni silenziose** — B esce uccidendo l'app. Atteso: il webhook
    `participant_left` riconcilia `left_at` in `live_viewers`. [§5, §15.3]
8.6 **Purge 24h** — Live finita da >24h. Atteso: `live_comments` e
    `live_viewers` purgati; la riga `lives` resta fino a 30 giorni (poi
    minimizzata); gli excerpt segnalati sopravvivono in `moderation_queue`.
    [§6, §12.9, §15.5]

## 9. Badge mappa (LM1 + LM8)
9.1 **Attach opt-in** — A avvia con "Mostra sulla mappa" ON e sessione
    posizione attiva. Atteso: B (sulla mappa) vede sull'avatar di A **anello
    esterno rosso pulsante + callout "LIVE"** persistente (visibile scorrendo,
    non solo al tap); C non vede nulla. [§8]
9.2 **Ortogonalità** — A spegne la condivisione posizione (o kill-switch).
    Atteso: badge sparito all'ISTANTE su B, la live continua normalmente.
    [§8, §12.11]
9.3 **Pausa** — A in pausa. Atteso: badge PIENO (il countdown non parte);
    nel feed lo stato pausa resta visibile. [§2, §8]
9.4 **Fine → dissolvenza 3h** — A termina. Atteso: anello+callout restano e
    iniziano a sfumare (fattoreEcho su finestra 3h, vs 12h delle stanze).
    [§8]
9.5 **Safe Zone** — A avvia da dentro una sua Safe Zone. Atteso: badge al
    centro-zona (masked), MAI la posizione esatta; card con "In zona". [§8]
9.6 **Decadimento simulato** — Via pooler, retrodata su `map_events`
    `ended_at`/`visibility_expires_at` (es. −2h30m su finestra 3h). Atteso:
    badge quasi trasparente; oltre la scadenza: sparito (e il cron poi
    cancella la riga). [§8, §12.17]
9.7 **Bolla standalone** — A è in live con badge attivo ma NON condivide più
    un punto amico visibile (o B è zoomato out e A è fuso in un cluster).
    Atteso: bolla rossa standalone "LIVE + titolo" al punto dell'evento; la
    stessa bolla appare ad A per la PROPRIA live. [§15.6]
9.8 **Card "Guarda la live"** — B tocca badge/avatar/bolla di A. Atteso: card
    amico con stato "In diretta ora" + azione **"Guarda la live"** →
    `/live/[id]`; a live finita (echo) l'azione NON c'è. [§8]

## 10. Aura (LM2)
10.1 **Live qualificata** — A trasmette ≥5 min con B spettatore reale, poi
     termina. Atteso: evento `aura_events` `participation` con delta 1.0
     (prima del giorno); una seconda live qualificata oggi → 0.5 (1/n). [§10]
10.2 **Live vuota** — A apre e chiude una live di pochi secondi senza
     spettatori. Atteso: NESSUN premio. [§10, QA-4]
10.3 **Niente Aura passiva** — B (spettatore/co-host) non riceve alcun evento
     aura dalla visione. [§10]

## 11. GDPR (LM3)
11.1 **Export art. 15** — A richiede l'export. Atteso: sezioni `lives`,
     `live_comments`, `live_viewers`, `live_hosts` presenti (fotografia dello
     stato corrente — il dominio è effimero per design). [§15.5]
11.2 **Delete art. 17 con live attiva** — A (account di prova) chiede la
     cancellazione mentre è in diretta. Atteso: live terminata e righe
     cancellate; la stanza LiveKit muore da sola; commenti/presenze di A su
     live altrui rimossi. [§12.14, §15.5]

## 12. Privacy — Definition of Done (§20)
12.1 **L'estraneo non vede NULLA** — C: feed vuoto, mappa senza badge, mint
     token → 403, commenti invisibili (RLS), nessun delta realtime. [§13, §20]
12.2 **Il bloccato/kickato non rientra** — dopo 7.x: mint → 403 anche a nuova
     apertura dell'app. [§13, §20]
12.3 **Contatori mai agli spettatori** — `live_detail` a B SPETTATORE senza
     `viewer_count` (verifica via pooler con JWT simulato); da co-host ATTIVO
     i contatori arrivano (M14/V6, smoke 3 ruoli già eseguito via pooler).
     [§1.2, §13, VF-1]

## 13. M14 — Fix dell'audit di verifica (V3/V4 + boot offline)
13.1 **Keep-awake (M14/V3)** — A in diretta, B spettatore, entrambi senza
     toccare lo schermo oltre il timeout di sistema (2 min). Atteso: lo
     schermo NON si spegne per nessuno dei due; vale anche nel composer
     camera. Usciti dalla live, il timeout normale riprende.
13.2 **Preview feed con video (M14/V4, Android fisico)** — B apre Home →
     sezione Live con A in diretta. Atteso: la preview mostra il VIDEO di A
     (niente riquadro bianco); swipe tra più live → nessun riquadro bianco;
     in dashboard LiveKit resta UNA sola connessione preview per volta (R-3).
13.3 **Boot offline (M14/V1)** — app CHIUSA da >1h (token scaduto), modalità
     aereo, riapertura. Atteso: Home con hub e chat scorribili dalla cache
     (MAI la login page); tolto l'aereo la sessione si rinnova da sola senza
     kick. Logout volontario → login page e cache pulita.

## 14. M14 round 2 — le cause vere (F1–F5; richiede la build post-round)

14.1 **Co-Live: promozione a publisher (F1)** — A in diretta, B spettatore;
     A invita B, B accetta. Atteso su B entro ~2s: mic/camera/flip COMPAIONO
     (token publisher), pillola occhi e "Lascia il Co-Live" presenti, griglia
     sopra/sotto col PROPRIO video. Atteso su A e sullo spettatore C: griglia
     sopra/sotto entro ~2s. Controprova a DB (pooler): la riga `live_hosts`
     del co-host resta `active` (mai `left` dopo pochi ms — era la race del
     webhook, ora ignorata dal trigger nei primi 60s dal join).
14.2 **Co-Live: uscita volontaria nei primi 60s (F1)** — subito dopo 14.1,
     B tocca "Lascia il Co-Live" → conferma. Atteso: B torna spettatore (la
     scelta dell'utente NON è bloccata dalla guardia); griglia singola per
     tutti entro ~2s.
14.3 **Preview feed con video (F2, ripete 13.2)** — atteso: VIDEO nella
     preview (zOrder media-overlay + pager senza clipping); badge LIVE e piede
     testo restano sopra il video; se la preview fallisse, il riquadro ora è
     SCURO (sfondo finestra #04030a), mai bianco.
14.4 **Pre-prompt notifiche (F3)** — installazione con permesso di sistema
     ancora da decidere (Android 13+): entro ~2s dall'ingresso in Home appare
     "Attiva le notifiche". Con "Non ora": non riappare prima di 24h. Con
     permesso attivato A MANO dalle impostazioni di sistema: al ritorno
     nell'app il token si registra subito (riga fresca in `devices`), senza
     riavvio.
14.5 **Badge campanella (F5)** — B in Home; A invia una richiesta di amicizia
     (o commenta un drop di B). Atteso: il badge numerico sulla campanella
     spawna ENTRO POCHI SECONDI senza toccare nulla (canale realtime, non la
     push); aprendo la tab si azzera (mark-all).
14.6 **Push end-to-end (dopo azione owner FCM)** — messaggio da A con B in
     background. Atteso: push su B con suono e deep-link; `push_health.
     send_push_last_run` con `ticket_errors: 0`; se le credenziali mancano
     ancora, `send_push_ticket_errors` ora la racconta (InvalidCredentials).
