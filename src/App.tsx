import { useEffect, useState } from 'react'
import { Nav } from './components/Nav'
import { Login } from './pages/Login'
import { Matches } from './pages/Matches'
import { MatchDetail } from './pages/MatchDetail'
import { Profile } from './pages/Profile'
import { NotFound } from './pages/NotFound'

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

  const renderPage = () => {
    if (page.startsWith('/matches/')) {
      const grantId = page.split('/')[2]
      if (grantId) return <MatchDetail grantId={grantId} />
    }
    switch (page) {
      case '/login':
        return <Login />
      case '/matches':
        return <Matches />
      case '/profile':
        return <Profile />
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
