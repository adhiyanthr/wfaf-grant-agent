import { supabase } from './supabase'

// Shared "site password" curtain for the whole dashboard site. This is a SOFT
// gate — a single shared secret checked in the browser, not real access
// control. The SHA-256 hash lives in the anon-readable app_settings table (see
// migrations/wf_site_admin_password.sql); a determined visitor can bypass the
// gate via devtools. Real data protection stays with the dashboard token +
// dashboard-view edge function. Only hashes are stored/compared, never the
// plaintext password.

const GATE_KEY = 'site_password_hash'
const UNLOCK_KEY = 'wf_site_unlocked'

// SHA-256 hex of a string using the browser's built-in SubtleCrypto (no deps).
export async function sha256Hex(str: string): Promise<string> {
  const bytes = new TextEncoder().encode(str)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// The configured gate hash, or null if none is set (fresh install, or the
// migration hasn't been run yet). A null return makes the gate fail-open so
// the site is never bricked by missing config.
export async function fetchGateHash(): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', GATE_KEY)
    .maybeSingle()
  if (error) {
    console.error('fetchGateHash failed:', error.message)
    return null
  }
  return data?.value ?? null
}

// localStorage-backed "already unlocked in this browser" flag. Changing the
// password does NOT clear this — already-unlocked browsers stay unlocked until
// their storage is cleared (noted on the Settings page).
export function isUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === '1'
  } catch {
    return false
  }
}

export function markUnlocked(): void {
  try {
    localStorage.setItem(UNLOCK_KEY, '1')
  } catch {
    /* private mode / storage disabled — gate simply re-prompts each load */
  }
}
