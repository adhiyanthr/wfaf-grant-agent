// src/score-preview.js
//
// Validation GATE for the fit-scoring pipeline (plan step 2). Runs the new
// scorer over 5–10 real (org, grant) pairs — INCLUDING at least one forced
// fetch-failure case — and prints reasoning / flags / effort / confidence for
// manual quality review. Do NOT enable per-grant scoring in the cron until this
// passes on BOTH the full and partial paths.
//
// Usage:
//   node --env-file=.env src/score-preview.js
//   TARGET_ORG_EMAIL=org@example.com node --env-file=.env src/score-preview.js
//
// What to check by eye:
//   * every FULL-confidence fit_reasoning cites concrete org/grant specifics;
//   * every PARTIAL-confidence fit_reasoning hedges ("based on limited...");
//   * eligibility_flags + effort_estimate are sane;
//   * the forced-failure grant comes back data_confidence=partial,
//     eligibility_text_unavailable=true;
//   * GUARD lines show filler/un-hedged output being dropped.

import { scoreGrantsForOrg } from './agent.js';
import { getActiveOrgs, getOrgByEmail, getSampleGrants } from './db.js';

// A URL that will not resolve — forces the fetch-failure -> snippet -> partial
// path so we can confirm the fallback + hedge behavior end to end.
const FORCED_FAILURE_GRANT = {
  title: 'Forced-Failure Test Grant (unreachable page)',
  funder: 'Preview Harness',
  url: 'https://this-domain-does-not-exist.grantequity-preview.invalid/grant',
  deadline: null,
  amount_min: 10000,
  amount_max: 50000,
  // Snippet the partial path will score off of.
  snippet:
    'Small operating grants for New Jersey nonprofits serving youth. 501(c)(3) required. Awards $10,000–$50,000. Rolling deadline.',
};

function fmt(g) {
  const lines = [
    `\n────────────────────────────────────────────────────────`,
    `TITLE:   ${g.title}`,
    `FUNDER:  ${g.funder || '(unknown)'}`,
    `URL:     ${g.url}`,
    `SCORE:   ${g.fit_score ?? '—'}   EFFORT: ${g.effort_estimate ?? '—'}   CONFIDENCE: ${g.data_confidence ?? '—'}   text_unavailable: ${g.eligibility_text_unavailable ?? false}`,
    `FLAGS:   ${JSON.stringify(g.eligibility_flags ?? [])}`,
    `REASONING: ${g.fit_reasoning || '(none)'}`,
  ];
  if (g.guard_issues?.length) lines.push(`⚠ GUARD:  ${g.guard_issues.join('; ')}`);
  return lines.join('\n');
}

async function main() {
  const target = process.env.TARGET_ORG_EMAIL?.trim();
  const org = target ? await getOrgByEmail(target) : (await getActiveOrgs())[0];
  if (!org) {
    console.error('No org found. Set TARGET_ORG_EMAIL or seed an active org.');
    process.exit(1);
  }
  console.log(`Preview org: ${org.name} <${org.email}>`);

  const real = await getSampleGrants(org.id, 7);
  console.log(`Loaded ${real.length} real grant(s) + 1 forced-failure case.`);
  if (!real.length) {
    console.warn('No existing grants for this org — running the forced-failure case only.');
  }

  // Pass a fresh (empty) cache so every grant is actually (re-)scored.
  const pairs = [...real, { ...FORCED_FAILURE_GRANT }];
  await scoreGrantsForOrg(org, pairs, new Map());

  // scoreGrantsForOrg mutates each grant in place (including dropped ones), so
  // iterate the full input to see guard drops too.
  console.log('\n=========== SCORING RESULTS (all candidates) ===========');
  for (const g of pairs) console.log(fmt(g));

  const partials = pairs.filter((g) => g.data_confidence === 'partial');
  const dropped = pairs.filter((g) => g.guard_issues?.length);
  console.log(`\nSummary: ${pairs.length} candidate(s), ${partials.length} partial-confidence, ${dropped.length} dropped by guards.`);
  const forced = pairs.find((g) => g.url === FORCED_FAILURE_GRANT.url);
  if (forced && forced.data_confidence === 'partial' && forced.eligibility_text_unavailable) {
    console.log('✓ Forced-failure case correctly fell back to partial + text_unavailable.');
  } else {
    console.warn('✗ Forced-failure case did NOT produce the expected partial fallback — investigate.');
  }
}

main().catch((err) => {
  console.error('score-preview failed:', err);
  process.exit(1);
});
