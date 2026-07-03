import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Match,
  fetchOwnOrg,
  fetchMatches,
  displayScore,
  formatAmount,
  daysUntil,
} from '../lib/matches'
import { nextMondayRun, formatDateTime } from '../lib/searchPreview'

function GrantCard({ match }: { match: Match }) {
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
        <a href={`/matches/${match.grant_id}`} className="btn">
          View details →
        </a>
        <a href={g.url} target="_blank" rel="noopener noreferrer" className="btn btn--ghost">
          Apply ↗
        </a>
      </div>
    </div>
  )
}

export function Matches() {
  const [user, setUser] = useState<any>(null)
  const [org, setOrg] = useState<any>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        window.location.href = '/login'
        return
      }

      setUser(session.user)

      try {
        const orgData = await fetchOwnOrg(session.user.id)
        setOrg(orgData)
        if (orgData) {
          setMatches(await fetchMatches(orgData.id))
        }
      } catch (err) {
        console.error('Failed to load matches:', err)
        setLoadError('We had trouble loading your matches. Please refresh and try again.')
      }

      setLoading(false)
    }

    load()
  }, [])

  if (loading) {
    return (
      <div className="center">
        <div className="spinner"></div>
        <p>Loading your matches...</p>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (!org) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: '10px' }}>No organization linked to this account yet</h2>
          <p className="muted" style={{ marginBottom: '16px' }}>
            Ask an administrator to link your account.
          </p>
        </div>
      </div>
    )
  }

  const closingSoon = matches
    .filter((m) => {
      const d = daysUntil(m.grants.deadline)
      return d != null && d >= 0 && d <= 30
    })
    .sort((a, b) => (daysUntil(a.grants.deadline) ?? 0) - (daysUntil(b.grants.deadline) ?? 0))
  const rest = matches.filter((m) => !closingSoon.includes(m))

  return (
    <div className="container">
      <h1 style={{ marginBottom: '8px' }}>Grant matches for {org.name || 'you'}</h1>
      <p style={{ marginBottom: '20px', color: 'var(--ink-2)' }}>
        {org.state ? `${org.state}` : ''}{org.county ? ` • ${org.county}` : ''}
      </p>

      <div
        style={{
          display: 'flex',
          gap: '28px',
          flexWrap: 'wrap',
          padding: '14px 18px',
          borderRadius: '10px',
          background: 'var(--bg)',
          marginBottom: '32px',
          fontSize: '0.9rem',
        }}
      >
        <div>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--ink-3)', letterSpacing: '0.03em' }}>
            Matches
          </div>
          <div style={{ fontWeight: 600 }}>{matches.length}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--ink-3)', letterSpacing: '0.03em' }}>
            Last updated
          </div>
          <div style={{ fontWeight: 600 }}>
            {org.last_sent ? formatDateTime(new Date(org.last_sent)) : 'Not yet'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--ink-3)', letterSpacing: '0.03em' }}>
            Next automatic search
          </div>
          <div style={{ fontWeight: 600 }}>{formatDateTime(nextMondayRun())}</div>
        </div>
      </div>

      {loadError && <div className="alert error">{loadError}</div>}

      {!loadError && matches.length === 0 && (
        <div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: '10px' }}>Your first matches arrive Monday</h2>
          <p className="muted">
            Grants are searched every Monday morning and your matches will show up here.
          </p>
        </div>
      )}

      {closingSoon.length > 0 && (
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ marginBottom: '20px', fontSize: '1.5rem' }}>
            🔥 Closing soon (next 30 days)
          </h2>
          {closingSoon.map((m) => (
            <GrantCard key={m.grant_id} match={m} />
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ marginBottom: '20px', fontSize: '1.5rem' }}>All matches</h2>
          {rest.map((m) => (
            <GrantCard key={m.grant_id} match={m} />
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-2)' }}>
        <p>New grants are added every Monday morning.</p>
      </div>
    </div>
  )
}
