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

// Basic email-shape check for recipient entry (not exhaustive; the send layer
// tolerates the primary address being duplicated anyway).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Single-org profile editor. RLS scopes both the read and the write to the row
// owned by the current Auth user (auth_user_id = auth.uid()).
export default function Profile() {
  const { orgId } = useSession();
  const [org, setOrg] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | saving | saved | error
  const [error, setError] = useState(null);
  // Extra digest recipients (organizations.digest_recipients text[]). Held as
  // local state because it's an array, not a scalar FIELDS entry.
  const [recipients, setRecipients] = useState([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [recipientError, setRecipientError] = useState(null);

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
          setRecipients(Array.isArray(data?.digest_recipients) ? data.digest_recipients : []);
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

  function addRecipient() {
    const value = recipientInput.trim().toLowerCase();
    setRecipientError(null);
    if (!value) return;
    if (!EMAIL_RE.test(value)) {
      setRecipientError('Enter a valid email address.');
      return;
    }
    if (value === (org?.email || '').toLowerCase()) {
      setRecipientError('This is already your primary address — it always receives the digest.');
      return;
    }
    if (recipients.some((r) => r.toLowerCase() === value)) {
      setRecipientError('That address is already on the list.');
      return;
    }
    setRecipients((rs) => [...rs, value]);
    setRecipientInput('');
  }

  function removeRecipient(email) {
    setRecipients((rs) => rs.filter((r) => r !== email));
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
    patch.digest_recipients = recipients;
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

        <div className="field">
          <label htmlFor="recipient-input">Extra digest recipients</label>
          <p className="sub-text" style={{ margin: '0 0 8px' }}>
            These addresses also receive your weekly grant digest. Your login
            email ({org.email}) always receives it.
          </p>
          {recipients.length > 0 && (
            <ul className="chips">
              {recipients.map((r) => (
                <li className="chip" key={r}>
                  <span>{r}</span>
                  <button
                    type="button"
                    className="chip-x"
                    aria-label={`Remove ${r}`}
                    onClick={() => removeRecipient(r)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="chip-add">
            <input
              id="recipient-input"
              type="email"
              placeholder="colleague@yournonprofit.org"
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addRecipient();
                }
              }}
            />
            <button type="button" className="ghost" onClick={addRecipient}>
              Add
            </button>
          </div>
          {recipientError && (
            <p className="error" style={{ marginTop: '6px' }}>{recipientError}</p>
          )}
        </div>

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
