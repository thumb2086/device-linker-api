import { useQuery } from '@tanstack/react-query';
import { api } from '../store/api';

export type LeaderboardType = 'all' | 'week' | 'month' | 'season' | 'asset' | 'winnings';

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

interface NestedApiPayload<T> {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string } | string | null;
}

interface ApiResponse<T> {
  success: boolean;
  data?: NestedApiPayload<T> | T;
  error?: { code?: string; message?: string } | string | null;
}

const extractErrorMessage = (error: ApiResponse<LeaderboardResult>['error']) => {
  if (!error) return null;
  if (typeof error === 'string') return error;
  return error.message || error.code || null;
};

const unwrapLeaderboard = (payload: ApiResponse<LeaderboardResult>): LeaderboardResult => {
  if (!payload.success) {
    throw new Error(extractErrorMessage(payload.error) || 'Failed to fetch leaderboard');
  }

  const nested = payload.data as NestedApiPayload<LeaderboardResult> | LeaderboardResult | undefined;
  if (!nested) {
    throw new Error('Leaderboard response is empty');
  }

  if ('entries' in nested && Array.isArray(nested.entries)) {
    return nested;
  }

  if ('success' in nested && nested.success && nested.data) {
    return nested.data;
  }

  throw new Error(extractErrorMessage((nested as NestedApiPayload<LeaderboardResult>).error) || 'Failed to fetch leaderboard');
};

const fetchLeaderboard = async (
  type: LeaderboardType,
  limit = 50,
  periodId?: string,
): Promise<LeaderboardResult> => {
  const params = new URLSearchParams();
  params.append('type', type);
  params.append('limit', String(limit));
  if (periodId) params.append('periodId', periodId);

  const response = await api.get<ApiResponse<LeaderboardResult>>(`/api/v1/leaderboard?${params.toString()}`);
  return unwrapLeaderboard(response.data);
};

export const useLeaderboard = (type: LeaderboardType, limit = 50, periodId?: string) =>
  useQuery({
    queryKey: ['leaderboard', type, periodId, limit],
    queryFn: () => fetchLeaderboard(type, limit, periodId),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
