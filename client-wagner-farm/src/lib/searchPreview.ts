// Mirrors src/agent.js buildOrgSearches / funderSearches so the dashboard can
// show the EXACT queries the weekly agent will run for the current settings.
// Keep in sync with the agent if that logic changes.

function funderSearches(state: string): string[] {
  return [
    `federal grants available ${state} nonprofits`,
    `${state} state grants nonprofits`,
    `corporate foundation grants ${state}`,
    `private foundation grants ${state} nonprofits`,
  ]
}

// ISO 8601 week number (1–53) — used to rotate the funder-type query weekly.
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d as any) - (yearStart as any)) / 86400000 + 1) / 7)
}

export interface SearchInputs {
  state: string
  county: string
  focus_areas: string[]
}

// The literal web searches the agent will run next, given these inputs.
export function previewSearches(inputs: SearchInputs, now = new Date()): string[] {
  const week = getISOWeek(now)
  const month = now.toLocaleString('en-US', { month: 'long' })
  const year = now.getFullYear()

  const state = inputs.state.trim() || "the organization's state"
  const county = inputs.county.trim() ? `${inputs.county.trim()} County ${state}` : state
  const focusAreas = inputs.focus_areas.filter(Boolean)

  const searches = [
    `${state} nonprofit grants deadline ${month} ${year}`,
    `${county} nonprofit grants ${year}`,
  ]

  if (focusAreas.length) {
    for (const area of focusAreas.slice(0, 3)) {
      searches.push(`${area} grants ${state} nonprofits ${year}`)
    }
  } else {
    searches.push(`grants for ${state} nonprofits ${year}`)
  }

  const funders = funderSearches(state)
  searches.push(funders[week % funders.length])

  return searches
}

// The agent's cron is Monday 14:00 UTC (10am ET). Next occurrence from `now`.
export function nextMondayRun(now = new Date()): Date {
  const d = new Date(now)
  // 1 = Monday
  const day = d.getUTCDay()
  let daysUntilMon = (1 - day + 7) % 7
  const candidate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 14, 0, 0))
  if (daysUntilMon === 0 && now.getTime() >= candidate.getTime()) {
    daysUntilMon = 7 // today is Monday but past 14:00 UTC
  }
  candidate.setUTCDate(candidate.getUTCDate() + daysUntilMon)
  return candidate
}

// The cron fires every Monday, but the agent skips an org until
// last_sent + frequency_days has passed (see src/index.js). So the real next
// run is the first Monday cron on or after that due date. Mirrors that logic
// so the dashboard shows when a search will ACTUALLY happen, not just the
// nearest Monday. Falls back to the plain next Monday when there's no prior
// send or the cadence is weekly-or-faster.
const DAY_MS = 24 * 60 * 60 * 1000
export function nextScheduledRun(
  lastSent: string | null,
  frequencyDays: number | null,
  now = new Date()
): Date {
  const days = Number(frequencyDays)
  if (!lastSent || !Number.isFinite(days) || days <= 7) {
    return nextMondayRun(now)
  }
  const dueAt = new Date(lastSent).getTime() + days * DAY_MS
  // The org isn't due until dueAt; find the first Monday cron at/after it
  // (but never earlier than the next Monday from now).
  const from = new Date(Math.max(now.getTime(), dueAt))
  return nextMondayRun(from)
}

export function formatDateTime(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}
