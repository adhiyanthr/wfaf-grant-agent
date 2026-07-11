// Minimal nav for the token-gated (no-login) dashboard. Unlike <Nav>, this
// never touches supabase.auth — the token in the URL is the only identity.
export function TokenNav({
  token,
  active,
}: {
  token: string
  active: 'matches' | 'applied' | 'settings' | 'admin'
}) {
  return (
    <nav className="nav">
      <span className="brand">Grant Dashboard</span>
      <div className="nav-links">
        <a href={`/dashboard/${token}`} className={active === 'matches' ? 'active' : ''}>
          Matches
        </a>
        <a href={`/dashboard/${token}/applied`} className={active === 'applied' ? 'active' : ''}>
          Applied
        </a>
        <a href={`/dashboard/${token}/settings`} className={active === 'settings' ? 'active' : ''}>
          Settings
        </a>
        <a href={`/dashboard/${token}/admin`} className={active === 'admin' ? 'active' : ''}>
          Admin
        </a>
      </div>
    </nav>
  )
}
