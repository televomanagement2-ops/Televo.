-- =============================================================================
-- Televo — Drops M6 (DM7): "Drop del giorno" (prompt curato + notifica dosata)
-- =============================================================================
-- Feature §16.2 di docs/media/drop.md, costruita su decisione del product owner
-- (2026-07-06). Dà il "perché proprio ora" di BeReal SENZA la sua ansia da timer:
-- ogni giorno un tema curato (in italiano) compare come banner nel composer (S2)
-- e, a un orario SEMI-RANDOM del pomeriggio, parte UNA notifica broadcast che
-- invita a condividere. Rispondere è opzionale e NON scade → coerente con il
-- pilastro anti-doomscroll.
--
-- Scelte (best practice 2026, D-5):
--  · Catalogo `drop_prompts` (testi curati) + pick giornaliero `drop_prompt_of_day`
--    con rotazione LRU (meno-recentemente-usato, poi casuale) → niente ripetizioni.
--  · Il giorno è quello PERCEPITO dagli utenti: `Europe/Rome` (il resto del
--    backend usa UTC, ma "il tema di OGGI" è un concetto di giornata umana).
--  · Orario di invio semi-random ma DETERMINISTICO per giorno: scelto UNA volta al
--    pick (`send_after`, 15:00–18:00 ora di Roma) → nessuna slot-machine, un solo
--    invio garantito (il primo tick del cron dopo `send_after`).
--  · Broadcast set-based (una sola INSERT, non un loop) verso i soli utenti attivi
--    (`is_active_user`: mai bannati/mutati/cancellati) → scalabile.
--  · Tabelle di SISTEMA: nessuna scrittura client, lettura del tema SOLO via RPC
--    SECURITY DEFINER `drop_prompt_today()`. RLS attiva senza policy (pattern
--    audit_log/storage_cleanup_queue): difesa in profondità.
--
-- Consegna push: pipeline esistente (notifications → dispatch_push → send-push),
-- nessun canale nuovo. L'enum 'drop_prompt' è già committato (…140000_enum).

-- =============================================================================
-- 1. Catalogo dei temi curati. Solo il sistema scrive (nessun grant a client).
-- =============================================================================
create table public.drop_prompts (
  id           uuid primary key default gen_random_uuid(),
  body         text        not null,                 -- il testo del tema (italiano)
  is_active    boolean     not null default true,    -- disattivabile senza cancellare
  last_used_on date,                                  -- rotazione LRU (null = mai usato)
  created_at   timestamptz not null default now()
);

-- =============================================================================
-- 2. Pick del giorno: una riga per data (Europe/Rome). `send_after` = orario
--    semi-random pomeridiano scelto al pick; `notified_at` = guard anti-doppio.
-- =============================================================================
create table public.drop_prompt_of_day (
  for_date    date        primary key,
  prompt_id   uuid        not null references public.drop_prompts (id),
  send_after  timestamptz not null,                  -- quando può partire la notifica
  chosen_at   timestamptz not null default now(),
  notified_at timestamptz                            -- valorizzato all'invio (una volta)
);

-- =============================================================================
-- 3. pick_drop_prompt_of_day — idempotente: garantisce il tema di OGGI (Roma).
--    Rotazione: prompt attivo meno-recentemente-usato, poi casuale. Calcola
--    l'orario di invio semi-random UNA sola volta. Invocata dal cron mattutino
--    (banner disponibile da subito) e come safety da notify_drop_prompt.
-- =============================================================================
create or replace function public.pick_drop_prompt_of_day()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today  date := (now() at time zone 'Europe/Rome')::date;
  v_prompt uuid;
  v_send   timestamptz;
begin
  -- Già scelto per oggi: no-op (idempotenza).
  if exists (select 1 from public.drop_prompt_of_day where for_date = v_today) then
    return;
  end if;

  -- Meno-recentemente-usato prima, poi casuale (anti-ripetizione a rotazione).
  select id into v_prompt
  from public.drop_prompts
  where is_active
  order by last_used_on asc nulls first, random()
  limit 1;

  if v_prompt is null then return; end if;  -- nessun prompt attivo: no-op silenzioso

  -- Orario semi-random nel pomeriggio (15:00–18:00 ora di Roma), fissato ora.
  v_send := ((v_today::timestamp + time '15:00') + (random() * interval '3 hours'))
            at time zone 'Europe/Rome';

  insert into public.drop_prompt_of_day (for_date, prompt_id, send_after)
  values (v_today, v_prompt, v_send)
  on conflict (for_date) do nothing;

  update public.drop_prompts set last_used_on = v_today where id = v_prompt;
end;
$$;

-- =============================================================================
-- 4. notify_drop_prompt — invocata dal cron pomeridiano. Invia UNA volta al
--    giorno, dopo `send_after`, a tutti gli utenti attivi. Guard atomico
--    anti-doppio invio (due tick concorrenti): marca `notified_at` PRIMA e
--    procede solo se ha vinto la corsa.
-- =============================================================================
create or replace function public.notify_drop_prompt()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_row   public.drop_prompt_of_day%rowtype;
  v_body  text;
begin
  -- Safety: se il cron mattutino non ha ancora scelto il tema, scegli ora.
  perform public.pick_drop_prompt_of_day();

  select * into v_row from public.drop_prompt_of_day where for_date = v_today;
  if v_row.for_date  is null      then return; end if;  -- nessun tema oggi
  if v_row.notified_at is not null then return; end if;  -- già inviato oggi
  if now() < v_row.send_after     then return; end if;   -- non ancora l'orario

  -- Guard atomico: vince un solo tick (gli altri escono con NOT FOUND).
  update public.drop_prompt_of_day
  set notified_at = now()
  where for_date = v_today and notified_at is null;
  if not found then return; end if;

  select body into v_body from public.drop_prompts where id = v_row.prompt_id;

  -- Broadcast set-based (scalabile): mai a bannati/mutati/cancellati. Titolo con
  -- il tema, payload col prompt per il deep link al composer (S2).
  insert into public.notifications (user_id, type, title, body, payload)
  select p.id, 'drop_prompt',
         'Il tema di oggi ✨',
         v_body,
         jsonb_build_object('prompt_id', v_row.prompt_id)
  from public.profiles p
  where p.deleted_at is null
    and public.is_active_user(p.id);
end;
$$;

-- =============================================================================
-- 5. drop_prompt_today — lettura del tema di oggi per il banner del composer.
--    SECURITY DEFINER (le tabelle di sistema non hanno grant client). Ritorna
--    jsonb {id, body, for_date} oppure null se oggi non c'è tema.
-- =============================================================================
create or replace function public.drop_prompt_today()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_res   jsonb;
begin
  select jsonb_build_object('id', p.id, 'body', p.body, 'for_date', d.for_date)
  into v_res
  from public.drop_prompt_of_day d
  join public.drop_prompts p on p.id = d.prompt_id
  where d.for_date = v_today;
  return v_res;  -- null se nessun tema per oggi
end;
$$;

-- =============================================================================
-- 6. Grants & RLS. Tabelle di sistema: revoke all, RLS senza policy (difesa in
--    profondità). Client: SOLO execute su drop_prompt_today; pick/notify sono
--    per il cron (nessun grant a client).
-- =============================================================================
alter table public.drop_prompts       enable row level security;
alter table public.drop_prompt_of_day enable row level security;
revoke all on public.drop_prompts       from anon, authenticated;
revoke all on public.drop_prompt_of_day from anon, authenticated;

-- NB: revoke da public NON basta — i DEFAULT PRIVILEGES del progetto concedono
-- EXECUTE a anon/authenticated su ogni nuova funzione (scoperta sistemica CM8):
-- vanno revocati ESPLICITAMENTE, altrimenti il client potrebbe scatenare il pick
-- o il broadcast. La cron gira come owner (postgres): la revoca non la tocca.
revoke all on function public.pick_drop_prompt_of_day() from public, anon, authenticated;
revoke all on function public.notify_drop_prompt()      from public, anon, authenticated;
revoke all on function public.drop_prompt_today()       from public, anon, authenticated;
grant execute on function public.drop_prompt_today() to authenticated;

-- =============================================================================
-- 7. Scheduling (pg_cron). cron.schedule fa upsert per jobname (idempotente).
--    · pick alle 00:05 UTC: il banner ha il tema fin dal mattino.
--    · notify ogni 15 min in finestra 13:00–18:59 UTC (copre 15:00–18:00 Roma sia
--      in CEST sia in CET); notify_drop_prompt si auto-gata su send_after.
-- =============================================================================
select cron.schedule(
  'drop-prompt-pick-daily',
  '5 0 * * *',
  $$ select public.pick_drop_prompt_of_day(); $$
);
select cron.schedule(
  'drop-prompt-notify',
  '*/15 13-18 * * *',
  $$ select public.notify_drop_prompt(); $$
);

-- =============================================================================
-- 8. Seed dei temi curati (italiano, tono Televo: voce-first, autentico, gentile,
--    anti-vanity). Editabili/estendibili liberamente (is_active per il ricambio).
--    Guardia: seed solo se il catalogo è vuoto (ri-applicazione sicura).
-- =============================================================================
insert into public.drop_prompts (body)
select body from (values
  ('Fai sentire la tua voce: com''è andata oggi? 🎙️'),
  ('Una piccola cosa che ti ha fatto sorridere.'),
  ('Il posto dove sei ora, senza filtri. 📷'),
  ('Che canzone hai in testa? Cantane un pezzo. 🎶'),
  ('Racconta un gesto gentile che hai visto o ricevuto.'),
  ('Una cosa nuova che hai imparato questa settimana.'),
  ('Manda un saluto vocale a chi ti manca. 💛'),
  ('Il tuo comfort food del momento.'),
  ('Una foto di qualcosa di bello che di solito nessuno nota.'),
  ('Di'' una cosa di cui vai fiero/a, anche piccola.'),
  ('La cosa più divertente che ti è successa oggi. 😂'),
  ('Un consiglio che daresti al te di un anno fa.'),
  ('Che tempo fa dalle tue parti? Faccelo vedere. 🌤️'),
  ('Un suono del tuo pomeriggio: registra e condividi. 🎧'),
  ('Ringrazia qualcuno, ad alta voce.'),
  ('Cosa stai ascoltando, guardando o leggendo in questo momento?'),
  ('Una cosa che non vedi l''ora di fare.'),
  ('Il tuo angolo preferito di casa. 🏠'),
  ('Racconta un momento in cui ti sei sentito/a accolto/a.'),
  ('Descrivi il tuo umore con un solo suono. 🔊'),
  ('Una foto che riassume la tua giornata in un''immagine.'),
  ('Chi ti ha fatto ridere di recente? Digli grazie.'),
  ('La cosa più buona che hai mangiato oggi. 🍝'),
  ('Un pensiero al volo, senza pensarci troppo.')
) as s(body)
where not exists (select 1 from public.drop_prompts);

-- Semina subito il tema di oggi (così il banner è disponibile senza attendere il
-- primo cron). Idempotente: no-op se già scelto.
select public.pick_drop_prompt_of_day();
