import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CasinoView from './features/casino/CasinoView';
import { RouletteView } from './features/casino/RouletteView';
import WalletView from './features/wallet/WalletView';
import LoginView from './features/auth/LoginView';
import { useAuthStore } from './store/useAuthStore';
import MarketView from './features/market/MarketView';
import RewardsView from './features/rewards/RewardsView';
import AdminView from './features/admin/AdminView';
import InventoryView from './features/profile/InventoryView';
import LeaderboardView from './features/stats/LeaderboardView';
import HealthView from './features/stats/HealthView';
import RoomLobbyView from './features/casino/RoomLobbyView';
import LobbyView from './features/casino/LobbyView';
import SupportView from './features/support/SupportView';
import ProfileSetup from './features/profile/ProfileSetup';
import AnnouncementCenter from './features/announcement/AnnouncementCenter';
import SettingsView from './features/settings/SettingsView';
import SoundPlayer from './components/SoundPlayer';
import { useSyncUser } from './hooks/useSyncUser';
import Layout from './components/Layout';

const queryClient = new QueryClient();

function AppContent() {
  const { isAuthorized } = useAuthStore();
  const { userData, isLoading } = useSyncUser();

  const needsProfileSetup = isAuthorized && !isLoading && userData && !userData.user?.displayName;

  return (
    <div className="relative min-h-screen bg-[#0e0e0e]">
      <SoundPlayer />
      <Routes>
        {!isAuthorized ? (
          <Route path="*" element={<LoginView />} />
        ) : needsProfileSetup ? (
          <Route path="*" element={<ProfileSetup onComplete={() => window.location.reload()} />} />
        ) : (
          <Route path="/app" element={<Layout />}>
            <Route index element={<LobbyView />} />
            <Route path="casino/roulette" element={<RouletteView />} />
            <Route path="casino/:game" element={<CasinoView />} />
            <Route path="casino/lobby" element={<RoomLobbyView />} />
            <Route path="wallet" element={<WalletView />} />
            <Route path="market" element={<MarketView />} />
            <Route path="rewards" element={<RewardsView />} />
            <Route path="leaderboard" element={<LeaderboardView />} />
            <Route path="announcement" element={<AnnouncementCenter />} />
            <Route path="support" element={<SupportView />} />
            <Route path="inventory" element={<InventoryView />} />
            <Route path="admin" element={<AdminView />} />
            <Route path="settings" element={<SettingsView />} />
            <Route path="health" element={<HealthView />} />
          </Route>
        )}
        {isAuthorized && !needsProfileSetup && (
            <Route path="/" element={<Navigate to="/app" replace />} />
        )}
      </Routes>
    </div>
  );
}

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <Router>
                <AppContent />
            </Router>
        </QueryClientProvider>
    );
}

export default App;
