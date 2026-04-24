import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import CasinoView from './features/casino/CasinoView';
import { RouletteView } from './features/casino/RouletteView';
import WalletView from './features/wallet/WalletView';
import SwapView from './features/wallet/SwapView';
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
import PublicTransactionsView from './features/transactions/PublicTransactionsView';
import TransactionsDashboardView from './features/dashboard/TransactionsDashboardView';
import SoundPlayer from './components/SoundPlayer';
import { useSyncUser } from './hooks/useSyncUser';
import Layout from './components/Layout';
import VIPLevelsView from './features/info/VIPLevelsView';
import OddsView from './features/info/OddsView';
import UnifiedInfoView from './components/UnifiedInfoView';
import { Loader2 } from 'lucide-react';

const queryClient = new QueryClient();

// 快速登入：驗證 stored session（只有勾選「記住我」時才執行）
function useFastLogin() {
  const { sessionId, setAuth, clearAuth } = useAuthStore();
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    const validateSession = async () => {
      // 檢查是否勾選了「記住我」
      const rememberMe = localStorage.getItem('custody_remember_me') === 'true';
      
      if (!sessionId || !rememberMe) {
        setIsRestoring(false);
        return;
      }

      try {
        const res = await fetch(`/api/v1/auth/status?sessionId=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        const payload = data?.data;

        if (data.success && payload?.status === 'authorized' && payload?.address) {
          // Session 有效，恢復登入狀態
          setAuth(payload.address, sessionId, payload.publicKey || '0x');
        } else {
          // Session 無效或過期，清除 auth 狀態
          clearAuth();
        }
      } catch (err) {
        console.error('[FastLogin] Session validation failed:', err);
        clearAuth();
      } finally {
        setIsRestoring(false);
      }
    };

    validateSession();
  }, [sessionId, setAuth, clearAuth]);

  return { isRestoring };
}

function AppContent() {
  const { isAuthorized } = useAuthStore();
  const { isRestoring } = useFastLogin();
  const { userData, isLoading } = useSyncUser();

  const needsProfileSetup = isAuthorized && !isLoading && userData && !(userData as any).user?.displayName;

  // 驗證 session 時顯示 loading
  if (isRestoring) {
    return (
      <div className="relative min-h-screen bg-[#0e0e0e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#fcc025]" />
          <p className="text-sm text-[#adaaaa]">正在恢復登入狀態...</p>
        </div>
      </div>
    );
  }

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
            <Route path="swap" element={<SwapView />} />
            <Route path="market" element={<MarketView />} />
            <Route path="rewards" element={<RewardsView />} />
            <Route path="leaderboard" element={<LeaderboardView />} />
            <Route path="announcement" element={<AnnouncementCenter />} />
            <Route path="support" element={<SupportView />} />
            <Route path="inventory" element={<InventoryView />} />
            <Route path="admin" element={<AdminView />} />
            <Route path="settings" element={<SettingsView />} />
            <Route path="transactions" element={<PublicTransactionsView />} />
            <Route path="dashboard/transactions" element={<TransactionsDashboardView />} />
            <Route path="health" element={<HealthView />} />
            <Route path="info/vip-levels" element={<VIPLevelsView />} />
            <Route path="info/odds" element={<OddsView />} />
            <Route path="info" element={<UnifiedInfoView />} />
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
