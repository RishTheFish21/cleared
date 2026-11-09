import { NavLink, Outlet, Link } from 'react-router-dom';
import { Logo } from './ui.jsx';
import { usePolling } from './api.js';

export default function BrandApp() {
  const { data: campaigns } = usePolling('/campaigns', 5000);

  return (
    <div className="shell">
      <header className="topbar">
        <Logo />
        <span className="sandbox-tag">PayPal sandbox</span>
        <div className="spacer" />
        <span className="org">Northwind Creator Co. · agency workspace</span>
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
              <div style={{ fontWeight: 600 }}>{c.name}</div>
              <div className="camp-brand">
                {c.brand} · {c.paid_count}/{c.deliverable_count} paid
              </div>
            </NavLink>
          ))}
          {campaigns?.length === 0 && <p className="muted small" style={{ padding: '0 10px' }}>No campaigns yet.</p>}
        </nav>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
