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
import { getOnChainConfig } from "@repo/on-chain";
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

  calculateFee(betAmount: string, feeDiscountRate?: number): number;
}

export class OnchainSettlementManager implements OnchainSettlementDomain {
  private readonly BASE_FEE_RATE = 0.02; // 2% base fee
  private readonly TREASURY_TARGET_BALANCE = "10000000000000";
  private readonly FIXED_TREASURY_ADDRESS = getOnChainConfig().treasuryAddress;

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

  private async ensureTreasuryLiquidity(
    tokenConfig: { contractAddress: string; lossPoolAddress: string },
    requiredAmountWei: bigint,
    decimals: number
  ): Promise<string> {
    const client = this.getChainClient();
    const treasuryAddress = this.FIXED_TREASURY_ADDRESS;
    if (!treasuryAddress) {
      throw new Error("TREASURY_ADDRESS_MISSING");
    }

    const treasuryBalanceBefore = await client.getBalance(treasuryAddress, tokenConfig.contractAddress);
    if (treasuryBalanceBefore >= requiredAmountWei) {
      return treasuryAddress;
    }

    const targetBalanceWei = client.parseUnits(this.TREASURY_TARGET_BALANCE, decimals);
    const refillTargetWei = targetBalanceWei > requiredAmountWei ? targetBalanceWei : requiredAmountWei;
    const refillAmountWei = refillTargetWei - treasuryBalanceBefore;
    if (refillAmountWei <= 0n) {
      return treasuryAddress;
    }

    const topupTx = await client.mint(treasuryAddress, refillAmountWei, tokenConfig.contractAddress);
    const topupReceipt = await client.waitForReceipt(topupTx.hash);
    if (!topupReceipt || topupReceipt.status !== 1) {
      throw new Error(`TREASURY_TOPUP_REVERTED: ${topupTx.hash}`);
    }

    const treasuryBalanceAfter = await client.getBalance(treasuryAddress, tokenConfig.contractAddress);
    if (treasuryBalanceAfter < requiredAmountWei) {
      throw new Error("TREASURY_INSUFFICIENT_AFTER_TOPUP");
    }

    return treasuryAddress;
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
   * Calculate fee based on bet-level discount.
   * discountRate=0 means full base fee, discountRate=1 means free.
   */
  calculateFee(betAmount: string, feeDiscountRate: number = 0): number {
    const betNum = parseFloat(betAmount);
    const baseFee = betNum * this.BASE_FEE_RATE;
    const discount = Math.min(1, Math.max(0, feeDiscountRate));
    return baseFee * (1 - discount);
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
    const tokenKey = tokenSymbolToOnchainKey(intent.token);
    const tokenConfig = config.tokens[tokenKey];

    if (!tokenConfig) {
      throw new Error(`ONCHAIN_TOKEN_CONFIG_MISSING: ${intent.token}`);
    }

    if (!tokenConfig.enabled) {
      throw new Error(`ONCHAIN_TOKEN_DISABLED: ${intent.token}`);
    }

    const client = this.getChainClient();
    const decimals = await client.getDecimals(tokenConfig.contractAddress);
    const amount = client.parseUnits(intent.amount, decimals);
    const treasuryAddress = this.FIXED_TREASURY_ADDRESS;

    let txHash: string | null = null;
    let finalizedStatusWritten = false;
    
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
          treasuryAddress,
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
          if (this.walletRepo) {
            await this.walletRepo.saveTxIntent(
              this.walletManager.processTxIntent(intent, "reverted", txHash, "Transaction reverted")
            );
            finalizedStatusWritten = true;
          }
          throw new Error(`Bet transaction reverted: ${tx.hash}`);
        }

        if (this.walletRepo) {
          await this.walletRepo.saveTxIntent(this.walletManager.processTxIntent(intent, "confirmed", txHash));
          finalizedStatusWritten = true;
        }

        return tx.hash;
        
      } else {
        // Payout: Transfer from treasury to player using adminTransfer
        const payoutTreasuryAddress = await this.ensureTreasuryLiquidity(tokenConfig, amount, decimals);
        const tx = await client.adminTransfer(
          payoutTreasuryAddress,
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
          if (this.walletRepo) {
            await this.walletRepo.saveTxIntent(
              this.walletManager.processTxIntent(intent, "reverted", txHash, "Transaction reverted")
            );
            finalizedStatusWritten = true;
          }
          throw new Error(`Payout transaction reverted: ${tx.hash}`);
        }

        if (this.walletRepo) {
          await this.walletRepo.saveTxIntent(this.walletManager.processTxIntent(intent, "confirmed", txHash));
          finalizedStatusWritten = true;
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

      if (this.walletRepo && !finalizedStatusWritten) {
        await this.walletRepo.saveTxIntent(
          this.walletManager.processTxIntent(
            intent,
            "failed",
            txHash || undefined,
            error?.message || `${type} failed`
          )
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
