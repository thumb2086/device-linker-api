import { useEffect } from 'react';
import { useUserStore } from '../store/useUserStore';
import { useAuthStore } from '../store/useAuthStore';
import { useQuery } from '@tanstack/react-query';

export function useSyncUser() {
    const { address, sessionId } = useAuthStore();
    const { setAddress, setBalance, setUsername } = useUserStore();

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
        // The API returns { user: { displayName, ... }, ... }
        if (userData?.user?.displayName) {
            setUsername(userData.user.displayName);
        } else if (userData?.username) {
            setUsername(userData.username);
        }
    }, [userData, setAddress, setBalance, setUsername]);

    return { userData, isLoading };
}
