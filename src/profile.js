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

// Human-readable eligibility line from the richer org_status column, falling
// back to the legacy is_501c3 boolean. Shared by the discovery and scoring
// prompts so both describe eligibility the same way.
function eligibilityLine(org) {
  const status = org.org_status || (org.is_501c3 === true ? '501c3' : org.is_501c3 === false ? 'pending' : 'unknown');
  switch (status) {
    case '501c3':
      return 'It is a registered 501(c)(3), so it is eligible for grants that require 501(c)(3) status.';
    case 'fiscal_sponsor':
      return 'It operates under a fiscal sponsor — it can pursue grants that require 501(c)(3) status via its sponsor, but note when a direct 501(c)(3) determination letter is required.';
    case 'pending':
      return 'Its 501(c)(3) status is pending — prefer opportunities open to nonprofits without a confirmed 501(c)(3), or that allow a fiscal sponsor, and flag any that hard-require an existing determination letter.';
    default:
      return 'Its 501(c)(3) status is unknown — prefer opportunities open to nonprofits without a 501(c)(3) requirement, or that allow a fiscal sponsor, and note when 501(c)(3) status is required.';
  }
}

// The org's location, preferring the richer geo_focus column, then county/state.
function locationText(org) {
  if (org.geo_focus) return org.geo_focus;
  if (org.county) return `${org.county} County, New Jersey`;
  return 'New Jersey';
}

// Profile bullet lines shared by discovery and scoring prompts. Prefers the
// richer platform columns (mission_text, programs_text, budget_range, ...) and
// falls back to the legacy intake columns (what_we_do, annual_budget, ...).
function profileBullets(org) {
  const name = org.name || 'this New Jersey nonprofit';
  const focus = list(org.focus_areas);
  return [
    `- Name: ${name}`,
    focus ? `- Focus areas: ${focus}` : null,
    `- Location: ${locationText(org)}`,
    (org.mission_text || org.what_we_do) ? `- Mission / what they do: ${org.mission_text || org.what_we_do}` : null,
    org.programs_text ? `- Programs: ${org.programs_text}` : null,
    org.target_population ? `- Who they serve: ${org.target_population}` : null,
    (org.budget_range || org.annual_budget) ? `- Annual budget: ${org.budget_range || org.annual_budget}` : null,
    org.grant_size_pref ? `- Preferred grant size: ${org.grant_size_pref}` : null,
    org.founded_year ? `- Founded: ${org.founded_year}` : null,
    `- Legal status: ${org.org_status || (org.is_501c3 === true ? '501c3' : 'unknown')}`,
  ]
    .filter(Boolean)
    .join('\n');
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
  const name = org.name || 'this New Jersey nonprofit';
  const focus = list(org.focus_areas);
  const state = stateLabel(org);
  const county = org.county ? `${org.county} County, ${state}` : state;

  const eligibility = eligibilityLine(org);

  const profileLines = profileBullets(org);

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
Search comprehensively for OPEN grants ${name} qualifies for, across federal, ${state} state, and foundation/corporate sources relevant to its focus areas. Only include grants the org can act on NOW: the application deadline must be in the future and within the NEXT 3 MONTHS. Rolling or open-ended grants that are accepting applications today are fine. Do NOT include grants whose deadline is more than 3 months away or whose next cycle hasn't opened yet — they'll be picked up in a later week once applications open.

If you find nothing new that is genuinely worth applying to, return an empty array []. Never pad the list with weak, borderline, or filler matches — an empty week is a valid, expected result.

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
- Only include grants whose deadline is within the next 3 months (rolling/no-deadline grants that are open now are allowed). Return [] if nothing qualifies.
- Extract the application deadline if it is mentioned. Return it as an ISO date string (YYYY-MM-DD). If none is mentioned, return null. Do not invent deadlines.
- Use null for amount_min, amount_max, or deadline if unknown.
- URL must be a real, specific page (not a homepage).
- fit_rationale must reference something specific about ${name} (a focus area, population served, or program).
- eligibility_flags: hard requirements a small nonprofit could trip on (501(c)(3) status, geography, budget caps, org type). Empty array if none are stated.
- analysis.strengths: 2-4 short bullets, each tying the grant to ${name}'s focus areas, population, location, or budget. analysis.considerations: 0-2 short bullets on things to verify (match requirements, restrictions, effort vs. award size).
- Return only the JSON array — nothing else, no text before or after.
`.trim();
}

// ---------------------------------------------------------------------------
// Fit SCORING prompt (the moat). A separate, deterministic pass that scores
// each already-discovered candidate grant against its FULL eligibility text (or,
// on fetch failure, the web-search snippet) and emits the four required outputs.
// ---------------------------------------------------------------------------

// System prompt for the per-(org, grant) scoring call. Describes the org and the
// strict output contract. Explicitly bans generic praise and requires partial
// (snippet-only) inputs to be hedged.
export function buildScoringSystemPrompt(org) {
  const name = org.name || 'this New Jersey nonprofit';

  return `
You are a grant fit analyst working on behalf of ${name}, a New Jersey nonprofit. You do NOT search the web. You are given a set of candidate grants, each with its eligibility text, and you score how well each fits ${name} SPECIFICALLY.

ABOUT THE ORGANIZATION:
${profileBullets(org)}

ELIGIBILITY:
${eligibilityLine(org)}

For each grant you must produce, based ONLY on the eligibility text provided for that grant plus the org profile above:

1. fit_score — integer 1–10:
   - 8–10: directly funds this org's focus areas / programs / population, and the org clearly meets eligibility.
   - 6–7: strong program-area or geographic alignment; eligible or eligible via fiscal sponsor.
   - 4–5: adjacent or general-operating; eligible but not a strong programmatic match.
   - 1–3: outside the org's mission, geography, or hard-blocked by eligibility.

2. fit_reasoning — 2–3 sentences that CITE SPECIFIC details: name a concrete focus area, program, population, geography, or funding stage from BOTH the org profile and the grant. Generic praise ("great opportunity", "strong fit for your mission") is a BUG — every sentence must reference something concrete.

3. eligibility_flags — array of short strings naming HARD BLOCKERS or caveats you can see (e.g. "requires 501(c)(3); org_status=pending", "NJ-only, org is in-state OK", "requires 3 years operating history"). Empty array if none.

4. effort_estimate — "low", "medium", or "high": application complexity RELATIVE TO the award size (a large grant with a light LOI is "low"; a small grant with a full narrative + audited financials is "high").

DATA CONFIDENCE — read carefully:
- Grants marked [CONFIDENCE: FULL] include the grant's full eligibility page text. Score with normal confidence.
- Grants marked [CONFIDENCE: LIMITED] include ONLY a short web-search snippet — the full eligibility page could not be fetched. For these, you are working from limited eligibility info. Your fit_reasoning MUST hedge accordingly: begin with wording like "Based on limited eligibility info available, this appears to..." and avoid stating eligibility or fit with full-text confidence. Do not invent eligibility details that aren't in the snippet.

OUTPUT CONTRACT:
Return ONLY a raw JSON array — no markdown, no code fences, no prose. One object per input grant, in the SAME ORDER, each with exactly:
[
  {
    "index": 0,
    "fit_score": 8,
    "fit_reasoning": "2–3 sentences citing specific org + grant details.",
    "eligibility_flags": ["requires 501(c)(3); org_status=pending"],
    "effort_estimate": "medium"
  }
]
- Include every input grant exactly once, matched by its "index".
- Return only the JSON array — nothing before or after.
`.trim();
}

// Build the user message listing candidate grants for the scoring call. Each
// grant block carries its data-confidence marker and either its full eligibility
// text or (on fetch failure) its search snippet. `grants` items are expected to
// have: title, funder, url, dataConfidence ('full'|'partial'), and eligibilityInput.
export function buildScoringUserPrompt(grants) {
  const blocks = grants.map((g, i) => {
    const marker = g.dataConfidence === 'partial' ? 'LIMITED' : 'FULL';
    const source = g.dataConfidence === 'partial'
      ? 'WEB-SEARCH SNIPPET (full page unavailable)'
      : 'FULL ELIGIBILITY PAGE TEXT';
    return `--- GRANT index=${i} [CONFIDENCE: ${marker}] ---
Title: ${g.title || '(untitled)'}
Funder: ${g.funder || '(unknown)'}
URL: ${g.url || '(none)'}
${source}:
"""
${(g.eligibilityInput || '').slice(0, 12000) || '(no eligibility text available)'}
"""`;
  });

  return `Score the following ${grants.length} candidate grant(s) for this organization. Respect each grant's [CONFIDENCE] marker: hedge the reasoning for LIMITED grants.

${blocks.join('\n\n')}

Return ONLY the JSON array described in your instructions — one object per grant, matched by index.`;
}
