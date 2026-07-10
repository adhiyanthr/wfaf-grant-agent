import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';

// Tracks the Supabase Auth session and links the org row to the user on first
// login via the claim_org() RPC (idempotent server-side).
const SessionContext = createContext({ session: null, loading: true, orgId: null });

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Claim (or re-fetch) the org linked to this user. Safe to call repeatedly.
  async function claim() {
    const { data, error } = await supabase.rpc('claim_org');
    if (error) {
      console.error('claim_org failed:', error.message);
      return null;
    }
    setOrgId(data ?? null);
    return data ?? null;
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      if (data.session) await claim();
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next ?? null);
      if (next) await claim();
      else setOrgId(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, loading, orgId, claim }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
