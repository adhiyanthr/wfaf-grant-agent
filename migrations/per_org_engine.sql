-- migrations/per_org_engine.sql
--
-- Run this MANUALLY in the Supabase SQL editor. Do not run automatically.
-- Idempotent: safe to run multiple times.
--
-- Turns the single-org (WFAF) agent into a multi-org engine:
--   * `grants` stays a SHARED catalog (one row per unique url).
--   * `org_grants` records the per-org relationship (fit + dedup + sent status),
--     because the same grant can fit multiple orgs.
--   * `organizations` gains an unsubscribe token (CAN-SPAM) and an unsubscribed_at.
--   * `email_events` captures Resend open/click/delivery webhooks for engagement stats.
--
-- Assumes `organizations.id` is a uuid primary key (Supabase default). If your
-- organizations table uses a different id type, adjust org_grants.org_id and the
-- email_events.org_id column types to match before running.

-- ---------------------------------------------------------------------------
-- 1. organizations: unsubscribe support
-- ---------------------------------------------------------------------------
alter table organizations add column if not exists unsubscribe_token uuid default gen_random_uuid();
alter table organizations add column if not exists unsubscribed_at   timestamptz;

-- last_sent: when this org last received a digest. The agent orders active orgs
-- by it (getActiveOrgs) and writes it after every send (markGrantsSent). The
-- signup table does not include it, so add it here.
alter table organizations add column if not exists last_sent timestamptz;

-- Backfill tokens for rows that predate the column (the default only fires on insert).
update organizations set unsubscribe_token = gen_random_uuid() where unsubscribe_token is null;

-- The agent looks up an org by its token on unsubscribe; index + uniqueness help.
create unique index if not exists organizations_unsubscribe_token_idx
  on organizations (unsubscribe_token);

-- ---------------------------------------------------------------------------
-- 2. org_grants: per-org dedup + per-org fit
-- ---------------------------------------------------------------------------
create table if not exists org_grants (
  org_id          uuid        not null references organizations (id) on delete cascade,
  grant_id        uuid        not null references grants (id)        on delete cascade,
  fit_score       integer     check (fit_score between 1 and 10),
  fit_rationale   text,
  first_seen      timestamptz default now(),
  digest_sent_at  timestamptz,
  primary key (org_id, grant_id)
);

-- Dedup reads filter by org + first_seen; sent reporting filters by digest_sent_at.
create index if not exists org_grants_org_idx        on org_grants (org_id);
create index if not exists org_grants_first_seen_idx on org_grants (org_id, first_seen);
create index if not exists org_grants_sent_idx       on org_grants (org_id, digest_sent_at);

-- ---------------------------------------------------------------------------
-- 3. email_events: Resend webhook engagement data
-- ---------------------------------------------------------------------------
create table if not exists email_events (
  id          uuid        default gen_random_uuid() primary key,
  org_id      uuid        references organizations (id) on delete set null,
  email_id    text,                       -- Resend message id (data.email_id)
  type        text        not null,       -- delivered | opened | clicked | bounced | complained
  link_url    text,                       -- populated for click events
  created_at  timestamptz default now()
);

create index if not exists email_events_org_idx   on email_events (org_id);
create index if not exists email_events_type_idx  on email_events (type);
create index if not exists email_events_email_idx on email_events (email_id);
