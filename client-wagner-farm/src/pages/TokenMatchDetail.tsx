import { useEffect, useState } from 'react'
import {
  fetchDashboard,
  submitTokenFeedback,
  markApplied,
  DashboardError,
  FeedbackResponse,
} from '../lib/tokenDashboard'
import { Match, displayScore, formatAmount, daysUntil } from '../lib/matches'
import { TokenNav } from '../components/TokenNav'

// Set Referrer-Policy for this no-login view (the token lives in the URL and
// must never travel off-site in a Referer header). Mirrors TokenDashboard.
function useNoReferrer() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'referrer'
    meta.content = 'no-referrer'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
  }, [])
}

export function TokenMatchDetail({ token, grantId }: { token: string; grantId: string }) {
  useNoReferrer()

  const [match, setMatch] = useState<Match | null>(null)
  const [orgName, setOrgName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Feedback: the 3 token responses (no free-text note — dashboard-view does
  // not accept 'message'). Seeded from the org's latest feedback per grant.
  const [current, setCurrent] = useState<FeedbackResponse | undefined>(undefined)
  const [pending, setPending] = useState(false)

  const dashboardHref = `/dashboard/${token}`

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const d = await fetchDashboard(token)
        if (cancelled) return
        const m = d.matches.find((x) => x.grant_id === grantId) ?? null
        setMatch(m)
        setOrgName(d.org.name)
        if (!m) {
          setNotFound(true)
        } else {
          // Latest feedback for this grant (list is newest-first).
          const fb = d.feedback.find((f) => f.grant_id === grantId)
          if (fb) setCurrent(fb.response)
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof DashboardError && err.code === 'network') {
          setMatch(null)
        }
        setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, grantId])

  const doFeedback = async (response: FeedbackResponse) => {
    setPending(true)
    const prev = current
    setCurrent(response) // optimistic
    try {
      await submitTokenFeedback(token, grantId, response)
    } catch {
      setCurrent(prev) // rollback
    } finally {
      setPending(false)
    }
  }

  const doApplied = async () => {
    setPending(true)
    const prev = current
    setCurrent('already_applied')
    try {
      await markApplied(token, grantId)
    } catch {
      setCurrent(prev)
    } finally {
      setPending(false)
    }
  }

  if (loading) {
    return (
      <div className="center">
        <div className="spinner"></div>
        <p>Loading grant...</p>
      </div>
    )
  }

  if (notFound || !match) {
    return (
      <>
        <TokenNav token={token} active="matches" />
        <div className="container">
          <div className="card" style={{ textAlign: 'center' }}>
            <h2 style={{ marginBottom: '10px' }}>We couldn't find that grant</h2>
            <p className="muted" style={{ marginBottom: '16px' }}>
              It may have been removed, or the link is old.
            </p>
            <a href={dashboardHref} className="btn">← All matches</a>
          </div>
        </div>
      </>
    )
  }

  const g = match.grants
  const days = daysUntil(g.deadline)
  const amount = formatAmount(g.amount_min, g.amount_max)
  const strengths = match.analysis?.strengths?.filter(Boolean) ?? []
  const considerations = match.analysis?.considerations?.filter(Boolean) ?? []
  const flags = match.eligibility_flags?.filter(Boolean) ?? []

  return (
    <>
      <TokenNav token={token} active="matches" />
      <div className="container">
        <p style={{ marginBottom: '18px' }}>
          <a href={dashboardHref} style={{ color: 'var(--ink-2)' }}>← All matches</a>
        </p>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start',
            gap: '16px',
            marginBottom: '18px',
          }}
        >
          <div style={{ flex: 1 }}>
            <h1 style={{ marginBottom: '6px' }}>{g.title}</h1>
            {g.funder && <p className="muted">{g.funder}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--accent)' }}>
              {displayScore(match.fit_score)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>match score</div>
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: '28px', marginBottom: '18px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              Deadline
            </div>
            <div
              style={{
                fontWeight: 600,
                color: days != null && days <= 30 ? 'var(--warn-ink)' : 'var(--ink)',
              }}
            >
              {g.deadline
                ? `${new Date(g.deadline).toLocaleDateString()}${days != null ? ` (${days} days left)` : ''}`
                : 'Not listed'}
            </div>
          </div>
          {amount && (
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                Award
              </div>
              <div style={{ fontWeight: 600 }}>{amount}</div>
            </div>
          )}
        </div>

        {g.tags && g.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {g.tags.map((tag) => (
              <span key={tag} className="chip">{tag}</span>
            ))}
          </div>
        )}

        <a
          href={g.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
          style={{ marginBottom: '28px', display: 'inline-flex' }}
        >
          Apply on funder site ↗
        </a>

        {/* AI analysis */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '14px' }}>
            Why this fits {orgName || 'your org'}
          </h2>

          {flags.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {flags.map((flag) => (
                <span key={flag} className="chip chip--warn">{flag}</span>
              ))}
            </div>
          )}

          {strengths.length > 0 ? (
            <>
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '8px' }}>
                {strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              {considerations.length > 0 && (
                <>
                  <h3 style={{ fontSize: '1rem', margin: '16px 0 8px' }}>Things to verify</h3>
                  <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '8px' }} className="muted">
                    {considerations.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : match.fit_rationale ? (
            <p>{match.fit_rationale}</p>
          ) : (
            <p className="muted">
              This grant was matched to your profile. A detailed analysis will appear for new matches
              starting next Monday.
            </p>
          )}

          <p className="muted" style={{ fontSize: '0.82rem', marginTop: '14px' }}>
            AI-generated — verify amounts, deadlines, and eligibility at the source before applying.
          </p>
        </div>

        {/* Feedback */}
        <div className="card" style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '6px' }}>Is this a good match?</h2>
          <p className="muted" style={{ marginBottom: '14px' }}>
            Your response tunes next Monday's matches.
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn btn--ghost"
              disabled={pending}
              aria-pressed={current === 'more_like_this'}
              onClick={() => doFeedback('more_like_this')}
            >
              👍 Relevant
            </button>
            <button
              className="btn btn--ghost btn--danger"
              disabled={pending}
              aria-pressed={current === 'not_relevant'}
              onClick={() => doFeedback('not_relevant')}
            >
              👎 Not relevant
            </button>
            <button
              className="btn btn--ghost"
              disabled={pending}
              aria-pressed={current === 'already_applied'}
              onClick={doApplied}
            >
              {current === 'already_applied' ? '✓ Applied' : 'I applied'}
            </button>
            {pending && <span style={{ fontSize: '0.8rem', color: 'var(--ink-3)' }}>Saving…</span>}
          </div>
        </div>
      </div>
    </>
  )
}
