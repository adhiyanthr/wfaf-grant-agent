// supabase/functions/trigger-search/index.ts
//
// On-demand "Refresh matches now" for the Wagner Farm dashboard. Verifies the
// caller is the one authorized account, then triggers the existing GitHub
// Actions grant-agent workflow for just that org (workflow_dispatch with
// org_email input) so a fresh search runs without waiting for the Monday cron.
//
// Deploy WITHOUT --no-verify-jwt so Supabase requires a valid session JWT to
// invoke. Function secret required: GH_DISPATCH_TOKEN (a GitHub token with
// Actions: read & write on adhiyanthr/wfaf-grant-agent).

const ALLOWED_EMAIL = 'adhiyanth.r@gmail.com'
const GH_REPO = 'adhiyanthr/wfaf-grant-agent'
const WORKFLOW_FILE = 'grant-agent.yml'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Identify the caller from their session JWT.
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  })
  if (!userRes.ok) return json({ error: 'Unauthorized' }, 401)
  const user = await userRes.json()
  const email = (user?.email ?? '').toLowerCase()
  if (email !== ALLOWED_EMAIL) return json({ error: 'Forbidden' }, 403)

  const token = Deno.env.get('GH_DISPATCH_TOKEN')
  if (!token) return json({ error: 'not_configured' }, 503)

  const res = await fetch(
    `https://api.github.com/repos/${GH_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'wagner-farm-dashboard',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: { org_email: email } }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    console.error('GitHub dispatch failed', res.status, body)
    return json({ error: 'dispatch_failed' }, 502)
  }

  return json({ ok: true })
})
