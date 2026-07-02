import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, stateLabel } from './profile.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

Search thoroughly for all open grants that ${org.name} qualifies for. Cover federal, ${stateLabel(org)} state, and private foundation sources relevant to its focus areas. Only include grants with future deadlines or upcoming open cycles.

For each grant, extract the application deadline if it is mentioned. Return it as an ISO date string (YYYY-MM-DD). If no deadline is mentioned, return null. Do not invent deadlines.

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
    if (g.deadline) {
      const deadline = new Date(g.deadline + 'T00:00:00');
      if (deadline < now) {
        console.warn('  Skipping expired grant:', g.title, g.deadline);
        return false;
      }
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
