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
};

export function useSyncUser() {
  const { address, sessionId } = useAuthStore();
  const { setAddress, setBalance, setUsername } = useUserStore();

  const { data: userData, isLoading } = useQuery<SyncUserData>({
    queryKey: ['user-me', address, sessionId],
    queryFn: async () => {
      const [meResult, walletResult] = await Promise.allSettled([
        api.get('/api/v1/auth/me', { params: { sessionId } }),
        api.get('/api/v1/wallet/summary', { params: { sessionId } }),
      ]);

      let authData: Record<string, any> = {};
      let walletData: Record<string, any> = {};

      if (meResult.status === 'fulfilled') {
        authData = meResult.value.data?.data || {};
      }

      if (walletResult.status === 'fulfilled') {
        walletData = walletResult.value.data?.data || {};
      }

      const walletBalance = resolvePreferredBalance({
        onchainBalance: walletData?.onchain?.zxc?.balance,
        onchainAvailable: walletData?.onchain?.zxc?.available,
        walletBalance: walletData?.summary?.balances?.ZXC,
        fallbackBalance: authData?.balance,
      });

      return {
        ...authData,
        wallet: walletData,
        balance: walletBalance,
      } as SyncUserData;
    },
    enabled: !!sessionId,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (userData?.address) {
      setAddress(userData.address);
    }
    if (userData?.balance) {
      setBalance(userData.balance);
    }
    if (userData?.user?.displayName) {
      setUsername(userData.user.displayName);
    } else if (userData?.username) {
      setUsername(userData.username);
    }
  }, [userData, setAddress, setBalance, setUsername]);

  return { userData, isLoading };
}
