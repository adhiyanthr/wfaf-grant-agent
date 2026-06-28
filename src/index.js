import { searchGrants } from './agent.js';
import {
  getActiveOrgs,
  filterNewGrants,
  saveGrants,
  markDigestSent,
} from './db.js';
import { sendDigest } from './email.js';

// Run the full grant pipeline for a single organization.
async function runForOrg(org) {
  const grants = await searchGrants(org);
  console.log(`  ${org.name}: agent returned ${grants.length} qualifying grants`);

  const newGrants = await filterNewGrants(grants, org.id);
  console.log(`  ${org.name}: ${newGrants.length} new (not previously seen)`);

  if (!newGrants.length) {
    console.log(`  ${org.name}: no new grants — no email sent`);
    return { found: grants.length, newGrants: 0, emailSent: false };
  }

  await saveGrants(newGrants, org.id);
  await sendDigest(newGrants, org);
  await markDigestSent(newGrants.map((g) => g.url), org.id);

  console.log(`  ${org.name}: emailed ${newGrants.length} grants to ${org.email}`);
  return { found: grants.length, newGrants: newGrants.length, emailSent: true };
}

async function run() {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] Grant agent starting...`);

  const orgs = await getActiveOrgs();
  console.log(`Found ${orgs.length} active organization(s)`);

  let succeeded = 0;
  let failed = 0;

  for (const org of orgs) {
    console.log(`\n=== ${org.name} ===`);
    try {
      await runForOrg(org);
      succeeded++;
    } catch (err) {
      failed++;
      console.error(`  ${org.name}: FAILED — ${err.message}`);
      // Continue to the next org; one failure must not crash the whole run.
    }
  }

  console.log(
    `\nDone. ${succeeded} org(s) succeeded, ${failed} failed, ` +
      `${orgs.length} total. Completed in ${((Date.now() - start) / 1000).toFixed(1)}s`
  );
}

run().catch((err) => {
  console.error('Grant agent failed:', err);
  process.exit(1);
});
