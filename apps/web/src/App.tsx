import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import CasinoView from './features/casino/CasinoView';
import { RouletteView } from './features/casino/RouletteView';
import WalletFeature from './features/wallet/WalletView';
import LoginView from './features/auth/LoginView';
import { useAuthStore } from './store/useAuthStore';
import MarketView from './features/market/MarketView';
import RewardsView from './features/rewards/RewardsView';
import AdminView from './features/admin/AdminView';
import InventoryView from './features/profile/InventoryView';
import LeaderboardView from './features/stats/LeaderboardView';
import HealthView from './features/stats/HealthView';
import RoomLobbyView from './features/casino/RoomLobbyView';
import { useSyncUser } from './hooks/useSyncUser';

const queryClient = new QueryClient();

function AppContent() {
  const { isAuthorized } = useAuthStore();
  useSyncUser();

  return (
      <Router>
        <Routes>
          {!isAuthorized ? (
            <Route path="*" element={<LoginView />} />
          ) : (
            <Route path="/app" element={<Layout />}>
            <Route index element={<div>Lobby</div>} />
            <Route path="casino/roulette" element={<RouletteView />} />
            <Route path="casino/:game" element={<CasinoView />} />
            <Route path="casino/:game/lobby" element={<RoomLobbyView />} />
            <Route path="wallet" element={<WalletFeature />} />
            <Route path="market" element={<MarketView />} />
            <Route path="rewards" element={<RewardsView />} />
            <Route path="leaderboard" element={<LeaderboardView />} />
            <Route path="health" element={<HealthView />} />
            <Route path="support" element={<div>Support</div>} />
            <Route path="profile" element={<div>Profile</div>} />
            <Route path="inventory" element={<InventoryView />} />
              <Route path="admin" element={<AdminView />} />
            </Route>
          )}
          <Route path="/" element={<Navigate to="/app" replace />} />
        </Routes>
      </Router>
  );
}

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <AppContent />
        </QueryClientProvider>
    );
}

export default App;
