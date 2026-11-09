import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api.js';

const EXAMPLE = `Hi! For the Ember Drop launch we'd love one YouTube video, at least 60 seconds.

- Show the Ember Drop bottle in the first 10 seconds
- Tell your audience in your own words why you like it
- Put @pepperwick, our link pepperwick.co/ember and the code EMBER15 in the description

Keep it upbeat and please don't mention other hot sauce brands. Fee is $300, paid on approval. Post by the 20th.`;

export default function NewCampaign() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', brand: '', budget: '1500', brief: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const c = await api('/campaigns', {
        method: 'POST',
        body: { name: f.name, brand: f.brand, brief_text: f.brief, budget_cents: Math.round(Number(f.budget) * 100) },
      });
      nav(`/campaigns/${c.id}`);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div>
          <h1>New campaign</h1>
          <div className="sub">Paste the brand's brief. Cleared turns it into checks it can run on every post.</div>
        </div>
      </div>
      <form className="new-grid" onSubmit={submit}>
        <div className="card card-body">
          <div className="row">
            <div className="field">
              <label htmlFor="cn">Campaign name</label>
              <input id="cn" className="input" required placeholder="Ember Drop launch" value={f.name} onChange={set('name')} />
            </div>
            <div className="field">
              <label htmlFor="cb">Brand</label>
              <input id="cb" className="input" required placeholder="Pepperwick" value={f.brand} onChange={set('brand')} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="bud">Budget (USD)</label>
            <input id="bud" className="input" type="number" min="1" required value={f.budget} onChange={set('budget')} />
            <span className="hint">The brand pays this up front, so creators are paid from money already received.</span>
          </div>
          <div className="field">
            <label htmlFor="br" style={{ display: 'flex', justifyContent: 'space-between' }}>
              Brief
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ height: 22 }}
                onClick={() => setF({ ...f, brief: EXAMPLE, name: f.name || 'Ember Drop launch', brand: f.brand || 'Pepperwick' })}
              >
                Use example
              </button>
            </label>
            <textarea id="br" className="textarea" required style={{ minHeight: 240 }} value={f.brief} onChange={set('brief')} />
          </div>
          {err && <p className="error-text">{err}</p>}
          <button className="btn btn-primary" disabled={busy} style={{ width: '100%', height: 40 }}>
            {busy ? (
              <>
                <span className="spinner" /> Reading the brief…
              </>
            ) : (
              'Create campaign'
            )}
          </button>
        </div>
        <div className="card card-body how-card">
          <h2 style={{ marginBottom: 8 }}>What happens next</h2>
          <ol className="how">
            <li>AI pulls every checkable requirement out of the brief. It skips anything it can't verify, like tone or payment terms.</li>
            <li>Code adds the FTC disclosure checks to every campaign, whatever the brief says.</li>
            <li>You add creators and the post each one owes, with the agreed fee.</li>
            <li>When a creator submits their link, Gemini watches the video and code checks the YouTube data.</li>
            <li>If everything passes, PayPal pays the creator within seconds. If not, they get a specific fix and a re-check.</li>
          </ol>
        </div>
      </form>
    </div>
  );
}
