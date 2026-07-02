import { searchGrantsForOrg } from './agent.js';
import {
  getActiveOrgs,
  getOrgByEmail,
  getRecentFeedbackForOrg,
  filterNewGrantsForOrg,
  saveOrgGrants,
  markOrgDigestSent,
} from './db.js';
import { sendDigest } from './email.js';

// Full per-org pipeline: search -> dedup -> persist -> email -> mark sent.
async function runForOrg(org) {
  console.log(`\n[${org.email}] ${org.name} — starting`);

  const feedback = await getRecentFeedbackForOrg(org.id);
  if (feedback.length) console.log(`  ${feedback.length} feedback item(s) injected into prompt`);

  const grants = await searchGrantsForOrg(org, feedback);
  console.log(`  ${grants.length} qualifying grants from search`);

  const newGrants = await filterNewGrantsForOrg(org.id, grants, feedback);
  console.log(`  ${newGrants.length} are new for this org`);

  if (!newGrants.length) {
    console.log('  No new grants — no email sent.');
    return { sent: 0 };
  }

  // saveOrgGrants dedupes by url and stamps each grant with its catalog id;
  // use its returned array so the digest/marking match what was persisted.
  const savedGrants = await saveOrgGrants(org.id, newGrants);
  await sendDigest(org, savedGrants);
  await markOrgDigestSent(org.id, savedGrants.map((g) => g.id).filter(Boolean));

  console.log(`  Done — ${savedGrants.length} grants emailed to ${org.email}`);
  return { sent: savedGrants.length };
}

async function run() {
  const start = Date.now();
  const target = process.env.TARGET_ORG_EMAIL?.trim();

  let orgs;
  if (target) {
    // Manual single-org run (workflow_dispatch / mid-week onboarding / demo).
    console.log(`[${new Date().toISOString()}] Single-org run for ${target}`);
    const org = await getOrgByEmail(target);
    if (!org) throw new Error(`No organization found with email ${target}`);
    if (!org.active) {
      console.warn(`Note: ${target} is marked inactive; sending anyway (manual run).`);
    }
    orgs = [org];
  } else {
    // Weekly cron path: every active org.
    console.log(`[${new Date().toISOString()}] GrantEquity grant agent starting (all active orgs)...`);
    orgs = await getActiveOrgs();
    console.log(`${orgs.length} active org(s) to process`);
  }

  let totalSent = 0;
  let failures = 0;

  // Sequential so we don't trip Anthropic rate limits; one org's failure must
  // not abort the rest of the batch.
  for (const org of orgs) {
    try {
      const { sent } = await runForOrg(org);
      totalSent += sent;
    } catch (err) {
      failures += 1;
      console.error(`  [${org.email}] FAILED: ${err.message}`);
    }
  }

  console.log(
    `\nAll done. ${totalSent} grant(s) emailed across ${orgs.length} org(s); ${failures} failure(s).`
  );
  console.log(`Completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);

  // Fail the CI run only if every org errored (likely a systemic problem).
  if (orgs.length && failures === orgs.length) process.exit(1);
}

run().catch((err) => {
  console.error('Grant agent failed:', err);
  process.exit(1);
});
