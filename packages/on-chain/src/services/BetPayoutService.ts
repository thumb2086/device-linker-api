import type { OnChainRepository } from "../repositories/onchain-repository.js";
import type { TransactionResult } from "../types/index.js";

export class BetPayoutService {
  constructor(
    private readonly repo: OnChainRepository,
    private readonly treasuryAddress: string,
  ) {}

  processBet(params: { from: string; amount: string; tokenAddress: string }): Promise<TransactionResult> {
    return this.repo.adminTransfer({
      from: params.from,
      to: this.treasuryAddress,
      amount: params.amount,
      tokenAddress: params.tokenAddress,
    });
  }

  processPayout(params: { to: string; amount: string; tokenAddress: string }): Promise<TransactionResult> {
    return this.repo.adminTransfer({
      from: this.treasuryAddress,
      to: params.to,
      amount: params.amount,
      tokenAddress: params.tokenAddress,
    });
  }
}
