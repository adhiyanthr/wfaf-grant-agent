// The verified admin password for this browser TAB (sessionStorage, cleared on
// close). It is re-sent with — and re-verified server-side on — every admin
// action; storing it here only spares re-typing between the Admin and Handoff
// pages. Never persisted to localStorage.

const KEY = 'wf_admin_pw'

export function getAdminPassword(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setAdminPassword(pw: string): void {
  try {
    sessionStorage.setItem(KEY, pw)
  } catch {
    /* storage disabled — admin pages just re-prompt */
  }
}

export function clearAdminPassword(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
