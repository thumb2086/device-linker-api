import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useAuthStore } from '../../store/useAuthStore';

const API_BASE = '/api/v1/wallet';

export const useWallet = () => {
  const { sessionId } = useAuthStore();
  const queryClient = useQueryClient();
  const summary = useQuery({
    queryKey: ['wallet-summary', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/summary`, { params: { sessionId } });
      return res.data.data;
    },
    refetchInterval: 15000,
  });

  const airdropMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post(`${API_BASE}/airdrop`, { sessionId });
      if (res.data.error) throw new Error(res.data.error.message);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-me'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-summary', sessionId] });
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
      queryClient.invalidateQueries({ queryKey: ['wallet-summary', sessionId] });
    }
  });

  const convertMutation = useMutation({
    mutationFn: async (params: { zxcAmount: string }) => {
      const res = await axios.post(`${API_BASE}/convert`, { ...params, sessionId });
      if (res.data.error) throw new Error(res.data.error.message);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-me'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-summary', sessionId] });
    }
  });

  return {
    summary,
    airdrop: airdropMutation,
    transfer: transferMutation,
    convert: convertMutation
  };
};
