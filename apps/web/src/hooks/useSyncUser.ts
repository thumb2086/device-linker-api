import { useEffect } from 'react';
import { useUserStore } from '../store/useUserStore';
import { useAuthStore } from '../store/useAuthStore';
import { useQuery } from '@tanstack/react-query';

export function useSyncUser() {
  const { address, sessionId } = useAuthStore();
  const { setAddress, setBalance, setUsername } = useUserStore();

  const { data: userData, isLoading } = useQuery({
    queryKey: ['user-me', address, sessionId],
    queryFn: async () => {
      const [meResult, walletResult] = await Promise.allSettled([
        fetch(`/api/v1/auth/me?sessionId=${sessionId}`),
        fetch(`/api/v1/wallet/summary?sessionId=${sessionId}`),
      ]);

      let authData: Record<string, any> = {};
      let walletData: Record<string, any> = {};

      if (meResult.status === 'fulfilled') {
        const mePayload = await meResult.value.json();
        authData = mePayload?.data || {};
      }

      if (walletResult.status === 'fulfilled') {
        const walletPayload = await walletResult.value.json();
        walletData = walletPayload?.data || {};
      }

      const walletBalance =
        walletData?.onchain?.zxc?.balance ||
        walletData?.summary?.balances?.ZXC ||
        authData?.balance ||
        '0';

      return {
        ...authData,
        wallet: walletData,
        balance: walletBalance,
      };
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
