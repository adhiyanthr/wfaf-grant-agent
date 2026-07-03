-- migrations/dashboard_token.sql
--
-- Run this MANUALLY in the Supabase SQL editor. Do not run automatically.
-- Idempotent: safe to run multiple times.
--
-- Adds a STATIC per-org dashboard token so an org can open its no-login
-- token-gated dashboard at /dashboard/<token>. Mirrors the existing
-- unsubscribe_token pattern (see per_org_engine.sql): a random uuid, unique,
-- indexed, backfilled for pre-existing rows. NOT regenerated per send — the
-- link stays stable so it can live in the email footer.
--
-- The token is looked up server-side ONLY (the `dashboard-view` edge function,
-- service-role key). It is never used with RLS / the anon key, so no anon
-- policy is added here on purpose.

alter table organizations
  add column if not exists dashboard_token uuid default gen_random_uuid();

-- Backfill rows that predate the column (the default only fires on insert).
update organizations
  set dashboard_token = gen_random_uuid()
  where dashboard_token is null;

-- The edge function looks an org up by this token; index + uniqueness help and
-- guarantee a token maps to at most one org.
create unique index if not exists organizations_dashboard_token_idx
  on organizations (dashboard_token);

-- Show WFAF's token after running (copy it into the dashboard URL to test).
-- Adjust the email if the Wagner Farm row uses a different address.
-- select id, name, email, dashboard_token from organizations
--   where lower(email) = lower('adhiyanth.r@gmail.com');
