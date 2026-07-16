# Televo — Live (M12+M15): MANUAL TESTING (regression pre-lancio)

> Scenari end-to-end dell'intero modulo Live (M12 LM0–LM8 + M15 Rework Live
> LR0–LR9, §16). Da eseguire per intero prima del lancio e dopo ogni modifica
> trasversale. Spuntare a mano; ogni scenario indica **Passi / Atteso /
> Device / Rif.** (la sezione di `docs/live/live.md`). ⚠️ M15 ha EMENDATO
> alcuni attesi storici (contatori pubblici, striscia con terminate): gli
> scenari 4.4, 4.5, 5.2, 6.7 e 12.3 sono già riscritti di conseguenza.
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
4.4 **Fine → esce dal feed, resta in striscia (M15/RW-1)** — A termina.
    Atteso: la live SPARISCE dal feed verticale di B (nessun archivio, nessun
    replay) e in striscia appare il segnaposto "FINITA" di A (anello grigio
    statico, avatar spento) dopo le attive; tap → profilo di A (dettagli in
    16.9). [§1, §7]
4.5 **Vuoto onesto** — Nessun amico in live. Atteso: "Nessun amico è in live
    ora" + CTA "Avvia una live" — nessun riempitivo; se esistono terminate
    <24h la striscia resta visibile SOPRA lo stato vuoto (M15/LR6). [§7]
4.6 **Privacy** — C apre la Home. Atteso: la live di A NON esiste (né feed,
    né striscia). DB: `lives_feed()` di C vuota. [§13]

## 5. Schermo spettatore + commenti (LM6)
5.1 **Join** — B entra dal feed (o dalla notifica). Atteso: video full-screen
    di A; DB: riga `live_viewers` (il mint È il join). [§5, §15.3]
5.2 **Contatori pubblici (M15/RW-4 — supera il "solo host" storico)** —
    Atteso: A, il co-host attivo E B (spettatore) vedono TUTTI la pilla 👁
    (per B il numero include sé stesso) e la pilla ❤ col totale like; SOLO A
    può aprire la lista nominativa dal tap sulla pilla (B: pilla non
    tappabile). [§1.2, §13, §16]
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
    resta ad A); B NON ha pausa/fine/inviti/kick. (M15: anche lo spettatore
    vede ora i contatori 👁/❤ — restano privati SOLO lista nominativa e
    `peak_viewers`.) [VF-1, §16]
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
12.3 **Contatori: pubblici i totali, privato il picco (M15/RW-4)** —
     `live_detail` a B SPETTATORE contiene `viewer_count` e `like_count` nel
     jsonb `live` ma NON `peak_viewers` top-level (verifica via pooler con
     JWT simulato); da host/co-host ATTIVO arriva anche `peak_viewers`;
     select client diretta di `lives.peak_viewers` → `permission denied`
     (smoke LR1 già eseguito via pooler). [§1.2, §13, §16]

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

## 15. M14 round 3 — permesso notifiche, camera-off, preview (F7–F9; build post-round-3)

15.1 **Pre-prompt notifiche su installazione fresca (F7, ripete 14.4)** —
     Android 13+, app appena installata (o dati app cancellati), permesso
     di sistema mai deciso. Atteso: entro ~2s dall'ingresso in Home appare
     "Attiva le notifiche"; "Attiva" → dialog DI SISTEMA → consenso → riga
     fresca in `devices`. Con "Non ora": si ripropone dopo ≥24h. Un rifiuto
     al dialog DI SISTEMA: il pre-prompt può riproporsi (Android concede un
     secondo dialog); dopo il secondo rifiuto, mai più (denied definitivo).
     ⚠️ Su Android ≤12 il runtime permission NON esiste: il prompt non deve
     apparire e le push sono attive da subito — è il comportamento corretto,
     non un bug (era il "paradosso" del round 3).
15.2 **Co-Live: camera off = cella che resta (F8)** — A in diretta, B co-host
     attivo (griglia sopra/sotto), C spettatore. B tocca il toggle camera.
     Atteso su TUTTI (A, B, C): la cella di B resta al suo posto con avatar +
     icona videocam-off + "Camera spenta" — la griglia NON si ricompone e il
     video di A non passa a schermo intero. B riattiva la camera → il video
     torna nella stessa cella. Stesso comportamento se è A a spegnere la
     camera (cella di A placeholder, video di B al suo posto).
15.3 **Preview feed con video (F9, ripete 14.3 senza zOrder)** — B apre Home
     → sezione Live con A in diretta. Atteso: VIDEO nella preview; swipe tra
     più live → nessun riquadro bianco (surface ricreata per traccia); badge
     e piede sempre visibili. Se il riquadro fosse ANCORA bianco, test
     discriminante: A apre il composer `/live/nuovo` → vede il proprio video
     locale? Sì → il guasto è nel compositing del solo pager (riportare
     device e build); No → guasto camera/WebRTC del device.

## 16. M15 — Rework Live (LR0–LR9; richiede build col bundle M15)

> Prerequisiti extra: migrazioni 69–72 LIVE sul remoto (fatte 2026-07-16,
> pgTAP 622/622); `gdpr-export` v6 in coda deploy owner (16.12 la richiede);
> per 16.9 serve l'accesso pooler in scrittura (retrodatare `ended_at`).
> Riferimenti: `docs/live/live-rework.md` (§ citati qui sotto) e live.md
> §6-bis/§7.

16.1 **Double-tap → cuore nel punto** — B guarda la live di A; double-tap in
     punti diversi del video (centro, bordi, sopra la colonna commenti dove
     non ci sono bottoni). Atteso: +1 sulla pilla ❤ e un cuore che nasce NEL
     punto esatto del tap e sale/scala/sfuma (~900ms, rotazione/deriva
     casuali); raffica di double-tap = raffica di cuori, MAI un toggle (il
     contatore non scende). I controlli (chiudi, commenti, rail) restano
     tutti funzionanti. [RW-3, §3.1]
16.2 **Bottone cuore nel rail** — B, il co-host attivo E A toccano il cuore
     del rail (in alto nella colonna controlli). Atteso: +1 per tap e cuore
     che spawna presso il bottone; disponibile a tutti e tre i ruoli. [§3.1]
16.3 **Contatore cross-device (realtime)** — B lika a raffica. Atteso: la
     pilla ❤ sale su A (e su un eventuale spettatore C) a lotti (~1s di
     ritardo max, batch 800ms); il numero NON regredisce MAI su nessun
     device (display monotòno); chiudendo e riaprendo lo schermo il totale
     riparte coerente dallo snapshot `live_detail`. [§3.2]
16.4 **Cuori altrui invisibili (RW-3a)** — mentre B lika, guardare A e C.
     Atteso: SOLO il contatore sale; NESSUN cuore appare sui loro schermi
     (i cuori sono solo di chi tocca). [§3.1]
16.5 **Pausa blocca i like** — A mette in pausa. Atteso su B: bottone cuore
     spento (opacità ridotta) e double-tap inerte (nessun cuore, contatore
     fermo); alla ripresa i like tornano. Controprova server via pooler:
     insert su `live_likes` con live in pausa → `live_not_likeable`. [§3.1]
16.6 **Rate-limit con raffica prolungata** — B tiene una raffica continua di
     tap >10s (quante più possibile). Atteso in UI: nessun errore visibile,
     cuori fluidi (cap ~20 particelle vive). A DB (pooler): righe con
     `count ≤ 50` e ≤15 insert per finestra di 10s; i lotti oltre soglia
     sono scartati IN SILENZIO — il contatore locale può sovrastimare finché
     il totale reale non lo supera (accettato, §3.2). [§3.2, §3.3]
16.7 **Pilla 👁 da spettatore** — A in diretta, B e C spettatori. Atteso: B
     vede 👁=2 (sé stesso incluso), A vede 👁=2; C esce → entrambi scendono a
     1 in pochi secondi (conteggio LiveKit client-side). La pilla di B NON è
     tappabile (lista nominativa solo per A, scenario 5.2). [RW-4, §4]
16.8 **Pilla 👁 sulla preview (QA-2)** — Home → feed live con 2+ live.
     Atteso: pilla 👁 statica accanto al badge LIVE con il `viewer_count`
     del feed; si aggiorna al reconcile (~60s) o al refetch, NON in realtime
     — è un'etichetta di ranking, non un contatore vivo. [QA-2, §7 live.md]
16.9 **Striscia: terminata → profilo e sparizione 24h simulata** — A termina.
     Atteso su B: segnaposto di A in striscia DOPO le attive — anello grigio
     STATICO (mai rosso, mai pulse), avatar spento, etichetta "FINITA",
     tempo relativo; tap → PROFILO di A (MAI `/live/[id]`). Via pooler:
     `update lives set ended_at = now() - interval '24 hours 1 minute'` →
     il segnaposto sparisce da solo al ricalcolo (timer di scadenza), senza
     riavviare l'app. Se A riapre una live entro 24h: in striscia SOLO il
     cerchio attivo (dedup per host). C (estraneo) non vede nulla. [RW-1, §1]
16.10 **Fine feed che snappa** — con 1–2 live attive, B scorre oltre
     l'ultima. Atteso: pagina piena "Sei in pari" (badge ✓ verde) con CTA
     "Avvia una live", snap di paging pulito; su quella pagina NESSUNA
     preview connessa (dashboard LiveKit: zero subscriber di B). Con più
     pagine (`has_more`) il footer NON appare e il load-more continua. Feed
     completamente vuoto → stato onesto invariato (striscia sopra se
     esistono terminate, 4.5). [RW-5, §5]
16.11 **Ranking a engagement** — 3+ live attive con spettatori diversi
     (0, 1, 2+), host NON top-friend di B tranne uno. Atteso: prima le live
     dei Top Friends di B, poi le altre per spettatori concorrenti
     decrescenti; l'ordine si aggiorna al reconcile (~60s), mai a metà
     swipe. [RW-2, §2]
16.12 **GDPR like (dopo deploy owner `gdpr-export` v6)** — B ha messo like a
     una live in corso. Export art. 15 di B: sezione `live_likes` con le sue
     righe. Live finita da >24h (o `ended_at` retrodatato + giro di
     `expire_content`): righe like sparite, `lives.like_count` INVARIATO
     (totale storico); delete account di B → righe sue rimosse, `like_count`
     resta. [§3.5]
