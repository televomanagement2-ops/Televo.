# Televo — La Mappa della Città: MANUAL TESTING (regression pre-lancio)

> Scenari end-to-end dell'intero modulo Mappa (M7, milestone MM0–MM9). Da
> eseguire per intero prima del lancio e dopo ogni modifica trasversale.
> Spuntare a mano; ogni scenario indica **Passi / Atteso / Device / Rif.** (la
> sezione di `docs/map/map.md`).
>
> **Prerequisiti**
> - **2 device fisici con Dev Build EAS** (la mappa MapLibre + Skia NON gira in
>   Expo Go): account distinti **A** e **B**, adulti, **amici reciproci
>   accettati**; **C** = terzo account **non amico** né di A né di B (test di
>   privacy). Idealmente i tre device sono a Terni o in una città con OpenFreeMap
>   ben coperta.
> - Permesso posizione: When-In-Use (foreground). Il test di background è FUORI
>   scope v1 (map.md §0.2).
> - Backend mappa **live** (migrazioni `20260707120000`→`20260707150000`); coda
>   deploy-owner Edge (`gdpr-export` v4) completata per i test GDPR (10.x).
> - **Accesso DB in sola lettura** per le verifiche server-side (pooler
>   Deno+postgres.js, come da runbook del progetto): serve a controllare
>   `map_presence` / `map_safe_zones` / `map_events` dove indicato.
> - Le derivazioni di stato/decadimento usano il **clock calibrato** su
>   `server_now`: un device con orologio sballato deve comunque mostrare stati e
>   tempi corretti (§8, test 8.x).

---

## 1. Base mappa & ingresso (MM5)
1.1 **Ingresso** — Home → categoria **Map**. Atteso: mappa scura full-height
    (fuori dalla ScrollView), pan/zoom fluidi, palette coerente col tema, **zero
    POI/transit**, toponimi minimi; attribuzione **© OpenStreetMap** sempre
    visibile. [§6, §13.5]
1.2 **Expo Go (dev)** — Aprendo la stessa categoria in Expo Go. Atteso: pannello
    "La Mappa richiede la Dev Build", nessun redbox, il resto dell'app
    funzionante. [§13.5]
1.3 **Errore stile/tile** — Simula rete assente al primo caricamento. Atteso:
    `StatoErrore` con **Riprova** (rimonta la mappa), non schermo bianco. [§9]
1.4 **Ritorno da background** — Esci e rientra sull'app con la mappa aperta.
    Atteso: la mappa resta viva, refetch dello snapshot al foreground. [§13.3]

## 2. Opt-in gestuale & permessi (MM6)
2.1 **Prima attivazione** — Tap sulla propria Aura (spenta) → onboarding →
    **Continua**. Atteso: registra il consenso `location` (`record_consent`),
    chiede il permesso OS, poi apre lo sheet durate. Verifica DB: riga in
    `consents` con `consent_type='location'`, `granted_at` valorizzato. [§3]
2.2 **Permesso negato** — Nega il permesso OS. Atteso: stato spiegato + **Apri
    impostazioni** (`Linking.openSettings`) e **Riprova**; la mappa resta
    consultabile (vedere gli amici non richiede la mia posizione). [§3, §9]
2.3 **Durate 1/4/8h** — Scegli 4h. Atteso: l'Aura si accende, pill "Sei visibile
    · ancora ~3h 59m" che ticchetta; DB: riga `map_presence` con `sharing_until`
    ≈ now+4h. [§3, QA-2]
2.4 **Publish reale** — Con sessione attiva e in movimento (cammina ~30–50m).
    Atteso: DB `map_presence.location`/`updated_at` aggiornati; sotto la soglia
    (fermo) l'aggiornamento arriva via **heartbeat ~4.5min**. [§13.5]
2.5 **Rate-limit** — GPS jitter / doppio timer. Atteso: nessun errore utente; DB
    non scrive più di 1 volta ogni 20s (no-op silenzioso). [§7, §11.12]
2.6 **Estendi / riduci** — Sull'Aura accesa → **Estendi** con altra durata.
    Atteso: `sharing_until` riscritto. [§3]
2.7 **Spegni ora (revoca)** — "Spegni ora". Atteso: DB riga `map_presence`
    **CANCELLATA** (non nascosta), eventi live propri rimossi; **nessun Last
    Seen** residuo. [§3, §11.2]
2.8 **Scadenza naturale** — Lascia scadere `sharing_until` con la mappa aperta.
    Atteso: transizione a **Last Seen** senza refetch; la riga resta fino al TTL
    24h (poi il cron la pulisce). [§2, §3]
2.9 **App uccisa a metà sessione** — Killa l'app con sessione attiva; riapri
    entro la durata. Atteso: la pipeline riparte da sola (resume da SecureStore);
    senza update la freshness scade → Last Seen. [§3, §11.6]
2.10 **Kill-switch master** — Impostazioni → "Posizione e mappa" → OFF. Atteso:
    conferma distruttiva; DB presenza + eventi live propri cancellati; gli amici
    ricevono `presence_removed`. ON riabilita (registra di nuovo il consenso).
    [§3, §12]

## 3. Dati reali: snapshot + realtime, 2 device (MM7)
3.1 **A compare su B senza refresh** — A accende l'Aura. Atteso: entro pochi
    secondi B vede l'aura di A comparire **senza refresh** (delta `presence`
    sull'inbox privata). [§13.3, DoD]
3.2 **A revoca → sparisce su B** — A "Spegni ora". Atteso: l'aura di A sparisce
    subito da B (`presence_removed`). [§11.2]
3.3 **Movimento live** — A cammina. Atteso: l'aura di A si sposta su B (fan-out
    solo oltre ~30m o cambio masked). [§13.2, §13.3]
3.4 **Amico fermo resta Live** — A immobile con sessione attiva. Atteso: su B
    resta **Live** (non scivola a Last Seen) grazie a heartbeat + refetch di
    riconciliazione ~3min. [MM7]
3.5 **Riconnessione** — Metti B offline (aereo) mentre A si muove, poi riconnetti
    B. Atteso: banner offline; al rientro lo snapshot ricostruisce lo stato
    coerente (i broadcast persi non vengono ritrasmessi). [§9, §13.3]

## 4. Resa Aura, clustering, card (MM8)
4.1 **Respiro Live vs Last Seen** — Confronta un'aura Live (respira, piena) e una
    Last Seen (spenta, immobile). Atteso: differenza netta, colore dal tratto
    dominante dell'amico. [§2, §6]
4.2 **Clustering** — A zoom basso con più amici vicini. Atteso: le aure si
    **fondono** (dimensione ∝ numero, **mai cifre**); tap → la camera zooma e le
    separa; punti coincidenti → ventaglio (spiderfy). [§6]
4.3 **60fps** — Pan/zoom veloce con ~40+ punti simulati. Atteso: fluido, aure
    incollate alla mappa (nessun desync canvas↔camera). [§13.5, §18.1]
4.4 **Card amico** — Tap su un'aura. Atteso: bottom sheet con anello Aura + nome
    + "ora sulla mappa" / "visto 2h fa" + **Messaggio** / **Vedi profilo**. [§6]
4.5 **Card evento** — Tap su una bolla stanza. Atteso: titolo + stato live/echo +
    host (se amico noto). [§5, §6]

## 5. Stanze Live sulla mappa (MM2 → MM8)
5.1 **Attach** — A (host di una stanza live) la mette in mappa. Atteso: bolla
    live pulsante sul punto di A; visibile a B, **non a C**. [§5, §10]
5.2 **Fine stanza → Echo** — La stanza di A finisce. Atteso: la bolla diventa
    **Echo** (titolo + "finita Xm fa") e comincia a **decadere** (fucsia→viola→
    trasparente) fino a `ended_at + 12h`. [§2, §5]
5.3 **Detach = revoca** — A stacca la stanza dalla mappa mentre è live. Atteso:
    la bolla sparisce subito, **niente Echo**. [§5]
5.4 **Titolo denormalizzato** — Rinomina la stanza dopo l'attach. Atteso: l'Echo
    mostra il titolo del momento dell'attach. [§5, §11.9]

## 6. Safe Zone (MM9)
6.1 **Creazione** — **Long-press** su un punto della mappa → editor "Nuova zona
    sicura". Atteso: haptic; la camera centra il punto; **cerchio di anteprima**
    in accento; scegli nome (chip Casa/Lavoro/Palestra o testo libero) e raggio
    (100/200/350/500 m, il cerchio si ridimensiona live) → **Salva**. DB: riga in
    `map_safe_zones` col `center`/`radius_m` scelti. [§4]
6.2 **Masking al publish successivo** — Con una Safe Zone attorno alla posizione
    reale e sessione attiva, attendi il publish successivo (≤ heartbeat). Atteso:
    DB `map_presence.masked=true`, `zone_label` = nome zona, e **`location` =
    centro-zona, NON il punto esatto** (il punto esatto in-zona non tocca mai il
    disco). Su B l'aura di A appare al centro-zona con "In zona · nome". [§4, DoD]
6.3 **Cerchio salvato sulla mappa** — Dopo il salvataggio. Atteso: sulla MIA
    mappa la zona resta come cerchio sobrio (solo io la vedo); su B **nessun
    cerchio**, solo l'etichetta "In zona" quando sono lì. [§4, §10]
6.4 **Cap 2** — Con 2 zone già create, long-press di nuovo. Atteso: avviso "Zone
    al completo" (il cap è anche server-side: `zone_limit_reached`). [§4]
6.5 **Lista in impostazioni** — "Posizione e mappa" → sezione **Zone sicure**.
    Atteso: elenco con nome + "Raggio · N m"; funziona anche in Expo Go (lettura
    via snapshot, senza mappa nativa). [§4, MM9]
6.6 **Elimina zona** — Dalla lista, cestino → conferma. Atteso: DB riga rimossa;
    dal publish successivo A torna visibile nel **punto esatto** quando è lì.
    [§4, §11 (delete zona)]
6.7 **Zona sovrapposta** — Due zone che si sovrappongono col punto reale dentro
    entrambe. Atteso: masking sulla zona **più vicina** al punto reale. [§4]
6.8 **Zona creata mentre si è dentro** — Crea la zona stando già al suo interno.
    Atteso: maschera dal publish successivo (≤ heartbeat, finestra accettata).
    [§4, §11.8]

## 7. Stati vuoti / errore / offline (MM9, §9)
7.1 **Nessun amico visibile** — Mappa senza amici accesi né eventi. Atteso: card
    centrata "La tua lente sugli amici… Tieni premuto per creare una zona
    sicura"; la mappa resta bella e usabile (pan/zoom/long-press funzionano
    sotto). [§9]
7.2 **Errore snapshot** — Forza il fallimento della `map_snapshot` (rete
    intermittente). Atteso: banner sobrio in alto "Mappa non aggiornata · Tocca
    per riprovare"; la mappa e la propria Aura restano usabili. [§9]
7.3 **Offline** — Aereo-mode con mappa aperta. Atteso: nessun outbox (la
    posizione è effimera); i publish falliti si saltano; lo snapshot usa la cache
    TanStack. [§9]

## 8. Fusi orari & clock (§8) — SIMULATO
8.1 **Orologio device sballato** — Sposta l'orologio del device (di chi GUARDA)
    avanti/indietro di alcune ore. Atteso: "2h fa", il decadimento Echo e gli
    stati Live/Last Seen restano **corretti** (offset da `server_now`). [§8,
    §11.11]
8.2 **Fuso del viewer in viaggio** — Cambia il fuso del device. Atteso: nessun
    effetto sui calcoli (tutto epoch UTC); la resa relativa usa il locale
    corrente. [§8, §11.14]
8.3 **Chi è guardato con orologio sballato** — L'orologio di A è sbagliato ma il
    server timbra i publish. Atteso: su B tempi/stati corretti (il server è la
    fonte dei timestamp). [§8]

## 9. Privacy & sicurezza (Definition of Done)
9.1 **Estraneo non vede NULLA** — C (non amico) apre la mappa mentre A e B sono
    accesi con eventi/echo. Atteso: C non vede né A né B in **nessuno stato**
    (snapshot filtrato server-side). Verifica DB: `map_snapshot()` come C non
    restituisce righe di A/B. [§10, DoD]
9.2 **Inbox altrui non sottoscrivibile** — (Test tecnico) C prova a sottoscrivere
    il topic `map:u:{A}`. Atteso: rifiutato dalla policy su `realtime.messages`.
    [§13.3]
9.3 **Blocco reciproco** — B blocca A (o viceversa). Atteso: sparizione reciproca
    al prossimo snapshot e stop del fan-out per costruzione. [§7, §11.3]
9.4 **Amicizia rimossa a sessione attiva** — A rimuove l'amicizia con B mentre
    entrambi sono accesi. Atteso: sparizione al prossimo snapshot; il grafo è
    letto a ogni invio. [§11.3]
9.5 **Utente mutato/bannato** — Un utente mutato prova a pubblicare. Atteso: RPC
    rifiuta (`is_active_user()` false); la **lettura** resta consentita. [§7,
    §11.15]
9.6 **Bounds / NaN** — (Test tecnico) publish con lat/lng fuori bounds. Atteso:
    `invalid_location`. [§11.13]

## 10. Ciclo di vita & GDPR
10.1 **Echo → nulla** — Attendi (o simula server-side) `visibility_expires_at`
    dell'Echo. Atteso: il fattore tocca 0, la bolla scompare; il cron cancella la
    riga. [§2]
10.2 **Last Seen → nulla (24h)** — Presenza non aggiornata da >24h. Atteso: il
    client la nasconde oltre soglia; il cron cancella la riga. [§2]
10.3 **GDPR export** — Richiedi l'export (art. 15). Atteso: contiene le sezioni
    `map_presence` / `map_events` / `map_safe_zones` dell'utente. [§13.4, MM4]
10.4 **GDPR delete** — Cancella l'account. Atteso: ogni riga mappa dell'utente
    rimossa (`process_account_deletion`); l'utente esce comunque dagli snapshot
    (`deleted_at`). [§11.4]

## 11. Accessibilità (MM9)
11.1 **Etichette screen reader** — Con TalkBack/VoiceOver: la propria Aura ("La
    tua Aura è accesa/spenta…"), le aure amici ("Nome, ora sulla mappa / ultima
    posizione"), le bolle (live/echo), i cluster ("N amici vicini, tocca per
    separarli"), i chip dell'editor e i preset raggio annunciano ruolo e stato.
    [MM9]
11.2 **Target ≥44pt** — I controlli tappabili (Aura, "centra su di me", pill di
    stato, chip, cestino zona) hanno area/hitSlop adeguata. [MM9]

---

## Definition of Done — checklist finale (map.md §17)
- [ ] Un estraneo non vede NULLA (snapshot, realtime, tabelle, storage): 9.1–9.2.
- [ ] Opt-in gestuale con auto-expiry; revoca istantanea = sparizione fisica;
      posizione esatta in Safe Zone **mai** persistita: 2.7, 6.2.
- [ ] Tre stati derivati solo da timestamp UTC; decadimento continuo; "2h fa"
      corretto su fusi diversi: 4.1, 5.2, 8.x.
- [ ] Nessun polling: inbox realtime + refetch a mount/foreground: 3.x.
- [ ] Legacy Fase 5 rimosso; cron e GDPR coprono le tabelle nuove; MANUAL-TESTING
      eseguito su 2 device: 10.x.
