import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useAuthStore } from '../../store/useAuthStore';

const API_BASE = '/api/v1/wallet';

export const useWallet = () => {
  const { sessionId } = useAuthStore();
  const queryClient = useQueryClient();

  const getBalance = async (token: string = 'zhixi') => {
    // In our simplified API, /me returns balance
    const res = await axios.get('/api/v1/me', { params: { sessionId } });
    return res.data.data.balance;
  };

  const airdropMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post(`${API_BASE}/airdrop`, { sessionId });
      if (res.data.error) throw new Error(res.data.error.message);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-me'] });
    }
  });

  const transferMutation = useMutation({
    mutationFn: async (params: { to: string, amount: string, token: string }) => {
      const res = await axios.post(`${API_BASE}/transfer`, { ...params, sessionId });
      if (res.data.error) throw new Error(res.data.error.message);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-me'] });
    }
  });

  return {
    airdrop: airdropMutation,
    transfer: transferMutation
  };
};
