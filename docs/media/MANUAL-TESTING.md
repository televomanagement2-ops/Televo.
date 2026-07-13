\# Televo — Drops (M6): MANUAL TESTING (regression pre-lancio)

> Scenari end-to-end dell'intero modulo Drops (DM0–DM7). Da eseguire per intero
> prima del lancio e dopo ogni modifica trasversale. Spuntare a mano; ogni
> scenario indica Passi / Atteso / Device / Riferimento (`drop.md`). Compagno di
> `docs/chat/MANUAL-TESTING.md` (stessa forma).
>
> **Prerequisiti**
> - 2 device fisici (o 1 fisico + 1 simulatore) con account distinti:
>   **A** e **B** adulti (18+), **amici tra loro**; **C** (adulto o minore)
>   **NON amico** di A né di B (per i test di visibilità/safety).
> - Push: **Expo Go iOS o Development Build** (Expo Go Android NON riceve push
>   remote da SDK 53). Senza push, i test 7.x e 8.3 si verificano in-app.
> - Backend live: migrazioni fino a **`20260706140100`** (Drop del giorno).
>   Vault configurato (`edge_base_url`/`service_role_key`/`cron_secret`).
> - **Edge deployate** (coda owner svuotata il 2026-07-12 con la CLI owner):
>   `storage-cleanup`, `gdpr-export`, `send-push` sono live → pulizia storage
>   (9.x), export GDPR (10.x) e deep link delle push (7.x, 8.3) girano senza
>   passi preliminari. La coda deploy M13 (`send-push` v3, `login-alert`) NON
>   blocca questi scenari.
> - **Scadenza simulata** (per Ricordi/effimerità): via pooler
>   ```sql
>   update public.drops set expires_at = now() - interval '1 minute' where id = '<DROP_ID>';
>   select public.expire_content();  -- congela stats_finali, cancella le interazioni
>   ```
> - Dashboard Storage a portata di mano (bucket `drop-media`, `drop-audio`) per le
>   verifiche di path e RLS.

---

## 0. Menu di creazione (S0) e composer (S2)
0.1 **Menu dal +** — Tap sul **+** centrale della bottom bar. Atteso: bottom
    sheet DARK "Cosa vuoi creare?" con la sezione **Drop** in testa (📷 Foto ·
    🎙️ Audio · ✍️ Testo attive) e "Altro" con badge "presto"; tap fuori/back
    chiudono. [S0, R-16]
0.2 **Scelta formato** — Tap su "Audio". Atteso: il menu si chiude e si apre il
    composer con il tab **Audio** preselezionato (`?tipo=`). [S0→S2]
0.3 **Composer testo** — Scrivi un pensiero, Pubblica. Atteso: chiusura
    immediata; la card compare in testa al feed (ottimistica). [S2, RC-01]
0.4 **Composer foto** — Da galleria e da fotocamera, con didascalia (≤280).
    Atteso: anteprima 4:5, "Amici" + "Scade tra 24h" nel footer, Pubblica. [S2]
0.5 **Composer audio** — Registra un vocale (idle → recording con timer → preview
    con riascolto/"Rifai"), didascalia opzionale, Pubblica. [S2]
0.6 **Bozza persistente** — Scrivi una didascalia, cambia tab e torna: la bozza
    del formato resta (dropStore). [S2]
0.7 **Limiti** — Incolla >2000 caratteri (testo) o >280 (didascalia): il campo
    tronca (maxLength) senza crash; audio oltre 5 min si ferma da solo. [S2]
0.8 **Composer disabilitato (sanzione)** — Con un account **mutato** apri il
    composer: banner col motivo, "Pubblica" disattivato. [S2, is_active_user]
0.9 **Offline** — In aereo-mode pubblica un drop: resta `pending`; riconnetti →
    flush automatico, la card si conferma. [RC-01]
0.10 **Rate-limit** — Pubblica il 21° drop in 24h. Atteso: errore IT gentile
    ("Hai già condiviso molto oggi…"), niente riga fantasma. [RC-06]

## 1. Feed drops (S1)
1.1 **Categoria Drops** — Home → categoria **Drops**. Atteso: lista verticale di
    card degli amici delle ultime 24h (non più `ComingSoon`). [S1]
1.2 **Tre formati** — A pubblica foto/audio/testo; B fa pull-to-refresh. Atteso:
    foto 4:5 (tap → viewer), audio con player+durata (senza scaricare il file),
    testo denso con "Mostra tutto". [S1]
1.3 **Anti-vanity (chiave)** — B guarda i drop di A. Atteso: **NESSUN numero**
    (like/commenti/salvataggi) sotto i drop altrui: solo le azioni ♥ 💬 🔖 🎙️.
    [D-2, R-04]
1.4 **Contatori privati (autore)** — A guarda i PROPRI drop nel feed. Atteso:
    contatori inline visibili (like/commenti/salvataggi + reaction per tratto).
    [R-04]
1.5 **Doppio tap = like** — Doppio tap sulla foto di un amico: cuore + haptic;
    sul PROPRIO drop il doppio tap apre il viewer (non auto-like). [S1, S6]
1.6 **Sei in pari ✓** — Scorri fino in fondo. Atteso: blocco "Sei in pari ✓" con
    micro-celebrazione + CTA reali (crea un drop / manda un vocale). Nessun
    contenuto riciclato. [§16.1]
1.7 **Vuoto** — Account senza amici con drop: "Ancora nessun drop dai tuoi
    amici — sii il primo". [S1]
1.8 **Card ottimistica pending** — Con un drop in outbox `pending`, la card resta
    in testa con spinner finché non si conferma. [RC-01]

## 2. Dettaglio & commenti (S3)
2.1 **Apertura** — Tap su una card / sul 💬. Atteso: hero del drop a piena
    larghezza + lista commenti + composer in basso. [S3]
2.2 **Commento testo** — B commenta; A (autore) lo vede **realtime <2s** con S3
    aperta. [S3, RC-04]
2.3 **Commento vocale** — B tiene premuto il mic (≤120s) → preview → invia.
    Atteso: player vocale compatto inline, qualità pari al vocale chat. [S3, D-4]
2.4 **Reply 1 livello** — B risponde a un commento top-level ("Rispondi"):
    reply indentata sotto il parent. Il tasto Rispondi NON compare sulle reply.
    [R-07]
2.5 **Reply-di-reply impossibile** — Non c'è modo di rispondere a una reply da
    UI; se forzata via API → `reply_depth_exceeded`. [R-07, §11.2]
2.6 **Statistiche private (autore)** — A apre il proprio drop: pannello
    `StatistichePrivate` con CHI ha messo like, numeri di commenti, **solo il
    numero** dei salvataggi (mai chi), reaction per tratto. B non vede nulla di
    tutto ciò. [R-04, R-14]
2.7 **Autore ripulisce** — A elimina un commento ALTRUI dal proprio drop; B
    elimina solo il proprio. Atteso: la cancellazione di un top-level porta via
    le sue reply. [§2.2, §9]
2.8 **Drop scaduto con S3 aperta** — Simula la scadenza (vedi Prerequisiti)
    mentre B ha S3 aperto e commenta. Atteso: mutazione → `drop_expired`, banner
    "non più disponibile", composer disabilitato. [§11.1]
2.9 **Segnala commento** — B segnala un commento (motivo). Atteso: conferma;
    riga in `reports` con target `drop_comment`. [§9]

## 3. Gesti leggeri: like, salvataggi, reaction-tratto
3.1 **Like toggle** — ♥ su un drop di un amico: ottimistico, reversibile, **zero
    notifica** ad A. [R-05, R-15]
3.2 **Salvataggio** — 🔖 su un drop: compare in **Salvati** (S4). Zero notifica,
    zero Aura. [R-05]
3.3 **Reaction-tratto (gesto forte)** — Long-press sul ♥ → barra 4 tratti →
    scegli "Divertente". Atteso: haptic marcato; ad A arriva una notifica
    **`prop`** (pipeline esistente) e sale l'Aura; secondo prop identico → "già
    dato". [S6, R-05]
3.4 **Reazione vocale rapida** — Press-and-hold sul mic della card: registra un
    vocale ≤10s → inviato come commento audio senza aprire S3. [§16.1]
3.5 **Rollback** — Metti like poi vai offline a metà: lo stato torna indietro
    (rollback ottimistico). [DM4]

## 4. Salvati (S4) e Ricordi (S5)
4.1 **Lista Salvati** — Apri Salvati: thumbnail/estratto + autore + **tempo
    rimanente** ("scade tra 3h"). [S4]
4.2 **Rimuovi salvataggio** — Rimuovi dai salvati: sparisce dalla lista. [S4]
4.3 **Salvato che scade** — Simula la scadenza di un drop salvato → il sistema
    cancella i salvataggi: la riga sparisce al refetch; il tap dà "non
    disponibile". [D-1, §5.3]
4.4 **Ricordi (autore)** — Simula la scadenza di un drop di A. Atteso: sparisce
    dal feed di B; per A diventa un **Ricordo** in `profilo/ricordi` con le
    `stats_finali` congelate ("♥ 12 · 💬 5 · 🔖 2 · 😂 4"). [R-01, §2.6]
4.5 **Elimina Ricordo** — A elimina un Ricordo (conferma dark): riga via + file
    accodati alla pulizia. [R-10, §5.4]
4.6 **Retention illimitata** — Un Ricordo resta finché A non lo elimina. [R-10]

## 5. Eliminazione anticipata & effimerità
5.1 **Elimina drop vivo** — A elimina un proprio drop ("Sparirà subito anche per
    i tuoi amici"). Atteso: via subito da feed/dettaglio di B. [§5.4]
5.2 **Effimerità logica** — Dopo `expire_content` su un drop scaduto: le
    interazioni (commenti/like/salvataggi/reaction) spariscono, la **riga
    resta** come Ricordo, `stats_finali` valorizzato. [R-01, §5.3]
5.3 **Aura resta** — I prop/Aura già emessi da reaction-tratto restano nel
    ledger anche dopo la scadenza. [§5.3]

## 6. Inoltro in chat (S7) & Rispondi in privato
6.1 **Inoltra a DM** — Da ⋯ su un drop → Inoltra in chat → scegli la DM con B.
    Atteso: in chat compare `BollaDropRef` risolvibile (formato + autore +
    anteprima + "Scade tra Xh"); tap → S3. [S7, R-08]
6.2 **Inoltro a non-amico** — Inoltra lo stesso drop in un gruppo dove **C** (non
    amico di A) è membro. Atteso: C vede "**Drop non disponibile**" (risoluzione
    con la RLS del lettore); B lo vede. [S7, R-08, §11.4]
6.3 **Drop inoltrato che scade** — Fai scadere il drop: la bolla degrada a "Drop
    non disponibile" per tutti (identico in ogni caso). [S7]
6.4 **Rispondi in privato** — Da ⋯ → "Rispondi in privato": apre la DM con
    l'autore con il riferimento al drop precompilato. [§16.1]

## 7. Notifiche commenti (drop_comment)
7.1 **Commento sul mio drop** — B commenta un drop di A. Atteso: push ad A
    "«B» ha commentato il tuo drop" (mai numeri); tap → S3 del drop giusto.
    [§7, RC-05]
7.2 **Reply al mio commento** — In un drop di A, C-amico risponde a un commento
    di B. Atteso: push a B (autore del commento padre) e ad A (autore del drop),
    dedup. [§7]
7.3 **Dedup anti-spam** — Più commenti sullo stesso drop entro 10 min: **una
    sola** notifica non letta per quel drop. [R-15]
7.4 **Mai per like/salvataggi** — Metti like e salva un drop di A: **nessuna**
    notifica. [R-15]
7.5 **Cold start** — App chiusa, tap sulla push commento: si apre direttamente
    S3 (dedup del tap). [RC-05]

## 8. Drop del giorno (DM7, §16.2)
8.1 **Banner nel composer** — Apri il composer (qualsiasi formato). Atteso: in
    testa un banner "**Tema di oggi**" con il testo curato del giorno (o nessun
    banner se non c'è tema). [§16.2]
8.2 **Rotazione** — Nei giorni successivi il tema cambia (rotazione LRU): non si
    ripete finché ci sono temi meno usati. [pick_drop_prompt_of_day]
8.3 **Notifica pomeridiana** — Simula l'invio (senza attendere il cron), via
    pooler:
    ```sql
    update public.drop_prompt_of_day
      set send_after = now() - interval '1 minute', notified_at = null
      where for_date = (now() at time zone 'Europe/Rome')::date;
    select public.notify_drop_prompt();
    ```
    Atteso: **una** notifica "Il tema di oggi ✨" a tutti gli utenti attivi; il
    secondo `notify_drop_prompt()` è no-op (guard `notified_at`); tap → composer.
    [§16.2, R-15]
8.4 **Solo attivi** — Verifica che un utente **bannato/mutato/cancellato** NON
    riceva la notifica del tema. [notify_drop_prompt + is_active_user]
8.5 **Una sola al giorno** — Nessuna seconda notifica del tema nello stesso
    giorno anche se il cron rigira. [guard notified_at]

## 9. Pulizia storage (R-09)
9.1 **Elimina drop con foto** — A elimina un drop foto. Atteso: entro un ciclo
    (~15 min) il file sparisce dal bucket `drop-media` (la riga transita da
    `storage_cleanup_queue`). [R-09, RC-07]
9.2 **Ricordo eliminato** — Eliminando un Ricordo con file, idem (coda → rimozione).
9.3 **Debito chat sanato** — Vocali chat scaduti / media azzerati dal GDPR
    finiscono nella stessa coda e vengono rimossi. [R-09]
9.4 **Whitelist bucket** — (tecnico) La Edge rimuove solo dai bucket previsti
    (`drop-media`/`drop-audio`/`voice-messages`/`chat-media`). [DM6]

## 10. GDPR (RC-08)
10.1 **Export** — Da Impostazioni → esporta i miei dati. Atteso: l'export
     contiene `drops`, `drop_comments`, `drop_likes`, `drop_saves`. [RC-08,
     art. 15]
10.2 **Delete account** — Elimina l'account di un utente con drop e interazioni
     su drop altrui. Atteso: i suoi drop spariscono ovunque; i suoi commenti/
     like/salvataggi su drop altrui vengono cancellati; i file finiscono in coda
     cleanup; "Drop non disponibile" per gli inoltri in chat che lo puntano.
     [RC-08, §11.12]

## 11. Permessi & privacy (matrice §8) — NON-AMICO NON VEDE NULLA
11.1 **Feed** — L'account **C** (non amico) non vede MAI i drop di A/B nel feed.
     [§8]
11.2 **Deep link** — C apre un link/`drop_detail` di un drop di A: risposta
     vuota → schermata "Questo drop non è più disponibile" (identica a
     scaduto). [§8, S3]
11.3 **File storage (RLS)** — Con l'account C prova una `createSignedUrl` sul
     path di una foto di A (bucket `drop-media`). Atteso: **negato**
     (`can_see_drop`). [1.3, R-06]
11.4 **Contatori non ottenibili** — (tecnico) Con B (amico non autore) prova a
     contare like/salvataggi via PostgREST (`select count`): le RLS non mostrano
     le righe; la RPC non valorizza i campi. [RC-02, R-04]
11.5 **Blocco** — B blocca A: il blocco rimuove l'amicizia → i drop di A
     spariscono per B (e viceversa). [§11.6]
11.6 **Amico rimosso dopo il fetch** — A rimuove B dagli amici dopo che B ha già
     la card: le interazioni di B vengono rifiutate (`drop_not_visible`); la
     card via al refetch. [S1]

## 12. Safety & moderazione (§9)
12.1 **Segnala drop** — B segnala un drop (motivo `REPORT_REASONS`). Atteso:
     conferma; riga in `reports` target `drop`. [§9]
12.2 **Testo → AI** — Il body/caption e i commenti testuali passano a
     `moderate-text` (fire-and-forget). Senza `PERSPECTIVE_API_KEY` degrada con
     grazia (revisione umana, niente crash). [§9]
12.3 **Sanzione blocca la creazione** — Un utente mutato/bannato non crea drop né
     commenti (composer disabilitato); la lettura resta. [§9, is_active_user]
12.4 **Spazio dell'autore** — L'autore rimuove qualunque commento dal proprio
     drop (moderazione distribuita). [§9]

## 13. Casi limite (§11)
13.1 Drop scade durante l'interazione → `drop_expired`, banner + refetch. [§11.1]
13.2 Reply a commento di un altro drop → `invalid_parent`. [§11.3]
13.3 11° commento in 60s → `rate_limited`. [§11.9]
13.4 Doppio like concorrente → PK, toggle idempotente. [§11.8]
13.5 Orologio client sballato → i tempi ("scade tra") derivano dal dato server.
     [§11.14]
13.6 Stessa foto in due drop → path diversi (id drop diverso), nessun conflitto.
     [§11.15]
13.7 App uccisa dopo upload, prima dell'insert → file orfano non leggibile da
     terzi (policy); debito dichiarato (sweep futuro). [§11.7, R-09]

---

## Esito
- [ ] Sezioni 0–13 eseguite su 2 device (A/B) + 1 estraneo (C).
- [ ] Anti-vanity verificato con occhi (nessun numero su drop altrui) E via API.
- [ ] Effimerità: feed pulito, Ricordi vivi, interazioni cancellate, file in coda.
- [ ] Drop del giorno: banner + notifica una-volta-al-giorno + solo attivi.
- [ ] GDPR e pulizia storage verificati (Edge live dal 2026-07-12).
- [ ] Nessun crash; ogni errore server mappato in italiano con azione suggerita.
