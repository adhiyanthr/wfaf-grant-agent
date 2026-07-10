import { Navigate, Route, Routes, Link, useNavigate } from 'react-router-dom';
import { SessionProvider, useSession } from './session.jsx';
import { supabase } from './supabaseClient.js';
import Login from './routes/Login.jsx';
import Profile from './routes/Profile.jsx';
import Matches from './routes/Matches.jsx';
import MatchDetail from './routes/MatchDetail.jsx';
import Settings from './routes/Settings.jsx';
import SitePasswordGate from './routes/SitePasswordGate.jsx';

// Gate authenticated routes; bounce to /login when there's no session.
function RequireAuth({ children }) {
  const { session, loading } = useSession();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function Nav() {
  const { session } = useSession();
  const navigate = useNavigate();
  if (!session) return null;
  return (
    <nav className="nav">
      <Link to="/matches" className="brand">GrantEquity</Link>
      <div className="nav-links">
        <Link to="/matches">Matches</Link>
        <Link to="/profile">Profile</Link>
        <Link to="/settings">Settings</Link>
        <button
          className="linklike"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate('/login');
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

function Shell() {
  return (
    <>
      <Nav />
      <main className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/matches" replace />} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/matches" element={<RequireAuth><Matches /></RequireAuth>} />
          <Route path="/matches/:id" element={<RequireAuth><MatchDetail /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/matches" replace />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <SitePasswordGate>
        <Shell />
      </SitePasswordGate>
    </SessionProvider>
  );
}
