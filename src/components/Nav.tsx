import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { signOut } from '../lib/auth'

export function Nav() {
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setIsLoading(false)
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null)
      }
    )

    return () => subscription?.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await signOut()
    window.location.href = '/'
  }

  return (
    <nav className="nav">
      <a href="/" className="brand">
        GrantEquity
      </a>
      <div className="nav-links">
        {!isLoading && user ? (
          <>
            <a href="/matches" className={window.location.pathname.startsWith('/matches') ? 'active' : ''}>
              My Matches
            </a>
            <a href="/profile" className={window.location.pathname === '/profile' ? 'active' : ''}>
              Profile
            </a>
            <button onClick={handleSignOut} style={{
              background: 'transparent',
              color: 'var(--ink-2)',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: '0.92rem',
              fontWeight: 500
            }}>
              Sign out
            </button>
          </>
        ) : (
          <a href="/login" className={window.location.pathname === '/login' ? 'active' : ''}>
            Sign in
          </a>
        )}
      </div>
    </nav>
  )
}
