import { useEffect } from 'react';
import { useUserStore } from '../store/useUserStore';
import { useAuthStore } from '../store/useAuthStore';
import { useQuery } from '@tanstack/react-query';

export function useSyncUser() {
    const { address, sessionId } = useAuthStore();
    const { setAddress, setBalance } = useUserStore();

    useEffect(() => {
        setAddress(address);
    }, [address, setAddress]);

    const { data: userData } = useQuery({
        queryKey: ['user', address],
        queryFn: async () => {
            const res = await fetch(`/api/v1/auth/me?sessionId=${sessionId}`);
            const data = await res.json();
            return data.data;
        },
        enabled: !!address && !!sessionId,
        refetchInterval: 30000
    });

    useEffect(() => {
        if (userData?.user?.balance) {
            setBalance(userData.user.balance);
        }
    }, [userData, setBalance]);
}
