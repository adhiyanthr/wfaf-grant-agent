// src/fetchPage.js
//
// Full-page fetch + HTML-strip helper for the fit-scoring pipeline. Reintroduces
// the fetch pattern from the reverted src/verify.js and adds a content hash so
// the scorer can skip re-scoring a grant whose eligibility text hasn't changed.
//
// The moat is per-(org, grant) reasoning against the FULL eligibility text, so
// this is the primary scoring input. When a fetch fails (bot block, JS-rendered
// page, PDF, timeout), the caller falls back to the web-search snippet and marks
// the match data_confidence = partial — this module only reports success/failure
// (returns text or null); it never fabricates content.

import { createHash } from 'node:crypto';

const FETCH_TIMEOUT_MS = 15000;
const MAX_PAGE_CHARS = 12000; // cap tokens fed to the scorer

// Fetch a URL and return crudely de-tagged, whitespace-collapsed text, or null
// if it can't be read as HTML/text (non-200, non-HTML content-type, timeout,
// network error). A null return is an explicit "full text unavailable" signal.
export async function fetchPageText(url) {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        // Some funder sites 403 a header-less client; a normal UA is enough.
        'User-Agent':
          'Mozilla/5.0 (compatible; GrantEquityBot/1.0; +https://grantequity.org)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ctype = res.headers.get('content-type') || '';
    // PDFs and other binary eligibility docs fall through to the snippet path.
    if (!ctype.includes('html') && !ctype.includes('text')) return null;

    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    return text ? text.slice(0, MAX_PAGE_CHARS) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Stable content hash of the eligibility text -> grants.eligibility_hash. Used to
// skip re-scoring a match whose scored_hash already equals this value. Normalizes
// whitespace so trivially different renders of the same page hash equally.
export function hashEligibilityText(text) {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return createHash('sha256').update(normalized).digest('hex');
}
