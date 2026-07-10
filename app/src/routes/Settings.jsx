import { useState } from 'react';
import { setGatePassword } from '../sitePassword.js';

// Change the shared site password (the curtain in front of the whole app). Lives
// behind RequireAuth so only logged-in users can rotate it.
export default function Settings() {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState('ready'); // ready | saving | saved | error
  const [error, setError] = useState(null);

  async function save(e) {
    e.preventDefault();
    setError(null);
    if (pw.length < 4) {
      setError('Choose a password of at least 4 characters.');
      return;
    }
    if (pw !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setStatus('saving');
    try {
      await setGatePassword(pw);
      setStatus('saved');
      setPw('');
      setConfirm('');
      setTimeout(() => setStatus('ready'), 1500);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  return (
    <div className="card">
      <h1>Settings</h1>
      <p className="sub-text">Change the shared password that gates access to this site.</p>
      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="new-pw">New site password</label>
          <input
            id="new-pw"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="confirm-pw">Confirm password</label>
          <input
            id="confirm-pw"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <p className="sub-text" style={{ marginTop: 0 }}>
          This changes the password for everyone. Browsers that are already
          unlocked stay in until their storage is cleared; new visitors will need
          the new password.
        </p>
        <div className="row">
          <button type="submit" disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Update password'}
          </button>
          {status === 'saved' && <span className="ok">Saved ✓</span>}
          {error && <span className="error">{error}</span>}
        </div>
      </form>
    </div>
  );
}
