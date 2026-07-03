import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { updatePassword } from '../lib/auth'

export function ResetPassword() {
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    // The recovery link establishes a session (detectSessionInUrl). Wait for it
    // so updateUser has an authenticated context.
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) setReady(true)
    }
    check()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setReady(true)
    })
    return () => subscription?.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const { error } = await updatePassword(password)
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setDone(true)
      setTimeout(() => { window.location.href = '/matches' }, 1200)
    }
  }

  return (
    <div className="container">
      <div style={{ maxWidth: '400px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '12px', textAlign: 'center' }}>
          Set your password
        </h1>
        <p style={{ textAlign: 'center', marginBottom: '40px', color: 'var(--ink-2)' }}>
          Grant dashboard
        </p>

        {error && <div className="alert error">{error}</div>}
        {done && <div className="alert success">Password set. Signing you in…</div>}

        {!ready && !done && (
          <div className="center">
            <div className="spinner"></div>
            <p>Verifying your link…</p>
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              If this doesn't load, open the most recent link from your email, or request a new one
              from the sign-in page.
            </p>
          </div>
        )}

        {ready && !done && (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={loading}
                required
                style={{ width: '100%' }}
              />
            </div>

            <button type="submit" disabled={loading || !password || !confirm} style={{ width: '100%' }}>
              {loading ? 'Saving…' : 'Save password →'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
