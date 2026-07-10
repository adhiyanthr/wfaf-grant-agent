# GrantEquity Edge Functions

Four Deno/TypeScript functions deployed to the Supabase project. All are
public HTTP endpoints (no Supabase JWT) — each authenticates itself:

| Function               | Purpose                                          | Auth                              |
| ---------------------- | ------------------------------------------------ | --------------------------------- |
| `unsubscribe`          | One-click + link unsubscribe (CAN-SPAM)          | Unguessable per-org token in URL  |
| `signup-confirmation`  | "You're in" email on new signup                  | `x-webhook-secret` shared header  |
| `resend-webhook`       | Records delivered/opened/clicked → `email_events`| Svix signature (Resend)           |
| `feedback-notify`      | Emails grants@ on in-app feedback/messages       | `x-webhook-secret` shared header  |

## One-time setup

```bash
# From the wfaf-grant-agent/ directory
supabase link --project-ref ujixxuvfpuykcmzcebmg

# Function secrets (server-side only; never in the repo)
supabase secrets set \
  SUPABASE_SERVICE_KEY=eyJ... \
  RESEND_API_KEY=re_... \
  MAIL_FROM='GrantEquity <grants@grantequity.org>' \
  UNSUBSCRIBE_BASE_URL='https://ujixxuvfpuykcmzcebmg.supabase.co/functions/v1' \
  MAILING_ADDRESS='GrantEquity, PO Box 000, Somewhere, NJ 07000' \
  CONFIRM_WEBHOOK_SECRET="$(openssl rand -hex 16)" \
  FEEDBACK_WEBHOOK_SECRET="$(openssl rand -hex 16)" \
  RESEND_WEBHOOK_SECRET=whsec_...    # from the Resend webhook dashboard
```

> `SUPABASE_URL` is injected automatically into Edge Functions — no need to set it.

## Deploy

```bash
supabase functions deploy unsubscribe          --no-verify-jwt
supabase functions deploy signup-confirmation  --no-verify-jwt
supabase functions deploy resend-webhook       --no-verify-jwt
supabase functions deploy feedback-notify      --no-verify-jwt
```

## Wire up the triggers

1. **Confirmation email** — Supabase Dashboard → Database → Webhooks → *Create*:
   - Table `organizations`, event **INSERT**.
   - Type **Supabase Edge Functions** → `signup-confirmation`.
   - Add HTTP header `x-webhook-secret: <CONFIRM_WEBHOOK_SECRET>`.

2. **Open/click tracking** — Resend Dashboard → Webhooks → *Add Endpoint*:
   - URL `https://ujixxuvfpuykcmzcebmg.supabase.co/functions/v1/resend-webhook`.
   - Subscribe to `email.delivered`, `email.opened`, `email.clicked`,
     `email.bounced`, `email.complained`.
   - Copy the signing secret into `RESEND_WEBHOOK_SECRET` and redeploy.
   - Also enable **Open & Click tracking** on the sending domain.

3. **Unsubscribe** — no trigger; the link is built into every digest footer and
   the `List-Unsubscribe` header by the agent (`src/email.js`).

4. **Feedback notifications** — Supabase Dashboard → Database → Webhooks → *Create*:
   - Table `match_feedback`, event **INSERT**.
   - Type **Supabase Edge Functions** → `feedback-notify`.
   - Add HTTP header `x-webhook-secret: <FEEDBACK_WEBHOOK_SECRET>`.

## Quick checks

```bash
# Unsubscribe page (use a real token from organizations.unsubscribe_token)
curl "https://ujixxuvfpuykcmzcebmg.supabase.co/functions/v1/unsubscribe?token=<TOKEN>"

# Confirmation (simulate the DB webhook payload)
curl -X POST "https://ujixxuvfpuykcmzcebmg.supabase.co/functions/v1/signup-confirmation" \
  -H "x-webhook-secret: <CONFIRM_WEBHOOK_SECRET>" -H "content-type: application/json" \
  -d '{"type":"INSERT","table":"organizations","record":{"name":"Test Org","email":"you@example.com","unsubscribe_token":"<TOKEN>"}}'
```
