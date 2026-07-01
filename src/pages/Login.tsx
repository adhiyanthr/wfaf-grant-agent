import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { signInWithMagicLink } from '../lib/auth'

export function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
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

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const { error } = await signInWithMagicLink(email)

    if (error) {
      setError(`Failed to send magic link: ${error.message}`)
    } else {
      setMessage(
        `Magic link sent to ${email}. Check your inbox and click the link to sign in.`
      )
      setEmail('')
    }

    setLoading(false)
  }

  return (
    <div className="container">
      <div style={{ maxWidth: '400px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '12px', textAlign: 'center' }}>
          Sign in to your matches
        </h1>
        <p style={{ textAlign: 'center', marginBottom: '40px', color: 'var(--ink-2)' }}>
          We'll send you a magic link via email
        </p>

        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}

        <form onSubmit={handleSignIn}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="your@nonprofit.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              style={{ width: '100%' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email}
            style={{ width: '100%' }}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: '16px', height: '16px' }}></span>
                Sending...
              </>
            ) : (
              'Send magic link →'
            )}
          </button>
        </form>

        <p
          style={{
            textAlign: 'center',
            marginTop: '24px',
            fontSize: '0.92rem',
            color: 'var(--ink-2)',
          }}
        >
          Don't have an account?{' '}
          <a href="/#intake" style={{ color: 'var(--accent)' }}>
            Sign up for free
          </a>
        </p>
      </div>
    </div>
  )
}
