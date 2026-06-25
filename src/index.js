import { searchGrants } from './agent.js';
import { filterNewGrants, saveGrants, markDigestSent } from './db.js';
import { sendDigest } from './email.js';

async function run() {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] WFAF grant agent starting...`);

  // 1. Agent searches the web and returns scored grants
  const grants = await searchGrants();
  console.log(`Agent returned ${grants.length} qualifying grants`);

  // 2. Filter to only new grants (not already in DB)
  const newGrants = await filterNewGrants(grants);
  console.log(`${newGrants.length} are new (not previously seen)`);

  if (!newGrants.length) {
    console.log('No new grants this week. No email sent.');
    console.log(`Completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    return;
  }

  // 3. Persist new grants
  await saveGrants(newGrants);
  console.log(`Saved ${newGrants.length} new grants to Supabase`);

  // 4. Send email digest
  await sendDigest(newGrants);

  // 5. Mark as sent
  await markDigestSent(newGrants.map((g) => g.url));

  console.log(`Done. ${newGrants.length} grants emailed.`);
  console.log(`Completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

run().catch((err) => {
  console.error('Grant agent failed:', err);
  process.exit(1);
});
