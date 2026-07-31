# CLAUDE.md — wfaf-grant-agent (GrantEquity)

Per-org weekly grant-discovery agent. Node (`src/`) runs Claude + web_search per
subscribed org, dedups via Supabase, emails digests via Resend. Three Deno edge
functions in `supabase/functions/`. Full overview: `README.md`.

## Key facts
- **Platform v1 (in progress):** `app/` is a Vite + React SPA (Supabase Auth
  magic-link, RLS-scoped per org) — profile editor + matches dashboard. The
  agent now runs a per-(org, grant) fit-scoring pass (`src/agent.js`
  `scoreGrantsForOrg` + `src/fetchPage.js`) against full eligibility text, with a
  snippet fallback that marks the match `data_confidence = partial`. Schema lives
  in `migrations/platform_v1.sql` (run manually). Validate scoring with
  `node --env-file=.env src/score-preview.js` before trusting cron output.
- **Supabase project ref:** `ujixxuvfpuykcmzcebmg` (functions base URL:
  `https://ujixxuvfpuykcmzcebmg.supabase.co/functions/v1`).
- **Default branch:** `main`. The GitHub Actions Monday cron (`schedule`) always
  runs from `main` — fixes only take effect there once merged, not on a branch.
- **Resend sending domain:** `grantequity.org` (verified). `MAIL_FROM` =
  `GrantEquity <grants@grantequity.org>`.
- **Wagner Farm site passwords:** the client dashboard (`client-wagner-farm/`,
  root URL) sits behind a soft site-password gate; a separate admin password
  gates `/dashboard/<token>/admin` (password changes, on-demand refresh, the
  ownership handoff guide). Both are SHA-256 hashes in `app_settings`
  (`site_password_hash` / `admin_password_hash`, seeded by
  `migrations/wf_site_admin_password.sql`); admin actions are re-verified
  server-side in `dashboard-view` on every call.
- **3-month apply window:** every grant must have a CONFIRMED deadline ≤90 days
  out — undated/rolling grants are rejected by the agent (`src/agent.js` guard
  + prompt rules in `src/profile.js`) and hidden by `dashboard-view`'s `view`
  (`APPLY_WINDOW_DAYS`). The catalog was purged of undated/out-of-window rows
  on 2026-07-11. The `applied_list` action (Applied page) is deliberately
  unfiltered.
- **Extra digest recipients** come from the `DIGEST_RECIPIENTS` repo Variable
  (comma-separated), merged in `sendDigest` for the WFAF org only. The old
  per-org `organizations.digest_recipients` column is no longer read or
  editable in the app.
- **Email kill-switch:** the `SUPPRESS_DIGESTS` repo Variable (truthy =
  `1/true/yes/on`) makes the agent keep searching + saving matches to the
  dashboard but send NO digest emails to any org (`runForOrg` in
  `src/index.js`; also skips `markOrgDigestSent`, so orgs stay "due" and keep
  searching). Clear/delete the Variable to resume sending.

## Gotchas (these have bitten us)
- **Live DB has schema drift.** The `organizations` table was created by the
  signup landing page from an older/partial schema than the code expects, so
  columns the agent reads/writes can be missing. Errors surface one at a time as
  `column organizations.X does not exist`. Migrations in `migrations/` are
  **manual** — run them in the Supabase SQL editor. Already patched:
  `organizations.last_sent`, `grants.url` UNIQUE (needed for the `onConflict:'url'`
  upsert). `first_seen` lives on `org_grants`/`grants`, NOT `organizations`.
- **Edge functions must use `SUPABASE_SERVICE_ROLE_KEY`** (auto-injected by
  Supabase), never `SUPABASE_SERVICE_KEY` — the reserved `SUPABASE_` prefix means
  you can't set a custom secret with that name via `supabase secrets set`.
- **`supabase link` does not persist here** — always pass
  `--project-ref ujixxuvfpuykcmzcebmg` to CLI commands (`functions deploy`,
  `secrets set/list`). The CLI is run via `npx -y supabase` (not installed globally).
- **Database Webhooks need enabling once** (installs `pg_net` +
  `supabase_functions` schema) before any webhook can be created.
- **Wagner Farm dashboard deploys are MANUAL, and the real domain is
  `https://wagner-farm-grants.vercel.app`** — there is no Vercel git
  integration, so merging to main does NOT redeploy the SPA; run
  `npx vercel deploy --prod` from `client-wagner-farm/`.
  `client-wagner-farm.vercel.app` is dead (DEPLOYMENT_NOT_FOUND).
- **Supabase CLI keychain prompts can't be answered on this machine** — put
  `SUPABASE_ACCESS_TOKEN=<personal access token>` in `.env` and pass it as an
  env var to `npx supabase` commands to bypass the keychain entirely.

## Common commands
```bash
# Deploy a function (no secrets in the command, safe to run):
npx -y supabase functions deploy <name> --project-ref ujixxuvfpuykcmzcebmg --no-verify-jwt
# List which function secrets are set (names only):
npx -y supabase secrets list --project-ref ujixxuvfpuykcmzcebmg
# Run locally (needs real values in .env, which is gitignored):
node src/index.js                          # all active orgs
TARGET_ORG_EMAIL=x@y.com node src/index.js # single org
```

## CI config (authoritative split is in .github/workflows/grant-agent.yml)
- GitHub **Secrets:** `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
  `RESEND_API_KEY`.
- GitHub **Variables:** `MAIL_FROM`, `UNSUBSCRIBE_BASE_URL`, `MAILING_ADDRESS`,
  `APP_BASE_URL` (platform SPA base URL for email deep-links to `/matches/:id`),
  `DASHBOARD_BASE_URL` (Wagner Farm dashboard link in digest footers),
  `DIGEST_RECIPIENTS` (extra WFAF digest recipients, comma-separated).
- Function secrets (set via `supabase secrets set`): `CONFIRM_WEBHOOK_SECRET`,
  `RESEND_WEBHOOK_SECRET`, `FEEDBACK_WEBHOOK_SECRET`, `MAIL_FROM`, `RESEND_API_KEY`,
  `UNSUBSCRIBE_BASE_URL`.

## Known open items
- `MAILING_ADDRESS` is unset (CAN-SPAM needs a real physical address before real sends).
- Resend open/click tracking subdomain not configured (delivered/bounce/complaint
  events still work; opens/clicks need a tracking subdomain + DNS).

## Conventions
- Don't commit secrets. `.env` is local-only/gitignored.
- Commit/push only when asked; branch off `main` for changes.
