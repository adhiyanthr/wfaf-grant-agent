import { createClient } from '@supabase/supabase-js';

// Time-bounded dedup window. A grant is suppressed if it was first seen within
// the last 330 days (~11 months); after that it may resurface (annual cycles
// re-open). Grants closing within 30 days always surface regardless of age.
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

// Active organizations to run the pipeline for.
export async function getActiveOrgs() {
  const { data, error } = await getClient()
    .from('organizations')
    .select('*')
    .eq('active', true);

  if (error) throw new Error(`Supabase read error: ${error.message}`);
  return data || [];
}

export async function filterNewGrants(grants, orgId) {
  const { data: existing, error } = await getClient()
    .from('grants')
    .select('url, first_seen, funder, title')
    .eq('org_id', orgId);

  if (error) throw new Error(`Supabase read error: ${error.message}`);

  // url -> first_seen timestamp for grants already in the DB
  const firstSeenByUrl = new Map(
    (existing || []).map((r) => [r.url, r.first_seen])
  );

  // Normalized "funder||title" keys already in the DB, for cross-URL dedup.
  const existingFunderTitle = new Set(
    (existing || []).map((r) => normKey(r.funder, r.title))
  );

  const now = Date.now();

  return grants.filter((g) => {
    if (!g.url) return false;

    // Second duplicate check: a NEW url whose funder+title already exists in
    // the DB is the same grant re-listed elsewhere — skip even though the URL
    // differs. (Known URLs are handled by upsert, so this only guards new ones.)
    if (!firstSeenByUrl.has(g.url) && existingFunderTitle.has(normKey(g.funder, g.title))) {
      return false;
    }

    // "Closing Soon" exception: deadline within 30 days always surfaces,
    // regardless of first_seen.
    const days = daysUntil(g.deadline);
    if (days !== null && days >= 0 && days <= CLOSING_SOON_DAYS) {
      return true;
    }

    const firstSeen = firstSeenByUrl.get(g.url);
    if (firstSeen === undefined) return true; // brand new — never seen

    // Previously seen: suppress unless the TTL has elapsed (annual resurface).
    const ageDays = (now - new Date(firstSeen).getTime()) / DAY_MS;
    return ageDays > TTL_DAYS;
  });
}

export async function saveGrants(grants, orgId) {
  if (!grants.length) return;

  // Note: first_seen is intentionally omitted from the payload.
  //  - New rows  -> first_seen takes the column default now() (set once).
  //  - Resurfaced rows ((org_id,url) conflict) -> upsert updates the other
  //    fields (deadline, amounts, fit) but leaves first_seen untouched,
  //    preserving the original discovery date.
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
  // Dedup within the batch on (org_id, url) — the table's unique key.
  const uniqueRows = [
    ...new Map(rows.map((r) => [`${r.org_id}|${r.url}`, r])).entries(),
  ].map(([, r]) => r);
  const { error } = await getClient()
    .from('grants')
    .upsert(uniqueRows, { onConflict: 'org_id,url' });
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
}

// Records when a grant was last included in a digest. digest_sent_at is the
// "last_sent" timestamp — updated for every sent grant (new and resurfaced),
// while first_seen is preserved by saveGrants above.
export async function markDigestSent(urls, orgId) {
  if (!urls.length) return;
  const { error } = await getClient()
    .from('grants')
    .update({ digest_sent_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .in('url', urls);

  if (error) throw new Error(`Supabase update error: ${error.message}`);
}
