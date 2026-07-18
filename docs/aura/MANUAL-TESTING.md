# Televo — Classifica Aura (M16): MANUAL TESTING (regression pre-lancio)

> Scenari end-to-end del modulo Classifica Aura (M16, AC0–AC6). Da eseguire
> per intero prima del lancio e dopo ogni modifica trasversale. Spuntare a
> mano; ogni scenario indica **Passi / Atteso / Rif.** (la sezione di
> `docs/aura/classifica.md`).
>
> **Prerequisiti**
> - **2 device fisici**: account distinti **A** e **B**, **amici reciproci
>   accettati**; **C** = terzo account **NON amico** (test di privacy).
>   Idealmente altri 2–3 amici di A (il podio significa qualcosa con ≥4
>   partecipanti, soglia QA-3).
> - **Build**: AC0–AC3 e AC5 girano anche in **Expo Go** (nessun modulo
>   nativo); la **share card (AC4)** richiede la **Dev Build EAS** che
>   includa `react-native-view-shot` + `expo-sharing` (gate AC4 — build da
>   rigenerare dopo l'install delle due dipendenze).
> - **Backend live**: migrazioni 73–76 applicate (fatto 2026-07-17), cron
>   `aura-rank-daily` (03:30 UTC) e `aura-recap-weekly` registrati;
>   `gdpr-export` **v7** deployata (coda deploy-owner).
> - **Accesso DB via pooler** (Deno + postgres.js, runbook del progetto) per
>   le semine: pari merito (stesso `aura_score`), snapshot retrodatati in
>   `aura_rank_snapshots`, notifiche i cui trigger sono i cron notturni.
> - **Freschezza**: `aura_score` cambia UNA volta al giorno (ricalcolo 03:00
>   UTC); il refetch della pagina raccoglie solo variazioni di COMPOSIZIONE
>   (amicizie, opt-in/out). Non aspettarsi punteggi "vivi" (§2.4).

---

## 1. Porta di lettura & ordinamento (AC0+AC3)
1.1 **Classifica personale** — A e B aprono Home → tab Aura. Atteso: ciascuno
    vede la PROPRIA classifica (io + amici accettati), ordinata per `aura_score`
    decrescente, rank 1,2,3,… sequenziali; podio 2/1/3 con scritte sugli
    scalini; dal 4° in giù la lista numerata. [§2.1–2.2, §3–4]
1.2 **Propria riga** — Atteso: la propria riga è evidenziata (o il proprio
    slot nel podio); al posto della chat c'è l'icona condividi. [§4, §10.13/15]
1.3 **Non-amico invisibile** — C non è amico di A. Atteso: C non compare
    nella classifica di A e viceversa (insiemi diversi per costruzione). [§2.1]
1.4 **Caption freschezza** — In fondo alla lista: «Si aggiorna ogni giorno».
    Pull-to-refresh non cambia i punteggi (solo composizione). [§2.4]
1.5 **Pari merito (semina pooler)** — Imposta via pooler lo stesso
    `aura_score` per due amici di A. Atteso: ordine per anzianità
    (`created_at` asc), STABILE tra due refetch; mai due «primi». [§2.2, §10.3]

## 2. Reciprocità end-to-end (AC-2)
2.1 **Opt-out da B** — B: menu ⋮ → Switch «Mostra la mia posizione» OFF.
    Atteso su B: stato «Sei fuori dalla classifica» con copy della
    reciprocità e CTA «Rientra in classifica»; il menu ⋮ resta raggiungibile
    (switch off). [§2.3, §5]
2.2 **B sparisce da A** — A fa pull-to-refresh. Atteso: B non è più nelle
    righe di A; i rank degli altri si compattano (sempre 1,2,3,…). [§2.3]
2.3 **Enforcement server-side** — Via pooler: `aura_leaderboard()` impersonando
    B risponde `{listed:false}` SENZA righe (non un errore). Il flag NON è
    leggibile da C su `profiles` (fuori dal grant SELECT). [§2.3, §13.1]
2.4 **Rientro** — B tocca «Rientra in classifica». Atteso: la classifica di B
    ricompare; al refetch di A, B è di nuovo in lista. Nessuna quarantena. [§2.3]

## 3. Podio — casi limite (AC3)
3.1 **Podio parziale** — Account con 1 solo amico (2 partecipanti). Atteso:
    scalini SEMPRE presenti, slot del 3° = cerchio tratteggiato vuoto; il
    layout non collassa. [§3, §10.2]
3.2 **Stato vuoto** — Account senza amici. Atteso: «La classifica Aura si
    accende con gli amici» + CTA verso /amici; NESSUN punto d'ingresso share
    («1° su 1» non esiste). [§10.1]
3.3 **Nomi lunghi** — Amico con display name molto lungo. Atteso: una riga
    con ellissi, gli scalini non si spostano. [§10.10]
3.4 **Budget animazioni** — Solo l'anello del 1° «respira»; 2°, 3° e tutte le
    righe in lista sono still. [§3–4]

## 4. Chat per riga (AC3)
4.1 **DM dall'amico giusto** — A tocca la bolla chat sulla riga di B. Atteso:
    si apre (o si crea) la DM A↔B, non un'altra conversazione. [§4]
4.2 **Tap sulla riga** — Fuori dai pulsanti: si apre il profilo dell'amico;
    il proprio slot/riga apre il profilo proprio. [§3–4]

## 5. Share card (AC4 — richiede Dev Build)
5.1 **Cattura e condivisione** — Dalla propria riga (o dal proprio slot nel
    podio, o dal menu ⋮): tocca condividi. Atteso: si apre lo share sheet di
    sistema con un **PNG 1080×1920** (9:16); l'immagine si apre correttamente
    nel target (WhatsApp/Instagram). [§6.2]
5.2 **LEAK-CHECK (INVARIANTE §6.1)** — Con classifica POPOLATA (≥4 amici):
    ispeziona la card generata. Atteso: SOLO wordmark, avatar/nome/@username
    propri, % Aura, badge «N° tra i miei amici», claim e blocco invito.
    NESSUN nome, volto o rank di amici; nessuno screenshot della lista. [§6.1]
5.3 **Anello nello snapshot** — L'arco dell'Aura (react-native-svg) è
    presente e corretto nel PNG su Android. Se mancasse: ripiego arco
    pre-rasterizzato nella sola card (rischio noto AC4). [§16-AC4]
5.4 **URL configurabile** — Il link nella card e nel fallback è ESATTAMENTE
    `INVITE_URL` (`constants/config.ts`). [§6.3]
5.5 **Fallback testuale** — In Expo Go (o forzando un errore di cattura):
    tocca condividi. Atteso: NESSUN crash, si apre lo share testuale «Sono N°
    nella classifica Aura dei miei amici su Televo — URL». [§6.2]
5.6 **Menu ⋮ disabilitato** — Da non-listed (o senza dati): la voce
    «Condividi la tua posizione» è visibile ma spenta. [§5]

## 6. Notifiche retention + deep link (AC1+AC5)
> Le notifiche nascono dai cron notturni: per testarle si SEMINA via pooler
> (snapshot di «ieri» in `aura_rank_snapshots` con rank diverso da oggi, poi
> `select public.aura_rank_daily()`), oppure si inserisce direttamente una
> riga in `notifications` con `enqueue_notification` e si lascia fare a
> `dispatch_push`.
6.1 **`aura_podio`** — Semina B ieri 4° → oggi 3° (≥4 partecipanti). Atteso:
    UNA notifica «Sei sul podio Aura 🏆» con body «Ora sei N°…». [§7.1]
6.2 **`aura_sorpasso`** — Semina B ieri 2° → oggi 3°. Atteso: «Un amico ti ha
    superato» — il sorpassante è ANONIMO (mai il nome). 5°→7°: NESSUNA
    notifica (non era podio). [§7.2]
6.3 **Soglie** — Con 3 partecipanti totali: né podio né sorpasso (soglia ≥4);
    recap solo con ≥3. [§7.1–7.3]
6.4 **Idempotenza** — `aura_rank_daily()` due volte nello stesso giorno:
    snapshot invariati, NESSUNA notifica doppia; doppio tick del recap = UN
    solo invio (guardia atomica). [§13.3]
6.5 **Deep link ad app viva** — Tap sulla notifica (app in background).
    Atteso: Home si apre SUL TAB AURA. [§7.4]
6.6 **Deep link a freddo** — App uccisa, tap sulla push. Atteso: cold start →
    Home sul tab Aura (una sola volta: il param è consumato). [§7.4]
6.7 **Tap da non-listed** — B si nasconde DOPO l'invio, poi tocca la
    notifica. Atteso: tab Aura con lo stato «Sei fuori dalla classifica» —
    coerente, nessun errore. [§10.16]
6.8 **Param invalido** — `router.push('/home?categoria=xyz')` (o deep link
    manuale). Atteso: ignorato, resta Discover. Ri-focus del tab Home DOPO un
    deep link: la categoria NON si ri-applica da sola. [§7.4]
6.9 **Riga in tab Notifiche** — Le tre notifiche compaiono nel ledger con
    icona dedicata; il tap dalla riga naviga come il tap sulla push. [§7.4]

## 7. Stati & offline (AC3)
7.1 **Offline** — Modalità aereo → apri il tab Aura (senza cache). Atteso:
    VistaStato offline/errore con retry; con cache: dati vecchi + refetch al
    ritorno online. [§10.11]
7.2 **Cambio account** — Logout/login con B sullo stesso device: la
    classifica mostrata è quella di B (query key per uid, nessun bleed). [§13.5]
