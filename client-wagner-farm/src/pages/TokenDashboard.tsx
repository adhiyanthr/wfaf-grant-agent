import { useEffect, useState } from 'react'
import {
  fetchDashboard,
  submitTokenFeedback,
  markApplied,
  DashboardError,
  DashboardData,
  FeedbackResponse,
} from '../lib/tokenDashboard'
import { Match, displayScore, formatAmount, daysUntil } from '../lib/matches'
import { TokenNav } from '../components/TokenNav'

// Set Referrer-Policy for this no-login view via a runtime meta tag as well as
// the response header (vercel.json). Two layers because the token lives in the
// URL and must never travel off-site in a Referer header.
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

type FeedbackState = Record<string, FeedbackResponse>
type Pending = Record<string, boolean>

function GrantCard({
  match,
  current,
  pending,
  onFeedback,
  onApplied,
}: {
  match: Match
  current: FeedbackResponse | undefined
  pending: boolean
  onFeedback: (grantId: string, response: FeedbackResponse) => void
  onApplied: (grantId: string) => void
}) {
  const g = match.grants
  const days = daysUntil(g.deadline)
  const amount = formatAmount(g.amount_min, g.amount_max)

  return (
    <div className="grant-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          marginBottom: '8px',
        }}
      >
        <div style={{ flex: 1 }}>
          <h3>{g.title}</h3>
          {g.funder && <p className="muted">{g.funder}</p>}
        </div>
        <div style={{ textAlign: 'right', marginLeft: '16px' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--accent)' }}>
            {displayScore(match.fit_score)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>match score</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            Deadline
          </div>
          <div style={{ fontWeight: 600 }}>
            {g.deadline
              ? `${new Date(g.deadline).toLocaleDateString()}${days != null ? ` (${days}d)` : ''}`
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

      {match.fit_rationale && <p>{match.fit_rationale}</p>}

      {g.tags && g.tags.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
          {g.tags.map((tag) => (
            <span key={tag} className="chip">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
        <a href={g.url} target="_blank" rel="noopener noreferrer" className="btn">
          Apply ↗
        </a>
      </div>

      {/* Feedback + attribution controls */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginTop: '14px',
          flexWrap: 'wrap',
          alignItems: 'center',
          borderTop: '1px solid var(--line, #e5e5e5)',
          paddingTop: '12px',
        }}
      >
        <span style={{ fontSize: '0.8rem', color: 'var(--ink-3)', marginRight: '4px' }}>
          Is this a good match?
        </span>
        <button
          className="btn btn--ghost"
          disabled={pending}
          aria-pressed={current === 'more_like_this'}
          onClick={() => onFeedback(g.id, 'more_like_this')}
          style={current === 'more_like_this' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
        >
          👍 Relevant
        </button>
        <button
          className="btn btn--ghost"
          disabled={pending}
          aria-pressed={current === 'not_relevant'}
          onClick={() => onFeedback(g.id, 'not_relevant')}
          style={current === 'not_relevant' ? { borderColor: '#c0392b', color: '#c0392b' } : undefined}
        >
          👎 Not relevant
        </button>
        <button
          className="btn btn--ghost"
          disabled={pending}
          aria-pressed={current === 'already_applied'}
          onClick={() => onApplied(g.id)}
          style={current === 'already_applied' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
        >
          {current === 'already_applied' ? '✓ Applied' : 'I applied'}
        </button>
        {pending && <span style={{ fontSize: '0.8rem', color: 'var(--ink-3)' }}>Saving…</span>}
      </div>
    </div>
  )
}

export function TokenDashboard({ token }: { token: string }) {
  useNoReferrer()

  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>({})
  const [pending, setPending] = useState<Pending>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const d = await fetchDashboard(token)
        if (cancelled) return
        setData(d)
        // Seed control state from the latest feedback per grant (already
        // ordered newest-first by the function).
        const seed: FeedbackState = {}
        for (const f of d.feedback) {
          if (f.grant_id && !(f.grant_id in seed)) seed[f.grant_id] = f.response
        }
        setFeedback(seed)
      } catch (err) {
        if (cancelled) return
        // Any error on the token path -> generic not-found, no detail leak.
        if (err instanceof DashboardError && err.code === 'network') {
          setNotFound(false)
          setData(null)
        }
        setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const doFeedback = async (grantId: string, response: FeedbackResponse) => {
    setPending((p) => ({ ...p, [grantId]: true }))
    const prev = feedback[grantId]
    setFeedback((f) => ({ ...f, [grantId]: response })) // optimistic
    try {
      await submitTokenFeedback(token, grantId, response)
    } catch {
      setFeedback((f) => ({ ...f, [grantId]: prev })) // rollback
    } finally {
      setPending((p) => ({ ...p, [grantId]: false }))
    }
  }

  const doApplied = async (grantId: string) => {
    setPending((p) => ({ ...p, [grantId]: true }))
    const prev = feedback[grantId]
    setFeedback((f) => ({ ...f, [grantId]: 'already_applied' }))
    try {
      await markApplied(token, grantId)
    } catch {
      setFeedback((f) => ({ ...f, [grantId]: prev }))
    } finally {
      setPending((p) => ({ ...p, [grantId]: false }))
    }
  }

  if (loading) {
    return (
      <div className="center">
        <div className="spinner"></div>
        <p>Loading your matches...</p>
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', marginTop: '60px' }}>
          <h2 style={{ marginBottom: '10px' }}>Dashboard not found</h2>
          <p className="muted">
            This link is invalid or has expired. Check the link in your most recent grant email.
          </p>
        </div>
      </div>
    )
  }

  const { org, matches } = data
  const closingSoon = matches
    .filter((m) => {
      const d = daysUntil(m.grants.deadline)
      return d != null && d >= 0 && d <= 30
    })
    .sort((a, b) => (daysUntil(a.grants.deadline) ?? 0) - (daysUntil(b.grants.deadline) ?? 0))
  const rest = matches.filter((m) => !closingSoon.includes(m))

  const renderCard = (m: Match) => (
    <GrantCard
      key={m.grant_id}
      match={m}
      current={feedback[m.grant_id]}
      pending={!!pending[m.grant_id]}
      onFeedback={doFeedback}
      onApplied={doApplied}
    />
  )

  return (
    <>
      <TokenNav token={token} active="matches" />
      <div className="container">
        <h1 style={{ marginBottom: '8px' }}>Grant matches for {org.name || 'you'}</h1>
        <p style={{ marginBottom: '24px', color: 'var(--ink-2)' }}>
          {org.state ? `${org.state}` : ''}
          {org.county ? ` • ${org.county}` : ''}
        </p>

        {matches.length === 0 && (
          <div className="card" style={{ textAlign: 'center' }}>
            <h2 style={{ marginBottom: '10px' }}>Your first matches arrive Monday</h2>
            <p className="muted">
              Grants are searched every Monday morning and your matches will show up here.
            </p>
          </div>
        )}

        {closingSoon.length > 0 && (
          <div style={{ marginBottom: '40px' }}>
            <h2 style={{ marginBottom: '20px', fontSize: '1.5rem' }}>🔥 Closing soon (next 30 days)</h2>
            {closingSoon.map(renderCard)}
          </div>
        )}

        {rest.length > 0 && (
          <div style={{ marginBottom: '40px' }}>
            <h2 style={{ marginBottom: '20px', fontSize: '1.5rem' }}>All matches</h2>
            {rest.map(renderCard)}
          </div>
        )}

        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-2)' }}>
          <p>New grants are added every Monday morning.</p>
        </div>
      </div>
    </>
  )
}
