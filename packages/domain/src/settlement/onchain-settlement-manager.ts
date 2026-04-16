// packages/domain/src/settlement/onchain-settlement-manager.ts

import { randomUUID } from "crypto";
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
import { OnchainWalletManager, tokenSymbolToOnchainKey } from "../wallet/onchain-wallet-manager.js";
import { VipManager } from "../levels/vip-manager.js";
import { ChainClient } from "@repo/infrastructure";
import { WalletRepository } from "@repo/infrastructure";
import { getOnChainConfig, SettlementServiceImpl, ViemRepository, VipBetLevelService, BetPayoutService } from "@repo/on-chain";

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

  calculateFee(betAmount: string, feeDiscountRate?: number): number;
}

export class OnchainSettlementManager implements OnchainSettlementDomain {
  private readonly FIXED_TREASURY_ADDRESS = getOnChainConfig().treasuryAddress;
  private readonly levelFeeService = new VipBetLevelService();

  constructor(
    private settlementManager: SettlementManager,
    private walletManager: WalletManager,
    private onchainWallet: OnchainWalletManager,
    private vipManager: VipManager,
    private walletRepo: WalletRepository | null = null
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

    // 1. Calculate fee discount by bet-based level membership (押注額等級)
    const levelDiscountRate = this.vipManager
      ? await this.vipManager.getBetLevelFeeDiscount(address)
      : 0;

    // 2. Calculate fee based on level discount
    const feeAmount = this.calculateFee(betAmount, levelDiscountRate);
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

    // Save intents to repository
    if (this.walletRepo) {
      await this.walletRepo.saveTxIntent(betIntent);
      if (payoutIntent) await this.walletRepo.saveTxIntent(payoutIntent);
    }

    // 5. Execute onchain transactions
    let betTxHash: string | undefined;
    let payoutTxHash: string | undefined;

    try {
      // Execute bet transaction (transfer to house)
      betTxHash = await this.executeOnchainTransfer(userId, address, betIntent, "bet", roundId, settlement.id, game);

      // Execute payout transaction if there is a win
      if (finalPayout > 0 && payoutIntent) {
        payoutTxHash = await this.executeOnchainTransfer(userId, address, payoutIntent, "payout", roundId, settlement.id, game);
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
   * Calculate fee based on bet-level discount.
   * discountRate=0 means full base fee, discountRate=1 means free.
   */
  calculateFee(betAmount: string, feeDiscountRate: number = 0): number {
    return this.levelFeeService.calculateFee(betAmount, feeDiscountRate);
  }

  /**
   * Execute onchain transfer using @repo/on-chain services
   */
  private async executeOnchainTransfer(
    userId: string,
    userAddress: string,
    intent: TxIntent,
    type: "bet" | "payout",
    roundId: string,
    settlementId: string,
    game: Game
  ): Promise<string> {
    const config = this.onchainWallet.getRuntimeConfig();
    const tokenKey = tokenSymbolToOnchainKey(intent.token);
    const tokenConfig = config.tokens[tokenKey];

    if (!tokenConfig) {
      throw new Error(`ONCHAIN_TOKEN_CONFIG_MISSING: ${intent.token}`);
    }

    if (!tokenConfig.enabled) {
      throw new Error(`ONCHAIN_TOKEN_DISABLED: ${intent.token}`);
    }

    if (!config.rpcUrl || !config.adminPrivateKey) {
      throw new Error("ONCHAIN_RUNTIME_NOT_CONFIGURED");
    }

    // Save broadcasting attempt
    if (this.walletRepo) {
      await this.walletRepo.saveTxIntent(this.walletManager.processTxIntent(intent, "broadcasted"));
    }

    const repo = new ViemRepository(config.rpcUrl, config.adminPrivateKey);
    const betPayoutService = new BetPayoutService(repo, this.FIXED_TREASURY_ADDRESS);

    try {
      let txResult;
      if (type === "bet") {
        txResult = await betPayoutService.processBet({
          from: userAddress,
          amount: intent.amount,
          tokenAddress: tokenConfig.contractAddress,
          roundId,
          settlementId,
          gameType: game,
          tokenSymbol: intent.token,
        });
      } else {
        txResult = await betPayoutService.processPayout({
          to: userAddress,
          amount: intent.amount,
          tokenAddress: tokenConfig.contractAddress,
          roundId,
          settlementId,
          gameType: game,
          tokenSymbol: intent.token,
        });
      }

      if (this.walletRepo) {
        await this.walletRepo.saveTxIntent(this.walletManager.processTxIntent(intent, "confirmed", txResult.txHash));
      }

      return txResult.txHash;
    } catch (error: any) {
      if (this.walletRepo) {
        await this.walletRepo.saveTxIntent(
          this.walletManager.processTxIntent(intent, "failed", undefined, error?.message || `${type} failed`)
        );
      }
      throw new Error(`Onchain transfer failed (${type}): ${error.message}`);
    }
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
