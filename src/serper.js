// src/serper.js
//
// Thin client for Serper.dev (https://serper.dev) — a cheap, structured Google
// Search API. We use it to do the RAW retrieval for the weekly grant run so that
// Claude only does relevance filtering against grounded snippets instead of
// performing (expensive, hallucination-prone) web search itself.
//
// Cost note: Serper bills per query (one credit per call below), NOT per result,
// so requesting more results per query is effectively free — but we keep `num`
// modest by default to keep snippet payloads small for the matching prompt.

const SERPER_ENDPOINT = 'https://google.serper.dev/search';

// Per-request timeout so one slow query can't stall the whole org run.
const REQUEST_TIMEOUT_MS = 15000;

// Run one Serper query and return its organic results as {title, link, snippet}.
// Returns [] (and logs) on any failure so a single bad query doesn't abort the
// org's whole run.
async function runQuery(query, num) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error('SERPER_API_KEY must be set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(SERPER_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`    Serper query failed (${res.status}) for "${query}": ${body.slice(0, 200)}`);
      return [];
    }

    const data = await res.json();
    const organic = Array.isArray(data.organic) ? data.organic : [];
    return organic
      .filter((r) => r && r.link && r.title)
      .map((r) => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet || '',
      }));
  } catch (err) {
    console.warn(`    Serper query errored for "${query}": ${err.message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Run a batch of queries and return a single de-duplicated list of results
// (deduped by `link`). `num` is the result count requested per query — start
// small; cost scales with results requested.
export async function serperSearch(queries, { num = 10 } = {}) {
  if (!process.env.SERPER_API_KEY) {
    throw new Error('SERPER_API_KEY must be set');
  }

  const results = [];
  const seen = new Set();

  for (const query of queries) {
    const queryResults = await runQuery(query, num);
    for (const r of queryResults) {
      if (seen.has(r.link)) continue;
      seen.add(r.link);
      results.push(r);
    }
  }

  return results;
}
