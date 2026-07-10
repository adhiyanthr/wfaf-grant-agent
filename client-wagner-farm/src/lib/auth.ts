import { supabase } from './supabase'

export async function signInWithPassword(email: string, password: string) {
  return await supabase.auth.signInWithPassword({ email, password })
}

// Emails the account owner a link to set a new password (used for first-time
// setup or recovery). The link lands on /reset, where updatePassword runs.
export async function sendPasswordReset(email: string) {
  return await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset`,
  })
}

export async function updatePassword(password: string) {
  return await supabase.auth.updateUser({ password })
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession()
  return { session, error }
}

export async function signOut() {
  return await supabase.auth.signOut()
}
