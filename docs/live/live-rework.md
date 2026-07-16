# Televo — Rework Live (M15): Specifica di prodotto & Piano di implementazione

> **Rev. 1 — 2026-07-15.** Decisioni di prodotto **RW-1..RW-5 validate dal
> product owner** (2026-07-15, sessione di pianificazione). Questo è il
> documento ufficiale della milestone **M15 — Rework Live**: Parte I =
> specifica di prodotto (cosa cambia e perché), Parte II = piano di
> implementazione a milestone (come lo costruiamo). È il compagno di
> `docs/live/live.md` (M12, la spec fondante della Live — che questo documento
> EMENDA nei punti elencati in §0.3) e ricalca formato e convenzioni dei
> documenti gemelli (`drop.md`, `map.md`). Lingua: italiano, come tutto il
> progetto.

---

## Contesto — perché questo documento

Il PO ha richiesto 5 modifiche al modulo Live (M12, completo LM0–LM8 e
verificato end-to-end su device reale):

1. **Striscia cerchi**: solo amici — prima le live ATTIVE, poi quelle
   TERMINATE da meno di 24h (visivamente distinte, spariscono a 24h).
2. **Ranking del feed verticale**: Best Friends sempre primi, poi TUTTE le
   altre live per engagement = **solo spettatori concorrenti** (decrescente).
3. **Like stile TikTok Live**: bottone dedicato + double-tap ovunque sul
   video; like illimitati, non-toggle; contatore totale visibile.
4. **Viewer count pubblico**: il numero di spettatori concorrenti visibile a
   tutti gli spettatori, non più solo all'host.
5. **Fine feed**: quando il feed verticale finisce, un segno di fine come nei
   drops (`SeiInPari`).

### 0.1 Decisioni di prodotto vincolanti (product owner, 2026-07-15)

| # | Domanda | Decisione |
|---|---------|-----------|
| RW-1 | Striscia: attive + terminate <24h | **Sì.** Ordine: prima le attive (stesso ordine del feed), poi le terminate per `ended_at desc`. Le terminate sono visivamente inequivocabili ("è finita") e spariscono a 24h esatte da `ended_at`. Solo amici, mai altri utenti. |
| RW-1a | Tap sul cerchio di una live terminata | **Apre il profilo dell'amico** (`/profilo/[id]`). Non esiste replay (il video non è mai persistito): il cerchio spento è una scorciatoia al profilo, stile storia scaduta. |
| RW-2 | Ranking feed | **Best Friends (= `top_friends`, cerchia 1–8) SEMPRE primi; poi tutte le altre per `viewer_count` desc.** Engagement = ESCLUSIVAMENTE spettatori concorrenti. Nessun altro segnale (l'**Aura ESCE dal ranking**; la recenza resta solo come tie-break). |
| RW-3 | Like TikTok | **Illimitati, non-toggle** (ogni tap = +1). Due vie: bottone Like dedicato + double-tap ovunque sul video, con cuore che appare NEL punto del tap e scala/sfuma. Contatore totale accumulato visibile nella UI live. |
| RW-3a | Cuori degli altri spettatori | **NO**: ognuno vede SOLO i propri cuori; dei like altrui si vede solo il contatore totale che sale in realtime. |
| RW-3b | Visibilità del contatore like | **Pubblico a tutti gli spettatori** (non solo all'host). |
| RW-4 | Viewer count | **Pubblico a tutti gli spettatori.** Rovescia l'anti-vanity R-04 *limitatamente alle live* (v. §0.3). |
| RW-5 | Fine feed | **Sì**, segno di fine gemello di `SeiInPari` dei drops. |

### 0.2 Ambito

**In scope (M15):** striscia con terminate <24h + tap→profilo · ranking
engagement in `lives_feed` · dominio like completo (`live_likes`,
`lives.like_count`, batching, realtime, purge, GDPR) · viewer_count/like_count
pubblici (grant, RPC, UI) · fine feed · aggiornamento documenti e pgTAP.

**Fuori scope:** replay/archivio delle live (le terminate in striscia sono
SEGNAPOSTO, mai riguardabili) · cuori altrui fluttuanti (RW-3a) · like nel
feed di preview (i like vivono SOLO nello schermo `/live/[id]`) · like→Aura
(v. §7 questioni aperte) · notifiche per i like (mai) · qualunque modifica ai
drops (R-04 sui drops resta INTATTA).

### 0.3 Regole precedenti SUPERATE (e loro perimetro esatto)

| Regola | Dov'era | Cosa cambia |
|--------|---------|-------------|
| **R-04 anti-vanity** ("contatori visibili SOLO all'host") | `live.md` §0.2/§1.2/§5/§13, `CLAUDE.md` §6 | **Eccezione esplicita per le live** (PO 2026-07-15): `viewer_count` e `like_count` diventano pubblici a chi può vedere la live. **NON si abroga**: `peak_viewers` resta privato (host/co-host), la lista nominativa spettatori + kick resta solo host, e i **drops restano intoccati** (contatori privati). |
| **AH-2** ("nessun contatore esce dal server, nemmeno nel cursore keyset") | `20260713150000_lives_feed_paginato.sql` (header), pgTAP ~1807 | Superata per le live: `viewer_count` entra nel payload del feed E nel cursore keyset. Il test pgTAP che vietava il token nel body va ROVESCIATO (LR4). |
| **"Le live finite spariscono"** | `live.md` §0.2/§1 | Precisata: le live finite **escono dal feed verticale** (nessun replay, nessun archivio), ma restano **24h come segnaposto nella striscia** — un cerchio spento che porta al profilo, non alla live. |

### 0.4 Fonti

`docs/live/live.md` (spec M12) · `20260709120100_live_foundation.sql`
(tabelle, `can_see_live`, `lives_before_write`, trigger commenti — pattern da
specchiare per i like) · `20260713140000_live_viewer_count_incrementale.sql`
(sync a delta, `expire_content` v8 = base verbatim di v9) ·
`20260713150000_lives_feed_paginato.sql` (base verbatim di `lives_feed` v3) ·
`20260715130000_live_detail_cohost.sql` (base verbatim di `live_detail` v3) ·
`20260711140000_live_lifecycle.sql` (`process_account_deletion` v7 = base di
v8) · `supabase/functions/gdpr-export` (v5 = base di v6) · client:
`mobile/src/components/live/*`, `mobile/src/hooks/{useLive,useLivesFeed}.ts`,
`mobile/src/lib/{live,live-realtime}.ts`, `mobile/src/store/liveStore.ts`,
`mobile/src/components/drops/SeiInPari.tsx` (pattern fine feed).

### 0.5 Convenzioni

Come tutto il repo: migrazioni con header `=== … ===` e razionale in italiano;
funzioni `security definer set search_path = ''` schema-qualificate; RLS su
ogni tabella; revoke SEMPRE da `public`+`anon`+`authenticated` prima del grant
mirato; redefinizioni **verbatim + add** (copiare il corpo dall'ULTIMA
versione in vigore); mutazioni arbitrate da trigger o RPC; errori come
stringhe-codice; pgTAP esteso con `plan(N)` aggiornato ed eseguito SUL REMOTO
via pooler (CLI bloccata); ⚠️ le guardie pgTAP `prosrc` leggono anche i
COMMENTI dei body → mai citare nei commenti i token che i test negativi
escludono; tipi TS a mano in `mobile/src/types/supabase.ts`; UI e commenti in
italiano.

---

# PARTE I — SPECIFICA DI PRODOTTO

## 1. Striscia — attive + terminate <24h (RW-1)

**Contenuto e ordine** (solo amici, L-1 invariata):
1. **Live attive** (`live`/`paused`) visibili al viewer — stesso ordine del
   feed verticale (v. §2), stessa fonte dati (prima pagina di `lives_feed`,
   già oggi `items.slice(0, 10)` dello store).
2. **Live terminate da <24h** — ordinate per `ended_at desc`, da una porta di
   lettura dedicata `lives_strip()` (§8.2). Stessa visibilità delle attive:
   `can_see_live` (che funziona anche su live `ended`: le righe `live_hosts`
   restano; kickati e bloccati restano esclusi).

**Aspetto della terminata** (inequivocabile, mai confondibile con una live):
- anello **statico grigio** (`colors.faint`) — MAI `colors.danger`, MAI pulse;
- avatar a opacità ridotta (~0.55);
- etichetta **"FINITA"** su sfondo `colors.elevated` (al posto di LIVE/PAUSA);
- sotto il nome, tempo relativo opzionale ("2h fa").

**Comportamenti:**
- Tap → `router.push(dynamicRoutes.profiloUtente(host.userId))` (RW-1a). MAI
  `/live/[id]`.
- Sparizione a 24h esatte da `ended_at`, anche TRA un refetch e l'altro:
  filtro client con clock calibrato (`server_now` → `clockOffsetMs`, pattern
  M7 §8).
- **Dedup per host**: se l'host ha una live ATTIVA visibile nello store, il
  suo segnaposto terminato NON si mostra (chiude-e-riapre entro 24h → vince
  l'attiva).
- La PROPRIA live terminata non appare (esclusa server-side).
- Le terminate NON entrano MAI nel feed verticale (che resta solo-attive per
  costruzione: `ended_at is null`).

**Invariante da non rompere** (dichiarata nell'header di `lives_strip`): la
finestra 24h della striscia COINCIDE con la purge di `live_viewers` (registro
kick) a 24h da `ended_at` in `expire_content`. Se un domani la purge scendesse
sotto 24h, i kickati rientrerebbero in striscia — le due durate vanno mosse
insieme.

## 2. Ranking del feed verticale (RW-2)

Ordinamento server-side in `lives_feed` v3 (solo live attive del grafo):

```
order by is_top desc,          -- 1. Best Friends del viewer SEMPRE primi
         viewer_count desc,    -- 2. engagement = SOLO spettatori concorrenti
         started_at desc,      -- 3. tie-break di recenza
         id desc               -- 4. tie-break deterministico (keyset)
```

- `is_top` = il viewer ha l'host nella PROPRIA cerchia `top_friends` (1–8),
  come oggi. Dentro il blocco Best Friends vale lo stesso sotto-ordine
  (viewer_count desc, poi recenza).
- L'**Aura dell'host esce dal ranking** (resta nel payload host per l'anello
  colore in UI).
- Il keyset diventa **quaternario**: cursore `(is_top, viewer_count,
  started_at, id)` derivato dall'ultima riga della pagina → `viewer_count`
  DEVE stare nel payload dell'item (consentito da RW-4).
- **Instabilità del cursore ACCETTATA**: `viewer_count` è volatile, quindi tra
  pagina 1 e pagina 2 sono possibili duplicati (dedup client per id già
  esistente in `appendFeed`) o salti (una live che scala posizioni). A scala
  Terni le live concorrenti stanno quasi sempre nella prima pagina (cap 20) e
  il reconcile a 60s risana. Alternative scartate: v. §8.6.

## 3. Like stile TikTok Live (RW-3)

### 3.1 UX (schermo `/live/[id]`, host E spettatori)

- **Double-tap ovunque sul video** → un cuore appare NEL punto esatto del tap
  e sale/scala/sfuma (~900ms, jitter casuale di rotazione/offset, stile
  TikTok). Ogni double-tap = +1 like. Nessun toggle, nessun limite percepito.
- **Bottone Like** (cuore) nel rail dei controlli a destra → +1 like + cuore
  spawnano presso il rail. Disponibile a spettatori, co-host e host.
- **Contatore totale ❤** in una pilla accanto alla pilla occhi 👁, visibile a
  TUTTI (RW-3b), che sale in realtime quando CHIUNQUE mette like.
- I cuori sono SOLO locali (RW-3a): dei like altrui si vede solo il contatore.
- In **pausa**: gesto e bottone disattivati client-side; il server rifiuta
  comunque (specchio dei commenti: si lika solo in stato `live`).
- Nella **preview del feed** non ci sono like (il tap apre la live — nessuna
  ambiguità gestuale).

### 3.2 Meccanica dati — batching

Un tap NON è un insert. Il client accumula i tap e li scarica a lotti:

- **Flush ogni 800ms**: un insert su `live_likes` con `count` = tap accumulati
  (cap 50 per riga; il resto slitta al lotto successivo). Flush finale
  best-effort all'unmount.
- **Rate-limit server: 15 insert / 10s** per (live, utente). I due valori sono
  ACCOPPIATI (800ms → max 12,5 insert/10s + headroom di rete): chi cambia uno
  dei due deve cambiare l'altro — commento obbligatorio su ENTRAMBI i lati.
  Tetto effettivo anti-script: 50×15 = 750 like/10s; per un umano è
  illimitato.
- **Contatore**: `lives.like_count` incrementato a delta da un sync-trigger
  SOLO su INSERT. Purge e cancellazioni NON decrementano: il totale è storico
  (come `peak_viewers` è monotòno).
- **Realtime**: postgres_changes INSERT su `live_likes`, SECONDO listener
  sullo STESSO canale `live:{liveId}` dei commenti (zero canali nuovi). RLS
  `can_see_live` filtra i sottoscrittori.
- **Contatore a video** = baseline `like_count` dall'ultimo `live_detail`
  (revalidation 60s già esistente) + delta realtime ALTRUI (skip delle proprie
  righe: l'eco del proprio insert è già contato) + i propri tap in optimistic
  immediato. Display **monotòno**: a ogni snapshot
  `display = max(displayCorrente, nuovaBase + deltaPostSnapshot)` — mai
  regressioni percepite.
- Errori (`rate_limited`, `live_not_likeable`, `live_not_visible`,
  `live_already_ended`): il lotto è scartato IN SILENZIO, niente retry-loop,
  niente coda (la live è intrinsecamente online, pattern M12).

### 3.3 Regole server (trigger, specchio dichiarato di `live_comments_before_insert`)

Insert diretta dal client (grant su `live_id, count`), trigger
`live_likes_before_insert` arbitro, guardie IN QUEST'ORDINE:

1. `user_id := auth.uid()`, `created_at := now()` (forzati, mai dal client);
2. `is_active_user` → `user_not_active` (mute/ban bloccano anche i like);
3. live esistente → `live_not_found`;
4. `status = 'live'` → `live_not_likeable` (in pausa non si lika);
5. `can_see_live` → `live_not_visible` (estranei/bloccati/kickati fuori);
6. `count between 1 and 50` (check constraint + guardia) → `invalid_like_count`;
7. rate-limit 15 insert/10s per (live, utente) → `rate_limited`.

### 3.4 Cosa i like NON fanno

- **Niente Aura** (v1): un like non è un prop (nessun tratto, nessun
  anti-gaming possibile su volumi illimitati). Questione aperta QA-1 (§7).
- **Niente notifiche**, mai (l'host è in diretta, vede il contatore).
- **Niente moderazione**: un like non ha contenuto.
- **Niente lista "chi ha messo like"** in UI (l'identità del liker è
  tecnicamente nel payload realtime, come per i commenti — la UI mostra solo
  il totale; trade-off accettato e documentato).

### 3.5 Retention & GDPR

- Le righe `live_likes` sono purgate a **24h dalla fine** della live (stesso
  blocco di `live_comments`/`live_viewers` in `expire_content`).
- `lives.like_count` SOPRAVVIVE alla purge e alla cancellazione account del
  liker: è un **aggregato anonimo** non riconducibile all'interessato (stessa
  posizione dei contatori congelati dei drops), e muore comunque coi 30 giorni
  della riga `lives`.
- `process_account_deletion` v8: delete delle righe `live_likes` proprie.
- `gdpr-export` v6: sezione `live_likes` (le proprie righe, art. 15).

## 4. Viewer count pubblico (RW-4)

- **A livello dati**: `grant select (viewer_count, like_count)` su
  `public.lives` per authenticated (RLS `can_see_live` continua a decidere le
  RIGHE). `peak_viewers` e `livekit_room_name` restano ESCLUSI dal grant.
- **`live_detail` v3**: `viewer_count` e `like_count` nel payload per TUTTI i
  visibili; il blocco condizionale host/co-host conserva SOLO `peak_viewers`.
- **`lives_feed` v3**: `viewer_count` nell'item (serve al cursore keyset; può
  alimentare una pilla 👁 statica sulla preview — facoltativa, v. LR8).
- **In stanza (UI)**: la pilla occhi 👁 diventa visibile a TUTTI. Il conteggio
  live resta client-side dai partecipanti LiveKit (istantaneo, zero costo,
  come oggi per l'host): per lo spettatore
  `conteggio = idsSpettatori.length + 1` (sé stesso non è tra i remoti; host e
  co-host non si contano, invariato).
- La **lista nominativa** spettatori (e il kick) resta SOLO dell'host
  principale — pubblico è il NUMERO, non i nomi.

## 5. Fine feed (RW-5)

- Quando il feed verticale non ha più live (`has_more = false` e almeno una
  live vista), l'ultima "pagina" oltre l'ultima live è un segno di fine:
  componente `FineFeedLive`, gemello di `SeiInPari` (badge ✓ verde
  `colors.success`, titolo "Sei in pari", testo "Non ci sono altre live in
  corso tra i tuoi amici.", CTA "Avvia una live" → `ROUTES.liveNuovo`).
- Reso come `ListFooterComponent` del `FlatList pagingEnabled`, alto
  ESATTAMENTE `altezza` (la misura di `getItemLayout`): il paging snappa
  pulito e quando il footer è la pagina visibile `viewableItems` è vuoto →
  `visibileId = null` → TUTTE le preview disconnesse (budget LiveKit R-3
  rispettato gratis).
- Il feed COMPLETAMENTE vuoto mantiene lo stato onesto esistente ("Nessun
  amico è in live ora") — il footer appare solo se `items.length > 0`.

## 6. Permessi & privacy — matrice (delta su live.md §13)

| Azione / Vista | Host | Co-host attivo | Amico (visibile) | Non-amico | Bloccato / Kickato |
|---|---|---|---|---|---|
| Vedere `viewer_count` (pilla 👁, feed, detail) | ✅ | ✅ | ✅ **(NUOVO)** | ❌ | ❌ |
| Vedere `like_count` (pilla ❤, detail) | ✅ | ✅ | ✅ **(NUOVO)** | ❌ | ❌ |
| Vedere `peak_viewers` | ✅ | ✅ | ❌ (invariato) | ❌ | ❌ |
| Inviare like (solo stato `live`) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Lista nominativa spettatori + kick | ✅ (solo host principale, invariato) | ❌ | ❌ | ❌ | ❌ |
| Vedere il cerchio "terminata" in striscia (<24h) | — (propria esclusa) | ✅ | ✅ | ❌ | ❌ |
| Scrivere `live_likes` direttamente | trigger-arbitrato: solo `(live_id, count)`, autore forzato | idem | idem | ❌ | ❌ |

Con `visibility='top_friends'`: come sempre, la colonna "Amico (visibile)"
vale solo per la cerchia dell'host principale (`can_see_live` invariato).

## 7. Questioni aperte (richiedono input del PO, NON bloccanti)

1. **QA-1 — Like→Aura**: in v1 i like NON toccano l'Aura. Se in futuro si
   vorrà un segnale ("live apprezzata"), servirà una formula anti-gaming
   (like distinti per utente, cap, rendimenti decrescenti) — NON sommare like
   grezzi illimitati.
2. **QA-2 — Pilla 👁 sulla preview del feed**: il `viewer_count` è nel payload
   del feed; mostrarlo sulla preview è a costo zero ma aggiunge un numero alla
   UI. Proposta: farlo (aiuta a capire il ranking). Validare col risultato
   visivo.

## 8. Architettura — delta rispetto a M12

### 8.1 Schema dati

**Colonna nuova su `lives`**: `like_count integer not null default 0` —
sincronizzata a delta, congelata a fine live (il sync salta le `ended`),
azzerata all'insert da `lives_before_write` v2.

**Tabella nuova `live_likes`** — una riga = un LOTTO di like:

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `uuid` PK `default gen_random_uuid()` | |
| `live_id` | `uuid not null` → `lives on delete cascade` | |
| `user_id` | `uuid not null` → `profiles on delete cascade` | forzato dal trigger |
| `count` | `integer not null check (count between 1 and 50)` | tap nel lotto |
| `created_at` | `timestamptz not null default now()` | forzato dal trigger |

Indici: btree(`live_id`, `created_at`) (finestra rate-limit + purge) ·
btree(`user_id`) (GDPR). **In pubblicazione `supabase_realtime`**
(postgres_changes + RLS, guardia idempotente — pattern LM0).

**RLS e grant**: `live_likes_select_visible` SELECT via
`can_see_live(live_id, auth.uid())` (serve al canale postgres_changes);
`live_likes_insert_own` INSERT `with check (user_id = auth.uid() and
is_active_user and can_see_live)`. Niente update/delete. Grant: revoke da
public+anon+authenticated, poi `grant select` + `grant insert (live_id,
count)` a authenticated (`user_id` FUORI dal grant, forzato dal trigger —
pattern `live_comments`).

**Trigger**:
- `live_likes_before_insert` — arbitro (§3.3).
- `sync_live_like_count` AFTER INSERT — `update public.lives set like_count =
  like_count + new.count where id = new.live_id and status <> 'ended'` (la
  guardia `status <> 'ended'` salta le live finite, stesso schema di
  `sync_live_viewer_count`; il BEFORE trigger `lives_before_write` lascia
  passare i contatori in UPDATE — non li forza a `old` — quindi il delta
  arriva). NESSUN trigger su DELETE (totale storico).
- `lives_before_write` **v2** — verbatim + UNA riga nel ramo INSERT:
  `new.like_count := 0;` (accanto a viewer_count/peak_viewers). Il ramo
  UPDATE resta INVARIATO (non deve forzare `like_count`).

### 8.2 RPC

- **`lives_feed` v3** — DROP della firma a 4 parametri, nuova firma:
  `lives_feed(p_top boolean default null, p_viewers integer default null,
  p_before timestamptz default null, p_before_id uuid default null,
  p_limit integer default 10) returns jsonb`. Corpo = v2 verbatim con:
  ordinamento §2; `viewer_count` nel sotto-select e nell'item payload;
  predicato keyset quaternario attivo solo se TUTTI i cursor-param sono
  non-null: `((y.is_top::int, y.viewer_count, y.started_at, y.id) <
  (p_top::int, p_viewers, p_before, p_before_id))`. Output invariato
  `{server_now, lives, has_more}`, item +1 campo. `rpc('lives_feed', {})`
  resta valido (tutti default = prima pagina). ⚠️ Il body (COMMENTI INCLUSI)
  non deve MAI citare `peak_viewers` (guardia prosrc pgTAP che resta in
  vigore).
- **`live_detail` v3** — verbatim v2 + spostamento: `viewer_count` e
  `like_count` entrano nel jsonb `live` base (tutti i visibili); il blocco
  `v_is_host or v_is_cohost` consegna SOLO `peak_viewers`.
- **`lives_strip()` returns jsonb** (nuova) — stable, definer,
  search_path=''. Guardia `not_authenticated`. Ritorna `{server_now,
  ended: [...]}` con item `{live_id, ended_at, host{user_id, username,
  display_name, avatar_url}}` (niente aura: il cerchio spento non la mostra).
  Filtri: `l.ended_at is not null and l.ended_at > now() - interval
  '24 hours'` · `p.deleted_at is null` · `l.host_id <> v_uid` ·
  `public.can_see_live(l.id, v_uid)`. Ordine `ended_at desc`, `limit 20`.
  Revoke + grant execute a authenticated.

### 8.3 Realtime

- **Like**: postgres_changes INSERT su `live_likes` filter
  `live_id=eq.{id}` — SECONDO listener sullo stesso canale client
  `live:{liveId}` dei commenti (un canale, un socket; volume bounded dal
  batching: ≤15 msg/10s per utente attivo). NESSUN evento inbox nuovo, NESSUN
  fan-out `live_fanout` per i like.
- **Striscia terminate**: nessun canale nuovo — l'evento `live_ended`
  sull'inbox privata (già gestito) INVALIDA la query strip; il refetch 60s e
  il filtro client 24h fanno il resto (snapshot-as-truth: i force-end cron non
  fanno fan-out, il refetch copre).

### 8.4 Lifecycle & GDPR

- **`expire_content` v9** = corpo v8 VERBATIM (incl. riconciliazione
  anti-drift viewer_count) + nel blocco purge-24h esistente:
  `delete from public.live_likes lk using public.lives l where lk.live_id =
  l.id and l.ended_at is not null and l.ended_at < now() - interval
  '24 hours'`. Le righe a 30 giorni cascano già con `lives`. Nessun job cron
  nuovo.
- **`process_account_deletion` v8** = corpo v7 VERBATIM +
  `delete from public.live_likes where user_id = v_uid` (accanto ai delete di
  live_comments/live_viewers/live_hosts). Commento nel corpo: `like_count`
  resta (aggregato anonimo, §3.5).
- **`gdpr-export` v6**: sezione `live_likes` accanto alle 4 sezioni live
  esistenti. → coda deploy owner.

### 8.5 Client RN (`mobile/`)

- **Tipi** (`src/types/supabase.ts`, a mano): item feed +`viewer_count:
  number`; detail +`viewer_count: number; like_count: number` top-level e
  `peak_viewers?: number` opzionale (solo host/co-host); nuovi
  `LivesStripRaw { server_now: string; ended: LiveStripEndedRaw[] }`,
  `LiveStripEndedRaw { live_id; ended_at; host{...} }`, `LiveLikeRow { id;
  live_id; user_id; count; created_at }`.
- **Dati** (`src/lib/live.ts`): cursore feed +`viewers: number` e
  `fetchLivesFeed` passa `p_viewers`; `fetchLivesStrip()`;
  `inviaLikeLive(liveId, count)` = insert diretta `supabase
  .from('live_likes').insert({live_id, count})` SENZA `.select()`
  (fire-and-forget arbitrato dal trigger, errori normalizzati a
  stringhe-codice).
- **Realtime** (`src/lib/live-realtime.ts`): `subscribeLiveComments` →
  `subscribeLiveRealtime(liveId, { onComment, onLike })`, stesso canale, due
  listener postgres_changes.
- **Store** (`src/store/liveStore.ts`): `LiveAmico` +`viewerCount: number`;
  `normalizzaLive` e `cursoreDaPagina` (+`viewers` dall'ultima riga RAW)
  aggiornati; i delta inbox non portano viewer_count → conservare il valore
  noto o 0 (lo snapshot riallinea — commento esplicito).
- **Hook nuovi**: `useLivesStrip` (query `['live', uid, 'strip']`, staleTime
  15s, refetch 60s in foreground, invalidazione su `live_ended`, filtro 24h
  con clock calibrato, dedup host attiva>terminata) · `useLiveLikes`
  (accumulo tap → flush 800ms → `inviaLikeLive`; contatore monotòno §3.2).
- **Componenti**: `LiveStrip` (prop `terminate`, unione attive+terminate,
  variante `LiveStripAvatarTerminata`, tap→profilo) · `FineFeedLive` (§5) ·
  `CuoreParticella` + `CuoriOverlay` (Reanimated, cap ~20 particelle,
  `pointerEvents="none"`) · `LiveSurface` (GestureDetector double-tap sul
  contenitore della griglia video, bottone cuore nel rail, pilla ❤, pilla 👁
  per tutti) · `LiveFeed` (monta strip + footer).
- **Niente outbox** (invariato): errori like scartati in silenzio.

### 8.6 Alternative considerate e SCARTATE (con motivo)

| Alternativa | Perché scartata |
|---|---|
| **Like via `realtime.send` (broadcast) senza tabella** | Nessuna persistenza → niente totale nello snapshot, niente riconciliazione al reconnect; l'inbox del progetto è per-utente, non per-live; il contatore richiederebbe comunque una scrittura server. |
| **Like via LiveKit data channel** | Gli spettatori hanno token subscribe-only; servirebbe `canPublishData` per tutti = canale non arbitrato che bypassa `is_active_user`/`can_see_live`/rate-limit e non lascia traccia anti-abuso. |
| **Una riga per tap (senza batching)** | Costo insert + realtime = tap×spettatori; a raffiche TikTok è insostenibile e non aggiunge nulla (i cuori altrui non si mostrano, RW-3a). |
| **RPC `send_like` invece dell'insert diretta** | Il pattern provato dei contenuti ad alta frequenza è insert+trigger (live_comments): meno round-trip logici, arbitro identico, RLS realtime gratis. |
| **Feed non paginato (tornare alla zero-arg)** | Regressione del debito F1 già pagato (AH-2/M13-P8). |
| **Cursore su snapshot server-side (stato di paginazione)** | Overengineering al volume di Terni; l'instabilità accettata + reconcile 60s bastano. |
| **Estendere `lives_feed` con l'array `ended` in prima pagina** | Shape dipendente dai parametri, sporca `idrataFeed` (le terminate NON devono entrare nel feed) e lega la striscia al cursore del feed. RPC dedicata più pulita. |
| **Item sentinella "fine" dentro i data del pager** | Inquina `keyExtractor`, i cast della viewability e `getItemLayout`; il footer full-height fa paging pulito gratis. |
| **Double-tap a timer manuale (pattern DropCard)** | Sul video serve la POSIZIONE del tap e la convivenza con overlay: `Gesture.Tap().numberOfTaps(2)` di RNGH (già in ViewerMedia) è più robusto e dà `e.x/e.y`. |

---

# PARTE II — PIANO DI IMPLEMENTAZIONE

## 9. Come usare questo piano

- **UNA milestone alla volta, su comando esplicito del PO** ("implementa lo
  step LRx"). Ogni milestone lascia il sistema coerente (mai stati intermedi
  rotti sul remoto).
- Backend-first (LR0–LR4), poi mobile (LR5–LR8), poi documenti (LR9). Il
  backend è SEMPRE retro-compatibile col client vecchio: firma `lives_feed`
  con default, `live_detail` additivo, `lives_strip` nuova → nessuna finestra
  di rottura durante il rollout.
- **Convenzioni comuni a ogni step backend**: migrazione
  `supabase/migrations/YYYYMMDDHHMMSS_*.sql` con header `=== … ===`;
  applicazione via **pooler** (Deno + postgres.js, CLI bloccata) con
  registrazione in `supabase_migrations.schema_migrations`; pgTAP esteso con
  `plan(N)` aggiornato e suite SUL REMOTO; smoke funzionale via pooler
  (impersonazione `request.jwt.claims` + `set local role authenticated`;
  ⚠️ claims settati PRIMA degli insert su `lives` — il trigger forza
  `host_id`); tipi TS a mano + `tsc --noEmit` pulito.

## 10. Stato attuale (fotografia al 2026-07-15)

- Backend: 68 migrazioni live sul remoto, pgTAP **575/575**. Dominio live
  M12 completo + fix M13 (viewer_count a delta, feed paginato) + M14
  (live_detail v2 co-host, reconnect guard, notifications realtime).
- Coda deploy owner preesistente: `send-push` v4 (+ storico). Questo modulo
  vi aggiunge `gdpr-export` v6.
- Mobile: Dev Build EAS in uso; una build nuova è già in coda per i fix M14 —
  le modifiche M15 sono JS-only (nessuna dipendenza nativa nuova: Reanimated
  e RNGH già installati) → niente build EAS aggiuntiva richiesta da M15.

## 11. Milestone

### LR0 — Backend: dominio like (`live_likes`)

- **Obiettivo**: il like illimitato-non-toggle esiste a DB con tutte le
  guardie, il contatore e il realtime.
- **Dipendenze**: nessuna (nessun enum nuovo → niente migrazione enum
  separata).
- **File**: `supabase/migrations/20260716120000_live_likes.sql` (migrazione
  69). Contenuto, in ordine:
  1. `alter table public.lives add column like_count integer not null
     default 0;`
  2. Tabella `live_likes` + indici (§8.1).
  3. `live_likes_before_insert` (§3.3) + trigger BEFORE INSERT.
  4. `sync_live_like_count` (§8.1) + trigger AFTER INSERT.
  5. `lives_before_write` v2 (verbatim + `new.like_count := 0;` nel ramo
     INSERT — ⚠️ il ramo UPDATE non va toccato).
  6. RLS: enable + le due policy (§8.1).
  7. Grant/revoke (§8.1) + revoke sulle due funzioni trigger nuove.
  8. Publication: guardia idempotente `supabase_realtime` + `live_likes`.
  - ⚠️ NON toccare qui il grant per-colonna di `lives` (arriva in LR1 con la
    decisione contatori completa). ⚠️ Niente token vietati dai prosrc-test nei
    commenti dei body.
- **Done when** (smoke pooler, 3 utenti: host, amico, estraneo):
  insert `{live_id, count}` da amico visibile passa e `like_count` incrementa
  del delta; respinti con lo specifico codice: estraneo/bloccato/kickato
  (`live_not_visible`), live in pausa (`live_not_likeable`), `count` 0/51
  (check), 16° insert nella finestra 10s (`rate_limited`), utente mutato
  (`user_not_active`); `user_id` spoofed viene sovrascritto; delete righe →
  `like_count` INVARIATO; INSERT ricevuto via postgres_changes dal visibile e
  NON dall'estraneo. pgTAP differito a LR4 (un solo aggiornamento di plan).
- **Rischi**: race like-vs-fine (insert validato su `live`, live termina prima
  del sync → il `where status <> 'ended'` salta l'update: riga presente ma non
  contata — discrepanza minima ACCETTATA); il rate-limit usa `count(*)` su
  finestra 10s con l'indice `(live_id, created_at)` — verificare il piano.

### LR1 — Backend: contatori pubblici + ranking (`lives_feed` v3, `live_detail` v3)

- **Obiettivo**: viewer_count pubblico a livello dati e nelle porte di
  lettura; ranking a engagement.
- **Dipendenze**: LR0 (`like_count` esiste).
- **File**: `supabase/migrations/20260716120100_live_contatori_pubblici.sql`
  (migrazione 70). Contenuto:
  1. `grant select (viewer_count, like_count) on public.lives to
     authenticated;` — ADDITIVO al grant per-colonna LM0. Header: citare il
     rovesciamento PO di R-04 per le live (2026-07-15) e che
     `peak_viewers`/`livekit_room_name` restano esclusi.
  2. `drop function public.lives_feed(boolean, timestamptz, uuid, integer);`
     + ricreazione v3 (§8.2, firma a 5 parametri).
  3. `live_detail` v3 (§8.2, `create or replace` — stessa firma).
  4. Revoke esplicito sulle firme nuove + grant a authenticated (lezione CM8).
- **Done when** (smoke pooler): prima pagina shape invariata +`viewer_count`;
  paginazione col cursore quaternario senza errori né righe perse su dati
  statici; ordina per `is_top desc, viewer_count desc` (verifica con 3 live a
  contatori diversi); spettatore riceve `viewer_count`+`like_count` da
  `live_detail` e NON `peak_viewers`; host/co-host ricevono anche
  `peak_viewers`; select diretta client di `lives.viewer_count` passa,
  `peak_viewers` fallisce (`permission denied`).
- **Rischi**: la traduzione del keyset quaternario tutto-desc (il confronto
  composito con `::int` sul boolean è il pattern già provato); duplicati/salti
  tra pagine sotto churn (accettati, §2); ⚠️ mai `peak_viewers` nel body.

### LR2 — Backend: `lives_strip()`

- **Obiettivo**: la porta di lettura delle terminate <24h.
- **Dipendenze**: nessuna funzionale (ordinata dopo LR1 per pulizia).
- **File**: `supabase/migrations/20260716120200_lives_strip.sql`
  (migrazione 71): funzione §8.2 + revoke/grant. Header: dichiarare
  l'INVARIANTE finestra 24h ↔ purge `live_viewers` (§1).
- **Done when** (smoke pooler): amico vede la terminata entro 24h con
  `ended_at` e identità host; a 24h+1s sparisce (retrodatare `ended_at`);
  kickato/bloccato/estraneo esclusi; la propria esclusa; `top_friends`
  rispettata (solo cerchia dell'host principale); anon → `not_authenticated`.
- **Rischi**: nessuno significativo (`can_see_live` già provato su ended).

### LR3 — Backend: lifecycle & GDPR

- **Obiettivo**: i like seguono l'effimerità del dominio e i diritti GDPR.
- **Dipendenze**: LR0.
- **File**: `supabase/migrations/20260716120300_live_likes_lifecycle.sql`
  (migrazione 72) + `supabase/functions/gdpr-export/index.ts`.
  1. `expire_content` **v9** = corpo **v8** VERBATIM (da `20260713140000…`,
     NON da v7!) + delete `live_likes` nel blocco purge-24h (§8.4).
  2. `process_account_deletion` **v8** = corpo v7 VERBATIM (da
     `20260711140000…`) + delete righe proprie + commento aggregato anonimo.
  3. `gdpr-export` v6 (sezione `live_likes`, header aggiornato) → coda deploy
     owner (CLI: serve `supabase login` con l'account televo.management2).
- **Done when**: live finita >24h fa non ha più righe like ma conserva
  `like_count` (smoke con `ended_at` retrodatato + chiamata `expire_content`
  via pooler); delete account rimuove le righe like dell'utente e lascia
  `like_count`; export (query della funzione testata via pooler) contiene la
  sezione; `cron.job_run_details` pulito al giro successivo.
- **Rischi**: v9/v8 sono redefinizioni verbatim di corpi LUNGHI — copiare
  dall'ULTIMA versione in vigore, mai riscrivere.

### LR4 — pgTAP: rovesciamenti + nuove invarianti

- **Obiettivo**: la suite riflette il nuovo contratto; UN solo aggiornamento
  coerente di `plan(N)` a valle delle 4 migrazioni.
- **Dipendenze**: LR0–LR3 applicate sul remoto.
- **File**: `supabase/tests/rls_smoke.test.sql`.
- **Test da ROVESCIARE** (righe attuali indicative):
  - ~1496: `not has_column_privilege(... 'viewer_count' ...)` →
    `has_column_privilege(...)`, descrizione "viewer_count PUBBLICO —
    decisione PO 2026-07-15, eccezione a R-04 per le live". Il gemello
    ~1498 su `peak_viewers` RESTA negativo. Aggiungere il positivo su
    `like_count`.
  - ~1807: `prosrc not like '%viewer_count%' and prosrc not like
    '%peak_viewers%'` → `prosrc like '%viewer_count%' and prosrc not like
    '%peak_viewers%'` ("lives_feed v3: ranking a engagement; peak resta
    privato").
  - test ordinamento lives_feed (~1803): estendere con
    `'%viewer_count desc%'`.
  - ~1834 (+ gemello live_detail v2 a ~1844): riscrivere — `viewer_count` e
    `like_count` fuori dal blocco condizionale; il ramo `is_host`/`is_cohost`
    consegna il SOLO `peak_viewers`.
  - Il test ~2059 (`expire_content`: riconciliazione `is distinct from`)
    RESTA valido su v9 (corpo v8 conservato).
- **Test NUOVI** (blocco `M15 · Rework live`, ~30 asserzioni):
  `live_likes` (has_table, RLS enabled, 2 policy, colonna `count` con check,
  grant insert per-colonna `(live_id, count)` e NON `user_id`, grant select,
  anon senza privilegi, indici, membership in `pg_publication_tables`);
  `live_likes_before_insert` (esiste, definer+search_path, prosrc:
  `is_active_user`, `'live'`, `can_see_live`, `15`, `10 seconds`,
  `between 1 and 50`); `sync_live_like_count` (prosrc: `like_count +
  new.count`, `status <> 'ended'`; trigger SOLO insert — nessun trigger
  update/delete); `lives_before_write` v2 (prosrc `like_count := 0`);
  `lives_feed` v3 (firma a 5 argomenti presente, vecchia firma ASSENTE,
  definer, grant authenticated/anon-no); `lives_strip` (esiste, definer,
  grant, prosrc: `24 hours`, `ended_at desc`, `can_see_live`);
  `expire_content` v9 (prosrc `live_likes`); `process_account_deletion` v8
  (prosrc `live_likes`).
- **Done when**: `plan(N)` esatto contato a implementazione (stima
  575 → ~605); suite verde SUL REMOTO via pooler; smoke funzionali LR0–LR3
  già eseguiti.
- **Rischi**: guardie prosrc vs commenti dei body (regola d'oro del repo).

### LR5 — Mobile: tipi + strato dati

- **Obiettivo**: contratti TS e wrapper allineati; store pronto per il cursore
  quaternario; canale realtime unico per commenti+like.
- **Dipendenze**: LR1, LR2 (shape server congelate).
- **File**: `mobile/src/types/supabase.ts`, `mobile/src/lib/live.ts`,
  `mobile/src/lib/live-realtime.ts`, `mobile/src/store/liveStore.ts`
  (dettaglio §8.5).
- **Done when**: `tsc --noEmit` + eslint verdi; feed e load-more funzionano
  col cursore quaternario (smoke in app con >10 live sintetiche o limit
  forzato); il canale `live:{id}` consegna sia commenti sia like (log).
- **Rischi**: il cursore va derivato dalla riga RAW verbatim (il numero
  intero non ha problemi di precisione; stesso principio dell'ISO per le
  date); aggiornare il call-site dei commenti in `useLive.ts` senza rompere il
  dedup per id esistente.

### LR6 — Mobile: striscia (terminate + tap profilo)

- **Obiettivo**: RW-1 completo.
- **Dipendenze**: LR2, LR5.
- **File**: nuovo `mobile/src/hooks/useLivesStrip.ts`;
  `mobile/src/components/live/LiveStrip.tsx` (prop `terminate`, variante
  `LiveStripAvatarTerminata` §1, tap → `dynamicRoutes.profiloUtente`);
  `mobile/src/components/live/LiveFeed.tsx` (monta l'hook e passa
  `terminate`; le terminate NON toccano `items` del pager).
- **Done when** (2 device o 2 account): attive prima, terminate poi;
  visivamente inequivocabili (niente rosso, niente pulse); tap terminata apre
  il profilo; sparizione a 24h (verificata con `ended_at` retrodatato via
  pooler); host che riapre entro 24h → solo il cerchio attivo; estranei mai
  presenti; `tsc`/eslint verdi.
- **Rischi**: layout con 0 attive e N terminate — oggi lo stato vuoto del
  feed è full-screen e NASCONDEREBBE la striscia: va spostato DENTRO il ramo
  con striscia quando esistono terminate (striscia sopra + vuoto sotto).

### LR7 — Mobile: fine feed

- **Obiettivo**: RW-5.
- **Dipendenze**: LR5 (per `hasMore` coerente); nessuna backend.
- **File**: nuovo `mobile/src/components/live/FineFeedLive.tsx` (§5, altezza
  via prop = la misura di `getItemLayout`); `LiveFeed.tsx`:
  `ListFooterComponent` reso solo se `!hasMore && items.length > 0`.
- **Done when**: swipe oltre l'ultima live snappa su una pagina piena di
  fine-feed; su quella pagina NESSUNA preview connessa (verifica dashboard
  LiveKit o log); con `has_more=true` il footer non appare e il load-more
  continua; feed vuoto → stato onesto invariato.
- **Rischi**: `maintainVisibleContentPosition` + footer visibile durante un
  prepend da delta `live_started` (caso raro; degradazione accettata = piccolo
  scroll).

### LR8 — Mobile: like TikTok + contatori pubblici in UI

- **Obiettivo**: RW-3 + RW-4 nello schermo live.
- **Dipendenze**: LR0, LR1, LR5.
- **File**: nuovo `mobile/src/hooks/useLiveLikes.ts` (§3.2); nuovi
  `mobile/src/components/live/CuoreParticella.tsx` + `CuoriOverlay.tsx`
  (Reanimated: translateY −80..−140 + scale 0.8→1.3 + fade ~900ms, jitter,
  cap ~20 con drop del più vecchio, `pointerEvents="none"`);
  `mobile/src/components/live/LiveSurface.tsx`: (a) `GestureDetector`
  (`Gesture.Tap().numberOfTaps(2)`) sul CONTENITORE RN della griglia video
  (non sulla view nativa), attivo solo `fase==='attiva' &&
  status==='live'` → `runOnJS`: `tap()` + spawn cuore a `(e.x, e.y)`;
  (b) bottone cuore nel rail (spettatori E host/co-host) → `tap()` + spawn
  presso il rail; (c) pilla ❤ `likeTotali` accanto alla pilla 👁, per TUTTI;
  (d) pilla 👁 visibile anche agli spettatori (+1 per sé se né host né
  co-host); la `ListaSpettatori` col kick resta solo host;
  `mobile/src/hooks/useLive.ts`: passaggio a `subscribeLiveRealtime`
  (canale condiviso), `likeCount` di snapshot esposto nell'api.
  Facoltativo (QA-2): pilla 👁 statica su `LiveFeedPage` col `viewerCount`
  del feed.
- **Done when** (2 device): double-tap ovunque sul video → cuore NEL punto
  del tap; raffica di tap = raffica di cuori, nessun toggle; il contatore ❤
  sale su ENTRAMBI i device quando uno dei due lika; i cuori altrui NON
  appaiono; in pausa niente like (gesto disattivato + server respinge); tutti
  gli overlay/controlli restano funzionanti (commenti, kick, co-live); pilla
  👁 visibile allo spettatore col numero giusto; `tsc`/eslint verdi.
- **Rischi**: gesture sopra SurfaceView Android (il detector va sul
  contenitore RN — pattern ViewerMedia; verificare on-device, memoria M14:
  compositing SurfaceView con zOrder); spam visivo → cap particelle;
  sovrastima del display se un lotto viene scartato per rate-limit (accettata,
  §3.2 — si risana solo se il totale reale supera).

### LR9 — Documenti & chiusura modulo

- **Obiettivo**: le decisioni PO diventano verità documentale; il modulo si
  chiude.
- **Dipendenze**: tutte.
- **File e modifiche**:
  - `docs/live/live.md`: §0.2 (contatori pubblici viewer/like in-scope con
    decisione PO datata; "le live finite spariscono" → formula §0.3 di questo
    doc); §1/§1.2 (vincolo contatori riscritto: pubblici per le live,
    `peak_viewers` privato, drops intoccati); §5 (viewer count pubblico); §6
    o nuova §6-bis (like: batching, rate-limit, realtime, retention); §7
    (striscia con terminate + ranking engagement + fine feed); §13 (matrice:
    righe nuove §6 di questo doc); §15.1/§15.2/§15.4/§15.5 (schema, RPC,
    realtime, lifecycle aggiornati); Revision history (Rev. 2 → M15).
  - `CLAUDE.md`: §4 (nuova voce M15 con migrazioni 69–72 e decisioni RW);
    §6 (regola d'oro contatori: eccezione live esplicita, PO 2026-07-15).
  - `roadmap.md`: entry M15 (fatto + coda owner `gdpr-export` v6).
  - `docs/live/MANUAL-TESTING.md`: nuova sezione (scenari 2 device:
    double-tap→cuore nel punto, contatore cross-device, cuori altrui
    invisibili, pausa blocca like, striscia terminata→profilo e sparizione
    24h simulata, fine feed che snappa, pilla 👁 da spettatore, rate-limit
    con raffica prolungata).
  - Memoria di progetto aggiornata.
- **Done when**: documenti coerenti tra loro (nessuna regola contraddetta);
  MANUAL-TESTING eseguito su 2 device reali; commit per blocco secondo la
  convenzione del repo.

## 12. Ordine e razionale

```
LR0 ──► LR1 ──► LR2 ──► LR3 ──► LR4 ──► LR5 ──► LR6 ──► LR7 ──► LR8 ──► LR9
likes   feed+   strip   cron+   pgTAP   tipi+   striscia fine   cuori+  docs
dominio grant           GDPR            dati            feed    counter
└──────────────── backend puro ───────┘ └───────── frontend ──────────┘
```

Backend-first come M6/M7/M12: LR0–LR4 sono invisibili al client vecchio e
lasciano il remoto coerente a ogni passo (firme retro-compatibili). LR6 e LR7
sono parallelizzabili dopo LR5. Il deploy owner (`gdpr-export` v6) non blocca
nulla (l'export degrada: sezione assente finché non deployata).

## 13. Definition of Done — modulo M15

- Un estraneo/bloccato/kickato non vede NULLA di nuovo (strip, like,
  contatori): pgTAP + smoke 2 utenti.
- Like: illimitati percepiti, bounded a DB (batch ≤50 × 15 insert/10s);
  arbitro server completo; contatore mai decrescente; purge 24h; GDPR
  export/delete coperti.
- Contatori: `viewer_count`/`like_count` pubblici ai visibili OVUNQUE
  coerenti (grant, feed, detail, UI); `peak_viewers` e lista
  spettatori/kick privati come prima.
- Ranking: Best Friends primi, poi `viewer_count` desc — verificato con dati
  reali; keyset funzionante; `rpc('lives_feed', {})` legacy ancora valido.
- Striscia: attive→terminate, sparizione 24h su clock calibrato,
  tap→profilo; nessun replay possibile da nessun percorso.
- Fine feed presente e budget R-3 rispettato (footer = zero connessioni).
- pgTAP verdi SUL REMOTO con i test R-04 rovesciati SOLO per le live;
  documenti allineati; MANUAL-TESTING su 2 device.

## 14. Rischi trasversali

1. **R-1 — Keyset instabile** (viewer_count volatile): duplicati/salti tra
   pagine sotto churn — accettato (dedup client + reconcile 60s); documentato
   in §2.
2. **R-2 — Accoppiamento flush 800ms ↔ rate-limit 15/10s**: commento
   obbligatorio su ENTRAMBI i lati (trigger SQL e `useLiveLikes`).
3. **R-3 — Corsa like-vs-fine**: lotto scartato o non contato (guardia
   `status <> 'ended'`) — discrepanze minime accettate.
4. **R-4 — `like_count` che sopravvive a purge/GDPR**: aggregato anonimo,
   muore coi 30 giorni della riga `lives` — motivazione scritta in migrazione
   e in live.md.
5. **R-5 — Identità del liker nel payload realtime**: tecnicamente visibile
   ai membri del canale (come i commenti); la UI non la mostra — trade-off
   accettato e documentato.
6. **R-6 — Guardie prosrc**: mai citare `peak_viewers` nel body (commenti
   inclusi) di `lives_feed` v3; regola generale del repo sui token legacy.
7. **R-7 — Budget realtime**: nessun canale nuovo; volume like bounded dal
   batching. Monitorare comunque il dashboard Supabase Realtime al lancio.
8. **R-8 — Gesture sopra SurfaceView (Android)**: detector sul contenitore
   RN; verificare su device reale (lezioni M14 sul compositing SurfaceView).
9. **R-9 — Coda deploy owner** che si allunga (`gdpr-export` v6): tracciata
   in roadmap, non bloccante.

## Revision history

| Rev | Data | Cosa |
|-----|------|------|
| 1 | 2026-07-15 | Prima stesura: decisioni RW-1..RW-5 validate dal PO in sessione (incl. tap terminata→profilo, cuori solo propri, contatore like pubblico); spec + piano LR0–LR9. |
