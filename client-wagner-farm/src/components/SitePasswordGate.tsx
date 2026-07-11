import { useEffect, useState } from 'react'
import { fetchGateHash, sha256Hex, isUnlocked, markUnlocked } from '../lib/sitePassword'

// Soft shared-password curtain in front of the whole site. Renders children
// once this browser is unlocked (now or previously via localStorage). If no
// password is configured yet, it fails open so the site is never bricked.
export function SitePasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => isUnlocked())
  const [gateHash, setGateHash] = useState<string | null | undefined>(undefined) // undefined = loading
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (unlocked) return // already in — no need to fetch
    let active = true
    fetchGateHash().then((hash) => {
      if (!active) return
      setGateHash(hash)
      // Fail-open: no password configured yet → let visitors through.
      if (hash == null) {
        markUnlocked()
        setUnlocked(true)
      }
    })
    return () => {
      active = false
    }
  }, [unlocked])

  if (unlocked) return <>{children}</>

  if (gateHash === undefined) {
    return (
      <div className="center">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const entered = await sha256Hex(password)
    setBusy(false)
    if (entered === gateHash) {
      markUnlocked()
      setUnlocked(true)
    } else {
      setError('Incorrect password. Please try again.')
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '420px', margin: '80px auto 0' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Grant Dashboard</h1>
        <p className="muted" style={{ marginBottom: '20px' }}>
          This site is password-protected. Enter the shared password to continue.
        </p>
        <form onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="site-password">Site password</label>
            <input
              id="site-password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          {error && <div className="alert error">{error}</div>}
          <button type="submit" disabled={busy || !password}>
            {busy ? 'Checking…' : 'Continue →'}
          </button>
        </form>
      </div>
    </div>
  )
}
