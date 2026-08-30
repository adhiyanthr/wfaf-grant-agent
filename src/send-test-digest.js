// Manual utility: send ONE digest email to an org using its already-saved
// matches, bypassing the search/dedup pipeline. For verifying the email path
// end-to-end when a normal run finds no NEW grants (so it would send nothing).
//
// Run via the "Send Test Digest" workflow (workflow_dispatch) — it has the
// RESEND_API_KEY secret. NOT part of the weekly cron. Deliberately does NOT
// bump last_sent / mark grants sent, so it can't disturb the real cadence.
//
//   TARGET_ORG_EMAIL=adhiyanth.r@gmail.com node src/send-test-digest.js

import { createClient } from '@supabase/supabase-js';
import { sendDigest } from './email.js';

const email = (process.env.TARGET_ORG_EMAIL || '').trim();
if (!email) throw new Error('TARGET_ORG_EMAIL is required');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Full org row (need dashboard_token / unsubscribe_token for the footer links).
const { data: org, error: orgErr } = await supabase
  .from('organizations')
  .select('*')
  .ilike('email', email)
  .maybeSingle();
if (orgErr) throw new Error(`org lookup failed: ${orgErr.message}`);
if (!org) throw new Error(`No organization found with email ${email}`);

// The org's saved matches, best fit first. org_grants.id IS the match id.
const { data: rows, error: mErr } = await supabase
  .from('org_grants')
  .select(
    'id, fit_score, fit_rationale, fit_reasoning, eligibility_flags, analysis, ' +
      'data_confidence, grants(id, title, funder, amount_min, amount_max, deadline, url, tags)'
  )
  .eq('org_id', org.id)
  .order('fit_score', { ascending: false })
  .limit(5);
if (mErr) throw new Error(`matches lookup failed: ${mErr.message}`);

// Only send grants the dashboard actually shows (mirrors dashboard-view's
// inApplyWindow): rolling/undated grants are shown; dated grants only while
// within the 90-day window. Otherwise the test email lists expired grants the
// site hides, and their "Review match" links 404.
const DAY_MS = 24 * 60 * 60 * 1000;
function inApplyWindow(deadline) {
  if (!deadline) return true; // rolling/undated
  const d = new Date(deadline + 'T00:00:00');
  if (isNaN(d.getTime())) return true;
  const days = Math.ceil((d.getTime() - Date.now()) / DAY_MS);
  return days >= 0 && days <= 90;
}

// Flatten the (org_grants + grants) join into the shape buildGrantCard expects.
const grants = (rows || [])
  .filter((r) => r.grants && inApplyWindow(r.grants.deadline))
  .map((r) => ({
    id: r.grants.id,
    match_id: r.id,
    title: r.grants.title,
    funder: r.grants.funder,
    amount_min: r.grants.amount_min,
    amount_max: r.grants.amount_max,
    deadline: r.grants.deadline,
    url: r.grants.url,
    tags: r.grants.tags,
    fit_score: r.fit_score,
    fit_rationale: r.fit_rationale,
    fit_reasoning: r.fit_reasoning,
    eligibility_flags: r.eligibility_flags,
    analysis: r.analysis,
    data_confidence: r.data_confidence,
  }));

if (!grants.length) {
  throw new Error(
    `No in-window saved matches for ${email} — nothing to send (all saved grants are expired or out of the 90-day window).`
  );
}

console.log(`Sending a test digest to ${email} with ${grants.length} saved match(es)...`);
const id = await sendDigest(org, grants);
console.log(`Test digest sent. Resend ID: ${id}`);
