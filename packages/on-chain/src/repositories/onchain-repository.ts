import type { TransactionResult } from "../types/index.js";

export interface OnChainRepository {
  adminTransfer(params: {
    from: string;
    to: string;
    amount: string;
    tokenAddress: string;
  }): Promise<TransactionResult>;
}
