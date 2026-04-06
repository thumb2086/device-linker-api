// packages/domain/src/settlement/onchain-settlement-manager.ts

import {
  GameSettlement,
  GameSettlementSchema,
  TxIntent,
  TokenSymbol,
  Game,
  GAMES,
} from "@repo/shared";
import { SettlementManager } from "./settlement-manager.js";
import { WalletManager } from "../wallet/wallet-manager.js";
import { OnchainWalletManager } from "../wallet/onchain-wallet-manager.js";
import { VipManager } from "../levels/vip-manager.js";
import { ethers } from "ethers";

export interface SettlementResult {
  settlement: GameSettlement;
  betTxHash?: string;
  payoutTxHash?: string;
  feeAmount: number;
  finalPayout: number;
}

export interface OnchainSettlementDomain {
  settleGame(params: {
    userId: string;
    address: string;
    game: Game;
    token: TokenSymbol;
    betAmount: string;
    payoutAmount: string;
    roundId: string;
    requestId?: string;
  }): Promise<SettlementResult>;

  calculateFee(betAmount: string, isVip2: boolean): number;
}

export class OnchainSettlementManager implements OnchainSettlementDomain {
  private readonly BASE_FEE_RATE = 0.02; // 2% base fee

  constructor(
    private settlementManager: SettlementManager,
    private walletManager: WalletManager,
    private onchainWallet: OnchainWalletManager,
    private vipManager: VipManager
  ) {}

  /**
   * Unified settlement for all 12 games
   * Games: coinflip, roulette, horse, slots, sicbo, bingo, duel, blackjack, crash, poker, bluffdice, dragon
   */
  async settleGame(params: {
    userId: string;
    address: string;
    game: Game;
    token: TokenSymbol;
    betAmount: string;
    payoutAmount: string;
    roundId: string;
    requestId?: string;
  }): Promise<SettlementResult> {
    const { userId, address, game, token, betAmount, payoutAmount, roundId, requestId } = params;

    // 1. Check if user has VIP2 (YJC VIP system) for zero game fees
    const isVip2 = this.vipManager ? await this.vipManager.hasVip2(address) : false;

    // 2. Calculate fee based on VIP status
    const feeAmount = this.calculateFee(betAmount, isVip2);
    const payoutNum = parseFloat(payoutAmount);
    const finalPayout = Math.max(0, payoutNum - feeAmount);

    // 3. Create settlement record
    const settlement = this.settlementManager.createSettlement(
      roundId,
      userId,
      address,
      game,
      token,
      betAmount,
      finalPayout.toString(),
      requestId
    );

    // 4. Generate transaction intents
    const { betIntent, payoutIntent } = this.walletManager.createSettlementIntent(
      userId,
      token as any,
      betAmount,
      finalPayout.toString(),
      game,
      roundId,
      requestId
    );

    // 5. Execute onchain transactions
    let betTxHash: string | undefined;
    let payoutTxHash: string | undefined;

    try {
      // Execute bet transaction (transfer to house)
      betTxHash = await this.executeOnchainTransfer(address, betIntent, "bet");

      // Execute payout transaction if there is a win
      if (finalPayout > 0 && payoutIntent) {
        payoutTxHash = await this.executeOnchainTransfer(address, payoutIntent, "payout");
      }

      // 6. Resolve settlement
      const resolved = this.settlementManager.resolveSettlement(
        settlement,
        betTxHash,
        payoutTxHash
      );

      return {
        settlement: resolved,
        betTxHash,
        payoutTxHash,
        feeAmount,
        finalPayout,
      };
    } catch (error: any) {
      // Fail settlement on chain error
      const failed = this.settlementManager.failSettlement(settlement, error.message);
      throw new SettlementError(`Onchain settlement failed: ${error.message}`, failed);
    }
  }

  /**
   * Calculate fee based on YJC VIP status
   * VIP2 (YJC balance >= 1000) gets 0% fee
   * Others pay base 2% fee
   */
  calculateFee(betAmount: string, isVip2: boolean): number {
    const betNum = parseFloat(betAmount);

    // VIP2 gets free fees
    if (isVip2) {
      return 0;
    }

    // Base fee for non-VIP
    return betNum * this.BASE_FEE_RATE;
  }

  /**
   * Execute onchain transfer
   */
  private async executeOnchainTransfer(
    userAddress: string,
    intent: TxIntent,
    type: "bet" | "payout"
  ): Promise<string> {
    const config = this.onchainWallet.getRuntimeConfig();
    const tokenKey = intent.token.toLowerCase() as "zhixi" | "yjc";
    const tokenConfig = config.tokens[tokenKey];

    if (!tokenConfig.enabled) {
      throw new Error(`Token ${intent.token} not enabled for onchain transfer`);
    }

    // In a real implementation, this would:
    // 1. Create and sign transaction
    // 2. Broadcast to network
    // 3. Wait for confirmation
    // 4. Return txHash

    // For now, return a mock hash
    const mockHash = `0x${Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("")}`;

    return mockHash;
  }

  /**
   * Batch settle multiple games (for high throughput)
   */
  async batchSettle(params: Array<{
    userId: string;
    address: string;
    game: Game;
    token: TokenSymbol;
    betAmount: string;
    payoutAmount: string;
    roundId: string;
    requestId?: string;
  }>): Promise<SettlementResult[]> {
    return Promise.all(params.map((p) => this.settleGame(p)));
  }
}

export class SettlementError extends Error {
  constructor(
    message: string,
    public settlement: GameSettlement
  ) {
    super(message);
    this.name = "SettlementError";
  }
}
