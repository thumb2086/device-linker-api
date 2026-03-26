import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import CasinoView from './features/casino/CasinoView';
import WalletFeature from './features/wallet/WalletView';
import MarketView from './features/market/MarketView';
import RewardsView from './features/rewards/RewardsView';
import AdminView from './features/admin/AdminView';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/app" element={<Layout />}>
            <Route index element={<div>Lobby</div>} />
            <Route path="casino/:game" element={<CasinoView />} />
            <Route path="wallet" element={<WalletFeature />} />
            <Route path="market" element={<MarketView />} />
            <Route path="rewards" element={<RewardsView />} />
            <Route path="support" element={<div>Support</div>} />
            <Route path="profile" element={<div>Profile</div>} />
            <Route path="admin" element={<AdminView />} />
          </Route>
          <Route path="/" element={<Navigate to="/app" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
