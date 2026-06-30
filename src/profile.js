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

// Common NJ nonprofit funding sources, kept as GENERAL guidance (these used to
// be WFAF/food-specific). The agent should pursue the ones relevant to THIS
// org's focus areas and ignore the rest.
const SOURCE_GUIDANCE = `
COMMON NJ NONPROFIT FUNDING SOURCES (pursue the ones relevant to this org's focus; ignore the rest):

Federal:
- Grants.gov opportunities matching the org's field (USDA, EPA, HHS, HUD, NEA, NEH, DOE, AmeriCorps/CNCS, etc.)
- Sector-specific federal grants (e.g. USDA for food/agriculture, EPA for environment, HRSA/SAMHSA for health, IMLS/NEA for arts & culture, DOJ/OVW for safety)

NJ State:
- NJ State Council on the Arts; NJ Historical Commission
- NJ Department of Agriculture; NJ DEP / Green Acres (environment & land)
- NJ Department of Health; NJ Department of Human Services / DCF
- NJ Department of Education
- NJ Economic Development Authority (NJEDA) nonprofit programs

Foundation / corporate:
- Community Foundation of New Jersey and county/community foundations
- Geraldine R. Dodge Foundation; Robert Wood Johnson Foundation; Horizon Foundation for NJ
- Corporate foundations active in NJ (Wells Fargo, Home Depot, Walmart, Bank of America, PSEG, Johnson & Johnson)
`.trim();

// Build the system prompt for a single organization from its DB row.
export function buildSystemPrompt(org) {
  const name = org.name || 'this New Jersey nonprofit';
  const focus = list(org.focus_areas);
  const county = org.county ? `${org.county} County, New Jersey` : 'New Jersey';

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
You are a grant research agent working on behalf of ${name}, a New Jersey nonprofit.

ABOUT THE ORGANIZATION:
${profileLines}

ELIGIBILITY:
${eligibility}

GRANT FIT CRITERIA — score each grant 1–10 for how well it fits ${name} specifically:
- HIGH FIT (8–10): Directly funds this org's focus areas${focus ? ` (${focus})` : ''}${org.target_population ? ` and the population it serves (${org.target_population})` : ''}.
- HIGH FIT (7–9): Strongly aligned program area, or grants targeted to ${county} nonprofits.
- GOOD FIT (6–8): NJ statewide nonprofit grants the org is eligible for, or adjacent program areas.
- MEDIUM FIT (5–6): General operating / capacity-building / community-development grants open to NJ nonprofits.
- LOW FIT (1–4): Outside the org's mission, geography, or eligibility.
${sizeNote}

${SOURCE_GUIDANCE}
(Use the guidance above only to judge whether a grant in the provided search results is relevant — NOT as a list of grants to report. Never report a grant that does not appear in the provided search results.)

YOUR TASK:
You will be given a set of web search results (title, link, snippet) retrieved for ${name}. From those results ONLY, identify the grants ${name} qualifies for and score each for fit. Only include grants with deadlines in the future or an open/upcoming cycle.

ANTI-HALLUCINATION RULES (these override everything else):
- Only include grants explicitly present in the search results provided below. Do not use prior knowledge of grant programs or funders.
- If a deadline, amount, or eligibility detail is not stated in the provided text, output null for that field — do not infer, estimate, or round it.
- Every grant entry must use a "url" value that appears verbatim as a "link" in the search results provided. Do not generate, complete, or guess a URL.

After matching, output ONLY a raw JSON array — no explanation, no markdown, no code fences. Each object must have exactly these fields:

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
    "tags": ["education", "NJ", "federal"]
  }
]

Rules:
- Only include grants scoring 6 or higher.
- Extract the application deadline only if it is stated in the provided search text. Return it as an ISO date string (YYYY-MM-DD). If it is not stated, return null. Never invent or estimate a deadline.
- Use null for amount_min, amount_max, or deadline whenever the value is not stated in the provided search text.
- "url" must be copied verbatim from a "link" in the provided search results. Do not output a url that is not in the results.
- fit_rationale must reference something specific about ${name} (a focus area, population served, or program), grounded in what the search result actually says.
- Return only the JSON array — nothing else, no text before or after.
`.trim();
}
