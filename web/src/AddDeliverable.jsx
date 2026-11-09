import { useState } from 'react';
import { api } from './api.js';

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export default function AddDeliverable({ campaign, onClose, onAdded }) {
  const [f, setF] = useState({ name: '', handle: '', email: '', title: `${campaign.brand} video`, due: inDays(5), fee: '300' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const creator = await api('/creators', { method: 'POST', body: { name: f.name, handle: f.handle || undefined, paypal_email: f.email } });
      await api(`/campaigns/${campaign.id}/deliverables`, {
        method: 'POST',
        body: { creator_id: creator.id, title: f.title, due_date: f.due, fee_cents: Math.round(Number(f.fee) * 100) },
      });
      onAdded();
      onClose();
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <form className="drawer" style={{ width: 'min(460px, 100vw)' }} onSubmit={submit}>
        <div className="drawer-head">
          <div>
            <h2>Add a deliverable</h2>
            <div className="muted small">The creator gets a link to submit their post.</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="drawer-body">
          <div className="row">
            <div className="field">
              <label htmlFor="n">Creator name</label>
              <input id="n" className="input" required value={f.name} onChange={set('name')} />
            </div>
            <div className="field">
              <label htmlFor="h">Handle</label>
              <input id="h" className="input" placeholder="@channel" value={f.handle} onChange={set('handle')} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="e">PayPal email</label>
            <input id="e" className="input" type="email" required value={f.email} onChange={set('email')} />
            <span className="hint">Sandbox only: use a sandbox personal account email.</span>
          </div>
          <div className="field">
            <label htmlFor="t">Deliverable</label>
            <input id="t" className="input" required value={f.title} onChange={set('title')} />
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="d">Due</label>
              <input id="d" className="input" type="date" required value={f.due} onChange={set('due')} />
            </div>
            <div className="field">
              <label htmlFor="fee">Fee (USD)</label>
              <input id="fee" className="input" type="number" min="1" step="0.01" required value={f.fee} onChange={set('fee')} />
            </div>
          </div>
          {err && <p className="error-text">{err}</p>}
          <button className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Adding…' : 'Add deliverable'}
          </button>
        </div>
      </form>
    </>
  );
}
