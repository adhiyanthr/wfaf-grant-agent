# CLAUDE.md — wfaf-grant-agent (GrantEquity)

Per-org weekly grant-discovery agent. Node (`src/`) runs Claude + web_search per
subscribed org, dedups via Supabase, emails digests via Resend. Three Deno edge
functions in `supabase/functions/`. Full overview: `README.md`.

## Key facts
- **Supabase project ref:** `ujixxuvfpuykcmzcebmg` (functions base URL:
  `https://ujixxuvfpuykcmzcebmg.supabase.co/functions/v1`).
- **Default branch:** `main`. The GitHub Actions Monday cron (`schedule`) always
  runs from `main` — fixes only take effect there once merged, not on a branch.
- **Resend sending domain:** `grantequity.org` (verified). `MAIL_FROM` =
  `GrantEquity <grants@grantequity.org>`.

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
- GitHub **Variables:** `MAIL_FROM`, `UNSUBSCRIBE_BASE_URL`, `MAILING_ADDRESS`.
- Function secrets (set via `supabase secrets set`): `CONFIRM_WEBHOOK_SECRET`,
  `RESEND_WEBHOOK_SECRET`, `MAIL_FROM`, `RESEND_API_KEY`, `UNSUBSCRIBE_BASE_URL`.

## Known open items
- `MAILING_ADDRESS` is unset (CAN-SPAM needs a real physical address before real sends).
- Resend open/click tracking subdomain not configured (delivered/bounce/complaint
  events still work; opens/clicks need a tracking subdomain + DNS).

## Conventions
- Don't commit secrets. `.env` is local-only/gitignored.
- Commit/push only when asked; branch off `main` for changes.
