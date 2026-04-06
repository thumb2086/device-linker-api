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
import { OnchainWalletManager } from "../wallet/onchain-wallet-manager.js";
import { VipManager } from "../levels/vip-manager.js";
import { ChainClient } from "@repo/infrastructure";
import { WalletRepository } from "@repo/infrastructure";
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
    private vipManager: VipManager,
    private walletRepo: WalletRepository | null = null,
    private chainClient: ChainClient | null = null
  ) {}

  /**
   * Initialize chain client from runtime config
   */
  private getChainClient(): ChainClient {
    if (this.chainClient) return this.chainClient;
    
    const config = this.onchainWallet.getRuntimeConfig();
    if (!config.rpcUrl || !config.adminPrivateKey) {
      throw new Error("Chain not configured: missing RPC_URL or ADMIN_PRIVATE_KEY");
    }
    
    this.chainClient = new ChainClient(config.rpcUrl, config.adminPrivateKey);
    return this.chainClient;
  }

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
      betTxHash = await this.executeOnchainTransfer(userId, address, betIntent, "bet");

      // Execute payout transaction if there is a win
      if (finalPayout > 0 && payoutIntent) {
        payoutTxHash = await this.executeOnchainTransfer(userId, address, payoutIntent, "payout");
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
   * Execute onchain transfer using real blockchain transactions
   */
  private async executeOnchainTransfer(
    userId: string,
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

    const client = this.getChainClient();
    const houseAddress = client.getWalletAddress();
    const decimals = await client.getDecimals(tokenConfig.contractAddress);
    const amount = client.parseUnits(intent.amount, decimals);

    let txHash: string | null = null;
    
    try {
      // Save broadcasting attempt
      if (this.walletRepo) {
        await this.walletRepo.saveTxAttempt({
          id: randomUUID(),
          txIntentId: intent.id,
          attemptNumber: 1,
          status: "broadcasting",
          txHash: null,
          error: null,
          errorCode: null,
          broadcastAt: new Date(),
          confirmedAt: null,
          createdAt: new Date(),
        });
      }

      if (type === "bet") {
        // Bet: Transfer from player to house (adminTransfer)
        const tx = await client.adminTransfer(
          userAddress,
          houseAddress,
          amount,
          tokenConfig.contractAddress
        );
        txHash = tx.hash;
        
        // Wait for confirmation
        const receipt = await client.waitForReceipt(tx.hash);
        const reverted = !receipt || receipt.status !== 1;
        
        // Save attempt result
        if (this.walletRepo) {
          await this.walletRepo.saveTxAttempt({
            id: randomUUID(),
            txIntentId: intent.id,
            attemptNumber: 1,
            status: reverted ? "reverted" : "confirmed",
            txHash,
            error: reverted ? "Transaction reverted" : null,
            errorCode: reverted ? "TX_REVERTED" : null,
            broadcastAt: new Date(),
            confirmedAt: new Date(),
            createdAt: new Date(),
          });
          
          // Save receipt
          await this.walletRepo.saveTxReceipt({
            id: randomUUID(),
            txIntentId: intent.id,
            txHash,
            blockNumber: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
            status: reverted ? "reverted" : "confirmed",
            gasUsed: receipt?.gasUsed ? String(receipt.gasUsed) : null,
            confirmedAt: new Date(),
          });
        }
        
        if (reverted) {
          throw new Error(`Bet transaction reverted: ${tx.hash}`);
        }
        
        return tx.hash;
        
      } else {
        // Payout: Transfer from house to player
        const tx = await client.transfer(
          userAddress,
          amount,
          tokenConfig.contractAddress
        );
        txHash = tx.hash;
        
        // Wait for confirmation
        const receipt = await client.waitForReceipt(tx.hash);
        const reverted = !receipt || receipt.status !== 1;
        
        // Save attempt result
        if (this.walletRepo) {
          await this.walletRepo.saveTxAttempt({
            id: randomUUID(),
            txIntentId: intent.id,
            attemptNumber: 1,
            status: reverted ? "reverted" : "confirmed",
            txHash,
            error: reverted ? "Transaction reverted" : null,
            errorCode: reverted ? "TX_REVERTED" : null,
            broadcastAt: new Date(),
            confirmedAt: new Date(),
            createdAt: new Date(),
          });
          
          // Save receipt
          await this.walletRepo.saveTxReceipt({
            id: randomUUID(),
            txIntentId: intent.id,
            txHash,
            blockNumber: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
            status: reverted ? "reverted" : "confirmed",
            gasUsed: receipt?.gasUsed ? String(receipt.gasUsed) : null,
            confirmedAt: new Date(),
          });
        }
        
        if (reverted) {
          throw new Error(`Payout transaction reverted: ${tx.hash}`);
        }
        
        return tx.hash;
      }
    } catch (error: any) {
      // Save failed attempt
      if (this.walletRepo) {
        await this.walletRepo.saveTxAttempt({
          id: randomUUID(),
          txIntentId: intent.id,
          attemptNumber: 1,
          status: "failed",
          txHash,
          error: error?.message || `${type} failed`,
          errorCode: "TX_BROADCAST_ERROR",
          broadcastAt: new Date(),
          confirmedAt: new Date(),
          createdAt: new Date(),
        });
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
