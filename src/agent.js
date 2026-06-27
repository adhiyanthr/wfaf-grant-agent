import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../wfaf-profile.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Category dimension — one selected per week via (week % 6).
const CATEGORY_SEARCHES = [
  'arts and culture NJ grants',
  'education and youth NJ grants',
  'environment and conservation NJ grants',
  'health and human services NJ grants',
  'community development NJ grants',
  'social services and food security NJ grants',
];

// Funder-type dimension — one selected per week via (week % 4).
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

// Build the 5 search queries for this run: 3 fixed temporal + 1 rotating
// category + 1 rotating funder-type.
function buildRotatingSearches(now) {
  const week = getISOWeek(now);
  const month = now.toLocaleString('en-US', { month: 'long' });
  const year = now.getFullYear();

  const temporal = [
    `NJ nonprofit grants "now open" ${year}`,
    `NJ nonprofit RFP "just released" OR "new cycle" ${year}`,
    `NJ foundation grants "applications open" ${month} ${year}`,
  ];
  const category = `${CATEGORY_SEARCHES[week % CATEGORY_SEARCHES.length]} now open ${year}`;
  const funder = `${FUNDER_SEARCHES[week % FUNDER_SEARCHES.length]} new cycle ${year}`;

  return { week, searches: [...temporal, category, funder] };
}

export async function searchGrants() {
  const runDate = new Date();
  const today = runDate.toISOString().split('T')[0];
  const { week, searches } = buildRotatingSearches(runDate);

  console.log(`Calling Claude with web search (ISO week ${week})...`);
  console.log('Rotating searches this run:');
  searches.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

  const searchList = searches.map((s, i) => `${i + 1}. ${s}`).join('\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 15,
      },
    ],
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Today is ${today} (ISO week ${week}).

Run these ${searches.length} web searches this week, then compile the results:
${searchList}

Search thoroughly for all open grants that Wagner Farm Arboretum Foundation qualifies for. Cover federal, NJ state, and private foundation sources. Only include grants with future deadlines or upcoming open cycles.

For each grant, extract the application deadline if it is mentioned. Return it as an ISO date string (YYYY-MM-DD). If no deadline is mentioned, return null. Do not invent deadlines.

Return results as a raw JSON array only — no text, no markdown.`,
      },
    ],
  });

  const searchBlocks = response.content.filter(
    (b) => b.type === 'server_tool_use' && b.name === 'web_search'
  );
  console.log(`Agent performed ${searchBlocks.length} web searches`);
  console.log(
    `Tokens used — input: ${response.usage.input_tokens}, output: ${response.usage.output_tokens}`
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
      console.warn('Skipping grant missing title or url:', g);
      return false;
    }
    if (typeof g.fit_score !== 'number' || g.fit_score < 6) {
      return false;
    }
    if (g.deadline) {
      const deadline = new Date(g.deadline + 'T00:00:00');
      if (deadline < now) {
        console.warn('Skipping expired grant:', g.title, g.deadline);
        return false;
      }
    }
    return true;
  });

  console.log(`${valid.length} valid grants after filtering (${grants.length - valid.length} dropped)`);
  return valid;
}
