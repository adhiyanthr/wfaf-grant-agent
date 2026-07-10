import { createClient } from '@supabase/supabase-js';

// URL + anon key mirror the marketing site (index.html:911-913). The anon key is
// already public; per-org access is enforced by RLS, not by hiding the key. Env
// vars override the baked-in defaults for local/preview deploys.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://ujixxuvfpuykcmzcebmg.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqaXh4dXZmcHV5a2NtemNlYm1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTQ4MDAsImV4cCI6MjA5Nzk3MDgwMH0.GckAxe3pHOoGhAE07mnrCyW_uoMR8FCmRT0mrkZnsNk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
