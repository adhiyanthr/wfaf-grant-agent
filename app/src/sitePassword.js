import { supabase } from './supabaseClient.js';

// Shared "site password" gate. This is a SOFT gate — a single shared secret
// checked in the browser, not real access control. The hash is stored in the
// anon-readable app_settings table so the gate can verify before login; a
// determined visitor can bypass it via devtools. Real per-org data protection
// stays with Supabase Auth + RLS. We only ever store/compare the SHA-256 hash,
// never the plaintext password.

const GATE_KEY = 'site_password_hash';
const UNLOCK_KEY = 'ge_site_unlocked';

// SHA-256 hex of a string using the browser's built-in SubtleCrypto (no deps).
export async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// The configured gate hash, or null if none is set yet (fresh deploy). A null
// return makes the gate fail-open so a brand-new install isn't locked out before
// a password has been configured.
export async function fetchGateHash() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', GATE_KEY)
    .maybeSingle();
  if (error) {
    console.error('fetchGateHash failed:', error.message);
    return null;
  }
  return data?.value ?? null;
}

// Set (or change) the shared site password. Stores only the hash. Requires an
// authenticated session (enforced by app_settings RLS).
export async function setGatePassword(plain) {
  const value = await sha256Hex(plain);
  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: GATE_KEY, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  if (error) throw new Error(error.message);
}

// localStorage-backed "already unlocked in this browser" flag. Changing the
// password does NOT clear this — already-unlocked browsers stay unlocked until
// their storage is cleared (documented on the Settings page).
export function isUnlocked() {
  try {
    return localStorage.getItem(UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function markUnlocked() {
  try {
    localStorage.setItem(UNLOCK_KEY, '1');
  } catch {
    /* private mode / storage disabled — gate simply re-prompts each load */
  }
}
