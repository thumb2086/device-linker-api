export interface TransactionView {
  id: string;
  settlementId?: string;
  roundId: string | number;
  userAddress: string;
  type: 'bet' | 'payout' | 'deposit' | 'withdrawal' | 'transfer';
  amount: string;
  tokenSymbol?: string;
  status: 'pending' | 'broadcasted' | 'confirmed' | 'failed';
  txHash?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  gameType?: string;
  chainId?: number;
  treasuryAddress: string;
  extensionMetadata?: Record<string, any>;
}

export interface DashboardFilter {
  status?: string[];
  userAddress?: string;
  gameType?: string;
  startDate?: Date;
  endDate?: Date;
  page: number;
  limit: number;
}
