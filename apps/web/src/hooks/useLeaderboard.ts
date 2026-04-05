// apps/web/src/hooks/useLeaderboard.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../store/api';

export type LeaderboardType = 'all' | 'week' | 'month' | 'season' | 'asset';

export interface LeaderboardEntry {
  rank: number;
  address: string;
  displayName: string | null;
  amount: number;
  balance?: number;
}

export interface LeaderboardResult {
  type: LeaderboardType;
  periodId: string;
  entries: LeaderboardEntry[];
  selfRank: LeaderboardEntry | null;
  updatedAt: string;
}

interface ApiResponse {
  success: boolean;
  data?: LeaderboardResult;
  error?: { code: string; message: string };
}

const fetchLeaderboard = async (
  type: LeaderboardType,
  limit: number = 50,
  periodId?: string
): Promise<LeaderboardResult> => {
  const params = new URLSearchParams();
  params.append('type', type);
  params.append('limit', String(limit));
  if (periodId) params.append('periodId', periodId);

  const response = await api.get<ApiResponse>(`/api/v1/leaderboard?${params.toString()}`);
  
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to fetch leaderboard');
  }
  
  return response.data.data;
};

export const useLeaderboard = (type: LeaderboardType, limit: number = 50, periodId?: string) => {
  return useQuery({
    queryKey: ['leaderboard', type, periodId, limit],
    queryFn: () => fetchLeaderboard(type, limit, periodId),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Auto refetch every 60 seconds
  });
};
