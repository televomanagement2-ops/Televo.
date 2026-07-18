# Televo — Backend (handoff per Claude)

> **Leggimi per primo.** Questo file ti dà il contesto completo per continuare il
> progetto senza ripartire da zero. È un documento di handoff: cosa è Televo,
> com'è costruito il backend, cosa è stato fatto, cosa manca, e le regole da
> rispettare. L'utente comunica in **italiano** e i commenti nel codice sono in
> italiano: mantieni questo stile.

---

## 1. Cos'è Televo (lo scopo)

**Televo** = social network mobile-first per la **Gen Z (16+)**, lancio
**invite-only a Terni (settembre 2026)**. Non è "un altro social": è costruito su
tre **pilastri** non negoziabili, che guidano ogni decisione tecnica.

1. **Proof of Human** — presenza umana reale, live e non falsificabile. Niente
   bot, niente profili finti, niente vetrine patinate. Le **Stanze Live** (audio,
   LiveKit) sono il cuore: la prova che dietro c'è una persona vera, ora.
2. **Aura** — la **reputazione vivente** dell'utente. NON popolarità, NON
   follower, NON ore di utilizzo. Misura la **qualità della presenza**: sale con
   le connessioni autentiche, la gentilezza, l'accoglienza, l'umorismo
   apprezzato, il contributo; scende con tossicità, spam e uso compulsivo. È un
   **anello luminoso** che cambia colore in base al tratto dominante della
   settimana. Classifiche **per carattere** (Most Chill / Welcoming / Humor /
   Helpful) e per scuola.
3. **Anti-doomscroll by design** — niente feed infinito, niente vanity-count,
   niente meccaniche d'ansia. I "post" sono **drop** effimeri (24h). Le streak
   non puniscono (hanno i "freeze"). L'uso compulsivo abbassa l'Aura: il prodotto
   spinge verso un uso **sano**.

Pubblico: adolescenti. Quindi **la safety dei minori è un requisito di prodotto**,
non un extra. Ogni scelta (vedi §6) è orientata a proteggerli.

**Fuori scope per ora**: frontend Expo/React Native (round successivo, UI
definita dall'utente), Stripe reale + payout creator (2027), self-host LiveKit,
Momenti Salienti AI, sponsor brand-safe.

---

## 2. Dove sono le cose

- **Repo backend**: questa cartella (`C:\Users\telev\Desktop\televo`). Git su
  `master`, **repo locale senza remote** (commit diretti su master, un commit per
  blocco — è la convenzione del progetto).
- **Piano fondante**: `C:\Users\telev\.claude\plans\vai-curried-canyon.md`
  (design dettagliato Fasi 4–8 + GDPR, incl. il ragionamento sull'Aura v2).
- **Stack**: Supabase hosted **regione EU/Frankfurt** (Postgres 17 + RLS + Edge
  Functions Deno). LiveKit **Cloud** (free tier). Perspective API (moderazione).
  Stripe **rimandato al 2027**. Expo Push per le notifiche.

```
supabase/
  config.toml          # progetto + storage buckets + registrazione Edge Functions
  migrations/          # 21 file SQL, applicati in ordine cronologico per nome
  functions/           # 10 Edge Functions (Deno)
    _shared/           # cors.ts (corsHeaders, jsonResponse) + clients.ts (adminClient, userClient)
  tests/               # rls_smoke.test.sql (pgTAP, 82 invarianti)
  seed.sql             # dati di test
.env.example           # template variabili (NON committare .env)
README.md              # guida operativa (setup, deploy, Vault, sicurezza)
```

---

## 3. Stato del lavoro (cosa è fatto / cosa manca)

### ✅ Fasi 0–3 — GIÀ LIVE sul Supabase hosted
Scaffold, core/identità/inviti (age-gate ≥16 hard nel trigger `handle_new_user`),
Aura v1 (ledger + classifiche), Stanze Live + token LiveKit. Edge Functions
`verify-invite`, `livekit-token`, `aura-recompute` deployate. Cron pg_cron
(`recompute_aura`, `rotate_spotlight`, `expire_content`).

### ✅ Fasi 4–8 + GDPR — SCRITTE e committate in locale, **NON ancora `db push`ate** sul remoto
Sei commit, uno per blocco (da `c4315a5` a `4e970cd`). Vedi §4 per i dettagli.

### ⏳ Prossimi passi per andare live (lato utente, hosted — NON c'è Docker locale)
1. `supabase db push` → applica le migrazioni 155000→210000 (le estensioni
   `pg_net` e `supabase_vault` si auto-abilitano nella migrazione notifiche).
2. `supabase functions deploy` → pubblica le 7 nuove Edge Functions.
3. Registra in **Vault** i 3 segreti per il push (vedi README → "Segreti per le
   notifiche push"): `edge_base_url`, `service_role_key`, `cron_secret`.
4. (Opzionale) `PERSPECTIVE_API_KEY` per la moderazione AI. Senza, degrada con
   grazia. Stripe resta inerte finché non ci sono `STRIPE_*` (lancio 2027).
5. `supabase test db` → pgTAP (82 invarianti).

> ⚠️ Le migrazioni 4–8/GDPR sono **verificate per coerenza ma non ancora
> applicate** su Postgres reale (niente Docker locale, il remoto è live). Al primo
> `db push` potrebbe servire un fix: se compare un errore, leggilo e correggi la
> migrazione interessata.

---

## 4. Com'è costruito il backend, dominio per dominio

Ordine di applicazione = ordine alfabetico dei file (timestamp). Le dipendenze
seguono quest'ordine.

### Infra trasversale
- `20260628155000_audit.sql` — `audit_log` append-only + `log_audit()`. RLS
  attiva **senza policy di scrittura** (solo SECURITY DEFINER/service_role). La
  policy di **lettura per i moderatori** è aggiunta in Fase 7.
- `20260628155100_aura_helpers.sql` — `emit_aura(user, type, delta, src_type,
  src_id)`: **unico punto** di scrittura del ledger `aura_events` (salta utenti
  cancellati). Aggiunge il valore enum `participation` ad `aura_event_type`.

### Fase 4 — Social/Chat + Aura v2 + Drops
- `160000_social_friendships.sql` — amicizie a **mutuo consenso** (no follow).
  Coppia **normalizzata** (`user_id < friend_id`) → una sola riga simmetrica. Le
  mutazioni passano da **RPC SECURITY DEFINER**: `send_friend_request`,
  `accept_friend_request`, `remove_friend`, `block_user`, `unblock_user`. Helper
  `are_friends(a,b)` e `is_blocked_pair(a,b)`. `top_friends` (cerchia 1–8).
  L'amicizia accettata emette Aura `welcoming` a entrambi.
- `160100_conversations.sql` — `conversations` (`dm`/`group`/`house`) +
  `conversation_members`. **DM solo tra amici accettati** (`get_or_create_dm`
  richiede `are_friends`, una DM unica per coppia via `dm_key`).
  `create_group_conversation`, `add_conversation_member` (group=amici,
  house=stessa scuola), `leave_conversation`, `mark_conversation_read`. Helper
  `is_conv_member` / `is_conv_admin` (SECURITY DEFINER → rompono la ricorsione RLS).
- `160200_messages.sql` — `messages` (text/audio/voice_thread, `reply_to`,
  `expires_at` per i vocali effimeri max 24h, soft-delete). Trigger forza
  `sender_id`, esige membership, valida reply/expiry. **Storage**: la policy
  `voice-messages` dà accesso ai **membri della conversazione** (path
  `"<conversation_id>/<user_id>/<file>"`) — voce dei minori MAI pubblica.
- `160300_streaks.sql` — `streaks` (per conversazione, con **freeze** che salvano
  la striscia; reset **senza penalità**). `usage_daily` + `record_session()`
  alimentano l'Aura: `consistency` (presenza sana) e `compulsive_use` negativo
  oltre 3h/giorno. Cron `streak-rollover-daily`.
- `160400_props_aura_v2.sql` — **cuore dell'Aura**. `props` = riconoscimenti
  peer-to-peer (gentile/divertente/accogliente/utile…), **unici** per
  `(donatore, destinatario, tratto, contenuto)` + cap giornaliero (anti-gaming).
  Ogni prop → Aura al destinatario sul tratto + micro `kindness` al donatore.
  `aura_decay(ts)` = decadimento esponenziale **half-life 14 giorni**.
  `vibe_color(trait)` = mappa tratto→colore anello. **`recompute_aura()`
  ridefinito (v2)**: `aura_score` come **somma decaduta** del ledger,
  `aura_color` dal tratto dominante della settimana, snapshot settimanali con
  `character_breakdown`, classifiche su somme decadute.
- `160500_drops.sql` — `drops` (momenti effimeri 24h, audience `friends`/`school`,
  **niente posizione**). `drop_reactions` → diventano `props` all'autore.
  Postare un drop dà Aura `participation` a **rendimenti decrescenti**
  (`1/n` nel giorno) → premia la qualità, non il volume. `expire_content()`
  esteso a drop + messaggi effimeri.
  > **M6 — Drops come sistema di post** (spec+piano `docs/media/drop.md`, DM0–DM7,
  > chiuso 2026-07-06): il drop diventa post a 3 formati (foto/audio/testo)
  > **solo-amici** (school deprecata, R-02), effimerità **logica** (alla scadenza
  > `expire_content` v5 **non cancella** più: congela `stats_finali`, elimina le
  > interazioni, lascia la riga come **Ricordo** privato). Nuove tabelle
  > `drop_comments` (testo+vocali, reply 1 livello) · `drop_likes`/`drop_saves`
  > (**contatori privati** enforced a livello dati, R-04) · bucket
  > `drop-media`/`drop-audio` (lettura via `can_see_drop`). RPC `drops_feed`/
  > `drop_detail` (contatori solo per l'autore) · `save_drop`/`unsave_drop`.
  > Notifica `drop_comment` (mai like/salvataggi). Coda `storage_cleanup_queue`
  > + Edge `storage-cleanup`. **Drop del giorno** (DM7, §16.2): tema curato
  > giornaliero (`drop_prompts`/`drop_prompt_of_day`, pick LRU Europe/Rome) + UNA
  > notifica broadcast `drop_prompt` dosata (semi-random pomeridiana, una-volta-
  > al-giorno ai soli utenti attivi); banner nel composer via `drop_prompt_today()`.

> **Aura — il modello (perché funzioni tra i giovani)**: reputazione **viva**
> (decadimento, non cumulo), **multi-tratto** (i caratteri alimentano le
> classifiche), **ibrida** (props peer-to-peer + segnali comportamentali +
> partecipazione pubblica), **anti-gaming** (unicità props, cap, rendimenti
> decrescenti). "Numero di post / interazioni pubbliche" = drop + partecipazione
> alle live, con rendimenti decrescenti.

### Fase 5 — Mappa Vibe → **sostituita da M7 "La Mappa della Città"**
- `170000_map.sql` (Mappa Vibe: `vibe_map` / `live_presence` / `room_locations`
  + geohash coarse ~5km) è stata **deprecata e DROPpata** in M7/MM1
  (`20260707130000_map_legacy_out.sql`, atomica con `expire_content` v6 e
  `process_account_deletion` v6). Il dominio mappa vive ora in **M7** (spec+piano
  `docs/map/map.md`, milestone MM0–MM9): tabelle `map_presence` / `map_events` /
  `map_safe_zones` (PostGIS `extensions.geography(point,4326)`), **solo-amici**,
  tre stati **Live / Echo (12h) / Last Seen (24h)** derivati client-side dai
  timestamp UTC, posizione **esatta di default** + **Safe Zone** opzionale
  (masking SERVER-SIDE prima della persistenza: il punto esatto in-zona non tocca
  il disco), realtime **inbox privata** `map:u:{uid}` con fan-out server-side dal
  grafo amici (`realtime.send()`), unica porta di lettura `map_snapshot()`;
  client MapLibre + OpenFreeMap + Skia (richiede Dev Build EAS). MM0–MM9 completi.

### Fase 6 — Gamification & Notifiche
- `180000_notifications.sql` — `devices` (token Expo multi-device, upsert via
  `register_device`) + `notifications` (ledger owner-only). `enqueue_notification`
  centralizza l'accodamento; trigger su eventi reali (richiesta/accettazione
  amicizia, messaggio, prop). **`dispatch_push()`** (cron ogni minuto) invoca la
  Edge `send-push` via **pg_net**, leggendo URL/chiavi da **Vault** → **no-op
  sicuro** finché non configurato. Qui si abilitano `pg_net` e `supabase_vault`.
- `180100_achievements.sql` — catalogo `achievements` + `user_achievements`.
  `unlock_achievement()` idempotente (notifica al primo sblocco). Sbloccati da
  trigger sugli eventi reali (primo drop/messaggio/live/amicizia, streak 7/30,
  milestone Aura 100/250/500, badge di carattere su props ricevuti). **I badge
  NON toccano l'Aura** (layer separato: badge ≠ reputazione).
- Edge `send-push` (verify_jwt=false, x-cron-secret): preleva le notifiche
  `pushed_at is null`, invia via Expo, marca. Idempotente per batch.

### Fase 7 — Moderazione & Safety
- `190000_moderation.sql` — `moderators` (+ `is_moderator`), `reports`,
  `moderation_queue` (punteggi AI), `moderation_actions`. **Scelta chiave**:
  `mute`/`ban` implementati **ridefinendo `is_active_user()`** (aggiunge
  `banned_at is null` e `muted_until <= now()`) → un **unico punto di
  enforcement** blocca tutta la creazione di contenuti (le insert policy già
  usano `is_active_user`), lasciando la lettura. RPC: `file_report`,
  `take_moderation_action` (warn/mute/ban), `lift_sanctions`, `resolve_report`.
  Azioni confermate → Aura `toxicity` + `log_audit`. Aggiunge la policy di
  **lettura `audit_log` per i moderatori**.
- Edge `moderate-text` (verify_jwt=true): Perspective API, scrive in
  `moderation_queue` via `enqueue_moderation` (mute soft automatico oltre soglia
  critica). **Degrada con grazia** se manca `PERSPECTIVE_API_KEY` (revisione
  umana, niente crash).

### Fase 8 — Economia Vibes (simbolica attiva, Stripe inerte)
- `200000_economy.sql` — `wallets` (`balance_symbolic` per **tutti**,
  `balance_real` **gated 18+** a livello DB), `vibe_transactions` (con
  `idempotency_key` UNIQUE), `stripe_customers`, `creator_earnings`. **Gate 18+
  ridondante** (trigger su wallet e su transazioni reali). `process_symbolic_tip`
  = trasferimento **simbolico atomico e idempotente** (lock deterministico dei
  wallet, attivo dal lancio, sicuro per i minori). Dotazione iniziale +
  `grant_weekly_vibes` (cron). Le righe `real` le scrive SOLO service_role/Stripe.
- Edge `process-tip` (attivo, simbolico; reale → `stripe_not_configured`),
  `create-vibe-purchase` e `stripe-webhook` (gate 18+, firma HMAC + idempotenza
  **già pronte**, ma rispondono `stripe_not_configured` senza chiavi `STRIPE_*`).

### Trasversale — GDPR
- `210000_gdpr.sql` — `consents` + `record_consent` (ogni cambio in `audit_log`),
  `gdpr_requests` + `request_gdpr`. `process_account_deletion` =
  **anonimizzazione immediata** (profilo, `birth_date` privata, contenuti,
  dispositivi). `purge_due_deletions` (cron) = **hard-delete dopo 30 giorni**,
  incl. `auth.users` (l'email è dato personale) con guard sui privilegi.
- Edge `gdpr-export` (art. 15: esporta tutti i dati dell'utente) e `gdpr-delete`
  (art. 17: anonimizza subito + banna l'identità auth; hard-delete dopo retention).

### M12 — Live (broadcast video personale) — COMPLETO (LM0–LM8, 2026-07-12)
Spec+piano `docs/live/live.md` (Rev. 1) + `docs/live/MANUAL-TESTING.md`.
La **Live** è il broadcast video in prima persona, **solo-amici** (L-1), che
COESISTE con le Stanze audio `rooms` (L-2). Migrazioni 55–59
(`live_enums`, `live_foundation`, `live_map`, `live_social`, `live_lifecycle`):
- **Dominio**: `lives` (stati espliciti `live/paused/ended`, `ended` terminale,
  una live attiva per host via unique parziale, `clip_consent` riservato) ·
  `live_hosts` (Co-Live fino a 4, invited/active/left/removed) · `live_viewers`
  (il mint del token È il join; registro kick; gancio 1:1 adulto-minore) ·
  `live_comments` (≤200 char, rate-limit 5/30s, realtime postgres_changes+RLS,
  purge a 24h dalla fine). **`can_see_live`** = UNICO predicato di visibilità
  (RLS, feed, token, commenti, fan-out): unione amici degli host ATTIVI (L-3),
  `top_friends` = solo cerchia dell'host principale, bloccati/kickati esclusi.
- **Social**: notifiche `live_started` set-based secondo `notify_mode` (default
  TUTTI gli amici, L-4; dedup 10 min) + `live_cohost_invite`; fan-out
  `live_started`/`live_status`/`live_ended` via `live_fanout` sull'inbox privata
  M7 `map:u:{uid}`; Aura `participation` 1/n SOLO per live qualificate (≥5 min,
  ≥1 spettatore reale); porte di lettura `lives_feed()`/`live_detail()`
  (contatori SOLO all'host, anti-vanity — SUPERATO da M15: contatori pubblici
  ai visibili, v. voce M15 sotto e §6).
- **Mappa**: `map_events.live_id` + `map_attach_live`/`map_detach_live`
  (opt-in, masked-aware) + trigger di chiusura → **Echo 3h** (vs 12h stanze);
  in `paused` il badge resta pieno. Client: anello rosso + callout "LIVE"
  sull'avatar (AuraDot/AuraGlyph), bolla standalone senza punto amico,
  dissolvenza via `fattoreEcho`, card con "Guarda la live".
- **Lifecycle**: `expire_content` v7 (cap 8h, pausa >30 min, host sanzionato,
  purge 24h/30gg, cintura mappa) · webhook LiveKit (`room_finished`,
  `participant_left`) · `process_account_deletion` v7 · `gdpr-export` v5.
- **Edge**: `livekit-token` v2 (ramo `live_id`, mint=join, canPublish solo
  host/co-host attivi) · `live-kick` (DB prima, media dopo) · `livekit-webhook`
  (firma WebhookReceiver) · `moderate-text` v3 (`live`, `live_comment`).
- **Mobile** (`mobile/`, Dev Build EAS): SDK `@livekit/react-native`, composer
  camera-first `/live/nuovo`, schermo host/spettatore `/live/[id]`
  (`useLiveSession`), commenti overlay con fade, Co-Live, kick, Home striscia +
  feed verticale paged (preview subscribe-only della SOLA pagina visibile,
  budget R-3), badge mappa LM8. NO moderazione AI sui flussi video (report +
  coda umana); NESSUNA registrazione (il video non è mai persistito).

### M15 — Rework Live (like TikTok, contatori pubblici, striscia terminate) — COMPLETO (LR0–LR9, 2026-07-16)
Spec+piano `docs/live/live-rework.md` (Rev. 1, decisioni **RW-1..RW-5** del PO
2026-07-15) — EMENDA `docs/live/live.md` (→ Rev. 2). Migrazioni 69–72
(`live_likes`, `live_contatori_pubblici`, `lives_strip`,
`live_likes_lifecycle`):
- **Like TikTok (RW-3)**: `live_likes` (una riga = un LOTTO; batching client
  **800ms** ↔ rate-limit server **15 insert/10s** — cifre ACCOPPIATE, R-2;
  cap 50/riga) + trigger arbitro `live_likes_before_insert` (specchio dei
  commenti) + `lives.like_count` a delta SOLO su INSERT (totale storico, mai
  decrementato). Realtime = SECONDO listener sullo stesso canale `live:{id}`
  dei commenti (zero canali nuovi). Cuori SOLO locali (RW-3a); i like NON
  danno Aura né notifiche né moderazione.
- **Contatori pubblici (RW-4)**: grant per-colonna `(viewer_count,
  like_count)` su `lives`; `lives_feed` **v3** (ranking `is_top desc,
  viewer_count desc` — l'Aura ESCE dal ranking; keyset QUATERNARIO, firma a
  5 parametri con default) e `live_detail` **v3** (contatori nel jsonb `live`
  per TUTTI i visibili; `peak_viewers` SOLO host/co-host).
- **Striscia (RW-1)**: `lives_strip()` = terminate <24h, tap → PROFILO
  (RW-1a, mai replay); finestra 24h = INVARIANTE accoppiata alla purge di
  `live_viewers` in `expire_content`.
- **Lifecycle/GDPR**: `expire_content` **v9** (purge `live_likes` a 24h) ·
  `process_account_deletion` **v8** (delete righe proprie; `like_count` resta:
  aggregato anonimo) · `gdpr-export` **v6** (sezione live_likes, coda owner).
- **Fine feed (RW-5)**: `FineFeedLive` footer alto una pagina esatta → zero
  preview connesse sulla pagina di fine (R-3 gratis).
- **Mobile**: hook `useLivesStrip`/`useLiveLikes` (display ❤ monotòno),
  `CuoreParticella`/`CuoriOverlay`, double-tap RNGH sul CONTENITORE della
  griglia video, pille 👁/❤ per tutti in `/live/[id]`, pilla 👁 statica sulla
  preview del feed (QA-2), `LiveStripAvatarTerminata`.

### M16 — Classifica Aura (solo-amici, opt-out reciproco) — COMPLETO (AC0–AC6, 2026-07-18)
Spec+piano `docs/aura/classifica.md` (Rev. 1, decisioni PO **AC-1..AC-5** del
2026-07-16) + `docs/aura/MANUAL-TESTING.md`. Il tab Aura della Home diventa la
**classifica dell'Aura SOLO tra amici accettati** (mai globale: la classifica
di A e quella di B sono insiemi diversi). Migrazioni 73–76 (`aura_classifica`,
`…_notifiche_enum`, `…_notifiche`, `…_lifecycle`):
- **Dominio**: flag `profiles.show_in_leaderboard` (default true; grant UPDATE
  per-colonna, **FUORI dal grant SELECT** — nessuna enumerazione di chi si
  nasconde; lo stato proprio viaggia come `listed` nell'envelope) · RPC
  **`aura_leaderboard()`** = UNICA porta di lettura (cancello chiamante:
  non-listed ⇒ envelope corto `{listed:false}`; partecipanti = io + amici
  `accepted` non cancellati/bannati e listed — i MUTATI restano; `row_number()`
  su `aura_score desc, created_at asc, id asc` — pari merito = anzianità;
  cap difensivo 200 + `me` sticky).
- **Notifiche retention (AC-4)**: enum `aura_podio`/`aura_sorpasso`/
  `aura_recap` · tabelle di sistema `aura_rank_snapshots` (fotografia
  giornaliera del rank personale, retention 14gg) + `aura_recap_of_week`
  (dosaggio, clone di `drop_prompt_of_day`) · `aura_rank_daily()` (cron 03:30
  UTC, dopo il ricalcolo Aura: upsert idempotente + diff con ieri → podio
  `old>3→≤3`, sorpasso SOLO ex-podio `old≤3` che peggiora, sorpassante
  **ANONIMO**, soglia ≥4 partecipanti, dedup non-letti, primo snapshot
  silenzioso) · `notify_aura_recap()` (broadcast dosato domenicale 17:00–19:30
  Roma, guardia atomica, soglia ≥3).
- **Lifecycle/GDPR**: `expire_content` **v10** (purge snapshot >14gg, righe
  dosaggio >60gg) · `process_account_deletion` **v9** (delete immediato degli
  snapshot propri; quelli altrui non citano l'utente) · `gdpr-export` **v7**
  (sezione `aura_rank_snapshots` + flag nel profilo).
- **Mobile**: tab Aura reale in `home.tsx` (ramo tutta-altezza) ·
  `useClassificaAura`/`useClassificaVisibile` (flip ottimistico su `listed`,
  `.update()` SENZA `.select()`) · `components/aura/classifica/`
  (`ClassificaAura` podio 2/1/3 + lista + menu ⋮ + stati vuoto/non-listed,
  `PodioAura`, `RigaClassifica` con DM per riga, `MenuClassifica`,
  `StatoNonVisibile`) · **share card 9:16** (`ShareCardClassifica` off-screen
  360×640 + `useCondividiClassifica`: `captureRef` PNG 1080×1920 →
  `expo-sharing`, fallback `Share.share` testuale — import dinamici = guard
  Expo Go; SOLO dati del mittente, AC-5) · `INVITE_URL` in
  `constants/config.ts` (unica fonte outbound, QA-7) · deep link
  `?categoria=aura` (validato su `FeedCategoryKey`, consumato una volta via
  `setParams`) + `dynamicRoutes.homeCategoria` + rami in `rottaPerNotifica` ·
  **bonifica school-rank** (rimossi `useMyRank`/`useSchoolRank`/
  `Classifica.tsx` e i tipi `leaderboard_school`; la MV resta a DB, round
  futuro). Dipendenze native NUOVE `react-native-view-shot`+`expo-sharing` →
  serve una nuova Dev Build EAS (gate AC4).

---

## 5. Edge Functions e Cron (riepilogo)

| Funzione | verify_jwt | Note |
|----------|-----------|------|
| verify-invite | true | Fase 0-3 |
| livekit-token | true | v2 (M12/LM4): UN punto di mint per stanze `{room_id}` E live `{live_id}`; il mint della live È il join (upsert live_viewers) |
| aura-recompute | false | x-cron-secret |
| send-push | false | x-cron-secret; via dispatch_push (pg_cron+pg_net) |
| moderate-text | true | Perspective; degrada senza chiave (v3: +`live`/`live_comment`) |
| process-tip | true | tip simbolico attivo |
| create-vibe-purchase | true | inerte senza STRIPE_SECRET_KEY |
| stripe-webhook | false | firma Stripe; inerte senza STRIPE_WEBHOOK_SECRET |
| gdpr-export, gdpr-delete | true | art. 15 / 17 (export v7, M16: incl. drops, mappa, live, live_likes e aura_rank_snapshots) |
| storage-cleanup | false | x-cron-secret; via dispatch_storage_cleanup (pg_cron+pg_net); svuota storage_cleanup_queue via Storage API (M6/DM6) |
| live-kick | true | M12/LM4: solo host principale; DB prima (kicked_at/removed), media dopo (removeParticipant) |
| livekit-webhook | false | M12/LM4: firma **WebhookReceiver** LiveKit (NON x-cron-secret); room_finished → end, participant_left → riconcilia |

**Cron (pg_cron)**: `aura-recompute-weekly`, `spotlight-daily`, `expire-content`
(5 min), `streak-rollover-daily`, `dispatch-push-minutely`,
`vibes-weekly-allowance`, `gdpr-retention-daily`, `storage-cleanup-15min`,
`drop-prompt-pick-daily` (00:05 UTC: sceglie il tema del giorno),
`drop-prompt-notify` (`*/15 13-18 * * *`: broadcast dosato dopo `send_after`),
`aura-rank-daily` (`30 3 * * *`: snapshot rank + notifiche podio/sorpasso, M16),
`aura-recap-weekly` (`*/15 15-19 * * 0`: recap classifica dosato dopo `send_after`, M16).

---

## 6. Sicurezza & regole d'oro (DA RISPETTARE)

Vincoli di safety minori + GDPR, validi su tutto:
- Age-gate **≥16** hard nel trigger signup; `birth_date` isolata in
  `profiles_private` (mai esposta). Maggiore età (18+) calcolata via `is_adult`.
- **DM solo tra amici accettati**; blocchi reciproci a DB.
- Voce dei minori **mai pubblica** (bucket privati + RLS path-based).
- **Posizione** friends-only, opt-in, auto-expiry; **esatta di default**, coarse
  su scelta (Safe Zone). Revoca istantanea = cancellazione fisica della riga;
  mai visibile ai non-amici. (M7/QA-7: supera la vecchia regola "sempre coarse" —
  la coarseness sopravvive come SCELTA dell'utente, non come default paternalistico.)
- **Saldo reale gated 18+** a livello DB; i minori usano solo Vibes simboliche
  non monetizzabili. Le righe monetarie le scrive solo il server.
- Token LiveKit / Stripe firmati **solo server-side**. `SERVICE_ROLE_KEY` e i
  secret **mai** nel client; vivono in Supabase secrets / Vault.
- `mute`/`ban` disattivano la creazione contenuti via `is_active_user()`; ogni
  azione di moderazione è in `audit_log`.
- **Live (M12+M15)**: visibilità SOLO amici accettati via l'unico predicato
  `can_see_live` (unione degli host attivi in Co-Live, L-3) — in caso di
  conflitto risolvere sempre verso il MENO aperto; `canPublish` nel token solo
  per host/co-host attivi, spettatori subscribe-only; il video **non è mai
  persistito** (nessuna registrazione/bucket: il flusso vive solo in LiveKit);
  **contatori** (EMENDATO M15, PO 2026-07-15): `viewer_count` e `like_count`
  sono PUBBLICI a chi può vedere la live — ECCEZIONE esplicita a R-04
  limitata alle live; restano privati `peak_viewers` (host/co-host) e la
  lista nominativa spettatori + kick (solo host principale); i **drops
  restano a contatori privati** (R-04 lì è intatta); UNA notifica
  per live (mai su pausa/ripresa, dedup 10 min; MAI notifiche per i like);
  le live finite **escono dal feed** (nessun archivio/replay) ma restano 24h
  come segnaposto in striscia → tap al PROFILO, mai alla live (M15/RW-1);
  NO moderazione AI sui flussi video/audio (report reattivo + coda umana).
- **Classifica Aura (M16, PO 2026-07-16)**: visibile SOLO tra amici accettati
  via l'UNICO predicato/porta `aura_leaderboard()` — mai classifica globale,
  mai rank fuori dal grafo (se un'altra superficie dovrà mostrare rank, DEVE
  passare da lì, mai un secondo predicato); il rank tra amici è un'**eccezione
  a R-04 dichiarata e perimetrata** (è reputazione di qualità, non
  vanity-count; i **drops restano a contatori privati**); opt-out
  **RECIPROCO** enforced a DB (chi si nasconde non appare E non vede; il flag
  `show_in_leaderboard` è FUORI dal grant SELECT: nessuna enumerazione di chi
  si nasconde); la classifica **LEGGE l'Aura, non la scrive** (nessun evento
  nuovo: guardarla/condividerla/vincerla non dà Aura); notifiche rarefatte e a
  soglia (recap dosato 1/settimana, podio, sorpasso SOLO ex-podio e **ANONIMO**;
  MAI notifiche nominative di sorpasso); la card condivisa contiene SOLO dati
  del mittente + `INVITE_URL` configurabile — mai identità di amici in
  artefatti che escono dall'app.

**Convenzioni del repo (seguile alla lettera quando aggiungi codice):**
- Migrazioni: `supabase/migrations/YYYYMMDDHHMMSS_dominio.sql`, header
  `=== … ===` con razionale **in italiano**.
- Funzioni: `language sql|plpgsql … security definer set search_path = ''`,
  sempre schema-qualificate (`public.`, `extensions.`, `storage.`, `vault.`,
  `net.`).
- RLS: `enable row level security` su OGNI tabella; policy nominate
  `<tabella>_<azione>_<scope>`; predicati con `(select auth.uid())`
  (ottimizzazione initplan).
- Grant **espliciti** (auto-expose OFF): `grant select` per lettura,
  `grant update (col, …)` per-colonna solo sui campi utente; i campi di sistema
  si forzano nei trigger `*_before_write` / `*_before_insert`.
- Scrittura ledger/sistema (aura, wallet reali, moderazione, audit, notifiche):
  SOLO service_role / SECURITY DEFINER.
- Mutazioni complesse via **RPC** (pattern `redeem_invite`).
- Edge Functions: `Deno.serve`, gestione `OPTIONS`, usa `_shared/cors.ts` e
  `_shared/clients.ts`, errori come stringhe-codice, registra in `config.toml`.
- pgTAP: estendi `supabase/tests/rls_smoke.test.sql` con le nuove invarianti
  (ricordati di aggiornare `plan(N)`).

---

## 7. Come continuare (suggerimenti per il prossimo round)

- **Per andare in produzione il backend**: esegui i 5 passi del §3 sul progetto
  hosted e, al primo `db push`, correggi eventuali errori segnalati da Postgres.
- **Possibili migliorie backend**: `MANUAL_TESTING.md` con scenari end-to-end
  delle nuove fasi; rilevazione collusion/reciprocità nei props; tuning dei pesi
  Aura su dati reali; notifica "amico in live"; inviti stanza.
- **Frontend** (round successivo): app Expo/React Native sopra questo backend.
  Tutte le mutazioni delicate sono già RPC/Edge: il client chiama quelle, non
  scrive direttamente le tabelle di sistema.

Se ti serve il dettaglio di un singolo file, **leggi il file** (è la fonte di
verità) — questo documento è la mappa, non il territorio.
