import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { signInWithPassword, sendPasswordReset } from '../lib/auth'

// This dashboard is a single-entity tool for Wagner Farm Arboretum Foundation.
// Only this one account may sign in. (Row-level security in Supabase is the real
// enforcement; this is the front-door gate so wrong emails get a clear message.)
const ALLOWED_EMAIL = 'adhiyanth.r@gmail.com'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        window.location.href = '/matches'
      }
      setIsChecking(false)
    }

    checkSession()
  }, [])

  if (isChecking) {
    return (
      <div className="center">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    if (email.trim().toLowerCase() !== ALLOWED_EMAIL) {
      setError('This dashboard is restricted. Please sign in with the authorized account.')
      setLoading(false)
      return
    }

    const { error } = await signInWithPassword(email.trim().toLowerCase(), password)
    if (error) {
      setError(error.message)
    } else {
      window.location.href = '/matches'
      return
    }

    setLoading(false)
  }

  const handleReset = async () => {
    setError('')
    setMessage('')
    if (email.trim().toLowerCase() !== ALLOWED_EMAIL) {
      setError('This dashboard is restricted. Enter the authorized account email first.')
      return
    }
    setLoading(true)
    const { error } = await sendPasswordReset(email.trim().toLowerCase())
    if (error) {
      setError(error.message)
    } else {
      setMessage('Check your email for a link to set your password.')
    }
    setLoading(false)
  }

  return (
    <div className="container">
      <div style={{ maxWidth: '400px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '12px', textAlign: 'center' }}>
          Sign in
        </h1>
        <p style={{ textAlign: 'center', marginBottom: '40px', color: 'var(--ink-2)' }}>
          Grant dashboard
        </p>

        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              style={{ width: '100%' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
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

          <button type="submit" disabled={loading || !email || !password} style={{ width: '100%' }}>
            {loading ? (
              <>
                <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
                Signing in...
              </>
            ) : (
              'Sign in →'
            )}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.92rem', color: 'var(--ink-2)' }}>
          First time here, or forgot your password?{' '}
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); handleReset() }}
            style={{ color: 'var(--accent)' }}
          >
            Set your password
          </a>
        </p>
      </div>
    </div>
  )
}
