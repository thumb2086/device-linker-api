import type { TransactionResult } from "../types/index.js";

export interface OnChainRepository {
  getDecimals(tokenAddress: string): Promise<number>;
  getBalance(address: string, tokenAddress: string): Promise<bigint>;
  adminTransfer(params: {
    from: string;
    to: string;
    amount: string;
    tokenAddress: string;
  }): Promise<TransactionResult>;
}
