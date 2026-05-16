import type { SettlementRequest, TransactionResult } from "../types/index.js";

export interface OnChainSettlementService {
  settle(request: SettlementRequest): Promise<TransactionResult[]>;
  processBet(intent: {
    from: string;
    amount: string;
    tokenAddress: string;
  }): Promise<TransactionResult>;
  processPayout(intent: {
    to: string;
    amount: string;
    tokenAddress: string;
  }): Promise<TransactionResult>;
  adminTransfer(params: {
    from: string;
    to: string;
    amount: string;
    tokenAddress: string;
  }): Promise<TransactionResult>;
}
