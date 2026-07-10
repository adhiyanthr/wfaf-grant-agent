-- migrations/platform_v1.sql
--
-- Run this MANUALLY in the Supabase SQL editor for project ujixxuvfpuykcmzcebmg.
-- Do NOT run automatically. Idempotent: safe to run multiple times.
--
-- Turns the email-only agent into a web platform (GrantEquity Platform v1):
--   * `organizations` gains richer profile columns + an auth_user_id link so a
--     Supabase Auth user can own its org row.
--   * `grants` gains full eligibility text + a content hash (cache / skip re-score).
--   * `org_grants` (= "matches") gains a surrogate id for /matches/:id deep-links,
--     richer fit outputs (reasoning / eligibility flags / effort), a status
--     workflow, a re-score cache key, and data-confidence flags for the
--     full-text-vs-snippet fallback.
--   * `match_feedback` (new) collects per-status "why" notes for a future dataset.
--   * RLS: authenticated users see/edit only their own org + its matches; grants
--     catalog is readable by any authenticated user. Anon INSERT on organizations
--     (the public signup form) is preserved. The cron uses the service-role key,
--     which bypasses RLS.
--   * claim_org(): first-login RPC that links an org row to the Auth user by email.
--
-- Extends: per_org_engine.sql (org_grants), organizations_rls.sql (anon insert),
-- add_org_id.sql / add_deadline_first_seen.sql (guarded-constraint idioms).

-- ===========================================================================
-- 1. organizations: richer profile + auth link
-- ===========================================================================
alter table organizations add column if not exists mission_text  text;
alter table organizations add column if not exists programs_text text;
alter table organizations add column if not exists budget_range  text;
alter table organizations add column if not exists geo_focus     text;
-- org_status: 501c3 | fiscal_sponsor | pending | unknown
alter table organizations add column if not exists org_status    text;
alter table organizations add column if not exists founded_year  int;
-- Links the Supabase Auth user that owns this org row (set by claim_org()).
alter table organizations add column if not exists auth_user_id  uuid;

-- Backfill the richer columns from the older intake-form columns where sensible,
-- only when the new column is still null (safe to re-run).
update organizations set mission_text = what_we_do
  where mission_text is null and what_we_do is not null;
update organizations set budget_range = annual_budget
  where budget_range is null and annual_budget is not null;
-- geo_focus: prefer "County, NJ" when a county exists, else the state.
update organizations set geo_focus =
  case
    when county is not null and county <> '' then county || ' County, ' || coalesce(nullif(state, ''), 'NJ')
    when state  is not null and state  <> '' then state
    else null
  end
  where geo_focus is null;
-- org_status from the boolean 501(c)(3) flag; unknown when the flag is null.
update organizations set org_status =
  case
    when is_501c3 is true  then '501c3'
    when is_501c3 is false then 'pending'
    else 'unknown'
  end
  where org_status is null;

-- One org row per Auth user (a login owns at most one org; single-org-per-account).
create unique index if not exists organizations_auth_user_id_idx
  on organizations (auth_user_id)
  where auth_user_id is not null;

-- ===========================================================================
-- 2. grants: full eligibility text + content hash for the cache
-- ===========================================================================
-- Never truncated (unlike the char-capped text fed to the model).
alter table grants add column if not exists full_eligibility_text text;
-- Content hash of full_eligibility_text -> skip re-scoring unchanged grants.
alter table grants add column if not exists eligibility_hash      text;

-- ===========================================================================
-- 3. org_grants (= "matches"): surrogate id, rich fit, status, cache, confidence
-- ===========================================================================
-- Surrogate key for /matches/:id deep-links. The PK stays the composite
-- (org_id, grant_id); this is an extra unique id. Volatile default backfills a
-- distinct uuid into every existing row on add.
alter table org_grants add column if not exists id uuid default gen_random_uuid();
-- Guard against a NULL slipping in on older Postgres / partial applies.
update org_grants set id = gen_random_uuid() where id is null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'org_grants_id_key') then
    alter table org_grants add constraint org_grants_id_key unique (id);
  end if;
end $$;
alter table org_grants alter column id set not null;
alter table org_grants alter column id set default gen_random_uuid();

alter table org_grants add column if not exists fit_reasoning     text;
alter table org_grants add column if not exists eligibility_flags jsonb default '[]'::jsonb;
-- effort_estimate: low | medium | high
alter table org_grants add column if not exists effort_estimate   text;
-- status: new | saved | dismissed | applied | won | rejected
alter table org_grants add column if not exists status            text default 'new';
alter table org_grants add column if not exists status_updated_at timestamptz;
-- The grants.eligibility_hash present when this match was last scored. Re-score
-- only when grants.eligibility_hash <> scored_hash.
alter table org_grants add column if not exists scored_hash       text;
-- data_confidence: full | partial. partial => scored off a search snippet, not
-- full page text; the reasoning is hedged accordingly.
alter table org_grants add column if not exists data_confidence   text default 'full';
-- Distinct from data_confidence: the page fetch failed for this grant. A future
-- fallback source (e.g. manual entry) could clear this without changing the
-- confidence already recorded on the match.
alter table org_grants add column if not exists eligibility_text_unavailable boolean default false;

-- Sort/filter support for the matches list.
create index if not exists org_grants_status_idx on org_grants (org_id, status);

-- ===========================================================================
-- 4. match_feedback (new): per-status "why" notes (collect-only this pass)
-- ===========================================================================
create table if not exists match_feedback (
  id          uuid        default gen_random_uuid() primary key,
  match_id    uuid        not null references org_grants (id) on delete cascade,
  status      text,
  note        text,
  created_at  timestamptz default now()
);

create index if not exists match_feedback_match_idx on match_feedback (match_id);

-- ===========================================================================
-- 5. RLS
-- ===========================================================================
-- Helper: is the given org_id owned by the current Auth user? SECURITY DEFINER
-- so the policy can resolve ownership without the caller holding SELECT on all
-- organizations rows. STABLE: depends only on auth.uid() within a statement.
create or replace function public.owns_org(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organizations
    where id = target_org and auth_user_id = auth.uid()
  );
$$;

-- --- organizations -------------------------------------------------------
alter table organizations enable row level security;

-- Preserve the public signup form's anon INSERT (from organizations_rls.sql).
drop policy if exists "anon can insert organizations" on organizations;
create policy "anon can insert organizations"
  on organizations for insert to anon with check (true);

drop policy if exists "owner can select own org" on organizations;
create policy "owner can select own org"
  on organizations for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "owner can update own org" on organizations;
create policy "owner can update own org"
  on organizations for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- --- grants (non-sensitive catalog) --------------------------------------
alter table grants enable row level security;

drop policy if exists "authenticated can read grants" on grants;
create policy "authenticated can read grants"
  on grants for select to authenticated
  using (true);

-- --- org_grants (matches) ------------------------------------------------
alter table org_grants enable row level security;

drop policy if exists "owner can select own matches" on org_grants;
create policy "owner can select own matches"
  on org_grants for select to authenticated
  using (owns_org(org_id));

drop policy if exists "owner can update own matches" on org_grants;
create policy "owner can update own matches"
  on org_grants for update to authenticated
  using (owns_org(org_id))
  with check (owns_org(org_id));

-- --- match_feedback ------------------------------------------------------
alter table match_feedback enable row level security;

drop policy if exists "owner can select own feedback" on match_feedback;
create policy "owner can select own feedback"
  on match_feedback for select to authenticated
  using (exists (
    select 1 from org_grants og
    where og.id = match_feedback.match_id and owns_org(og.org_id)
  ));

drop policy if exists "owner can insert own feedback" on match_feedback;
create policy "owner can insert own feedback"
  on match_feedback for insert to authenticated
  with check (exists (
    select 1 from org_grants og
    where og.id = match_feedback.match_id and owns_org(og.org_id)
  ));

-- ===========================================================================
-- 6. claim_org(): first-login link of an org row to the Auth user by email
-- ===========================================================================
-- On first login the SPA calls this once. It links the unclaimed organizations
-- row whose email matches the caller's Auth email. SECURITY DEFINER so it can
-- update a row the caller can't yet see (auth_user_id is still null, so RLS
-- would hide it). Only links rows that are still unclaimed. Returns the org id
-- that is now owned by the caller (already-claimed included), or null.
create or replace function public.claim_org()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  -- Already linked? Return it (idempotent).
  select id into claimed_id
    from organizations
    where auth_user_id = auth.uid()
    limit 1;
  if claimed_id is not null then
    return claimed_id;
  end if;

  -- Link the unclaimed row matching this user's email (case-insensitive).
  update organizations
    set auth_user_id = auth.uid()
    where auth_user_id is null
      and lower(email) = lower(auth.email())
    returning id into claimed_id;

  return claimed_id;
end;
$$;

grant execute on function public.claim_org() to authenticated;

-- ===========================================================================
-- 7. organizations.digest_recipients: extra emails that also get the digest
-- ===========================================================================
-- Additional recipients (beyond organizations.email) that receive the weekly
-- grant digest. Managed by the org owner in the Profile editor. The send loop
-- (src/email.js) expands the Resend `to:` list with these, de-duped against
-- organizations.email.
alter table organizations
  add column if not exists digest_recipients text[] default '{}'::text[];

-- ===========================================================================
-- 8. app_settings: single shared "site password" gate + misc app config
-- ===========================================================================
-- Small key/value store. Currently holds 'site_password_hash' — the SHA-256 hex
-- of the shared site password that gates the SPA before login. NOTE: this is a
-- SOFT gate (a shared secret checked in the browser), not real access control —
-- the anon SELECT policy below means a determined visitor can read the hash. Real
-- per-org data protection stays with Supabase Auth + RLS. We store only the hash,
-- never the plaintext password.
create table if not exists app_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz default now()
);

alter table app_settings enable row level security;

-- Anyone (even pre-login) can READ settings so the gate can verify the hash
-- before the user has authenticated.
drop policy if exists "anyone can read app_settings" on app_settings;
create policy "anyone can read app_settings"
  on app_settings for select to anon, authenticated using (true);

-- Only logged-in users can CHANGE settings (from the in-app Settings page).
drop policy if exists "authenticated can insert app_settings" on app_settings;
create policy "authenticated can insert app_settings"
  on app_settings for insert to authenticated with check (true);

drop policy if exists "authenticated can update app_settings" on app_settings;
create policy "authenticated can update app_settings"
  on app_settings for update to authenticated using (true) with check (true);

-- Seed a starting site password. Compute the hash of your chosen password, e.g.:
--   node -e "console.log(require('crypto').createHash('sha256').update('changeme').digest('hex'))"
-- then paste it below. Left as a no-op default hash of 'changeme' — CHANGE IT via
-- the in-app Settings page (or re-run this insert with your own hash).
insert into app_settings (key, value)
  values ('site_password_hash',
          '057ba03d6c44104863dc7361fe4578965d1887360f90a0895882e58a6248fc86')
  on conflict (key) do nothing;

-- ===========================================================================
-- Done. Verify:
--   select column_name from information_schema.columns
--     where table_name = 'org_grants' order by column_name;
--   select column_name from information_schema.columns
--     where table_name = 'organizations' and column_name = 'digest_recipients';
--   select * from app_settings;
--   select polname, tablename from pg_policies
--     where tablename in ('organizations','grants','org_grants','match_feedback','app_settings');
-- ===========================================================================
