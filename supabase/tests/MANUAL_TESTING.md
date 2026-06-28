# Televo — Test manuale del backend (senza frontend)

Da eseguire quando il progetto Supabase hosted è collegato (`supabase link`).
Sostituisci `<PROJECT_REF>`, `<ANON_KEY>` e gli altri valori con i tuoi.

## 0. Applicare schema e funzioni

```bash
supabase db push                       # applica le migrazioni
supabase secrets set --env-file .env   # carica i secret (LiveKit, CRON_SECRET...)
supabase functions deploy              # deploya verify-invite, livekit-token, aura-recompute
```

## 1. pgTAP — invarianti struttura/RLS

```bash
supabase test db
```
Atteso: tutti i test di `rls_smoke.test.sql` verdi.

## 2. Signup + age-gate (>=16)

L'app cliente fa il signup passando `username` e `birth_date` nei metadati.
Esempio diretto via Auth REST (utente valido, 17 anni):

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/auth/v1/signup" \
  -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"email":"teen@example.com","password":"Password123",
       "data":{"username":"teen_terni","birth_date":"2009-01-01"}}'
```
Atteso: 200 con sessione. In DB nasce `profiles` + `profiles_private` (age_verified=false).

Caso **sotto i 16** (deve fallire):
```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/auth/v1/signup" \
  -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"email":"kid@example.com","password":"Password123",
       "data":{"username":"kid","birth_date":"2014-01-01"}}'
```
Atteso: errore (il trigger blocca: "Devi avere almeno 16 anni").

## 3. Redenzione invito (attiva l'account)

Usa l'`access_token` ottenuto al passo 2:
```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/verify-invite" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"code":"TERNI-GALILEI-2026"}'
```
Atteso: `{ "ok": true, "school_id": "...", "age_verified": true }`.
Riprova con `TEST-EXPIRED` → `invite_expired`; con codice inesistente → `invite_invalid`.

## 4. Token LiveKit (dopo aver creato/joined una stanza)

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/livekit-token" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"room_id":"<ROOM_UUID>"}'
```
Atteso: `{ token, ws_url, room, identity, can_publish }`.
`can_publish=true` se sei host/speaker, `false` se listener. Non-membro di stanza
privata → `forbidden`.

## 5. Ricalcolo Aura manuale

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/aura-recompute" \
  -H "x-cron-secret: <CRON_SECRET>"
```
Atteso: `{ "ok": true }`. Senza header corretto → 401.

## Note
- Test locali delle funzioni: `supabase functions serve` + le stesse curl verso
  `http://127.0.0.1:54321/functions/v1/...`.
- Lo scheduling (aura recompute, spotlight, expire) gira via pg_cron: per
  forzarlo a mano, esegui `select public.recompute_aura();` /
  `select public.rotate_spotlight();` / `select public.expire_content();`.
