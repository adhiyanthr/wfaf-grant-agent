import { supabase } from './supabase'

export interface GrantRow {
  id: string
  title: string
  funder: string | null
  amount_min: number | null
  amount_max: number | null
  deadline: string | null
  url: string
  tags: string[] | null
}

export interface Analysis {
  strengths?: string[]
  considerations?: string[]
}

export interface Match {
  grant_id: string
  fit_score: number | null
  fit_rationale: string | null
  eligibility_flags: string[] | null
  analysis: Analysis | null
  first_seen: string | null
  grants: GrantRow
}

export interface FeedbackRow {
  id: string
  grant_id: string | null
  response: string | null
  note: string | null
  created_at: string
}

export interface OrgRow {
  id: string
  name: string | null
  email: string | null
  focus_areas: string[] | null
  county: string | null
  state: string | null
  is_501c3: boolean | null
  annual_budget: string | null
  grant_size_pref: string | null
  what_we_do: string | null
  target_population: string | null
  last_sent: string | null
}

const MATCH_SELECT =
  'grant_id, fit_score, fit_rationale, eligibility_flags, analysis, first_seen, ' +
  'grants(id, title, funder, amount_min, amount_max, deadline, url, tags)'

// This app is single-tenant: the signed-in user owns exactly one org row,
// linked via organizations.auth_user_id (not email — see RLS "owner can
// select/update own org").
export async function fetchOwnOrg(userId: string): Promise<OrgRow | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('auth_user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateOwnOrg(orgId: string, fields: Partial<OrgRow>) {
  const { error } = await supabase
    .from('organizations')
    .update(fields)
    .eq('id', orgId)
  if (error) throw error
}

export async function fetchMatches(orgId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from('org_grants')
    .select(MATCH_SELECT)
    .eq('org_id', orgId)
    .order('fit_score', { ascending: false })
  if (error) throw error
  return (data as unknown as Match[]) ?? []
}

export async function fetchMatch(orgId: string, grantId: string): Promise<Match | null> {
  const { data, error } = await supabase
    .from('org_grants')
    .select(MATCH_SELECT)
    .eq('org_id', orgId)
    .eq('grant_id', grantId)
    .maybeSingle()
  if (error) throw error
  return data as unknown as Match | null
}

export async function fetchLatestFeedback(orgId: string, grantId: string): Promise<FeedbackRow | null> {
  const { data, error } = await supabase
    .from('match_feedback')
    .select('id, grant_id, response, note, created_at')
    .eq('org_id', orgId)
    .eq('grant_id', grantId)
    .neq('response', 'message')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function submitFeedback(
  orgId: string,
  grantId: string | null,
  response: 'not_relevant' | 'already_applied' | 'more_like_this' | 'message',
  note: string | null
) {
  const { error } = await supabase
    .from('match_feedback')
    .insert({ org_id: orgId, grant_id: grantId, response, note })
  if (error) throw error
}

// DB stores fit 1-10; the app speaks 0-100.
export function displayScore(fit: number | null): string {
  return fit == null ? '—' : `${fit * 10}%`
}

export function formatAmount(min: number | null, max: number | null): string | null {
  if (!min && !max) return null
  if (max && !min) return `Up to $${max.toLocaleString()}`
  if (min && !max) return `From $${min!.toLocaleString()}`
  if (min === max) return `$${min!.toLocaleString()}`
  return `$${min!.toLocaleString()} – $${max!.toLocaleString()}`
}

export function daysUntil(deadline: string | null): number | null {
  if (!deadline) return null
  const diff = new Date(deadline).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
