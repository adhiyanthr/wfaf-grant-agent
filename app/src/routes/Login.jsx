import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { useSession } from '../session.jsx';

// Passwordless magic-link login. Supabase emails a link; clicking it returns to
// the app with a session, at which point SessionProvider calls claim_org().
export default function Login() {
  const { session, loading } = useSession();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="center muted">Loading…</div>;
  if (session) return <Navigate to="/matches" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + '/matches' },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="card auth-card">
      <span className="auth-brand">GrantEquity</span>
      <h1>Sign in to your matches</h1>
      <p className="sub">We'll email you a one-click sign-in link — no password needed.</p>
      {sent ? (
        <p className="notice">
          Check <strong>{email}</strong> for your sign-in link. It expires in 1 hour.
        </p>
      ) : (
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@yournonprofit.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Send magic link →'}
          </button>
          {error && <p className="error" style={{ marginTop: '10px' }}>{error}</p>}
        </form>
      )}
    </div>
  );
}
