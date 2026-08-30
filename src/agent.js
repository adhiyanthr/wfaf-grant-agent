import Anthropic from '@anthropic-ai/sdk';
import {
  buildSystemPrompt,
  buildScoringSystemPrompt,
  buildScoringUserPrompt,
  stateLabel,
} from './profile.js';
import { fetchPageText, hashEligibilityText } from './fetchPage.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// How many grants' eligibility texts to score in a single Claude call. Each text
// is capped at 12k chars in the prompt builder, so ~6 keeps input well within a
// Sonnet request while cutting call count vs. one-call-per-grant.
const SCORE_BATCH_SIZE = 6;

// Hedge phrases we accept as evidence that a partial (snippet-only) match's
// reasoning was appropriately qualified. The scoring prompt instructs the model
// to lead with "based on limited eligibility info available"; this is the code
// check that a partial flag in the DB is backed by actually-hedged text.
const HEDGE_PATTERNS = [
  /limited eligibility info/i,
  /based on limited/i,
  /from the (?:available )?snippet/i,
  /appears to/i,
  /could not (?:be )?confirm/i,
  /full (?:page|eligibility)(?: text)? (?:was )?(?:un)?available/i,
  /without the full/i,
];

// Funder-type dimension — one selected per week via (week % length) so that
// federal / state / corporate / private all get coverage across weeks.
function funderSearches(state) {
  return [
    `federal grants available ${state} nonprofits`,
    `${state} state grants nonprofits`,
    `corporate foundation grants ${state}`,
    `private foundation grants ${state} nonprofits`,
  ];
}

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
  const state = stateLabel(org);
  const county = org.county ? `${org.county} County ${state}` : state;

  const searches = [
    `${state} nonprofit grants deadline ${month} ${year}`,
    `${county} nonprofit grants ${year}`,
  ];

  if (focusAreas.length) {
    for (const area of focusAreas.slice(0, 3)) {
      searches.push(`${area} grants ${state} nonprofits ${year}`);
    }
  } else {
    searches.push(`grants for ${state} nonprofits ${year}`);
  }

  const funders = funderSearches(state);
  searches.push(funders[week % funders.length]);

  return { week, searches };
}

// Run one Claude web-search pass for a single organization and return its
// scored, validated grants. `feedback` is recent in-app match feedback
// (getRecentFeedbackForOrg) injected into the system prompt.
export async function searchGrantsForOrg(org, feedback = []) {
  const runDate = new Date();
  const today = runDate.toISOString().split('T')[0];
  const { week, searches } = buildOrgSearches(org, runDate);

  console.log(`  Searching for "${org.name}" (ISO week ${week})...`);
  searches.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));

  const searchList = searches.map((s, i) => `${i + 1}. ${s}`).join('\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    // Structured analysis per grant makes the JSON materially longer; 4096
    // risked truncation (which breaks the [...] extraction below).
    max_tokens: 8192,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 15,
      },
    ],
    system: buildSystemPrompt(org, feedback),
    messages: [
      {
        role: 'user',
        content: `Today is ${today} (ISO week ${week}).

Run these ${searches.length} web searches this week, then compile the results:
${searchList}

Search thoroughly for all open grants that ${org.name} qualifies for. Cover federal, ${stateLabel(org)} state, and private foundation sources relevant to its focus areas. Include a grant if EITHER it has a confirmed deadline in the next 3 months, OR it is rolling/open-ended and accepting applications right now. Exclude expired grants and grants whose deadline is more than 3 months out. If nothing new is genuinely worth applying to, return an empty array [] — never pad the list.

For each grant, return the application deadline as an ISO date string (YYYY-MM-DD) when there is a confirmed one, or null for rolling/open-ended grants. Do not invent deadlines.

Return results as a raw JSON array only — no text, no markdown.`,
      },
    ],
  });

  const searchBlocks = response.content.filter(
    (b) => b.type === 'server_tool_use' && b.name === 'web_search'
  );
  console.log(
    `  Agent performed ${searchBlocks.length} web searches — tokens in: ${response.usage.input_tokens}, out: ${response.usage.output_tokens}`
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

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const valid = grants.filter((g) => {
    if (!g.title || !g.url) {
      console.warn('  Skipping grant missing title or url:', g);
      return false;
    }
    if (typeof g.fit_score !== 'number' || g.fit_score < 6) {
      return false;
    }
    // Dated grants must fall inside the 90-day apply window; rolling/undated
    // grants (null deadline) are allowed through — they're accepting
    // applications now. Only DATED grants are range-checked. (The dashboard
    // shows undated grants too; see dashboard-view inApplyWindow.)
    const deadline = g.deadline ? new Date(g.deadline + 'T00:00:00') : null;
    if (deadline && !isNaN(deadline.getTime())) {
      if (deadline < now) {
        console.warn('  Skipping expired grant:', g.title, g.deadline);
        return false;
      }
      const windowEnd = new Date(now);
      windowEnd.setDate(windowEnd.getDate() + 90);
      if (deadline > windowEnd) {
        console.warn('  Skipping far-future grant (>90d):', g.title, g.deadline);
        return false;
      }
    } else {
      // Normalize any unparseable/empty deadline to null (rolling grant).
      g.deadline = null;
    }

    // New analysis fields are best-effort: sanitize, never reject the grant.
    g.eligibility_flags = Array.isArray(g.eligibility_flags)
      ? g.eligibility_flags.filter((f) => typeof f === 'string')
      : [];
    if (
      !g.analysis ||
      typeof g.analysis !== 'object' ||
      !Array.isArray(g.analysis.strengths)
    ) {
      g.analysis = null;
    } else {
      g.analysis = {
        strengths: g.analysis.strengths.filter((s) => typeof s === 'string'),
        considerations: Array.isArray(g.analysis.considerations)
          ? g.analysis.considerations.filter((c) => typeof c === 'string')
          : [],
      };
      if (!g.analysis.strengths.length) g.analysis = null;
    }

    return true;
  });

  console.log(`  ${valid.length} valid grants after filtering (${grants.length - valid.length} dropped)`);
  return valid;
}

// ===========================================================================
// Fit SCORING (the moat) — per-(org, grant) reasoning against full eligibility
// text, with an explicit snippet fallback + code guards.
// ===========================================================================

// Lowercased, de-punctuated word set (length >= 4) from a batch of strings —
// used to test whether reasoning cites concrete org/grant specifics.
function specificTokens(...strings) {
  const stop = new Set([
    'grant', 'grants', 'funding', 'fund', 'funds', 'nonprofit', 'nonprofits',
    'organization', 'organizations', 'program', 'programs', 'this', 'that',
    'with', 'from', 'your', 'their', 'they', 'them', 'have', 'will', 'would',
    'which', 'these', 'those', 'about', 'strong', 'great', 'good', 'align',
    'aligns', 'aligned', 'alignment', 'opportunity', 'mission', 'work', 'fits',
    'community', 'communities', 'support', 'supports', 'available', 'based',
    'limited', 'eligibility', 'info', 'appears', 'jersey',
  ]);
  const tokens = new Set();
  for (const s of strings) {
    for (const raw of (s || '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length >= 4 && !stop.has(raw)) tokens.add(raw);
    }
  }
  return tokens;
}

// Generic-output guard: reasoning must reference at least one concrete token
// drawn from the org profile or the grant (focus area, program, geo, funder,
// title word). Returns null if OK, else a short reason string.
function genericOutputIssue(reasoning, org, grant) {
  if (!reasoning || reasoning.trim().length < 20) return 'reasoning empty or too short';
  const specifics = specificTokens(
    (org.focus_areas || []).join(' '),
    org.name,
    org.county,
    org.geo_focus,
    org.target_population,
    org.programs_text,
    grant.title,
    grant.funder,
  );
  if (!specifics.size) return null; // nothing specific to check against; don't over-flag
  const words = new Set(reasoning.toLowerCase().split(/[^a-z0-9]+/));
  for (const t of specifics) if (words.has(t)) return null;
  return 'reasoning cites no org/grant-specific token (generic filler)';
}

// Hedge guard: a partial-confidence match's reasoning must contain hedge
// language. A correct DB flag with overconfident text is still a bug.
function hedgeIssue(reasoning, dataConfidence) {
  if (dataConfidence !== 'partial') return null;
  if (reasoning && HEDGE_PATTERNS.some((re) => re.test(reasoning))) return null;
  return 'partial-confidence match but reasoning is not hedged';
}

// Normalize one scored object from the model onto sane, persisted shapes.
function normalizeScored(raw) {
  const score = Number(raw?.fit_score);
  return {
    fit_score: Number.isFinite(score) ? Math.min(10, Math.max(1, Math.round(score))) : null,
    fit_reasoning: typeof raw?.fit_reasoning === 'string' ? raw.fit_reasoning.trim() : '',
    eligibility_flags: Array.isArray(raw?.eligibility_flags)
      ? raw.eligibility_flags.filter((f) => typeof f === 'string' && f.trim()).map((f) => f.trim())
      : [],
    effort_estimate: ['low', 'medium', 'high'].includes(raw?.effort_estimate) ? raw.effort_estimate : null,
  };
}

// Run one scoring Claude call over a batch of prepared grants (each already has
// .eligibilityInput + .dataConfidence). Returns a Map from batch index -> scored.
async function scoreBatch(org, batch) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    temperature: 0,
    system: buildScoringSystemPrompt(org),
    messages: [{ role: 'user', content: buildScoringUserPrompt(batch) }],
  });

  const fullText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const jsonMatch = fullText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('  Scoring: no JSON array in response:', fullText.slice(0, 300));
    return new Map();
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('  Scoring: JSON parse error:', err.message);
    return new Map();
  }
  const byIndex = new Map();
  if (Array.isArray(parsed)) {
    for (const obj of parsed) {
      const idx = Number(obj?.index);
      if (Number.isInteger(idx)) byIndex.set(idx, obj);
    }
  }
  return byIndex;
}

// Score a list of already-discovered candidate grants for one org against full
// eligibility text (snippet fallback on fetch failure), producing the four fit
// outputs plus data_confidence / eligibility_text_unavailable / eligibility_hash.
//
// `cacheByUrl` (optional): url -> { eligibility_hash, scored_hash, ...priorFit }
// from the DB. When a grant's stored eligibility_hash equals its match's
// scored_hash, the grant is unchanged since last scored and is reused (no fetch,
// no model call). Mutates and returns the grants that passed the guards; drops
// (with a log) any whose reasoning is generic filler or an un-hedged partial.
export async function scoreGrantsForOrg(org, grants, cacheByUrl = new Map()) {
  if (!grants.length) return [];

  // 1. Prepare each grant: cache hit, or fetch full text, or snippet fallback.
  const toScore = []; // grants needing a model call
  const reused = []; // grants served from cache
  for (const g of grants) {
    const cached = cacheByUrl.get(g.url);
    if (cached && cached.eligibility_hash && cached.scored_hash &&
        cached.eligibility_hash === cached.scored_hash) {
      // Unchanged since last scored — reuse persisted fit, re-score nothing.
      g.fit_score = cached.fit_score ?? g.fit_score;
      g.fit_reasoning = cached.fit_reasoning ?? null;
      g.eligibility_flags = cached.eligibility_flags ?? [];
      g.effort_estimate = cached.effort_estimate ?? null;
      g.data_confidence = cached.data_confidence ?? 'full';
      g.eligibility_text_unavailable = cached.eligibility_text_unavailable ?? false;
      g.eligibility_hash = cached.eligibility_hash;
      g.scored_hash = cached.scored_hash;
      g._cached = true;
      reused.push(g);
      continue;
    }

    const pageText = await fetchPageText(g.url);
    if (pageText) {
      g.full_eligibility_text = pageText;
      g.eligibility_hash = hashEligibilityText(pageText);
      g.eligibilityInput = pageText;
      g.dataConfidence = 'full';
      g.eligibility_text_unavailable = false;
    } else {
      // Fetch failed: fall back to the search snippet, mark partial + unavailable.
      g.full_eligibility_text = null;
      g.eligibility_hash = null;
      g.eligibilityInput = g.snippet || g.fit_rationale || g.title || '';
      g.dataConfidence = 'partial';
      g.eligibility_text_unavailable = true;
      console.warn(`  Fetch failed, scoring off snippet (partial): ${g.url}`);
    }
    toScore.push(g);
  }

  // 2. Score the non-cached grants in batches.
  for (let i = 0; i < toScore.length; i += SCORE_BATCH_SIZE) {
    const batch = toScore.slice(i, i + SCORE_BATCH_SIZE);
    const scored = await scoreBatch(org, batch);
    batch.forEach((g, j) => {
      const norm = normalizeScored(scored.get(j));
      g.fit_score = norm.fit_score ?? g.fit_score;
      g.fit_reasoning = norm.fit_reasoning;
      g.eligibility_flags = norm.eligibility_flags;
      g.effort_estimate = norm.effort_estimate;
      g.data_confidence = g.dataConfidence; // persisted name
      // scored_hash records the eligibility_hash present at scoring time; null on
      // the partial path (no stable full-text hash to cache against).
      g.scored_hash = g.eligibility_hash;
    });
  }

  // 3. Guards: drop generic filler and un-hedged partials before they ship.
  const passed = [];
  for (const g of [...reused, ...toScore]) {
    const issues = [
      genericOutputIssue(g.fit_reasoning, org, g),
      hedgeIssue(g.fit_reasoning, g.data_confidence),
    ].filter(Boolean);
    if (issues.length) {
      g.guard_issues = issues;
      console.warn(`  GUARD dropped "${g.title}": ${issues.join('; ')}`);
      continue;
    }
    passed.push(g);
  }

  console.log(`  Scored ${grants.length} grant(s): ${reused.length} cached, ${toScore.length} fresh, ${passed.length} passed guards`);
  return passed;
}
