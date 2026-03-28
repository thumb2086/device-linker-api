import { useEffect } from 'react';
import { useUserStore } from '../store/useUserStore';
import { useAuthStore } from '../store/useAuthStore';
import { useQuery } from '@tanstack/react-query';

export function useSyncUser() {
    const { address, sessionId } = useAuthStore();
    const { setAddress, setBalance } = useUserStore();

    const { data: userData, isLoading } = useQuery({
        queryKey: ['user', address, sessionId],
        queryFn: async () => {
            const res = await fetch(`/api/v1/auth/me?sessionId=${sessionId}`);
            const data = await res.json();
            return data.data;
        },
        enabled: !!sessionId,
        refetchInterval: 30000
    });

    useEffect(() => {
        if (userData?.address) {
            setAddress(userData.address);
        }
        if (userData?.balance) {
            setBalance(userData.balance);
        }
    }, [userData, setAddress, setBalance]);

    return { userData, isLoading };
}
