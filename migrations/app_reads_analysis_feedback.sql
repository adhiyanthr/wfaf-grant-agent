-- migrations/app_reads_analysis_feedback.sql
--
-- Run this MANUALLY in the Supabase SQL editor. Do not run automatically.
-- Idempotent: safe to run multiple times.
--
-- Makes the logged-in app real:
--   * org_grants gains richer AI analysis (eligibility_flags + structured analysis)
--     that the weekly agent writes and the match-detail page renders.
--   * match_feedback (ALREADY EXISTS live with only id/created_at/note — ALTER,
--     never CREATE) gains org/grant linkage and a response type so orgs can
--     tweak their matches and message GrantEquity from the app.
--   * RLS SELECT policies for the authenticated role: today RLS blocks ALL app
--     reads, so signed-in users can't even load their own org row.
--     The user<->org link is EMAIL equality (no user_id FK); compare lowercase
--     to dodge auth/intake case mismatches.

-- ---------------------------------------------------------------------------
-- 1. org_grants: richer per-org AI analysis
-- ---------------------------------------------------------------------------
alter table org_grants add column if not exists eligibility_flags text[] default '{}';
alter table org_grants add column if not exists analysis jsonb;  -- {"strengths":[...],"considerations":[...]}

-- ---------------------------------------------------------------------------
-- 2. match_feedback: linkage + response type (table exists live, skeletal)
-- ---------------------------------------------------------------------------
create table if not exists match_feedback (       -- no-op live; safety for fresh envs
  id         uuid        default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  note       text
);

-- Live drift: the pre-existing table has a dead `match_id uuid NOT NULL`
-- column (and a `status` column) from an older partial schema. Nothing writes
-- match_id, so the NOT NULL must go or every app insert fails with 23502.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'match_feedback' and column_name = 'match_id'
  ) then
    alter table match_feedback alter column match_id drop not null;
  end if;
end $$;

alter table match_feedback add column if not exists org_id   uuid references organizations (id) on delete cascade;
alter table match_feedback add column if not exists grant_id uuid references grants (id)        on delete set null;
alter table match_feedback add column if not exists response text;

-- CHECK constraint (ADD CONSTRAINT has no IF NOT EXISTS; drop/add pair keeps it idempotent)
alter table match_feedback drop constraint if exists match_feedback_response_check;
alter table match_feedback add constraint match_feedback_response_check
  check (response in ('not_relevant', 'already_applied', 'more_like_this', 'message'));

create index if not exists match_feedback_org_idx   on match_feedback (org_id, created_at desc);
create index if not exists match_feedback_grant_idx on match_feedback (org_id, grant_id);

-- ---------------------------------------------------------------------------
-- 3. Schema-drift guard: PostgREST embedded selects (org_grants -> grants /
--    organizations) need real FKs. No-ops when the FKs already exist.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'org_grants'::regclass
      and contype = 'f'
      and confrelid = 'grants'::regclass
  ) then
    alter table org_grants add constraint org_grants_grant_id_fkey
      foreign key (grant_id) references grants (id) on delete cascade;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'org_grants'::regclass
      and contype = 'f'
      and confrelid = 'organizations'::regclass
  ) then
    alter table org_grants add constraint org_grants_org_id_fkey
      foreign key (org_id) references organizations (id) on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. RLS: authenticated users read their own data; write their own feedback.
--    The weekly agent uses the service-role key and bypasses all of this.
-- ---------------------------------------------------------------------------
alter table organizations  enable row level security;
alter table grants         enable row level security;
alter table org_grants     enable row level security;
alter table match_feedback enable row level security;

drop policy if exists "authenticated read own organization" on organizations;
create policy "authenticated read own organization" on organizations
  for select to authenticated
  using (lower(email) = lower(auth.email()));

drop policy if exists "authenticated read own org_grants" on org_grants;
create policy "authenticated read own org_grants" on org_grants
  for select to authenticated
  using (org_id in (select id from organizations where lower(email) = lower(auth.email())));

drop policy if exists "authenticated read matched grants" on grants;
create policy "authenticated read matched grants" on grants
  for select to authenticated
  using (id in (
    select og.grant_id from org_grants og
    join organizations o on o.id = og.org_id
    where lower(o.email) = lower(auth.email())
  ));

drop policy if exists "authenticated insert own feedback" on match_feedback;
create policy "authenticated insert own feedback" on match_feedback
  for insert to authenticated
  with check (org_id in (select id from organizations where lower(email) = lower(auth.email())));

drop policy if exists "authenticated read own feedback" on match_feedback;
create policy "authenticated read own feedback" on match_feedback
  for select to authenticated
  using (org_id in (select id from organizations where lower(email) = lower(auth.email())));
