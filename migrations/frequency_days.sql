-- migrations/frequency_days.sql
--
-- Run this MANUALLY in the Supabase SQL editor. Do not run automatically.
-- Idempotent: safe to run multiple times.
--
-- Adds a per-org refresh/email cadence. The weekly GitHub cron still fires once
-- a week (Monday), so this can only make an org receive grants/emails LESS often
-- than weekly, never more: the agent skips an org whose last_sent is newer than
-- (now - frequency_days). See src/index.js weekly loop.
--
-- Values the Settings UI writes: 7 (weekly), 14 (every 2 weeks), 30 (monthly).
-- Default 7 preserves today's behaviour for existing rows.
--
-- The email on/off toggle reuses the existing `active` column (also set false by
-- the unsubscribe link), so no new column is needed for that.

alter table organizations
  add column if not exists frequency_days integer not null default 7;

-- Backfill any NULLs just in case the column pre-existed without the default.
update organizations
  set frequency_days = 7
  where frequency_days is null;
