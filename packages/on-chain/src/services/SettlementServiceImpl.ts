import { getOnChainConfig } from "../config/index.js";
import type { OnChainRepository } from "../repositories/onchain-repository.js";
import type { SettlementRequest, TransactionResult } from "../types/index.js";
import { BetPayoutService } from "./BetPayoutService.js";
import { VipBetLevelService } from "./VipBetLevelService.js";
import type { OnChainSettlementService } from "./OnChainSettlementService.js";

export class SettlementServiceImpl implements OnChainSettlementService {
  private readonly config = getOnChainConfig();
  private readonly betPayout: BetPayoutService;
  private readonly vipFee = new VipBetLevelService();

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
    });
    results.push(betTx);

    if (parseFloat(request.payoutAmount) > 0) {
      const payoutTx = await this.processPayout({
        to: request.address,
        amount: request.payoutAmount,
        tokenAddress: request.tokenAddress,
      });
      results.push(payoutTx);
    }

    return results;
  }

  processBet(intent: { from: string; amount: string; tokenAddress: string }): Promise<TransactionResult> {
    return this.betPayout.processBet(intent);
  }

  processPayout(intent: { to: string; amount: string; tokenAddress: string }): Promise<TransactionResult> {
    return this.betPayout.processPayout(intent);
  }

  adminTransfer(params: { from: string; to: string; amount: string; tokenAddress: string }): Promise<TransactionResult> {
    return this.repo.adminTransfer(params);
  }
}
