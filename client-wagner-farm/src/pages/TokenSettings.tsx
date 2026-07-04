import { useState, useEffect } from 'react'
import { fetchTokenSettings, updateTokenSettings, SettingsOrg, DashboardError } from '../lib/tokenDashboard'
import { previewSearches } from '../lib/searchPreview'
import { TokenNav } from '../components/TokenNav'

type FormState = {
  name: string
  focus_areas: string
  county: string
  state: string
  is_501c3: boolean
  annual_budget: string
  grant_size_pref: string
  what_we_do: string
  target_population: string
}

function orgToForm(org: SettingsOrg): FormState {
  return {
    name: org.name ?? '',
    focus_areas: (org.focus_areas ?? []).join(', '),
    county: org.county ?? '',
    state: org.state ?? '',
    is_501c3: org.is_501c3 ?? false,
    annual_budget: org.annual_budget ?? '',
    grant_size_pref: org.grant_size_pref ?? '',
    what_we_do: org.what_we_do ?? '',
    target_population: org.target_population ?? '',
  }
}

export function TokenSettings({ token }: { token: string }) {
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { org } = await fetchTokenSettings(token)
        if (cancelled) return
        setForm(orgToForm(org))
      } catch (err) {
        if (cancelled) return
        if (!(err instanceof DashboardError && err.code === 'network')) setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      await updateTokenSettings(token, {
        name: form.name.trim() || null,
        focus_areas: form.focus_areas
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        county: form.county.trim() || null,
        state: form.state.trim() || null,
        is_501c3: form.is_501c3,
        annual_budget: form.annual_budget.trim() || null,
        grant_size_pref: form.grant_size_pref.trim() || null,
        what_we_do: form.what_we_do.trim() || null,
        target_population: form.target_population.trim() || null,
      })
      setSaved(true)
    } catch {
      setSaveError("Couldn't save your changes. Please try again.")
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="center">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  if (notFound || !form) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', marginTop: '60px' }}>
          <h2 style={{ marginBottom: '10px' }}>Dashboard not found</h2>
          <p className="muted">
            This link is invalid or has expired. Check the link in your most recent grant email.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <TokenNav token={token} active="settings" />
      <div className="container">
      <h1 style={{ marginBottom: '8px' }}>Search settings</h1>
      <p style={{ marginBottom: '32px', color: 'var(--ink-2)' }}>
        These fields shape what grants get searched for every Monday. Update them any time.
      </p>

      <form onSubmit={handleSave}>
        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '20px' }}>About your organization</h2>

          <div className="form-group">
            <label htmlFor="name">Organization name</label>
            <input
              id="name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="focus_areas">Focus areas (comma-separated)</label>
            <input
              id="focus_areas"
              type="text"
              value={form.focus_areas}
              onChange={(e) => setForm({ ...form, focus_areas: e.target.value })}
              placeholder="e.g. environment, education, conservation"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="state">State</label>
              <input
                id="state"
                type="text"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="county">County</label>
              <input
                id="county"
                type="text"
                value={form.county}
                onChange={(e) => setForm({ ...form, county: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="what_we_do">What you do</label>
            <textarea
              id="what_we_do"
              rows={3}
              value={form.what_we_do}
              onChange={(e) => setForm({ ...form, what_we_do: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="target_population">Who you serve</label>
            <textarea
              id="target_population"
              rows={2}
              value={form.target_population}
              onChange={(e) => setForm({ ...form, target_population: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={form.is_501c3}
                onChange={(e) => setForm({ ...form, is_501c3: e.target.checked })}
              />
              Registered 501(c)(3)
            </label>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '20px' }}>Grant preferences</h2>

          <div className="form-group">
            <label htmlFor="annual_budget">Annual budget</label>
            <input
              id="annual_budget"
              type="text"
              value={form.annual_budget}
              onChange={(e) => setForm({ ...form, annual_budget: e.target.value })}
              placeholder="e.g. $250,000–$500,000"
              style={{ width: '100%' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="grant_size_pref">Preferred grant size</label>
            <input
              id="grant_size_pref"
              type="text"
              value={form.grant_size_pref}
              onChange={(e) => setForm({ ...form, grant_size_pref: e.target.value })}
              placeholder="e.g. $5,000–$50,000"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '6px' }}>What the agent will search for</h2>
          <p className="muted" style={{ marginBottom: '16px' }}>
            These are the exact web searches the agent runs based on the settings above. Edit the
            fields and this preview updates live.
          </p>
          <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '8px' }}>
            {previewSearches({
              state: form.state,
              county: form.county,
              focus_areas: form.focus_areas.split(',').map((s) => s.trim()).filter(Boolean),
            }).map((q, i) => (
              <li key={i} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.9rem' }}>
                {q}
              </li>
            ))}
          </ul>
          <p className="muted" style={{ fontSize: '0.82rem', marginTop: '14px' }}>
            Plus a rotating funder-type query, and every result is scored for fit against your full
            profile (budget, 501(c)(3) status, who you serve).
          </p>
        </div>

        {saved && <div className="alert success" style={{ marginBottom: '16px' }}>Saved — next Monday's search will use these settings.</div>}
        {saveError && <div className="alert error" style={{ marginBottom: '16px' }}>{saveError}</div>}

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>
      </div>
    </>
  )
}
