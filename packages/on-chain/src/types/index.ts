export type ChainId = number;

export interface TransactionResult {
  txHash: string;
  chainId: ChainId;
  confirmed: boolean;
}

export interface SettlementRequest {
  userId: string;
  address: string;
  game: string;
  token: string;
  betAmount: string;
  payoutAmount: string;
  roundId: string;
  requestId?: string;
}
