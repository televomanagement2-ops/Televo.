# Televo — Backend

Social network mobile-first per la Gen Z (16+), lancio invite-only a Terni.
Tre pilastri: **Proof of Human**, **Aura**, **anti-doomscroll by design**.

Questo repository contiene il **backend** (Supabase: database PostgreSQL, RLS, Edge Functions).
Il frontend (Expo / React Native) arriverà in `app/` in una fase successiva.

> Documento fondante dell'architettura: vedi il piano in `../.claude/plans/`.

---

## Struttura

```
televo/
  supabase/
    config.toml        # configurazione progetto + buckets + functions
    migrations/        # schema SQL versionato (applicato in ordine)
    functions/         # Edge Functions (Deno)
      _shared/         # utility condivise (cors, client, auth)
    tests/             # test RLS (pgTAP)
    seed.sql           # dati di test (scuole, inviti, utenti)
  .env.example         # template variabili d'ambiente
```

## Prerequisiti

- Node.js + npm (già presenti)
- Supabase CLI (`supabase --version`)
- Deno (per le Edge Functions)
- Docker Desktop **opzionale** (solo per lo stack Supabase locale completo)

## Setup (quando si crea il progetto hosted)

1. Crea un progetto su [supabase.com](https://supabase.com) — **regione EU (Frankfurt)** per GDPR.
2. `cp .env.example .env` e compila i valori (vedi sotto).
3. Collega la CLI al progetto:
   ```bash
   supabase link --project-ref <PROJECT_REF>
   ```
4. Applica le migrazioni:
   ```bash
   supabase db push
   ```
5. Carica i secret per le Edge Functions:
   ```bash
   supabase secrets set --env-file .env
   ```
6. Deploya le funzioni:
   ```bash
   supabase functions deploy
   ```

## Domini implementati (backend completo)

| Fase | Dominio | Tabelle/funzioni chiave |
|------|---------|--------------------------|
| 0-3  | Core, identità, inviti, Aura v1, Stanze Live | `profiles`, `profiles_private`, `invites`, `aura_events`, `rooms` |
| 4    | Social / Chat + **Aura v2** + Drops | `friendships`, `conversations`, `messages`, `streaks`, `drops`, `props`; `recompute_aura()` con **decadimento** (half-life 14gg) |
| 5    | Mappa Vibe (geo coarse, friends-only) | `live_presence`, `room_locations`, vista `vibe_map` (security_invoker) |
| 6    | Gamification & Notifiche | `achievements`, `user_achievements`, `devices`, `notifications`; Edge `send-push` |
| 7    | Moderazione & Safety | `moderators`, `reports`, `moderation_queue`, `moderation_actions`; Edge `moderate-text`; sanzioni `mute`/`ban` via `is_active_user()` |
| 8    | Economia Vibes (simbolica attiva, **Stripe inerte**) | `wallets`, `vibe_transactions`, `creator_earnings`; Edge `process-tip`, `create-vibe-purchase`, `stripe-webhook` |
| —    | GDPR (trasversale) | `consents`, `gdpr_requests`; Edge `gdpr-export`, `gdpr-delete`; retention hard-delete dopo 30gg |

### Edge Functions

| Funzione | `verify_jwt` | Note |
|----------|--------------|------|
| `verify-invite`, `livekit-token` | true | Fase 0-3 |
| `aura-recompute` | false | trigger ricalcolo (x-cron-secret) |
| `send-push` | false | invio push Expo (x-cron-secret); invocata da `dispatch_push` via pg_cron |
| `moderate-text` | true | Perspective API; **degrada con grazia** senza chiave |
| `process-tip` | true | tip **simbolico** attivo; reale → `stripe_not_configured` |
| `create-vibe-purchase`, `stripe-webhook` | true / false | inerti senza `STRIPE_*` (firma/idempotenza già pronte per il 2027) |
| `gdpr-export`, `gdpr-delete` | true | diritti art. 15 / 17 |

### Job pianificati (pg_cron)

`aura-recompute-weekly`, `spotlight-daily`, `expire-content` (5 min), `streak-rollover-daily`,
`dispatch-push-minutely`, `vibes-weekly-allowance`, `gdpr-retention-daily`.

### Segreti per le notifiche push (Vault)

`dispatch_push()` (cron) chiama la Edge `send-push` via **pg_net** leggendo i segreti da **Vault**.
Finché non sono presenti, è un **no-op sicuro** (nessun errore). Per attivarlo:

```sql
select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'edge_base_url');
select vault.create_secret('<SERVICE_ROLE_KEY>',                'service_role_key');
select vault.create_secret('<CRON_SECRET>',                     'cron_secret');
```

### Chiavi opzionali (il backend funziona anche senza)

- `PERSPECTIVE_API_KEY` — moderazione AI; assente → revisione umana.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — economia reale 18+; assenti → endpoint inerti.
- I consensi `tos`/`privacy` vanno registrati dall'app dopo il signup via RPC `record_consent`.

## Verifica (senza frontend)

- **Migrazioni**: `supabase db push` (hosted) o `supabase db reset` (locale con Docker).
- **RLS**: test pgTAP in `supabase/tests/` (`supabase test db`).
- **Edge Functions** in locale: `supabase functions serve` + chiamate `curl`.

## Sicurezza — regole d'oro

- `SERVICE_ROLE_KEY` e i secret LiveKit/Stripe vivono **solo** lato server (Edge Functions / Supabase secrets). Mai nel client.
- Token LiveKit e operazioni monetarie sono **sempre** firmati/eseguiti server-side.
- Verifica età **≥16** imposta lato server (`verify-invite`); `birth_date` isolata in `profiles_private`.
- Dati vocali dei minori in bucket **privati**: accesso ai soli membri della conversazione (RLS path-based).
- **DM solo tra amici accettati** (anti-molestie); blocchi reciproci a livello DB.
- **Posizione** sempre coarse (geohash 5), effimera, **friends-only**, opt-in (`share_location`).
- **Economia**: saldo reale gated **18+** a livello DB (trigger su `wallets` e `vibe_transactions`); i minori usano solo Vibes simboliche non monetizzabili.
- **Moderazione**: `mute`/`ban` disattivano la creazione di contenuti tramite `is_active_user()`; ogni azione è in `audit_log`.
- **GDPR**: export (art. 15) e cancellazione con anonimizzazione immediata + hard-delete dopo 30 giorni (art. 17).
