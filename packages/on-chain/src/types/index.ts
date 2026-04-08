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
  tokenAddress: string;
  betAmount: string;
  payoutAmount: string;
  feeDiscountRate?: number;
  roundId: string;
  requestId?: string;
}

export * from "./transaction.js";
