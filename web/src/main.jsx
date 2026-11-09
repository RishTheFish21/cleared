import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles.css';
import BrandApp from './BrandApp.jsx';
import CampaignPage from './CampaignPage.jsx';
import NewCampaign from './NewCampaign.jsx';
import CreatorPage from './CreatorPage.jsx';
import Home from './Home.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<BrandApp />}>
          <Route path="/" element={<Home />} />
          <Route path="/campaigns/new" element={<NewCampaign />} />
          <Route path="/campaigns/:id" element={<CampaignPage />} />
        </Route>
        <Route path="/c/:id" element={<CreatorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
