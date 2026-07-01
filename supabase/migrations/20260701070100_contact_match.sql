-- =============================================================================
-- Televo — Rubrica: "I tuoi contatti su Televo" (SRS §3.9 / §10.1, D1) — SENSIBILE
-- =============================================================================
-- 🔴 Feature ad alto rischio (minori + GDPR). Qui c'è lo SCHEMA conservativo; le
-- regole di scopribilità sono volutamente restrittive di default (vedi sotto) e
-- vanno CONFERMATE con il product owner prima di allentarle o di rilasciare.
--
-- Principi (non negoziabili):
--   • La rubrica non lascia MAI il device in chiaro: si confrontano solo HASH.
--   • L'identificatore di contatto NON torna nell'auth (il telefono fu rimosso):
--     l'utente registra opt-in un hash del proprio numero/email in tabella dedicata.
--   • Consenso GDPR ('contacts_sync') OBBLIGATORIO prima di registrare/matchare.
--   • Un MINORE non è scopribile da estranei: appare solo a chi è già suo amico.
--     Un adulto opt-in è scopribile da chiunque possieda il suo contatto.
--
-- Modello hash MVP: SHA-256 del contatto NORMALIZZATO lato client (numero in E.164 /
-- email lowercase). Un pepe server-side aumenterebbe la resistenza al brute-force ma
-- complica il match (l'hash è deterministico su entrambi i lati): rimandato come
-- affinamento. LIMITE NOTO documentato.

-- -----------------------------------------------------------------------------
-- contact_hashes — l'hash del PROPRIO contatto (opt-in). Un solo hash per (utente,
-- tipo). Nessuna lettura diretta: si interroga solo via RPC match_contacts.
-- -----------------------------------------------------------------------------
create table public.contact_hashes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('phone', 'email')),
  hash       text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind)
);

-- Il match confronta per hash: indice sull'hash (uno per tipo).
create index contact_hashes_hash_idx on public.contact_hashes (hash);

-- -----------------------------------------------------------------------------
-- Helper: consenso 'contacts_sync' attivo per l'utente?
-- -----------------------------------------------------------------------------
create or replace function public.has_contacts_consent(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.consents c
    where c.user_id = uid
      and c.consent_type = 'contacts_sync'
      and c.granted_at is not null
      and c.revoked_at is null
  );
$$;

-- -----------------------------------------------------------------------------
-- RPC: registra/aggiorna l'hash del proprio contatto (richiede consenso).
-- -----------------------------------------------------------------------------
create or replace function public.register_contact_hash(p_kind text, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('phone', 'email') then raise exception 'invalid_kind'; end if;
  if p_hash is null or length(p_hash) < 32 then raise exception 'invalid_hash'; end if;
  if not public.has_contacts_consent(v_uid) then raise exception 'consent_required'; end if;

  insert into public.contact_hashes (user_id, kind, hash)
  values (v_uid, p_kind, p_hash)
  on conflict (user_id, kind) do update set hash = excluded.hash, created_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: confronta gli hash della rubrica con gli utenti Televo scopribili.
-- Ritorna SOLO gli utenti che (a) hanno un hash corrispondente E (b) sono
-- scopribili dal richiedente secondo la regola di safety minori.
-- Cap sull'array (batch dal client) per limitare l'enumeration.
-- -----------------------------------------------------------------------------
create or replace function public.match_contacts(p_hashes text[])
returns table (user_id uuid, username text, avatar_url text)
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.has_contacts_consent(v_uid) then raise exception 'consent_required'; end if;
  if p_hashes is null then return; end if;
  if array_length(p_hashes, 1) > 1000 then raise exception 'too_many_hashes'; end if;

  return query
  select p.id, p.username::text, p.avatar_url
  from public.contact_hashes ch
  join public.profiles p on p.id = ch.user_id and p.deleted_at is null
  where ch.hash = any (p_hashes)
    and p.id <> v_uid
    -- Safety minori: un minore appare solo a chi è già suo amico; un adulto opt-in
    -- è scopribile da chiunque possieda il suo contatto (regola DEFAULT, da confermare).
    and (public.is_adult(p.id) or public.are_friends(v_uid, p.id))
    -- Mai suggerire utenti in blocco reciproco.
    and not public.is_blocked_pair(v_uid, p.id)
  group by p.id, p.username, p.avatar_url;
end;
$$;

-- =============================================================================
-- Grants (nessuna lettura diretta di contact_hashes: solo via RPC)
-- =============================================================================
revoke all on function public.register_contact_hash(text, text) from public;
revoke all on function public.match_contacts(text[]) from public;
grant execute on function public.register_contact_hash(text, text) to authenticated;
grant execute on function public.match_contacts(text[]) to authenticated;

-- =============================================================================
-- Row Level Security — owner-only in scrittura; nessuna policy di lettura
-- (l'unico accesso è via match_contacts, SECURITY DEFINER).
-- =============================================================================
alter table public.contact_hashes enable row level security;
-- Nessuna policy `select`: gli utenti non leggono la tabella direttamente. La
-- scrittura passa da register_contact_hash (SECURITY DEFINER). RLS attiva senza
-- policy = tabella non interrogabile da `authenticated` (pattern audit_log).
