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

## Verifica (senza frontend)

- **Migrazioni**: `supabase db push` (hosted) o `supabase db reset` (locale con Docker).
- **RLS**: test pgTAP in `supabase/tests/`.
- **Edge Functions** in locale: `supabase functions serve` + chiamate `curl`.

## Sicurezza — regole d'oro

- `SERVICE_ROLE_KEY` e i secret LiveKit/Stripe vivono **solo** lato server (Edge Functions / Supabase secrets). Mai nel client.
- Token LiveKit e operazioni monetarie sono **sempre** firmati/eseguiti server-side.
- Verifica età **≥16** imposta lato server (`verify-invite`).
- Dati vocali dei minori in bucket **privati** con signed URL.
