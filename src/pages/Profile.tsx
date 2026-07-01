import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function Profile() {
  const [user, setUser] = useState<any>(null)
  const [org, setOrg] = useState<any>(null)
  const [loading, setLoading] = useState(true)

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
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="container">
      <h1 style={{ marginBottom: '32px' }}>Your profile</h1>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: '20px' }}>Organization info</h2>

        <div className="form-group">
          <label>Email</label>
          <div style={{ padding: '12px 16px', background: 'var(--bg)' }}>{org?.email}</div>
        </div>

        {org?.name && (
          <div className="form-group">
            <label>Organization name</label>
            <div style={{ padding: '12px 16px', background: 'var(--bg)' }}>{org.name}</div>
          </div>
        )}

        {org?.state && (
          <div className="form-group">
            <label>State</label>
            <div style={{ padding: '12px 16px', background: 'var(--bg)' }}>{org.state}</div>
          </div>
        )}

        {org?.county && (
          <div className="form-group">
            <label>County</label>
            <div style={{ padding: '12px 16px', background: 'var(--bg)' }}>{org.county}</div>
          </div>
        )}

        <p style={{ marginTop: '20px', fontSize: '0.92rem', color: 'var(--ink-2)' }}>
          Email{' '}
          <a href="mailto:grants@grantequity.org">grants@grantequity.org</a> to update your
          organization information.
        </p>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.15rem', marginBottom: '16px' }}>Account</h2>
        <p style={{ marginBottom: '16px', color: 'var(--ink-2)' }}>
          Signed in as <strong>{user.email}</strong>
        </p>
        <a href="/matches" className="btn btn--ghost">
          Back to matches
        </a>
      </div>
    </div>
  )
}
