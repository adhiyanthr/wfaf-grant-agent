# GrantEquity Grant Agent

Automated weekly grant discovery for New Jersey nonprofits. Every Monday it runs
a **per-org** retrieval-and-matching pass for each subscribed organization:
Serper.dev does the raw Google search, Claude filters the results to relevant
grants, and each org gets a personalized digest via Resend. Results are
deduplicated against Supabase. Orgs sign up through the GrantEquity landing page,
which inserts them into the Supabase `organizations` table.

## How it works

1. GitHub Actions fires Monday ~10am ET (or a manual single-org run on demand).
2. For each **active** org, **Serper.dev** runs the raw Google searches (federal,
   NJ state, foundation angles tailored to the org's focus areas + county) and
   returns structured `{title, link, snippet}` results.
3. Claude (Sonnet 4.6, `temperature: 0`) matches and scores those results
   against the org's profile, using the Serper snippets as its **only** source
   of grant information (it does not search the web itself). Results are filtered
   to ≥6/10 fit, every returned URL is validated in code against the Serper
   result set (hallucinated links are dropped), and surviving grants get a cheap
   Haiku full-page verification of their deadline/amount.
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

From console.anthropic.com → API Keys. The search step no longer uses Claude's
native web-search tool — Serper does retrieval and Claude only does matching, so
the per-org search cost is now mostly cheap input tokens over snippets plus a few
Haiku verification calls.

### 3b. Serper API key

From serper.dev → API Key. Serper does the raw Google search. It bills per query
(not per result); the free tier covers initial testing and the first paid tier is
a few dollars per thousand queries. Each org runs ~5 queries/week, so the search
step is near-zero cost compared with the native web-search tool fee it replaces.

### 4. Edge Functions (unsubscribe, confirmation, tracking)

See [`supabase/functions/README.md`](supabase/functions/README.md) for deploy +
wiring (DB webhook for confirmation, Resend webhook for tracking).

### 5. GitHub repo config

Secrets (Settings → Secrets → Actions):

```
ANTHROPIC_API_KEY
SERPER_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_KEY
RESEND_API_KEY
```

Variables (Settings → Variables → Actions — non-secret):

```
MAIL_FROM                e.g. GrantEquity <grants@grantequity.org>
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
