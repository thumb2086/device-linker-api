import { useEffect } from 'react';
import { useUserStore } from '../store/useUserStore';
import { useAuthStore } from '../store/useAuthStore';
import { api } from '../store/api';
import { useQuery } from '@tanstack/react-query';
import { resolvePreferredBalance } from '../utils/balance';

type SyncUserData = {
  address?: string;
  balance?: string;
  username?: string;
  user?: {
    displayName?: string;
  };
  wallet: Record<string, any>;
  activeAvatar?: string;
  activeTitle?: string;
};

export function useSyncUser() {
  const { address, sessionId } = useAuthStore();
  const { setBalance } = useUserStore();

  const { data: userData, isLoading } = useQuery<SyncUserData>({
    queryKey: ['user-wallet', address, sessionId],
    queryFn: async () => {
      const walletResult = await api.get('/api/v1/wallet/summary', { params: { sessionId } });
      const walletData = walletResult.data?.data || {};

      const walletBalance = resolvePreferredBalance({
        onchainBalance: walletData?.onchain?.zxc?.balance,
        onchainAvailable: walletData?.onchain?.zxc?.available,
        walletBalance: walletData?.summary?.balances?.ZXC,
      });

      return {
        wallet: walletData,
        balance: walletBalance,
      } as SyncUserData;
    },
    enabled: !!sessionId,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (userData?.balance) {
      setBalance(userData.balance);
    }
  }, [userData, setBalance]);

  return { userData, isLoading };
}
