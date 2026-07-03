import { useEffect, useState } from 'react'
import { Nav } from './components/Nav'
import { Login } from './pages/Login'
import { ResetPassword } from './pages/ResetPassword'
import { Matches } from './pages/Matches'
import { MatchDetail } from './pages/MatchDetail'
import { Settings } from './pages/Settings'
import { NotFound } from './pages/NotFound'
import { TokenDashboard } from './pages/TokenDashboard'

function App() {
  const [page, setPage] = useState('')

  useEffect(() => {
    const path = window.location.pathname
    setPage(path === '/' ? '/matches' : path)

    const handlePopState = () => {
      const newPath = window.location.pathname
      setPage(newPath === '/' ? '/matches' : newPath)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // The token-gated dashboard is a self-contained, session-free view. It must
  // NOT render <Nav> (which calls supabase.auth and shows sign-in chrome) — the
  // token IS the credential. Branch out before anything auth-aware renders.
  if (page.startsWith('/dashboard/')) {
    const token = page.split('/')[2]
    if (token) return <TokenDashboard token={token} />
    return <NotFound />
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
