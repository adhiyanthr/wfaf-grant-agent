import { createClient } from '@supabase/supabase-js';

// Time-bounded per-org dedup window. A grant is suppressed for an org if that
// org first saw it within the last 330 days (~11 months); after that it may
// resurface (annual cycles re-open). Grants closing within 30 days always
// surface regardless of age.
const TTL_DAYS = 330;
const CLOSING_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

let _supabase;
function getClient() {
  if (!_supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    }
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _supabase;
}

// Normalize funder+title for fuzzy duplicate matching: lowercase, strip
// punctuation, collapse whitespace. Same funder + same normalized title is
// treated as the same grant even under a different URL.
function normKey(funder, title) {
  const norm = (s) =>
    (s ?? '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  return `${norm(funder)}||${norm(title)}`;
}

// Days from now until a deadline (negative = past). null if no/invalid deadline.
function daysUntil(deadline) {
  if (!deadline) return null;
  const d = new Date(deadline + 'T00:00:00');
  if (isNaN(d)) return null;
  return Math.ceil((d - Date.now()) / DAY_MS);
}

// All active, subscribed orgs to run the weekly digest for. active=false covers
// both unsubscribes (Phase 1 flips it) and any manually paused orgs.
export async function getActiveOrgs() {
  const { data, error } = await getClient()
    .from('organizations')
    .select('*')
    .eq('active', true)
    // Longest-unsent first (never-sent orgs lead), so a timed-out run still
    // serves the orgs that have waited longest. `organizations` has no
    // first_seen column — that lives on org_grants.
    .order('last_sent', { ascending: true, nullsFirst: true });

  if (error) throw new Error(`Supabase read error (orgs): ${error.message}`);
  return data || [];
}

// Single org by email — used by the manual (workflow_dispatch) single-org run.
export async function getOrgByEmail(email) {
  const { data, error } = await getClient()
    .from('organizations')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) throw new Error(`Supabase read error (org by email): ${error.message}`);
  return data;
}

// Per-org dedup. A grant is suppressed if THIS org already has it within the
// TTL window; grants closing within 30 days always surface.
export async function filterNewGrantsForOrg(orgId, grants) {
  const { data: existing, error } = await getClient()
    .from('org_grants')
    .select('first_seen, grants!inner(url)')
    .eq('org_id', orgId);

  if (error) throw new Error(`Supabase read error (org_grants): ${error.message}`);

  // url -> first_seen timestamp for grants this org has already been shown.
  const firstSeenByUrl = new Map(
    (existing || [])
      .filter((r) => r.grants)
      .map((r) => [r.grants.url, r.first_seen])
  );

  // Normalized "funder||title" keys already in the DB, for cross-URL dedup.
  const existingFunderTitle = new Set(
    (existing || []).map((r) => normKey(r.funder, r.title))
  );

  const now = Date.now();

  return grants.filter((g) => {
    if (!g.url) return false;

    // "Closing Soon" exception: deadline within 30 days always surfaces.
    const days = daysUntil(g.deadline);
    if (days !== null && days >= 0 && days <= CLOSING_SOON_DAYS) {
      return true;
    }

    const firstSeen = firstSeenByUrl.get(g.url);
    if (firstSeen === undefined) return true; // never shown to this org

    const ageDays = (now - new Date(firstSeen).getTime()) / DAY_MS;
    return ageDays > TTL_DAYS; // annual resurface
  });
}

// Upserts grants into the shared `grants` catalog (by url), then links them to
// the org in `org_grants`. Mutates each grant with its catalog `id` and returns
// the same array so callers can email + mark them.
export async function saveOrgGrants(orgId, grants) {
  if (!grants.length) return grants;

  // Dedupe by url within this batch: a single INSERT ... ON CONFLICT (url) DO
  // UPDATE cannot touch the same row twice ("cannot affect row a second time"),
  // and search can return the same grant URL more than once. Keep first seen.
  const seen = new Set();
  grants = grants.filter((g) => {
    if (seen.has(g.url)) return false;
    seen.add(g.url);
    return true;
  });

  // first_seen on `grants` is intentionally omitted so the column default
  // (now()) is set once and preserved across resurfacing upserts.
  const rows = grants.map((g) => ({
    org_id: orgId,
    title: g.title,
    funder: g.funder ?? null,
    amount_min: g.amount_min ?? null,
    amount_max: g.amount_max ?? null,
    deadline: g.deadline ?? null,
    url: g.url,
    fit_score: g.fit_score,
    fit_rationale: g.fit_rationale ?? null,
    tags: g.tags ?? [],
  }));

  const { data: saved, error } = await getClient()
    .from('grants')
    .upsert(rows, { onConflict: 'url' })
    .select('id, url');

  if (error) throw new Error(`Supabase insert error (grants): ${error.message}`);

  const idByUrl = new Map((saved || []).map((r) => [r.url, r.id]));
  for (const g of grants) g.id = idByUrl.get(g.url);

  // Link each grant to this org. org_grants.first_seen defaults to now() and is
  // left untouched on conflict (ignoreDuplicates) so the org's discovery date
  // for a grant is preserved across weeks.
  const orgRows = grants
    .filter((g) => g.id)
    .map((g) => ({
      org_id: orgId,
      grant_id: g.id,
      fit_score: g.fit_score,
      fit_rationale: g.fit_rationale ?? null,
    }));

  if (orgRows.length) {
    const { error: linkErr } = await getClient()
      .from('org_grants')
      .upsert(orgRows, { onConflict: 'org_id,grant_id', ignoreDuplicates: true });
    if (linkErr) throw new Error(`Supabase insert error (org_grants): ${linkErr.message}`);
  }

  return grants;
}

// Stamp the just-sent grants for this org and bump the org's last_sent.
export async function markOrgDigestSent(orgId, grantIds) {
  const client = getClient();
  const nowIso = new Date().toISOString();

  if (grantIds.length) {
    const { error } = await client
      .from('org_grants')
      .update({ digest_sent_at: nowIso })
      .eq('org_id', orgId)
      .in('grant_id', grantIds);
    if (error) throw new Error(`Supabase update error (org_grants): ${error.message}`);
  }

  const { error: orgErr } = await client
    .from('organizations')
    .update({ last_sent: nowIso })
    .eq('id', orgId);
  if (orgErr) throw new Error(`Supabase update error (org last_sent): ${orgErr.message}`);
}
