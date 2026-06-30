import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from './profile.js';
import { serperSearch } from './serper.js';
import { verifyGrants } from './verify.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// How many Serper results to request per query. Start small — Serper bills per
// query, and smaller result sets keep the matching prompt cheap to reason over.
const SERPER_RESULTS_PER_QUERY = 10;

// Funder-type dimension — one selected per week via (week % length) so that
// federal / state / corporate / private all get coverage across weeks.
const FUNDER_SEARCHES = [
  'federal grants available NJ nonprofits',
  'NJ state grants nonprofits',
  'corporate foundation grants NJ',
  'private foundation grants NJ nonprofits',
];

// ISO 8601 week number (1–53). JS has no built-in getWeek().
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // nearest Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// Build this run's search queries for a specific org: temporal + county +
// focus-area queries + one rotating funder-type query, derived from the org's
// profile. Focus areas are the heart of per-org relevance.
function buildOrgSearches(org, now) {
  const week = getISOWeek(now);
  const month = now.toLocaleString('en-US', { month: 'long' });
  const year = now.getFullYear();

  const focusAreas = (org.focus_areas || []).filter(Boolean);
  const county = org.county ? `${org.county} County NJ` : 'New Jersey';

  const searches = [
    `NJ nonprofit grants deadline ${month} ${year}`,
    `${county} nonprofit grants ${year}`,
  ];

  if (focusAreas.length) {
    for (const area of focusAreas.slice(0, 3)) {
      searches.push(`${area} grants NJ nonprofits ${year}`);
    }
  } else {
    searches.push(`grants for NJ nonprofits ${year}`);
  }

  searches.push(FUNDER_SEARCHES[week % FUNDER_SEARCHES.length]);

  return { week, searches };
}

// Format the Serper results as a numbered, source-grounded block for the prompt.
// Only title/link/snippet are exposed — this is the ONLY grant information the
// model is allowed to use.
function formatResultsForPrompt(results) {
  return results
    .map(
      (r, i) =>
        `[${i + 1}]
title: ${r.title}
link: ${r.link}
snippet: ${r.snippet}`
    )
    .join('\n\n');
}

// Retrieval + matching pass for a single org:
//   1. Serper does the raw Google search (cheap, structured, snippets only).
//   2. Claude filters/matches those snippets to the org — it never searches the
//      web itself and is instructed not to invent grants beyond the results.
//   3. Every returned grant's url is validated (in code) against the set of
//      links actually sent to the model; anything else is a hallucination and
//      is dropped.
//   4. Surviving grants get a cheap full-page verification pass (verify.js).
export async function searchGrantsForOrg(org) {
  const runDate = new Date();
  const today = runDate.toISOString().split('T')[0];
  const { week, searches } = buildOrgSearches(org, runDate);

  console.log(`  Searching for "${org.name}" (ISO week ${week})...`);
  searches.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));

  // --- 1. Raw retrieval via Serper -----------------------------------------
  const results = await serperSearch(searches, { num: SERPER_RESULTS_PER_QUERY });
  console.log(`  Serper returned ${results.length} unique results across ${searches.length} queries`);

  if (!results.length) {
    console.warn('  No Serper results — nothing to match against.');
    return [];
  }

  // Set of valid links for code-side URL validation (step 4 below).
  const validLinks = new Set(results.map((r) => r.link));

  // --- 2. Relevance matching via Claude (extraction, temperature 0) --------
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    temperature: 0,
    system: buildSystemPrompt(org),
    messages: [
      {
        role: 'user',
        content: `Today is ${today} (ISO week ${week}).

Below are the web search results retrieved for ${org.name} this week. These are the ONLY source of grant information available to you. Do not use any prior knowledge of grant programs or funders, and do not perform any search of your own.

SEARCH RESULTS:
${formatResultsForPrompt(results)}

From these results only, identify the grants ${org.name} qualifies for and score each for fit. Only include grants with deadlines in the future or an open/upcoming cycle. Return the JSON array exactly as specified in your instructions.`,
      },
    ],
  });

  console.log(
    `  Matching pass — tokens in: ${response.usage.input_tokens}, out: ${response.usage.output_tokens}`
  );

  const textBlocks = response.content.filter((b) => b.type === 'text');
  const fullText = textBlocks.map((b) => b.text).join('');

  if (!fullText.trim()) {
    throw new Error('Agent returned no text content');
  }

  const jsonMatch = fullText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('Raw agent response:', fullText.slice(0, 500));
    throw new Error('No JSON array found in agent response');
  }

  let grants;
  try {
    grants = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('JSON parse error. Raw match:', jsonMatch[0].slice(0, 500));
    throw new Error(`Failed to parse agent JSON: ${err.message}`);
  }

  if (!Array.isArray(grants)) {
    throw new Error('Agent response is not a JSON array');
  }

  const matchedCount = grants.length;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // --- 3 + 4. Filter by basic validity / fit / deadline, and validate URLs --
  let urlDropped = 0;
  let valid = grants.filter((g) => {
    if (!g.title || !g.url) {
      console.warn('  Skipping grant missing title or url:', g);
      return false;
    }
    // URL validation: the link MUST be one we actually sent the model. A url
    // that isn't in the Serper result set is a hallucination, however plausible.
    if (!validLinks.has(g.url)) {
      console.warn('  Dropping grant with hallucinated url (not in Serper results):', g.url);
      urlDropped += 1;
      return false;
    }
    if (typeof g.fit_score !== 'number' || g.fit_score < 6) {
      return false;
    }
    if (g.deadline) {
      const deadline = new Date(g.deadline + 'T00:00:00');
      if (deadline < now) {
        console.warn('  Skipping expired grant:', g.title, g.deadline);
        return false;
      }
    }
    return true;
  });

  // --- 5. Full-page verification of deadline/amount (optional) --------------
  if (process.env.VERIFY_GRANTS !== 'false' && valid.length) {
    const { unverifiedDeadlines, unverifiedAmounts, fetchFailures } = await verifyGrants(valid);
    console.log(
      `  Verification: ${unverifiedDeadlines} deadline(s) and ${unverifiedAmounts} amount(s) nulled as unconfirmed; ${fetchFailures} page(s) unreachable (left as-is).`
    );
  }

  // Per-org-per-run hallucination signal: results in, matched, dropped by URL
  // validation. A rising urlDropped over time flags model hallucination.
  console.log(
    `  [stats] serper_results=${results.length} matched=${matchedCount} url_dropped=${urlDropped} kept=${valid.length}`
  );

  return valid;
}
