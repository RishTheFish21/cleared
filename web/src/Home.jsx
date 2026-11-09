import { Navigate, Link } from 'react-router-dom';
import { usePolling } from './api.js';
import { Empty } from './ui.jsx';

/** Opens the most recent campaign, or invites you to create one. */
export default function Home() {
  const { data } = usePolling('/campaigns', 10000);
  if (!data) return null;
  if (data.length) return <Navigate to={`/campaigns/${data[0].id}`} replace />;
  return (
    <div className="page">
      <div className="card">
        <Empty title="No campaigns yet">
          <p>Paste a brand brief and Cleared turns it into a checklist it can verify.</p>
          <Link className="btn btn-primary" to="/campaigns/new">
            Create a campaign
          </Link>
        </Empty>
      </div>
    </div>
  );
}
