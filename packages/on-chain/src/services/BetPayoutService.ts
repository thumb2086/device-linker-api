import type { OnChainRepository } from "../repositories/onchain-repository.js";
import { TransactionRepository } from "../repositories/TransactionRepository.js";
import type { TransactionResult } from "../types/index.js";

export class BetPayoutService {
  constructor(
    private readonly repo: OnChainRepository,
    private readonly treasuryAddress: string,
    private readonly txRepo = new TransactionRepository(),
  ) {}

  async processBet(params: { from: string; amount: string; tokenAddress: string; roundId?: string | number; settlementId?: string; gameType?: string; tokenSymbol?: string }): Promise<TransactionResult> {
    try {
      const result = await this.repo.adminTransfer({
        from: params.from,
        to: this.treasuryAddress,
        amount: params.amount,
        tokenAddress: params.tokenAddress,
      });
      await this.txRepo.saveTransactionRecord({
        settlementId: params.settlementId,
        roundId: params.roundId ?? "",
        userAddress: params.from,
        type: "bet",
        amount: params.amount,
        tokenSymbol: params.tokenSymbol,
        status: result.confirmed ? "confirmed" : "failed",
        txHash: result.txHash,
        chainId: result.chainId,
        gameType: params.gameType,
        treasuryAddress: this.treasuryAddress,
      });
      return result;
    } catch (error: any) {
      await this.txRepo.saveTransactionRecord({
        settlementId: params.settlementId,
        roundId: params.roundId ?? "",
        userAddress: params.from,
        type: "bet",
        amount: params.amount,
        tokenSymbol: params.tokenSymbol,
        status: "failed",
        error: error?.message || "bet transfer failed",
        gameType: params.gameType,
        treasuryAddress: this.treasuryAddress,
      });
      throw error;
    }
  }

  async processPayout(params: { to: string; amount: string; tokenAddress: string; roundId?: string | number; settlementId?: string; gameType?: string; tokenSymbol?: string }): Promise<TransactionResult> {
    try {
      const result = await this.repo.adminTransfer({
        from: this.treasuryAddress,
        to: params.to,
        amount: params.amount,
        tokenAddress: params.tokenAddress,
      });
      await this.txRepo.saveTransactionRecord({
        settlementId: params.settlementId,
        roundId: params.roundId ?? "",
        userAddress: params.to,
        type: "payout",
        amount: params.amount,
        tokenSymbol: params.tokenSymbol,
        status: result.confirmed ? "confirmed" : "failed",
        txHash: result.txHash,
        chainId: result.chainId,
        gameType: params.gameType,
        treasuryAddress: this.treasuryAddress,
      });
      return result;
    } catch (error: any) {
      await this.txRepo.saveTransactionRecord({
        settlementId: params.settlementId,
        roundId: params.roundId ?? "",
        userAddress: params.to,
        type: "payout",
        amount: params.amount,
        tokenSymbol: params.tokenSymbol,
        status: "failed",
        error: error?.message || "payout transfer failed",
        gameType: params.gameType,
        treasuryAddress: this.treasuryAddress,
      });
      throw error;
    }
  }
}
