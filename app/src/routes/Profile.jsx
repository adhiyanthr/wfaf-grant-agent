import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { useSession } from '../session.jsx';

const ORG_STATUSES = ['501c3', 'fiscal_sponsor', 'pending', 'unknown'];

const FIELDS = [
  { key: 'name', label: 'Organization name', type: 'text' },
  { key: 'mission_text', label: 'Mission / what you do', type: 'textarea' },
  { key: 'programs_text', label: 'Programs', type: 'textarea' },
  { key: 'geo_focus', label: 'Geographic focus', type: 'text', placeholder: 'e.g. Essex County, NJ' },
  { key: 'budget_range', label: 'Annual budget range', type: 'text', placeholder: 'e.g. $100k–$250k' },
  { key: 'org_status', label: 'Legal status', type: 'select', options: ORG_STATUSES },
  { key: 'founded_year', label: 'Year founded', type: 'number' },
];

// Single-org profile editor. RLS scopes both the read and the write to the row
// owned by the current Auth user (auth_user_id = auth.uid()).
// NOTE: extra digest recipients are no longer managed here — they're org-level
// config set as the DIGEST_RECIPIENTS GitHub Actions variable (see src/email.js).
export default function Profile() {
  const { orgId } = useSession();
  const [org, setOrg] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | saving | saved | error
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('organizations')
      .select('*')
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setError(error.message);
          setStatus('error');
        } else {
          setOrg(data || {});
          setStatus('ready');
        }
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  function update(key, value) {
    setOrg((o) => ({ ...o, [key]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setStatus('saving');
    setError(null);
    const patch = {};
    for (const f of FIELDS) {
      let v = org[f.key];
      if (f.type === 'number') v = v === '' || v == null ? null : Number(v);
      patch[f.key] = v ?? null;
    }
    const { error } = await supabase.from('organizations').update(patch).eq('id', org.id);
    if (error) {
      setError(error.message);
      setStatus('error');
    } else {
      setStatus('saved');
      setTimeout(() => setStatus('ready'), 1500);
    }
  }

  if (status === 'loading') return <div className="center muted">Loading profile…</div>;
  if (!org || !org.id) {
    return (
      <div className="card">
        <h1>Profile</h1>
        <p className="error">
          No organization is linked to this account yet. If you signed up with a
          different email, contact support to reconcile.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Organization profile</h1>
      <p className="sub-text">This profile drives how we score grant fit for you.</p>
      <form onSubmit={save}>
        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={f.key}>{f.label}</label>
            {f.type === 'textarea' ? (
              <textarea
                id={f.key}
                rows={3}
                value={org[f.key] ?? ''}
                onChange={(e) => update(f.key, e.target.value)}
              />
            ) : f.type === 'select' ? (
              <select
                id={f.key}
                value={org[f.key] ?? 'unknown'}
                onChange={(e) => update(f.key, e.target.value)}
              >
                {f.options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                id={f.key}
                type={f.type}
                placeholder={f.placeholder || ''}
                value={org[f.key] ?? ''}
                onChange={(e) => update(f.key, e.target.value)}
              />
            )}
          </div>
        ))}

        <div className="row">
          <button type="submit" disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save profile'}
          </button>
          {status === 'saved' && <span className="ok">Saved ✓</span>}
          {error && <span className="error">{error}</span>}
        </div>
      </form>
    </div>
  );
}
