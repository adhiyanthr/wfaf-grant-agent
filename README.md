# Grant Agent

Free automated weekly grant discovery for nonprofits that can't afford to pay for a grant finding subscription. Runs every Monday, searches the web using Claude + web_search, deduplicates against Supabase, and emails a digest to staff.

## How it works

1. GitHub Actions fires Monday 8am ET
2. Claude (Sonnet 4.6) searches the web autonomously across federal, NJ state, and foundation grant sources
3. Results are scored against WFAF's profile and filtered to ≥6/10 fit
4. New grants (not previously seen) are saved to Supabase
5. Resend delivers a formatted email digest to Stephanie and Khia

## Setup

### 1. Supabase

Run `schema.sql` in your Supabase SQL editor.

Get your credentials from the Supabase dashboard → Settings → API:
- **URL**: Project URL
- **Service key**: `service_role` key (not the anon key)

### 2. Resend

1. Sign up at resend.com (free tier: 3,000 emails/month)
2. Add and verify a sending domain (or use `onboarding@resend.dev` for testing)
3. If using a custom domain, update `FROM` in `src/email.js`
4. Get your API key from the Resend dashboard

### 3. Anthropic API key

Get from console.anthropic.com → API Keys.

Web search costs $10 per 1,000 searches. At ~10–15 searches/run weekly, that's under $1/month.

### 4. GitHub repo + secrets

Push this repo to GitHub. Add these secrets under Settings → Secrets → Actions:

```
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_KEY
RESEND_API_KEY
```

### 5. Test before first Monday

In GitHub: Actions → WFAF Grant Agent → Run workflow

Check the Actions log for search count, grants found, and email send confirmation.

## Local testing

```bash
cp .env.example .env
# Fill in .env with real values
npm install
node src/index.js
```

## Customization

- **Search scope**: Edit the search angles in `wfaf-profile.js`
- **Fit threshold**: Change `fit_score < 6` in `src/agent.js`
- **Recipients**: Edit `RECIPIENTS` in `src/email.js`
- **Schedule**: Edit the cron in `.github/workflows/grant-agent.yml`
- **Max searches per run**: Change `max_uses` in `src/agent.js`
