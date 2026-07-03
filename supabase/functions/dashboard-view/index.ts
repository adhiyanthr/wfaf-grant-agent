// supabase/functions/dashboard-view/index.ts
//
// Public, token-gated dashboard backend for the white-label client dashboard
// (see client-wagner-farm/). There is NO login/session: the org's static
// `dashboard_token` (organizations.dashboard_token, see
// migrations/dashboard_token.sql) IS the credential. The browser SPA sends the
// token; this function looks the org up with the SERVICE-ROLE key (bypassing
// RLS) and returns only that org's data. The service key never reaches the
// browser.
//
// Deploy PUBLIC (the token is the auth):
//   npx -y supabase functions deploy dashboard-view \
//     --project-ref ujixxuvfpuykcmzcebmg --no-verify-jwt
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both auto-injected by Supabase).
//
// --- Log hygiene (spec item 4) ---
// The token is accepted ONLY in the JSON POST body, never in the URL/query
// string, so it does not land in Supabase's HTTP access logs (which record the
// request line / URL). We also never console.log the token or the org email;
// error logs carry only the action name + a coarse message. `redact()` is used
// for any diagnostic that must reference the token.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // Belt-and-suspenders: the SPA also sets this, but a stray Referer must never
  // carry the token URL off-site.
  'Referrer-Policy': 'no-referrer',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Never print a full token. Show a short, non-reversible hint only.
function redact(token: unknown): string {
  const s = typeof token === 'string' ? token : '';
  return s ? `token:${s.slice(0, 4)}…(${s.length})` : 'token:<none>';
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MATCH_SELECT =
  'grant_id, fit_score, fit_rationale, eligibility_flags, analysis, first_seen, ' +
  'grants(id, title, funder, amount_min, amount_max, deadline, url, tags)';

type FeedbackResponse = 'not_relevant' | 'more_like_this' | 'already_applied';
const ALLOWED_RESPONSES: FeedbackResponse[] = [
  'not_relevant',
  'more_like_this',
  'already_applied',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'not_found' }, 404);

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const token = typeof payload.token === 'string' ? payload.token : '';
  const action = typeof payload.action === 'string' ? payload.action : 'view';

  // Cheap shape check before touching the DB. Do NOT distinguish "missing" from
  // "malformed" from "unknown" to the client — all fall through to a generic
  // not_found so the endpoint leaks nothing about which tokens exist.
  if (!UUID_RE.test(token)) return json({ error: 'not_found' }, 404);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Resolve token -> org. One indexed lookup; also gates every write below.
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, focus_areas, county, state, last_sent')
    .eq('dashboard_token', token)
    .maybeSingle();

  if (orgErr) {
    console.error('dashboard-view org lookup failed', redact(token), orgErr.message);
    return json({ error: 'server_error' }, 500);
  }
  // Unknown token: generic not_found, same as a malformed one.
  if (!org) return json({ error: 'not_found' }, 404);

  // ---- Writes: feedback / applied ----------------------------------------
  if (action === 'feedback' || action === 'applied') {
    const grantId = typeof payload.grant_id === 'string' ? payload.grant_id : '';
    if (!UUID_RE.test(grantId)) return json({ error: 'bad_request' }, 400);

    // 'applied' is sugar for the already_applied response; 'feedback' carries
    // an explicit response value from the UI.
    const response: string =
      action === 'applied'
        ? 'already_applied'
        : (payload.response as string) ?? '';

    if (!ALLOWED_RESPONSES.includes(response as FeedbackResponse)) {
      return json({ error: 'bad_request' }, 400);
    }

    const { error: insErr } = await supabase.from('match_feedback').insert({
      org_id: org.id,
      grant_id: grantId,
      response,
    });
    if (insErr) {
      console.error('dashboard-view feedback insert failed', redact(token), insErr.message);
      return json({ error: 'server_error' }, 500);
    }
    return json({ ok: true });
  }

  // ---- Read: view (default) ----------------------------------------------
  if (action !== 'view') return json({ error: 'bad_request' }, 400);

  const { data: matches, error: matchErr } = await supabase
    .from('org_grants')
    .select(MATCH_SELECT)
    .eq('org_id', org.id)
    .order('fit_score', { ascending: false });

  if (matchErr) {
    console.error('dashboard-view matches fetch failed', redact(token), matchErr.message);
    return json({ error: 'server_error' }, 500);
  }

  // The org's own latest per-grant feedback, so the UI can show which grants
  // are already marked not-relevant / applied.
  const { data: feedback, error: fbErr } = await supabase
    .from('match_feedback')
    .select('grant_id, response, created_at')
    .eq('org_id', org.id)
    .in('response', ALLOWED_RESPONSES)
    .order('created_at', { ascending: false });

  if (fbErr) {
    console.error('dashboard-view feedback fetch failed', redact(token), fbErr.message);
    return json({ error: 'server_error' }, 500);
  }

  return json({
    org: {
      name: org.name,
      focus_areas: org.focus_areas,
      county: org.county,
      state: org.state,
      last_sent: org.last_sent,
    },
    matches: matches ?? [],
    feedback: feedback ?? [],
  });
});
