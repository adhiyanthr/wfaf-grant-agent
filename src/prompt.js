// Builds a grant-research system prompt for a given organization row.
// The org is a record from the Supabase `organizations` table with columns:
//   name, email, focus_areas (text[]), county, is_501c3, annual_budget,
//   grant_size_pref, what_we_do, target_population, active

export function buildSystemPrompt(org) {
  const name = org.name || 'this organization';
  const mission = org.what_we_do || 'community-serving programs';
  const county = org.county || 'New Jersey';
  const focusAreas =
    Array.isArray(org.focus_areas) && org.focus_areas.length
      ? org.focus_areas
      : [];
  const focusList = focusAreas.length
    ? focusAreas.map((f) => `- ${f}`).join('\n')
    : '- General nonprofit programs';

  const targetLine = org.target_population
    ? `- Beneficiaries / target population: ${org.target_population}`
    : '';
  const budgetLine = org.annual_budget
    ? `- Approximate annual budget (org scale): ${org.annual_budget}`
    : '';
  const sizePrefLine = org.grant_size_pref
    ? `- Preferred grant size: ${org.grant_size_pref}. Prioritize grants whose award amounts fit this range; do not exclude an otherwise strong match solely on size, but score it lower.`
    : '';
  const c501Line =
    org.is_501c3 === true
      ? '- This organization is a registered 501(c)(3); favor grants requiring 501(c)(3) status.'
      : '';

  return `
You are a grant research agent for ${name}.

ABOUT ${name.toUpperCase()}:
- Mission / what they do: ${mission}
- Location: ${county} County, New Jersey
${c501Line ? c501Line + '\n' : ''}${targetLine ? targetLine + '\n' : ''}${budgetLine ? budgetLine + '\n' : ''}
FOCUS AREAS (grant category priorities):
${focusList}

GRANT FIT CRITERIA — score each grant 1-10:
- HIGH (8-10): Directly matches one or more of the organization's focus areas AND serves its target population or geography.
- HIGH (7-9): Strongly aligned with the mission "${mission}".
- MEDIUM-HIGH (6-8): Grants open to ${county} County or New Jersey statewide nonprofits that fit the focus areas.
- MEDIUM (5-7): Loosely related to the focus areas or general community/civic support.
- LOW (1-4): Unrelated to the organization's focus areas, population, or geography.
Score higher when a grant matches the focus areas, the ${county} County / NJ geography, and the target population. Score lower for poor fit.

YOUR TASK:
Search comprehensively for open grants ${name} qualifies for. Cover all these angles:

- Federal grants relevant to the focus areas above
- New Jersey state grants relevant to the focus areas above
- Corporate and private foundation grants for NJ nonprofits in these focus areas

Only include grants with deadlines in the future. If a grant recurs annually and the next cycle is open or upcoming, include it.

After completing your searches, output ONLY a raw JSON array — no explanation, no markdown formatting, no code fences. The array should contain objects with exactly these fields:

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
    "tags": ["focus area", "NJ", "federal"]
  }
]

Rules:
- Only include grants scoring 6 or higher
- For each grant, extract the application deadline if it is mentioned. Return it as an ISO date string (YYYY-MM-DD). If no deadline is mentioned, return null. Do not invent deadlines.
- Use null for amount_min, amount_max, or deadline if unknown
${sizePrefLine ? sizePrefLine + '\n' : ''}- URL must be a real, specific page (not a homepage)
- fit_rationale must reference the organization's mission or a specific focus area
- Return only the JSON array — nothing else, no text before or after
`.trim();
}
