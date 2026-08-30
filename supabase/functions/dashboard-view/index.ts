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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

// Matches shown on the dashboard: rolling/undated grants (no deadline) are
// always shown — they're accepting applications now; DATED grants are shown
// only while applicable (deadline today..+90 days), so expired and far-future
// dated grants are hidden. Applied history (applied_list) is exempt.
const APPLY_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
function inApplyWindow(deadline: unknown): boolean {
  if (typeof deadline !== 'string' || !deadline) return true; // rolling/undated
  const d = new Date(deadline + 'T00:00:00');
  if (isNaN(d.getTime())) return true; // unparseable -> treat as rolling
  const days = Math.ceil((d.getTime() - Date.now()) / DAY_MS);
  return days >= 0 && days <= APPLY_WINDOW_DAYS;
}

// --- Site/admin password support -------------------------------------------
// Both passwords live in app_settings as SHA-256 hex hashes (see
// migrations/wf_site_admin_password.sql). The site password is a soft browser
// gate; the admin password gates the dashboard Admin area and is verified
// HERE (server-side, service role) on every admin action — the client is
// never trusted with the comparison.
const SITE_PW_KEY = 'site_password_hash';
const ADMIN_PW_KEY = 'admin_password_hash';

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// deno-lint-ignore no-explicit-any
async function getSetting(supabase: any, key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw new Error(`app_settings read failed: ${error.message}`);
  return data?.value ?? null;
}

// deno-lint-ignore no-explicit-any
async function setSetting(supabase: any, key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`app_settings write failed: ${error.message}`);
}

// New passwords must be real passwords, not empty strings or novels.
function validNewPassword(p: unknown): p is string {
  return typeof p === 'string' && p.length >= 8 && p.length <= 200;
}

const MATCH_SELECT =
  'grant_id, fit_score, fit_rationale, eligibility_flags, analysis, first_seen, ' +
  'grants(id, title, funder, amount_min, amount_max, deadline, url, tags)';

// For the token-gated "Refresh matches now" action, which fires the same
// GitHub Actions grant-agent workflow that trigger-search uses (but gated by
// the dashboard token rather than an authed session).
const GH_REPO = 'adhiyanthr/wfaf-grant-agent';
const WORKFLOW_FILE = 'grant-agent.yml';

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
  // Selects the full editable profile too, since settings_get/settings_update
  // reuse this same row.
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select(
      'id, email, name, focus_areas, county, state, last_sent, is_501c3, ' +
        'annual_budget, grant_size_pref, what_we_do, target_population, ' +
        'active, frequency_days'
    )
    .eq('dashboard_token', token)
    .maybeSingle();

  if (orgErr) {
    console.error('dashboard-view org lookup failed', redact(token), orgErr.message);
    return json({ error: 'server_error' }, 500);
  }
  // Unknown token: generic not_found, same as a malformed one.
  if (!org) return json({ error: 'not_found' }, 404);

  // ---- Refresh: on-demand grant search -----------------------------------
  // Token-gated equivalent of the trigger-search function. Fires the GitHub
  // Actions grant-agent workflow for just this org so a fresh search runs
  // without waiting for the Monday cron.
  if (action === 'refresh') {
    const ghToken = Deno.env.get('GH_DISPATCH_TOKEN');
    // Degrade gracefully: the UI shows a "not switched on yet" message.
    if (!ghToken) return json({ error: 'not_configured' }, 503);

    const email = typeof org.email === 'string' ? org.email.toLowerCase() : '';
    if (!email) return json({ error: 'not_configured' }, 503);

    const res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'wagner-farm-dashboard',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main', inputs: { org_email: email } }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      console.error('dashboard-view refresh dispatch failed', redact(token), res.status, body);
      return json({ error: 'failed' }, 502);
    }
    return json({ ok: true });
  }

  // ---- Passwords: site gate change + admin verification --------------------
  if (action === 'site_password_change') {
    try {
      const next = payload.new_password;
      if (!validNewPassword(next)) return json({ error: 'weak_password' }, 400);

      const adminPw = typeof payload.admin_password === 'string' ? payload.admin_password : '';
      const current = typeof payload.current_password === 'string' ? payload.current_password : '';
      const [siteHash, adminHash] = await Promise.all([
        getSetting(supabase, SITE_PW_KEY),
        getSetting(supabase, ADMIN_PW_KEY),
      ]);

      // Two ways in: the admin password (Admin page), or the current site
      // password (Settings page). A fresh install with no site hash yet is
      // fail-open, mirroring the browser gate.
      let authorized = false;
      if (adminPw && adminHash) {
        authorized = (await sha256Hex(adminPw)) === adminHash;
      } else if (!siteHash) {
        authorized = true;
      } else {
        authorized = current !== '' && (await sha256Hex(current)) === siteHash;
      }
      if (!authorized) return json({ error: 'wrong_password' }, 403);

      await setSetting(supabase, SITE_PW_KEY, await sha256Hex(next));
      return json({ ok: true });
    } catch (err) {
      console.error('dashboard-view site_password_change failed', redact(token), (err as Error).message);
      return json({ error: 'server_error' }, 500);
    }
  }

  if (action === 'admin_verify' || action === 'admin_change_password') {
    try {
      const adminPw = typeof payload.admin_password === 'string' ? payload.admin_password : '';
      const adminHash = await getSetting(supabase, ADMIN_PW_KEY);
      // No admin password configured -> admin area is off, never fail-open.
      if (!adminHash) return json({ error: 'not_configured' }, 503);
      if (!adminPw || (await sha256Hex(adminPw)) !== adminHash) {
        return json({ error: 'wrong_password' }, 403);
      }
      if (action === 'admin_verify') return json({ ok: true });

      const next = payload.new_password;
      if (!validNewPassword(next)) return json({ error: 'weak_password' }, 400);
      await setSetting(supabase, ADMIN_PW_KEY, await sha256Hex(next));
      return json({ ok: true });
    } catch (err) {
      console.error('dashboard-view admin action failed', redact(token), (err as Error).message);
      return json({ error: 'server_error' }, 500);
    }
  }

  // ---- Read: applied grants -------------------------------------------------
  // Grants whose LATEST feedback is already_applied, with when it was marked.
  // Deliberately NOT deadline-filtered: an application already made must stay
  // visible after the grant leaves the matches window.
  if (action === 'applied_list') {
    const { data: fb, error: fbErr } = await supabase
      .from('match_feedback')
      .select('grant_id, response, created_at')
      .eq('org_id', org.id)
      .in('response', ALLOWED_RESPONSES)
      .not('grant_id', 'is', null)
      .order('created_at', { ascending: false });
    if (fbErr) {
      console.error('dashboard-view applied_list feedback fetch failed', redact(token), fbErr.message);
      return json({ error: 'server_error' }, 500);
    }

    const latest = new Map<string, { response: string; created_at: string }>();
    for (const row of fb ?? []) {
      if (!latest.has(row.grant_id)) latest.set(row.grant_id, row);
    }
    const appliedAt: Record<string, string> = {};
    for (const [grantId, row] of latest) {
      if (row.response === 'already_applied') appliedAt[grantId] = row.created_at;
    }

    const ids = Object.keys(appliedAt);
    if (!ids.length) return json({ matches: [], applied_at: {} });

    const { data: matches, error: matchErr } = await supabase
      .from('org_grants')
      .select(MATCH_SELECT)
      .eq('org_id', org.id)
      .in('grant_id', ids);
    if (matchErr) {
      console.error('dashboard-view applied_list matches fetch failed', redact(token), matchErr.message);
      return json({ error: 'server_error' }, 500);
    }
    return json({ matches: matches ?? [], applied_at: appliedAt });
  }

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

  // ---- Settings: get / update ---------------------------------------------
  if (action === 'settings_get') {
    return json({
      org: {
        name: org.name,
        focus_areas: org.focus_areas,
        county: org.county,
        state: org.state,
        is_501c3: org.is_501c3,
        annual_budget: org.annual_budget,
        grant_size_pref: org.grant_size_pref,
        what_we_do: org.what_we_do,
        target_population: org.target_population,
        active: org.active,
        frequency_days: org.frequency_days,
      },
    });
  }

  if (action === 'settings_update') {
    const fields = payload.fields;
    if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
      return json({ error: 'bad_request' }, 400);
    }
    const allowedKeys = [
      'name',
      'focus_areas',
      'county',
      'state',
      'is_501c3',
      'annual_budget',
      'grant_size_pref',
      'what_we_do',
      'target_population',
      // Cadence + email on/off. `active` doubles as the subscribe/unsubscribe
      // flag (same column the unsubscribe link sets).
      'active',
      'frequency_days',
    ];
    const f = fields as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in f) update[key] = f[key];
    }

    // Validate the two typed/constrained fields so a bad client can't write
    // garbage that would break the agent's cadence or subscription state.
    if ('active' in update && typeof update.active !== 'boolean') {
      return json({ error: 'bad_request' }, 400);
    }
    if ('frequency_days' in update) {
      const n = Number(update.frequency_days);
      if (![7, 14, 30].includes(n)) return json({ error: 'bad_request' }, 400);
      update.frequency_days = n;
    }

    if (Object.keys(update).length === 0) return json({ error: 'bad_request' }, 400);

    const { error: updErr } = await supabase
      .from('organizations')
      .update(update)
      .eq('id', org.id);
    if (updErr) {
      console.error('dashboard-view settings update failed', redact(token), updErr.message);
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

  // Hide expired / far-future grants (see inApplyWindow). The join is a
  // to-one, but supabase-js types it loosely — handle both shapes.
  const visible = (matches ?? []).filter((m) => {
    const g = Array.isArray(m.grants) ? m.grants[0] : m.grants;
    return inApplyWindow(g?.deadline);
  });

  return json({
    org: {
      name: org.name,
      focus_areas: org.focus_areas,
      county: org.county,
      state: org.state,
      last_sent: org.last_sent,
      // So the dashboard can show the real (cadence-aware) next run date, not
      // just the nearest Monday.
      frequency_days: org.frequency_days,
    },
    matches: visible,
    feedback: feedback ?? [],
  });
});
