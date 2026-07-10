import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Match,
  fetchOrgByEmail,
  fetchMatches,
  displayScore,
  formatAmount,
  daysUntil,
} from '../lib/matches'

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
        const orgData = await fetchOrgByEmail(session.user.email!)
        setOrg(orgData)
        if (orgData) {
          setMatches(await fetchMatches(orgData.id))
        }
      } catch (err) {
        console.error('Failed to load matches:', err)
        setLoadError('We had trouble loading your matches. Please refresh, or email grants@grantequity.org.')
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
          <h2 style={{ marginBottom: '10px' }}>We don't have an organization on file for {user.email}</h2>
          <p className="muted" style={{ marginBottom: '16px' }}>
            Sign up with this email on the homepage, or reach us and we'll connect your account.
          </p>
          <a href="/" className="btn">Go to sign-up</a>
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
      <p style={{ marginBottom: '32px', color: 'var(--ink-2)' }}>
        {org.email} {org.state ? `• ${org.state}` : ''}
      </p>

      {loadError && <div className="alert error">{loadError}</div>}

      {!loadError && matches.length === 0 && (
        <div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: '10px' }}>Your first matches arrive Monday</h2>
          <p className="muted">
            Our agent searches foundation, county, and state sources every Monday morning and your
            matches will show up here (and in your inbox).
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
        <p>
          Need help?{' '}
          <a href="mailto:grants@grantequity.org">Contact us at grants@grantequity.org</a>
        </p>
      </div>
    </div>
  )
}
