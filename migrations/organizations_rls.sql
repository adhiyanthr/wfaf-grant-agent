-- Make the public intake form work.
-- Run this in the Supabase SQL editor for project ujixxuvfpuykcmzcebmg.
--
-- Problem: organizations has RLS enabled but no INSERT policy for the anon
-- role, so the browser form's insert is rejected with:
--   42501 "new row violates row-level security policy for table organizations"
--
-- This grants the anon role INSERT only. It does NOT grant SELECT, so org
-- emails stay private. The grant agent reads orgs with the service-role key,
-- which bypasses RLS.

alter table organizations enable row level security;

drop policy if exists "anon can insert organizations" on organizations;
create policy "anon can insert organizations"
  on organizations
  for insert
  to anon
  with check (true);

-- The form shows "You're already in" by catching unique-violation (23505) on
-- duplicate email. Ensure that constraint exists so duplicate signups are
-- rejected instead of creating duplicate rows (which the agent would email twice).
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_email_key'
  ) then
    alter table organizations add constraint organizations_email_key unique (email);
  end if;
end $$;
