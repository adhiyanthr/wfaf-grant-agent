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

// Days from now until a deadline (negative = past). null if no/invalid deadline.
function daysUntil(deadline) {
  if (!deadline) return null;
  const d = new Date(deadline + 'T00:00:00');
  if (isNaN(d)) return null;
  return Math.ceil((d - Date.now()) / DAY_MS);
}

export async function filterNewGrants(grants) {
  const { data: existing, error } = await getClient()
    .from('grants')
    .select('url, first_seen');

  if (error) throw new Error(`Supabase read error: ${error.message}`);

  // url -> first_seen timestamp for grants already in the DB
  const firstSeenByUrl = new Map(
    (existing || []).map((r) => [r.url, r.first_seen])
  );

  const now = Date.now();

  return grants.filter((g) => {
    if (!g.url) return false;

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

export async function saveGrants(grants) {
  if (!grants.length) return;

  // Note: first_seen is intentionally omitted from the payload.
  //  - New rows  -> first_seen takes the column default now() (set once).
  //  - Resurfaced rows (url conflict) -> upsert updates the other fields
  //    (deadline, amounts, fit) but leaves first_seen untouched, preserving
  //    the original discovery date.
  const rows = grants.map((g) => ({
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

  const { error } = await getClient().from('grants').upsert(rows, { onConflict: 'url' });
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
}

// Records when a grant was last included in a digest. digest_sent_at is the
// "last_sent" timestamp — updated for every sent grant (new and resurfaced),
// while first_seen is preserved by saveGrants above.
export async function markDigestSent(urls) {
  if (!urls.length) return;
  const { error } = await getClient()
    .from('grants')
    .update({ digest_sent_at: new Date().toISOString() })
    .in('url', urls);

  if (error) throw new Error(`Supabase update error: ${error.message}`);
}
