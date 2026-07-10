import { useEffect, useState } from 'react';
import { fetchGateHash, sha256Hex, isUnlocked, markUnlocked } from '../sitePassword.js';

// Soft shared-password curtain in front of the whole app. Renders children once
// the browser is unlocked (this session or previously via localStorage). If no
// password is configured yet, it fails open so a fresh deploy isn't locked out.
export default function SitePasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => isUnlocked());
  const [gateHash, setGateHash] = useState(undefined); // undefined = loading
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (unlocked) return; // already in — no need to fetch
    let active = true;
    fetchGateHash().then((hash) => {
      if (!active) return;
      setGateHash(hash);
      // Fail-open: no password configured yet → let visitors through.
      if (hash == null) {
        markUnlocked();
        setUnlocked(true);
      }
    });
    return () => {
      active = false;
    };
  }, [unlocked]);

  if (unlocked) return children;
  if (gateHash === undefined) return <div className="center muted">Loading…</div>;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const entered = await sha256Hex(password);
    setBusy(false);
    if (entered === gateHash) {
      markUnlocked();
      setUnlocked(true);
    } else {
      setError('Incorrect password.');
    }
  }

  return (
    <div className="container">
      <div className="card auth-card">
        <span className="auth-brand">GrantEquity</span>
        <h1>Enter the site password</h1>
        <p className="sub">This site is password-protected. Enter the shared password to continue.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="site-password">Site password</label>
            <input
              id="site-password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" disabled={busy || !password}>
              {busy ? 'Checking…' : 'Continue →'}
            </button>
          </div>
          {error && <p className="error" style={{ marginTop: '10px' }}>{error}</p>}
        </form>
      </div>
    </div>
  );
}
