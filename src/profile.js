// src/profile.js
//
// Builds the per-org system prompt for the grant research agent. Replaces the
// static WFAF-only prompt (wfaf-profile.js) so the same engine can serve any
// subscribed organization, built from its intake-form profile.

// Join a TEXT[] (or array-ish) into a readable, comma-separated string. Returns
// null when empty so callers can omit the line entirely.
function list(arr) {
  if (!arr || !arr.length) return null;
  const items = arr.filter(Boolean);
  return items.length ? items.join(', ') : null;
}

// Human-readable state for prompt text and search queries. `org.state` is a
// required field on the intake form (50-state dropdown), so this should
// always resolve; the fallback only covers legacy/test rows.
export function stateLabel(org) {
  return org.state || "the organization's state";
}

// General nonprofit funding source guidance, parameterized by state (no
// state-specific foundation names baked in — GrantEquity serves orgs
// nationwide, and a hardcoded NJ foundation list would misdirect every other
// state's search). The agent should pursue the categories relevant to THIS
// org's focus areas and location, using web search to find the actual named
// agencies/foundations for that state.
function sourceGuidance(state) {
  return `
COMMON NONPROFIT FUNDING SOURCE CATEGORIES (pursue the ones relevant to this org's focus and location; ignore the rest):

Federal:
- Grants.gov opportunities matching the org's field (USDA, EPA, HHS, HUD, NEA, NEH, DOE, AmeriCorps/CNCS, etc.)
- Sector-specific federal grants (e.g. USDA for food/agriculture, EPA for environment, HRSA/SAMHSA for health, IMLS/NEA for arts & culture, DOJ/OVW for safety)

${state} state & local:
- Search for ${state}'s own state agencies relevant to the org's focus (e.g. state arts council, department of agriculture, department of health or human services, department of education, economic development authority) — exact agency names vary by state, so search for them by name.
- ${state} community foundations and county/regional foundations serving the org's location.

Foundation / corporate:
- National corporate foundations that fund broadly across states (e.g. Wells Fargo, Home Depot, Walmart, Bank of America) when relevant to the org's focus.
- Major national and ${state}-based foundations relevant to the org's focus area — search for the largest funders active in ${state} for this sector.
`.trim();
}

// Render recent in-app feedback rows into prompt guidance. Rows come from
// getRecentFeedbackForOrg (db.js): { response, note, created_at, grants: { title, funder } }.
// 'message' rows are for humans, not the agent, and are filtered out upstream.
function feedbackSection(name, feedback) {
  if (!feedback || !feedback.length) return '';

  const label = (fb) => {
    const title = fb.grants?.title || 'an unnamed grant';
    const funder = fb.grants?.funder ? ` (${fb.grants.funder})` : '';
    const note = fb.note ? ` — their note: "${String(fb.note).slice(0, 200)}"` : '';
    return `"${title}"${funder}${note}`;
  };

  const groups = [
    ['not_relevant', 'They marked these NOT RELEVANT — do not return these grants again, and avoid close lookalikes (same funder/program type):'],
    ['already_applied', 'They ALREADY APPLIED to these — exclude these exact grants:'],
    ['more_like_this', 'They want MORE LIKE THESE — prioritize similar funders, program areas, and grant sizes:'],
  ];

  const parts = [];
  for (const [key, heading] of groups) {
    const rows = feedback.filter((fb) => fb.response === key).slice(0, 20);
    if (rows.length) parts.push(`${heading}\n${rows.map((fb) => `- ${label(fb)}`).join('\n')}`);
  }
  if (!parts.length) return '';

  return `\nFEEDBACK FROM ${name} ON PAST MATCHES (adjust this week's results accordingly):\n${parts.join('\n\n')}\n`;
}

// Build the system prompt for a single organization from its DB row, plus any
// recent in-app feedback the org has given on past matches.
export function buildSystemPrompt(org, feedback = []) {
  const name = org.name || 'this nonprofit';
  const focus = list(org.focus_areas);
  const state = stateLabel(org);
  const county = org.county ? `${org.county} County, ${state}` : state;

  const eligibility = org.is_501c3
    ? 'It is a registered 501(c)(3), so it is eligible for grants that require 501(c)(3) status.'
    : 'It may not hold 501(c)(3) status — prefer opportunities open to nonprofits without a 501(c)(3) requirement, or that allow a fiscal sponsor, and note when 501(c)(3) status is required.';

  const profileLines = [
    `- Name: ${name}`,
    focus ? `- Focus areas: ${focus}` : null,
    `- Location: ${county}`,
    org.what_we_do ? `- What they do: ${org.what_we_do}` : null,
    org.target_population ? `- Who they serve: ${org.target_population}` : null,
    org.annual_budget ? `- Annual budget: ${org.annual_budget}` : null,
    org.grant_size_pref ? `- Preferred grant size: ${org.grant_size_pref}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const sizeNote = org.grant_size_pref
    ? `Weigh grant size against the org's stated preference (${org.grant_size_pref}) and budget — flag grants far outside their capacity to manage.`
    : '';

  return `
You are a grant research agent working on behalf of ${name}, a nonprofit based in ${state}.

ABOUT THE ORGANIZATION:
${profileLines}

ELIGIBILITY:
${eligibility}

GRANT FIT CRITERIA — score each grant 1–10 for how well it fits ${name} specifically:
- HIGH FIT (8–10): Directly funds this org's focus areas${focus ? ` (${focus})` : ''}${org.target_population ? ` and the population it serves (${org.target_population})` : ''}.
- HIGH FIT (7–9): Strongly aligned program area, or grants targeted to ${county} nonprofits.
- GOOD FIT (6–8): ${state} statewide nonprofit grants the org is eligible for, or adjacent program areas.
- MEDIUM FIT (5–6): General operating / capacity-building / community-development grants open to ${state} nonprofits.
- LOW FIT (1–4): Outside the org's mission, geography, or eligibility.
${sizeNote}

${sourceGuidance(state)}
${feedbackSection(name, feedback)}
YOUR TASK:
Search comprehensively for OPEN grants ${name} qualifies for, across federal, ${state} state, and foundation/corporate sources relevant to its focus areas. Only include grants with deadlines in the future. If a grant recurs annually and the next cycle is open or upcoming, include it.

After completing your searches, output ONLY a raw JSON array — no explanation, no markdown, no code fences. Each object must have exactly these fields:

[
  {
    "title": "Full grant name",
    "funder": "Organization offering the grant",
    "amount_min": 5000,
    "amount_max": 50000,
    "deadline": "2026-09-15",
    "url": "https://direct-link-to-grant-page.org",
    "fit_score": 8,
    "fit_rationale": "One sentence explaining why this grant fits ${name} specifically",
    "tags": ["education", "${state}", "federal"],
    "eligibility_flags": ["Requires 501(c)(3)", "${county} orgs only"],
    "analysis": {
      "strengths": ["2-4 specific reasons this grant fits ${name}"],
      "considerations": ["0-2 caveats to verify before applying"]
    }
  }
]

Rules:
- Only include grants scoring 6 or higher.
- Extract the application deadline if it is mentioned. Return it as an ISO date string (YYYY-MM-DD). If none is mentioned, return null. Do not invent deadlines.
- Use null for amount_min, amount_max, or deadline if unknown.
- URL must be a real, specific page (not a homepage).
- fit_rationale must reference something specific about ${name} (a focus area, population served, or program).
- eligibility_flags: hard requirements a small nonprofit could trip on (501(c)(3) status, geography, budget caps, org type). Empty array if none are stated.
- analysis.strengths: 2-4 short bullets, each tying the grant to ${name}'s focus areas, population, location, or budget. analysis.considerations: 0-2 short bullets on things to verify (match requirements, restrictions, effort vs. award size).
- Return only the JSON array — nothing else, no text before or after.
`.trim();
}
