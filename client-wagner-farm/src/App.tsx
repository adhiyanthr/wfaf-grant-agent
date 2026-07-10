import { useEffect, useState } from 'react'
import { Nav } from './components/Nav'
import { Login } from './pages/Login'
import { ResetPassword } from './pages/ResetPassword'
import { Matches } from './pages/Matches'
import { MatchDetail } from './pages/MatchDetail'
import { Settings } from './pages/Settings'
import { NotFound } from './pages/NotFound'
import { TokenDashboard } from './pages/TokenDashboard'
import { TokenMatchDetail } from './pages/TokenMatchDetail'
import { TokenSettings } from './pages/TokenSettings'

// The bare root URL goes straight to the Wagner Farm token dashboard — no
// login. This app has exactly one org, so there's nothing to route root to
// besides its own dashboard.
const ROOT_DASHBOARD_TOKEN = 'a0c4a540-6c04-4b96-9571-2ac8c444a69d'

function App() {
  const [page, setPage] = useState('')

  useEffect(() => {
    const path = window.location.pathname
    setPage(path === '/' ? `/dashboard/${ROOT_DASHBOARD_TOKEN}` : path)

    const handlePopState = () => {
      const newPath = window.location.pathname
      setPage(newPath === '/' ? `/dashboard/${ROOT_DASHBOARD_TOKEN}` : newPath)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // The token-gated dashboard is a self-contained, session-free view. It must
  // NOT render <Nav> (which calls supabase.auth and shows sign-in chrome) — the
  // token IS the credential. Branch out before anything auth-aware renders.
  if (page.startsWith('/dashboard/')) {
    const parts = page.split('/') // ['', 'dashboard', token, subpage?, grantId?]
    const token = parts[2]
    const subpage = parts[3]
    const grantId = parts[4]
    if (!token) return <NotFound />
    if (subpage === 'settings') return <TokenSettings token={token} />
    if (subpage === 'matches' && grantId)
      return <TokenMatchDetail token={token} grantId={grantId} />
    return <TokenDashboard token={token} />
  }

  const renderPage = () => {
    if (page.startsWith('/matches/')) {
      const grantId = page.split('/')[2]
      if (grantId) return <MatchDetail grantId={grantId} />
    }
    switch (page) {
      case '/login':
        return <Login />
      case '/reset':
        return <ResetPassword />
      case '/matches':
        return <Matches />
      case '/settings':
        return <Settings />
      default:
        return <NotFound />
    }
  }

  return (
    <>
      <Nav />
      {renderPage()}
    </>
  )
}

export default App
