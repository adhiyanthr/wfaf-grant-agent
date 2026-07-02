import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Match,
  FeedbackRow,
  fetchOrgByEmail,
  fetchMatch,
  fetchLatestFeedback,
  submitFeedback,
  displayScore,
  formatAmount,
  daysUntil,
} from '../lib/matches'

const RESPONSE_OPTIONS = [
  { value: 'not_relevant', label: 'Not relevant' },
  { value: 'already_applied', label: 'Already applied' },
  { value: 'more_like_this', label: 'More like this' },
] as const

export function MatchDetail({ grantId }: { grantId: string }) {
  const [user, setUser] = useState<any>(null)
  const [org, setOrg] = useState<any>(null)
  const [match, setMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // feedback state
  const [feedback, setFeedback] = useState<FeedbackRow | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [feedbackSaved, setFeedbackSaved] = useState(false)
  const [feedbackError, setFeedbackError] = useState(false)

  // message state
  const [message, setMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [messageSent, setMessageSent] = useState(false)
  const [messageError, setMessageError] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        window.location.href = '/login'
        return
      }

      setUser(session.user)

      try {
        const orgData = await fetchOrgByEmail(session.user.email!)
        setOrg(orgData)
        if (orgData) {
          const [m, fb] = await Promise.all([
            fetchMatch(orgData.id, grantId),
            fetchLatestFeedback(orgData.id, grantId),
          ])
          setMatch(m)
          setFeedback(fb)
        }
      } catch (err) {
        console.error('Failed to load match:', err)
        setLoadError('We had trouble loading this grant. Please refresh, or email grants@grantequity.org.')
      }

      setLoading(false)
    }

    load()
  }, [grantId])

  const handleFeedback = async (response: 'not_relevant' | 'already_applied' | 'more_like_this') => {
    if (!org) return
    setSubmitting(response)
    setFeedbackSaved(false)
    setFeedbackError(false)
    try {
      await submitFeedback(org.id, grantId, response, note.trim() || null)
      setFeedback({ id: '', grant_id: grantId, response, note: note.trim() || null, created_at: new Date().toISOString() })
      setFeedbackSaved(true)
      setNote('')
    } catch (err) {
      console.error('Failed to save feedback:', err)
      setFeedbackError(true)
    }
    setSubmitting(null)
  }

  const handleMessage = async () => {
    if (!org || !message.trim()) return
    setSendingMessage(true)
    setMessageSent(false)
    setMessageError(false)
    try {
      await submitFeedback(org.id, grantId, 'message', message.trim())
      setMessageSent(true)
      setMessage('')
    } catch (err) {
      console.error('Failed to send message:', err)
      setMessageError(true)
    }
    setSendingMessage(false)
  }

  if (loading) {
    return (
      <div className="center">
        <div className="spinner"></div>
        <p>Loading grant...</p>
      </div>
    )
  }

  if (!user) return null

  if (loadError || !org || !match) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: '10px' }}>
            {loadError ? 'Something went wrong' : "We couldn't find that grant"}
          </h2>
          <p className="muted" style={{ marginBottom: '16px' }}>
            {loadError || "It may have been removed, or the link is old."}
          </p>
          <a href="/matches" className="btn">← All matches</a>
        </div>
      </div>
    )
  }

  const g = match.grants
  const days = daysUntil(g.deadline)
  const amount = formatAmount(g.amount_min, g.amount_max)
  const strengths = match.analysis?.strengths?.filter(Boolean) ?? []
  const considerations = match.analysis?.considerations?.filter(Boolean) ?? []
  const flags = match.eligibility_flags?.filter(Boolean) ?? []

  return (
    <div className="container">
      <p style={{ marginBottom: '18px' }}>
        <a href="/matches" style={{ color: 'var(--ink-2)' }}>← All matches</a>
      </p>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          gap: '16px',
          marginBottom: '18px',
        }}
      >
        <div style={{ flex: 1 }}>
          <h1 style={{ marginBottom: '6px' }}>{g.title}</h1>
          {g.funder && <p className="muted">{g.funder}</p>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--accent)' }}>
            {displayScore(match.fit_score)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>match score</div>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: '28px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            Deadline
          </div>
          <div
            style={{
              fontWeight: 600,
              color: days != null && days <= 30 ? 'var(--warn-ink)' : 'var(--ink)',
            }}
          >
            {g.deadline
              ? `${new Date(g.deadline).toLocaleDateString()}${days != null ? ` (${days} days left)` : ''}`
              : 'Not listed'}
          </div>
        </div>
        {amount && (
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              Award
            </div>
            <div style={{ fontWeight: 600 }}>{amount}</div>
          </div>
        )}
      </div>

      {g.tags && g.tags.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {g.tags.map((tag) => (
            <span key={tag} className="chip">{tag}</span>
          ))}
        </div>
      )}

      <a
        href={g.url}
        target="_blank"
        rel="noopener noreferrer"
        className="btn"
        style={{ marginBottom: '28px', display: 'inline-flex' }}
      >
        Apply on funder site ↗
      </a>

      {/* AI analysis */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '14px' }}>
          Why this fits {org.name || 'your org'}
        </h2>

        {flags.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {flags.map((flag) => (
              <span key={flag} className="chip chip--warn">{flag}</span>
            ))}
          </div>
        )}

        {strengths.length > 0 ? (
          <>
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '8px' }}>
              {strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            {considerations.length > 0 && (
              <>
                <h3 style={{ fontSize: '1rem', margin: '16px 0 8px' }}>Things to verify</h3>
                <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '8px' }} className="muted">
                  {considerations.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : match.fit_rationale ? (
          <p>{match.fit_rationale}</p>
        ) : (
          <p className="muted">
            Our agent matched this grant to your profile. A detailed analysis will appear for new
            matches starting next Monday.
          </p>
        )}

        <p className="muted" style={{ fontSize: '0.82rem', marginTop: '14px' }}>
          AI-generated — verify amounts, deadlines, and eligibility at the source before applying.
        </p>
      </div>

      {/* Feedback */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '6px' }}>Was this match useful?</h2>
        <p className="muted" style={{ marginBottom: '14px' }}>
          Your response tunes next Monday's matches.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {RESPONSE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="btn btn--ghost"
              aria-pressed={feedback?.response === opt.value}
              disabled={submitting !== null}
              onClick={() => handleFeedback(opt.value)}
            >
              {submitting === opt.value ? 'Saving…' : opt.label}
            </button>
          ))}
        </div>

        <div className="form-group" style={{ marginBottom: '10px' }}>
          <label htmlFor="feedback-note">Add a note (optional — sent with your next response)</label>
          <textarea
            id="feedback-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. We already work with this funder, or: too small for our program."
          />
        </div>

        {feedbackSaved && (
          <div className="alert success">Thanks — your Monday matches will adjust.</div>
        )}
        {feedbackError && (
          <div className="alert error">
            Couldn't save that. Please try again, or email grants@grantequity.org.
          </div>
        )}
      </div>

      {/* Message GrantEquity */}
      <div className="card" style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '6px' }}>Message GrantEquity</h2>
        <p className="muted" style={{ marginBottom: '14px' }}>
          Questions about this grant, or want different kinds of matches? We read everything.
        </p>

        <div className="form-group" style={{ marginBottom: '10px' }}>
          <textarea
            aria-label="Message to GrantEquity"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what you're looking for, or ask us anything about this grant."
          />
        </div>

        <button className="btn" onClick={handleMessage} disabled={sendingMessage || !message.trim()}>
          {sendingMessage ? 'Sending…' : 'Send message'}
        </button>

        {messageSent && (
          <div className="alert success" style={{ marginTop: '12px' }}>
            Sent — we'll reply to {org.email}.
          </div>
        )}
        {messageError && (
          <div className="alert error" style={{ marginTop: '12px' }}>
            Couldn't send that. Please email grants@grantequity.org directly.
          </div>
        )}
      </div>
    </div>
  )
}
