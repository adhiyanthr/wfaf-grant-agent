// Client for the token-gated, no-login dashboard (/dashboard/<token>).
//
// Unlike the rest of this app, this path has NO Supabase auth session. The
// org's static dashboard_token IS the credential. We never query Supabase
// directly here (that would require the anon key + RLS, which can't see data
// without a signed-in user); instead we call the `dashboard-view` edge
// function, which resolves the token server-side with the service-role key.
//
// The token is sent in the JSON POST body, never in the URL, so it does not
// land in the function's HTTP access logs.

import type { Match } from './matches'

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ENDPOINT = `${FUNCTIONS_BASE}/dashboard-view`

// The anon key is required by the Supabase functions gateway even for a
// --no-verify-jwt function (it gates the platform, not the app). It is public
// by design and already shipped in this bundle for the authed paths.
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export interface DashboardOrg {
  name: string | null
  focus_areas: string[] | null
  county: string | null
  state: string | null
  last_sent: string | null
}

export type FeedbackResponse = 'not_relevant' | 'more_like_this' | 'already_applied'

export interface FeedbackEntry {
  grant_id: string
  response: FeedbackResponse
  created_at: string
}

export interface DashboardData {
  org: DashboardOrg
  matches: Match[]
  feedback: FeedbackEntry[]
}

// Thrown for a bad/unknown token so the UI can show a generic "not found".
export class DashboardError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

async function call(body: Record<string, unknown>): Promise<any> {
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      // No-referrer at the fetch level too, so the token URL never leaks via
      // the Referer header on this request.
      referrerPolicy: 'no-referrer',
      body: JSON.stringify(body),
    })
  } catch {
    throw new DashboardError('network')
  }

  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON error body */
  }

  if (!res.ok || (data && data.error)) {
    throw new DashboardError(data?.error ?? `http_${res.status}`)
  }
  return data
}

export function fetchDashboard(token: string): Promise<DashboardData> {
  return call({ token, action: 'view' })
}

export function submitTokenFeedback(
  token: string,
  grantId: string,
  response: FeedbackResponse
): Promise<void> {
  return call({ token, action: 'feedback', grant_id: grantId, response }).then(() => {})
}

export function markApplied(token: string, grantId: string): Promise<void> {
  return call({ token, action: 'applied', grant_id: grantId }).then(() => {})
}

// Kicks off an on-demand grant search for this org. On failure the thrown
// DashboardError carries the server's reason as `.code` (e.g. 'not_configured'
// when the GitHub dispatch token isn't set), so the UI can explain what
// happened — exactly like the authed triggerSearch() path.
export function triggerTokenRefresh(token: string): Promise<void> {
  return call({ token, action: 'refresh' }).then(() => {})
}

export interface SettingsOrg {
  name: string | null
  focus_areas: string[] | null
  county: string | null
  state: string | null
  is_501c3: boolean | null
  annual_budget: string | null
  grant_size_pref: string | null
  what_we_do: string | null
  target_population: string | null
  // Email on/off (subscribe/unsubscribe) and cadence in days (7/14/30).
  active: boolean | null
  frequency_days: number | null
}

// Grants whose latest feedback is "I applied", with when each was marked.
// Server-side and not deadline-filtered, so applications outlive the matches
// view's 3-month window.
export interface AppliedData {
  matches: Match[]
  applied_at: Record<string, string>
}

export function fetchAppliedList(token: string): Promise<AppliedData> {
  return call({ token, action: 'applied_list' })
}

// Change the shared site password from Settings (authorized by the current
// site password) — the server verifies and stores only hashes.
export function changeSitePassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  return call({
    token,
    action: 'site_password_change',
    current_password: currentPassword,
    new_password: newPassword,
  }).then(() => {})
}

// Admin actions. The admin password is sent with every call and re-verified
// server-side each time — the client never decides whether it's correct.
export function verifyAdmin(token: string, adminPassword: string): Promise<void> {
  return call({ token, action: 'admin_verify', admin_password: adminPassword }).then(() => {})
}

export function changeAdminPassword(
  token: string,
  adminPassword: string,
  newPassword: string
): Promise<void> {
  return call({
    token,
    action: 'admin_change_password',
    admin_password: adminPassword,
    new_password: newPassword,
  }).then(() => {})
}

export function changeSitePasswordAsAdmin(
  token: string,
  adminPassword: string,
  newPassword: string
): Promise<void> {
  return call({
    token,
    action: 'site_password_change',
    admin_password: adminPassword,
    new_password: newPassword,
  }).then(() => {})
}

export function fetchTokenSettings(token: string): Promise<{ org: SettingsOrg }> {
  return call({ token, action: 'settings_get' })
}

export function updateTokenSettings(
  token: string,
  fields: Partial<SettingsOrg>
): Promise<void> {
  return call({ token, action: 'settings_update', fields }).then(() => {})
}
