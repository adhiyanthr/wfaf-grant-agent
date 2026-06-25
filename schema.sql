-- Run this in your Supabase SQL editor before first deploy

create table if not exists grants (
  id              uuid        default gen_random_uuid() primary key,
  title           text        not null,
  funder          text,
  amount_min      integer,
  amount_max      integer,
  deadline        date,
  url             text        unique not null,
  fit_score       integer     check (fit_score between 1 and 10),
  fit_rationale   text,
  tags            text[]      default '{}',
  first_seen      timestamptz default now(),
  digest_sent_at  timestamptz
);

-- Indexes for dedup check and deadline sorting
create index if not exists grants_url_idx      on grants (url);
create index if not exists grants_deadline_idx on grants (deadline);
create index if not exists grants_score_idx    on grants (fit_score desc);
