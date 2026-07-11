import { useState } from 'react'
import {
  verifyAdmin,
  changeAdminPassword,
  changeSitePasswordAsAdmin,
  triggerTokenRefresh,
  DashboardError,
} from '../lib/tokenDashboard'
import { getAdminPassword, setAdminPassword, clearAdminPassword } from '../lib/adminSession'
import { TokenNav } from '../components/TokenNav'

// Admin area for Wagner Farm staff. Gated by a separate ADMIN password that
// only staff hold — every action below re-sends it and the server re-verifies
// it, so this page grants nothing by itself. From here staff control both
// passwords (changing them locks out anyone else, including the original
// developer) and can read the ownership handoff guide.

function errText(err: unknown, fallback: string): string {
  if (err instanceof DashboardError) {
    if (err.code === 'wrong_password') return 'Incorrect password.'
    if (err.code === 'weak_password') return 'New password must be at least 8 characters.'
    if (err.code === 'not_configured')
      return 'The admin area is not set up yet — the admin password migration has not been run.'
  }
  return fallback
}

type Msg = { kind: 'ok' | 'err'; text: string } | null

function PasswordChangeCard({
  title,
  blurb,
  buttonLabel,
  onSubmit,
}: {
  title: string
  blurb?: string
  buttonLabel: string
  onSubmit: (newPassword: string) => Promise<void>
}) {
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (next !== confirm) {
      setMsg({ kind: 'err', text: 'The two passwords do not match.' })
      return
    }
    setBusy(true)
    try {
      await onSubmit(next)
      setNext('')
      setConfirm('')
      setMsg({ kind: 'ok', text: 'Password changed.' })
    } catch (err) {
      setMsg({ kind: 'err', text: errText(err, "Couldn't change the password. Please try again.") })
    }
    setBusy(false)
  }

  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <h2 style={{ fontSize: '1.15rem', marginBottom: '16px' }}>{title}</h2>
      {blurb && <p className="muted" style={{ fontSize: '0.9rem', margin: '-10px 0 16px' }}>{blurb}</p>}
      <form onSubmit={submit}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
            <label>New password</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
            <label>Repeat new password</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>
        {msg && (
          <div className={`alert ${msg.kind === 'ok' ? 'success' : 'error'}`}>{msg.text}</div>
        )}
        <button type="submit" disabled={busy || !next || !confirm}>
          {busy ? 'Saving…' : buttonLabel}
        </button>
      </form>
    </div>
  )
}

export function TokenAdmin({ token }: { token: string }) {
  const [adminPw, setAdminPw] = useState<string | null>(() => getAdminPassword())
  const [loginPw, setLoginPw] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginErr, setLoginErr] = useState<string | null>(null)

  const [refreshBusy, setRefreshBusy] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<Msg>(null)

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginBusy(true)
    setLoginErr(null)
    try {
      await verifyAdmin(token, loginPw)
      setAdminPassword(loginPw)
      setAdminPw(loginPw)
      setLoginPw('')
    } catch (err) {
      setLoginErr(errText(err, "Couldn't check the password. Please try again."))
    }
    setLoginBusy(false)
  }

  const logout = () => {
    clearAdminPassword()
    setAdminPw(null)
  }

  const runSearch = async () => {
    if (!window.confirm('Run a fresh grant search now? New matches usually appear within a few minutes.')) return
    setRefreshBusy(true)
    setRefreshMsg(null)
    try {
      await triggerTokenRefresh(token)
      setRefreshMsg({ kind: 'ok', text: 'Search started — new matches usually arrive within a few minutes.' })
    } catch (err) {
      const code = err instanceof DashboardError ? err.code : 'failed'
      setRefreshMsg({
        kind: 'err',
        text:
          code === 'not_configured'
            ? "On-demand refresh isn't switched on yet. Matches still update automatically every Monday."
            : 'Could not start a search just now. Please try again in a moment.',
      })
    }
    setRefreshBusy(false)
  }

  if (!adminPw) {
    return (
      <>
        <TokenNav token={token} active="admin" />
        <div className="container">
          <div className="card" style={{ maxWidth: '420px', margin: '40px auto 0' }}>
            <h1 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Admin</h1>
            <p className="muted" style={{ marginBottom: '20px' }}>
              Enter the admin password to continue.
            </p>
            <form onSubmit={login}>
              <div className="form-group">
                <label htmlFor="admin-password">Admin password</label>
                <input
                  id="admin-password"
                  type="password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  value={loginPw}
                  onChange={(e) => setLoginPw(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              {loginErr && <div className="alert error">{loginErr}</div>}
              <button type="submit" disabled={loginBusy || !loginPw}>
                {loginBusy ? 'Checking…' : 'Unlock admin →'}
              </button>
            </form>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <TokenNav token={token} active="admin" />
      <div className="container">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '8px',
          }}
        >
          <h1>Admin</h1>
          <button className="btn btn--ghost" onClick={logout} style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
            Lock admin area
          </button>
        </div>
        <p style={{ marginBottom: '28px', color: 'var(--ink-2)' }}>
          Controls for Wagner Farm staff. Changing the passwords below locks out everyone who
          doesn't know the new ones — this is how you take full control of the dashboard.
        </p>

        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '6px' }}>Take full ownership</h2>
          <p className="muted" style={{ fontSize: '0.9rem', marginBottom: '16px' }}>
            A plain-English, step-by-step guide to moving this whole service (the code, the weekly
            search robot, and its AI account) into Wagner Farm's own hands.
          </p>
          <a href={`/dashboard/${token}/admin/handoff`} className="btn">
            Open the handoff guide →
          </a>
        </div>

        <PasswordChangeCard
          title="Change the site password"
          buttonLabel="Change site password"
          onSubmit={(next) => changeSitePasswordAsAdmin(token, adminPw, next)}
        />

        <PasswordChangeCard
          title="Change the admin password"
          blurb="The password for this Admin area."
          buttonLabel="Change admin password"
          onSubmit={async (next) => {
            await changeAdminPassword(token, adminPw, next)
            setAdminPassword(next)
            setAdminPw(next)
          }}
        />

        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '6px' }}>Run a fresh grant search</h2>
          <p className="muted" style={{ fontSize: '0.9rem', marginBottom: '16px' }}>
            Searches for new grants right now instead of waiting for Monday. Takes a few minutes;
            new matches appear on the Matches page and go out by email.
          </p>
          {refreshMsg && (
            <div className={`alert ${refreshMsg.kind === 'ok' ? 'success' : 'error'}`}>{refreshMsg.text}</div>
          )}
          <button className="btn btn--ghost" onClick={runSearch} disabled={refreshBusy}>
            {refreshBusy ? 'Starting…' : 'Run search now'}
          </button>
        </div>
      </div>
    </>
  )
}
