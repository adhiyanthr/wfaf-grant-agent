import { createClient } from '@supabase/supabase-js';

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

export async function filterNewGrants(grants) {
  const { data: existing, error } = await getClient()
    .from('grants')
    .select('url');

  if (error) throw new Error(`Supabase read error: ${error.message}`);

  const seenUrls = new Set((existing || []).map((r) => r.url));
  const newGrants = grants.filter((g) => g.url && !seenUrls.has(g.url));

  return newGrants;
}

export async function saveGrants(grants) {
  if (!grants.length) return;

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
    first_seen: new Date().toISOString(),
  }));

  const { error } = await getClient().from('grants').insert(rows);
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
}

export async function markDigestSent(urls) {
  if (!urls.length) return;
  const { error } = await getClient()
    .from('grants')
    .update({ digest_sent_at: new Date().toISOString() })
    .in('url', urls);

  if (error) throw new Error(`Supabase update error: ${error.message}`);
}
