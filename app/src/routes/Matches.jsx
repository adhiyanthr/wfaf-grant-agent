import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import ConfidenceBadge from '../components/ConfidenceBadge.jsx';

const STATUSES = ['all', 'new', 'saved', 'applied', 'dismissed', 'won', 'rejected'];
const EFFORTS = ['all', 'low', 'medium', 'high'];

function scoreTier(score) {
  if (score == null) return 'none';
  if (score >= 75) return 'high';
  if (score >= 50) return 'med';
  return 'low';
}

// Matches list: RLS returns only this org's rows. Sortable by fit_score,
// filterable by status + effort. Partial-confidence rows carry a visible badge.
export default function Matches() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [effortFilter, setEffortFilter] = useState('all');
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    let active = true;
    supabase
      .from('org_grants')
      .select(
        'id, fit_score, effort_estimate, status, data_confidence, ' +
        'grants!inner(title, funder, deadline, url)'
      )
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        else setRows(data || []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    let out = rows.filter((r) => {
      if (statusFilter !== 'all' && (r.status || 'new') !== statusFilter) return false;
      if (effortFilter !== 'all' && r.effort_estimate !== effortFilter) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      const av = a.fit_score ?? -1;
      const bv = b.fit_score ?? -1;
      return sortDesc ? bv - av : av - bv;
    });
    return out;
  }, [rows, statusFilter, effortFilter, sortDesc]);

  if (loading) return <div className="center muted">Loading matches…</div>;
  if (error) return <div className="card"><p className="error">{error}</p></div>;

  return (
    <div>
      <div className="list-header">
        <h1>Matches</h1>
        <div className="filters">
          <label>
            Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>
            Effort
            <select value={effortFilter} onChange={(e) => setEffortFilter(e.target.value)}>
              {EFFORTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <button className="sort-btn" onClick={() => setSortDesc((d) => !d)}>
            Fit {sortDesc ? '↓' : '↑'}
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="muted">No matches yet. Check back after the next weekly run.</p>
      ) : (
        <ul className="matches">
          {visible.map((r) => (
            <li key={r.id} className="match-row">
              <Link to={`/matches/${r.id}`} className="match-link">
                <span className="score" data-tier={scoreTier(r.fit_score)}>{r.fit_score ?? '—'}</span>
                <span className="match-main">
                  <span className="match-title">
                    {r.grants.title}
                    <ConfidenceBadge confidence={r.data_confidence} />
                  </span>
                  <span className="match-meta">
                    {r.grants.funder || 'Unknown funder'}
                    {r.effort_estimate ? ` · ${r.effort_estimate} effort` : ''}
                    {r.grants.deadline ? ` · due ${r.grants.deadline}` : ''}
                  </span>
                </span>
                <span className={`status-chip status-${r.status || 'new'}`}>{r.status || 'new'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
