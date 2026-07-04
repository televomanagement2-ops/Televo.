# Televo — Chat: MANUAL TESTING (regression pre-lancio)

> Scenari end-to-end dell'intero modulo Chat (CM0–CM8). Da eseguire per intero
> prima del lancio e dopo ogni modifica trasversale. Spuntare a mano; ogni
> scenario indica Passi / Atteso / Device / Riferimento SRS.
>
> **Prerequisiti**
> - 2 device fisici (o 1 fisico + 1 simulatore) con account distinti:
>   **A** e **B** adulti (18+), amici tra loro; **C** minore (16–17), amico di
>   nessuno dei due (per i test di safety).
> - Push: **Expo Go iOS o Development Build** (Expo Go Android NON riceve push
>   remote da SDK 53).
> - Rubrica: il device di A ha in rubrica l'email dell'account B.
> - Backend live (migrazioni fino a `20260705140000`), Vault configurato.
> - Edge v2 (`send-push`, `gdpr-export`): deploy manuale owner completato
>   (senza, i test 10.4/10.5 e 15.1 degradano al comportamento v1).

---

## 1. Hub e organizzazione (S1, D4)
1.1 **Lista e ordinamento** — Apri Messaggi con ≥3 chat. Atteso: fissate in
    cima, poi per attività; anteprima ultimo messaggio corretta (mai vocali
    scaduti né messaggi cancellati). [§7]
1.2 **Long-press (menu dark)** — Long-press su una chat. Atteso: bottom sheet
    DARK con Silenzia/Fissa/Archivia/Segna letto/Elimina + Annulla; tap fuori e
    back Android chiudono. [S16-bis, CM6.5]
1.3 **Silenzia 8h/1sett/sempre** — Silenzia da menu. Atteso: icona mute sulla
    riga; nessuna push (vedi 10.6); riattiva da Importante → Silenziate. [R-06]
1.4 **Archivia/ripristina** — Archivia; verifica sparita dall'hub e presente in
    Importante → Archiviate; ripristina. [S8]
1.5 **Elimina DM (hidden)** — Elimina chat DM; B scrive un messaggio. Atteso:
    la DM RIAPPARE nell'hub di A. [§7.5]
1.6 **Unread esatto** — B invia 5 messaggi con A fuori dalla chat. Atteso:
    badge riga = 5, badge tab = somma delle non-silenziate/non-archiviate;
    apertura chat → azzerato. [§8.5, chat_overview CM8]

## 2. Invio testo / optimistic / offline (CM2)
2.1 **Invio ottimistico** — A invia: bolla immediata (pending) → confermata.
    B la vede live senza refresh. [RC-01]
2.2 **Aereo-mode** — A in aereo-mode invia 3 messaggi (banner offline, bolle
    pending) → riconnette. Atteso: partono IN ORDINE; B li riceve. [RC-02]
2.3 **Errore server** — A bloccato da B prova a scrivere nella DM. Atteso:
    composer disabilitato con motivo; un eventuale invio forzato → bolla failed
    con Riprova/Elimina (menu dark). [R-05, §11.4]
2.4 **Rate-limit/cap** — Incolla >4096 caratteri. Atteso: errore IT "troppo
    lungo", niente crash. [CM1]

## 3. Gestione messaggi (CM4)
3.1 **Reply + scroll-to-quoted** — Rispondi a un messaggio vecchio; tap sulla
    citazione. Atteso: scroll + highlight (o "Non raggiungibile" oltre lo
    storico). [RC-10]
3.2 **Edit entro 48h** — Modifica un proprio testo. Atteso: badge "modificato";
    B lo vede aggiornato live; oltre 48h → errore IT. [RC-05]
3.3 **Reazioni** — Long-press → emoji (set ❤️😂👍😮😢🔥). Atteso: chip sotto la
    bolla, toggle della propria, live su B; nessuna notifica push. [RC-07]
3.4 **Inoltro** — Inoltra testo e foto verso un gruppo. Atteso: intestazione
    "Inoltrato"; vocali NON inoltrabili. [RC-06]
3.5 **Selezione multipla** — Long-press → Seleziona → 3 messaggi → Copia/
    Inoltra/Elimina. Atteso: cap 10, conferma dark su Elimina. [CM4]
3.6 **Prop-da-messaggio + Segnala** — Dai un prop (tratto) a un messaggio di B;
    segnala un messaggio. Atteso: conferme; secondo prop identico → "già dato".
    [S16]
3.7 **Info messaggio (gruppi)** — In un gruppo, "Info messaggio" su un proprio
    messaggio. Atteso: "Letto da N su M" coerente coi membri che hanno aperto
    (vedi anche 9.4). [RC-09]

## 4. Foto (CM5, D3)
4.1 **Galleria e fotocamera** — Invia foto da entrambe le sorgenti con caption.
    Atteso: anteprima nel composer, bolla 4:3, caption sotto; hub mostra
    "📷 Foto". [D3]
4.2 **Viewer** — Tap sulla foto: full-screen, pinch 1–4x, doppio tap, tap =
    header. [S14c]
4.3 **Upload fallito** — Invia foto in aereo-mode: pending → riconnessione →
    parte. Mai messaggi senza file dietro. [§15 caso 7]
4.4 **RLS bucket** — Con un account NON membro, prova `createSignedUrl` sul
    path di una foto altrui. Atteso: negato. [Safety]

## 5. Vocali effimeri (24h)
5.1 **Registra/invia/riascolta** — Vocale end-to-end su 2 device; badge "24h".
5.2 **Scadenza** — Un vocale >24h non è visibile (né in chat né come anteprima
    hub) anche PRIMA del cron. [CM1]
5.3 **Permesso mic negato** — Nega il permesso: avviso dark, niente crash.

## 6. Ricerca (RC-08)
6.1 **In-chat** — Cerca (menu chat) un termine CON accenti: contatore i/N,
    frecce, salto + flash. [S12b]
6.2 **Globale** — Da Cerca: sezioni Persone e Messaggi; tap su un risultato
    messaggio → apre la chat con highlight. [S12a]

## 7. Gruppi (R-09)
7.1 **Crea gruppo** — Nuovo gruppo con B (+altri). Messaggi con nome mittente
    sopra le bolle.
7.2 **Rinomina/avatar (admin)** — Da Info: rinomina + foto. Atteso: live su B.
7.3 **Promozione admin** — Promuovi B (scudo). B ora può gestire membri.
7.4 **Uscita ultimo admin** — L'unico admin esce. Atteso: auto-promozione del
    membro più anziano (server-side).
7.5 **Gruppo orfano** — Tutti escono. Atteso: entro ~5 min il cron lo cancella
    (verifica a DB: conversations senza la riga). [R-16, CM8]
7.6 **Rimozione membro** — L'admin rimuove un membro: sparisce la chat al
    rimosso; conferma dark.

## 8. Presenza & typing (CM3)
8.1 **Online/ultimo accesso** — Header DM: "online" se B è attivo (<2 min),
    altrimenti "ultimo accesso...". [RC-04]
8.2 **Typing** — B digita: "sta scrivendo…" su A (TTL 4s); nei gruppi con
    username. [RC-03]
8.3 **Toggle ultimo accesso** — B disattiva "Ultimo accesso" (S10). Atteso: A
    non vede più la riga; e B non vede quella di A (reciprocità). [R-03]

## 9. Spunte di lettura — ENFORCEMENT SERVER (§6.4, CM8)
9.1 **Doppia spunta base** — Entrambi i toggle on: B apre la chat → ✓✓ su A,
    live.
9.2 **B nasconde le spunte** — B disattiva "Spunte di lettura". Atteso: A vede
    solo ✓ singola sui nuovi messaggi letti da B.
9.3 **Reciprocità** — Con A che nasconde le spunte: A NON vede le ✓✓ di
    nessuno (il server risponde lista vuota).
9.4 **Gruppi "letto da N"** — Chi nasconde le spunte NON compare nell'elenco
    (denominatore = membri−1).
9.5 **Enforcement reale** — (tecnico) Da un client SQL come `authenticated`:
    `select last_read_at from conversation_members` → permission denied. [CM8]

## 10. Push e badge (RC-13, CM6/CM8)
10.1 **Permesso contestuale** — Primo ingresso nell'hub: banner "Attiva le
     notifiche" → Attiva → token in `devices`.
10.2 **Push in background** — App di A in background; B scrive. Atteso: push
     con titolo/anteprima; tap → apre LA chat giusta (anche da app chiusa).
10.3 **Soppressione in-chat** — Con la chat aperta in foreground: nessun
     banner di sistema per quella conversazione.
10.4 **Badge (Edge v2)** — Dopo la push, il badge dell'icona ≈ notifiche non
     lette; si riallinea all'apertura dell'app.
10.5 **Pruning token (Edge v2)** — Disinstalla l'app da un device: dopo la
     prima push fallita il token sparisce da `devices`.
10.6 **Mute server-side** — Chat silenziata: NESSUNA push (la notifica non
     viene proprio creata).

## 11. Contatti rubrica (D1, CM7)
11.1 **Opt-in** — A apre "Trova i tuoi contatti": spiegazione → Attiva →
     permesso OS → sync. Atteso: B in lista (email in rubrica) con "Aggiungi"
     o "Messaggia".
11.2 **Minore non scopribile** — L'email di C è nella rubrica di A (non
     amici). Atteso: C NON compare. [Safety]
11.3 **Permesso OS negato** — Nega la rubrica: stato con "Apri impostazioni";
     concedi da lì → Riprova funziona.
11.4 **Revoca** — "Disattiva e rimuovi i miei dati" (conferma dark). Atteso:
     righe `contact_hashes` di A sparite, consenso revocato; si torna
     all'opt-in; B non trova più A.
11.5 **Bloccati esclusi** — Con B che ha bloccato A: B non compare nei match
     di A (e viceversa).

## 12. Blocco (R-05)
12.1 **Blocca da profilo/info** — A blocca B (conferma dark). Atteso: composer
     disabilitato per entrambi nella DM; B non trova più A in ricerca.
12.2 **Lista bloccati (S10)** — Impostazioni chat → Utenti bloccati: B in
     lista → Sblocca (conferma) → composer riattivo.
12.3 **Invio rifiutato** — (tecnico) Insert diretto nella DM bloccata →
     `blocked_pair`.

## 13. Offline & realtime
13.1 **Banner offline** — Aereo-mode: banner in hub e chat.
13.2 **Hub live** — Con l'app sull'hub, B scrive: anteprima e unread si
     aggiornano SENZA aprire la chat. [§8.5]
13.3 **Riconnessione** — Dopo aereo-mode: coda pending parte, hub si riallinea.

## 14. Moderazione
14.1 **moderate-text sull'invio** — Invia un testo (con `PERSPECTIVE_API_KEY`
     configurata: uno tossico). Atteso: l'invio NON è rallentato; il testo
     finisce in `moderation_queue` (o accodato per revisione umana senza
     chiave). [CM8]
14.2 **Mute moderazione** — Con un account mutato (moderation_actions):
     composer disabilitato con motivo "silenziato fino a...". [§11.4]
14.3 **Segnala** — Già coperto in 3.6; verifica riga in `reports`.

## 15. GDPR
15.1 **Export (art. 15)** — Chiama `gdpr-export` con il JWT di A. Atteso: JSON
     con messages, saved_messages, conversation_memberships, contact_hashes,
     message_reactions, consents... [RC-12]
15.2 **Delete (art. 17)** — Su un account di TEST: `gdpr-delete` → profilo
     anonimizzato subito, contact_hashes cancellati, media azzerati; le chat
     altrui mostrano "Utente" senza crash.

## 16. Stati UI (SRS §14)
16.1 **Loading/vuoto/errore** — Per ogni schermata (hub, chat, info,
     nuovo-gruppo, inoltra, cerca, importante, impostazioni, contatti): stato
     vuoto sensato e, in aereo-mode al primo carico, StatoErrore con Riprova
     funzionante.
16.2 **Dialoghi dark ovunque** — Nessun popup chiaro di sistema in nessun
     flusso (eccetto share/permessi OS); "Annulla" sempre presente; tap fuori
     chiude. [CM6.5]
