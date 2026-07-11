import { useEffect, useState } from 'react'
import { fetchAppliedList, AppliedData } from '../lib/tokenDashboard'
import { Match, formatAmount } from '../lib/matches'
import { TokenNav } from '../components/TokenNav'

// Read-only list of every grant the org has marked "I applied". Unlike the
// matches view, entries stay here after a grant's deadline passes — this is
// the org's application history.
export function TokenApplied({ token }: { token: string }) {
  const [data, setData] = useState<AppliedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const d = await fetchAppliedList(token)
        if (cancelled) return
        setData(d)
      } catch {
        if (cancelled) return
        setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading) {
    return (
      <div className="center">
        <div className="spinner"></div>
        <p>Loading your applications...</p>
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

  // Newest application first.
  const matches = [...data.matches].sort((a, b) => {
    const ta = new Date(data.applied_at[a.grant_id] ?? 0).getTime()
    const tb = new Date(data.applied_at[b.grant_id] ?? 0).getTime()
    return tb - ta
  })

  const renderCard = (m: Match) => {
    const g = m.grants
    const amount = formatAmount(g.amount_min, g.amount_max)
    const appliedOn = data.applied_at[m.grant_id]
    return (
      <div className="grant-card" key={m.grant_id}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start',
            marginBottom: '8px',
            gap: '16px',
          }}
        >
          <div style={{ flex: 1 }}>
            <h3>{g.title}</h3>
            {g.funder && <p className="muted">{g.funder}</p>}
          </div>
          <span className="chip" style={{ whiteSpace: 'nowrap' }}>✓ Applied</span>
        </div>

        <div style={{ display: 'flex', gap: '20px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              Applied on
            </div>
            <div style={{ fontWeight: 600 }}>
              {appliedOn ? new Date(appliedOn).toLocaleDateString() : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              Deadline
            </div>
            <div style={{ fontWeight: 600 }}>
              {g.deadline ? new Date(g.deadline).toLocaleDateString() : 'Not listed'}
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

        <a href={g.url} target="_blank" rel="noopener noreferrer" className="btn btn--ghost">
          Grant page ↗
        </a>
      </div>
    )
  }

  return (
    <>
      <TokenNav token={token} active="applied" />
      <div className="container">
        <h1 style={{ marginBottom: '8px' }}>Grants you've applied to</h1>
        <p style={{ marginBottom: '24px', color: 'var(--ink-2)' }}>
          Everything marked "I applied" on the dashboard, newest first. Grants stay here even after
          their deadline passes.
        </p>

        {matches.length === 0 ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <h2 style={{ marginBottom: '10px' }}>Nothing here yet</h2>
            <p className="muted">
              When you press "I applied" on a match, it will show up on this page.
            </p>
          </div>
        ) : (
          matches.map(renderCard)
        )}
      </div>
    </>
  )
}
