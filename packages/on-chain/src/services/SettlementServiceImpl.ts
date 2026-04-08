import { getOnChainConfig } from "../config/index.js";
import type { OnChainRepository } from "../repositories/onchain-repository.js";
import { TransactionRepository } from "../repositories/TransactionRepository.js";
import type { SettlementRequest, TransactionResult } from "../types/index.js";
import { BetPayoutService } from "./BetPayoutService.js";
import { VipBetLevelService } from "./VipBetLevelService.js";
import type { OnChainSettlementService } from "./OnChainSettlementService.js";

export class SettlementServiceImpl implements OnChainSettlementService {
  private readonly config = getOnChainConfig();
  private readonly betPayout: BetPayoutService;
  private readonly vipFee = new VipBetLevelService();
  private readonly txRepo = new TransactionRepository();

  constructor(private readonly repo: OnChainRepository) {
    this.betPayout = new BetPayoutService(repo, this.config.treasuryAddress);
  }

  calculateFee(betAmount: string, feeDiscountRate = 0): number {
    return this.vipFee.calculateFee(betAmount, feeDiscountRate);
  }

  async settle(request: SettlementRequest): Promise<TransactionResult[]> {
    const results: TransactionResult[] = [];
    const betTx = await this.processBet({
      from: request.address,
      amount: request.betAmount,
      tokenAddress: request.tokenAddress,
      roundId: request.roundId,
      settlementId: request.requestId,
      gameType: request.game,
      tokenSymbol: request.token,
    });
    results.push(betTx);

    if (parseFloat(request.payoutAmount) > 0) {
      const payoutTx = await this.processPayout({
        to: request.address,
        amount: request.payoutAmount,
        tokenAddress: request.tokenAddress,
        roundId: request.roundId,
        settlementId: request.requestId,
        gameType: request.game,
        tokenSymbol: request.token,
      });
      results.push(payoutTx);
    }

    return results;
  }

  processBet(intent: { from: string; amount: string; tokenAddress: string; roundId?: string | number; settlementId?: string; gameType?: string; tokenSymbol?: string }): Promise<TransactionResult> {
    return this.betPayout.processBet(intent);
  }

  processPayout(intent: { to: string; amount: string; tokenAddress: string; roundId?: string | number; settlementId?: string; gameType?: string; tokenSymbol?: string }): Promise<TransactionResult> {
    return this.betPayout.processPayout(intent);
  }

  async adminTransfer(params: { from: string; to: string; amount: string; tokenAddress: string }): Promise<TransactionResult> {
    try {
      const result = await this.repo.adminTransfer(params);
      await this.txRepo.saveTransactionRecord({
        roundId: "",
        userAddress: params.from,
        type: "transfer",
        amount: params.amount,
        status: result.confirmed ? "confirmed" : "failed",
        txHash: result.txHash,
        chainId: result.chainId,
        treasuryAddress: this.config.treasuryAddress,
      });
      return result;
    } catch (error: any) {
      await this.txRepo.saveTransactionRecord({
        roundId: "",
        userAddress: params.from,
        type: "transfer",
        amount: params.amount,
        status: "failed",
        error: error?.message || "admin transfer failed",
        treasuryAddress: this.config.treasuryAddress,
      });
      throw error;
    }
  }
}
