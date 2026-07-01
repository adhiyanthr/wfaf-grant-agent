import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SAMPLE_GRANTS = [
  {
    id: 1,
    title: 'Community Food Security Grant',
    funder: 'The Kellogg Foundation',
    deadline: '2026-07-31',
    amount: '$25,000 - $100,000',
    url: 'https://foundation.example.com',
    eligibility: 'Nonprofits serving food-insecure communities',
    fit_score: 95,
  },
  {
    id: 2,
    title: 'Local Food Systems Initiative',
    funder: 'State Department of Agriculture',
    deadline: '2026-08-15',
    amount: '$10,000 - $50,000',
    url: 'https://agriculture.example.com',
    eligibility: 'Community organizations in underserved areas',
    fit_score: 88,
  },
  {
    id: 3,
    title: 'Nutrition Education Program Grant',
    funder: 'Healthy Futures Foundation',
    deadline: '2026-09-30',
    amount: '$5,000 - $30,000',
    url: 'https://healthyfutures.example.com',
    eligibility: 'Organizations focusing on nutrition access',
    fit_score: 82,
  },
]

export function Matches() {
  const [user, setUser] = useState<any>(null)
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [grants] = useState(SAMPLE_GRANTS)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        window.location.href = '/login'
        return
      }

      setUser(session.user)

      try {
        const { data } = await supabase
          .from('organizations')
          .select('*')
          .eq('email', session.user.email)
          .single()

        setOrg(data)
      } catch (err) {
        console.error('Failed to fetch organization:', err)
      }

      setLoading(false)
    }

    checkAuth()
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

  const daysUntilDeadline = (deadline: string) => {
    const today = new Date()
    const deadlineDate = new Date(deadline)
    const diff = Math.ceil(
      (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )
    return diff
  }

  return (
    <div className="container">
      <h1 style={{ marginBottom: '8px' }}>Grant matches for {org?.name || 'you'}</h1>
      <p style={{ marginBottom: '32px', color: 'var(--ink-2)' }}>
        {org?.email && `${org.email} ${org.state ? `• ${org.state}` : ''}`}
      </p>

      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ marginBottom: '20px', fontSize: '1.5rem' }}>
          🔥 Closing soon (next 30 days)
        </h2>

        {grants.map((grant) => (
          <div key={grant.id} className="grant-card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                marginBottom: '8px',
              }}
            >
              <div style={{ flex: 1 }}>
                <h3>{grant.title}</h3>
                <p className="muted">{grant.funder}</p>
              </div>
              <div
                style={{
                  textAlign: 'right',
                  marginLeft: '16px',
                }}
              >
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--accent)' }}>
                  {grant.fit_score}%
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
                  {new Date(grant.deadline).toLocaleDateString()} ({daysUntilDeadline(grant.deadline)}d)
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
                  Award
                </div>
                <div style={{ fontWeight: 600 }}>{grant.amount}</div>
              </div>
            </div>

            <p>{grant.eligibility}</p>

            <a
              href={grant.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ marginTop: '12px' }}
            >
              View details →
            </a>
          </div>
        ))}
      </div>

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
