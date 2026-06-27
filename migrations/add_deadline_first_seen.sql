-- migrations/add_deadline_first_seen.sql
--
-- Run this MANUALLY in the Supabase SQL editor. Do not run automatically.
--
-- NOTE ON CURRENT SCHEMA:
-- The base schema (schema.sql) ALREADY defines these columns on `grants`:
--     deadline       date
--     first_seen     timestamptz default now()
--     digest_sent_at timestamptz          <-- serves as the "last_sent" timestamp
--
-- This migration is therefore defensive and idempotent: it only adds the columns
-- on older deployments whose `grants` table predates them. On a table created from
-- the current schema.sql it is a no-op.
--
-- "deadline" already exists under that exact name (no rename needed).
-- "last_sent" is not added as a new column: digest_sent_at already records when a
-- grant was last included in a digest, and the agent updates it on every send
-- (both brand-new and resurfaced grants). Adding a second column would duplicate it.

alter table grants add column if not exists deadline   date;
alter table grants add column if not exists first_seen  timestamptz default now();

-- Backfill first_seen for any pre-existing rows that somehow have a null value.
update grants set first_seen = now() where first_seen is null;

-- Indexes used by the time-bounded dedup (first_seen) and deadline sorting.
create index if not exists grants_deadline_idx   on grants (deadline);
create index if not exists grants_first_seen_idx on grants (first_seen);
