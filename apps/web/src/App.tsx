import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import CasinoView from './features/casino/CasinoView';
import { RouletteView } from './features/casino/RouletteView';
import { WalletView as WalletFeature } from './features/wallet/WalletView';
import LoginView from './features/auth/LoginView';
import { useAuthStore } from './store/useAuthStore';
import MarketView from './features/market/MarketView';
import RewardsView from './features/rewards/RewardsView';
import AdminView from './features/admin/AdminView';
import InventoryView from './features/profile/InventoryView';
import LeaderboardView from './features/stats/LeaderboardView';
import HealthView from './features/stats/HealthView';
import RoomLobbyView from './features/casino/RoomLobbyView';
import { LobbyView } from './features/casino/LobbyView';
import { SupportView } from './features/support/SupportView';
import ProfileSetup from './features/profile/ProfileSetup';
import AnnouncementCenter from './features/announcement/AnnouncementCenter';
import SettingsView from './features/settings/SettingsView';
import SoundPlayer from './components/SoundPlayer';
import { useSyncUser } from './hooks/useSyncUser';
import { useState } from 'react';

const queryClient = new QueryClient();

function AppContent() {
  const { isAuthorized, sessionId } = useAuthStore();
  const { userData, isLoading } = useSyncUser();

  // If authorized but no username, show setup
  const needsProfileSetup = isAuthorized && !isLoading && userData && !userData.user?.username;

  if (!isAuthorized) {
    return (
      <Router>
        <Routes>
          <Route path="*" element={<LoginView />} />
        </Routes>
      </Router>
    );
  }

  if (needsProfileSetup) {
    return <ProfileSetup onComplete={() => window.location.reload()} />;
  }

  return (
      <Router>
        <div className="relative min-h-screen bg-[#0a0a0a]">
          <SoundPlayer />
          <AnnouncementCenter />
          <Routes>
            <Route path="/app" element={<Layout />}>
              <Route index element={<LobbyView />} />
              <Route path="casino/roulette" element={<RouletteView />} />
              <Route path="casino/:game" element={<CasinoView />} />
              <Route path="casino/:game/lobby" element={<RoomLobbyView />} />
              <Route path="wallet" element={<WalletFeature />} />
              <Route path="market" element={<MarketView />} />
              <Route path="rewards" element={<RewardsView />} />
              <Route path="leaderboard" element={<LeaderboardView />} />
              <Route path="health" element={<HealthView />} />
              <Route path="support" element={<SupportView />} />
              <Route path="profile" element={<div>Profile</div>} />
              <Route path="inventory" element={<InventoryView />} />
              <Route path="admin" element={<AdminView />} />
              <Route path="settings" element={<SettingsView />} />
            </Route>
            <Route path="/" element={<Navigate to="/app" replace />} />
          </Routes>
        </div>
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
