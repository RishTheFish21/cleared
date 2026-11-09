import { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { Logo } from './ui.jsx';
import { api, usePolling } from './api.js';
import AskCleared from './AskCleared.jsx';

export default function BrandApp() {
  const { data: campaigns, refresh } = usePolling('/campaigns', 5000);
  const { data: health } = usePolling('/health', 60000);
  const [resetting, setResetting] = useState(false);
  const nav = useNavigate();

  const reset = async () => {
    if (!window.confirm('Reset the demo? This clears all campaigns and payouts in this sandbox demo.')) return;
    setResetting(true);
    try {
      const { campaignId } = await api('/demo/reset', { method: 'POST' });
      await refresh();
      nav(`/campaigns/${campaignId}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="shell">
      <header className="topbar">
        <Logo />
        <span className="sandbox-tag">PayPal sandbox</span>
        <div className="spacer" />
        <span className="org">Northwind Creator Co.</span>
        {health?.demoMode && (
          <button className="btn btn-sm" onClick={reset} disabled={resetting} title="Put the demo back to its starting state">
            {resetting ? 'Resetting…' : 'Reset demo'}
          </button>
        )}
      </header>
      <div className="layout">
        <nav className="sidebar" aria-label="Campaigns">
          <div className="sidebar-head">
            <h3>Campaigns</h3>
            <Link to="/campaigns/new" className="btn btn-sm" title="New campaign">
              + New
            </Link>
          </div>
          {campaigns?.map((c) => (
            <NavLink key={c.id} to={`/campaigns/${c.id}`} className={({ isActive }) => `camp-link${isActive ? ' active' : ''}`}>
              <div style={{ fontWeight: 500 }}>{c.name}</div>
              <div className="camp-brand">
                {c.brand} · <span className="mono">{c.paid_count}/{c.deliverable_count}</span> paid
              </div>
            </NavLink>
          ))}
          {campaigns?.length === 0 && <p className="muted small" style={{ padding: '0 10px' }}>No campaigns yet.</p>}
        </nav>
        <main className="main">
          <Outlet />
        </main>
      </div>
      <AskCleared />
    </div>
  );
}
