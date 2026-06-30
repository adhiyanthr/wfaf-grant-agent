// src/verify.js
//
// Optional second-pass verification (task step 5). For each grant that already
// survived the relevance filter + URL validation, fetch the FULL page text for
// its url and ask a cheap model (Haiku) whether the deadline / amount the first
// pass extracted actually appears on that page. If a value can't be confirmed
// from the page text, it's nulled rather than published unverified.
//
// Design choices:
//   * Only runs on grants that passed step 4 — keep it cheap.
//   * A fetch failure (timeout, 403, non-HTML) is "could not verify", NOT
//     "hallucinated": we leave the value as-is and log, rather than nulling good
//     data because a funder site blocked a bot. Only an explicit "not on page"
//     answer from the model nulls a value.
//   * Toggle with VERIFY_GRANTS=false to skip entirely (e.g. for fast local runs).

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FETCH_TIMEOUT_MS = 15000;
const MAX_PAGE_CHARS = 12000; // cap tokens fed to the verifier

// Fetch a URL and return crudely de-tagged text, or null if it can't be read.
async function fetchPageText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        // Some funder sites 403 a header-less client; a normal UA is enough.
        'User-Agent':
          'Mozilla/5.0 (compatible; GrantEquityBot/1.0; +https://grantequity.org)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('html') && !ctype.includes('text')) return null;

    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, MAX_PAGE_CHARS);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Ask Haiku whether the extracted deadline / amount appear on the page text.
// Returns { deadline: boolean|null, amount: boolean|null } where:
//   true  = value is confirmed present on the page
//   false = value is NOT present on the page (caller should null it)
//   null  = nothing to check / couldn't determine (caller leaves value as-is)
async function confirmAgainstPage(grant, pageText) {
  const hasDeadline = !!grant.deadline;
  const hasAmount = grant.amount_min != null || grant.amount_max != null;
  if (!hasDeadline && !hasAmount) return { deadline: null, amount: null };

  const amountStr = hasAmount
    ? `${grant.amount_min ?? '?'}–${grant.amount_max ?? '?'}`
    : null;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    temperature: 0,
    system:
      'You verify whether specific facts appear in a block of web page text. ' +
      'Only answer based on the provided page text. Do not use outside knowledge. ' +
      'Respond with a raw JSON object only.',
    messages: [
      {
        role: 'user',
        content: `PAGE TEXT (from ${grant.url}):
"""
${pageText}
"""

For the grant "${grant.title}", check whether each value below is supported by the PAGE TEXT above.
${hasDeadline ? `- deadline: "${grant.deadline}" — does the page state this application deadline (same date, allowing format differences)?` : ''}
${hasAmount ? `- amount: "${amountStr}" — does the page state this funding amount or range?` : ''}

Return ONLY a JSON object with the keys you were asked about, each set to true (clearly stated on the page) or false (not stated on the page). Example: {"deadline": true, "amount": false}`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { deadline: null, amount: null };

  try {
    const parsed = JSON.parse(match[0]);
    return {
      deadline: typeof parsed.deadline === 'boolean' ? parsed.deadline : null,
      amount: typeof parsed.amount === 'boolean' ? parsed.amount : null,
    };
  } catch {
    return { deadline: null, amount: null };
  }
}

// Verify a list of grants against their live pages. Mutates and returns the same
// array; unverifiable deadline/amount values are nulled (never the whole grant).
// Reports how many values it nulled via the returned counts.
export async function verifyGrants(grants) {
  let unverifiedDeadlines = 0;
  let unverifiedAmounts = 0;
  let fetchFailures = 0;

  for (const g of grants) {
    const pageText = await fetchPageText(g.url);
    if (!pageText) {
      fetchFailures += 1;
      continue; // can't verify -> leave values as-is
    }

    let confirmation;
    try {
      confirmation = await confirmAgainstPage(g, pageText);
    } catch (err) {
      console.warn(`    Verify call failed for "${g.title}": ${err.message}`);
      continue;
    }

    if (confirmation.deadline === false && g.deadline) {
      console.warn(`    Deadline "${g.deadline}" not found on page for "${g.title}" — nulling.`);
      g.deadline = null;
      unverifiedDeadlines += 1;
    }
    if (confirmation.amount === false && (g.amount_min != null || g.amount_max != null)) {
      console.warn(`    Amount not found on page for "${g.title}" — nulling.`);
      g.amount_min = null;
      g.amount_max = null;
      unverifiedAmounts += 1;
    }
  }

  return { grants, unverifiedDeadlines, unverifiedAmounts, fetchFailures };
}
