# GrantEquity Grant Agent

Automated weekly grant discovery for New Jersey nonprofits. Every Monday it runs
a **per-org** Claude + web_search pass for each subscribed organization,
deduplicates against Supabase, and emails each org a personalized digest via
Resend. Orgs sign up through the GrantEquity landing page, which inserts them
into the Supabase `organizations` table.

## How it works

1. GitHub Actions fires Monday ~10am ET (or a manual single-org run on demand).
2. For each **active** org, Claude (Sonnet 4.6) searches the web across federal,
   NJ state, and foundation sources tailored to that org's focus areas + county.
3. Results are scored against the org's profile and filtered to ≥6/10 fit.
4. Grants are saved to the shared `grants` catalog and linked per-org in
   `org_grants` (per-org dedup lives there).
5. Resend delivers a formatted digest to the org, with a CAN-SPAM unsubscribe
   footer + one-click `List-Unsubscribe` header.

Data model:

- **`organizations`** — subscribers (one row per signup); `active`, `last_sent`,
  `unsubscribe_token`, `unsubscribed_at`.
- **`grants`** — shared catalog, one row per unique `url`.
- **`org_grants`** — join: which grant was shown to which org, with per-org
  `fit_score`, `first_seen`, `digest_sent_at`.
- **`email_events`** — Resend open/click/delivery webhook events (engagement).

## Setup

### 1. Supabase

Run, in order, in the SQL editor:
- `schema.sql` (the shared `grants` table)
- `migrations/per_org_engine.sql` (adds `org_grants`, `email_events`, and the
  unsubscribe columns)

Credentials: Supabase dashboard → Settings → API → Project URL + `service_role`
key (server-side only — never ship it to the browser).

### 2. Resend

1. Sign up at resend.com (free tier: 3,000 emails/month).
2. Add and **verify a custom sending domain** (e.g. `mail.grantequity.org`).
   Real outreach needs DKIM/SPF — `onboarding@resend.dev` is test-only.
3. Enable **Open & Click tracking** on the domain.
4. Set `MAIL_FROM` to the verified address.

### 3. Anthropic API key

From console.anthropic.com → API Keys. Web search is ~$10 / 1,000 searches and
each org uses ~5 searches/run, so ~$1–2 per org per run.

### 4. Edge Functions (unsubscribe, confirmation, tracking)

See [`supabase/functions/README.md`](supabase/functions/README.md) for deploy +
wiring (DB webhook for confirmation, Resend webhook for tracking).

### 5. GitHub repo config

Secrets (Settings → Secrets → Actions):

```
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_KEY
RESEND_API_KEY
```

Variables (Settings → Variables → Actions — non-secret):

```
MAIL_FROM                e.g. GrantEquity <grants@mail.grantequity.org>
UNSUBSCRIBE_BASE_URL     e.g. https://ujixxuvfpuykcmzcebmg.supabase.co/functions/v1
MAILING_ADDRESS          physical postal address for the CAN-SPAM footer
```

## Running it

- **Weekly (all active orgs):** the Monday cron, or Actions → *GrantEquity Grant
  Agent* → *Run workflow* with the org email left blank.
- **One org on demand (demo / mid-week onboarding):** Actions → *Run workflow* →
  enter the org's email. (Maps to the `TARGET_ORG_EMAIL` env var.)

## Local testing

```bash
cp .env.example .env       # fill in real values
npm install
# All active orgs:
node src/index.js
# A single org:
TARGET_ORG_EMAIL=org@example.com node src/index.js
```

## Customization

- **Per-org prompt / fit criteria**: `src/profile.js` (`buildSystemPrompt(org)`)
- **Search angles**: `buildOrgSearches()` in `src/agent.js`
- **Fit threshold**: `fit_score < 6` in `src/agent.js`
- **Dedup windows**: `TTL_DAYS` / `CLOSING_SOON_DAYS` in `src/db.js`
- **Schedule**: the cron in `.github/workflows/grant-agent.yml`
