import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';

const ACTIONS = [
  { status: 'saved', label: 'Save' },
  { status: 'applied', label: 'Mark applied' },
  { status: 'dismissed', label: 'Dismiss' },
];

// Match detail: full reasoning, eligibility flags, effort, external link, status
// actions. The partial-confidence caveat renders ABOVE the reasoning. Status
// changes update org_grants and capture a match_feedback row (step 6).
export default function MatchDetail() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from('org_grants')
      .select(
        'id, fit_score, fit_reasoning, eligibility_flags, effort_estimate, status, ' +
        'data_confidence, eligibility_text_unavailable, ' +
        'grants!inner(title, funder, deadline, url, amount_min, amount_max)'
      )
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setRow(data);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // Update status + stamp, then record the change in match_feedback (note null).
  async function changeStatus(next) {
    setBusy(true);
    setError(null);
    const { error: upErr } = await supabase
      .from('org_grants')
      .update({ status: next, status_updated_at: new Date().toISOString() })
      .eq('id', id);
    if (upErr) {
      setError(upErr.message);
      setBusy(false);
      return;
    }
    setRow((r) => ({ ...r, status: next }));
    await supabase.from('match_feedback').insert({ match_id: id, status: next, note: null });
    setBusy(false);
  }

  // Optional "why" note attached to the current status.
  async function submitNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    const { error: fbErr } = await supabase
      .from('match_feedback')
      .insert({ match_id: id, status: row?.status || 'new', note: note.trim() });
    setBusy(false);
    if (fbErr) setError(fbErr.message);
    else {
      setNote('');
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 1500);
    }
  }

  if (loading) return <div className="center muted">Loading…</div>;
  if (error && !row) return <div className="card"><p className="error">{error}</p></div>;
  if (!row) return <div className="card"><p className="muted">Match not found.</p><Link to="/matches">← Back to matches</Link></div>;

  const g = row.grants;
  const flags = Array.isArray(row.eligibility_flags) ? row.eligibility_flags : [];
  const partial = row.data_confidence === 'partial';

  function scoreTier(score) {
    if (score == null) return 'none';
    if (score >= 75) return 'high';
    if (score >= 50) return 'med';
    return 'low';
  }

  return (
    <div className="card detail">
      <Link to="/matches" className="back">← Matches</Link>

      <div className="detail-head">
        <span className="score score-lg" data-tier={scoreTier(row.fit_score)}>{row.fit_score ?? '—'}</span>
        <div>
          <h1>{g.title}</h1>
          <p className="muted">
            {g.funder || 'Unknown funder'}
            {g.deadline ? ` · due ${g.deadline}` : ''}
            {row.effort_estimate ? ` · ${row.effort_estimate} effort` : ''}
          </p>
        </div>
      </div>

      {/* Partial-confidence caveat renders ABOVE the reasoning, per the plan. */}
      {partial && (
        <div className="caveat">
          <ConfidenceBadge confidence="partial" />
          <span>
            The full eligibility page couldn’t be fetched
            {row.eligibility_text_unavailable ? '' : ''}, so this fit was scored from a
            limited web-search snippet. Treat the reasoning below as provisional and
            confirm details on the funder’s site.
          </span>
        </div>
      )}

      <section>
        <h2>Why this fits</h2>
        <p className="reasoning">{row.fit_reasoning || 'No reasoning recorded.'}</p>
      </section>

      {flags.length > 0 && (
        <section>
          <h2>Eligibility flags</h2>
          <ul className="flags">
            {flags.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </section>
      )}

      <section>
        <a className="external" href={g.url} target="_blank" rel="noopener noreferrer">
          View grant on funder’s site ↗
        </a>
      </section>

      <section className="actions">
        <h2>Status</h2>
        <div className="row">
          {ACTIONS.map((a) => (
            <button
              key={a.status}
              disabled={busy}
              className={row.status === a.status ? 'active' : ''}
              onClick={() => changeStatus(a.status)}
            >
              {a.label}
            </button>
          ))}
          <span className="current-status">Current: <strong>{row.status || 'new'}</strong></span>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      <section>
        <form onSubmit={submitNote}>
          <label htmlFor="note">
            Add a note {row.status === 'dismissed' ? '(why did this not fit?)' : '(optional)'}
          </label>
          <textarea
            id="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Helps us improve future matches…"
          />
          <div className="row">
            <button type="submit" disabled={busy || !note.trim()}>Save note</button>
            {noteSaved && <span className="ok">Saved ✓</span>}
          </div>
        </form>
      </section>
    </div>
  );
}
