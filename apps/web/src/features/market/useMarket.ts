import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useAuthStore } from '../../store/useAuthStore';

const API_BASE = '/api/v1/market';

export const useMarket = () => {
  const { sessionId } = useAuthStore();
  const queryClient = useQueryClient();

  const getSnapshot = useQuery({
    queryKey: ['market-snapshot'],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/snapshot`);
      return res.data.data.snapshot;
    },
    refetchInterval: 30000 // 30s
  });

  const getMyAccount = useQuery({
    queryKey: ['market-me'],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/me`, { params: { sessionId } });
      return res.data.data.account;
    },
    refetchInterval: 30000
  });

  const actionMutation = useMutation({
    mutationFn: async (params: any) => {
      const res = await axios.post(`${API_BASE}/action`, { ...params, sessionId });
      if (res.data.error) throw new Error(res.data.error.message);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-me'] });
      queryClient.invalidateQueries({ queryKey: ['user-me'] });
    }
  });

  return {
    snapshot: getSnapshot,
    account: getMyAccount,
    execute: actionMutation
  };
};
